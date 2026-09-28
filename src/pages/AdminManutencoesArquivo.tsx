import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ArrowUpDown, Loader2, Paperclip, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarBRL, formatarData } from "@/lib/cobrancaMeta";
import { rotulosServico } from "@/constants/chargeCategories";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { LinhaCaixa } from "@/components/painel/CaixaOperacao";
import { Etiqueta } from "@/components/painel/Etiqueta";

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
  charge_id?: string | null;
}

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
  const alinhamento = className?.includes("text-right") ? "justify-end" : className?.includes("text-center") ? "justify-center" : "justify-start";

  return (
    <TableHead className={cn("p-0", className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
        className={cn(
          "flex h-10 w-full items-center gap-1 px-3 text-left font-medium transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          alinhamento,
        )}
      >
        <span>{label}</span>
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-50" aria-hidden="true" />
        )}
      </button>
    </TableHead>
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
        .select("id, ticket_id, amount_cents, management_contribution_cents, service_type")
        .in("ticket_id", ticketIds.length > 0 ? ticketIds : ["00000000-0000-0000-0000-000000000000"]);

      const chargeMap: Record<string, NonNullable<typeof chargesForTickets>[number]> = {};
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

      // Fetch charge attachments count for archived charges
      const archivedChargeIds = (archivedCharges || []).map(c => c.id);
      const { data: chargeAttachments } = await supabase
        .from("charge_attachments")
        .select("charge_id")
        .in("charge_id", archivedChargeIds.length > 0 ? archivedChargeIds : ["00000000-0000-0000-0000-000000000000"]);

      const chargeAttachmentCounts: Record<string, number> = {};
      (chargeAttachments || []).forEach(a => {
        if (a.charge_id) chargeAttachmentCounts[a.charge_id] = (chargeAttachmentCounts[a.charge_id] || 0) + 1;
      });

      // Also fetch charge_attachments for charges linked to tickets
      const linkedChargeIds = Object.values(chargeMap).map((c) => c.id).filter(Boolean);
      const { data: linkedChargeAttachments } = await supabase
        .from("charge_attachments")
        .select("charge_id")
        .in("charge_id", linkedChargeIds.length > 0 ? linkedChargeIds : ["00000000-0000-0000-0000-000000000000"]);

      // Map linked charge attachments back to ticket IDs
      const linkedChargeAttachmentCounts: Record<string, number> = {};
      (linkedChargeAttachments || []).forEach(a => {
        if (a.charge_id) linkedChargeAttachmentCounts[a.charge_id] = (linkedChargeAttachmentCounts[a.charge_id] || 0) + 1;
      });

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
          attachments_count: (attachmentCounts[t.id] || 0) + (linkedChargeAttachmentCounts[chargeMap[t.id]?.id] || 0),
          charge_id: chargeMap[t.id]?.id || null,
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
          attachments_count: chargeAttachmentCounts[c.id] || 0,
          charge_id: c.id,
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

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    if (!archivedItems) return [];

    const busca = debouncedSearch.toLowerCase();
    let items = archivedItems.filter(item =>
      item.subject.toLowerCase().includes(busca) ||
      item.property?.name?.toLowerCase().includes(busca)
    );

    if (sortField && sortDirection) {
      items = [...items].sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

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

  // "Selecionar tudo" marca só o que está visível (a busca pode esconder itens).
  const todosVisiveisSelecionados =
    filteredAndSortedItems.length > 0 && filteredAndSortedItems.every((i) => selectedIds.has(i.id));
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(todosVisiveisSelecionados ? new Set() : new Set(filteredAndSortedItems.map((i) => i.id)));
  }, [filteredAndSortedItems, todosVisiveisSelecionados]);

  const handleRestore = useCallback(() => {
    if (selectedIds.size === 0) return;
    restoreMutation.mutate(Array.from(selectedIds));
  }, [selectedIds, restoreMutation]);

  const abrirItem = useCallback(
    (item: ArchivedItem) => {
      const destino = item.type === "charge" && item.charge_id ? item.charge_id : item.id;
      navigate(`/manutencao/${destino}`);
    },
    [navigate],
  );

  const total = archivedItems?.length ?? 0;
  const subtitulo = isLoading ? undefined : `${total} ${total === 1 ? "item arquivado" : "itens arquivados"} · podem ser restaurados`;

  return (
    <PaginaInterna
      largura="larga"
      cabecalho={
        <CabecalhoPagina
          titulo="Arquivo de manutenções"
          subtitulo={subtitulo}
          icone={<Archive />}
          tom="neutral"
          voltarPara="/admin/manutencoes-lista"
          acoes={
            selectedIds.size > 0 && (
              <Button size="sm" className="h-9" onClick={handleRestore} disabled={restoreMutation.isPending}>
                {restoreMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
                Restaurar ({selectedIds.size})
              </Button>
            )
          }
        />
      }
    >
      {/* Busca */}
      <Card className="rounded-xl border-border/70 p-3 md:p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por manutenção ou imóvel…"
            aria-label="Buscar no arquivo"
            className="pl-8"
          />
        </div>
      </Card>

      {isLoading ? (
        <Card className="rounded-xl border-border/70 p-3" aria-busy="true" aria-label="Carregando arquivo">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      ) : total === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="manutencoes"
            title="Nenhum item arquivado"
            description="Manutenções e cobranças arquivadas na lista aparecem aqui."
          />
        </Card>
      ) : filteredAndSortedItems.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="busca"
            title="Nada encontrado para a busca"
            description="Tente outro nome de manutenção ou de imóvel."
            action={
              <Button variant="outline" onClick={() => setSearch("")}>
                Limpar busca
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* Desktop: tabela */}
          <Card className="hidden overflow-hidden rounded-xl border-border/70 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={todosVisiveisSelecionados}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecionar todos os itens visíveis"
                    />
                  </TableHead>
                  <SortableHeader label="Manutenção" field="subject" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="min-w-[220px]" />
                  <SortableHeader label="Imóvel" field="property" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="min-w-[140px]" />
                  <SortableHeader label="Valor" field="amount_cents" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[120px] text-right" />
                  <SortableHeader label="Aporte da gestão" field="management_contribution_cents" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[140px] text-right" />
                  <SortableHeader label="Data" field="scheduled_at" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[110px] text-center" />
                  <TableHead className="w-[80px] text-center">Anexos</TableHead>
                  <SortableHeader label="Etiqueta" field="service_type" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[160px]" />
                  <SortableHeader label="Arquivado em" field="archived_at" currentSort={sortField} direction={sortDirection} onSort={handleSort} className="w-[130px] pr-4 text-center" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedItems.map((item) => {
                  const etiquetas = rotulosServico(item.service_type);
                  const selecionado = selectedIds.has(item.id);
                  return (
                    <TableRow
                      key={item.id}
                      className={cn("cursor-pointer", selecionado && "bg-primary/5")}
                      onClick={() => abrirItem(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") abrirItem(item);
                      }}
                      tabIndex={0}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selecionado}
                          onCheckedChange={() => toggleSelection(item.id)}
                          aria-label={`Selecionar ${item.subject}`}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="line-clamp-1 text-[13px] font-medium" title={item.subject}>
                          {item.subject}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.type === "charge" ? "Cobrança" : "Manutenção"}</p>
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">{item.property?.name || "—"}</TableCell>
                      <TableCell className="text-right text-[13px] font-medium tabular-nums">
                        {item.amount_cents ? formatarBRL(item.amount_cents) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums text-success">
                        {item.management_contribution_cents ? formatarBRL(item.management_contribution_cents) : "—"}
                      </TableCell>
                      <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                        {item.scheduled_at ? formatarData(item.scheduled_at) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs tabular-nums",
                            (item.attachments_count || 0) > 0 ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                          {item.attachments_count || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        {etiquetas.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {etiquetas.map((e) => (
                              <Etiqueta key={e} tom="neutral">
                                {e}
                              </Etiqueta>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-center text-xs tabular-nums text-muted-foreground">
                        {formatarData(item.archived_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Celular: linhas */}
          <div className="space-y-1.5 md:hidden">
            {filteredAndSortedItems.map((item) => {
              const etiquetas = rotulosServico(item.service_type);
              return (
                <LinhaCaixa
                  key={item.id}
                  titulo={item.subject}
                  subtitulo={
                    <>
                      {item.property?.name || "—"} · arquivado em {formatarData(item.archived_at)}
                      {etiquetas.length > 0 ? ` · ${etiquetas.join(", ")}` : ""}
                    </>
                  }
                  meta={
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[13px] font-semibold tabular-nums">
                        {item.amount_cents ? formatarBRL(item.amount_cents) : "—"}
                      </span>
                      {(item.attachments_count || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Paperclip className="h-3 w-3" aria-hidden="true" />
                          {item.attachments_count}
                        </span>
                      )}
                    </div>
                  }
                  acoes={
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelection(item.id)}
                      aria-label={`Selecionar ${item.subject}`}
                    />
                  }
                  onClick={() => abrirItem(item)}
                  className="bg-card"
                />
              );
            })}
          </div>
        </>
      )}
    </PaginaInterna>
  );
}
