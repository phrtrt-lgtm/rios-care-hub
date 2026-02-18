import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ChevronDown, 
  ChevronRight, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  Pencil,
  Building2,
  Calculator
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CHARGE_CATEGORIES } from "@/constants/chargeCategories";
import { DebitoReservaCalculator } from "@/components/DebitoReservaCalculator";

interface Charge {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  currency: string;
  due_date: string | null;
  status: string;
  payment_link_url: string | null;
  created_at: string;
  owner_id: string;
  property_id: string | null;
  owner: {
    name: string;
    email: string;
  };
  property?: {
    id: string;
    name: string;
    cover_photo_url: string | null;
  };
}

interface PropertyGroup {
  id: string;
  name: string;
  cover_photo_url: string | null;
  ownerName: string;
  charges: Charge[];
  openCount: number;
  overdueCount: number;
  totalDueCents: number;
}

interface OpenChargesTableProps {
  propertyGroups: PropertyGroup[];
  selectedCharges: Set<string>;
  onToggleChargeSelection: (chargeId: string) => void;
  onEditCharge: (charge: Charge) => void;
}

type SortField = "property" | "owner" | "due_date" | "amount" | "status";
type SortDirection = "asc" | "desc" | null;

export function OpenChargesTable({ 
  propertyGroups, 
  selectedCharges, 
  onToggleChargeSelection,
  onEditCharge 
}: OpenChargesTableProps) {
  const navigate = useNavigate();
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField | null>("due_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorCharge, setCalculatorCharge] = useState<Charge | null>(null);

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

  // Sort property groups
  const sortedGroups = useMemo(() => {
    if (!propertyGroups || !sortField || !sortDirection) return propertyGroups;

    return [...propertyGroups].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case "property":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "owner":
          aValue = a.ownerName.toLowerCase();
          bValue = b.ownerName.toLowerCase();
          break;
        case "due_date":
          // Sort by earliest due date in charges
          const aEarliest = a.charges.reduce((min, c) => 
            c.due_date && (!min || c.due_date < min) ? c.due_date : min, 
            null as string | null
          );
          const bEarliest = b.charges.reduce((min, c) => 
            c.due_date && (!min || c.due_date < min) ? c.due_date : min, 
            null as string | null
          );
          aValue = aEarliest || "9999-99-99";
          bValue = bEarliest || "9999-99-99";
          break;
        case "amount":
          aValue = a.totalDueCents;
          bValue = b.totalDueCents;
          break;
        case "status":
          aValue = a.overdueCount;
          bValue = b.overdueCount;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [propertyGroups, sortField, sortDirection]);

  const toggleProperty = (propertyId: string) => {
    const newExpanded = new Set(expandedProperties);
    if (newExpanded.has(propertyId)) {
      newExpanded.delete(propertyId);
    } else {
      newExpanded.add(propertyId);
    }
    setExpandedProperties(newExpanded);
  };

  const isChargeOverdue = (charge: Charge) => {
    return charge.due_date && new Date(charge.due_date) < new Date() && charge.status !== 'paid';
  };

  const handleOpenCalculator = (charge: Charge) => {
    setCalculatorCharge(charge);
    setCalculatorOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline"; className?: string }> = {
      draft: { label: 'Rascunho', variant: 'secondary' },
      sent: { label: 'Enviada', variant: 'default' },
      paid: { label: 'Paga', variant: 'default', className: 'bg-green-500' },
      overdue: { label: 'Vencida', variant: 'destructive' },
      cancelled: { label: 'Cancelada', variant: 'outline' },
      debited: { label: 'Débito em Reserva', variant: 'destructive', className: 'bg-red-700' },
      aguardando_reserva: { label: 'Aguardando Reserva', variant: 'secondary', className: 'bg-amber-500 text-white' }
    };

    const config = statusConfig[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant} className={cn("text-xs", config.className)}>{config.label}</Badge>;
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

  const totalCharges = propertyGroups.reduce((acc, g) => acc + g.charges.length, 0);
  const totalOverdue = propertyGroups.reduce((acc, g) => acc + g.overdueCount, 0);
  const totalOpen = propertyGroups.reduce((acc, g) => acc + g.openCount, 0);
  const totalAmount = propertyGroups.reduce((acc, g) => acc + g.totalDueCents, 0);

  if (propertyGroups.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">Nenhuma cobrança em aberto encontrada.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr className="h-10">
              <th className="w-[40px] px-2"></th>
              {renderSortableHeader("Imóvel", "property", "text-left")}
              {renderSortableHeader("Proprietário", "owner", "text-left")}
              {renderSortableHeader("Vencimento", "due_date", "text-center w-[100px]")}
              <th className="text-right px-2 py-2 font-medium w-[100px]">Total</th>
              <th className="text-right px-2 py-2 font-medium w-[100px]">Aporte</th>
              {renderSortableHeader("Valor Devido", "amount", "text-right w-[120px]")}
              {renderSortableHeader("Status", "status", "text-center w-[120px]")}
              <th className="text-center px-2 py-2 font-medium w-[80px]">Qtd</th>
              <th className="text-center px-2 py-2 font-medium w-[80px]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {/* Summary Row */}
            <tr className="bg-primary/5 border-b font-medium">
              <td className="px-2 py-3"></td>
              <td className="px-2 py-3">{sortedGroups.length} imóveis</td>
              <td className="px-2 py-3 text-muted-foreground">—</td>
              <td className="px-2 py-3 text-center text-muted-foreground">—</td>
              <td className="px-2 py-3 text-right text-muted-foreground">{formatBRL(propertyGroups.reduce((acc, g) => acc + g.charges.reduce((s, c) => s + c.amount_cents, 0), 0))}</td>
              <td className="px-2 py-3 text-right text-muted-foreground">{formatBRL(propertyGroups.reduce((acc, g) => acc + g.charges.reduce((s, c) => s + (c.management_contribution_cents || 0), 0), 0))}</td>
              <td className="px-2 py-3 text-right text-primary font-bold">{formatBRL(totalAmount)}</td>
              <td className="px-2 py-3 text-center">
                <div className="flex justify-center gap-1">
                  {totalOverdue > 0 && (
                    <Badge variant="destructive" className="text-xs">{totalOverdue}</Badge>
                  )}
                  {totalOpen > 0 && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">{totalOpen}</Badge>
                  )}
                </div>
              </td>
              <td className="px-2 py-3 text-center">{totalCharges}</td>
              <td className="px-2 py-3"></td>
            </tr>

            {/* Property Rows */}
            {sortedGroups.map((group) => {
              const isExpanded = expandedProperties.has(group.id);
              const earliestDueDate = group.charges.reduce((min, c) => 
                c.due_date && (!min || c.due_date < min) ? c.due_date : min, 
                null as string | null
              );

              return (
                <>
                  {/* Property Row */}
                  <tr 
                    key={group.id}
                    className={cn(
                      "border-b hover:bg-muted/30 cursor-pointer transition-colors h-12",
                      group.overdueCount > 0 && "bg-red-50/50 dark:bg-red-950/10",
                      isExpanded && "bg-muted/20"
                    )}
                    onClick={() => toggleProperty(group.id)}
                  >
                    <td className="px-2 py-2 text-center">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-muted flex-shrink-0 overflow-hidden">
                          {group.cover_photo_url ? (
                            <img 
                              src={group.cover_photo_url} 
                              alt={group.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-medium truncate max-w-[180px] block">{group.name}</span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p>{group.name}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <span className="text-muted-foreground truncate max-w-[150px] block">{group.ownerName}</span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {earliestDueDate ? (
                        <span className={cn(
                          "text-xs",
                          new Date(earliestDueDate) < new Date() && "text-destructive font-medium"
                        )}>
                          {format(new Date(earliestDueDate + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-muted-foreground text-xs">
                      {formatBRL(group.charges.reduce((s, c) => s + c.amount_cents, 0))}
                    </td>
                    <td className="px-2 py-2 text-right text-muted-foreground text-xs">
                      {formatBRL(group.charges.reduce((s, c) => s + (c.management_contribution_cents || 0), 0))}
                    </td>
                    <td className="px-2 py-2 text-right font-medium">
                      {formatBRL(group.totalDueCents)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        {group.overdueCount > 0 && (
                          <Badge variant="destructive" className="text-xs">{group.overdueCount} venc.</Badge>
                        )}
                        {group.openCount > 0 && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">{group.openCount}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center text-muted-foreground">
                      {group.charges.length}
                    </td>
                    <td className="px-2 py-2"></td>
                  </tr>

                  {/* Expanded Charges */}
                  {isExpanded && group.charges.map((charge) => (
                    <tr 
                      key={charge.id}
                      className={cn(
                        "border-b bg-muted/10 hover:bg-muted/30 transition-colors h-11",
                        selectedCharges.has(charge.id) && "bg-primary/10"
                      )}
                    >
                      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedCharges.has(charge.id)}
                          onCheckedChange={() => onToggleChargeSelection(charge.id)}
                        />
                      </td>
                      <td 
                        className="px-2 py-2 pl-12 cursor-pointer"
                        onClick={() => navigate(`/cobranca/${charge.id}`)}
                      >
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="truncate max-w-[200px]">
                                <span className="text-sm">{charge.title}</span>
                                {charge.category && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    ({CHARGE_CATEGORIES[charge.category as keyof typeof CHARGE_CATEGORIES] || charge.category})
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p>{charge.title}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground text-sm">
                        {charge.owner.name}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {charge.due_date ? (
                          <span className={cn(
                            "text-xs",
                            new Date(charge.due_date) < new Date() && charge.status !== 'paid' && "text-destructive font-medium"
                          )}>
                            {format(new Date(charge.due_date + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                        {formatBRL(charge.amount_cents)}
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                        {charge.management_contribution_cents > 0 ? formatBRL(charge.management_contribution_cents) : '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span className="text-sm font-medium">
                          {formatBRL(charge.amount_cents - (charge.management_contribution_cents || 0))}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {getStatusBadge(charge.status)}
                      </td>
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {isChargeOverdue(charge) && (
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                    onClick={() => handleOpenCalculator(charge)}
                                  >
                                    <Calculator className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Calcular débito em reserva</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => onEditCharge(charge)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Calculator Dialog */}
      {calculatorCharge && (
        <DebitoReservaCalculator
          open={calculatorOpen}
          onOpenChange={setCalculatorOpen}
          propertyName={calculatorCharge.property?.name || "Sem imóvel"}
          totalDebtCents={calculatorCharge.amount_cents - (calculatorCharge.management_contribution_cents || 0)}
          chargeIds={[calculatorCharge.id]}
          onDebitConfirmed={() => {
            setCalculatorOpen(false);
            setCalculatorCharge(null);
          }}
        />
      )}
    </Card>
  );
}
