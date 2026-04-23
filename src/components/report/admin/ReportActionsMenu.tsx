import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  Eye,
  Download,
  Pencil,
  RefreshCw,
  Send,
  Archive,
  Trash2,
  ArchiveRestore,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EditReportDialog } from "./EditReportDialog";
import { ArchiveReportDialog } from "./ArchiveReportDialog";
import { DeleteReportDialog } from "./DeleteReportDialog";
import { RegenerateReportDialog } from "./RegenerateReportDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ReportLite {
  id: string;
  property_name: string;
  owner_id: string;
  report_type: string;
  commission_percentage: number;
  internal_notes: string | null;
  status: string;
  period_start: string | null;
  period_end: string | null;
  report_data: any;
}

interface ReportActionsMenuProps {
  report: ReportLite;
  onChanged: () => void;
  onDownload?: (report: ReportLite) => void;
}

export function ReportActionsMenu({
  report,
  onChanged,
  onDownload,
}: ReportActionsMenuProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const isArchived = report.status === "archived";

  const handleResend = async () => {
    console.log("[ReportActionsMenu] Reenviar relatório:", report.id);
    toast.success("Notificação registrada", {
      description: "O proprietário será notificado sobre este relatório.",
    });
  };

  const handleRestore = async () => {
    setRestoreLoading(true);
    try {
      const { error } = await supabase
        .from("financial_reports")
        .update({
          status: "published",
          archived_at: null,
          archived_by: null,
          archive_reason: null,
        })
        .eq("id", report.id);
      if (error) throw error;

      await supabase.from("financial_report_audit_log").insert({
        report_id: report.id,
        action: "restored",
        actor_id: profile?.id,
        actor_name: profile?.name,
        actor_role: profile?.role,
      });

      toast.success("Relatório restaurado");
      setRestoreOpen(false);
      onChanged();
    } catch (err: any) {
      toast.error("Erro ao restaurar", { description: err.message });
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => e.stopPropagation()}
            aria-label="Mais ações"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => navigate(`/relatorio-financeiro/${report.id}`)}
          >
            <Eye className="h-4 w-4 mr-2" /> Abrir
          </DropdownMenuItem>
          {onDownload && (
            <DropdownMenuItem onClick={() => onDownload(report)}>
              <Download className="h-4 w-4 mr-2" /> Baixar PDF
            </DropdownMenuItem>
          )}

          {isAdmin && !isArchived && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Editar metadados
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRegenerateOpen(true)}>
                <RefreshCw className="h-4 w-4 mr-2" /> Regerar com novos
                parâmetros
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleResend}>
                <Send className="h-4 w-4 mr-2" /> Reenviar para proprietário
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setArchiveOpen(true)}>
                <Archive className="h-4 w-4 mr-2" /> Arquivar
              </DropdownMenuItem>
            </>
          )}

          {isAdmin && isArchived && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setRestoreOpen(true)}>
                <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir permanentemente
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isAdmin && (
        <>
          <EditReportDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            report={{
              id: report.id,
              owner_id: report.owner_id,
              commission_percentage: report.commission_percentage,
              internal_notes: report.internal_notes,
              property_name: report.property_name,
            }}
            onSaved={onChanged}
          />
          <ArchiveReportDialog
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            report={report}
            onArchived={onChanged}
          />
          <DeleteReportDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            report={report}
            onDeleted={onChanged}
          />
          <RegenerateReportDialog
            open={regenerateOpen}
            onOpenChange={setRegenerateOpen}
            report={report}
            onRegenerated={onChanged}
          />
          <ConfirmationDialog
            open={restoreOpen}
            onOpenChange={setRestoreOpen}
            title="Restaurar relatório?"
            description="O relatório voltará a ficar visível para o proprietário."
            confirmLabel="Restaurar"
            loading={restoreLoading}
            onConfirm={handleRestore}
          />
        </>
      )}
    </>
  );
}
