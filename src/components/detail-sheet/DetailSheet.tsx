import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveScrollPosition } from '@/lib/navigation';
import { DetailEntityType } from '@/hooks/useDetailSheet';
import { MaintenanceDetailSheetContent } from './MaintenanceDetailSheetContent';
import { VistoriaDetailSheetContent } from './VistoriaDetailSheetContent';
import { CobrancaDetailSheetContent } from './CobrancaDetailSheetContent';

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

  if (!entityId || !entityType) return null;

  const fullRoute = getEntityRoute(entityType, entityId);
  const goToFullPage = () => {
    saveScrollPosition(pathname);
    onClose();
    navigate(fullRoute);
  };

  return (
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
  );
}
