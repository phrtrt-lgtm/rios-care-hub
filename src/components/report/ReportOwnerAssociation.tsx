import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, CheckCircle2, AlertCircle, Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ReportData } from '@/lib/report-types';
import { toast } from 'sonner';

interface PropertyOwnerMap {
  propertyName: string;
  propertyId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
}

interface DBProperty {
  id: string;
  name: string;
  owner_id: string;
  owner: { id: string; name: string; email: string } | null;
}

interface ReportOwnerAssociationProps {
  reports: { propertyName: string; reportData: ReportData }[];
  onBack: () => void;
  onPublished: () => void;
}

export function ReportOwnerAssociation({ reports, onBack, onPublished }: ReportOwnerAssociationProps) {
  const [properties, setProperties] = useState<DBProperty[]>([]);
  const [associations, setAssociations] = useState<PropertyOwnerMap[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('id, name, owner_id, owner:profiles!properties_owner_id_fkey(id, name, email)')
      .order('name');

    if (error) {
      toast.error('Erro ao carregar imóveis');
      setIsLoading(false);
      return;
    }

    const dbProps = (data || []).map(p => ({
      ...p,
      owner: Array.isArray(p.owner) ? p.owner[0] : p.owner,
    })) as DBProperty[];

    setProperties(dbProps);

    // Auto-match by name
    const mapped = reports.map(r => {
      const match = dbProps.find(p =>
        p.name.toLowerCase().trim() === r.propertyName.toLowerCase().trim()
      );
      return {
        propertyName: r.propertyName,
        propertyId: match?.id || null,
        ownerId: match?.owner?.id || null,
        ownerName: match?.owner?.name || null,
        ownerEmail: match?.owner?.email || null,
      };
    });

    setAssociations(mapped);
    setIsLoading(false);
  };

  const handlePropertyChange = (index: number, propertyId: string) => {
    const prop = properties.find(p => p.id === propertyId);
    setAssociations(prev => prev.map((a, i) =>
      i === index ? {
        ...a,
        propertyId: prop?.id || null,
        ownerId: prop?.owner?.id || null,
        ownerName: prop?.owner?.name || null,
        ownerEmail: prop?.owner?.email || null,
      } : a
    ));
  };

  const allMapped = associations.every(a => a.propertyId && a.ownerId);
  const mappedCount = associations.filter(a => a.propertyId && a.ownerId).length;

  const handlePublish = async () => {
    if (!allMapped) {
      toast.error('Associe todos os imóveis antes de enviar');
      return;
    }

    setIsPublishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      for (let i = 0; i < reports.length; i++) {
        const report = reports[i];
        const assoc = associations[i];
        const rd = report.reportData;

        const periodStart = rd.reservations.length > 0
          ? new Date(Math.min(...rd.reservations.map(r => new Date(r.checkin_date).getTime()))).toISOString().slice(0, 10)
          : null;
        const periodEnd = rd.reservations.length > 0
          ? new Date(Math.max(...rd.reservations.map(r => new Date(r.checkout_date).getTime()))).toISOString().slice(0, 10)
          : null;

        // Save to DB
        const { error: insertError } = await supabase
          .from('financial_reports')
          .insert({
            property_id: assoc.propertyId,
            owner_id: assoc.ownerId!,
            property_name: assoc.propertyName,
            report_type: rd.config.reportType,
            report_data: rd as any,
            period_start: periodStart,
            period_end: periodEnd,
            commission_percentage: rd.config.commissionPercentage,
            status: 'published',
            created_by: user?.id,
          });

        if (insertError) {
          console.error('Insert error:', insertError);
          toast.error(`Erro ao salvar relatório de ${assoc.propertyName}`);
          continue;
        }

        // Send email notification
        try {
          await supabase.functions.invoke('send-report-email', {
            body: {
              ownerName: assoc.ownerName,
              ownerEmail: assoc.ownerEmail,
              propertyName: assoc.propertyName,
              reportType: rd.config.reportType,
              periodStart,
              periodEnd,
              totalReservations: rd.totals.reservationCount,
              totalValue: rd.totals.totalOwnerNet,
            },
          });
        } catch (emailErr) {
          console.error('Email error (non-critical):', emailErr);
        }
      }

      toast.success(`${reports.length} relatório(s) publicado(s) com sucesso!`);
      onPublished();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao publicar relatórios');
    } finally {
      setIsPublishing(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" />
            Associar Proprietários
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Confirme ou altere a associação de cada relatório ao proprietário correto antes de enviar.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={allMapped ? 'default' : 'secondary'}>
              {mappedCount}/{associations.length} associados
            </Badge>
          </div>

          {associations.map((assoc, index) => (
            <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-lg border bg-card">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{assoc.propertyName}</p>
                <p className="text-xs text-muted-foreground">
                  {reports[index].reportData.totals.reservationCount} reservas
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {assoc.propertyId && assoc.ownerId ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                )}

                <Select
                  value={assoc.propertyId || ''}
                  onValueChange={(v) => handlePropertyChange(index, v)}
                >
                  <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue placeholder="Selecione o imóvel..." />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span>{p.name}</span>
                        {p.owner && (
                          <span className="text-muted-foreground ml-1">
                            — {p.owner.name}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {assoc.ownerName && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">{assoc.ownerName}</span>
                  <br />
                  <span>{assoc.ownerEmail}</span>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>Voltar</Button>
        <Button
          onClick={handlePublish}
          disabled={!allMapped || isPublishing}
          className="flex-1"
        >
          {isPublishing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Publicando...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Publicar e Notificar ({mappedCount})
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
