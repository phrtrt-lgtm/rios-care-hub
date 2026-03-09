import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Search, ArrowUpDown, ArrowUp, ArrowDown, ArchiveRestore, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ===== TYPES =====
type SortDirection = "asc" | "desc" | null;
type SortField = "subject" | "property" | "amount_cents" | "management_contribution_cents" | "scheduled_at" | "service_type" | "archived_at";

interface ArchivedItem {
  id: string;
  type: "ticket" | "charge";
  subject: string;
  property: { id: string; name: string } | null;
  amount_cents: number | null;
  management_contribution_cents: number | null;
  scheduled_at: string | null;
  archived_at: string;
  service_type: string | null;
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
  
  return (
    <th 
      className={cn("px-2 py-2 font-medium cursor-pointer hover:bg-muted/50 transition-colors select-none", className)}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
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

// ===== MAIN COMPONENT =====
export default function AdminManutencoesArquivo() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch archived items (tickets and charges)
  const { data: archivedItems, isLoading } = useQuery({
    queryKey: ["archived-maintenance-items"],
    queryFn: async () => {
      // Fetch archived tickets
      const { data: tickets, error: ticketsError } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          scheduled_at,
          archived_at,
          property:properties(id, name)
        `)
        .eq("ticket_type", "manutencao")
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });

      if (ticketsError) throw ticketsError;

      // Fetch ticket IDs
      const ticketIds = (tickets || []).map(t => t.id);
      
      // Fetch charges for tickets
      const { data: chargesForTickets } = await supabase
        .from("charges")
        .select("ticket_id, amount_cents, management_contribution_cents, service_type")
        .in("ticket_id", ticketIds.length > 0 ? ticketIds : ["00000000-0000-0000-0000-000000000000"]);

      const chargeMap: Record<string, any> = {};
      (chargesForTickets || []).forEach(c => {
        if (c.ticket_id) chargeMap[c.ticket_id] = c;
      });

      // Fetch ticket attachments count
      const { data: ticketAttachments } = await supabase
        .from("ticket_attachments")
        .select("ticket_id")
        .in("ticket_id", ticketIds.length > 0 ? ticketIds : ["00000000-0000-0000-0000-000000000000"]);

      const attachmentCounts: Record<string, number> = {};
      (ticketAttachments || []).forEach(a => {
        attachmentCounts[a.ticket_id] = (attachmentCounts[a.ticket_id] || 0) + 1;
      });

      // Fetch archived charges (without ticket)
      const { data: archivedCharges, error: chargesError } = await supabase
        .from("charges")
        .select(`
          id,
          title,
          amount_cents,
          management_contribution_cents,
          service_type,
          due_date,
          archived_at,
          property:properties(id, name)
        `)
        .is("ticket_id", null)
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });

      if (chargesError) throw chargesError;

      // Combine and map results
      const items: ArchivedItem[] = [
        ...(tickets || []).map(t => ({
          id: t.id,
          type: "ticket" as const,
          subject: t.subject,
          property: t.property,
          amount_cents: chargeMap[t.id]?.amount_cents || null,
          management_contribution_cents: chargeMap[t.id]?.management_contribution_cents || null,
          scheduled_at: t.scheduled_at,
          archived_at: t.archived_at!,
          service_type: chargeMap[t.id]?.service_type || null,
          attachments_count: attachmentCounts[t.id] || 0,
        })),
        ...(archivedCharges || []).map(c => ({
          id: c.id,
          type: "charge" as const,
          subject: c.title,
          property: c.property,
          amount_cents: c.amount_cents,
          management_contribution_cents: c.management_contribution_cents,
          scheduled_at: c.due_date,
          archived_at: c.archived_at!,
          service_type: c.service_type,
          attachments_count: 0,
        })),
      ];

      return items;
    },
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Find items to restore
      const ticketIds: string[] = [];
      const chargeIds: string[] = [];

      ids.forEach(id => {
        const item = archivedItems?.find(i => i.id === id);
        if (item?.type === "ticket") {
          ticketIds.push(id);
        } else if (item?.type === "charge") {
          chargeIds.push(id);
        }
      });

      // Restore tickets
      if (ticketIds.length > 0) {
        const { error } = await supabase
          .from("tickets")
          .update({ archived_at: null })
          .in("id", ticketIds);
        if (error) throw error;
      }

      // Restore charges
      if (chargeIds.length > 0) {
        const { error } = await supabase
          .from("charges")
          .update({ archived_at: null })
          .in("id", chargeIds);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archived-maintenance-items"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
      queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
      setSelectedIds(new Set());
      toast.success("Itens restaurados com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao restaurar itens");
    },
  });

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

  const toggleSelectAll = useCallback(() => {
    if (!archivedItems) return;
    if (selectedIds.size === archivedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(archivedItems.map(i => i.id)));
    }
  }, [archivedItems, selectedIds.size]);

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    if (!archivedItems) return [];

    let items = archivedItems.filter(item =>
      item.subject.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      item.property?.name?.toLowerCase().includes(debouncedSearch.toLowerCase())
    );

    if (sortField && sortDirection) {
      items = [...items].sort((a, b) => {
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
          case "scheduled_at":
            aValue = a.scheduled_at || "";
            bValue = b.scheduled_at || "";
            break;
          case "service_type":
            aValue = (a.service_type || "").toLowerCase();
            bValue = (b.service_type || "").toLowerCase();
            break;
          case "archived_at":
            aValue = a.archived_at;
            bValue = b.archived_at;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return items;
  }, [archivedItems, debouncedSearch, sortField, sortDirection]);

  const handleRestore = useCallback(() => {
    if (selectedIds.size === 0) return;
    restoreMutation.mutate(Array.from(selectedIds));
  }, [selectedIds, restoreMutation]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/manutencoes-lista")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold">Arquivo de Manutenções</h1>
            <p className="text-muted-foreground text-sm">
              Itens arquivados podem ser restaurados
            </p>
          </div>
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
              onClick={handleRestore}
              disabled={restoreMutation.isPending}
            >
              <ArchiveRestore className="h-4 w-4 mr-2" />
              Restaurar ({selectedIds.size})
            </Button>
          )}
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-secondary text-secondary-foreground">
                <tr className="h-10">
                  <th className="w-[40px] px-2 py-2">
                    <Checkbox
                      checked={archivedItems && archivedItems.length > 0 && selectedIds.size === archivedItems.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <SortableHeader
                    label="Manutenção"
                    field="subject"
                    currentSort={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    className="text-left w-[200px] max-w-[200px]"
                  />
                  <SortableHeader
                    label="Imóvel"
                    field="property"
                    currentSort={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    className="text-left w-[130px] max-w-[130px]"
                  />
                  <SortableHeader
                    label="Valor"
                    field="amount_cents"
                    currentSort={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    className="text-right w-[120px]"
                  />
                  <SortableHeader
                    label="Aporte Gestão"
                    field="management_contribution_cents"
                    currentSort={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    className="text-right w-[120px]"
                  />
                  <SortableHeader
                    label="Data"
                    field="scheduled_at"
                    currentSort={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    className="text-center w-[100px]"
                  />
                  <th className="text-center px-2 py-2 font-medium w-[60px]">Anexos</th>
                  <SortableHeader
                    label="Label"
                    field="service_type"
                    currentSort={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    className="text-center w-[130px]"
                  />
                  <SortableHeader
                    label="Arquivado em"
                    field="archived_at"
                    currentSort={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    className="text-center w-[120px]"
                  />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredAndSortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-muted-foreground">
                      Nenhum item arquivado encontrado
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedItems.map((item) => {
                    const serviceLabel = SERVICE_LABELS.find(s => s.value === item.service_type);
                    return (
                      <tr 
                        key={item.id}
                        className="border-b hover:bg-muted/30 transition-colors h-10"
                      >
                        <td className="px-2 py-2 w-[40px]">
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleSelection(item.id)}
                          />
                        </td>
                        <td className="px-2 py-2 max-w-[200px]">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="truncate font-medium">{item.subject}</div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-sm">
                                <p>{item.subject}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                        <td className="px-2 py-2 max-w-[130px]">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="truncate text-muted-foreground">{item.property?.name || "—"}</div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <p>{item.property?.name || "—"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                        <td className="px-2 py-2 text-right font-medium w-[120px]">
                          {item.amount_cents ? formatBRL(item.amount_cents) : "—"}
                        </td>
                        <td className="px-2 py-2 text-right text-green-600 w-[120px]">
                          {item.management_contribution_cents ? formatBRL(item.management_contribution_cents) : "—"}
                        </td>
                        <td className="px-2 py-2 text-center w-[100px]">
                          {item.scheduled_at 
                            ? format(new Date(item.scheduled_at), "dd/MM/yyyy", { locale: ptBR }) 
                            : "—"}
                        </td>
                        <td className="px-2 py-2 w-[60px]">
                          <div className="flex items-center justify-center gap-1">
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">{item.attachments_count || 0}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 w-[130px]">
                          <div className="flex justify-center">
                            {serviceLabel ? (
                              <Badge className={cn("text-white text-xs", serviceLabel.color)}>
                                {serviceLabel.label}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center w-[120px] text-muted-foreground">
                          {format(new Date(item.archived_at), "dd/MM/yyyy", { locale: ptBR })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
