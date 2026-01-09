import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ClipboardCheck, AlertTriangle, CheckCircle2, Wrench, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { QuickInspectionAttachmentButton } from './QuickInspectionAttachmentButton';
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
  const [isExpanded, setIsExpanded] = useState(false);
  
  const COLLAPSED_PROBLEM_LIMIT = 3;
  const COLLAPSED_OK_LIMIT = 2;
  const EXPANDED_LIMIT = 20;

  useEffect(() => {
    fetchInspections();
  }, []);

  const fetchInspections = async () => {
    try {
      const { data, error } = await supabase
        .from('cleaning_inspections')
        .select(`
          id, property_id, notes, created_at, transcript_summary,
          property:properties(id, name, cover_photo_url, owner_id)
        `)
        .order('created_at', { ascending: false })
        .limit(15);

      if (error) throw error;

      const inspectionIds = (data || []).map(i => i.id);
      const attachmentsMap = new Map<string, Attachment[]>();

      if (inspectionIds.length > 0) {
        const { data: attachmentsData } = await supabase
          .from('cleaning_inspection_attachments')
          .select('id, file_url, file_name, file_type, inspection_id')
          .in('inspection_id', inspectionIds);

        (attachmentsData || []).forEach(att => {
          const existing = attachmentsMap.get(att.inspection_id) || [];
          existing.push({ id: att.id, file_url: att.file_url, file_name: att.file_name || undefined, file_type: att.file_type || undefined });
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

  const okInspections = inspections.filter(i => i.notes === 'OK');
  const problemInspections = inspections.filter(i => i.notes === 'NÃO');

  const handleNewMaintenance = (inspection: Inspection, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedInspection(inspection);
    setMaintenanceDialogOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  const problemLimit = isExpanded ? EXPANDED_LIMIT : COLLAPSED_PROBLEM_LIMIT;
  const okLimit = isExpanded ? EXPANDED_LIMIT : COLLAPSED_OK_LIMIT;
  const hasMoreItems = problemInspections.length > COLLAPSED_PROBLEM_LIMIT || okInspections.length > COLLAPSED_OK_LIMIT;

  return (
    <>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardCheck className="h-4 w-4" />
                <CardTitle className="text-sm">Vistorias</CardTitle>
                {inspections.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {inspections.length}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {hasMoreItems && (
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Recolher
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          Expandir
                        </>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/admin/vistorias')}
                  className="h-7 text-xs"
                >
                  <span className="hidden sm:inline">Ver todas</span>
                  <span className="sm:hidden">Ver</span>
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          {inspections.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma vistoria recente</p>
          ) : (
            <div className="space-y-3">
              {/* Problemas primeiro - sempre visíveis (colapsado) */}
              {problemInspections.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                    <p className="text-xs font-semibold text-red-600">Problemas ({problemInspections.length})</p>
                  </div>
                  <div className="space-y-1">
                    {problemInspections.slice(0, COLLAPSED_PROBLEM_LIMIT).map((inspection) => (
                      <div
                        key={inspection.id}
                        className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 cursor-pointer transition-colors overflow-hidden"
                        onClick={() => navigate(`/admin/vistoria/${inspection.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{inspection.property?.name || 'Imóvel'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(inspection.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <QuickInspectionAttachmentButton 
                            inspectionId={inspection.id} 
                            onSuccess={fetchInspections}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-orange-600 shrink-0 whitespace-nowrap"
                            onClick={(e) => handleNewMaintenance(inspection, e)}
                          >
                            <Wrench className="h-3 w-3" />
                            <span className="hidden sm:inline ml-1">Manutenção</span>
                          </Button>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </div>
                      </div>
                    ))}
                    
                    {/* Itens expandidos de problemas */}
                    <CollapsibleContent className="space-y-1">
                      {problemInspections.slice(COLLAPSED_PROBLEM_LIMIT, EXPANDED_LIMIT).map((inspection) => (
                        <div
                          key={inspection.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 cursor-pointer transition-colors overflow-hidden"
                          onClick={() => navigate(`/admin/vistoria/${inspection.id}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{inspection.property?.name || 'Imóvel'}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(inspection.created_at), "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <QuickInspectionAttachmentButton 
                              inspectionId={inspection.id} 
                              onSuccess={fetchInspections}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-orange-600 shrink-0 whitespace-nowrap"
                              onClick={(e) => handleNewMaintenance(inspection, e)}
                            >
                              <Wrench className="h-3 w-3" />
                              <span className="hidden sm:inline ml-1">Manutenção</span>
                            </Button>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          </div>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </div>
                </div>
              )}

              {/* OK - sempre visíveis (colapsado) */}
              {okInspections.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    <p className="text-xs font-semibold text-green-600">OK ({okInspections.length})</p>
                  </div>
                  <div className="space-y-1">
                    {okInspections.slice(0, COLLAPSED_OK_LIMIT).map((inspection) => (
                      <div
                        key={inspection.id}
                        className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors overflow-hidden"
                        onClick={() => navigate(`/admin/vistoria/${inspection.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{inspection.property?.name || 'Imóvel'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(inspection.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <QuickInspectionAttachmentButton 
                            inspectionId={inspection.id} 
                            onSuccess={fetchInspections}
                          />
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </div>
                      </div>
                    ))}
                    
                    {/* Itens expandidos de OK */}
                    <CollapsibleContent className="space-y-1">
                      {okInspections.slice(COLLAPSED_OK_LIMIT, EXPANDED_LIMIT).map((inspection) => (
                        <div
                          key={inspection.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors overflow-hidden"
                          onClick={() => navigate(`/admin/vistoria/${inspection.id}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{inspection.property?.name || 'Imóvel'}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(inspection.created_at), "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <QuickInspectionAttachmentButton 
                              inspectionId={inspection.id} 
                              onSuccess={fetchInspections}
                            />
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          </div>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
        </Card>
      </Collapsible>

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
