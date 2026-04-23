import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Plus, Search, MessageSquare, ChevronRight, BarChart3,
  CalendarDays, Building2, User, Percent, Sparkles, DollarSign, FileSpreadsheet
} from "lucide-react";
import { formatBRL, formatDate } from "@/lib/format";
import { differenceInDays, isPast, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { BookingCommissionChatDialog } from "@/components/BookingCommissionChatDialog";

export interface BookingCommission {
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
  due_date: string | null;
  paid_at: string | null;
  archived_at: string | null;
  notes: string | null;
  created_at: string;
  owner?: { name: string; email: string };
  property?: { name: string; cover_photo_url: string | null } | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  sent: { label: "Enviada", className: "bg-info/10 text-info dark:bg-blue-900/40 dark:text-blue-300" },
  pendente: { label: "Pendente", className: "bg-warning/10 text-warning dark:bg-yellow-900/40 dark:text-yellow-300" },
  overdue: { label: "Vencida", className: "bg-destructive/10 text-destructive dark:bg-red-900/40 dark:text-red-300" },
  paid: { label: "Pago", className: "bg-success/10 text-success dark:bg-green-900/40 dark:text-green-300" },
  pago_no_vencimento: { label: "Pago no Venc.", className: "bg-success/10 text-success dark:bg-green-900/40 dark:text-green-300" },
  pago_antecipado: { label: "Pago Antecipado", className: "bg-success/10 text-success dark:bg-emerald-900/40 dark:text-emerald-300" },
  pago_com_atraso: { label: "Pago c/ Atraso", className: "bg-warning/10 text-warning dark:bg-yellow-900/40 dark:text-yellow-300" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

const OPEN_STATUSES = ["sent", "pendente", "overdue", "draft"];
const PAID_STATUSES = ["paid", "pago_no_vencimento", "pago_antecipado", "pago_com_atraso"];

const BookingComissoes = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [commissions, setCommissions] = useState<BookingCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatCommission, setChatCommission] = useState<BookingCommission | null>(null);

  const isTeam = ["admin", "agent", "maintenance"].includes(profile?.role || "");

  useEffect(() => {
    if (!isTeam) { navigate("/"); return; }
    fetchCommissions();
  }, [statusFilter]);

  const fetchCommissions = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("booking_commissions")
        .select("*")
        .is("archived_at", null)
        .order("check_in", { ascending: false });

      if (statusFilter === "open") {
        query = query.in("status", OPEN_STATUSES);
      } else if (statusFilter === "paid") {
        query = query.in("status", PAID_STATUSES);
      }

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
      toast({ title: "Erro ao carregar comissões", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = commissions.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (c.guest_name || "").toLowerCase().includes(s) ||
      (c.owner?.name || "").toLowerCase().includes(s) ||
      (c.property?.name || "").toLowerCase().includes(s)
    );
  });

  const totalPendente = filtered
    .filter((c) => OPEN_STATUSES.includes(c.status))
    .reduce((acc, c) => acc + c.total_due_cents, 0);

  const totalVencidas = filtered
    .filter((c) => c.status === "overdue")
    .reduce((acc, c) => acc + c.total_due_cents, 0);

  const getDueInfo = (due_date: string | null, status: string) => {
    if (!due_date) return { text: "", color: "" };
    const dueDate = new Date(due_date);
    const daysLeft = differenceInDays(dueDate, new Date());
    const isOverdue = isPast(dueDate) || status === "overdue";
    if (isOverdue) return { text: `${Math.abs(daysLeft)}d atraso`, color: "text-destructive" };
    if (daysLeft <= 2) return { text: `${daysLeft}d`, color: "text-warning" };
    if (daysLeft <= 7) return { text: `${daysLeft}d`, color: "text-warning" };
    return { text: `${daysLeft}d`, color: "text-muted-foreground" };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => goBack(navigate, "/minha-caixa")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Comissões Booking
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/relatorio-booking")}
              className="hidden sm:flex"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Relatório
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/importar-comissoes-booking")}
              className="hidden sm:flex"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Importar Planilha
            </Button>
            <Button size="sm" onClick={() => navigate("/nova-comissao-booking")}>
              <Plus className="mr-2 h-4 w-4" />
              Nova
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl space-y-5">
        <div className="sm:hidden">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Comissões Booking
          </h1>
          <p className="text-sm text-muted-foreground">Gestão de comissões e taxa de limpeza</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-warning/30 bg-warning/10/50 dark:bg-yellow-900/10">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">A Receber</p>
              <p className="text-xl font-bold text-warning">{formatBRL(totalPendente)}</p>
              <p className="text-xs text-muted-foreground">
                {filtered.filter((c) => OPEN_STATUSES.includes(c.status)).length} cobranças
              </p>
            </CardContent>
          </Card>
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Vencidas</p>
              <p className="text-xl font-bold text-destructive">{formatBRL(totalVencidas)}</p>
              <p className="text-xs text-muted-foreground">
                {filtered.filter((c) => c.status === "overdue").length} cobranças
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar hóspede, proprietário..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Em Aberto</SelectItem>
              <SelectItem value="paid">Pagas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Nenhuma comissão encontrada</p>
            <p className="text-sm">Crie uma nova cobrança de comissão Booking</p>
            <Button className="mt-4" onClick={() => navigate("/nova-comissao-booking")}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Comissão
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const st = STATUS_CONFIG[c.status] || { label: c.status, className: "bg-muted" };
              const dueInfo = getDueInfo(c.due_date, c.status);
              const nights = differenceInDays(new Date(c.check_out), new Date(c.check_in));
              return (
                <Card
                  key={c.id}
                  className="cursor-pointer hover:shadow-md transition-all"
                  onClick={() => navigate(`/comissao-booking/${c.id}`)}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {/* Property photo */}
                      {c.property?.cover_photo_url ? (
                        <img
                          src={c.property.cover_photo_url}
                          alt={c.property.name}
                          className="h-12 w-12 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate">
                            {c.property?.name || "Sem Imóvel"}
                          </p>
                          <Badge className={`text-xs px-1.5 py-0 ${st.className}`}>{st.label}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {c.owner?.name}
                          </span>
                          {c.guest_name && (
                            <>
                              <span>·</span>
                              <span>{c.guest_name}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {format(new Date(c.check_in), "dd/MM")} – {format(new Date(c.check_out), "dd/MM")}
                            <span className="text-muted-foreground">({nights}n)</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Percent className="h-3 w-3" />
                            {c.commission_percent}% + {formatBRL(c.cleaning_fee_cents)} limpeza
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">{formatBRL(c.total_due_cents)}</p>
                          {dueInfo.text && (
                            <p className={`text-xs ${dueInfo.color}`}>{dueInfo.text}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatCommission(c);
                            setChatOpen(true);
                          }}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <BookingCommissionChatDialog
        open={chatOpen}
        onOpenChange={setChatOpen}
        commissionId={chatCommission?.id || null}
        title={chatCommission ? `${chatCommission.property?.name || "Sem imóvel"} – ${chatCommission.guest_name || "Hóspede"}` : ""}
      />
    </div>
  );
};

export default BookingComissoes;
