import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Plus, MessageSquare, Archive, Loader2, Wrench, BarChart3, Check, X, Kanban, MoreHorizontal, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { MediaGallery } from "@/components/MediaGallery";
import { deleteAttachmentRow } from "@/lib/deleteAttachment";
import { uploadFileWithCompression, emParaleloOuFalha } from "@/lib/fileUpload";
import { CreateMaintenanceFromInspectionDialog } from "@/components/CreateMaintenanceFromInspectionDialog";
import EditInspectionDialog from "@/components/EditInspectionDialog";
import { EditMaintenanceDialog } from "@/components/EditMaintenanceDialog";
import { ReserveDebitsTable } from "@/components/ReserveDebitsTable";
import { AlarmClock, Download, Send } from "lucide-react";
import { baixarAnexosEmZip, resumoDownloadAnexos } from "@/lib/baixarAnexos";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import { DetailSheet } from "@/components/detail-sheet/DetailSheet";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { parseBRNumber } from "@/lib/parseBRNumber";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileMaintenanceList } from "@/components/maintenance/MobileMaintenanceList";
import { boardChange, deriveBoard, type Board } from "@/lib/maintenanceBoard";
import { estaVencida } from "@/lib/vencimento";
import { LembreteAtrasoConfig } from "@/components/maintenance/LembreteAtrasoConfig";
import type { DonoWhatsapp } from "@/components/maintenance/WhatsappAcaoLinha";
import { enviarLembreteAtraso, temWhatsapp } from "@/lib/lembreteAtraso";
import { AbaPilula, BarraFiltros, CabecalhoPagina } from "@/components/painel/PaginaInterna";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  GROUPS,
  INTERVALO_ENVIO_LOTE_MS,
  type GrupoId,
  type InspectionItem,
  type ListStatus,
  type MaintenanceItem,
  type SortDirection,
  type SortField,
  type TicketStatus,
} from "@/components/maintenance/listaTipos";
import { SortableHeader } from "@/components/maintenance/EditableCell";
import { GroupRow } from "@/components/maintenance/GroupRow";
import { EnvioLoteDialog, LembreteLoteDialog } from "@/components/maintenance/LoteDialogs";
import { VistoriasTable } from "@/components/maintenance/VistoriasTable";
import { DebateDialog } from "@/components/maintenance/DebateDialog";
import { buscarCobrancaJaLancada } from "@/lib/cobrancaDuplicada";

// ===== PREFERÊNCIAS LEMBRADAS =====
type AbaLista = "manutencoes" | "vistorias" | "debitos";
const CHAVE_GRUPOS = "manutencoes-lista:grupos";
const CHAVE_ABA = "manutencoes-lista:aba";

function lerGuardado<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return padrao;
    const lido = JSON.parse(bruto);
    return typeof padrao === "object" && padrao !== null ? { ...(padrao as object), ...lido } : lido;
  } catch {
    return padrao;
  }
}

function guardar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* modo privado ou cota cheia: segue sem lembrar */
  }
}

// ===== MAIN COMPONENT =====
export default function AdminManutencoesLista() {
  useScrollRestoration();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const { open: detailSheetOpen, entityId: detailEntityId, entityType: detailEntityType, openSheet, closeSheet } = useDetailSheet();
  const [search, setSearch] = useState("");
  // Grupos abertos ficam lembrados entre visitas; por padrão, Em progresso e
  // Aguardando envio abertos (é onde o trabalho do dia acontece).
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    lerGuardado(CHAVE_GRUPOS, {
      em_progresso: true,
      infiltracao: false,
      stand_by: false,
      em_debate: true,
      concluidas: true,
      cobrancas_vencidas: false,
      cobrancas: false,
    }),
  );
  useEffect(() => guardar(CHAVE_GRUPOS, expandedGroups), [expandedGroups]);
  const [abaAtiva, setAbaAtiva] = useState<AbaLista>(() => lerGuardado(CHAVE_ABA, "manutencoes"));
  useEffect(() => guardar(CHAVE_ABA, abaAtiva), [abaAtiva]);
  const [filtroQuadro, setFiltroQuadro] = useState<GrupoId | "todos">("todos");
  const [filtroImovel, setFiltroImovel] = useState<string>("todos");

  // Vistorias state
  const [vistoriasFaxineirasExpanded, setVistoriasFaxineirasExpanded] = useState(false);
  const [vistoriasEquipeExpanded, setVistoriasEquipeExpanded] = useState(false);
  const [generatingSummaryIds, setGeneratingSummaryIds] = useState<Set<string>>(new Set());
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<InspectionItem | null>(null);
  const [editInspectionDialogOpen, setEditInspectionDialogOpen] = useState(false);
  const [inspectionToEdit, setInspectionToEdit] = useState<InspectionItem | null>(null);
  const [editMaintenanceDialog, setEditMaintenanceDialog] = useState<{ open: boolean; id: string | null; type: "maintenance" | "charge" }>({ open: false, id: null, type: "maintenance" });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item: MaintenanceItem | null; isCharge: boolean }>({ open: false, item: null, isCharge: false });
  const [deleting, setDeleting] = useState(false);
  
  // Inspection selection state
  const [selectedInspectionIds, setSelectedInspectionIds] = useState<Set<string>>(new Set());
  const [lastSelectedInspectionId, setLastSelectedInspectionId] = useState<string | null>(null);
  const [archivingInspections, setArchivingInspections] = useState(false);

  // Chat dialog state
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MaintenanceItem | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sorting state
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Gallery state
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [baixandoAnexos, setBaixandoAnexos] = useState<Set<string>>(new Set());
  const [galleryItems, setGalleryItems] = useState<Array<{ id: string; file_url: string; file_name?: string | null; file_type?: string | null }>>([]);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const [galleryAttachmentTable, setGalleryAttachmentTable] = useState<"ticket_attachments" | "charge_attachments" | "cleaning_inspection_attachments" | null>(null);

  // Upload state
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadItem, setPendingUploadItem] = useState<MaintenanceItem | null>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Inline add state
  const [inlineAdd, setInlineAdd] = useState<{
    groupId: string;
    subject: string;
    propertyId: string;
    amountCents: string;
  } | null>(null);
  const [inlineLoading, setInlineLoading] = useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // Properties for inline form
  const { data: propertiesList } = useQuery({
    queryKey: ["properties-inline-add"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, owner_id")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const handleStartInlineAdd = useCallback((groupId: string) => {
    setInlineAdd({ groupId, subject: "", propertyId: "", amountCents: "" });
    setExpandedGroups((prev) => ({ ...prev, [groupId]: true }));
  }, []);

  const handleInlineCancel = useCallback(() => {
    setInlineAdd(null);
  }, []);

  const handleInlineSave = useCallback(async () => {
    if (!inlineAdd || !inlineAdd.subject.trim() || inlineLoading) return;
    if (!inlineAdd.propertyId) {
      toast.error("Selecione um imóvel");
      return;
    }

    setInlineLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Não autenticado");

      const prop = propertiesList?.find((p) => p.id === inlineAdd.propertyId);
      const ownerId = prop?.owner_id;
      if (!ownerId) throw new Error("Imóvel sem proprietário associado");

      const isTicketGroup = ["em_progresso", "infiltracao", "stand_by", "concluidas"].includes(inlineAdd.groupId);

      if (isTicketGroup) {
        const { error } = await supabase.from("tickets").insert({
          subject: inlineAdd.subject.trim(),
          description: inlineAdd.subject.trim(),
          property_id: inlineAdd.propertyId,
          owner_id: ownerId,
          created_by: authUser.id,
          ticket_type: "manutencao",
          kind: "maintenance",
          status: inlineAdd.groupId === "concluidas" ? "concluido" : "novo",
          // Created in "Em espera" — hidden from owner, no notifications until
          // the team picks a real cost_responsible from the list.
          cost_responsible: "pending",
          // Criado direto no quadro certo.
          on_hold: inlineAdd.groupId === "stand_by",
          charge_draft_category: inlineAdd.groupId === "infiltracao" ? "infiltracao" : null,
        });
        if (error) throw error;
      } else {
        const amountCents = Math.round(parseBRNumber(inlineAdd.amountCents) * 100);

        const { error } = await supabase.from("charges").insert({
          title: inlineAdd.subject.trim(),
          property_id: inlineAdd.propertyId,
          owner_id: ownerId,
          amount_cents: amountCents,
          management_contribution_cents: 0,
          status: "pendente",
          currency: "BRL",
        });
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view", "v2-draft-fallback"] });
      queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });

      setInlineAdd(null);
      toast.success("Item adicionado");
    } catch (err: any) {
      console.error("Inline add error:", err);
      toast.error(err.message || "Erro ao adicionar item");
    } finally {
      setInlineLoading(false);
    }
  }, [inlineAdd, inlineLoading, propertiesList, queryClient]);

  const handleInlineKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInlineSave();
    } else if (e.key === "Escape") {
      handleInlineCancel();
    }
  }, [handleInlineSave, handleInlineCancel]);


  // Fetch vistorias (inspections)
  const { data: inspections } = useQuery({
    queryKey: ["inspections-for-list"],
    queryFn: async () => {
      // First fetch team member names to identify team inspections
      const { data: teamMembers } = await supabase
        .from("profiles")
        .select("name")
        .in("role", ["admin", "agent", "maintenance"]);
      
      const teamNames = new Set((teamMembers || []).map(t => t.name.toLowerCase()));

      const { data, error } = await supabase
        .from("cleaning_inspections")
        .select(`
          id,
          created_at,
          cleaner_name,
          notes,
          transcript,
          transcript_summary,
          audio_url,
          internal_only,
          is_routine,
          property:properties!cleaning_inspections_property_id_fkey(id, name, owner_id)
        `)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch attachments for each inspection
      const inspectionIds = (data || []).map(i => i.id);
      const { data: attachments } = await supabase
        .from("cleaning_inspection_attachments")
        .select("id, inspection_id, file_url, file_name, file_type, maintenance_ticket_id")
        .in("inspection_id", inspectionIds);

      // Fetch owner names
      const ownerIds = [...new Set((data || []).map(i => i.property?.owner_id).filter(Boolean))];
      const { data: owners } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", ownerIds);

      const ownerMap: Record<string, string> = {};
      (owners || []).forEach(o => {
        ownerMap[o.id] = o.name;
      });

      const attachmentsByInspection: Record<string, typeof attachments> = {};
      (attachments || []).forEach(a => {
        if (!attachmentsByInspection[a.inspection_id]) {
          attachmentsByInspection[a.inspection_id] = [];
        }
        attachmentsByInspection[a.inspection_id].push(a);
      });

      return (data || []).map(i => {
        // Check if cleaner_name matches a team member
        const isTeamInspection = i.internal_only || 
          (i.cleaner_name && teamNames.has(i.cleaner_name.toLowerCase()));
        
        return {
          id: i.id,
          property: i.property,
          owner_name: i.property?.owner_id ? ownerMap[i.property.owner_id] || null : null,
          created_at: i.created_at,
          cleaner_name: i.cleaner_name,
          notes: i.notes,
          transcript: i.transcript,
          transcript_summary: i.transcript_summary,
          audio_url: i.audio_url,
          internal_only: i.internal_only,
          is_routine: !!(i as any).is_routine,
          is_team_inspection: isTeamInspection,
          attachments: (attachmentsByInspection[i.id] || []).map(a => ({
            id: a.id,
            file_url: a.file_url,
            file_name: a.file_name || undefined,
            file_type: a.file_type || undefined,
          })),
        };
      }) as InspectionItem[];
    },
  });

  // Fetch maintenance tickets
  const { data: tickets, isLoading } = useQuery({
    queryKey: ["maintenance-list-view", "v2-draft-fallback"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          status,
          scheduled_at,
          created_at,
          cost_responsible,
          on_hold,
          guest_checkout_date,
          charge_draft_amount_cents,
          charge_draft_management_contribution_cents,
          charge_draft_category,
          charge_draft_title,
          ticket_attachments(count),
          charges(ticket_id, amount_cents, management_contribution_cents, service_type, status, created_at, archived_at, paid_at),
          reais:charges(id),
          ticket_type,
          property:properties(id, name),
          owner:profiles!tickets_owner_id_fkey(id, name, notificar_whatsapp, phone)
        `)
        // Manutenções + as que estão em debate com o proprietário (viraram
        // chamado, mas kind continua "maintenance").
        .or("ticket_type.eq.manutencao,kind.eq.maintenance")
        // `reais` = cobranças de verdade do ticket (nem rascunho nem arquivada).
        // Concluída que já tem cobrança real não entra na lista: o filtro é feito
        // no banco. Antes vinham as 420 manutenções (250 KB) para mostrar ~35.
        .neq("reais.status", "draft")
        .is("reais.archived_at", null)
        .or("status.neq.concluido,reais.is.null")
        .neq("status", "cancelado")
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // A contagem de anexos vem embutida na consulta (ticket_attachments(count)):
      // antes eram baixadas todas as linhas de anexo só para contar.
      // As cobranças de cada ticket também vêm embutidas (índice
      // idx_charges_ticket_id). Antes era uma segunda consulta com os 400+ ids
      // na URL (16 KB) e mais 120 KB de resposta, que segurava a lista inteira
      // no esqueleto: em conexão lenta passou de 30 s.
      const charges = (data || []).flatMap((t) => ((t as any).charges as any[]) || []);

      // Mapa com a cobrança mais recente (para exibir valores na linha)
      const chargeMap: Record<string, any> = {};
      const latestNonDraftChargeMap: Record<string, any> = {};
      // Conjunto de tickets que já tiveram cobrança gerada (qualquer status real, não rascunho/arquivada)
      // Inclui pagas, pendentes, vencidas, contestadas, debitadas — todas saem da lista de "concluídos"
      const ticketsWithRealCharge = new Set<string>();

      (charges || [])
        .slice()
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .forEach((c: any) => {
          if (!c.ticket_id) return;
          if (!chargeMap[c.ticket_id]) chargeMap[c.ticket_id] = c;
          if (c.status !== "draft" && !c.archived_at && !latestNonDraftChargeMap[c.ticket_id]) {
            latestNonDraftChargeMap[c.ticket_id] = c;
          }
          // Qualquer cobrança não-rascunho e não-arquivada já tira o ticket da aba "concluídas"
          if (c.status !== "draft" && !c.archived_at) {
            ticketsWithRealCharge.add(c.ticket_id);
          }
        });

      return (data || [])
        .filter(t => {
          // Se o ticket está concluido E já existe QUALQUER cobrança real (paga, pendente, vencida, etc.),
          // não mostrar aqui — ela aparece nas cobranças (pendentes ou no histórico financeiro)
          if (t.status === "concluido" && ticketsWithRealCharge.has(t.id)) {
            return false;
          }
          return true;
        })
        .map(t => {
          const displayCharge = latestNonDraftChargeMap[t.id] || chargeMap[t.id];

          return {
            ...t,
            attachments_count: (t as any).ticket_attachments?.[0]?.count ?? 0,
            amount_cents:
              displayCharge?.status === "draft"
                ? (displayCharge?.amount_cents ?? (t as any).charge_draft_amount_cents ?? null)
                : (displayCharge?.amount_cents ?? (t as any).charge_draft_amount_cents ?? null),
            management_contribution_cents:
              displayCharge?.status === "draft"
                ? (displayCharge?.management_contribution_cents ?? (t as any).charge_draft_management_contribution_cents ?? null)
                : (displayCharge?.management_contribution_cents ?? (t as any).charge_draft_management_contribution_cents ?? null),
            service_type:
              displayCharge?.status === "draft"
                ? (displayCharge?.service_type || (t as any).charge_draft_category || null)
                : (displayCharge?.service_type || (t as any).charge_draft_category || null),
            list_status: t.status === "concluido" ? "feito" : "em_progresso",
            cost_responsible: (t as any).cost_responsible ?? null,
            on_hold: t.on_hold === true,
          };
        }) as MaintenanceItem[];
    },
  });

  // Fetch pending charges (cobranças pendentes de pagamento)
  const { data: charges } = useQuery({
    queryKey: ["pending-charges-list"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select(`
          id,
          title,
          amount_cents,
          management_contribution_cents,
          service_type,
          category,
          created_at,
          due_date,
          status,
          cost_responsible,
          whatsapp_status,
          whatsapp_enviado_em,
          whatsapp_lembrete_status,
          whatsapp_lembrete_enviado_em,
          whatsapp_lembretes_enviados,
          charge_attachments(count),
          property:properties(id, name),
          owner:profiles!charges_owner_id_fkey(id, name, notificar_whatsapp, phone),
          ticket_id,
          ticket:tickets(guest_checkout_date)
        `)
        .in("status", ["pendente", "pending", "sent", "contested", "overdue", "debit_notice_sent", "under_review"])
        .is("paid_at", null)
        .is("archived_at", null)
        .order("due_date", { ascending: true });

      if (error) throw error;

      return (data || []).map(c => ({
        ...c,
        attachments_count: (c as any).charge_attachments?.[0]?.count ?? 0,
        guest_checkout_date: ((c as any).ticket?.guest_checkout_date as string | null) ?? null,
      }));
    },
  });

  /**
   * Envia uma manutenção ao proprietário: cria (ou reaproveita a aberta) a
   * cobrança como "sent", copia os anexos, conclui o ticket e manda o e-mail.
   * O WhatsApp sai pelo trigger do banco. Usado pelo envio de um item e pelo
   * envio em lote — os dois têm que fazer exatamente a mesma coisa.
   */
  const enviarAoProprietario = async (
    ticket: MaintenanceItem,
  ): Promise<"enviada" | "gratuita" | "sem_valor" | "ja_cobrada"> => {
    if (!ticket.owner) throw new Error("Proprietário não encontrado para este ticket");

    // Buscar cobranças vinculadas que ainda estejam ABERTAS (não pagas).
    // Cobranças já pagas não devem ser reabertas — geramos uma nova.
    const { data: existingCharges, error: chargeQueryError } = await supabase
      .from("charges")
      .select("id, amount_cents, paid_at, status")
      .eq("ticket_id", ticket.id)
      .is("archived_at", null)
      .is("paid_at", null)
      .order("created_at", { ascending: false });

    if (chargeQueryError) throw chargeQueryError;

    let chargeId: string;
    // Já existe cobrança (paga) deste ticket com o mesmo valor: não cria outra.
    const jaLancada =
      existingCharges && existingCharges.length > 0
        ? null
        : await buscarCobrancaJaLancada(ticket.id, ticket.amount_cents || 0);

    if (jaLancada) {
      chargeId = jaLancada.id;
    } else if (existingCharges && existingCharges.length > 0) {
      // Atualizar a cobrança aberta existente para "sent" (envia ao proprietário)
      const openCharge = existingCharges[0];
      const { error: updateError } = await supabase
        .from("charges")
        .update({
          status: "sent",
          amount_cents: ticket.amount_cents || openCharge.amount_cents || 0,
          management_contribution_cents: ticket.management_contribution_cents ?? 0,
          service_type: ticket.service_type || null,
          cost_responsible: ticket.cost_responsible || "owner",
        })
        .eq("id", openCharge.id);
      if (updateError) throw updateError;
      chargeId = openCharge.id;
    } else {
      // Criar nova cobrança já enviada ao proprietário
      const { data: newCharge, error: chargeError } = await supabase
        .from("charges")
        .insert({
          owner_id: ticket.owner.id,
          property_id: ticket.property?.id || null,
          ticket_id: ticket.id,
          title: ticket.subject,
          amount_cents: ticket.amount_cents || 0,
          management_contribution_cents: ticket.management_contribution_cents || 0,
          service_type: ticket.service_type || null,
          cost_responsible: ticket.cost_responsible || "owner",
          status: "sent",
        })
        .select("id")
        .single();
      if (chargeError) throw chargeError;
      chargeId = newCharge.id;
    }

    // Copy ticket attachments to the charge (a cobrança que já existia fica como está)
    const { data: ticketAttachments } = jaLancada
      ? { data: null }
      : await supabase
          .from("ticket_attachments")
          .select("path, file_name, file_type, file_url, mime_type, file_size, size_bytes")
          .eq("ticket_id", ticket.id);

    if (ticketAttachments && ticketAttachments.length > 0) {
      const chargeAttachmentsToInsert = ticketAttachments.map(a => ({
        charge_id: chargeId,
        file_path: a.path,
        file_name: a.file_name || a.path.split("/").pop() || "anexo",
        mime_type: a.mime_type || a.file_type || null,
        file_size: a.file_size || a.size_bytes || null,
      }));
      await supabase.from("charge_attachments").insert(chargeAttachmentsToInsert);
    }

    // Only update ticket to concluido if not already (RLS blocks updates on concluido tickets)
    if (ticket.status !== "concluido") {
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({ status: "concluido" })
        .eq("id", ticket.id);
      if (ticketError) throw ticketError;
    }

    // Nada novo foi criado: o proprietário já recebeu esta cobrança antes.
    if (jaLancada) return "ja_cobrada";

    // Detect if the trigger auto-paid the charge because management covers 100%.
    const fullyCoveredByManagement =
      (ticket.management_contribution_cents ?? 0) >= (ticket.amount_cents ?? 0) &&
      (ticket.amount_cents ?? 0) > 0;

    // Notificar o proprietário (email + push + notificação interna)
    // Pulamos quando o aporte da gestão cobre 100% (não há cobrança a pagar).
    if (!fullyCoveredByManagement) {
      try {
        await supabase.functions.invoke("send-charge-email", {
          body: { type: "charge_created", chargeId },
        });
      } catch (notifyErr) {
        console.warn("Falha ao notificar proprietário (não crítico):", notifyErr);
      }
    }


    if (fullyCoveredByManagement) return "gratuita";
    if ((ticket.amount_cents ?? 0) === 0) return "sem_valor";
    return "enviada";
  };

  const avisarHospedeArquivada = () => {
    queryClient.invalidateQueries({ queryKey: ["painel", "guest-charges"] });
    toast.success("Cobrança de hóspede feita: foi para o Arquivo.", {
      description: 'Continua no aviso do painel até ser marcada como "Cobrada".',
    });
  };

  // Update mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value, isCharge }: { id: string; field: string; value: any; isCharge?: boolean }) => {
      if (isCharge) {
        const { error } = await supabase
          .from("charges")
          .update({ [field]: value })
          .eq("id", id);
        if (error) throw error;
      } else {
        // If updating status to "enviar_proprietario", create/update charge AND close ticket
        if (field === "list_status" && value === "enviar_proprietario") {
          const ticket = tickets?.find(t => t.id === id);
          if (!ticket || !ticket.owner) {
            throw new Error("Proprietário não encontrado para este ticket");
          }
          const resultado = await enviarAoProprietario(ticket);
          if (resultado === "gratuita") {
            toast.success("Manutenção finalizada — aporte da gestão cobriu 100% do custo.");
          } else if (resultado === "ja_cobrada") {
            toast.info("Esta manutenção já tinha cobrança lançada com esse valor. Foi só concluída, sem criar outra.");
          } else if (resultado === "sem_valor") {
            toast.success("Manutenção enviada ao proprietário sem valor de cobrança.");
          } else {
            toast.success("Cobrança criada e enviada ao proprietário!");
          }
          return;
        }

        // Regular update - check if it's a charge field or ticket field
        if (["amount_cents", "management_contribution_cents", "service_type"].includes(field)) {
          const ticketDraftFieldMap: Record<string, string> = {
            amount_cents: "charge_draft_amount_cents",
            management_contribution_cents: "charge_draft_management_contribution_cents",
            service_type: "charge_draft_category",
          };
          const ticketDraftField = ticketDraftFieldMap[field];

          // Use limit to avoid maybeSingle error on multiple rows
          const { data: existingCharges } = await supabase
            .from("charges")
            .select("id")
            .eq("ticket_id", id)
            .is("archived_at", null)
            .order("created_at", { ascending: false })
            .limit(1);

          const existingCharge = existingCharges?.[0] ?? null;

          if (existingCharge) {
            const { error } = await supabase
              .from("charges")
              .update({ [field]: value })
              .eq("id", existingCharge.id);
            if (error) throw error;

            if (ticketDraftField) {
              const { error: ticketDraftError } = await supabase
                .from("tickets")
                .update({ [ticketDraftField]: value })
                .eq("id", id);
              if (ticketDraftError) throw ticketDraftError;
            }
          } else {
            // Create draft charge
            const ticket = tickets?.find(t => t.id === id);
            if (ticket && ticket.owner) {
              const { error } = await supabase
                .from("charges")
                .insert({
                  owner_id: ticket.owner.id,
                  property_id: ticket.property?.id || null,
                  ticket_id: id,
                  title: ticket.subject,
                  [field]: value,
                  amount_cents: field === "amount_cents" ? value : 0,
                  management_contribution_cents: field === "management_contribution_cents" ? value : 0,
                  service_type: field === "service_type" ? value : null,
                  status: "draft",
                });
              if (error) throw error;

              if (ticketDraftField) {
                const { error: ticketDraftError } = await supabase
                  .from("tickets")
                  .update({ [ticketDraftField]: value })
                  .eq("id", id);
                if (ticketDraftError) throw ticketDraftError;
              }
            }
          }
        } else if (field === "scheduled_at") {
          const { error } = await supabase
            .from("tickets")
            .update({ scheduled_at: value })
            .eq("id", id);
          if (error) throw error;
        } else if (field === "on_hold") {
          // Stand-by da lista: coluna própria, sem tocar no status (que o
          // proprietário vê).
          const { error } = await supabase
            .from("tickets")
            .update({ on_hold: !!value })
            .eq("id", id);
          if (error) throw error;
        } else if (field === "cost_responsible") {
          // Persist on the ticket. Já feita e passou a ser do hóspede: mesma
          // regra do "feito" — sai da lista e fica no aviso do painel.
          const hospedeFeito =
            value === "guest" && tickets?.find((t) => t.id === id)?.status === "concluido";
          const { error } = await supabase
            .from("tickets")
            .update(
              hospedeFeito
                ? { cost_responsible: value, archived_at: new Date().toISOString() }
                : { cost_responsible: value },
            )
            .eq("id", id);
          if (error) throw error;
          if (hospedeFeito) avisarHospedeArquivada();

          // Mirror to the latest open linked charge, if any
          const { data: linkedCharges } = await supabase
            .from("charges")
            .select("id")
            .eq("ticket_id", id)
            .is("archived_at", null)
            .order("created_at", { ascending: false })
            .limit(1);
          const linked = linkedCharges?.[0];
          if (linked) {
            await supabase
              .from("charges")
              .update({ cost_responsible: value })
              .eq("id", linked.id);
          }
        } else if (field === "list_status") {
          // Persist the list-status change to the underlying ticket.
          // - "feito"        -> ticket.status = "concluido"
          // - "em_progresso" -> reopen the ticket as "em_execucao"
          const newTicketStatus =
            value === "feito" ? "concluido" : "em_execucao";
          // Cobrança de hóspede feita não tem o que enviar ao proprietário: sai
          // da lista (vai para o Arquivo) e continua no aviso do painel até
          // alguém marcar como "Cobrada".
          const hospedeFeito =
            value === "feito" && tickets?.find((t) => t.id === id)?.cost_responsible === "guest";
          const { error } = await supabase
            .from("tickets")
            .update(
              hospedeFeito
                ? { status: newTicketStatus, archived_at: new Date().toISOString() }
                : { status: newTicketStatus },
            )
            .eq("id", id);
          if (error) throw error;
          if (hospedeFeito) avisarHospedeArquivada();
        }
      }
    },
    onMutate: async ({ id, field, value }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["maintenance-list-view", "v2-draft-fallback"] });
      await queryClient.cancelQueries({ queryKey: ["pending-charges-list"] });

      // Snapshot previous value
      const previousTickets = queryClient.getQueryData(["maintenance-list-view", "v2-draft-fallback"]);
      const previousCharges = queryClient.getQueryData(["pending-charges-list"]);

      if (field === "list_status" && value === "enviar_proprietario") {
        // Snapshot the ticket BEFORE removing it so we can mirror it
        // into the "Cobranças Pendentes" list optimistically.
        const ticketsCache = queryClient.getQueryData<MaintenanceItem[]>(["maintenance-list-view", "v2-draft-fallback"]);
        const movingTicket = ticketsCache?.find(t => t.id === id);

        // Optimistically REMOVE the ticket from the maintenance list
        queryClient.setQueryData(["maintenance-list-view", "v2-draft-fallback"], (old: MaintenanceItem[] | undefined) => {
          if (!old) return old;
          return old.filter(t => t.id !== id);
        });

        // Optimistically INSERT into the pending charges list so the row
        // visually transitions to "Cobranças Pendentes" without waiting for refetch.
        if (movingTicket) {
          const todayIso = new Date().toISOString();
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 7);
          const optimisticCharge = {
            id: `optimistic-${movingTicket.id}`,
            title: movingTicket.subject,
            amount_cents: movingTicket.amount_cents ?? 0,
            management_contribution_cents: movingTicket.management_contribution_cents ?? 0,
            service_type: movingTicket.service_type ?? null,
            category: null as string | null,
            created_at: todayIso,
            due_date: dueDate.toISOString().slice(0, 10),
            status: "sent",
            cost_responsible: movingTicket.cost_responsible ?? "owner",
            property: movingTicket.property,
            owner: movingTicket.owner,
            ticket_id: movingTicket.id,
            attachments_count: movingTicket.attachments_count ?? 0,
            __optimistic: true,
          };
          queryClient.setQueryData(["pending-charges-list"], (old: any[] | undefined) => {
            const base = Array.isArray(old) ? old : [];
            // Avoid duplicates if a refetch already brought the real charge
            if (base.some(c => c.ticket_id === movingTicket.id)) return base;
            return [optimisticCharge, ...base];
          });
        }
      } else if (field === "list_status") {
        // Optimistically reflect the move between "Em Progresso" and
        // "Concluídas" by also updating the underlying ticket.status.
        const newTicketStatus = value === "feito" ? "concluido" : "em_execucao";
        queryClient.setQueryData(["maintenance-list-view", "v2-draft-fallback"], (old: MaintenanceItem[] | undefined) => {
          if (!old) return old;
          return old.map(t =>
            t.id === id
              ? { ...t, list_status: value, status: newTicketStatus as TicketStatus }
              : t
          );
        });
      } else {
        // Regular optimistic update
        queryClient.setQueryData(["maintenance-list-view", "v2-draft-fallback"], (old: MaintenanceItem[] | undefined) => {
          if (!old) return old;
          return old.map(t => t.id === id ? { ...t, [field]: value } : t);
        });
      }

      return { previousTickets, previousCharges };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(["maintenance-list-view", "v2-draft-fallback"], context?.previousTickets);
      queryClient.setQueryData(["pending-charges-list"], context?.previousCharges);
      toast.error("Erro ao atualizar");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view", "v2-draft-fallback"] });
      queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
    },
  });

  const handleUpdateItem = useCallback((id: string, field: string, value: any, isCharge?: boolean) => {
    if (field === "board") {
      // "Quadro" não é coluna: é a combinação de on_hold (Stand-by) com a label
      // `infiltracao`. Traduz para os dois campos reais e reaproveita as mutations
      // que já existem — inclusive o otimismo de cada uma, que faz a linha
      // trocar de grupo na hora.
      const item = tickets?.find((t) => t.id === id);
      const { on_hold, service_type } = boardChange(item ?? {}, value as Board);
      if ((item?.on_hold ?? false) !== on_hold) {
        updateMutation.mutate({ id, field: "on_hold", value: on_hold, isCharge: false });
      }
      if (service_type !== undefined && (service_type || "") !== (item?.service_type || "")) {
        updateMutation.mutate({ id, field: "service_type", value: service_type, isCharge: false });
      }
      return;
    }
    updateMutation.mutate({ id, field, value, isCharge });
  }, [updateMutation, tickets]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const expandirTodos = useCallback((abrir: boolean) => {
    setExpandedGroups(Object.fromEntries(GROUPS.map((g) => [g.id, abrir])));
  }, []);

  // Get all ticket IDs for unread messages tracking
  const allTicketIds = useMemo(() => {
    return (tickets || []).map(t => t.id);
  }, [tickets]);

  const { unreadCounts, markAsRead } = useUnreadMessages(allTicketIds);

  // Preload chat messages
  useChatPreloader(allTicketIds);

  // Open chat dialog
  const handleOpenChat = useCallback((item: MaintenanceItem) => {
    setSelectedItem(item);
    setChatDialogOpen(true);
  }, []);

  const handleCloseChat = useCallback((open: boolean) => {
    setChatDialogOpen(open);
    if (!open && selectedItem) {
      markAsRead(selectedItem.id);
    }
  }, [selectedItem, markAsRead]);

  // Handle sort
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }, [sortField, sortDirection]);

  // Selection handlers
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const now = new Date().toISOString();
      
      // Separate ticket IDs and charge IDs
      const ticketIds = ids.filter(id => {
        const allItems = [...(tickets || []), ...(charges || []).map(c => ({ ...c, itemType: "charge" }))];
        const item = allItems.find(i => i.id === id);
        return item && !("itemType" in item && item.itemType === "charge");
      });
      
      const chargeIds = ids.filter(id => !ticketIds.includes(id));

      if (ticketIds.length > 0) {
        const { error } = await supabase
          .from("tickets")
          .update({ archived_at: now })
          .in("id", ticketIds);
        if (error) throw error;
      }

      if (chargeIds.length > 0) {
        const { error } = await supabase
          .from("charges")
          .update({ archived_at: now })
          .in("id", chargeIds);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
      queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
      setSelectedIds(new Set());
      toast.success("Itens arquivados com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao arquivar itens");
    },
  });

  const handleArchive = useCallback(() => {
    if (selectedIds.size === 0) return;
    archiveMutation.mutate(Array.from(selectedIds));
  }, [selectedIds, archiveMutation]);

  const toggleGroupSelection = useCallback((ids: string[], selecionar: boolean) => {
    setSelectedIds((prev) => {
      const novo = new Set(prev);
      ids.forEach((id) => (selecionar ? novo.add(id) : novo.delete(id)));
      return novo;
    });
  }, []);

  // ===== Envio em lote ao proprietário =====
  // Antes: Feito -> seta -> "Enviar ao Proprietário", item por item. Agora marca
  // vários e envia de uma vez, pelo mesmo enviarAoProprietario do envio único.
  const [confirmarEnvioLote, setConfirmarEnvioLote] = useState(false);
  const [progressoLote, setProgressoLote] = useState<{ feitos: number; total: number } | null>(null);
  const selecionadosParaEnviar = useMemo(
    () => (tickets || []).filter((t) => selectedIds.has(t.id) && t.owner),
    [tickets, selectedIds],
  );
  // Selecionados que têm anexo, manutenções e cobranças: vão juntos num .zip.
  const selecionadosComAnexo = useMemo(
    () =>
      [
        ...(tickets || []),
        ...(charges || []).map((c) => ({ ...c, subject: c.title, itemType: "charge" as const })),
      ].filter((i) => selectedIds.has(i.id) && (i.attachments_count ?? 0) > 0) as unknown as MaintenanceItem[],
    [tickets, charges, selectedIds],
  );

  const envioLoteMutation = useMutation({
    mutationFn: async (itens: MaintenanceItem[]) => {
      const enviados: string[] = [];
      const falhas: string[] = [];
      const contagem = { enviada: 0, gratuita: 0, sem_valor: 0, ja_cobrada: 0 };
      // Um por vez, com intervalo: cada envio cria cobrança, copia anexos, manda
      // e-mail e (pelo trigger) WhatsApp. O intervalo espaça as mensagens para o
      // mesmo proprietário e deixa a Meta ver um ritmo normal, não uma rajada.
      setProgressoLote({ feitos: 0, total: itens.length });
      for (const [indice, item] of itens.entries()) {
        if (indice > 0) await new Promise((r) => setTimeout(r, INTERVALO_ENVIO_LOTE_MS));
        setProgressoLote({ feitos: indice, total: itens.length });
        try {
          contagem[await enviarAoProprietario(item)]++;
          enviados.push(item.id);
        } catch (err) {
          console.error("Envio em lote: falhou", item.id, err);
          falhas.push(`${item.property?.name ?? "?"} — ${item.subject}`);
        }
      }
      return { enviados, falhas, contagem };
    },
    onSuccess: ({ enviados, falhas, contagem }) => {
      setSelectedIds((prev) => {
        const novo = new Set(prev);
        enviados.forEach((id) => novo.delete(id));
        return novo;
      });
      if (enviados.length > 0) {
        const partes = [
          contagem.enviada && `${contagem.enviada} com cobrança`,
          contagem.gratuita && `${contagem.gratuita} de graça (aporte total)`,
          contagem.sem_valor && `${contagem.sem_valor} sem valor`,
          contagem.ja_cobrada && `${contagem.ja_cobrada} já tinham cobrança (não duplicadas)`,
        ].filter(Boolean);
        toast.success(
          `${enviados.length} ${enviados.length === 1 ? "manutenção enviada" : "manutenções enviadas"} ao proprietário: ${partes.join(", ")}.`,
        );
      }
      if (falhas.length > 0) {
        toast.error(`Não foi possível enviar ${falhas.length}: ${falhas.join("; ")}`, { duration: 10000 });
      }
    },
    onError: () => toast.error("Erro ao enviar em lote"),
    onSettled: () => {
      setProgressoLote(null);
      setConfirmarEnvioLote(false);
      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
      queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
    },
  });

  // Helper to get public URL from storage path
  const getStorageUrl = useCallback((path: string, bucket: string = "attachments") => {
    // If already a full URL, return as-is
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    // Build the public URL
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }, []);

  // Open attachments gallery
  // ===== Debate com o proprietário =====
  // A manutenção já é um ticket: para o proprietário opinar, ela troca de tipo
  // (vira "duvida", que ele vê em Meus chamados) e volta a "manutencao" depois.
  // Conversa e anexos são os mesmos; kind = "maintenance" marca a origem.
  const [itemDebate, setItemDebate] = useState<MaintenanceItem | null>(null);
  const [itemVoltar, setItemVoltar] = useState<MaintenanceItem | null>(null);
  const recarregarListas = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
    queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
  }, [queryClient]);

  const debateMutation = useMutation({
    mutationFn: async ({ item, mensagem }: { item: MaintenanceItem; mensagem: string }) => {
      const custoAntes = item.cost_responsible ?? null;
      // "Em espera" e "Hóspede" escondem o ticket do proprietário: sai do campo
      // enquanto durar o debate e fica anotado numa nota interna.
      const escondido = custoAntes === "pending" || custoAntes === "guest";
      const { error } = await supabase
        .from("tickets")
        .update({ ticket_type: "duvida", kind: "maintenance", ...(escondido ? { cost_responsible: null } : {}) })
        .eq("id", item.id);
      if (error) throw error;

      // Mensagem pública (a function também avisa o proprietário).
      const { data: msg, error: erroMsg } = await supabase.functions.invoke(`create-ticket-message/${item.id}`, {
        body: { message: mensagem, is_internal: false },
      });
      if (erroMsg || !msg?.id) {
        // Sem a mensagem o proprietário veria um chamado vazio: desfaz a troca.
        await supabase
          .from("tickets")
          .update({ ticket_type: "manutencao", ...(escondido ? { cost_responsible: custoAntes } : {}) })
          .eq("id", item.id);
        throw erroMsg ?? new Error("Não foi possível enviar a mensagem ao proprietário.");
      }

      // Anexos presos a nota interna (ou sem mensagem) não aparecem para o
      // proprietário: passam para a mensagem do debate.
      const { data: internas } = await supabase
        .from("ticket_messages")
        .select("id")
        .eq("ticket_id", item.id)
        .eq("is_internal", true);
      const idsInternas = (internas || []).map((m) => m.id);
      await supabase.from("ticket_attachments").update({ message_id: msg.id }).eq("ticket_id", item.id).is("message_id", null);
      if (idsInternas.length > 0) {
        await supabase.from("ticket_attachments").update({ message_id: msg.id }).eq("ticket_id", item.id).in("message_id", idsInternas);
      }

      const rotuloCusto = custoAntes === "guest" ? "Hóspede" : "Em espera";
      await supabase.from("ticket_messages").insert({
        ticket_id: item.id,
        author_id: user?.id,
        is_internal: true,
        body: escondido
          ? `Aberta para debate com o proprietário. Responsável pelo custo antes: ${rotuloCusto}.`
          : "Aberta para debate com o proprietário.",
      });
    },
    onSuccess: () => {
      toast.success("Debate aberto. O proprietário foi avisado.");
      setItemDebate(null);
      setExpandedGroups((prev) => ({ ...prev, em_debate: true }));
    },
    onError: (e: any) => toast.error("Não foi possível abrir o debate", { description: e?.message }),
    onSettled: recarregarListas,
  });

  const voltarManutencaoMutation = useMutation({
    mutationFn: async (item: MaintenanceItem) => {
      const { error } = await supabase
        .from("tickets")
        // Sem responsável definido, volta como "Em espera" (invisível ao proprietário).
        .update({ ticket_type: "manutencao", cost_responsible: item.cost_responsible ?? "pending" })
        .eq("id", item.id);
      if (error) throw error;
      await supabase.from("ticket_messages").insert({
        ticket_id: item.id,
        author_id: user?.id,
        is_internal: true,
        body: "Debate encerrado: voltou para a lista de manutenções.",
      });
    },
    onSuccess: () => {
      toast.success("Voltou para manutenção.");
      setItemVoltar(null);
    },
    onError: (e: any) => toast.error("Não foi possível voltar para manutenção", { description: e?.message }),
    onSettled: recarregarListas,
  });

  /** Baixa os anexos dos itens num .zip, uma pasta por item (check-out, imóvel, dano). */
  const handleDownloadAttachments = useCallback(async (itens: MaintenanceItem[]) => {
    if (itens.length === 0) return;
    const ids = itens.map((i) => i.id);
    setBaixandoAnexos((prev) => new Set([...prev, ...ids]));
    try {
      const resultado = await baixarAnexosEmZip(
        itens.map((item) => {
          const isCharge = item.itemType === "charge";
          return {
            ticketId: isCharge ? item.ticket_id : item.id,
            chargeId: isCharge ? item.id : null,
            checkout: item.guest_checkout_date,
            imovel: item.property?.name,
            dano: item.subject,
          };
        }),
      );
      if (resultado.baixados === 0) {
        toast.error(resultado.falhas > 0 ? "Não foi possível baixar os anexos" : "Nenhum anexo para baixar");
      } else {
        toast.success("Download iniciado", { description: resumoDownloadAnexos(resultado) });
      }
    } catch (e: any) {
      console.error("Erro ao baixar anexos:", e);
      toast.error("Não foi possível baixar os anexos", { description: e?.message });
    } finally {
      setBaixandoAnexos((prev) => {
        const proximo = new Set(prev);
        ids.forEach((id) => proximo.delete(id));
        return proximo;
      });
    }
  }, []);

  const handleOpenAttachments = useCallback(async (item: MaintenanceItem) => {
    const isCharge = item.itemType === "charge";
    
    if (isCharge) {
      const { data, error } = await supabase
        .from("charge_attachments")
        .select("id, file_path, file_name, mime_type")
        .eq("charge_id", item.id)
        .order("created_at", { ascending: false });
      
      if (error) {
        toast.error("Erro ao carregar anexos");
        return;
      }
      
      if (data && data.length > 0) {
        const mediaItems = data.map(att => ({
          id: att.id,
          file_url: getStorageUrl(att.file_path),
          file_name: att.file_name,
          file_type: att.mime_type,
        }));
        setGalleryItems(mediaItems);
        setGalleryInitialIndex(0);
        setGalleryAttachmentTable("charge_attachments");
        setGalleryOpen(true);
      }
    } else {
      // For tickets, fetch ticket attachments
      const { data, error } = await supabase
        .from("ticket_attachments")
        .select("id, file_url, file_name, file_type")
        .eq("ticket_id", item.id)
        .order("created_at", { ascending: false });
      
      if (error) {
        toast.error("Erro ao carregar anexos");
        return;
      }
      
      if (data && data.length > 0) {
        const mediaItems = data.map(att => ({
          id: att.id,
          file_url: att.file_url,
          file_name: att.file_name,
          file_type: att.file_type,
        }));
        setGalleryItems(mediaItems);
        setGalleryInitialIndex(0);
        setGalleryAttachmentTable("ticket_attachments");
        setGalleryOpen(true);
      }
    }
  }, [getStorageUrl]);

  // Trigger file upload
  const handleUploadAttachment = useCallback((item: MaintenanceItem) => {
    setPendingUploadItem(item);
    fileInputRef.current?.click();
  }, []);

  // Handle file selection
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !pendingUploadItem) return;

    const item = pendingUploadItem;
    const isCharge = item.itemType === "charge";
    setUploadingItemId(item.id);

    try {
      // Até 3 arquivos ao mesmo tempo. Nome, tipo e tamanho gravados são os do
      // arquivo enviado (a foto pode ter sido reduzida e virado .jpg).
      await emParaleloOuFalha(Array.from(files), async (original) => {
        const folder = isCharge ? `charges/${item.id}` : `tickets/${item.id}`;
        const { url, file } = await uploadFileWithCompression(
          original,
          "attachments",
          folder,
        );

        if (isCharge) {
          const { error } = await supabase
            .from("charge_attachments")
            .insert({
              charge_id: item.id,
              file_path: url,
              file_name: file.name,
              mime_type: file.type,
              file_size: file.size,
              created_by: user?.id,
            });
          if (error) throw error;
        } else {
          // For tickets, we need a message first - create a system message
          const { data: msgData, error: msgError } = await supabase
            .from("ticket_messages")
            .insert({
              ticket_id: item.id,
              author_id: user?.id,
              body: "Anexo enviado",
              is_internal: true,
            })
            .select("id")
            .single();
          
          if (msgError) throw msgError;

          const { error } = await supabase
            .from("ticket_attachments")
            .insert({
              ticket_id: item.id,
              message_id: msgData.id,
              path: url,
              file_url: url,
              file_name: file.name,
              mime_type: file.type,
              file_size: file.size,
            });
          if (error) throw error;
        }
      });

      toast.success("Anexo(s) enviado(s) com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
      queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erro ao enviar anexo");
    } finally {
      setUploadingItemId(null);
      setPendingUploadItem(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [pendingUploadItem, user?.id, queryClient]);

  // Organize items into groups with search filter
  const groupedItems = useMemo(() => {
    const searchLower = debouncedSearch.toLowerCase();
    const bateImovel = (p?: { id: string } | null) => filtroImovel === "todos" || p?.id === filtroImovel;
    const emDebate = (t: MaintenanceItem) => !!t.ticket_type && t.ticket_type !== "manutencao";

    const debate = (tickets || []).filter(t =>
      emDebate(t) &&
      bateImovel(t.property) &&
      (t.subject.toLowerCase().includes(searchLower) ||
       t.property?.name.toLowerCase().includes(searchLower))
    );

    const abertos = (tickets || []).filter(t =>
      !emDebate(t) &&
      t.status !== "concluido" &&
      bateImovel(t.property) &&
      (t.subject.toLowerCase().includes(searchLower) ||
       t.property?.name.toLowerCase().includes(searchLower))
    );

    // Quadros: Infiltração vence Stand-by (uma infiltração parada continua no
    // quadro Infiltração, com etiqueta). O resto é Em Progresso.
    const infiltracao = abertos.filter(t => deriveBoard(t) === "infiltracao");
    const standBy = abertos.filter(t => deriveBoard(t) === "stand_by");
    const emProgresso = abertos.filter(t => deriveBoard(t) === "em_progresso");

    const concluidas = (tickets || []).filter(t =>
      !emDebate(t) &&
      t.status === "concluido" &&
      bateImovel(t.property) &&
      (t.subject.toLowerCase().includes(searchLower) ||
       t.property?.name.toLowerCase().includes(searchLower))
    );

    const mapCharge = (c: any) => ({
      id: c.id,
      subject: c.title,
      status: "concluido" as TicketStatus,
      scheduled_at: c.due_date,
      created_at: c.created_at,
      property: c.property,
      owner: c.owner,
      amount_cents: c.amount_cents,
      management_contribution_cents: c.management_contribution_cents,
      service_type: c.service_type || c.category, // Fallback to category if service_type is null
      list_status: "enviar_proprietario" as ListStatus,
      attachments_count: c.attachments_count || 0,
      itemType: "charge" as const,
      whatsapp_status: c.whatsapp_status ?? null,
      whatsapp_enviado_em: c.whatsapp_enviado_em ?? null,
      whatsapp_lembrete_status: c.whatsapp_lembrete_status ?? null,
      whatsapp_lembrete_enviado_em: c.whatsapp_lembrete_enviado_em ?? null,
      whatsapp_lembretes_enviados: c.whatsapp_lembretes_enviados ?? 0,
    });

    const filteredCharges = (charges || []).filter(c =>
      bateImovel(c.property) &&
      (c.title.toLowerCase().includes(searchLower) ||
       c.property?.name?.toLowerCase().includes(searchLower))
    );

    // Split charges into overdue and pending (no dia do vencimento ainda é pendente)
    const cobrancasVencidas = filteredCharges
      .filter(c => estaVencida(c.due_date))
      .map(mapCharge);

    const cobrancasPendentes = filteredCharges
      .filter(c => !estaVencida(c.due_date))
      .map(mapCharge);

    return {
      em_progresso: emProgresso,
      infiltracao,
      stand_by: standBy,
      em_debate: debate,
      concluidas: concluidas,
      cobrancas_vencidas: cobrancasVencidas,
      cobrancas: cobrancasPendentes,
    };
  }, [tickets, charges, debouncedSearch, filtroImovel]);

  const totalItens = useMemo(
    () => Object.values(groupedItems).reduce((soma, itens) => soma + itens.length, 0),
    [groupedItems],
  );

  // ===== Lembrete de atraso em lote =====
  // Cobranças vencidas marcadas -> UM lembrete por proprietário, com o resumo
  // de todas as cobranças dele em atraso (não só as marcadas).
  const [confirmarLembreteLote, setConfirmarLembreteLote] = useState(false);
  const [progressoLembrete, setProgressoLembrete] = useState<{ feitos: number; total: number } | null>(null);
  const donosParaLembrete = useMemo(() => {
    const porDono = new Map<string, { owner: DonoWhatsapp; selecionadas: number }>();
    for (const c of groupedItems.cobrancas_vencidas || []) {
      if (!selectedIds.has(c.id) || !c.owner) continue;
      const atual = porDono.get(c.owner.id);
      if (atual) atual.selecionadas++;
      else porDono.set(c.owner.id, { owner: c.owner, selecionadas: 1 });
    }
    return [...porDono.values()];
  }, [groupedItems, selectedIds]);

  const lembreteLoteMutation = useMutation({
    mutationFn: async (donos: DonoWhatsapp[]) => {
      const aptos = donos.filter((d) => d.notificar_whatsapp && temWhatsapp(d.phone));
      let enviados = 0;
      const falhas: string[] = [];
      setProgressoLembrete({ feitos: 0, total: aptos.length });
      for (const [indice, dono] of aptos.entries()) {
        if (indice > 0) await new Promise((r) => setTimeout(r, INTERVALO_ENVIO_LOTE_MS));
        setProgressoLembrete({ feitos: indice, total: aptos.length });
        const r = await enviarLembreteAtraso(dono.id);
        if (r.status === "enviado") enviados++;
        else if (r.status !== "sem_atraso") falhas.push(`${dono.name}: ${r.erro || r.status}`);
      }
      return { enviados, falhas, pulados: donos.length - aptos.length };
    },
    onSuccess: ({ enviados, falhas, pulados }) => {
      setSelectedIds(new Set());
      if (enviados > 0) {
        toast.success(`Lembrete de atraso enviado para ${enviados} ${enviados === 1 ? "proprietário" : "proprietários"}.`);
      }
      if (pulados > 0) toast.info(`${pulados} ficaram de fora: WhatsApp desligado ou sem telefone.`);
      if (falhas.length > 0) toast.error(`Não foi possível enviar ${falhas.length}: ${falhas.join("; ")}`, { duration: 10000 });
    },
    onError: () => toast.error("Erro ao enviar os lembretes"),
    onSettled: () => {
      setProgressoLembrete(null);
      setConfirmarLembreteLote(false);
      queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
    },
  });

  // Filter inspections by search and split by type
  const { cleanerInspections, teamInspections, allInspectionsList } = useMemo(() => {
    if (!inspections) return { cleanerInspections: [], teamInspections: [], allInspectionsList: [] };
    const searchLower = debouncedSearch.toLowerCase();
    
    const filtered = inspections.filter(i =>
      i.property?.name?.toLowerCase().includes(searchLower) ||
      i.owner_name?.toLowerCase().includes(searchLower) ||
      i.cleaner_name?.toLowerCase().includes(searchLower)
    );
    
    // Use the is_team_inspection flag to split
    const cleanerInspections = filtered.filter(i => !i.is_team_inspection && i.cleaner_name);
    const teamInspections = filtered.filter(i => i.is_team_inspection || !i.cleaner_name);
    
    return { cleanerInspections, teamInspections, allInspectionsList: filtered };
  }, [inspections, debouncedSearch]);

  // Handle inspection selection with shift+click support
  const handleToggleInspectionSelection = useCallback((id: string, shiftKey: boolean) => {
    if (shiftKey && lastSelectedInspectionId && allInspectionsList.length > 0) {
      // Find indices
      const lastIndex = allInspectionsList.findIndex(i => i.id === lastSelectedInspectionId);
      const currentIndex = allInspectionsList.findIndex(i => i.id === id);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const idsInRange = allInspectionsList.slice(start, end + 1).map(i => i.id);
        
        setSelectedInspectionIds(prev => {
          const newSet = new Set(prev);
          idsInRange.forEach(rangeId => newSet.add(rangeId));
          return newSet;
        });
        return;
      }
    }
    
    // Normal toggle
    setSelectedInspectionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
    setLastSelectedInspectionId(id);
  }, [lastSelectedInspectionId, allInspectionsList]);

  // Archive selected inspections
  const handleArchiveInspections = useCallback(async () => {
    if (selectedInspectionIds.size === 0) return;
    
    setArchivingInspections(true);
    try {
      const { error } = await supabase
        .from("cleaning_inspections")
        .update({ archived_at: new Date().toISOString() })
        .in("id", Array.from(selectedInspectionIds));
      
      if (error) throw error;
      
      toast.success(`${selectedInspectionIds.size} vistoria(s) arquivada(s)`);
      setSelectedInspectionIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["inspections-for-list"] });
    } catch (error: any) {
      console.error("Error archiving inspections:", error);
      toast.error(error.message || "Erro ao arquivar vistorias");
    } finally {
      setArchivingInspections(false);
    }
  }, [selectedInspectionIds, queryClient]);

  // Handle opening inspection attachments
  const handleOpenInspectionAttachments = useCallback((inspection: InspectionItem) => {
    if (inspection.attachments.length > 0) {
      setGalleryItems(inspection.attachments.map(a => ({
        id: a.id,
        file_url: a.file_url,
        file_name: a.file_name || null,
        file_type: a.file_type || null,
      })));
      setGalleryInitialIndex(0);
      setGalleryAttachmentTable("cleaning_inspection_attachments");
      setGalleryOpen(true);
    }
  }, []);

  // Handle generating summary for inspection
  const handleGenerateSummary = useCallback(async (inspection: InspectionItem) => {
    if (!inspection.transcript && !inspection.is_routine) {
      toast.error("Não há transcrição para resumir");
      return;
    }

    setGeneratingSummaryIds(prev => new Set(prev).add(inspection.id));

    try {
      // If routine inspection, fetch checklist data to include in analysis
      let checklistNotes: Record<string, string> | undefined;
      if (inspection.is_routine) {
        const { data: checklist } = await supabase
          .from('routine_inspection_checklists')
          .select('*')
          .eq('inspection_id', inspection.id)
          .maybeSingle();
        
        if (checklist) {
          checklistNotes = {};
          const labels: Record<string, string> = {
            ac: 'Ar-condicionado',
            tv_internet: 'TV / Internet',
            outlets_switches: 'Tomadas, Interruptores e Lâmpadas',
            doors_locks: 'Portas, Fechaduras, Dobradiças',
            curtains_rods: 'Cortinas e Varões',
            bathroom: 'Banheiro',
            furniture: 'Móveis',
            kitchen: 'Cozinha / Utensílios',
            stove_oven: 'Bocas do Fogão e Forno',
            cutlery: 'Talheres',
          };

          for (const [key, label] of Object.entries(labels)) {
            const statusKey = key === 'cutlery' ? 'cutlery_ok' : `${key}_working`;
            const notesKey = `${key}_notes`;
            const status = (checklist as any)[statusKey] as string;
            const notes = (checklist as any)[notesKey] as string;
            if (status) {
              checklistNotes[label] = `Status: ${status.toUpperCase()}${notes ? ` | Observação: ${notes}` : ''}`;
            }
          }

          // Add services and counts
          if (checklist.ac_filters_cleaned) checklistNotes['Filtros AC'] = 'Limpeza realizada';
          if (checklist.batteries_replaced) checklistNotes['Pilhas'] = 'Substituídas';
          if (checklist.glasses_count != null) checklistNotes['Copos'] = `Quantidade: ${checklist.glasses_count}`;
          if (checklist.pillows_count != null) checklistNotes['Travesseiros'] = `Quantidade: ${checklist.pillows_count}`;
        }
      }

      const { data, error } = await supabase.functions.invoke("summarize-inspection", {
        body: { 
          transcript: inspection.transcript,
          inspectionId: inspection.id,
          checklistNotes,
        },
      });

      if (error) throw error;

      if (data?.summary) {
        toast.success("Resumo gerado com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["inspections-for-list"] });
      }
    } catch (error: any) {
      console.error("Error generating summary:", error);
      toast.error(error.message || "Erro ao gerar resumo");
    } finally {
      setGeneratingSummaryIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(inspection.id);
        return newSet;
      });
    }
  }, [queryClient]);

  // Handle creating maintenance from inspection
  const handleCreateMaintenanceFromInspection = useCallback((inspection: InspectionItem) => {
    setSelectedInspection(inspection);
    setMaintenanceDialogOpen(true);
  }, []);

  // Handle editing inspection
  const handleEditInspection = useCallback((inspection: InspectionItem) => {
    setInspectionToEdit(inspection);
    setEditInspectionDialogOpen(true);
  }, []);

  // Diálogos do debate: os mesmos no celular e no desktop.
  const dialogosDebate = (
    <>
        {/* Debate com o proprietário */}
        <DebateDialog
          item={itemDebate}
          enviando={debateMutation.isPending}
          onCancelar={() => setItemDebate(null)}
          onConfirmar={(mensagem) => itemDebate && debateMutation.mutate({ item: itemDebate, mensagem })}
        />
        <ConfirmationDialog
          open={!!itemVoltar}
          onOpenChange={(aberto) => !aberto && setItemVoltar(null)}
          title="Voltar para manutenção?"
          description={
            <>
              <span className="font-medium text-foreground">{itemVoltar?.subject}</span> sai dos chamados do proprietário e
              volta para a lista de manutenções, com a conversa e os anexos.
              {!itemVoltar?.cost_responsible && " O responsável pelo custo volta como “Em espera”."}
            </>
          }
          confirmLabel="Voltar para manutenção"
          loading={voltarManutencaoMutation.isPending}
          onConfirm={() => itemVoltar && voltarManutencaoMutation.mutate(itemVoltar)}
        />
    </>
  );

  // Mobile-only optimized view
  if (isMobile) {
    // Mesmos grupos e mesma ordem do desktop.
    const mobileGroups = GROUPS.map((g) => ({ id: g.id, label: g.label, borderColor: g.color, dotColor: g.ponto, tom: g.tom, cobranca: g.cobranca }));

    // Enrich items with itemType so mobile knows ticket vs charge
    const enrichedGroupedItems: Record<string, any[]> = {
      em_progresso: (groupedItems.em_progresso || []).map((t) => ({ ...t, itemType: "ticket" as const })),
      infiltracao: (groupedItems.infiltracao || []).map((t) => ({ ...t, itemType: "ticket" as const })),
      stand_by: (groupedItems.stand_by || []).map((t) => ({ ...t, itemType: "ticket" as const })),
      em_debate: (groupedItems.em_debate || []).map((t) => ({ ...t, itemType: "ticket" as const })),
      concluidas: (groupedItems.concluidas || []).map((t) => ({ ...t, itemType: "ticket" as const })),
      cobrancas_vencidas: groupedItems.cobrancas_vencidas || [],
      cobrancas: groupedItems.cobrancas || [],
    };

    return (
      <>
        <MobileMaintenanceList
          groups={mobileGroups}
          groupedItems={enrichedGroupedItems}
          isLoading={isLoading}
          search={search}
          onSearchChange={setSearch}
          unreadCounts={unreadCounts}
          onOpenDetail={(id, isCharge) => openSheet(id, isCharge ? "cobranca" : "maintenance")}
          onOpenChat={(item) => handleOpenChat(item as any)}
          onOpenAttachments={(item) => handleOpenAttachments(item as any)}
          onDownloadAttachments={(item) => handleDownloadAttachments([item as any])}
          downloadingIds={baixandoAnexos}
          onEdit={(item, isCharge) =>
            setEditMaintenanceDialog({ open: true, id: item.id, type: isCharge ? "charge" : "maintenance" })
          }
          onDelete={(item, isCharge) =>
            setDeleteDialog({ open: true, item: item as any, isCharge })
          }
          onUpdateItem={(id, field, value, isCharge) =>
            handleUpdateItem(id, field, value, isCharge)
          }
          onAttachmentAdded={() => {
            queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
            queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
          }}
          onWhatsappAtualizado={() => {
            queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
            queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
          }}
          onBack={() => goBack(navigate, "/painel")}
          onNew={() => navigate("/admin/nova-manutencao")}
          expanded={expandedGroups}
          onToggleGroup={toggleGroup}
          filtroQuadro={filtroQuadro}
          onFiltroQuadro={(id) => setFiltroQuadro(id as GrupoId | "todos")}
          onDebater={(item) => setItemDebate(item as MaintenanceItem)}
          onVoltarManutencao={(item) => setItemVoltar(item as MaintenanceItem)}
        />

        {dialogosDebate}

        {/* Reuso dos diálogos da versão desktop */}
        <MaintenanceChatDialog
          open={chatDialogOpen}
          onOpenChange={handleCloseChat}
          ticketId={selectedItem?.id || ""}
          ticketSubject={selectedItem?.subject || ""}
          propertyName={selectedItem?.property?.name}
        />

        <EditMaintenanceDialog
          open={editMaintenanceDialog.open}
          onOpenChange={(open) => setEditMaintenanceDialog((prev) => ({ ...prev, open }))}
          editId={editMaintenanceDialog.id}
          type={editMaintenanceDialog.type}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
            queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
          }}
        />

        <ConfirmationDialog
          open={deleteDialog.open}
          onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
          title={deleteDialog.isCharge ? "Excluir cobrança?" : "Excluir manutenção?"}
          description={
            <>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-foreground">
                Essa ação não pode ser desfeita. {deleteDialog.isCharge ? "A cobrança" : "A manutenção"} e todos os dados relacionados (mensagens, anexos, histórico) serão removidos permanentemente.
              </div>
              {deleteDialog.item && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">{deleteDialog.item.subject}</p>
                  {deleteDialog.item.property?.name && (
                    <p className="text-xs text-muted-foreground mt-1">{deleteDialog.item.property.name}</p>
                  )}
                </div>
              )}
            </>
          }
          confirmLabel="Excluir permanentemente"
          variant="destructive"
          requireTypedConfirmation="EXCLUIR"
          loading={deleting}
          onConfirm={async () => {
            if (!deleteDialog.item) return;
            setDeleting(true);
            try {
              const table = deleteDialog.isCharge ? "charges" : "tickets";
              const { error } = await supabase.from(table).delete().eq("id", deleteDialog.item.id);
              if (error) throw error;
              toast.success(deleteDialog.isCharge ? "Cobrança excluída" : "Manutenção excluída");
              setDeleteDialog({ open: false, item: null, isCharge: false });
              queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
              queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
            } catch (err: any) {
              console.error(err);
              toast.error("Erro ao excluir", { description: err.message });
            } finally {
              setDeleting(false);
            }
          }}
        />

        <DetailSheet
          open={detailSheetOpen}
          onClose={closeSheet}
          entityId={detailEntityId}
          entityType={detailEntityType}
        />

        <MediaGallery
          items={galleryItems}
          initialIndex={galleryInitialIndex}
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          onDelete={galleryAttachmentTable ? async (item) => {
            const ok = await deleteAttachmentRow(galleryAttachmentTable, item.id);
            if (ok) {
              setGalleryItems((prev) => prev.filter((i) => i.id !== item.id));
              queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
              queryClient.invalidateQueries({ queryKey: ["inspections-for-list"] });
            }
          } : undefined}
        />
      </>
    );
  }

  // Tudo que está na lista é item aberto: manutenção não arquivada ou cobrança sem pagamento.
  const totalAbertos = (tickets?.length ?? 0) + (charges?.length ?? 0);
  const subtituloLista = isLoading ? undefined : `${totalAbertos} ${totalAbertos === 1 ? "item aberto" : "itens abertos"}`;
  const totalVistorias = cleanerInspections.length + teamInspections.length;
  const gruposVisiveis = filtroQuadro === "todos" ? GROUPS : GROUPS.filter((g) => g.id === filtroQuadro);
  const todosAbertos = GROUPS.every((g) => expandedGroups[g.id]);
  const temFiltro = debouncedSearch.length > 0 || filtroImovel !== "todos" || filtroQuadro !== "todos";

  return (
    <div className="min-h-screen bg-background">
      <CabecalhoPagina
        titulo="Manutenções"
        subtitulo={subtituloLista}
        icone={<Wrench />}
        tom="primary"
        voltarPara="/painel"
        acoes={
          <>
            <Button size="sm" className="h-9" onClick={() => navigate("/admin/nova-manutencao")}>
              <Plus className="h-4 w-4" />
              Nova manutenção
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <MoreHorizontal className="h-4 w-4" />
                  Mais
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 bg-popover">
                <DropdownMenuItem onClick={() => navigate("/admin/manutencoes-arquivo")}>
                  <Archive className="mr-2 h-4 w-4" />
                  Arquivo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/manutencoes")}>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Relatório
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin/manutencoes")}>
                  <Kanban className="mr-2 h-4 w-4" />
                  Quadro
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        abaixo={
          <BarraFiltros role="tablist" aria-label="Seções da lista">
            <AbaPilula
              ativa={abaAtiva === "manutencoes"}
              quantidade={isLoading ? undefined : totalAbertos}
              tom="primary"
              onClick={() => setAbaAtiva("manutencoes")}
            >
              Manutenções
            </AbaPilula>
            <AbaPilula
              ativa={abaAtiva === "vistorias"}
              quantidade={inspections ? totalVistorias : undefined}
              tom="warning"
              onClick={() => setAbaAtiva("vistorias")}
            >
              Vistorias
            </AbaPilula>
            <AbaPilula ativa={abaAtiva === "debitos"} onClick={() => setAbaAtiva("debitos")}>
              Débitos em reserva
            </AbaPilula>
          </BarraFiltros>
        }
      />
      <main className="mx-auto w-full max-w-[1600px] space-y-3 px-4 py-4 pb-24">
        {abaAtiva === "manutencoes" && (
          <>
            {/* Busca, imóvel e controles */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou imóvel…"
                  className="h-9 pl-9"
                  aria-label="Buscar manutenção"
                />
              </div>
              <Select value={filtroImovel} onValueChange={setFiltroImovel}>
                <SelectTrigger className="h-9 w-[210px]" aria-label="Filtrar por imóvel">
                  <SelectValue placeholder="Todos os imóveis" />
                </SelectTrigger>
                <SelectContent className="z-50 max-h-72 bg-popover">
                  <SelectItem value="todos">Todos os imóveis</SelectItem>
                  {propertiesList?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => expandirTodos(!todosAbertos)}>
                {todosAbertos ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
                {todosAbertos ? "Recolher tudo" : "Expandir tudo"}
              </Button>
              <div className="ml-auto">
                <LembreteAtrasoConfig />
              </div>
            </div>

            {/* Quadros */}
            <BarraFiltros role="tablist" aria-label="Quadros">
              <AbaPilula
                ativa={filtroQuadro === "todos"}
                quantidade={isLoading ? undefined : totalItens}
                onClick={() => setFiltroQuadro("todos")}
              >
                Todos
              </AbaPilula>
              {GROUPS.map((g) => (
                <AbaPilula
                  key={g.id}
                  ativa={filtroQuadro === g.id}
                  quantidade={isLoading ? undefined : groupedItems[g.id].length}
                  tom={g.tom}
                  onClick={() => {
                    setFiltroQuadro(g.id);
                    setExpandedGroups((prev) => ({ ...prev, [g.id]: true }));
                  }}
                >
                  {g.label}
                </AbaPilula>
              ))}
            </BarraFiltros>

            {/* Tabela de manutenções */}
            <Card className="overflow-hidden rounded-xl border-border/70">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr className="h-9">
                      <th className="sticky left-0 z-[2] w-[36px] bg-muted px-1 py-2"></th>
                      <SortableHeader label="Manutenção" field="subject" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="sticky left-[36px] z-[2] w-[240px] max-w-[240px] bg-muted px-2 text-left" />
                      <th className="w-[40px] px-1 py-2 text-center font-medium" title="Conversa">
                        <MessageSquare className="mx-auto h-3.5 w-3.5" aria-label="Conversa" />
                      </th>
                      <SortableHeader label="Imóvel" field="property" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[150px] max-w-[150px] px-2 text-left" />
                      <SortableHeader label="Valor" field="amount_cents" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[92px] text-center" />
                      <SortableHeader label="Aporte" field="management_contribution_cents" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[92px] text-center" />
                      <SortableHeader label="Data" field="created_at" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[64px] text-center" />
                      <th className="w-[100px] px-1 py-2 text-center font-medium">Anexos</th>
                      <th className="w-[112px] px-1 py-2 text-center font-medium">Responsável</th>
                      <SortableHeader label="Etiqueta" field="service_type" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[112px] text-center" />
                      <th className="w-[112px] px-1 py-2 text-center font-medium">Quadro</th>
                      <SortableHeader label="Status" field="list_status" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[124px] text-center" />
                      <th className="w-[128px] px-1 py-2 text-center font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="border-b" aria-busy="true">
                          <td colSpan={13} className="px-3 py-1.5">
                            <Skeleton className="h-7 w-full rounded-md" />
                          </td>
                        </tr>
                      ))
                    ) : totalItens === 0 ? (
                      <tr>
                        <td colSpan={13} className="p-0">
                          <EmptyState
                            ilustracao={temFiltro ? "busca" : "manutencoes"}
                            title={temFiltro ? "Nada encontrado com esses filtros" : "Nenhuma manutenção"}
                            description={
                              temFiltro
                                ? "Tente outro nome, outro imóvel ou volte para Todos."
                                : "Use “Nova manutenção” para abrir a primeira."
                            }
                            action={
                              temFiltro ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSearch("");
                                    setFiltroImovel("todos");
                                    setFiltroQuadro("todos");
                                  }}
                                >
                                  Limpar filtros
                                </Button>
                              ) : undefined
                            }
                            className="py-8"
                          />
                        </td>
                      </tr>
                    ) : (
                      gruposVisiveis.map(group => {
                        const isExpanded = expandedGroups[group.id] ?? false;
                        const isChargeGroup = group.cobranca;
                        const isInlineActive = inlineAdd?.groupId === group.id;
                        return (
                          <React.Fragment key={group.id}>
                            <GroupRow
                              group={group}
                              items={groupedItems[group.id] || []}
                              isExpanded={isExpanded}
                              onToggle={() => toggleGroup(group.id)}
                              onUpdateItem={handleUpdateItem}
                              onOpenChat={handleOpenChat}
                              unreadCounts={unreadCounts}
                              selectedIds={selectedIds}
                              onToggleSelection={toggleSelection}
                              onToggleGroupSelection={toggleGroupSelection}
                              sortField={sortField}
                              sortDirection={sortDirection}
                              onSort={handleSort}
                              onOpenAttachments={handleOpenAttachments}
                              onDownloadAttachments={(item) => handleDownloadAttachments([item])}
                              downloadingIds={baixandoAnexos}
                              onUploadAttachment={handleUploadAttachment}
                              uploadingItemId={uploadingItemId}
                              onOpenSheet={(id) => openSheet(id, isChargeGroup ? "cobranca" : "maintenance")}
                              onEdit={(item, isCharge) => {
                                setEditMaintenanceDialog({
                                  open: true,
                                  id: item.id,
                                  type: isCharge ? "charge" : "maintenance",
                                });
                              }}
                              onDelete={(item, isCharge) => {
                                setDeleteDialog({ open: true, item, isCharge });
                              }}
                              onDebater={setItemDebate}
                              onVoltarManutencao={setItemVoltar}
                            />

                            {/* Linha de inclusão rápida */}
                            {isExpanded && isInlineActive && (
                              <tr className="border-b bg-muted/20">
                                <td className="w-[36px] p-0" />
                                <td className="p-0" colSpan={2}>
                                  <input
                                    ref={inlineInputRef}
                                    autoFocus
                                    type="text"
                                    placeholder={isChargeGroup ? "Título da cobrança…" : "Nome da manutenção…"}
                                    value={inlineAdd!.subject}
                                    onChange={(e) => setInlineAdd((prev) => prev ? { ...prev, subject: e.target.value } : null)}
                                    onKeyDown={handleInlineKeyDown}
                                    className="h-10 w-full border-0 border-b-2 border-primary bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none"
                                    aria-label={isChargeGroup ? "Título da cobrança" : "Nome da manutenção"}
                                  />
                                </td>
                                <td className="w-[150px] p-0">
                                  <Select
                                    value={inlineAdd!.propertyId}
                                    onValueChange={(val) => setInlineAdd((prev) => prev ? { ...prev, propertyId: val } : null)}
                                  >
                                    <SelectTrigger className="h-10 rounded-none border-0 border-b-2 border-transparent text-sm focus:border-primary" aria-label="Imóvel">
                                      <SelectValue placeholder="Imóvel…" />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 max-h-72 bg-popover">
                                      {propertiesList?.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                {isChargeGroup ? (
                                  <td className="w-[92px] p-0">
                                    <input
                                      type="text"
                                      placeholder="R$ 0,00"
                                      value={inlineAdd!.amountCents}
                                      onChange={(e) => setInlineAdd((prev) => prev ? { ...prev, amountCents: e.target.value } : null)}
                                      onKeyDown={handleInlineKeyDown}
                                      className="h-10 w-full border-0 border-b-2 border-transparent bg-transparent px-3 text-right text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                                      aria-label="Valor"
                                    />
                                  </td>
                                ) : (
                                  <td className="w-[92px] p-0" />
                                )}
                                {/* Aporte, Data, Anexos, Responsável, Etiqueta, Quadro, Status: vazias, para somar 13 colunas */}
                                <td colSpan={7} className="p-0" />
                                <td className="w-[128px] p-0">
                                  <div className="flex items-center justify-center gap-1 px-2">
                                    <button
                                      type="button"
                                      onClick={handleInlineSave}
                                      disabled={inlineLoading || !inlineAdd!.subject.trim() || !inlineAdd!.propertyId}
                                      className="rounded p-1.5 text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                                      title="Salvar (Enter)"
                                      aria-label="Salvar"
                                    >
                                      {inlineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleInlineCancel}
                                      className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                                      title="Cancelar (Esc)"
                                      aria-label="Cancelar"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}

                            {/* "+ Adicionar item" */}
                            {isExpanded && !isInlineActive && (
                              <tr className="border-b border-border/60">
                                <td colSpan={13} className="p-0">
                                  <button
                                    type="button"
                                    className="group sticky left-0 flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                    onClick={() => handleStartInlineAdd(group.id)}
                                  >
                                    <Plus className="h-3.5 w-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
                                    <span>Adicionar item</span>
                                  </button>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Barra de ações da seleção */}
            {selectedIds.size > 0 && (
              <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
                <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/95 px-3 py-2 shadow-lg backdrop-blur-md">
                  <span className="px-1 text-sm font-medium tabular-nums">
                    {selectedIds.size} {selectedIds.size === 1 ? "selecionado" : "selecionados"}
                  </span>
                  <Button variant="outline" size="sm" className="h-8" onClick={handleArchive} disabled={archiveMutation.isPending}>
                    {archiveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                    Arquivar
                  </Button>
                  {selecionadosComAnexo.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => handleDownloadAttachments(selecionadosComAnexo)}
                      disabled={selecionadosComAnexo.some((i) => baixandoAnexos.has(i.id))}
                    >
                      {selecionadosComAnexo.some((i) => baixandoAnexos.has(i.id)) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Baixar anexos ({selecionadosComAnexo.length})
                    </Button>
                  )}
                  {selecionadosParaEnviar.length > 0 && (
                    <Button size="sm" className="h-8" onClick={() => setConfirmarEnvioLote(true)} disabled={envioLoteMutation.isPending}>
                      {envioLoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {progressoLote
                        ? `Enviando ${progressoLote.feitos + 1} de ${progressoLote.total}…`
                        : `Enviar ao proprietário (${selecionadosParaEnviar.length})`}
                    </Button>
                  )}
                  {profile?.role === "admin" && donosParaLembrete.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => setConfirmarLembreteLote(true)}
                      disabled={lembreteLoteMutation.isPending}
                    >
                      {lembreteLoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlarmClock className="h-4 w-4" />}
                      {progressoLembrete
                        ? `Lembrete ${progressoLembrete.feitos + 1} de ${progressoLembrete.total}…`
                        : `Lembrete de atraso (${donosParaLembrete.length})`}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedIds(new Set())}>
                    <X className="h-4 w-4" />
                    Limpar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {abaAtiva === "vistorias" && (
          <VistoriasTable
            cleanerInspections={cleanerInspections}
            teamInspections={teamInspections}
            cleanerExpanded={vistoriasFaxineirasExpanded}
            teamExpanded={vistoriasEquipeExpanded}
            onToggleCleaner={() => setVistoriasFaxineirasExpanded(!vistoriasFaxineirasExpanded)}
            onToggleTeam={() => setVistoriasEquipeExpanded(!vistoriasEquipeExpanded)}
            onOpenAttachments={handleOpenInspectionAttachments}
            onGenerateSummary={handleGenerateSummary}
            onCreateMaintenance={handleCreateMaintenanceFromInspection}
            onEditInspection={handleEditInspection}
            generatingIds={generatingSummaryIds}
            selectedInspectionIds={selectedInspectionIds}
            onToggleInspectionSelection={handleToggleInspectionSelection}
            onArchiveInspections={handleArchiveInspections}
            archivingInspections={archivingInspections}
            onOpenSheet={(id) => openSheet(id, "vistoria")}
          />
        )}

        {abaAtiva === "debitos" && (
          <ReserveDebitsTable
            vazio={
              <Card className="rounded-xl border-border/70">
                <EmptyState
                  ilustracao="cobrancas"
                  title="Nenhum débito em reserva"
                  description="Cobranças marcadas para desconto na próxima reserva aparecem aqui."
                  className="py-8"
                />
              </Card>
            }
          />
        )}

        {/* Diálogos de lote (a barra de ações abre; ficam montados em qualquer aba) */}
        <LembreteLoteDialog
          open={confirmarLembreteLote}
          donos={donosParaLembrete}
          enviando={lembreteLoteMutation.isPending}
          onCancelar={() => setConfirmarLembreteLote(false)}
          onConfirmar={() => lembreteLoteMutation.mutate(donosParaLembrete.map((d) => d.owner))}
        />
        <EnvioLoteDialog
          open={confirmarEnvioLote}
          itens={selecionadosParaEnviar}
          enviando={envioLoteMutation.isPending}
          progresso={progressoLote}
          onCancelar={() => setConfirmarEnvioLote(false)}
          onConfirmar={() => envioLoteMutation.mutate(selecionadosParaEnviar)}
        />

        {/* Hidden file input for uploads */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
          accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
        />

        {/* Chat Dialog */}
        <MaintenanceChatDialog
          open={chatDialogOpen}
          onOpenChange={handleCloseChat}
          ticketId={selectedItem?.id || ""}
          ticketSubject={selectedItem?.subject || ""}
          propertyName={selectedItem?.property?.name}
        />

        {/* Media Gallery */}
        <MediaGallery
          items={galleryItems}
          initialIndex={galleryInitialIndex}
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          onDelete={galleryAttachmentTable ? async (item) => {
            const ok = await deleteAttachmentRow(galleryAttachmentTable, item.id);
            if (ok) {
              setGalleryItems((prev) => prev.filter((i) => i.id !== item.id));
              queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
              queryClient.invalidateQueries({ queryKey: ["inspections-for-list"] });
            }
          } : undefined}
        />

        {/* Create Maintenance from Inspection Dialog */}
        {selectedInspection && (
          <CreateMaintenanceFromInspectionDialog
            open={maintenanceDialogOpen}
            onOpenChange={setMaintenanceDialogOpen}
            propertyId={selectedInspection.property?.id || ""}
            propertyName={selectedInspection.property?.name}
            ownerId={selectedInspection.property?.owner_id || ""}
            inspectionId={selectedInspection.id}
            attachments={selectedInspection.attachments}
            transcriptSummary={selectedInspection.transcript_summary || undefined}
            prefilledDescription={selectedInspection.transcript_summary || selectedInspection.transcript || undefined}
          />
        )}

        {/* Edit Inspection Dialog */}
        {inspectionToEdit && (
          <EditInspectionDialog
            open={editInspectionDialogOpen}
            onOpenChange={setEditInspectionDialogOpen}
            inspection={{
              id: inspectionToEdit.id,
              property_id: inspectionToEdit.property?.id || "",
              notes: inspectionToEdit.notes || undefined,
              transcript: inspectionToEdit.transcript || undefined,
              transcript_summary: inspectionToEdit.transcript_summary || undefined,
              audio_url: inspectionToEdit.audio_url || undefined,
              internal_only: (inspectionToEdit as any).internal_only ?? true,
            }}
            existingAttachments={inspectionToEdit.attachments}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["inspections-for-list"] });
            }}
          />
        )}

        {/* Edit Maintenance / Charge Dialog */}
        <EditMaintenanceDialog
          open={editMaintenanceDialog.open}
          onOpenChange={(open) => setEditMaintenanceDialog((prev) => ({ ...prev, open }))}
          editId={editMaintenanceDialog.id}
          type={editMaintenanceDialog.type}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
            queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
          }}
        />

        {/* Delete Confirmation Dialog */}
        <ConfirmationDialog
          open={deleteDialog.open}
          onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
          title={deleteDialog.isCharge ? "Excluir cobrança?" : "Excluir manutenção?"}
          description={
            <>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-foreground">
                Essa ação não pode ser desfeita. {deleteDialog.isCharge ? "A cobrança" : "A manutenção"} e todos os dados relacionados (mensagens, anexos, histórico) serão removidos permanentemente.
              </div>
              {deleteDialog.item && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">{deleteDialog.item.subject}</p>
                  {deleteDialog.item.property?.name && (
                    <p className="text-xs text-muted-foreground mt-1">{deleteDialog.item.property.name}</p>
                  )}
                </div>
              )}
            </>
          }
          confirmLabel="Excluir permanentemente"
          variant="destructive"
          requireTypedConfirmation="EXCLUIR"
          loading={deleting}
          onConfirm={async () => {
            if (!deleteDialog.item) return;
            setDeleting(true);
            try {
              const table = deleteDialog.isCharge ? "charges" : "tickets";
              const { error } = await supabase.from(table).delete().eq("id", deleteDialog.item.id);
              if (error) throw error;
              toast.success(deleteDialog.isCharge ? "Cobrança excluída" : "Manutenção excluída");
              setDeleteDialog({ open: false, item: null, isCharge: false });
              queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
              queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
            } catch (err: any) {
              console.error(err);
              toast.error("Erro ao excluir", { description: err.message });
            } finally {
              setDeleting(false);
            }
          }}
        />

        {dialogosDebate}

        {/* Detail Sheet (preview lateral) */}
        <DetailSheet
          open={detailSheetOpen}
          onClose={closeSheet}
          entityId={detailEntityId}
          entityType={detailEntityType}
        />
      </main>
    </div>
  );
}
