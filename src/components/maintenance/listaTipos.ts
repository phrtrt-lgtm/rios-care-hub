import type { Tom } from "@/components/painel/tons";
import type { DonoWhatsapp } from "@/components/maintenance/WhatsappAcaoLinha";

/**
 * Tipos e constantes da lista de manutenções (/admin/manutencoes-lista),
 * compartilhados entre a página, as linhas de grupo, a célula editável, os
 * diálogos de lote e a versão de celular.
 */
export type TicketStatus = "novo" | "em_analise" | "aguardando_info" | "em_execucao" | "concluido" | "cancelado";

export type ListStatus = "em_progresso" | "feito" | "enviar_proprietario";

export type SortDirection = "asc" | "desc" | null;
export type SortField = "subject" | "property" | "amount_cents" | "management_contribution_cents" | "created_at" | "service_type" | "list_status";

export interface MaintenanceItem {
  id: string;
  subject: string;
  status: TicketStatus;
  scheduled_at: string | null;
  created_at: string;
  property: { id: string; name: string } | null;
  owner: DonoWhatsapp | null;
  /** Só cobrança: resultado do último WhatsApp (charges.whatsapp_*). */
  whatsapp_status?: string | null;
  whatsapp_enviado_em?: string | null;
  /** Só cobrança vencida: último lembrete de atraso (charges.whatsapp_lembrete_*). */
  whatsapp_lembrete_status?: string | null;
  whatsapp_lembrete_enviado_em?: string | null;
  whatsapp_lembretes_enviados?: number | null;
  // Custom fields for list view
  amount_cents?: number;
  management_contribution_cents?: number;
  service_type?: string;
  list_status?: ListStatus;
  attachments_count?: number;
  itemType?: "ticket" | "charge";
  cost_responsible?: string | null;
  /** Stand-by na lista (tickets.on_hold). Só manutenção; cobrança não tem. */
  on_hold?: boolean;
  /** Diferente de "manutencao" quando está em debate com o proprietário. */
  ticket_type?: string;
}

// ===== CONSTANTS =====
export const SERVICE_LABELS = [
  { value: "refrigeracao", label: "Refrigeração", color: "bg-info" },
  { value: "eletrica", label: "Elétrica", color: "bg-warning" },
  { value: "hidraulica", label: "Hidráulica", color: "bg-info" },
  { value: "marcenaria", label: "Marcenaria", color: "bg-warning" },
  { value: "estrutural", label: "Estrutural", color: "bg-secondary" },
  { value: "itens", label: "Itens", color: "bg-primary" },
  { value: "vidracaria", label: "Vidraçaria", color: "bg-info" },
  { value: "dedetizacao", label: "Dedetização", color: "bg-success" },
  { value: "servico_misto", label: "Serviço Misto", color: "bg-primary" },
  // Também define o quadro "Infiltração" da lista — ver src/lib/maintenanceBoard.ts
  { value: "infiltracao", label: "Infiltração", color: "bg-info" },
  // Support legacy values stored as labels
  { value: "Refrigeração", label: "Refrigeração", color: "bg-info" },
  { value: "Elétrica", label: "Elétrica", color: "bg-warning" },
  { value: "Hidráulica", label: "Hidráulica", color: "bg-info" },
  { value: "Marcenaria", label: "Marcenaria", color: "bg-warning" },
  { value: "Estrutural", label: "Estrutural", color: "bg-secondary" },
  { value: "Itens", label: "Itens", color: "bg-primary" },
  { value: "Vidraçaria", label: "Vidraçaria", color: "bg-info" },
  { value: "Dedetização", label: "Dedetização", color: "bg-success" },
  { value: "Serviço Misto", label: "Serviço Misto", color: "bg-primary" },
];

export const LIST_STATUSES = [
  { value: "em_progresso", label: "Em Progresso", color: "bg-warning" },
  { value: "feito", label: "Feito", color: "bg-success" },
  { value: "enviar_proprietario", label: "Enviar ao Proprietário", color: "bg-primary" },
];

// Cost responsible options shown in the list. 'pending' means the team hasn't
// decided yet — owner does not see the maintenance and no notification is sent.
// Selecting any other value triggers the "ticket created" notification flow.
export const COST_RESPONSIBLE_OPTIONS = [
  { value: "pending", label: "Em espera", color: "bg-muted-foreground" },
  { value: "owner", label: "Proprietário", color: "bg-primary" },
  { value: "pm", label: "Gestão", color: "bg-info" },
  { value: "guest", label: "Hóspede", color: "bg-warning" },
];

// Ordem dos quadros na tela. Infiltração e Stand-by são derivados de dois
// campos do ticket (label `infiltracao` e `on_hold`) — ver src/lib/maintenanceBoard.ts.
export interface GrupoLista {
  id: "em_progresso" | "infiltracao" | "stand_by" | "em_debate" | "concluidas" | "cobrancas_vencidas" | "cobrancas";
  label: string;
  /** Borda esquerda (celular). */
  color: string;
  /** Ponto colorido do cabeçalho do grupo. */
  ponto: string;
  tom: Tom;
  /** Grupos de cobrança: os itens vêm de `charges`, não de `tickets`. */
  cobranca: boolean;
}

export const GROUPS: GrupoLista[] = [
  { id: "em_progresso", label: "Em progresso", color: "border-l-warning", ponto: "bg-warning", tom: "warning", cobranca: false },
  { id: "infiltracao", label: "Infiltração", color: "border-l-info", ponto: "bg-info", tom: "info", cobranca: false },
  { id: "stand_by", label: "Stand-by", color: "border-l-muted-foreground", ponto: "bg-muted-foreground/60", tom: "neutral", cobranca: false },
  // Manutenção aberta como chamado para o proprietário opinar (ticket_type
  // deixa de ser "manutencao"; kind continua "maintenance"). Volta pelo botão.
  { id: "em_debate", label: "Em debate com o proprietário", color: "border-l-secondary", ponto: "bg-secondary", tom: "secondary", cobranca: false },
  { id: "concluidas", label: "Aguardando envio ao proprietário", color: "border-l-success", ponto: "bg-success", tom: "success", cobranca: false },
  { id: "cobrancas_vencidas", label: "Cobranças vencidas", color: "border-l-destructive", ponto: "bg-destructive", tom: "destructive", cobranca: true },
  { id: "cobrancas", label: "Cobranças pendentes", color: "border-l-primary", ponto: "bg-primary", tom: "primary", cobranca: true },
];

export type GrupoId = GrupoLista["id"];

// As opções dos seletores (status, responsável, etiqueta e BOARD_OPTIONS de
// src/lib/maintenanceBoard.ts) trazem a cor como classe; a etiqueta sólida
// precisa do tom, que já carrega o texto na cor de contraste certa.
export const TOM_POR_COR: Record<string, Tom> = {
  "bg-warning": "warning",
  "bg-success": "success",
  "bg-primary": "primary",
  "bg-info": "info",
  "bg-secondary": "secondary",
  "bg-destructive": "destructive",
  "bg-muted-foreground": "neutral",
};
export const tomDaCor = (cor?: string): Tom => TOM_POR_COR[cor ?? ""] ?? "neutral";

export interface InspectionItem {
  id: string;
  property: { id: string; name: string; owner_id: string } | null;
  owner_name: string | null;
  created_at: string;
  cleaner_name: string | null;
  notes: string | null;
  transcript: string | null;
  transcript_summary: string | null;
  audio_url: string | null;
  internal_only: boolean;
  is_routine: boolean;
  is_team_inspection: boolean;
  attachments: Array<{ id: string; file_url: string; file_name?: string; file_type?: string }>;
}

/** Pausa entre um envio e outro no lote (e-mail + WhatsApp por item). */
export const INTERVALO_ENVIO_LOTE_MS = 5000;
