import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronDown,
  ChevronRight,
  Paperclip,
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  Wrench,
  Search,
  ArrowLeft,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { QuickAttachUploader } from "@/components/maintenance/QuickAttachUploader";

export interface MobileMaintenanceItem {
  id: string;
  subject: string;
  property: { id: string; name: string } | null;
  created_at: string;
  amount_cents?: number;
  management_contribution_cents?: number;
  service_type?: string;
  list_status?: string;
  attachments_count?: number;
  itemType?: "ticket" | "charge";
}

interface MobileGroupConfig {
  id: string;
  label: string;
  /** Tailwind border-l color class (e.g. "border-l-amber-500") */
  borderColor: string;
  /** Tailwind dot color (e.g. "bg-amber-500") */
  dotColor: string;
}

const LIST_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  em_progresso: { label: "Em Progresso", color: "bg-warning" },
  feito: { label: "Feito", color: "bg-success" },
  enviar_proprietario: { label: "Enviar ao Proprietário", color: "bg-primary" },
};

interface Props {
  groups: MobileGroupConfig[];
  groupedItems: Record<string, MobileMaintenanceItem[]>;
  isLoading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  unreadCounts: Record<string, number>;
  onOpenDetail: (id: string, isCharge: boolean) => void;
  onOpenChat: (item: MobileMaintenanceItem, isCharge: boolean) => void;
  onOpenAttachments: (item: MobileMaintenanceItem, isCharge: boolean) => void;
  onEdit: (item: MobileMaintenanceItem, isCharge: boolean) => void;
  onDelete: (item: MobileMaintenanceItem, isCharge: boolean) => void;
  onAttachmentAdded?: () => void;
  onBack: () => void;
  onNew: () => void;
}

export function MobileMaintenanceList({
  groups,
  groupedItems,
  isLoading,
  search,
  onSearchChange,
  unreadCounts,
  onOpenDetail,
  onOpenChat,
  onOpenAttachments,
  onEdit,
  onDelete,
  onAttachmentAdded,
  onBack,
  onNew,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Por padrão: Em Progresso e Cobranças Vencidas abertos
    return {
      em_progresso: true,
      cobrancas_vencidas: true,
      concluidas: false,
      cobrancas: false,
    };
  });

  const totalItems = useMemo(
    () => Object.values(groupedItems).reduce((sum, arr) => sum + arr.length, 0),
    [groupedItems],
  );

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header fixo */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center gap-2 px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onBack}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold flex-1 truncate">
            Manutenções
          </h1>
          <Button size="sm" onClick={onNew} className="h-9">
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar manutenção, cobrança ou imóvel..."
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 px-3 py-3 space-y-3">
        {isLoading ? (
          <SectionSkeleton rows={5} />
        ) : totalItems === 0 ? (
          <EmptyState
            icon={<Wrench className="h-6 w-6" />}
            title="Nenhuma manutenção encontrada"
            description={
              search
                ? "Tente ajustar a busca."
                : "Crie a primeira manutenção ou cobrança."
            }
          />
        ) : (
          groups.map((group) => {
            const items = groupedItems[group.id] || [];
            const isOpen = expanded[group.id] ?? false;
            return (
              <div key={group.id} className="space-y-2">
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors border-l-4",
                    group.borderColor,
                  )}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span className="text-sm font-medium flex-1 text-left">
                    {group.label}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {items.length}
                  </Badge>
                </button>

                {isOpen && (
                  <div className="space-y-2">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        Nenhum item neste grupo.
                      </p>
                    ) : (
                      items.map((item) => {
                        const isCharge = item.itemType === "charge";
                        const unread = unreadCounts[item.id] || 0;
                        const status = item.list_status
                          ? LIST_STATUS_LABELS[item.list_status]
                          : null;
                        return (
                          <Card
                            key={item.id}
                            className={cn(
                              "p-3 cursor-pointer active:bg-muted/40 transition-colors border-l-4",
                              group.borderColor,
                            )}
                            onClick={() => onOpenDetail(item.id, isCharge)}
                          >
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm leading-tight line-clamp-2">
                                  {item.subject}
                                </p>
                                {item.property?.name && (
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {item.property.name}
                                  </p>
                                )}
                              </div>
                              {status && (
                                <Badge
                                  className={cn(
                                    "text-white text-[10px] shrink-0",
                                    status.color,
                                  )}
                                >
                                  {status.label}
                                </Badge>
                              )}
                            </div>

                            {/* Linha de metadados */}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              {item.created_at && (
                                <span>
                                  {format(
                                    new Date(item.created_at),
                                    "dd/MM/yy",
                                    { locale: ptBR },
                                  )}
                                </span>
                              )}
                              {typeof item.amount_cents === "number" &&
                                item.amount_cents > 0 && (
                                  <span className="font-medium text-foreground">
                                    {formatBRL(item.amount_cents)}
                                  </span>
                                )}
                              {item.service_type && (
                                <span className="truncate">
                                  {item.service_type.split(",")[0]}
                                </span>
                              )}
                            </div>

                            {/* Ações rápidas */}
                            <div
                              className="flex items-center justify-end gap-1 mt-2 -mb-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="relative h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted active:scale-95 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenAttachments(item, isCharge);
                                }}
                                aria-label="Anexos"
                              >
                                <Paperclip className="h-4 w-4 text-muted-foreground" />
                                {(item.attachments_count ?? 0) > 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center">
                                    {item.attachments_count}
                                  </span>
                                )}
                              </button>
                              <QuickAttachUploader
                                itemId={item.id}
                                isCharge={isCharge}
                                onSuccess={onAttachmentAdded}
                              />
                              <button
                                type="button"
                                className="relative h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted active:scale-95 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenChat(item, isCharge);
                                }}
                                aria-label="Chat"
                              >
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                {unread > 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold flex items-center justify-center">
                                    {unread > 9 ? "9+" : unread}
                                  </span>
                                )}
                              </button>
                              <button
                                type="button"
                                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-primary/10 hover:text-primary text-muted-foreground active:scale-95 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEdit(item, isCharge);
                                }}
                                aria-label="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-destructive/10 hover:text-destructive text-muted-foreground active:scale-95 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(item, isCharge);
                                }}
                                aria-label="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </Card>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
