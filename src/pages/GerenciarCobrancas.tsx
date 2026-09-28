import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Search, Trash2, Calculator, CreditCard, Building2, BarChart3, Plus, Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { EditChargeDialog } from "@/components/EditChargeDialog";
import { DebitoReservaCalculator } from "@/components/DebitoReservaCalculator";
import { ReserveDebitsTable } from "@/components/ReserveDebitsTable";
import { OpenChargesTable } from "@/components/OpenChargesTable";
import { ReserveRetentionsHistory } from "@/components/ReserveRetentionsHistory";
import { RecurringChargesPanel } from "@/components/RecurringChargesPanel";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { CaixaOperacao, MiniaturaImovel, SeloContagem } from "@/components/painel/CaixaOperacao";
import { formatarBRL, valorDevido } from "@/lib/cobrancaMeta";
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
  /** Em aberto e no prazo. */
  openCount: number;
  /** Vencidas: passou do dia do vencimento e não foi paga (`estaVencida` + `estaPaga`). */
  overdueCount: number;
  totalDueCents: number; // Total a receber (já com aporte e crédito deduzidos)
}

type Aba = "abertas" | "debito" | "recorrentes";

const GerenciarCobrancas = () => {
  useScrollRestoration();
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [propertyGroups, setPropertyGroups] = useState<PropertyGroup[]>([]);
  const [ownerCredits, setOwnerCredits] = useState<{ owner_id: string; owner_name: string; total_cents: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCharges, setSelectedCharges] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<Aba>("abertas");
  const [debitoCharges, setDebitoCharges] = useState<Charge[]>([]);
  const [debitoPropertyGroups, setDebitoPropertyGroups] = useState<PropertyGroup[]>([]);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [selectedPropertyForCalc, setSelectedPropertyForCalc] = useState<PropertyGroup | null>(null);
  const [selectedChargeIdsForCalc, setSelectedChargeIdsForCalc] = useState<string[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !['admin', 'agent', 'maintenance'].includes(profile?.role || '')) {
      navigate("/");
      return;
    }
    fetchCharges();
    fetchDebitoCharges();
    fetchOwnerCredits();
  }, [user, profile, authLoading, navigate]);

  const fetchOwnerCredits = async () => {
    const { data } = await supabase
      .from('owner_credits')
      .select('owner_id, remaining_amount_cents, owner:profiles!owner_credits_owner_id_fkey(name)')
      .eq('status', 'open')
      .gt('remaining_amount_cents', 0);
    const grouped: Record<string, { owner_id: string; owner_name: string; total_cents: number }> = {};
    (data ?? []).forEach((c: any) => {
      if (!grouped[c.owner_id]) {
        grouped[c.owner_id] = { owner_id: c.owner_id, owner_name: c.owner?.name || 'Proprietário', total_cents: 0 };
      }
      grouped[c.owner_id].total_cents += c.remaining_amount_cents || 0;
    });
    setOwnerCredits(Object.values(grouped).sort((a, b) => b.total_cents - a.total_cents));
  };

  useEffect(() => {
    groupChargesByProperty();
  }, [charges, searchTerm]);

  useEffect(() => {
    groupDebitoChargesByProperty();
  }, [debitoCharges]);

  const fetchCharges = async () => {
    try {
      setLoading(true);

      const { data: chargesData, error } = await supabase
        .from('charges')
        .select('*')
        .not('status', 'in', '(draft,paid,pago_no_vencimento,cancelled,pago_antecipado,pago_com_atraso,debited)')
        .is('archived_at', null)
        .or('cost_responsible.is.null,cost_responsible.neq.guest')
        .order('due_date', { ascending: true });

      if (error) throw error;

      const enrichedCharges = await Promise.all(
        (chargesData || []).map(async (charge) => {
          const [ownerResult, propertyResult] = await Promise.all([
            supabase
              .from('profiles')
              .select('name, email')
              .eq('id', charge.owner_id)
              .single(),
            charge.property_id
              ? supabase.from('properties').select('id, name, cover_photo_url').eq('id', charge.property_id).single()
              : Promise.resolve({ data: null })
          ]);

          return {
            ...charge,
            owner: ownerResult.data || { name: 'N/A', email: 'N/A' },
            property: propertyResult.data || undefined
          };
        })
      );

      setCharges(enrichedCharges);
    } catch (error) {
      console.error('Erro ao carregar cobranças:', error);
      toast({
        title: "Erro ao carregar cobranças",
        description: "Não foi possível carregar as cobranças.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDebitoCharges = async () => {
    try {
      // Dia local: toISOString() daria o dia UTC, que vira o dia seguinte a partir das 21h.
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const { data: chargesData, error } = await supabase
        .from('charges')
        .select('*')
        .in('status', ['overdue', 'sent', 'pendente', 'under_review', 'debit_notice_sent'])
        .lt('due_date', todayStr)
        .is('archived_at', null)
        .is('paid_at', null)
        .or('cost_responsible.is.null,cost_responsible.neq.guest')
        .order('due_date', { ascending: true });

      if (error) throw error;

      const enrichedCharges = await Promise.all(
        (chargesData || []).map(async (charge) => {
          const [ownerResult, propertyResult] = await Promise.all([
            supabase
              .from('profiles')
              .select('name, email')
              .eq('id', charge.owner_id)
              .single(),
            charge.property_id
              ? supabase.from('properties').select('id, name, cover_photo_url').eq('id', charge.property_id).single()
              : Promise.resolve({ data: null })
          ]);

          return {
            ...charge,
            owner: ownerResult.data || { name: 'N/A', email: 'N/A' },
            property: propertyResult.data || undefined
          };
        })
      );

      setDebitoCharges(enrichedCharges);
    } catch (error) {
      console.error('Erro ao carregar cobranças para débito:', error);
    }
  };

  const groupDebitoChargesByProperty = () => {
    const groups: Record<string, PropertyGroup> = {};

    debitoCharges.forEach(charge => {
      const propertyId = charge.property?.id || 'sem-imovel';
      const propertyName = charge.property?.name || 'Sem imóvel';

      if (!groups[propertyId]) {
        groups[propertyId] = {
          id: propertyId,
          name: propertyName,
          cover_photo_url: charge.property?.cover_photo_url || null,
          ownerName: charge.owner.name,
          charges: [],
          openCount: 0,
          overdueCount: 0,
          totalDueCents: 0
        };
      }

      groups[propertyId].charges.push(charge);
      groups[propertyId].totalDueCents += valorDevido(charge);
      groups[propertyId].overdueCount++;
    });

    const sortedGroups = Object.values(groups).sort((a, b) => b.totalDueCents - a.totalDueCents);
    setDebitoPropertyGroups(sortedGroups);
  };

  const openCalculator = (group: PropertyGroup) => {
    setSelectedPropertyForCalc(group);
    setSelectedChargeIdsForCalc(group.charges.map(c => c.id));
    setCalculatorOpen(true);
  };

  const handleDebitConfirmed = () => {
    fetchCharges();
    fetchDebitoCharges();
    setCalculatorOpen(false);
    setSelectedPropertyForCalc(null);
    setSelectedChargeIdsForCalc([]);
  };

  const groupChargesByProperty = () => {
    const groups: Record<string, PropertyGroup> = {};

    charges.forEach(charge => {
      // Aguardando débito em reserva aparece na ReserveDebitsTable, não aqui.
      if (charge.status === 'aguardando_reserva') return;

      const propertyId = charge.property?.id || 'sem-imovel';
      const propertyName = charge.property?.name || 'Sem imóvel';

      // Apply search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesProperty = propertyName.toLowerCase().includes(search);
        const matchesOwner = charge.owner.name.toLowerCase().includes(search);
        const matchesTitle = charge.title.toLowerCase().includes(search);
        if (!matchesProperty && !matchesOwner && !matchesTitle) return;
      }

      if (!groups[propertyId]) {
        groups[propertyId] = {
          id: propertyId,
          name: propertyName,
          cover_photo_url: charge.property?.cover_photo_url || null,
          ownerName: charge.owner.name,
          charges: [],
          openCount: 0,
          overdueCount: 0,
          totalDueCents: 0
        };
      }

      groups[propertyId].charges.push(charge);
      groups[propertyId].totalDueCents += valorDevido(charge);

      // Mesma regra de "vencida" da OpenChargesTable: passou do dia e não foi paga.
      if (cobrancaVencida(charge)) {
        groups[propertyId].overdueCount++;
      } else {
        groups[propertyId].openCount++;
      }
    });

    // Sort by overdue count (most urgent first), then by open count
    const sortedGroups = Object.values(groups).sort((a, b) => {
      if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
      return b.openCount - a.openCount;
    });

    setPropertyGroups(sortedGroups);
  };

  const handleEdit = (charge: Charge) => {
    setEditingCharge(charge);
    setEditDialogOpen(true);
  };

  const toggleChargeSelection = (chargeId: string) => {
    const newSelected = new Set(selectedCharges);
    if (newSelected.has(chargeId)) {
      newSelected.delete(chargeId);
    } else {
      newSelected.add(chargeId);
    }
    setSelectedCharges(newSelected);
  };

  /** Só o que está na tela: busca aplicada e sem as que aguardam reserva. */
  const cobrancasVisiveis = useMemo(() => propertyGroups.flatMap((g) => g.charges), [propertyGroups]);
  const todasVisiveisSelecionadas =
    cobrancasVisiveis.length > 0 && cobrancasVisiveis.every((c) => selectedCharges.has(c.id));

  const toggleSelectAll = () => {
    setSelectedCharges(todasVisiveisSelecionadas ? new Set() : new Set(cobrancasVisiveis.map((c) => c.id)));
  };

  const handleDeleteSelected = async () => {
    if (selectedCharges.size === 0) return;

    try {
      setDeleting(true);

      const { error } = await supabase
        .from('charges')
        .update({ archived_at: new Date().toISOString(), status: 'arquivado' })
        .in('id', Array.from(selectedCharges));

      if (error) throw error;

      toast({
        title: "Cobranças movidas para a lixeira",
        description: `${selectedCharges.size} cobrança(s) movida(s) para a lixeira.`,
      });

      setSelectedCharges(new Set());
      setDeleteDialogOpen(false);
      fetchCharges();
      fetchDebitoCharges();
    } catch (error) {
      console.error('Erro ao arquivar cobranças:', error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível mover as cobranças para a lixeira.",
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  };

  // Contagem da aba "Em aberto": sem as que aguardam débito em reserva.
  const cobrancasEmAberto = useMemo(() => charges.filter((c) => c.status !== 'aguardando_reserva'), [charges]);
  const totalAReceber = useMemo(() => cobrancasEmAberto.reduce((s, c) => s + valorDevido(c), 0), [cobrancasEmAberto]);
  const totalADebitar = debitoPropertyGroups.reduce((acc, g) => acc + g.totalDueCents, 0);

  const subtitulo = loading
    ? undefined
    : `${cobrancasEmAberto.length} em aberto · ${formatarBRL(totalAReceber)} a receber`;

  const abas: Array<{ valor: Aba; rotulo: string; quantidade?: number; tom: "success" | "destructive" | "neutral" }> = [
    { valor: "abertas", rotulo: "Em aberto", quantidade: loading ? undefined : cobrancasEmAberto.length, tom: "success" },
    { valor: "debito", rotulo: "Débito em reserva", quantidade: loading ? undefined : debitoCharges.length, tom: "destructive" },
    { valor: "recorrentes", rotulo: "Recorrentes", tom: "neutral" },
  ];

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Cobranças"
          subtitulo={subtitulo}
          icone={<DollarSign />}
          tom="success"
          voltarPara="/painel"
          acoes={
            <>
              <Button variant="outline" size="sm" className="hidden h-9 sm:inline-flex" onClick={() => navigate("/admin/relatorio-cobrancas")}>
                <BarChart3 className="h-4 w-4" />
                Histórico
              </Button>
              <Button size="sm" className="h-9" onClick={() => navigate("/nova-cobranca")}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nova cobrança</span>
                <span className="sr-only sm:hidden">Nova cobrança</span>
              </Button>
            </>
          }
          abaixo={
            <BarraFiltros role="tablist" aria-label="Seções de cobranças">
              {abas.map((aba) => (
                <AbaPilula
                  key={aba.valor}
                  ativa={activeTab === aba.valor}
                  quantidade={aba.quantidade}
                  tom={aba.tom}
                  onClick={() => setActiveTab(aba.valor)}
                >
                  {aba.rotulo}
                </AbaPilula>
              ))}
            </BarraFiltros>
          }
        />
      }
    >
      {/* Saldo credor dos proprietários */}
      {ownerCredits.length > 0 && (
        <CaixaOperacao
          icone={<CreditCard />}
          titulo="Saldo credor disponível"
          tom="success"
          selos={<SeloContagem tom="success">{ownerCredits.length}</SeloContagem>}
          subcabecalho={<p className="text-xs text-muted-foreground">Valores a abater em cobranças futuras dos proprietários.</p>}
        >
          <div className="space-y-1.5">
            {ownerCredits.map((oc) => (
              <div key={oc.owner_id} className="flex items-center justify-between gap-3 px-1 text-sm">
                <span className="truncate text-foreground">{oc.owner_name}</span>
                <span className="shrink-0 font-semibold tabular-nums text-success">{formatarBRL(oc.total_cents)}</span>
              </div>
            ))}
          </div>
        </CaixaOperacao>
      )}

      {/* Aba: cobranças em aberto */}
      {activeTab === "abertas" && (
        <div className="space-y-4" role="tabpanel">
          <ReserveDebitsTable />

          <Card className="rounded-xl border-border/70 p-3 md:p-4">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  placeholder="Buscar por imóvel, proprietário ou título…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  aria-label="Buscar cobranças"
                />
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="select-all"
                    checked={todasVisiveisSelecionadas}
                    onCheckedChange={toggleSelectAll}
                    disabled={cobrancasVisiveis.length === 0}
                    aria-label="Selecionar todas as cobranças visíveis"
                  />
                  <label htmlFor="select-all" className="cursor-pointer text-sm">
                    {selectedCharges.size === 0
                      ? "Selecionar todas as visíveis"
                      : `${selectedCharges.size} selecionada(s)`}
                  </label>
                </div>

                {selectedCharges.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Lixeira ({selectedCharges.size})
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {loading ? (
            <Card className="rounded-xl border-border/70 p-3" aria-busy="true" aria-label="Carregando cobranças">
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            </Card>
          ) : cobrancasEmAberto.length === 0 ? (
            <Card className="rounded-xl border-border/70">
              <EmptyState
                ilustracao="cobrancas"
                title="Nenhuma cobrança em aberto"
                description="As cobranças enviadas aos proprietários aparecem aqui até serem pagas."
                action={
                  <Button onClick={() => navigate("/nova-cobranca")}>
                    <Plus className="h-4 w-4" />
                    Nova cobrança
                  </Button>
                }
              />
            </Card>
          ) : propertyGroups.length === 0 ? (
            <Card className="rounded-xl border-border/70">
              <EmptyState
                ilustracao="busca"
                title="Nenhuma cobrança com essa busca"
                description="Tente outro imóvel, proprietário ou título."
                action={
                  <Button variant="outline" onClick={() => setSearchTerm("")}>
                    Limpar busca
                  </Button>
                }
              />
            </Card>
          ) : (
            <OpenChargesTable
              propertyGroups={propertyGroups}
              selectedCharges={selectedCharges}
              onToggleChargeSelection={toggleChargeSelection}
              onEditCharge={handleEdit}
            />
          )}
        </div>
      )}

      {/* Aba: débito em reserva */}
      {activeTab === "debito" && (
        <div className="space-y-4" role="tabpanel">
          {debitoPropertyGroups.length > 0 && (
            <Card className="rounded-xl border-destructive/30 bg-destructive/10">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total a debitar em reserva</p>
                    <p className="text-3xl font-bold tabular-nums text-destructive">{formatarBRL(totalADebitar)}</p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{debitoCharges.length} {debitoCharges.length === 1 ? "cobrança" : "cobranças"}</p>
                    <p>{debitoPropertyGroups.length} {debitoPropertyGroups.length === 1 ? "imóvel" : "imóveis"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {debitoPropertyGroups.length === 0 ? (
            <Card className="rounded-xl border-border/70">
              <EmptyState
                icon={<Receipt className="h-6 w-6" />}
                title="Nenhuma cobrança vencida para debitar"
                description="Cobranças vencidas e ainda não pagas aparecem aqui para o débito em reserva."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {debitoPropertyGroups.map((group) => (
                <Card
                  key={group.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer rounded-xl border-destructive/30 bg-destructive/10 transition-colors hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => openCalculator(group)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openCalculator(group);
                    }
                  }}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4">
                      <MiniaturaImovel url={group.cover_photo_url} alt={group.name} fallback={<Building2 />} tamanho="h-14 w-14" />

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{group.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{group.ownerName}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <SeloContagem tom="destructive">
                            {group.charges.length} cobrança{group.charges.length > 1 ? 's' : ''}
                          </SeloContagem>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-right">
                        <div>
                          <p className="text-lg font-bold tabular-nums text-destructive">{formatarBRL(group.totalDueCents)}</p>
                          <p className="text-xs text-muted-foreground">a debitar</p>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="border-destructive/30 hover:bg-destructive/10"
                          aria-label={`Calcular débito em reserva de ${group.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openCalculator(group);
                          }}
                        >
                          <Calculator className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 border-t border-destructive/30 pt-3">
                      {group.charges.slice(0, 3).map((charge) => (
                        <div key={charge.id} className="flex justify-between gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{charge.title}</span>
                          <span className="font-medium tabular-nums">{formatarBRL(valorDevido(charge))}</span>
                        </div>
                      ))}
                      {group.charges.length > 3 && (
                        <p className="text-xs text-muted-foreground">
                          + {group.charges.length - 3} mais
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="border-t pt-4">
            <ReserveRetentionsHistory
              title="Débitos retroativos já efetuados"
              emptyDescription="Nenhum débito retroativo em reserva foi registrado ainda."
            />
          </div>
        </div>
      )}

      {/* Aba: contas recorrentes */}
      {activeTab === "recorrentes" && (
        <div className="space-y-4" role="tabpanel">
          <RecurringChargesPanel />
        </div>
      )}

      <EditChargeDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        charge={editingCharge}
        onSuccess={() => {
          fetchCharges();
          fetchDebitoCharges();
        }}
      />

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Mover cobranças para a lixeira?"
        description={`${selectedCharges.size} cobrança(s) deixam de ser cobradas e saem dos relatórios.`}
        confirmLabel="Mover para a lixeira"
        variant="destructive"
        onConfirm={handleDeleteSelected}
        loading={deleting}
      />

      <DebitoReservaCalculator
        open={calculatorOpen}
        onOpenChange={setCalculatorOpen}
        propertyName={selectedPropertyForCalc?.name || ""}
        totalDebtCents={selectedPropertyForCalc?.totalDueCents || 0}
        chargeIds={selectedChargeIdsForCalc}
        onDebitConfirmed={handleDebitConfirmed}
      />
    </PaginaInterna>
  );
};

export default GerenciarCobrancas;
