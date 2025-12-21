import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Search, Plus, ChevronDown, ChevronRight, Paperclip, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";

// ===== TYPES =====
type TicketStatus = "novo" | "em_analise" | "aguardando_info" | "em_execucao" | "concluido" | "cancelado";

type ListStatus = "em_progresso" | "feito" | "enviar_proprietario";

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
}

// ===== CONSTANTS =====
const SERVICE_LABELS = [
  { value: "refrigeracao", label: "Refrigeração", color: "bg-blue-500" },
  { value: "eletrica", label: "Elétrica", color: "bg-yellow-500" },
  { value: "hidraulica", label: "Hidráulica", color: "bg-cyan-500" },
  { value: "marcenaria", label: "Marcenaria", color: "bg-amber-700" },
  { value: "estrutural", label: "Estrutural", color: "bg-slate-600" },
  { value: "itens", label: "Itens", color: "bg-purple-500" },
];

const LIST_STATUSES = [
  { value: "em_progresso", label: "Em Progresso", color: "bg-amber-500" },
  { value: "feito", label: "Feito", color: "bg-green-500" },
  { value: "enviar_proprietario", label: "Enviar ao Proprietário", color: "bg-primary" },
];

const GROUPS = [
  { id: "em_progresso", label: "Em Progresso", color: "border-l-amber-500" },
  { id: "concluidas", label: "Manutenções Concluídas", color: "border-l-green-500" },
  { id: "cobrancas", label: "Cobranças Geradas", color: "border-l-primary" },
];

// ===== INLINE EDIT CELL COMPONENT =====
interface EditableCellProps {
  value: string | number | null;
  type: "text" | "currency" | "date" | "select";
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

  if (type === "select") {
    const selectedOption = options?.find(o => o.value === value);
    return (
      <Select 
        value={String(value || "")} 
        onValueChange={(v) => onSave(v)}
      >
        <SelectTrigger className={cn("h-8 border-0 bg-transparent hover:bg-muted/50 transition-colors", className)}>
          {selectedOption ? (
            <Badge className={cn("text-white text-xs", selectedOption.color)}>
              {selectedOption.label}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">{placeholder || "—"}</span>
          )}
        </SelectTrigger>
        <SelectContent>
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
      <div className="flex items-center gap-1">
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
      onClick={() => {
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
  onUpdateItem: (id: string, field: string, value: any) => void;
  onOpenChat: (item: MaintenanceItem) => void;
  unreadCounts: Record<string, number>;
}

function GroupRow({ group, items, isExpanded, onToggle, onUpdateItem, onOpenChat, unreadCounts }: GroupRowProps) {
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
        <td colSpan={9} className="p-2">
          <div className="flex items-center gap-2 font-medium">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span>{group.label}</span>
            <Badge variant="secondary" className="ml-2">{items.length}</Badge>
          </div>
        </td>
      </tr>

      {/* Group Items */}
      {isExpanded && items.map((item) => {
        const unread = unreadCounts[item.id] || 0;
        return (
          <tr 
            key={item.id}
            className="border-b hover:bg-muted/30 transition-colors group h-10"
          >
            {/* Nome da Manutenção - Abre Chat */}
            <td className="p-0 max-w-[200px]">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className="px-2 py-2 font-medium text-sm cursor-pointer hover:text-primary transition-colors truncate flex items-center gap-2"
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
            <td className="p-0 w-[60px]">
              <div 
                className="flex items-center justify-center px-2 py-2 cursor-pointer hover:bg-muted/50 rounded transition-colors"
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
            <td className="p-0 max-w-[130px]">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="px-2 py-2 text-sm text-muted-foreground truncate">
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
            <td className="p-0 w-[120px]">
              <EditableCell
                value={item.amount_cents || null}
                type="currency"
                placeholder="R$ 0,00"
                onSave={(val) => onUpdateItem(item.id, "amount_cents", val)}
                className="justify-end font-medium"
              />
            </td>

            {/* Aporte Gestão */}
            <td className="p-0 w-[120px]">
              <EditableCell
                value={item.management_contribution_cents || null}
                type="currency"
                placeholder="R$ 0,00"
                onSave={(val) => onUpdateItem(item.id, "management_contribution_cents", val)}
                className="justify-end text-green-600"
              />
            </td>

            {/* Data */}
            <td className="p-0 w-[100px]">
              <EditableCell
                value={item.scheduled_at}
                type="date"
                placeholder="—"
                onSave={(val) => onUpdateItem(item.id, "scheduled_at", val)}
                className="justify-center"
              />
            </td>

            {/* Anexos */}
            <td className="p-0 w-[60px]">
              <div className="flex items-center justify-center gap-1 px-2 py-2 text-sm">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{item.attachments_count || 0}</span>
              </div>
            </td>

            {/* Label (Categoria) */}
            <td className="p-0 w-[130px]">
              <EditableCell
                value={item.service_type || null}
                type="select"
                options={SERVICE_LABELS}
                placeholder="Selecionar"
                onSave={(val) => onUpdateItem(item.id, "service_type", val)}
              />
            </td>

            {/* Status */}
            <td className="p-0 w-[150px]">
              <EditableCell
                value={item.list_status || "em_progresso"}
                type="select"
                options={LIST_STATUSES}
                onSave={(val) => onUpdateItem(item.id, "list_status", val)}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ===== MAIN COMPONENT =====
export default function AdminManutencoesLista() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    em_progresso: true,
    concluidas: true,
    cobrancas: false,
  });

  // Chat dialog state
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MaintenanceItem | null>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

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
          property:properties(id, name),
          owner:profiles!tickets_owner_id_fkey(id, name)
        `)
        .eq("ticket_type", "manutencao")
        .neq("status", "cancelado")
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
        .select("ticket_id, amount_cents, management_contribution_cents, service_type")
        .in("ticket_id", ticketIds);

      const chargeMap: Record<string, any> = {};
      (charges || []).forEach(c => {
        if (c.ticket_id) chargeMap[c.ticket_id] = c;
      });

      return (data || []).map(t => ({
        ...t,
        attachments_count: attachmentCounts[t.id] || 0,
        amount_cents: chargeMap[t.id]?.amount_cents || null,
        management_contribution_cents: chargeMap[t.id]?.management_contribution_cents || null,
        service_type: chargeMap[t.id]?.service_type || null,
        list_status: t.status === "concluido" ? "feito" : "em_progresso",
      })) as MaintenanceItem[];
    },
  });

  // Fetch completed charges (cobranças geradas)
  const { data: charges } = useQuery({
    queryKey: ["charges-from-maintenance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select(`
          id,
          title,
          amount_cents,
          management_contribution_cents,
          service_type,
          created_at,
          due_date,
          status,
          property:properties(id, name),
          owner:profiles!charges_owner_id_fkey(id, name),
          ticket_id
        `)
        .not("ticket_id", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
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
        // If updating status to "enviar_proprietario", create charge
        if (field === "list_status" && value === "enviar_proprietario") {
          const ticket = tickets?.find(t => t.id === id);
          if (ticket && ticket.owner) {
            // First mark ticket as concluded
            const { error: ticketError } = await supabase
              .from("tickets")
              .update({ status: "concluido" })
              .eq("id", id);
            if (ticketError) throw ticketError;

            // Then create charge
            const { error: chargeError } = await supabase
              .from("charges")
              .insert({
                owner_id: ticket.owner.id,
                property_id: ticket.property?.id || null,
                ticket_id: id,
                title: ticket.subject,
                amount_cents: ticket.amount_cents || 0,
                management_contribution_cents: ticket.management_contribution_cents || 0,
                service_type: ticket.service_type || null,
                cost_responsible: "owner",
                status: "pending",
              });
            if (chargeError) throw chargeError;

            toast.success("Cobrança criada e enviada ao proprietário!");
            return;
          }
        }

        // Regular update - check if it's a charge field or ticket field
        if (["amount_cents", "management_contribution_cents", "service_type"].includes(field)) {
          // Check if charge exists for this ticket
          const { data: existingCharge } = await supabase
            .from("charges")
            .select("id")
            .eq("ticket_id", id)
            .single();

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
      await queryClient.cancelQueries({ queryKey: ["charges-from-maintenance"] });

      // Snapshot previous value
      const previousTickets = queryClient.getQueryData(["maintenance-list-view"]);
      const previousCharges = queryClient.getQueryData(["charges-from-maintenance"]);

      // Optimistically update
      queryClient.setQueryData(["maintenance-list-view"], (old: MaintenanceItem[] | undefined) => {
        if (!old) return old;
        return old.map(t => t.id === id ? { ...t, [field]: value } : t);
      });

      return { previousTickets, previousCharges };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(["maintenance-list-view"], context?.previousTickets);
      queryClient.setQueryData(["charges-from-maintenance"], context?.previousCharges);
      toast.error("Erro ao atualizar");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
      queryClient.invalidateQueries({ queryKey: ["charges-from-maintenance"] });
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

  // Organize items into groups with search filter
  const groupedItems = useMemo(() => {
    const searchLower = debouncedSearch.toLowerCase();

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

    const cobrancas = (charges || []).filter(c =>
      c.title.toLowerCase().includes(searchLower) ||
      c.property?.name?.toLowerCase().includes(searchLower)
    ).map(c => ({
      id: c.id,
      subject: c.title,
      status: "concluido" as TicketStatus,
      scheduled_at: c.due_date,
      created_at: c.created_at,
      property: c.property,
      owner: c.owner,
      amount_cents: c.amount_cents,
      management_contribution_cents: c.management_contribution_cents,
      service_type: c.service_type,
      list_status: "enviar_proprietario" as ListStatus,
      attachments_count: 0,
    }));

    return {
      em_progresso: emProgresso,
      concluidas: concluidas,
      cobrancas: cobrancas,
    };
  }, [tickets, charges, debouncedSearch]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate("/painel")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold">Gestão de Manutenções</h1>
            <p className="text-muted-foreground text-sm">
              Lista estilo Monday com edição inline
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/admin/manutencoes")}>
            Ver Kanban
          </Button>
          <Button onClick={() => navigate("/admin/nova-manutencao")}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Manutenção
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou imóvel..."
            className="pl-10"
          />
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-secondary text-secondary-foreground">
                <tr className="h-10">
                  <th className="text-left px-2 py-2 font-medium w-[200px] max-w-[200px]">Manutenção</th>
                  <th className="text-center px-2 py-2 font-medium w-[60px]">Chat</th>
                  <th className="text-left px-2 py-2 font-medium w-[130px] max-w-[130px]">Imóvel</th>
                  <th className="text-right px-2 py-2 font-medium w-[120px]">Valor</th>
                  <th className="text-right px-2 py-2 font-medium w-[120px]">Aporte Gestão</th>
                  <th className="text-center px-2 py-2 font-medium w-[100px]">Data</th>
                  <th className="text-center px-2 py-2 font-medium w-[60px]">Anexos</th>
                  <th className="text-center px-2 py-2 font-medium w-[130px]">Label</th>
                  <th className="text-center px-2 py-2 font-medium w-[150px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : (
                  GROUPS.map(group => (
                    <GroupRow
                      key={group.id}
                      group={group}
                      items={groupedItems[group.id as keyof typeof groupedItems] || []}
                      isExpanded={expandedGroups[group.id]}
                      onToggle={() => toggleGroup(group.id)}
                      onUpdateItem={handleUpdateItem}
                      onOpenChat={handleOpenChat}
                      unreadCounts={unreadCounts}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Chat Dialog */}
        <MaintenanceChatDialog
          open={chatDialogOpen}
          onOpenChange={handleCloseChat}
          ticketId={selectedItem?.id || ""}
          ticketSubject={selectedItem?.subject || ""}
          propertyName={selectedItem?.property?.name}
        />
      </div>
    </div>
  );
}
