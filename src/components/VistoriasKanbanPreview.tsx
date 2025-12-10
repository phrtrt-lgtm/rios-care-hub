import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClipboardCheck, Building2, AlertTriangle, CheckCircle2, Wrench, Clock, ChevronRight, Image } from 'lucide-react';
import { AuthenticatedImage, VideoThumbnail } from './AuthenticatedMedia';
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
    const firstAttachment = inspection.attachments?.[0];
    
    return (
      <div
        key={inspection.id}
        className="p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors w-full"
      >
        {/* Thumbnail + Content */}
        <div className="flex gap-2">
          {/* Thumbnail */}
          {firstAttachment && (
            <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-muted">
              {firstAttachment.file_type?.startsWith("video/") ? (
                <VideoThumbnail 
                  src={firstAttachment.file_url} 
                  className="w-10 h-10 object-cover"
                />
              ) : (
                <AuthenticatedImage 
                  src={firstAttachment.file_url} 
                  alt="Anexo" 
                  className="w-10 h-10 object-cover"
                />
              )}
            </div>
          )}
          
          {/* Text content */}
          <div className="flex-1 min-w-0">
            {/* Property name */}
            <p className="text-xs font-medium truncate">{property?.name || 'Imóvel'}</p>
            
            {/* Time */}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3" />
              {format(new Date(inspection.created_at), "dd/MM HH:mm", { locale: ptBR })}
            </div>
          </div>
        </div>

        {/* Actions - stacked vertically to prevent overflow */}
        <div className="flex flex-col gap-1 mt-2">
          {hasProblem && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs text-orange-600 border-orange-300"
              onClick={(e) => {
                e.stopPropagation();
                handleNewMaintenance(inspection);
              }}
            >
              <Wrench className="h-3.5 w-3.5 mr-1" />
              Manutenção
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => navigate(`/admin/vistorias/${inspection.id}`)}
          >
            <ChevronRight className="h-4 w-4 mr-1" />
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
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Vistorias
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => navigate('/admin/vistorias')}
            >
              Ver todas
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 pt-0 overflow-hidden">
          <div className="grid grid-cols-2 gap-2 w-full max-w-full">
            {/* Problemas Column */}
            <div className="space-y-1 min-w-0 overflow-hidden w-full">
              <div className="flex items-center gap-1 px-1 mb-1">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                <span className="text-[10px] font-medium text-destructive">Problemas</span>
                <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                  {problemInspections.length}
                </Badge>
              </div>
              <ScrollArea className="h-[140px]">
                <div className="space-y-1 pr-2">
                  {problemInspections.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-4">
                      Nenhum problema
                    </p>
                  ) : (
                    problemInspections.map(insp => renderInspectionCard(insp, true))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* OK Column */}
            <div className="space-y-1 min-w-0 overflow-hidden w-full">
              <div className="flex items-center gap-1 px-1 mb-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                <span className="text-[10px] font-medium text-green-600">OK</span>
                <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-green-500/20 text-green-700">
                  {okInspections.length}
                </Badge>
              </div>
              <ScrollArea className="h-[140px]">
                <div className="space-y-1 pr-2">
                  {okInspections.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-4">
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
