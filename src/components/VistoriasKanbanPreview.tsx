import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClipboardCheck, Building2, AlertTriangle, CheckCircle2, Wrench, Clock, ChevronRight, Building } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CreateMaintenanceFromInspectionDialog } from './CreateMaintenanceFromInspectionDialog';

interface Property {
  id: string;
  name: string;
  cover_photo_url?: string;
  owner_id: string;
}

interface Attachment {
  id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
}

interface Inspection {
  id: string;
  property_id: string;
  notes: string;
  created_at: string;
  transcript_summary?: string;
  property?: Property;
  attachments?: Attachment[];
}

export function VistoriasKanbanPreview() {
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);

  useEffect(() => {
    fetchInspections();
  }, []);

  const fetchInspections = async () => {
    try {
      // Fetch recent inspections (last 20)
      const { data, error } = await supabase
        .from('cleaning_inspections')
        .select(`
          id,
          property_id,
          notes,
          created_at,
          transcript_summary,
          property:properties(id, name, cover_photo_url, owner_id)
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Get attachments for all inspections
      const inspectionIds = (data || []).map(i => i.id);
      const attachmentsMap = new Map<string, Attachment[]>();

      if (inspectionIds.length > 0) {
        const { data: attachmentsData } = await supabase
          .from('cleaning_inspection_attachments')
          .select('id, file_url, file_name, file_type, inspection_id')
          .in('inspection_id', inspectionIds);

        (attachmentsData || []).forEach(att => {
          const existing = attachmentsMap.get(att.inspection_id) || [];
          existing.push({
            id: att.id,
            file_url: att.file_url,
            file_name: att.file_name || undefined,
            file_type: att.file_type || undefined,
          });
          attachmentsMap.set(att.inspection_id, existing);
        });
      }

      const inspectionsWithAttachments = (data || []).map(insp => ({
        ...insp,
        property: insp.property as unknown as Property,
        attachments: attachmentsMap.get(insp.id) || [],
      }));

      setInspections(inspectionsWithAttachments);
    } catch (error) {
      console.error('Error fetching inspections:', error);
    } finally {
      setLoading(false);
    }
  };

  const okInspections = inspections.filter(i => i.notes === 'OK').slice(0, 3);
  const problemInspections = inspections.filter(i => i.notes === 'NÃO').slice(0, 3);

  const handleNewMaintenance = (inspection: Inspection) => {
    setSelectedInspection(inspection);
    setMaintenanceDialogOpen(true);
  };

  const renderInspectionCard = (inspection: Inspection, hasProblem: boolean) => {
    const property = inspection.property;
    
    return (
      <div
        key={inspection.id}
        className="p-3 rounded-xl border bg-card hover:bg-accent/50 transition-colors w-full overflow-hidden"
      >
        {/* Property thumbnail + Content */}
        <div className="flex gap-3 min-w-0">
          {/* Property photo thumbnail - clickable */}
          <div 
            className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              if (property?.id) navigate(`/admin/vistorias/${property.id}`);
            }}
          >
            {property?.cover_photo_url ? (
              <img 
                src={property.cover_photo_url} 
                alt={property.name || "Imóvel"} 
                className="w-12 h-12 object-cover"
              />
            ) : (
              <div className="w-12 h-12 flex items-center justify-center">
                <Building className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </div>
          
          {/* Text content */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Property name - clickable */}
            <p 
              className="text-sm font-semibold truncate cursor-pointer hover:text-primary hover:underline transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                if (property?.id) navigate(`/admin/vistorias/${property.id}`);
              }}
            >
              {property?.name || 'Imóvel'}
            </p>
            
            {/* Time */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <Clock className="h-3.5 w-3.5" />
              {format(new Date(inspection.created_at), "dd/MM HH:mm", { locale: ptBR })}
            </div>
          </div>
        </div>

        {/* Actions - stacked vertically */}
        <div className="flex flex-col gap-2 mt-3">
          {hasProblem && (
            <Button
              variant="outline"
              size="default"
              className="w-full h-10 text-sm font-medium text-orange-600 border-orange-300"
              onClick={(e) => {
                e.stopPropagation();
                handleNewMaintenance(inspection);
              }}
            >
              <Wrench className="h-4 w-4 mr-2" />
              Criar Manutenção
            </Button>
          )}
          <Button
            variant="outline"
            size="default"
            className="w-full h-10 text-sm font-medium"
            onClick={() => navigate(`/admin/vistoria/${inspection.id}`)}
          >
            <ChevronRight className="h-4 w-4 mr-2" />
            Ver detalhes
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Vistorias
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="animate-pulse space-y-2">
            <div className="h-12 bg-muted rounded" />
            <div className="h-12 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Vistorias
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-sm"
              onClick={() => navigate('/admin/vistorias')}
            >
              Ver todas
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 overflow-hidden">
          <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-2 w-full max-w-full">
            {/* Problemas Column */}
            <div className="space-y-2 min-w-0 overflow-hidden w-full rounded-xl bg-red-50 dark:bg-red-950/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-bold text-destructive">Problemas</span>
                <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                  {problemInspections.length}
                </Badge>
              </div>
              <ScrollArea className="h-[180px] sm:h-[140px]">
                <div className="space-y-2 pr-2">
                  {problemInspections.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhum problema
                    </p>
                  ) : (
                    problemInspections.map(insp => renderInspectionCard(insp, true))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* OK Column */}
            <div className="space-y-2 min-w-0 overflow-hidden w-full rounded-xl bg-green-50 dark:bg-green-950/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-bold text-green-600">OK</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-green-500/20 text-green-700">
                  {okInspections.length}
                </Badge>
              </div>
              <ScrollArea className="h-[180px] sm:h-[140px]">
                <div className="space-y-2 pr-2">
                  {okInspections.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhuma vistoria OK
                    </p>
                  ) : (
                    okInspections.map(insp => renderInspectionCard(insp, false))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Dialog */}
      {selectedInspection && selectedInspection.property && (
        <CreateMaintenanceFromInspectionDialog
          open={maintenanceDialogOpen}
          onOpenChange={setMaintenanceDialogOpen}
          propertyId={selectedInspection.property.id}
          propertyName={selectedInspection.property.name}
          ownerId={selectedInspection.property.owner_id}
          inspectionId={selectedInspection.id}
          attachments={selectedInspection.attachments || []}
          transcriptSummary={selectedInspection.transcript_summary}
        />
      )}
    </>
  );
}
