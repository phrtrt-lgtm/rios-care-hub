import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Search, TrendingUp, CheckCircle, Building2, User,
  Calendar, Percent, Sparkles, DollarSign
} from "lucide-react";
import { formatBRL, formatDate } from "@/lib/format";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BookingCommission {
  id: string;
  owner_id: string;
  property_id: string | null;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  reservation_amount_cents: number;
  commission_percent: number;
  commission_cents: number;
  cleaning_fee_cents: number;
  total_due_cents: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  owner?: { name: string; email: string };
  property?: { name: string; cover_photo_url: string | null } | null;
}

const PAID_STATUSES = ["paid", "pago_no_vencimento", "pago_antecipado", "pago_com_atraso"];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  paid: { label: "Pago", className: "bg-success/10 text-success dark:bg-green-900/40 dark:text-green-300" },
  pago_no_vencimento: { label: "Pago no Venc.", className: "bg-success/10 text-success dark:bg-green-900/40 dark:text-green-300" },
  pago_antecipado: { label: "Pago Antecipado", className: "bg-success/10 text-success dark:bg-emerald-900/40 dark:text-emerald-300" },
  pago_com_atraso: { label: "Pago c/ Atraso", className: "bg-warning/10 text-warning dark:bg-yellow-900/40 dark:text-yellow-300" },
};

const AdminRelatorioBooking = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [commissions, setCommissions] = useState<BookingCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);

  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 18; i++) {
      const d = subMonths(new Date(), i);
      opts.push({
        value: format(d, "yyyy-MM"),
        label: format(d, "MMMM yyyy", { locale: ptBR }),
      });
    }
    return opts;
  }, []);

  useEffect(() => {
    const isTeam = ["admin", "agent", "maintenance"].includes(profile?.role || "");
    if (!isTeam) { navigate("/"); return; }
    fetchOwners();
  }, []);

  useEffect(() => {
    fetchCommissions();
  }, [monthFilter, ownerFilter]);

  const fetchOwners = async () => {
    const { data } = await supabase.from("profiles").select("id, name").eq("role", "owner").order("name");
    setOwners(data || []);
  };

  const fetchCommissions = async () => {
    setLoading(true);
    try {
      const [year, month] = monthFilter.split("-").map(Number);
      const start = startOfMonth(new Date(year, month - 1));
      const end = endOfMonth(new Date(year, month - 1));

      let query = supabase
        .from("booking_commissions")
        .select("*")
        .in("status", PAID_STATUSES)
        .is("archived_at", null)
        .gte("paid_at", start.toISOString())
        .lte("paid_at", end.toISOString())
        .order("paid_at", { ascending: false });

      if (ownerFilter !== "all") query = query.eq("owner_id", ownerFilter);

      const { data, error } = await query;
      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).map(async (c) => {
          const [ownerRes, propRes] = await Promise.all([
            supabase.from("profiles").select("name, email").eq("id", c.owner_id).single(),
            c.property_id
              ? supabase.from("properties").select("name, cover_photo_url").eq("id", c.property_id).single()
              : Promise.resolve({ data: null }),
          ]);
          return {
            ...c,
            owner: ownerRes.data || { name: "N/A", email: "N/A" },
            property: propRes.data || null,
          };
        })
      );
      setCommissions(enriched as BookingCommission[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return commissions;
    const s = search.toLowerCase();
    return commissions.filter(
      (c) =>
        (c.guest_name || "").toLowerCase().includes(s) ||
        (c.owner?.name || "").toLowerCase().includes(s) ||
        (c.property?.name || "").toLowerCase().includes(s)
    );
  }, [commissions, search]);

  const totalComissoes = filtered.reduce((acc, c) => acc + c.commission_cents, 0);
  const totalLimpeza = filtered.reduce((acc, c) => acc + c.cleaning_fee_cents, 0);
  const totalGeral = filtered.reduce((acc, c) => acc + c.total_due_cents, 0);
  const totalReservas = filtered.reduce((acc, c) => acc + c.reservation_amount_cents, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate("/booking-comissoes")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Relatório de Comissões Booking
            </h1>
            <p className="text-muted-foreground text-sm">
              Histórico de comissões e taxas de limpeza recebidas
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
                  placeholder="Buscar hóspede, proprietário ou imóvel..."
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
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Total Recebido</p>
              <p className="text-lg font-bold text-primary">{formatBRL(totalGeral)}</p>
              <p className="text-xs text-muted-foreground">{filtered.length} cobranças</p>
            </CardContent>
          </Card>
          <Card className="border-success/30 bg-success/10/50 dark:bg-green-900/10">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Comissões</p>
              <p className="text-lg font-bold text-success">{formatBRL(totalComissoes)}</p>
              <p className="text-xs text-muted-foreground">% sobre reservas</p>
            </CardContent>
          </Card>
          <Card className="border-info/30 bg-info/10/50 dark:bg-blue-900/10">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Taxas de Limpeza</p>
              <p className="text-lg font-bold text-info">{formatBRL(totalLimpeza)}</p>
              <p className="text-xs text-muted-foreground">fixo por reserva</p>
            </CardContent>
          </Card>
          <Card className="border-muted bg-muted/20">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Volume de Reservas</p>
              <p className="text-lg font-bold">{formatBRL(totalReservas)}</p>
              <p className="text-xs text-muted-foreground">recebido pelos prop.</p>
            </CardContent>
          </Card>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Nenhuma comissão paga no período selecionado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const st = STATUS_CONFIG[c.status] || { label: c.status, className: "bg-muted" };
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/comissao-booking/${c.id}`)}
                >
                  {c.property?.cover_photo_url ? (
                    <img
                      src={c.property.cover_photo_url}
                      alt={c.property.name}
                      className="h-10 w-10 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {c.property?.name || "Sem Imóvel"}
                      {c.guest_name && ` – ${c.guest_name}`}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {c.owner?.name}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(c.check_in), "dd/MM")} – {format(new Date(c.check_out), "dd/MM/yyyy")}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Percent className="h-3 w-3" />
                        {c.commission_percent}%
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{formatBRL(c.total_due_cents)}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.commission_cents > 0 && `${formatBRL(c.commission_cents)} + `}
                      {formatBRL(c.cleaning_fee_cents)} limp.
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <Badge className={`text-xs ${st.className}`}>{st.label}</Badge>
                    {c.paid_at && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(c.paid_at)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminRelatorioBooking;
