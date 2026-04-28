import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ExternalLink, Pencil, Loader2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveScrollPosition } from '@/lib/navigation';
import { DetailEntityType } from '@/hooks/useDetailSheet';
import { MaintenanceDetailSheetContent } from './MaintenanceDetailSheetContent';
import { VistoriaDetailSheetContent } from './VistoriaDetailSheetContent';
import { CobrancaDetailSheetContent } from './CobrancaDetailSheetContent';
import { useAuth } from '@/hooks/useAuth';
import { EditMaintenanceDialog } from '@/components/EditMaintenanceDialog';
import EditInspectionDialog from '@/components/EditInspectionDialog';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DetailSheetProps {
  open: boolean;
  onClose: () => void;
  entityId: string | null;
  entityType: DetailEntityType | null;
}

function getEntityRoute(entityType: DetailEntityType, id: string): string {
  if (entityType === 'maintenance') return `/manutencao/${id}`;
  if (entityType === 'vistoria') return `/admin/vistoria/${id}`;
  if (entityType === 'cobranca') return `/cobranca/${id}`;
  return '/';
}

function getEntityTitle(entityType: DetailEntityType): string {
  if (entityType === 'maintenance') return 'Manutenção';
  if (entityType === 'vistoria') return 'Vistoria';
  if (entityType === 'cobranca') return 'Cobrança';
  return '';
}

export function DetailSheet({ open, onClose, entityId, entityType }: DetailSheetProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [loadingInspection, setLoadingInspection] = useState(false);
  const [inspectionForEdit, setInspectionForEdit] = useState<any>(null);

  const isTeam =
    profile?.role === 'admin' ||
    profile?.role === 'agent' ||
    profile?.role === 'maintenance';

  if (!entityId || !entityType) return null;

  const fullRoute = getEntityRoute(entityType, entityId);
  const goToFullPage = () => {
    saveScrollPosition(pathname);
    onClose();
    navigate(fullRoute, { state: { from: pathname } });
  };

  const handleEdit = async () => {
    if (entityType === 'vistoria') {
      // load inspection + attachments before opening edit dialog
      setLoadingInspection(true);
      try {
        const { data: insp, error } = await supabase
          .from('cleaning_inspections')
          .select('id, property_id, notes, transcript, transcript_summary, audio_url, is_routine, internal_only')
          .eq('id', entityId)
          .single();
        if (error) throw error;

        const { data: attachments } = await supabase
          .from('cleaning_inspection_attachments')
          .select('id, file_url, file_name, file_type')
          .eq('inspection_id', entityId);

        let routineChecklist = null;
        if (insp.is_routine) {
          const { data: checklist } = await supabase
            .from('routine_inspection_checklists')
            .select('*')
            .eq('inspection_id', entityId)
            .maybeSingle();
          routineChecklist = checklist;
        }

        setInspectionForEdit({
          inspection: insp,
          attachments: attachments || [],
          routineChecklist,
        });
        setEditOpen(true);
      } catch (e: any) {
        toast.error('Erro ao carregar vistoria: ' + e.message);
      } finally {
        setLoadingInspection(false);
      }
    } else {
      setEditOpen(true);
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['maintenance-list'] });
    queryClient.invalidateQueries({ queryKey: ['maintenances'] });
    queryClient.invalidateQueries({ queryKey: ['charges-list'] });
    queryClient.invalidateQueries({ queryKey: ['inspections-for-list'] });
    queryClient.invalidateQueries({ queryKey: ['detail-sheet', entityType, entityId] });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 flex flex-col gap-0"
        >
          {/* Header fixo */}
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b shrink-0">
            <h2 className="text-base font-semibold truncate">
              {getEntityTitle(entityType)}
            </h2>
            <div className="flex items-center gap-1.5 pr-7">
              {isTeam && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleEdit}
                  disabled={loadingInspection}
                  data-no-sheet
                >
                  {loadingInspection ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Editar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 hidden sm:flex"
                onClick={goToFullPage}
                data-no-sheet
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Ver completo
              </Button>
            </div>
          </div>

          {/* Conteúdo rolável */}
          <div className="flex-1 overflow-y-auto p-5">
            {entityType === 'maintenance' && (
              <MaintenanceDetailSheetContent id={entityId} onOpenFull={goToFullPage} />
            )}
            {entityType === 'vistoria' && (
              <VistoriaDetailSheetContent id={entityId} onOpenFull={goToFullPage} />
            )}
            {entityType === 'cobranca' && (
              <CobrancaDetailSheetContent id={entityId} onOpenFull={goToFullPage} />
            )}
          </div>

          {/* Footer mobile */}
          <div className="border-t p-3 sm:hidden shrink-0">
            <Button onClick={goToFullPage} className="w-full" data-no-sheet>
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir página completa
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit dialogs */}
      {isTeam && entityType === 'maintenance' && (
        <EditMaintenanceDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          editId={entityId}
          type="maintenance"
          onSaved={invalidateAll}
        />
      )}
      {isTeam && entityType === 'cobranca' && (
        <EditMaintenanceDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          editId={entityId}
          type="charge"
          onSaved={invalidateAll}
        />
      )}
      {isTeam && entityType === 'vistoria' && inspectionForEdit && (
        <EditInspectionDialog
          open={editOpen}
          onOpenChange={(v) => {
            setEditOpen(v);
            if (!v) setInspectionForEdit(null);
          }}
          inspection={inspectionForEdit.inspection}
          existingAttachments={inspectionForEdit.attachments}
          routineChecklist={inspectionForEdit.routineChecklist}
          onSuccess={invalidateAll}
        />
      )}
    </>
  );
}
