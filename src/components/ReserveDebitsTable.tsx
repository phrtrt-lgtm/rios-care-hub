import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  ChevronDown, 
  ChevronRight, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  Check,
  Loader2,
  Calculator
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
import { DebitoReservaCalculator } from "@/components/DebitoReservaCalculator";

interface ChargeItem {
  id: string;
  title: string;
  property: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  reserve_debit_date: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  reserve_commission_percent: number | null;
}

interface GroupedDebit {
  key: string;
  owner_id: string;
  owner_name: string;
  reserve_debit_date: string | null;
  properties: string[];
  total_debit_cents: number; // amount - management_contribution summed
  new_commission_percent: number | null;
  charge_ids: string[];
  charges: ChargeItem[];
}

type SortField = "property" | "reserve_debit_date" | "total_debit_cents" | "new_commission_percent";
type SortDirection = "asc" | "desc" | null;

export function ReserveDebitsTable() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [sortField, setSortField] = useState<SortField | null>("reserve_debit_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupedDebit | null>(null);
  const [newCommission, setNewCommission] = useState("");
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorGroup, setCalculatorGroup] = useState<GroupedDebit | null>(null);

  // Fetch reserve debits
  const { data: charges, isLoading } = useQuery({
    queryKey: ["reserve-debits-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select(`
          id,
          title,
          reserve_debit_date,
          amount_cents,
          management_contribution_cents,
          reserve_commission_percent,
          property:properties!charges_property_id_fkey(id, name),
          owner:profiles!charges_owner_id_fkey(id, name)
        `)
        .eq("status", "aguardando_reserva")
        .is("archived_at", null)
        .order("reserve_debit_date", { ascending: true });

      if (error) throw error;
      return data as ChargeItem[];
    },
  });

  // Group charges by owner_id + reserve_debit_date
  const groupedDebits = useMemo(() => {
    if (!charges) return [];

    const groupMap = new Map<string, GroupedDebit>();

    charges.forEach(charge => {
      const key = `${charge.owner?.id || 'unknown'}_${charge.reserve_debit_date || 'no_date'}`;
      
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
          owner_id: charge.owner?.id || '',
          owner_name: charge.owner?.name || '',
          reserve_debit_date: charge.reserve_debit_date,
          properties: [],
          total_debit_cents: 0,
          new_commission_percent: charge.reserve_commission_percent,
          charge_ids: [],
          charges: [],
        });
      }

      const group = groupMap.get(key)!;
      
      // Add property if not already in list
      const propertyName = charge.property?.name;
      if (propertyName && !group.properties.includes(propertyName)) {
        group.properties.push(propertyName);
      }

      // Sum debit (amount - management contribution)
      const debitAmount = charge.amount_cents - (charge.management_contribution_cents || 0);
      group.total_debit_cents += debitAmount;

      // Track charge IDs for bulk operations
      group.charge_ids.push(charge.id);
      group.charges.push(charge);
    });

    return Array.from(groupMap.values());
  }, [charges]);

  // Confirm debit mutation - updates all charges in the group
  const confirmDebitMutation = useMutation({
    mutationFn: async ({ chargeIds, newCommissionPercent }: { chargeIds: string[]; newCommissionPercent?: number }) => {
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
        .in("id", chargeIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reserve-debits-list"] });
      toast.success("Débito confirmado com sucesso!");
      setConfirmDialogOpen(false);
      setSelectedGroup(null);
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

  // Sort grouped debits
  const sortedDebits = useMemo(() => {
    if (!groupedDebits || !sortField || !sortDirection) return groupedDebits;

    return [...groupedDebits].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case "property":
          aValue = (a.properties[0] || "").toLowerCase();
          bValue = (b.properties[0] || "").toLowerCase();
          break;
        case "reserve_debit_date":
          aValue = a.reserve_debit_date || "";
          bValue = b.reserve_debit_date || "";
          break;
        case "total_debit_cents":
          aValue = a.total_debit_cents;
          bValue = b.total_debit_cents;
          break;
        case "new_commission_percent":
          aValue = a.new_commission_percent || 0;
          bValue = b.new_commission_percent || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [groupedDebits, sortField, sortDirection]);

  // Split into categories by date
  const { overdueDebits, todayDebits, upcomingDebits } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = format(today, "yyyy-MM-dd");

    const overdueDebits: GroupedDebit[] = [];
    const todayDebits: GroupedDebit[] = [];
    const upcomingDebits: GroupedDebit[] = [];

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

  const handleOpenConfirm = (group: GroupedDebit) => {
    setSelectedGroup(group);
    setNewCommission(group.new_commission_percent?.toString() || "");
    setConfirmDialogOpen(true);
  };

  const handleOpenCalculator = (group: GroupedDebit) => {
    setCalculatorGroup(group);
    setCalculatorOpen(true);
  };

  const handleConfirmDebit = () => {
    if (!selectedGroup) return;
    
    const newCommissionPercent = newCommission ? parseFloat(newCommission) : undefined;
    confirmDebitMutation.mutate({ 
      chargeIds: selectedGroup.charge_ids, 
      newCommissionPercent 
    });
  };

  const handleCalculatorDebitConfirmed = () => {
    queryClient.invalidateQueries({ queryKey: ["reserve-debits-list"] });
    setCalculatorOpen(false);
    setCalculatorGroup(null);
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

  const renderDebitRow = (group: GroupedDebit, urgencyColor?: string) => {
    return (
      <tr 
        key={group.key}
        className={cn(
          "border-b hover:bg-muted/30 transition-colors h-12",
          urgencyColor
        )}
      >
        {/* Imóvel(is) */}
        <td className="p-0 max-w-[220px]">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="px-3 py-2 text-sm font-medium truncate">
                  {group.properties.join(", ") || "—"}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{group.properties.join(", ") || "—"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>

        {/* Data Check-in */}
        <td className="p-0 w-[110px]">
          <div className="px-2 py-2 text-sm text-center">
            {group.reserve_debit_date 
              ? format(new Date(group.reserve_debit_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
              : "—"
            }
          </div>
        </td>

        {/* Valor do Débito (já descontado aporte) */}
        <td className="p-0 w-[120px]">
          <div className="px-2 py-2 text-sm text-right font-medium">
            {formatBRL(group.total_debit_cents)}
          </div>
        </td>

        {/* Nova Comissão */}
        <td className="p-0 w-[120px]">
          <div className="px-2 py-2 text-sm text-center font-medium">
            {group.new_commission_percent != null ? (
              <span className="text-green-600">{group.new_commission_percent.toFixed(1)}%</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </td>

        {/* Qtd Cobranças */}
        <td className="p-0 w-[80px]">
          <div className="px-2 py-2 text-sm text-center text-muted-foreground">
            {group.charge_ids.length}
          </div>
        </td>

        {/* Ações */}
        <td className="p-0 w-[180px]">
          <div className="flex justify-center gap-1 px-2 py-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => handleOpenCalculator(group)}
            >
              <Calculator className="h-3 w-3" />
              Calcular
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => handleOpenConfirm(group)}
            >
              <Check className="h-3 w-3" />
              Confirmar
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  const totalCount = groupedDebits.length;

  if (totalCount === 0 && !isLoading) {
    return null; // Don't render if no debits
  }

  return (
    <>
      <Card className="overflow-hidden mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-muted text-muted-foreground">
              <tr className="h-10">
            {renderSortableHeader("Imóvel", "property", "text-left w-[220px]")}
            {renderSortableHeader("Check-in", "reserve_debit_date", "text-center w-[110px]")}
            {renderSortableHeader("Débito", "total_debit_cents", "text-right w-[120px]")}
            {renderSortableHeader("Nova Comissão", "new_commission_percent", "text-center w-[120px]")}
            <th className="text-center px-2 py-2 font-medium w-[80px]">Qtd</th>
            <th className="text-center px-2 py-2 font-medium w-[180px]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center p-4 text-muted-foreground">
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
                    <td colSpan={6} className="p-2">
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
                      {overdueDebits.map((group) => renderDebitRow(group, "bg-red-50 dark:bg-red-950/20"))}
                      {todayDebits.map((group) => renderDebitRow(group, "bg-amber-50 dark:bg-amber-950/20"))}
                      {upcomingDebits.map((group) => renderDebitRow(group))}
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

          {selectedGroup && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Imóvel(is):</span>
                  <p className="font-medium">{selectedGroup.properties.join(", ")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Proprietário:</span>
                  <p className="font-medium">{selectedGroup.owner_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Valor Total do Débito:</span>
                  <p className="font-medium">{formatBRL(selectedGroup.total_debit_cents)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Data Check-in:</span>
                  <p className="font-medium">
                    {selectedGroup.reserve_debit_date 
                      ? format(new Date(selectedGroup.reserve_debit_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                      : "—"
                    }
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Cobranças incluídas:</span>
                  <p className="font-medium">{selectedGroup.charge_ids.length}</p>
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
                  placeholder="Ex: 15.0"
                  value={newCommission}
                  onChange={(e) => setNewCommission(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Informe a nova comissão da reserva após o débito.
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

      {/* Calculator Dialog */}
      {calculatorGroup && (
        <DebitoReservaCalculator
          open={calculatorOpen}
          onOpenChange={setCalculatorOpen}
          propertyName={calculatorGroup.properties.join(", ") || "Sem imóvel"}
          totalDebtCents={calculatorGroup.total_debit_cents}
          chargeIds={calculatorGroup.charge_ids}
          onDebitConfirmed={handleCalculatorDebitConfirmed}
        />
      )}
    </>
  );
}
