import { Fragment, useState, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveScrollPosition } from "@/lib/navigation";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Building2, Calculator, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarBRL, formatarData, valorDevido } from "@/lib/cobrancaMeta";
import { estaVencida } from "@/lib/vencimento";
import { CHARGE_CATEGORIES } from "@/constants/chargeCategories";
import { DebitoReservaCalculator } from "@/components/DebitoReservaCalculator";
import { EtiquetaStatusCobranca } from "@/components/cobrancas/EtiquetaStatusCobranca";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { BotaoLinha, GrupoCaixa, LinhaCaixa, MiniaturaImovel, SeloContagem } from "@/components/painel/CaixaOperacao";
import { cobrancaVencida } from "@/lib/vencimento";

interface Charge {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  credit_applied_cents?: number | null;
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

/**
 * A única regra de "vencida" da lista de cobranças em aberto: passou do dia do
 * vencimento (ou já está marcada como vencida) e ainda não foi paga. A página
 * (`GerenciarCobrancas`) conta `overdueCount` com a mesma expressão.
 */

interface CreditRow {
  id: string;
  owner_id: string;
  origin_type: string | null;
  origin_note: string | null;
  origin_reservations: Array<{ date?: string; description?: string }> | null;
  initial_amount_cents: number;
  remaining_amount_cents: number;
  created_at: string;
  applications: Array<{ id: string; amount_applied_cents: number; charge_id: string | null }> | null;
}

export function OpenChargesTable({
  propertyGroups,
  selectedCharges,
  onToggleChargeSelection,
  onEditCharge
}: OpenChargesTableProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField | null>("due_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorCharge, setCalculatorCharge] = useState<Charge | null>(null);

  // Retenções retroativas em reserva, agrupadas por proprietário (exibidas dentro do imóvel)
  const { data: retentionsByOwner } = useQuery({
    queryKey: ["reserve-retentions-by-owner"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_credits")
        .select(`id, owner_id, origin_type, origin_note, origin_reservations, initial_amount_cents,
                 remaining_amount_cents, created_at,
                 applications:owner_credit_applications(id, amount_applied_cents, charge_id)`)
        .in("origin_type", ["reserve_retention", "manual_adjustment"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, CreditRow[]> = {};
      for (const row of (data ?? []) as unknown as CreditRow[]) {
        (map[row.owner_id] ||= []).push(row);
      }
      return map;
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

  const earliestDue = (group: PropertyGroup) =>
    group.charges.reduce((min, c) => (c.due_date && (!min || c.due_date < min) ? c.due_date : min), null as string | null);

  // Sort property groups
  const sortedGroups = useMemo(() => {
    if (!propertyGroups || !sortField || !sortDirection) return propertyGroups;

    return [...propertyGroups].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

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
          aValue = earliestDue(a) || "9999-99-99";
          bValue = earliestDue(b) || "9999-99-99";
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

  const handleOpenCalculator = (charge: Charge) => {
    setCalculatorCharge(charge);
    setCalculatorOpen(true);
  };

  const abrirCobranca = (charge: Charge) => {
    saveScrollPosition(pathname);
    navigate(`/cobranca/${charge.id}`);
  };

  const ativarComTeclado = (acao: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      acao();
    }
  };

  const renderSortableHeader = (label: string, field: SortField, className?: string) => {
    const isActive = sortField === field;
    return (
      <th
        scope="col"
        role="button"
        tabIndex={0}
        aria-sort={isActive ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
        className={cn(
          "px-2 py-2 font-medium cursor-pointer select-none transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          className,
        )}
        onClick={() => handleSort(field)}
        onKeyDown={ativarComTeclado(() => handleSort(field))}
      >
        <div className={cn("flex items-center gap-1", className?.includes("text-right") && "justify-end", className?.includes("text-center") && "justify-center")}>
          <span>{label}</span>
          {isActive ? (
            sortDirection === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-50" aria-hidden="true" />
          )}
        </div>
      </th>
    );
  };

  const somaTotal = (charges: Charge[]) => charges.reduce((s, c) => s + (c.amount_cents || 0), 0);
  const somaAporte = (charges: Charge[]) => charges.reduce((s, c) => s + (c.management_contribution_cents || 0), 0);
  const somaCredito = (charges: Charge[]) => charges.reduce((s, c) => s + (c.credit_applied_cents || 0), 0);

  const todasCobrancas = propertyGroups.flatMap((g) => g.charges);
  const totalOverdue = propertyGroups.reduce((acc, g) => acc + g.overdueCount, 0);
  const totalOpen = propertyGroups.reduce((acc, g) => acc + g.openCount, 0);
  const totalAmount = propertyGroups.reduce((acc, g) => acc + g.totalDueCents, 0);

  // Sem grupos, a página decide o vazio (ilustração de cobranças ou de busca).
  if (propertyGroups.length === 0) {
    return null;
  }

  const categoria = (charge: Charge) =>
    charge.category ? CHARGE_CATEGORIES[charge.category as keyof typeof CHARGE_CATEGORIES] || charge.category : null;

  const renderCreditRow = (group: PropertyGroup, credit: CreditRow) => {
    const chargeIdsHere = new Set(group.charges.map((c) => c.id));
    const appliedHere = (credit.applications ?? [])
      .filter((a) => a.charge_id && chargeIdsHere.has(a.charge_id))
      .reduce((s, a) => s + (a.amount_applied_cents || 0), 0);
    const isManual = credit.origin_type === "manual_adjustment";
    const manualEntry = isManual ? (credit.origin_reservations ?? [])[0] : undefined;
    const dates = (credit.origin_reservations ?? [])
      .map((r) => (r?.date ? formatarData(r.date, "dd/MM/yy") : null))
      .filter(Boolean)
      .join(", ");
    const titulo = isManual ? credit.origin_note || "Registro avulso" : "Débito retroativo em reserva";
    const detalhe = isManual
      ? manualEntry?.description || "Crédito registrado manualmente"
      : dates
        ? `Reserva(s): ${dates}`
        : credit.origin_note;
    return { appliedHere, titulo, detalhe };
  };

  return (
    <>
      {/* Desktop: tabela por imóvel */}
      <Card className="hidden overflow-hidden rounded-xl border-border/70 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr className="h-10">
                <th scope="col" className="w-[40px] px-2">
                  <span className="sr-only">Expandir ou selecionar</span>
                </th>
                {renderSortableHeader("Imóvel", "property", "text-left")}
                {renderSortableHeader("Proprietário", "owner", "text-left")}
                {renderSortableHeader("Vencimento", "due_date", "text-center w-[100px]")}
                <th scope="col" className="text-right px-2 py-2 font-medium w-[100px]">Total</th>
                <th scope="col" className="text-right px-2 py-2 font-medium w-[100px]">Aporte</th>
                <th scope="col" className="text-right px-2 py-2 font-medium w-[100px]">Crédito</th>
                {renderSortableHeader("A pagar", "amount", "text-right w-[120px]")}
                {renderSortableHeader("Status", "status", "text-center w-[150px]")}
                <th scope="col" className="text-center px-2 py-2 font-medium w-[80px]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha de resumo */}
              <tr className="bg-primary/5 border-b font-medium">
                <td className="px-2 py-3"></td>
                <td className="px-2 py-3">
                  {sortedGroups.length} {sortedGroups.length === 1 ? "imóvel" : "imóveis"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {todasCobrancas.length} {todasCobrancas.length === 1 ? "cobrança" : "cobranças"}
                  </span>
                </td>
                <td className="px-2 py-3 text-muted-foreground">—</td>
                <td className="px-2 py-3 text-center text-muted-foreground">—</td>
                <td className="px-2 py-3 text-right text-muted-foreground tabular-nums">{formatarBRL(somaTotal(todasCobrancas))}</td>
                <td className="px-2 py-3 text-right text-muted-foreground tabular-nums">{formatarBRL(somaAporte(todasCobrancas))}</td>
                <td className="px-2 py-3 text-right text-muted-foreground tabular-nums">{formatarBRL(somaCredito(todasCobrancas))}</td>
                <td className="px-2 py-3 text-right text-primary font-bold tabular-nums">{formatarBRL(totalAmount)}</td>
                <td className="px-2 py-3 text-center">
                  <div className="flex flex-wrap justify-center gap-1">
                    {totalOverdue > 0 && (
                      <SeloContagem tom="destructive" title="Cobranças vencidas">{totalOverdue} venc.</SeloContagem>
                    )}
                    {totalOpen > 0 && (
                      <SeloContagem tom="info" title="Cobranças no prazo">{totalOpen} no prazo</SeloContagem>
                    )}
                  </div>
                </td>
                <td className="px-2 py-3"></td>
              </tr>

              {/* Imóveis */}
              {sortedGroups.map((group) => {
                const isExpanded = expandedProperties.has(group.id);
                const earliestDueDate = earliestDue(group);
                const credits = isExpanded ? (retentionsByOwner?.[group.charges[0]?.owner_id ?? ""] ?? []) : [];

                return (
                  <Fragment key={group.id}>
                    {/* Linha do imóvel */}
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      className={cn(
                        "border-b hover:bg-muted/30 cursor-pointer transition-colors h-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        group.overdueCount > 0 && "bg-destructive/10",
                        isExpanded && "bg-muted/20"
                      )}
                      onClick={() => toggleProperty(group.id)}
                      onKeyDown={ativarComTeclado(() => toggleProperty(group.id))}
                    >
                      <td className="px-2 py-2 text-center">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <MiniaturaImovel url={group.cover_photo_url} fallback={<Building2 />} tamanho="h-8 w-8" />
                          <span className="font-medium truncate max-w-[180px] block" title={group.name}>{group.name}</span>
                          <SeloContagem title="Cobranças neste imóvel">{group.charges.length}</SeloContagem>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <span className="text-muted-foreground truncate max-w-[150px] block">{group.ownerName}</span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {earliestDueDate ? (
                          <span className={cn("text-xs tabular-nums", estaVencida(earliestDueDate) && "text-destructive font-medium")}>
                            {formatarData(earliestDueDate, "dd/MM/yy")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground text-xs tabular-nums">
                        {formatarBRL(somaTotal(group.charges))}
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground text-xs tabular-nums">
                        {formatarBRL(somaAporte(group.charges))}
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground text-xs tabular-nums">
                        {somaCredito(group.charges) > 0 ? formatarBRL(somaCredito(group.charges)) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {formatarBRL(group.totalDueCents)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          {group.overdueCount > 0 && (
                            <SeloContagem tom="destructive" title="Cobranças vencidas">{group.overdueCount} venc.</SeloContagem>
                          )}
                          {group.openCount > 0 && (
                            <SeloContagem tom="info" title="Cobranças no prazo">{group.openCount} no prazo</SeloContagem>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2"></td>
                    </tr>

                    {/* Débitos retroativos em reserva do proprietário deste imóvel */}
                    {credits.map((credit) => {
                      const { appliedHere, titulo, detalhe } = renderCreditRow(group, credit);
                      const comSaldo = credit.remaining_amount_cents > 0;
                      return (
                        <tr key={`credit-${group.id}-${credit.id}`} className="border-b bg-success/5">
                          <td className="px-2 py-2 text-center">
                            <Wallet className="h-3.5 w-3.5 text-success mx-auto" aria-hidden="true" />
                          </td>
                          <td className="px-2 py-2 pl-12" colSpan={3}>
                            <span className="text-xs text-foreground font-medium">{titulo}</span>
                            {detalhe && <span className="text-xs text-muted-foreground ml-2">{detalhe}</span>}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-muted-foreground tabular-nums">
                            {formatarBRL(credit.initial_amount_cents)}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-muted-foreground">—</td>
                          <td className="px-2 py-2 text-right text-xs text-success tabular-nums">
                            {appliedHere > 0 ? `−${formatarBRL(appliedHere)}` : "—"}
                          </td>
                          <td className="px-2 py-2 text-right text-xs font-medium text-success tabular-nums">
                            {comSaldo ? formatarBRL(credit.remaining_amount_cents) : formatarBRL(0)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <Etiqueta tom="success">{comSaldo ? "Saldo credor" : "Abatido"}</Etiqueta>
                          </td>
                          <td className="px-2 py-2"></td>
                        </tr>
                      );
                    })}

                    {/* Cobranças do imóvel */}
                    {isExpanded && group.charges.map((charge) => {
                      const vencida = cobrancaVencida(charge);
                      const selecionada = selectedCharges.has(charge.id);
                      return (
                        <tr
                          key={charge.id}
                          className={cn(
                            "border-b bg-muted/10 hover:bg-muted/30 transition-colors h-11",
                            selecionada && "bg-primary/10"
                          )}
                        >
                          <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selecionada}
                              onCheckedChange={() => onToggleChargeSelection(charge.id)}
                              aria-label={`Selecionar ${charge.title}`}
                            />
                          </td>
                          <td className="px-2 py-2 pl-12">
                            <div
                              role="button"
                              tabIndex={0}
                              className="truncate max-w-[220px] cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title={charge.title}
                              onClick={() => abrirCobranca(charge)}
                              onKeyDown={ativarComTeclado(() => abrirCobranca(charge))}
                            >
                              <span className="text-sm">{charge.title}</span>
                              {categoria(charge) && (
                                <span className="text-xs text-muted-foreground ml-2">({categoria(charge)})</span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-muted-foreground text-sm">
                            {charge.owner.name}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {charge.due_date ? (
                              <span className={cn("text-xs tabular-nums", vencida && "text-destructive font-medium")}>
                                {formatarData(charge.due_date, "dd/MM/yy")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-muted-foreground tabular-nums">
                            {formatarBRL(charge.amount_cents)}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-muted-foreground tabular-nums">
                            {charge.management_contribution_cents > 0 ? formatarBRL(charge.management_contribution_cents) : "—"}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-success tabular-nums">
                            {(charge.credit_applied_cents || 0) > 0 ? `−${formatarBRL(charge.credit_applied_cents || 0)}` : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span className="text-sm font-medium tabular-nums">{formatarBRL(valorDevido(charge))}</span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex justify-center">
                              <EtiquetaStatusCobranca status={charge.status} />
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-0.5">
                              {vencida && (
                                <BotaoLinha rotulo="Calcular débito em reserva" tom="warning" onClick={() => handleOpenCalculator(charge)}>
                                  <Calculator />
                                </BotaoLinha>
                              )}
                              <BotaoLinha rotulo="Editar cobrança" onClick={() => onEditCharge(charge)}>
                                <Pencil />
                              </BotaoLinha>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Celular: grupos por imóvel com linhas clicáveis */}
      <Card className="space-y-4 rounded-xl border-border/70 p-3 md:hidden">
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
          <span>
            {sortedGroups.length} {sortedGroups.length === 1 ? "imóvel" : "imóveis"} · {todasCobrancas.length}{" "}
            {todasCobrancas.length === 1 ? "cobrança" : "cobranças"}
          </span>
          <span className="font-semibold tabular-nums text-primary">{formatarBRL(totalAmount)}</span>
        </div>
        {sortedGroups.map((group) => {
          const credits = retentionsByOwner?.[group.charges[0]?.owner_id ?? ""] ?? [];
          return (
            <GrupoCaixa
              key={group.id}
              titulo={group.name}
              quantidade={group.charges.length}
              tom={group.overdueCount > 0 ? "destructive" : "neutral"}
            >
              {group.charges.map((charge) => {
                const vencida = cobrancaVencida(charge);
                const selecionada = selectedCharges.has(charge.id);
                return (
                  <LinhaCaixa
                    key={charge.id}
                    miniatura={
                      <span className="flex h-9 w-6 shrink-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selecionada}
                          onCheckedChange={() => onToggleChargeSelection(charge.id)}
                          aria-label={`Selecionar ${charge.title}`}
                        />
                      </span>
                    }
                    titulo={charge.title}
                    subtitulo={
                      <>
                        {charge.owner.name}
                        {charge.due_date && <> · Vence {formatarData(charge.due_date, "dd/MM/yy")}</>}
                      </>
                    }
                    meta={
                      <div className="flex flex-col items-end gap-1">
                        <EtiquetaStatusCobranca status={charge.status} />
                        <span className="text-[13px] font-semibold tabular-nums">{formatarBRL(valorDevido(charge))}</span>
                      </div>
                    }
                    acoes={
                      <>
                        {vencida && (
                          <BotaoLinha rotulo="Calcular débito em reserva" tom="warning" onClick={() => handleOpenCalculator(charge)}>
                            <Calculator />
                          </BotaoLinha>
                        )}
                        <BotaoLinha rotulo="Editar cobrança" onClick={() => onEditCharge(charge)}>
                          <Pencil />
                        </BotaoLinha>
                      </>
                    }
                    tom={vencida ? "destructive" : "neutral"}
                    tingida={vencida}
                    onClick={() => abrirCobranca(charge)}
                    className={cn("bg-card", selecionada && "ring-2 ring-primary/40")}
                  />
                );
              })}
              {credits.map((credit) => {
                const { appliedHere, titulo, detalhe } = renderCreditRow(group, credit);
                const comSaldo = credit.remaining_amount_cents > 0;
                return (
                  <LinhaCaixa
                    key={`credit-${group.id}-${credit.id}`}
                    miniatura={
                      <span className="flex h-9 w-6 shrink-0 items-center justify-center text-success">
                        <Wallet className="h-4 w-4" aria-hidden="true" />
                      </span>
                    }
                    titulo={titulo}
                    subtitulo={detalhe || undefined}
                    meta={
                      <div className="flex flex-col items-end gap-1">
                        <Etiqueta tom="success">{comSaldo ? "Saldo credor" : "Abatido"}</Etiqueta>
                        <span className="text-[11px] tabular-nums text-success">
                          {appliedHere > 0 ? `Crédito −${formatarBRL(appliedHere)}` : formatarBRL(credit.remaining_amount_cents)}
                        </span>
                      </div>
                    }
                    tom="success"
                    tingida
                    semSeta
                  />
                );
              })}
            </GrupoCaixa>
          );
        })}
      </Card>

      {/* Calculadora de débito em reserva */}
      {calculatorCharge && (
        <DebitoReservaCalculator
          open={calculatorOpen}
          onOpenChange={setCalculatorOpen}
          propertyName={calculatorCharge.property?.name || "Sem imóvel"}
          totalDebtCents={valorDevido(calculatorCharge)}
          chargeIds={[calculatorCharge.id]}
          onDebitConfirmed={() => {
            setCalculatorOpen(false);
            setCalculatorCharge(null);
          }}
        />
      )}
    </>
  );
}
