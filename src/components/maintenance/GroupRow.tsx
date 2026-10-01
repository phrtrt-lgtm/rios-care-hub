import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, MessageSquare, MessagesSquare, Paperclip, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BotaoLinha, SeloContagem } from "@/components/painel/CaixaOperacao";
import { WhatsappAcaoLinha } from "@/components/maintenance/WhatsappAcaoLinha";
import { EditableCell } from "@/components/maintenance/EditableCell";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { valorDevido } from "@/lib/cobrancaMeta";
import { getRowHandlers } from "@/lib/row-interaction";
import { BOARD_OPTIONS, deriveBoard, hasInfiltracao } from "@/lib/maintenanceBoard";
import {
  COST_RESPONSIBLE_OPTIONS,
  LIST_STATUSES,
  SERVICE_LABELS,
  type GrupoLista,
  type MaintenanceItem,
  type SortDirection,
  type SortField,
} from "./listaTipos";

// ===== GROUP ROW COMPONENT =====
interface GroupRowProps {
  group: GrupoLista;
  items: MaintenanceItem[];
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateItem: (id: string, field: string, value: any, isCharge?: boolean) => void;
  onOpenChat: (item: MaintenanceItem) => void;
  unreadCounts: Record<string, number>;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  /** Marca/desmarca todos os itens do grupo de uma vez. */
  onToggleGroupSelection: (ids: string[], selecionar: boolean) => void;
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onOpenAttachments: (item: MaintenanceItem) => void;
  onUploadAttachment: (item: MaintenanceItem) => void;
  uploadingItemId: string | null;
  onOpenSheet?: (id: string) => void;
  onEdit: (item: MaintenanceItem, isCharge: boolean) => void;
  onDelete: (item: MaintenanceItem, isCharge: boolean) => void;
  /** Abre a manutenção como chamado para o proprietário (quadros abertos). */
  onDebater?: (item: MaintenanceItem) => void;
  /** Devolve à lista de manutenções um item em debate. */
  onVoltarManutencao?: (item: MaintenanceItem) => void;
}

export function GroupRow({ 
  group, 
  items, 
  isExpanded, 
  onToggle, 
  onUpdateItem, 
  onOpenChat, 
  unreadCounts,
  selectedIds,
  onToggleSelection,
  onToggleGroupSelection,
  sortField,
  sortDirection,
  onSort,
  onOpenAttachments,
  onUploadAttachment,
  uploadingItemId,
  onOpenSheet,
  onEdit,
  onDelete,
  onDebater,
  onVoltarManutencao,
}: GroupRowProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // O switch de WhatsApp vale para o proprietário inteiro: recarrega as duas listas.
  const recarregarWhatsapp = () => {
    queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
    queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
  };
  // Sort items within the group
  const sortedItems = useMemo(() => {
    if (!sortField || !sortDirection) return items;
    
    return [...items].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case "subject":
          aValue = a.subject.toLowerCase();
          bValue = b.subject.toLowerCase();
          break;
        case "property":
          aValue = (a.property?.name || "").toLowerCase();
          bValue = (b.property?.name || "").toLowerCase();
          break;
        case "amount_cents":
          aValue = a.amount_cents || 0;
          bValue = b.amount_cents || 0;
          break;
        case "management_contribution_cents":
          aValue = a.management_contribution_cents || 0;
          bValue = b.management_contribution_cents || 0;
          break;
        case "created_at":
          aValue = a.created_at || "";
          bValue = b.created_at || "";
          break;
        case "service_type":
          aValue = (a.service_type || "").toLowerCase();
          bValue = (b.service_type || "").toLowerCase();
          break;
        case "list_status":
          aValue = (a.list_status || "").toLowerCase();
          bValue = (b.list_status || "").toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [items, sortField, sortDirection]);

  // Soma do que o proprietário paga (total − aporte); nas cobranças é o que
  // falta receber, nas manutenções abertas é o valor previsto.
  const totalGrupo = useMemo(() => items.reduce((soma, i) => soma + valorDevido(i), 0), [items]);

  return (
    <>
      {/* Cabeçalho do grupo: ponto colorido, contagem e total. O conteúdo é
          sticky para continuar visível quando a tabela rola na horizontal. */}
      <tr className="cursor-pointer bg-muted/40 transition-colors hover:bg-muted/70" onClick={onToggle}>
        <td colSpan={13} className="p-0">
          <div className="sticky left-0 flex w-max max-w-[calc(100vw-3rem)] items-center gap-2 px-2 py-1.5">
            {items.length > 0 && (
              <span className="flex items-center pr-0.5" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={
                    items.every((i) => selectedIds.has(i.id))
                      ? true
                      : items.some((i) => selectedIds.has(i.id))
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(v) => onToggleGroupSelection(items.map((i) => i.id), v === true)}
                  aria-label={`Selecionar todos de ${group.label}`}
                />
              </span>
            )}
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={cn("h-2 w-2 shrink-0 rounded-full", group.ponto)} aria-hidden="true" />
            <span className="text-[13px] font-semibold">{group.label}</span>
            <SeloContagem tom={items.length > 0 ? group.tom : "neutral"}>{items.length}</SeloContagem>
            {totalGrupo > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatBRL(totalGrupo)} {group.cobranca ? "a receber" : "previsto"}
              </span>
            )}
          </div>
        </td>
      </tr>

      {/* Group Items */}
      {isExpanded && sortedItems.map((item) => {
        const unread = unreadCounts[item.id] || 0;
        const isCharge = group.cobranca;
        // Célula fixa precisa de fundo opaco para cobrir o que rola por baixo.
        const fundoFixo = selectedIds.has(item.id) ? "bg-accent" : "bg-card group-hover:bg-muted/40";
        return (
          <tr
            key={item.id}
            className={cn(
              "group h-10 border-b border-border/60 transition-colors hover:bg-muted/40",
              selectedIds.has(item.id) && "bg-accent",
              onOpenSheet && "cursor-pointer"
            )}
            {...(onOpenSheet
              ? (() => {
                  const route = isCharge ? `/cobranca/${item.id}` : `/manutencao/${item.id}`;
                  return getRowHandlers(route, () => onOpenSheet!(item.id));
                })()
              : {})}
          >
            {/* Checkbox (coluna fixa na rolagem horizontal) */}
            <td className={cn("sticky left-0 z-[1] w-[36px] p-0", fundoFixo)} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center px-1 py-2">
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => onToggleSelection(item.id)}
                />
              </div>
            </td>

            {/* Nome da manutenção (coluna fixa) — abre o painel lateral */}
            <td className={cn("sticky left-[36px] z-[1] w-[240px] max-w-[240px] p-0", fundoFixo)}>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="truncate px-2 py-2 text-left text-[13px] font-medium transition-colors hover:text-primary">
                      {item.subject}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm">
                    <p>{item.subject}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </td>

            {/* Conversa da manutenção. Cobrança não tem chat de ticket: fica um traço. */}
            <td className="p-0 w-[40px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center px-1 py-1">
                {isCharge ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <BotaoLinha
                    rotulo="Abrir conversa"
                    naoLidas={unread}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenChat(item);
                    }}
                  >
                    <MessageSquare />
                  </BotaoLinha>
                )}
              </div>
            </td>

            {/* Imóvel */}
            <td className="p-0 w-[150px] max-w-[150px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {item.property && item.owner?.id ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/relatorios-manutencoes/${item.owner!.id}?propertyId=${item.property!.id}`);
                        }}
                        className="w-full truncate px-2 py-2 text-left text-[13px] text-primary hover:underline"
                        title="Abrir relatório deste imóvel"
                      >
                        {item.property.name}
                      </button>
                    ) : (
                      <div className="truncate px-2 py-2 text-left text-[13px] text-muted-foreground">
                        {item.property?.name || "—"}
                      </div>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{item.property?.name || "—"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </td>

            {/* Valor */}
            <td className="p-0 w-[92px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              <EditableCell
                value={item.amount_cents || null}
                type="currency"
                placeholder="R$ 0,00"
                onSave={(val) => onUpdateItem(item.id, "amount_cents", val, isCharge)}
                className="justify-center font-medium"
              />
            </td>

            {/* Aporte Gestão */}
            <td className="p-0 w-[92px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              <EditableCell
                value={item.management_contribution_cents || null}
                type="currency"
                placeholder="R$ 0,00"
                onSave={(val) => onUpdateItem(item.id, "management_contribution_cents", val, isCharge)}
                className="justify-center text-success"
              />
            </td>

            {/* Data (criação) */}
            <td className="p-0 w-[64px]">
              <div className="px-1 py-2 text-center text-xs tabular-nums text-muted-foreground">
                {item.created_at ? format(new Date(item.created_at), "dd MMM", { locale: ptBR }) : "—"}
              </div>
            </td>

            {/* Anexos */}
            <td className="p-0 w-[72px]">
              <div className="flex items-center justify-center gap-0.5 px-1 py-2">
                <button
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-1 rounded text-sm transition-colors",
                    item.attachments_count && item.attachments_count > 0
                      ? "hover:bg-primary/10 cursor-pointer text-primary"
                      : "text-muted-foreground"
                  )}
                  type="button"
                  aria-label="Ver anexos"
                  title="Ver anexos"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.attachments_count && item.attachments_count > 0) {
                      onOpenAttachments(item);
                    }
                  }}
                  disabled={!item.attachments_count || item.attachments_count === 0}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>{item.attachments_count || 0}</span>
                </button>
                <button
                  type="button"
                  aria-label="Adicionar anexo"
                  title="Adicionar anexo"
                  className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUploadAttachment(item);
                  }}
                  disabled={uploadingItemId === item.id}
                >
                  {uploadingItemId === item.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </td>

            {/* Responsável pelo custo */}
            <td className="p-0 w-[112px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              {isCharge ? (
                <div className="px-1 py-2 text-sm text-center text-muted-foreground">
                  {COST_RESPONSIBLE_OPTIONS.find(o => o.value === item.cost_responsible)?.label || "—"}
                </div>
              ) : (
                <EditableCell
                  value={item.cost_responsible || "pending"}
                  type="select"
                  options={COST_RESPONSIBLE_OPTIONS}
                  onSave={(val) => onUpdateItem(item.id, "cost_responsible", val, false)}
                  className="justify-center"
                />
              )}
            </td>

            <td className="p-0 w-[112px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              <EditableCell
                value={item.service_type || null}
                type="multi-select"
                options={SERVICE_LABELS}
                placeholder="Selecionar"
                onSave={(val) => onUpdateItem(item.id, "service_type", val, isCharge)}
                className="justify-center"
              />
            </td>

            {/* Quadro: Em Progresso / Stand-by / Infiltração — só manutenção aberta */}
            <td className="p-0 w-[112px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              {isCharge || item.status === "concluido" || group.id === "em_debate" ? (
                <div className="px-1 py-2 text-sm text-center text-muted-foreground">—</div>
              ) : (
                <div className="flex items-center justify-center gap-1">
                  <EditableCell
                    value={deriveBoard(item)}
                    type="select"
                    options={BOARD_OPTIONS}
                    onSave={(val) => onUpdateItem(item.id, "board", val, false)}
                    className="justify-center"
                  />
                  {item.on_hold && hasInfiltracao(item.service_type) && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0" title="Infiltração em stand-by">
                      Stand-by
                    </Badge>
                  )}
                </div>
              )}
            </td>

            {/* Status */}
            <td className="p-0 w-[124px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              {isCharge ? (
                <div className="px-1 py-2 text-sm text-center text-muted-foreground">
                  {item.list_status === "feito" ? "Pago" : "Pendente"}
                </div>
              ) : (
                <EditableCell
                  value={item.list_status || "em_progresso"}
                  type="select"
                  options={LIST_STATUSES}
                  onSave={(val) => onUpdateItem(item.id, "list_status", val, false)}
                  className="justify-center"
                />
              )}
            </td>

            {/* WhatsApp / Editar / Excluir */}
            <td className="p-0 w-[128px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end gap-1 px-1 py-2">
                {onDebater && ["em_progresso", "infiltracao", "stand_by"].includes(group.id) && (
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-secondary/10 text-muted-foreground hover:text-secondary transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDebater(item);
                    }}
                    title="Debater com o proprietário"
                    aria-label="Debater com o proprietário"
                  >
                    <MessagesSquare className="h-3.5 w-3.5" />
                  </button>
                )}
                {onVoltarManutencao && group.id === "em_debate" && (
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-success/10 text-muted-foreground hover:text-success transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVoltarManutencao(item);
                    }}
                    title="Voltar para manutenção"
                    aria-label="Voltar para manutenção"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {group.id === "concluidas" && (
                  <WhatsappAcaoLinha modo="switch" owner={item.owner} onAtualizado={recarregarWhatsapp} />
                )}
                {isCharge && group.id === "cobrancas_vencidas" && (
                  <WhatsappAcaoLinha
                    modo="atraso"
                    owner={item.owner}
                    whatsappStatus={item.whatsapp_lembrete_status}
                    whatsappEnviadoEm={item.whatsapp_lembrete_enviado_em}
                    lembretesEnviados={item.whatsapp_lembretes_enviados}
                    onAtualizado={recarregarWhatsapp}
                  />
                )}
                {isCharge && group.id !== "cobrancas_vencidas" && (
                  <WhatsappAcaoLinha
                    modo="reenviar"
                    owner={item.owner}
                    cobrancaId={item.id}
                    whatsappStatus={item.whatsapp_status}
                    whatsappEnviadoEm={item.whatsapp_enviado_em}
                    onAtualizado={recarregarWhatsapp}
                  />
                )}
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(item, isCharge);
                  }}
                  title="Editar"
                  aria-label="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item, isCharge);
                  }}
                  title="Excluir"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
