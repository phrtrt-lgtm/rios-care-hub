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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Search, Plus, ChevronDown, ChevronRight, Paperclip, MessageSquare, ArrowUpDown, ArrowUp, ArrowDown, Archive, Loader2, FileAudio, Sparkles, Wrench, Play, Pause, BarChart3, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";
import { MediaGallery } from "@/components/MediaGallery";
import { uploadFileWithCompression, FileUploadProgress } from "@/lib/fileUpload";
import { CreateMaintenanceFromInspectionDialog } from "@/components/CreateMaintenanceFromInspectionDialog";
import EditInspectionDialog from "@/components/EditInspectionDialog";
import { EditMaintenanceDialog } from "@/components/EditMaintenanceDialog";
import { ReserveDebitsTable } from "@/components/ReserveDebitsTable";
import { Pencil } from "lucide-react";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import { DetailSheet } from "@/components/detail-sheet/DetailSheet";
import { getRowHandlers } from "@/lib/row-interaction";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
// ===== TYPES =====
type TicketStatus = "novo" | "em_analise" | "aguardando_info" | "em_execucao" | "concluido" | "cancelado";

type ListStatus = "em_progresso" | "feito" | "enviar_proprietario";

type SortDirection = "asc" | "desc" | null;
type SortField = "subject" | "property" | "amount_cents" | "management_contribution_cents" | "created_at" | "service_type" | "list_status";

interface MaintenanceItem {
  id: string;
  subject: string;
  status: TicketStatus;
  scheduled_at: string | null;
  created_at: string;
  property: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  // Custom fields for list view
  amount_cents?: number;
  management_contribution_cents?: number;
  service_type?: string;
  list_status?: ListStatus;
  attachments_count?: number;
  itemType?: "ticket" | "charge";
  cost_responsible?: string | null;
}

// ===== CONSTANTS =====
const SERVICE_LABELS = [
  { value: "refrigeracao", label: "Refrigeração", color: "bg-info" },
  { value: "eletrica", label: "Elétrica", color: "bg-warning" },
  { value: "hidraulica", label: "Hidráulica", color: "bg-info" },
  { value: "marcenaria", label: "Marcenaria", color: "bg-warning" },
  { value: "estrutural", label: "Estrutural", color: "bg-slate-600" },
  { value: "itens", label: "Itens", color: "bg-primary" },
  // Support legacy values stored as labels
  { value: "Refrigeração", label: "Refrigeração", color: "bg-info" },
  { value: "Elétrica", label: "Elétrica", color: "bg-warning" },
  { value: "Hidráulica", label: "Hidráulica", color: "bg-info" },
  { value: "Marcenaria", label: "Marcenaria", color: "bg-warning" },
  { value: "Estrutural", label: "Estrutural", color: "bg-slate-600" },
  { value: "Itens", label: "Itens", color: "bg-primary" },
];

const LIST_STATUSES = [
  { value: "em_progresso", label: "Em Progresso", color: "bg-warning" },
  { value: "feito", label: "Feito", color: "bg-success" },
  { value: "enviar_proprietario", label: "Enviar ao Proprietário", color: "bg-primary" },
];

// Cost responsible options shown in the list. 'pending' means the team hasn't
// decided yet — owner does not see the maintenance and no notification is sent.
// Selecting any other value triggers the "ticket created" notification flow.
const COST_RESPONSIBLE_OPTIONS = [
  { value: "pending", label: "Em espera", color: "bg-muted-foreground" },
  { value: "owner", label: "Proprietário", color: "bg-primary" },
  { value: "pm", label: "Gestão", color: "bg-info" },
  { value: "guest", label: "Hóspede", color: "bg-warning" },
];

const GROUPS = [
  { id: "em_progresso", label: "Em Progresso", color: "border-l-amber-500" },
  { id: "concluidas", label: "Manutenções Concluídas", color: "border-l-green-500" },
  { id: "cobrancas_vencidas", label: "Cobranças Vencidas", color: "border-l-red-600" },
  { id: "cobrancas", label: "Cobranças Pendentes", color: "border-l-destructive" },
];

// ===== SORTABLE HEADER COMPONENT =====
interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentSort: SortField | null;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
}

function SortableHeader({ label, field, currentSort, direction, onSort, className }: SortableHeaderProps) {
  const isActive = currentSort === field;

  // Detect text alignment from className to align the inner flex accordingly.
  const justify = className?.includes("text-right")
    ? "justify-end"
    : className?.includes("text-left")
    ? "justify-start"
    : "justify-center";

  return (
    <th
      className={cn("px-1 py-2 font-medium cursor-pointer hover:bg-muted/50 transition-colors select-none", className)}
      onClick={() => onSort(field)}
    >
      <div className={cn("flex items-center gap-1", justify)}>
        <span>{label}</span>
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 text-primary" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-50" />
        )}
      </div>
    </th>
  );
}

// ===== INLINE EDIT CELL COMPONENT =====
interface EditableCellProps {
  value: string | number | null;
  type: "text" | "currency" | "date" | "select" | "multi-select";
  options?: { value: string; label: string; color?: string }[];
  onSave: (newValue: string | number | null) => void;
  className?: string;
  placeholder?: string;
}

function EditableCell({ value, type, options, onSave, className, placeholder }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    setIsEditing(false);
    if (type === "currency") {
      const numValue = parseFloat(editValue.replace(/[^\d,.-]/g, "").replace(",", "."));
      if (!isNaN(numValue)) {
        onSave(Math.round(numValue * 100));
      }
    } else {
      onSave(editValue || null);
    }
  }, [editValue, type, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue(String(value ?? ""));
    }
  }, [handleSave, value]);

  if (type === "multi-select") {
    // Value stored as CSV string. Dedupe + filter empties.
    const selectedValues = String(value || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    // De-duplicate options by canonical value (lower-case) so legacy + new options don't repeat
    const uniqueOptions = options?.filter((opt, idx, arr) => {
      return arr.findIndex((o) => o.label === opt.label) === idx;
    }) || [];
    const selectedOptions = uniqueOptions.filter((o) =>
      selectedValues.some(
        (sv) => sv === o.value || sv.toLowerCase() === o.value.toLowerCase() || sv === o.label,
      ),
    );

    const toggleValue = (optValue: string) => {
      const exists = selectedValues.some(
        (sv) => sv === optValue || sv.toLowerCase() === optValue.toLowerCase(),
      );
      let next: string[];
      if (exists) {
        next = selectedValues.filter(
          (sv) => sv !== optValue && sv.toLowerCase() !== optValue.toLowerCase(),
        );
      } else {
        next = [...selectedValues, optValue];
      }
      onSave(next.length > 0 ? next.join(",") : null);
    };

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-8 w-full flex items-center gap-1 px-2 rounded hover:bg-muted/50 transition-colors text-sm overflow-hidden",
              className,
            )}
            data-no-sheet
          >
            {selectedOptions.length > 0 ? (
              <div className="flex items-center gap-1 flex-wrap">
                {selectedOptions.slice(0, 2).map((opt) => (
                  <Badge key={opt.value} className={cn("text-white text-[10px] px-1.5 py-0", opt.color)}>
                    {opt.label}
                  </Badge>
                ))}
                {selectedOptions.length > 2 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    +{selectedOptions.length - 2}
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">{placeholder || "—"}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start" data-no-sheet>
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
            {uniqueOptions.map((opt) => {
              const isSelected = selectedOptions.some((s) => s.label === opt.label);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleValue(opt.value)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-left"
                >
                  <Checkbox checked={isSelected} className="pointer-events-none" />
                  <Badge className={cn("text-white text-xs", opt.color)}>{opt.label}</Badge>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  if (type === "select") {
    const selectedOption = options?.find(o => o.value === value);
    return (
      <Select 
        value={String(value || "")} 
        onValueChange={(v) => onSave(v)}
      >
        <SelectTrigger className={cn("h-8 border-0 bg-transparent hover:bg-muted/50 transition-colors", className)} data-no-sheet>
          {selectedOption ? (
            <Badge className={cn("text-white text-xs", selectedOption.color)}>
              {selectedOption.label}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">{placeholder || "—"}</span>
          )}
        </SelectTrigger>
        <SelectContent data-no-sheet>
          {options?.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              <Badge className={cn("text-white text-xs", opt.color)}>{opt.label}</Badge>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1" data-no-sheet>
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          type={type === "date" ? "date" : "text"}
          className="h-8 text-sm w-full"
        />
      </div>
    );
  }

  let displayValue = value;
  if (type === "currency" && typeof value === "number") {
    displayValue = formatBRL(value);
  } else if (type === "date" && value) {
    displayValue = format(new Date(String(value)), "dd/MM/yyyy", { locale: ptBR });
  }

  return (
    <div
      data-no-sheet
      onClick={(e) => {
        e.stopPropagation();
        setEditValue(type === "currency" && typeof value === "number" 
          ? (value / 100).toFixed(2).replace(".", ",")
          : String(value ?? "")
        );
        setIsEditing(true);
      }}
      className={cn(
        "h-8 flex items-center px-2 rounded cursor-pointer hover:bg-muted/50 transition-colors text-sm",
        !displayValue && "text-muted-foreground",
        className
      )}
    >
      {displayValue || placeholder || "—"}
    </div>
  );
}

// ===== GROUP ROW COMPONENT =====
interface GroupRowProps {
  group: typeof GROUPS[0];
  items: MaintenanceItem[];
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateItem: (id: string, field: string, value: any, isCharge?: boolean) => void;
  onOpenChat: (item: MaintenanceItem) => void;
  unreadCounts: Record<string, number>;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onOpenAttachments: (item: MaintenanceItem) => void;
  onUploadAttachment: (item: MaintenanceItem) => void;
  uploadingItemId: string | null;
  onOpenSheet?: (id: string) => void;
  onEdit: (item: MaintenanceItem, isCharge: boolean) => void;
}

function GroupRow({ 
  group, 
  items, 
  isExpanded, 
  onToggle, 
  onUpdateItem, 
  onOpenChat, 
  unreadCounts,
  selectedIds,
  onToggleSelection,
  sortField,
  sortDirection,
  onSort,
  onOpenAttachments,
  onUploadAttachment,
  uploadingItemId,
  onOpenSheet,
  onEdit
}: GroupRowProps) {
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

  return (
    <>
      {/* Group Header */}
      <tr 
        className={cn(
          "bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border-l-4",
          group.color
        )}
        onClick={onToggle}
      >
        <td colSpan={11} className="p-2">
          <div className="flex items-center gap-2 font-medium">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span>{group.label}</span>
            <Badge variant="secondary" className="ml-2">{items.length}</Badge>
          </div>
        </td>
      </tr>

      {/* Group Items */}
      {isExpanded && sortedItems.map((item) => {
        const unread = unreadCounts[item.id] || 0;
        const isCharge = ["cobrancas_vencidas", "cobrancas"].includes(group.id);
        return (
          <tr 
            key={item.id}
            className={cn(
              "border-b hover:bg-muted/30 transition-colors group h-10",
              selectedIds.has(item.id) && "bg-primary/5",
              onOpenSheet && "cursor-pointer"
            )}
            {...(onOpenSheet
              ? (() => {
                  const route = isCharge ? `/cobranca/${item.id}` : `/manutencao/${item.id}`;
                  return getRowHandlers(route, () => onOpenSheet!(item.id));
                })()
              : {})}
          >
            {/* Checkbox */}
            <td className="p-0 w-[36px]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center px-1 py-2">
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => onToggleSelection(item.id)}
                />
              </div>
            </td>

            {/* Nome da Manutenção - Abre Chat */}
            <td className="p-0 w-[220px] max-w-[220px]">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="px-1 py-2 font-medium text-sm cursor-pointer hover:text-primary transition-colors truncate text-center"
                      onClick={() => onOpenChat(item)}
                    >
                      <span className="truncate">{item.subject}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm">
                    <p>{item.subject}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </td>

            {/* Chat / Mensagens não lidas */}
            <td className="p-0 w-[44px]">
              <div
                className="flex items-center justify-center px-1 py-2 cursor-pointer hover:bg-muted/50 rounded transition-colors"
                onClick={() => onOpenChat(item)}
              >
                <div className="relative">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  {unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </div>
              </div>
            </td>

            {/* Imóvel */}
            <td className="p-0 w-[140px] max-w-[140px]">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="px-1 py-2 text-sm text-muted-foreground truncate text-center">
                      {item.property?.name || "—"}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{item.property?.name || "—"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </td>

            {/* Valor */}
            <td className="p-0 w-[90px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              <EditableCell
                value={item.amount_cents || null}
                type="currency"
                placeholder="R$ 0,00"
                onSave={(val) => onUpdateItem(item.id, "amount_cents", val, isCharge)}
                className="justify-center font-medium"
              />
            </td>

            {/* Aporte Gestão */}
            <td className="p-0 w-[90px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              <EditableCell
                value={item.management_contribution_cents || null}
                type="currency"
                placeholder="R$ 0,00"
                onSave={(val) => onUpdateItem(item.id, "management_contribution_cents", val, isCharge)}
                className="justify-center text-success"
              />
            </td>

            {/* Data (criação) */}
            <td className="p-0 w-[80px]">
              <div className="px-1 py-2 text-sm text-center text-muted-foreground">
                {item.created_at ? format(new Date(item.created_at), "dd MMM", { locale: ptBR }) : "—"}
              </div>
            </td>

            {/* Anexos */}
            <td className="p-0 w-[70px]">
              <div className="flex items-center justify-center gap-0.5 px-1 py-2">
                <button
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-1 rounded text-sm transition-colors",
                    item.attachments_count && item.attachments_count > 0
                      ? "hover:bg-primary/10 cursor-pointer text-primary"
                      : "text-muted-foreground"
                  )}
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
            <td className="p-0 w-[120px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
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

            <td className="p-0 w-[120px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              <EditableCell
                value={item.service_type || null}
                type="multi-select"
                options={SERVICE_LABELS}
                placeholder="Selecionar"
                onSave={(val) => onUpdateItem(item.id, "service_type", val, isCharge)}
                className="justify-center"
              />
            </td>

            {/* Status */}
            <td className="p-0 w-[140px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
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

            {/* Editar */}
            <td className="p-0 w-[44px]" data-no-sheet onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center px-1 py-2">
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
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ===== INSPECTION TYPES =====
interface InspectionItem {
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

// ===== AUDIO PLAYER MINI COMPONENT =====
function AudioPlayerMini({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={togglePlay}
        className="p-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
      >
        {isPlaying ? (
          <Pause className="h-3 w-3 text-primary" />
        ) : (
          <Play className="h-3 w-3 text-primary" />
        )}
      </button>
      <audio
        ref={audioRef}
        src={url}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
    </div>
  );
}

// ===== VISTORIAS SORT =====
type InspectionSortField = "property" | "created_at" | "cleaner_name" | "status";

// ===== VISTORIAS TABLE COMPONENT =====
interface VistoriasTableProps {
  cleanerInspections: InspectionItem[];
  teamInspections: InspectionItem[];
  cleanerExpanded: boolean;
  teamExpanded: boolean;
  onToggleCleaner: () => void;
  onToggleTeam: () => void;
  onOpenAttachments: (inspection: InspectionItem) => void;
  onGenerateSummary: (inspection: InspectionItem) => void;
  onCreateMaintenance: (inspection: InspectionItem) => void;
  onEditInspection: (inspection: InspectionItem) => void;
  generatingIds: Set<string>;
  selectedInspectionIds: Set<string>;
  onToggleInspectionSelection: (id: string, shiftKey: boolean) => void;
  onArchiveInspections: () => void;
  archivingInspections: boolean;
  onOpenSheet: (id: string) => void;
}

function VistoriasTable({
  cleanerInspections,
  teamInspections,
  cleanerExpanded,
  teamExpanded,
  onToggleCleaner,
  onToggleTeam,
  onOpenAttachments,
  onGenerateSummary,
  onCreateMaintenance,
  onEditInspection,
  generatingIds,
  selectedInspectionIds,
  onToggleInspectionSelection,
  onArchiveInspections,
  archivingInspections,
  onOpenSheet,
}: VistoriasTableProps) {
  const [sortField, setSortField] = useState<InspectionSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = useCallback((field: InspectionSortField) => {
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

  const sortInspections = useCallback((items: InspectionItem[]) => {
    if (!sortField || !sortDirection) return items;
    
    return [...items].sort((a, b) => {
      let aValue: string;
      let bValue: string;

      switch (sortField) {
        case "property":
          aValue = (a.property?.name || "").toLowerCase();
          bValue = (b.property?.name || "").toLowerCase();
          break;
        case "created_at":
          aValue = a.created_at;
          bValue = b.created_at;
          break;
        case "cleaner_name":
          aValue = (a.cleaner_name || "").toLowerCase();
          bValue = (b.cleaner_name || "").toLowerCase();
          break;
        case "status":
          const aHasProblems = a.notes?.toLowerCase().includes('não') || 
                               a.transcript_summary?.toLowerCase().includes('problema');
          const bHasProblems = b.notes?.toLowerCase().includes('não') || 
                               b.transcript_summary?.toLowerCase().includes('problema');
          aValue = aHasProblems ? "nao" : "ok";
          bValue = bHasProblems ? "nao" : "ok";
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [sortField, sortDirection]);

  const sortedCleanerInspections = useMemo(() => sortInspections(cleanerInspections), [cleanerInspections, sortInspections]);
  const sortedTeamInspections = useMemo(() => sortInspections(teamInspections), [teamInspections, sortInspections]);

  const renderSortableHeader = (label: string, field: InspectionSortField, className?: string) => {
    const isActive = sortField === field;
    return (
      <th 
        className={cn("px-2 py-2 font-medium cursor-pointer hover:bg-muted/50 transition-colors select-none", className)}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1">
          <span>{label}</span>
          {isActive ? (
            sortDirection === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5 text-primary" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5 text-primary" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-50" />
          )}
        </div>
      </th>
    );
  };

  const renderInspectionRow = (inspection: InspectionItem, showCleanerColumn: boolean) => {
    const hasProblems = inspection.notes?.toLowerCase().includes('não') ||
                        inspection.transcript_summary?.toLowerCase().includes('problema') ||
                        (inspection.transcript && inspection.transcript.length > 0 && !inspection.transcript_summary?.toLowerCase().includes('sem problema'));
    const isSelected = selectedInspectionIds.has(inspection.id);
    
    return (
      <tr 
        key={inspection.id}
        className={cn(
          "border-b hover:bg-muted/30 transition-colors h-12 cursor-pointer",
          isSelected && "bg-primary/5"
        )}
        {...getRowHandlers(`/admin/vistoria/${inspection.id}`, () => onOpenSheet(inspection.id))}
      >
        {/* Checkbox */}
        <td 
          className="p-0 w-[40px] cursor-pointer" 
          onClick={(e) => {
            e.stopPropagation();
            onToggleInspectionSelection(inspection.id, e.shiftKey);
          }}
        >
          <div className="flex items-center justify-center px-2 py-2">
            <Checkbox
              checked={isSelected}
              className="pointer-events-none"
            />
          </div>
        </td>

        {/* Imóvel */}
        <td className="p-0 max-w-[150px]">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="px-2 py-2 text-sm font-medium truncate">
                  {inspection.property?.name || "—"}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{inspection.property?.name || "—"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>

        {/* Data */}
        <td className="p-0 w-[100px]">
          <div className="px-2 py-2 text-sm text-center text-muted-foreground">
            {format(new Date(inspection.created_at), "dd MMM", { locale: ptBR })}
          </div>
        </td>

        {/* Faxineira/Equipe */}
        <td className="p-0 max-w-[120px]">
          <div className="px-2 py-2 text-sm truncate">
            {showCleanerColumn ? (inspection.cleaner_name || "—") : (inspection.cleaner_name || inspection.owner_name || "Equipe")}
          </div>
        </td>

        {/* OK ou NÃO */}
        <td className="p-0 w-[80px]">
          <div className="flex justify-center px-2 py-2">
            <Badge 
              variant={hasProblems ? "destructive" : "secondary"}
              className={hasProblems ? "" : "bg-success/10 text-success dark:bg-green-900 dark:text-green-300"}
            >
              {hasProblems ? "NÃO" : "OK"}
            </Badge>
          </div>
        </td>

        {/* Audio (transcript) */}
        <td className="p-0 w-[250px]">
          <div className="px-2 py-2 flex items-center gap-2">
            {inspection.audio_url && (
              <AudioPlayerMini url={inspection.audio_url} />
            )}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-xs text-muted-foreground truncate max-w-[200px] cursor-default">
                    {inspection.transcript 
                      ? `${inspection.transcript.substring(0, 60)}...` 
                      : inspection.notes || "—"}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-md">
                  <p className="text-sm whitespace-pre-wrap">
                    {inspection.transcript || inspection.notes || "—"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </td>

        {/* Arquivos */}
        <td className="p-0 w-[80px]">
          <div className="flex items-center justify-center gap-1 px-1 py-2">
            <button
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors",
                inspection.attachments.length > 0
                  ? "hover:bg-primary/10 cursor-pointer text-primary"
                  : "text-muted-foreground"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (inspection.attachments.length > 0) {
                  onOpenAttachments(inspection);
                }
              }}
              disabled={inspection.attachments.length === 0}
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span>{inspection.attachments.length}</span>
            </button>
            {inspection.audio_url && (
              <FileAudio className="h-3.5 w-3.5 text-info" />
            )}
          </div>
        </td>

        {/* Summarize */}
        <td className="p-0 w-[300px]">
          <div className="px-2 py-2 flex items-center gap-2">
            {inspection.transcript_summary ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-xs truncate max-w-[220px] cursor-default flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        RESUMO
                      </Badge>
                      <span>{inspection.transcript_summary.substring(0, 50)}...</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-md">
                    <p className="text-sm whitespace-pre-wrap">
                      {inspection.transcript_summary}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : inspection.transcript ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateSummary(inspection);
                }}
                disabled={generatingIds.has(inspection.id)}
              >
                {generatingIds.has(inspection.id) ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    Gerar Resumo
                  </>
                )}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        </td>

        {/* Ações */}
        <td className="p-0 w-[80px]">
          <div className="flex justify-center gap-1 px-1 py-2">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditInspection(inspection);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Editar Vistoria</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateMaintenance(inspection);
                    }}
                  >
                    <Wrench className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Nova Manutenção</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <Card className="overflow-hidden mb-4">
      {/* Archive button when items selected */}
      {selectedInspectionIds.size > 0 && (
        <div className="bg-muted/50 p-2 flex items-center justify-between border-b">
          <span className="text-sm text-muted-foreground">
            {selectedInspectionIds.size} vistoria(s) selecionada(s)
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onArchiveInspections}
            disabled={archivingInspections}
          >
            {archivingInspections ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Archive className="h-4 w-4 mr-2" />
            )}
            Arquivar
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead className="bg-muted text-muted-foreground">
            <tr className="h-10">
              <th className="w-[40px] px-2 py-2"></th>
              {renderSortableHeader("Imóvel", "property", "text-left w-[150px]")}
              {renderSortableHeader("Data", "created_at", "text-center w-[100px]")}
              {renderSortableHeader("Responsável", "cleaner_name", "text-left w-[120px]")}
              {renderSortableHeader("Status", "status", "text-center w-[80px]")}
              <th className="text-left px-2 py-2 font-medium w-[250px]">Audio</th>
              <th className="text-center px-2 py-2 font-medium w-[80px]">Arquivos</th>
              <th className="text-left px-2 py-2 font-medium w-[300px]">Resumo</th>
              <th className="text-center px-2 py-2 font-medium w-[80px]"></th>
            </tr>
          </thead>
          <tbody>
            {/* Vistorias Faxineiras Group Header */}
            <tr 
              className="bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border-l-4 border-l-amber-500"
              onClick={onToggleCleaner}
            >
              <td colSpan={9} className="p-2">
                <div className="flex items-center gap-2 font-medium">
                  {cleanerExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span>Vistorias de Faxineiras</span>
                  <Badge variant="secondary" className="ml-2">
                    {cleanerInspections.length}
                  </Badge>
                </div>
              </td>
            </tr>

            {/* Cleaner Inspection Rows */}
            {cleanerExpanded && sortedCleanerInspections.map((inspection) => renderInspectionRow(inspection, true))}

            {/* Vistorias Equipe Group Header */}
            <tr 
              className="bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border-l-4 border-l-green-500"
              onClick={onToggleTeam}
            >
              <td colSpan={9} className="p-2">
                <div className="flex items-center gap-2 font-medium">
                  {teamExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span>Vistorias de Equipe</span>
                  <Badge variant="secondary" className="ml-2">
                    {teamInspections.length}
                  </Badge>
                </div>
              </td>
            </tr>

            {/* Team Inspection Rows */}
            {teamExpanded && sortedTeamInspections.map((inspection) => renderInspectionRow(inspection, false))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ===== MAIN COMPONENT =====
export default function AdminManutencoesLista() {
  useScrollRestoration();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { open: detailSheetOpen, entityId: detailEntityId, entityType: detailEntityType, openSheet, closeSheet } = useDetailSheet();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    em_progresso: false,
    concluidas: false,
    cobrancas_vencidas: false,
    cobrancas: false,
  });

  // Vistorias state
  const [vistoriasFaxineirasExpanded, setVistoriasFaxineirasExpanded] = useState(false);
  const [vistoriasEquipeExpanded, setVistoriasEquipeExpanded] = useState(false);
  const [generatingSummaryIds, setGeneratingSummaryIds] = useState<Set<string>>(new Set());
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<InspectionItem | null>(null);
  const [editInspectionDialogOpen, setEditInspectionDialogOpen] = useState(false);
  const [inspectionToEdit, setInspectionToEdit] = useState<InspectionItem | null>(null);
  
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
  const [galleryItems, setGalleryItems] = useState<Array<{ id: string; file_url: string; file_name?: string | null; file_type?: string | null }>>([]);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

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

      const isTicketGroup = ["em_progresso", "concluidas"].includes(inlineAdd.groupId);

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
        });
        if (error) throw error;
      } else {
        const rawAmount = inlineAdd.amountCents.replace(/[^\d,]/g, "").replace(",", ".");
        const amountCents = Math.round((parseFloat(rawAmount) || 0) * 100);

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

      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
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
    queryKey: ["maintenance-list-view"],
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
          property:properties(id, name),
          owner:profiles!tickets_owner_id_fkey(id, name)
        `)
        .eq("ticket_type", "manutencao")
        .neq("status", "cancelado")
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch attachments count for each ticket
      const ticketIds = (data || []).map(t => t.id);
      const { data: attachments } = await supabase
        .from("ticket_attachments")
        .select("ticket_id")
        .in("ticket_id", ticketIds);

      const attachmentCounts: Record<string, number> = {};
      (attachments || []).forEach(a => {
        attachmentCounts[a.ticket_id] = (attachmentCounts[a.ticket_id] || 0) + 1;
      });

      // Fetch associated charges for value/contribution data
      const { data: charges } = await supabase
        .from("charges")
        .select("ticket_id, amount_cents, management_contribution_cents, service_type, status")
        .in("ticket_id", ticketIds);

      const chargeMap: Record<string, any> = {};
      (charges || []).forEach(c => {
        if (c.ticket_id) chargeMap[c.ticket_id] = c;
      });

      // Tickets concluidos que já têm cobrança enviada/pendente não devem aparecer aqui
      // (eles aparecem na seção de cobranças pendentes)
      const CHARGE_SENT_STATUSES = ["sent", "pendente", "pending", "overdue", "contested"];

      return (data || [])
        .filter(t => {
          // Se o ticket está concluido E tem uma cobrança já enviada ao proprietário, não mostrar aqui
          if (t.status === "concluido" && chargeMap[t.id] && CHARGE_SENT_STATUSES.includes(chargeMap[t.id].status)) {
            return false;
          }
          return true;
        })
        .map(t => ({
          ...t,
          attachments_count: attachmentCounts[t.id] || 0,
          amount_cents: chargeMap[t.id]?.amount_cents || null,
          management_contribution_cents: chargeMap[t.id]?.management_contribution_cents || null,
          service_type: chargeMap[t.id]?.service_type || null,
          list_status: t.status === "concluido" ? "feito" : "em_progresso",
          cost_responsible: (t as any).cost_responsible ?? null,
        })) as MaintenanceItem[];
    },
  });

  // Fetch pending charges (cobranças pendentes de pagamento)
  const { data: charges } = useQuery({
    queryKey: ["pending-charges-list"],
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
          property:properties(id, name),
          owner:profiles!charges_owner_id_fkey(id, name),
          ticket_id
        `)
        .in("status", ["pendente", "pending", "sent", "contested"])
        .is("paid_at", null)
        .is("archived_at", null)
        .order("due_date", { ascending: true });

      if (error) throw error;

      // Fetch attachment counts for charges
      const chargeIds = (data || []).map(c => c.id);
      const { data: attachments } = await supabase
        .from("charge_attachments")
        .select("charge_id")
        .in("charge_id", chargeIds);

      const attachmentCounts: Record<string, number> = {};
      (attachments || []).forEach(a => {
        if (a.charge_id) {
          attachmentCounts[a.charge_id] = (attachmentCounts[a.charge_id] || 0) + 1;
        }
      });

      return (data || []).map(c => ({
        ...c,
        attachments_count: attachmentCounts[c.id] || 0,
      }));
    },
  });

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

          // Buscar TODAS as cobranças vinculadas (pode haver múltiplas)
          const { data: existingCharges, error: chargeQueryError } = await supabase
            .from("charges")
            .select("id, amount_cents")
            .eq("ticket_id", id)
            .is("archived_at", null)
            .order("created_at", { ascending: false });

          if (chargeQueryError) throw chargeQueryError;

          let chargeId: string;

          if (existingCharges && existingCharges.length > 0) {
            // Atualizar a cobrança existente para "sent" (envia ao proprietário)
            const { error: updateError } = await supabase
              .from("charges")
              .update({
                status: "sent",
                amount_cents: ticket.amount_cents || existingCharges[0].amount_cents || 0,
                management_contribution_cents: ticket.management_contribution_cents ?? 0,
                service_type: ticket.service_type || null,
                cost_responsible: ticket.cost_responsible || "owner",
              })
              .eq("ticket_id", id)
              .is("archived_at", null);
            if (updateError) throw updateError;
            chargeId = existingCharges[0].id;
          } else {
            // Criar nova cobrança já enviada ao proprietário
            const { data: newCharge, error: chargeError } = await supabase
              .from("charges")
              .insert({
                owner_id: ticket.owner.id,
                property_id: ticket.property?.id || null,
                ticket_id: id,
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

          // Copy ticket attachments to the charge
          const { data: ticketAttachments } = await supabase
            .from("ticket_attachments")
            .select("path, file_name, file_type, file_url, mime_type, file_size, size_bytes")
            .eq("ticket_id", id);

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
              .eq("id", id);
            if (ticketError) throw ticketError;
          }

          // Notificar o proprietário (email + push + notificação interna)
          try {
            await supabase.functions.invoke("send-charge-email", {
              body: { type: "charge_created", chargeId },
            });
          } catch (notifyErr) {
            console.warn("Falha ao notificar proprietário (não crítico):", notifyErr);
          }

          toast.success("Cobrança criada e enviada ao proprietário!");
          return;
        }

        // Regular update - check if it's a charge field or ticket field
        if (["amount_cents", "management_contribution_cents", "service_type"].includes(field)) {
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
            }
          }
        } else if (field === "scheduled_at") {
          const { error } = await supabase
            .from("tickets")
            .update({ scheduled_at: value })
            .eq("id", id);
          if (error) throw error;
        }
      }
    },
    onMutate: async ({ id, field, value }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["maintenance-list-view"] });
      await queryClient.cancelQueries({ queryKey: ["pending-charges-list"] });

      // Snapshot previous value
      const previousTickets = queryClient.getQueryData(["maintenance-list-view"]);
      const previousCharges = queryClient.getQueryData(["pending-charges-list"]);

      if (field === "list_status" && value === "enviar_proprietario") {
        // Optimistically REMOVE the ticket from the maintenance list —
        // it will appear in "Cobranças Pendentes" after refetch
        queryClient.setQueryData(["maintenance-list-view"], (old: MaintenanceItem[] | undefined) => {
          if (!old) return old;
          return old.filter(t => t.id !== id);
        });
      } else {
        // Regular optimistic update
        queryClient.setQueryData(["maintenance-list-view"], (old: MaintenanceItem[] | undefined) => {
          if (!old) return old;
          return old.map(t => t.id === id ? { ...t, [field]: value } : t);
        });
      }

      return { previousTickets, previousCharges };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(["maintenance-list-view"], context?.previousTickets);
      queryClient.setQueryData(["pending-charges-list"], context?.previousCharges);
      toast.error("Erro ao atualizar");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
      queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
    },
  });

  const handleUpdateItem = useCallback((id: string, field: string, value: any, isCharge?: boolean) => {
    updateMutation.mutate({ id, field, value, isCharge });
  }, [updateMutation]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
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
      for (const file of Array.from(files)) {
        const folder = isCharge ? `charges/${item.id}` : `tickets/${item.id}`;
        const { url } = await uploadFileWithCompression(
          file,
          "attachments",
          folder,
          (progress) => {
            // Could show progress here if needed
          }
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
              body: `Anexo adicionado: ${file.name}`,
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
      }

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const emProgresso = (tickets || []).filter(t => 
      t.status !== "concluido" &&
      (t.subject.toLowerCase().includes(searchLower) || 
       t.property?.name.toLowerCase().includes(searchLower))
    );

    const concluidas = (tickets || []).filter(t => 
      t.status === "concluido" &&
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
    });

    const filteredCharges = (charges || []).filter(c =>
      c.title.toLowerCase().includes(searchLower) ||
      c.property?.name?.toLowerCase().includes(searchLower)
    );

    // Split charges into overdue and pending
    const cobrancasVencidas = filteredCharges
      .filter(c => c.due_date && new Date(c.due_date) < today)
      .map(mapCharge);

    const cobrancasPendentes = filteredCharges
      .filter(c => !c.due_date || new Date(c.due_date) >= today)
      .map(mapCharge);

    return {
      em_progresso: emProgresso,
      concluidas: concluidas,
      cobrancas_vencidas: cobrancasVencidas,
      cobrancas: cobrancasPendentes,
    };
  }, [tickets, charges, debouncedSearch]);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/painel")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold">Gestão de Manutenções</h1>
            <p className="text-muted-foreground text-sm">
              Lista estilo Monday com edição inline
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/admin/manutencoes-arquivo")}>
            <Archive className="h-4 w-4 mr-2" />
            Arquivo
          </Button>
          <Button variant="outline" onClick={() => navigate("/manutencoes")}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Relatório
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/manutencoes")}>
            Ver Kanban
          </Button>
          <Button onClick={() => navigate("/admin/nova-manutencao")}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Manutenção
          </Button>
        </div>

        {/* Search and Actions */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou imóvel..."
              className="pl-10"
            />
          </div>
          {selectedIds.size > 0 && (
            <Button 
              variant="outline"
              onClick={handleArchive}
              disabled={archiveMutation.isPending}
            >
              <Archive className="h-4 w-4 mr-2" />
              Arquivar ({selectedIds.size})
            </Button>
          )}
        </div>

        {/* Vistorias Table */}
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

        {/* Maintenances Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-secondary text-secondary-foreground">
                <tr className="h-10">
                  <th className="w-[36px] px-1 py-2"></th>
                  <SortableHeader label="Manutenção" field="subject" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="text-center w-[220px] max-w-[220px]" />
                  <th className="text-center px-1 py-2 font-medium w-[44px]">Chat</th>
                  <SortableHeader label="Imóvel" field="property" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="text-center w-[140px] max-w-[140px]" />
                  <SortableHeader label="Valor" field="amount_cents" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="text-center w-[90px]" />
                  <SortableHeader label="Aporte" field="management_contribution_cents" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="text-center w-[90px]" />
                  <SortableHeader label="Data" field="created_at" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="text-center w-[80px]" />
                  <th className="text-center px-1 py-2 font-medium w-[70px]">Anexos</th>
                  <th className="text-center px-1 py-2 font-medium w-[120px]">Responsável</th>
                  <SortableHeader label="Label" field="service_type" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="text-center w-[120px]" />
                  <SortableHeader label="Status" field="list_status" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="text-center w-[140px]" />
                  <th className="text-center px-1 py-2 font-medium w-[44px]">Editar</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="text-center p-8 text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : (
                  GROUPS.map(group => {
                    const isExpanded = expandedGroups[group.id] ?? false;
                    const isChargeGroup = ["cobrancas_vencidas", "cobrancas"].includes(group.id);
                    const isInlineActive = inlineAdd?.groupId === group.id;
                    return (
                      <React.Fragment key={group.id}>
                        <GroupRow
                          group={group}
                          items={groupedItems[group.id as keyof typeof groupedItems] || []}
                          isExpanded={isExpanded}
                          onToggle={() => toggleGroup(group.id)}
                          onUpdateItem={handleUpdateItem}
                          onOpenChat={handleOpenChat}
                          unreadCounts={unreadCounts}
                          selectedIds={selectedIds}
                          onToggleSelection={toggleSelection}
                          sortField={sortField}
                          sortDirection={sortDirection}
                          onSort={handleSort}
                          onOpenAttachments={handleOpenAttachments}
                          onUploadAttachment={handleUploadAttachment}
                          uploadingItemId={uploadingItemId}
                          onOpenSheet={(id) => {
                            const isCharge = ["cobrancas_vencidas", "cobrancas"].includes(group.id);
                            openSheet(id, isCharge ? "cobranca" : "maintenance");
                          }}
                          onEdit={(item, isCharge) => {
                            const path = isCharge
                              ? `/nova-cobranca?edit=${item.id}`
                              : `/admin/nova-manutencao?edit=${item.id}`;
                            navigate(path);
                          }}
                        />

                        {/* Inline form row */}
                        {isExpanded && isInlineActive && (
                          <tr className="border-b bg-muted/20">
                            <td className="p-0 w-[40px]" />
                            <td className="p-0" colSpan={2}>
                              <input
                                ref={inlineInputRef}
                                autoFocus
                                type="text"
                                placeholder={isChargeGroup ? "Título da cobrança..." : "Nome da manutenção..."}
                                value={inlineAdd!.subject}
                                onChange={(e) => setInlineAdd((prev) => prev ? { ...prev, subject: e.target.value } : null)}
                                onKeyDown={handleInlineKeyDown}
                                className="w-full h-10 px-3 text-sm bg-transparent border-0 border-b-2 border-primary focus:outline-none placeholder:text-muted-foreground"
                              />
                            </td>
                            <td className="p-0 w-[130px]">
                              <Select
                                value={inlineAdd!.propertyId}
                                onValueChange={(val) => setInlineAdd((prev) => prev ? { ...prev, propertyId: val } : null)}
                              >
                                <SelectTrigger className="h-10 border-0 border-b-2 border-transparent focus:border-primary rounded-none text-sm">
                                  <SelectValue placeholder="Imóvel..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {propertiesList?.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            {isChargeGroup ? (
                              <td className="p-0 w-[120px]">
                                <input
                                  type="text"
                                  placeholder="R$ 0,00"
                                  value={inlineAdd!.amountCents}
                                  onChange={(e) => setInlineAdd((prev) => prev ? { ...prev, amountCents: e.target.value } : null)}
                                  onKeyDown={handleInlineKeyDown}
                                  className="w-full h-10 px-3 text-sm bg-transparent border-0 border-b-2 border-transparent focus:border-primary focus:outline-none placeholder:text-muted-foreground text-right"
                                />
                              </td>
                            ) : (
                              <td className="p-0 w-[120px]" />
                            )}
                            <td colSpan={4} className="p-0" />
                            <td className="p-0 w-[150px]">
                              <div className="flex items-center justify-center gap-1 px-2">
                                <button
                                  onClick={handleInlineSave}
                                  disabled={inlineLoading || !inlineAdd!.subject.trim() || !inlineAdd!.propertyId}
                                  className="p-1.5 rounded hover:bg-primary/10 text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Salvar (Enter)"
                                >
                                  {inlineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                </button>
                                <button
                                  onClick={handleInlineCancel}
                                  className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                                  title="Cancelar (Esc)"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* "+ Adicionar item" row */}
                        {isExpanded && !isInlineActive && (
                          <tr className="border-b">
                            <td colSpan={11} className="p-0">
                              <button
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors group"
                                onClick={() => handleStartInlineAdd(group.id)}
                              >
                                <Plus className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
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

        {/* Reserve Debits Table - Below maintenances */}
        <ReserveDebitsTable />

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

        {/* Detail Sheet (preview lateral) */}
        <DetailSheet
          open={detailSheetOpen}
          onClose={closeSheet}
          entityId={detailEntityId}
          entityType={detailEntityType}
        />
      </div>
    </div>
  );
}
