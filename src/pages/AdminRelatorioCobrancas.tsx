import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { goBack, saveScrollPosition } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Search, Download, TrendingUp, CheckCircle, CreditCard, Building2, User, Calendar } from "lucide-react";
import { formatBRL, formatDate } from "@/lib/format";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PaidCharge {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  status: string;
  paid_at: string | null;
  debited_at: string | null;
  created_at: string;
  due_date: string | null;
  owner_id: string;
  property_id: string | null;
  owner: { name: string; email: string };
  property?: { name: string; cover_photo_url: string | null } | null;
}

const PAID_STATUSES = ["paid", "pago_no_vencimento", "pago_antecipado", "pago_com_atraso", "debited"];

const statusLabel: Record<string, { label: string; color: string }> = {
  paid: { label: "Pago", color: "bg-success/10 text-success" },
  pago_no_vencimento: { label: "Pago no Venc.", color: "bg-success/10 text-success" },
  pago_antecipado: { label: "Pago Antecipado", color: "bg-success/10 text-success" },
  pago_com_atraso: { label: "Pago c/ Atraso", color: "bg-warning/10 text-warning" },
  debited: { label: "Debitado Reserva", color: "bg-info/10 text-info" },
};

const AdminRelatorioCobrancas = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const [charges, setCharges] = useState<PaidCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [statusFilter, setStatusFilter] = useState("all");
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [activeTab, setActiveTab] = useState("pagas");

  // Generate last 12 months options
  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(new Date(), i);
      opts.push({
        value: format(d, "yyyy-MM"),
        label: format(d, "MMMM yyyy", { locale: ptBR }),
      });
    }
    return opts;
  }, []);

  useEffect(() => {
    fetchOwners();
  }, []);

  useEffect(() => {
    fetchCharges();
  }, [monthFilter, ownerFilter, statusFilter]);

  const fetchOwners = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "owner")
      .order("name");
    setOwners(data || []);
  };

  const fetchCharges = async () => {
    setLoading(true);
    try {
      const [year, month] = monthFilter.split("-").map(Number);
      const start = startOfMonth(new Date(year, month - 1));
      const end = endOfMonth(new Date(year, month - 1));

      let query = supabase
        .from("charges")
        .select("*")
        .in("status", PAID_STATUSES)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      // Filter by paid_at OR debited_at in the selected month
      query = query.or(
        `paid_at.gte.${start.toISOString()},debited_at.gte.${start.toISOString()}`
      );

      if (ownerFilter !== "all") {
        query = query.eq("owner_id", ownerFilter);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data: chargesData, error } = await query;
      if (error) throw error;

      // Filter more precisely in memory to handle OR + date range
      const filtered = (chargesData || []).filter((c) => {
        const paidDate = c.paid_at ? new Date(c.paid_at) : null;
        const debitedDate = c.debited_at ? new Date(c.debited_at) : null;
        const inRange = (d: Date | null) => d && d >= start && d <= end;
        return inRange(paidDate) || inRange(debitedDate);
      });

      // Enrich with owner + property
      const enriched = await Promise.all(
        filtered.map(async (charge) => {
          const [ownerRes, propRes] = await Promise.all([
            supabase.from("profiles").select("name, email").eq("id", charge.owner_id).single(),
            charge.property_id
              ? supabase.from("properties").select("name, cover_photo_url").eq("id", charge.property_id).single()
              : Promise.resolve({ data: null }),
          ]);
          return {
            ...charge,
            owner: ownerRes.data || { name: "N/A", email: "N/A" },
            property: propRes.data || null,
          };
        })
      );

      setCharges(enriched);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return charges;
    const s = search.toLowerCase();
    return charges.filter(
      (c) =>
        c.title.toLowerCase().includes(s) ||
        c.owner.name.toLowerCase().includes(s) ||
        (c.property?.name || "").toLowerCase().includes(s)
    );
  }, [charges, search]);

  const pagasCharges = filtered.filter((c) => c.status !== "debited");
  const debitadasCharges = filtered.filter((c) => c.status === "debited");

  const totalPagas = pagasCharges.reduce((acc, c) => acc + c.amount_cents - c.management_contribution_cents, 0);
  const totalDebitadas = debitadasCharges.reduce((acc, c) => acc + c.amount_cents - c.management_contribution_cents, 0);
  const totalGeral = totalPagas + totalDebitadas;

  const ChargeRow = ({ charge }: { charge: PaidCharge }) => {
    const dateLabel = charge.debited_at
      ? formatDate(charge.debited_at)
      : formatDate(charge.paid_at);
    const devedor = charge.amount_cents - charge.management_contribution_cents;
    const st = statusLabel[charge.status] || { label: charge.status, color: "bg-muted text-muted-foreground" };

    return (
      <div
        className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => (saveScrollPosition(pathname), navigate(`/cobranca/${charge.id}`))}
      >
        {charge.property?.cover_photo_url ? (
          <img
            src={charge.property.cover_photo_url}
            alt={charge.property.name}
            className="h-10 w-10 rounded-md object-cover shrink-0"
          />
        ) : (
          <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{charge.title}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>{charge.owner.name}</span>
            {charge.property && (
              <>
                <span>·</span>
                <span>{charge.property.name}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{formatBRL(devedor)}</p>
          {charge.management_contribution_cents > 0 && (
            <p className="text-xs text-muted-foreground">Total: {formatBRL(charge.amount_cents)}</p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {dateLabel}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/painel")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Relatório de Cobranças Pagas</h1>
            <p className="text-muted-foreground text-sm">
              Histórico de cobranças pagas pelo sistema ou debitadas em reserva
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cobrança, proprietário ou imóvel..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos os proprietários" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os proprietários</SelectItem>
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-success/30 bg-success/10/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pagas pelo Sistema</p>
                  <p className="text-xl font-bold text-success">{formatBRL(totalPagas)}</p>
                  <p className="text-xs text-muted-foreground">{pagasCharges.length} cobranças</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-info/30 bg-info/10/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-info/10">
                  <CreditCard className="h-5 w-5 text-info" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Debitadas em Reserva</p>
                  <p className="text-xl font-bold text-info">{formatBRL(totalDebitadas)}</p>
                  <p className="text-xs text-muted-foreground">{debitadasCharges.length} cobranças</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Recuperado</p>
                  <p className="text-xl font-bold">{formatBRL(totalGeral)}</p>
                  <p className="text-xs text-muted-foreground">{filtered.length} cobranças no total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* List */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pagas" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Pagas pelo Sistema ({pagasCharges.length})
            </TabsTrigger>
            <TabsTrigger value="debitadas" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Debitadas em Reserva ({debitadasCharges.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pagas" className="mt-4">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Carregando...</div>
            ) : pagasCharges.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma cobrança paga encontrada para o período selecionado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pagasCharges.map((c) => (
                  <ChargeRow key={c.id} charge={c} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="debitadas" className="mt-4">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Carregando...</div>
            ) : debitadasCharges.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma cobrança debitada em reserva encontrada para o período selecionado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {debitadasCharges.map((c) => (
                  <ChargeRow key={c.id} charge={c} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminRelatorioCobrancas;
