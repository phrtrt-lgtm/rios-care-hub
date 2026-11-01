import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { ResumoManutencao, ResumoManutencaoCarregando } from "@/components/maintenance/ResumoManutencao";
import { useMaintenance } from "@/hooks/useMaintenances";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

interface MaintenanceDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maintenanceId: string | null;
}

/**
 * Popup de acompanhamento de uma manutenção (proprietário; a equipe abre o
 * mesmo para conferir o que ele vê). Até 2026-11-01 embutia a página
 * /manutencao/:id inteira numa folha longa; agora mostra o `ResumoManutencao`
 * (CLAUDE.md §3.11) com o rodapé "Conversar com a equipe" (abre o chat da
 * manutenção) e "Página completa" (a página de sempre).
 */
export function MaintenanceDetailsDialog({ open, onOpenChange, maintenanceId }: MaintenanceDetailsDialogProps) {
  const navigate = useNavigate();
  const { data: maintenance, isLoading } = useMaintenance(open && maintenanceId ? maintenanceId : undefined);
  const [chatAberto, setChatAberto] = useState(false);

  const ticketId: string | null = maintenance ? (maintenance.source === "ticket" ? maintenance.id : (maintenance.ticket_id ?? null)) : null;
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketId ? [ticketId] : []);
  const naoLidas = ticketId ? unreadCounts[ticketId] || 0 : 0;

  const abrirChat = () => {
    if (!ticketId) return;
    markAsRead(ticketId);
    setChatAberto(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl border-border/70 p-0 sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>Acompanhamento da manutenção</DialogTitle>
            <DialogDescription>Etapas, valores, fotos e atualizações publicadas pela equipe.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading || !maintenanceId ? (
              <ResumoManutencaoCarregando />
            ) : !maintenance ? (
              <div className="p-4">
                <EmptyState ilustracao="manutencoes" title="Manutenção não encontrada" description="Ela pode ter sido excluída ou você não tem acesso a ela." />
              </div>
            ) : (
              <ResumoManutencao maintenance={maintenance} onNavegar={() => onOpenChange(false)} />
            )}
          </div>

          {maintenance && (
            <footer className="flex shrink-0 items-center gap-2 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              {ticketId && (
                <Button className="relative h-10 flex-1 gap-2" onClick={abrirChat}>
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Conversar com a equipe
                  {naoLidas > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground ring-2 ring-background">
                      {naoLidas > 9 ? "9+" : naoLidas}
                    </span>
                  )}
                </Button>
              )}
              {/* No celular só o ícone: com o texto, o rodapé estourava em 390 px */}
              <Button
                variant="ghost"
                className="h-10 shrink-0 gap-1.5 text-muted-foreground"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/manutencao/${maintenanceId}`);
                }}
                aria-label="Abrir a página completa da manutenção"
                title="Página completa"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Página completa</span>
              </Button>
            </footer>
          )}
        </DialogContent>
      </Dialog>

      {ticketId && (
        <MaintenanceChatDialog
          open={chatAberto}
          onOpenChange={setChatAberto}
          ticketId={ticketId}
          ticketSubject={maintenance?.title}
          propertyName={maintenance?.property?.name ?? undefined}
        />
      )}
    </>
  );
}
