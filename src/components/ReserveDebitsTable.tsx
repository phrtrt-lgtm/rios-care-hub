import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ChevronDown, 
  ChevronRight, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  Check,
  Loader2,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface ReserveDebitItem {
  id: string;
  title: string;
  property: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  reserve_debit_date: string | null;
  amount_cents: number;
  reserve_base_commission_percent: number | null;
  reserve_extra_commission_percent: number | null;
  reserve_commission_percent: number | null;
}

type SortField = "property" | "reserve_debit_date" | "amount_cents" | "reserve_commission_percent";
type SortDirection = "asc" | "desc" | null;

export function ReserveDebitsTable() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [sortField, setSortField] = useState<SortField | null>("reserve_debit_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedDebit, setSelectedDebit] = useState<ReserveDebitItem | null>(null);
  const [newCommission, setNewCommission] = useState("");

  // Fetch reserve debits
  const { data: debits, isLoading } = useQuery({
    queryKey: ["reserve-debits-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select(`
          id,
          title,
          reserve_debit_date,
          amount_cents,
          reserve_base_commission_percent,
          reserve_extra_commission_percent,
          reserve_commission_percent,
          property:properties!charges_property_id_fkey(id, name),
          owner:profiles!charges_owner_id_fkey(id, name)
        `)
        .eq("status", "aguardando_reserva")
        .is("archived_at", null)
        .order("reserve_debit_date", { ascending: true });

      if (error) throw error;
      return data as ReserveDebitItem[];
    },
  });

  // Confirm debit mutation
  const confirmDebitMutation = useMutation({
    mutationFn: async ({ id, newCommissionPercent }: { id: string; newCommissionPercent?: number }) => {
      const updateData: any = {
        status: "debited",
        debited_at: new Date().toISOString(),
      };

      if (newCommissionPercent !== undefined) {
        updateData.reserve_commission_percent = newCommissionPercent;
      }

      const { error } = await supabase
        .from("charges")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reserve-debits-list"] });
      toast.success("Débito confirmado com sucesso!");
      setConfirmDialogOpen(false);
      setSelectedDebit(null);
      setNewCommission("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao confirmar débito");
    },
  });

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

  // Sort debits
  const sortedDebits = useMemo(() => {
    if (!debits || !sortField || !sortDirection) return debits || [];

    return [...debits].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case "property":
          aValue = (a.property?.name || "").toLowerCase();
          bValue = (b.property?.name || "").toLowerCase();
          break;
        case "reserve_debit_date":
          aValue = a.reserve_debit_date || "";
          bValue = b.reserve_debit_date || "";
          break;
        case "amount_cents":
          aValue = a.amount_cents || 0;
          bValue = b.amount_cents || 0;
          break;
        case "reserve_commission_percent":
          aValue = a.reserve_commission_percent || 0;
          bValue = b.reserve_commission_percent || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [debits, sortField, sortDirection]);

  // Split into categories by date
  const { overdueDebits, todayDebits, upcomingDebits } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = format(today, "yyyy-MM-dd");

    const overdueDebits: ReserveDebitItem[] = [];
    const todayDebits: ReserveDebitItem[] = [];
    const upcomingDebits: ReserveDebitItem[] = [];

    (sortedDebits || []).forEach(debit => {
      if (!debit.reserve_debit_date) {
        upcomingDebits.push(debit);
      } else if (debit.reserve_debit_date < todayStr) {
        overdueDebits.push(debit);
      } else if (debit.reserve_debit_date === todayStr) {
        todayDebits.push(debit);
      } else {
        upcomingDebits.push(debit);
      }
    });

    return { overdueDebits, todayDebits, upcomingDebits };
  }, [sortedDebits]);

  const handleOpenConfirm = (debit: ReserveDebitItem) => {
    setSelectedDebit(debit);
    setNewCommission(debit.reserve_commission_percent?.toString() || "");
    setConfirmDialogOpen(true);
  };

  const handleConfirmDebit = () => {
    if (!selectedDebit) return;
    
    const newCommissionPercent = newCommission ? parseFloat(newCommission) : undefined;
    confirmDebitMutation.mutate({ 
      id: selectedDebit.id, 
      newCommissionPercent 
    });
  };

  const renderSortableHeader = (label: string, field: SortField, className?: string) => {
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

  const renderDebitRow = (debit: ReserveDebitItem, urgencyColor?: string) => {
    const baseCommission = debit.reserve_base_commission_percent ?? 0;
    const extraCommission = debit.reserve_extra_commission_percent ?? 0;
    const originalCommission = baseCommission + extraCommission;
    const newCommissionValue = debit.reserve_commission_percent ?? originalCommission;

    return (
      <tr 
        key={debit.id}
        className={cn(
          "border-b hover:bg-muted/30 transition-colors h-12",
          urgencyColor
        )}
      >
        {/* Imóvel */}
        <td className="p-0 max-w-[180px]">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="px-3 py-2 text-sm font-medium truncate">
                  {debit.property?.name || "—"}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{debit.property?.name || "—"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>

        {/* Proprietário */}
        <td className="p-0 max-w-[120px]">
          <div className="px-2 py-2 text-sm text-muted-foreground truncate">
            {debit.owner?.name || "—"}
          </div>
        </td>

        {/* Data Check-in */}
        <td className="p-0 w-[100px]">
          <div className="px-2 py-2 text-sm text-center">
            {debit.reserve_debit_date 
              ? format(new Date(debit.reserve_debit_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
              : "—"
            }
          </div>
        </td>

        {/* Valor do Débito */}
        <td className="p-0 w-[110px]">
          <div className="px-2 py-2 text-sm text-right font-medium">
            {formatBRL(debit.amount_cents)}
          </div>
        </td>

        {/* Comissão Original */}
        <td className="p-0 w-[100px]">
          <div className="px-2 py-2 text-sm text-center text-muted-foreground">
            {originalCommission.toFixed(1)}%
          </div>
        </td>

        {/* Nova Comissão */}
        <td className="p-0 w-[100px]">
          <div className="px-2 py-2 text-sm text-center font-medium">
            {newCommissionValue !== originalCommission ? (
              <span className="text-green-600">{newCommissionValue.toFixed(1)}%</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </td>

        {/* Ação */}
        <td className="p-0 w-[130px]">
          <div className="flex justify-center px-2 py-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => handleOpenConfirm(debit)}
            >
              <Check className="h-3 w-3" />
              Confirmar
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  const totalCount = (debits || []).length;

  if (totalCount === 0 && !isLoading) {
    return null; // Don't render if no debits
  }

  return (
    <>
      <Card className="overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-muted text-muted-foreground">
              <tr className="h-10">
                {renderSortableHeader("Imóvel", "property", "text-left w-[180px]")}
                <th className="text-left px-2 py-2 font-medium w-[120px]">Proprietário</th>
                {renderSortableHeader("Check-in", "reserve_debit_date", "text-center w-[100px]")}
                {renderSortableHeader("Débito", "amount_cents", "text-right w-[110px]")}
                <th className="text-center px-2 py-2 font-medium w-[100px]">Comissão Original</th>
                {renderSortableHeader("Nova Comissão", "reserve_commission_percent", "text-center w-[100px]")}
                <th className="text-center px-2 py-2 font-medium w-[130px]">Ação</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center p-4 text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : (
                <>
                  {/* Group Header */}
                  <tr 
                    className="bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border-l-4 border-l-blue-500"
                    onClick={() => setExpanded(!expanded)}
                  >
                    <td colSpan={7} className="p-2">
                      <div className="flex items-center gap-2 font-medium">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span>Débitos em Reserva</span>
                        <Badge variant="secondary" className="ml-2">
                          {totalCount}
                        </Badge>
                        {overdueDebits.length > 0 && (
                          <Badge variant="destructive" className="ml-1">
                            {overdueDebits.length} atrasado{overdueDebits.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                        {todayDebits.length > 0 && (
                          <Badge className="ml-1 bg-amber-500">
                            {todayDebits.length} hoje
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Render rows */}
                  {expanded && (
                    <>
                      {overdueDebits.map((debit) => renderDebitRow(debit, "bg-red-50 dark:bg-red-950/20"))}
                      {todayDebits.map((debit) => renderDebitRow(debit, "bg-amber-50 dark:bg-amber-950/20"))}
                      {upcomingDebits.map((debit) => renderDebitRow(debit))}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Débito em Reserva</DialogTitle>
            <DialogDescription>
              Confirme que o débito foi realizado na plataforma de reservas.
            </DialogDescription>
          </DialogHeader>

          {selectedDebit && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Imóvel:</span>
                  <p className="font-medium">{selectedDebit.property?.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Proprietário:</span>
                  <p className="font-medium">{selectedDebit.owner?.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Valor do Débito:</span>
                  <p className="font-medium">{formatBRL(selectedDebit.amount_cents)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Data Check-in:</span>
                  <p className="font-medium">
                    {selectedDebit.reserve_debit_date 
                      ? format(new Date(selectedDebit.reserve_debit_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                      : "—"
                    }
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newCommission">
                  Nova Comissão da Reserva (%)
                </Label>
                <Input
                  id="newCommission"
                  type="number"
                  step="0.1"
                  placeholder={`Comissão original: ${((selectedDebit.reserve_base_commission_percent ?? 0) + (selectedDebit.reserve_extra_commission_percent ?? 0)).toFixed(1)}%`}
                  value={newCommission}
                  onChange={(e) => setNewCommission(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Deixe em branco para manter a comissão calculada automaticamente.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmDebit}
              disabled={confirmDebitMutation.isPending}
            >
              {confirmDebitMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar Débito
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
