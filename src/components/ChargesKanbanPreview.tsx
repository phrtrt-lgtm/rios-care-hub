import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ArrowRight, MessageSquare, ChevronRight, ChevronDown, ChevronUp, Package } from "lucide-react";
import { differenceInDays, isPast } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL } from "@/lib/format";
import { ChargeChatDialog } from "./ChargeChatDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const COLLAPSED_LIMIT = 3;
const EXPANDED_LIMIT = 20;

type Charge = {
  id: string;
  title: string;
  amount_cents: number;
  management_contribution_cents: number;
  due_date: string | null;
  status: string;
  property: { name: string } | null;
  owner: { name: string } | null;
};

export function ChargesKanbanPreview() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatCharge, setChatCharge] = useState<Charge | null>(null);
  const [vencidasExpanded, setVencidasExpanded] = useState(false);
  const [pendentesExpanded, setPendentesExpanded] = useState(false);

  const isOwner = profile?.role === "owner";

  useEffect(() => {
    fetchCharges();
  }, []);

  const fetchCharges = async () => {
    try {
      const { data, error } = await supabase
        .from("charges")
        .select(`
          id, title, amount_cents, management_contribution_cents, due_date, status,
          property:properties(name),
          owner:profiles!charges_owner_id_fkey(name)
        `)
        .in("status", ["pendente", "sent", "overdue"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(50);

      if (error) throw error;
      setCharges((data || []) as Charge[]);
    } catch (error) {
      console.error("Error fetching charges:", error);
    } finally {
      setLoading(false);
    }
  };

  const openChatDialog = (charge: Charge, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatCharge(charge);
    setChatDialogOpen(true);
  };

  const getDueInfo = (due_date: string | null, status: string) => {
    if (!due_date) return { text: "", color: "" };
    const dueDate = new Date(due_date);
    const daysLeft = differenceInDays(dueDate, new Date());
    const isOverdue = isPast(dueDate) || status === "overdue";
    
    if (isOverdue) return { text: `${Math.abs(daysLeft)}d atrás`, color: "text-red-600" };
    if (daysLeft <= 2) return { text: `${daysLeft}d`, color: "text-orange-600" };
    if (daysLeft <= 7) return { text: `${daysLeft}d`, color: "text-yellow-600" };
    return { text: `${daysLeft}d`, color: "text-muted-foreground" };
  };

  const getDueAmount = (charge: Charge) => charge.amount_cents - (charge.management_contribution_cents || 0);

  const pendentes = charges.filter(c => {
    if (c.status !== "sent" && c.status !== "pendente") return false;
    if (!c.due_date) return true;
    return !isPast(new Date(c.due_date));
  });

  const vencidas = charges.filter(c => {
    if (c.status === "overdue") return true;
    if ((c.status === "sent" || c.status === "pendente") && c.due_date && isPast(new Date(c.due_date))) return true;
    return false;
  });

  const vencidasLimit = vencidasExpanded ? EXPANDED_LIMIT : COLLAPSED_LIMIT;
  const pendentesLimit = pendentesExpanded ? EXPANDED_LIMIT : COLLAPSED_LIMIT;

  const renderChargeItem = (charge: Charge, isOverdue: boolean = false) => {
    const dueInfo = getDueInfo(charge.due_date, charge.status);
    return (
      <div
        key={charge.id}
        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors overflow-hidden min-w-0 ${
          isOverdue 
            ? "bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50" 
            : "bg-muted/50 hover:bg-muted"
        }`}
        onClick={() => navigate(`/cobranca/${charge.id}`)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">
            {charge.property?.name || charge.owner?.name}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-bold text-green-600 whitespace-nowrap">
            {formatBRL(getDueAmount(charge))}
          </span>
          <span className={`hidden sm:inline text-[10px] font-medium whitespace-nowrap ${dueInfo.color}`}>{dueInfo.text}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 relative shrink-0"
            onClick={(e) => openChatDialog(charge, e)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </Button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="border-green-200 dark:border-green-800">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-600 animate-pulse" />
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-green-200 dark:border-green-800 w-full min-w-0 overflow-hidden">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <DollarSign className="h-4 w-4 text-green-600" />
            <CardTitle className="text-sm">Cobranças</CardTitle>
            {charges.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {charges.length}
              </Badge>
            )}
            {vencidas.length > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                {vencidas.length} vencidas
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/nova-cobranca?reposicao=true")}
              className="h-7 text-xs gap-1"
            >
              <Package className="h-3 w-3" />
              <span className="hidden sm:inline">Reposição</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(isOwner ? "/minhas-cobrancas" : "/gerenciar-cobrancas")}
              className="h-7 text-xs text-green-600"
            >
              <span className="hidden sm:inline">Ver</span>
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {charges.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhuma cobrança pendente</p>
        ) : (
          <div className="space-y-3">
            {/* Vencidas primeiro */}
            {vencidas.length > 0 && (
              <Collapsible open={vencidasExpanded} onOpenChange={setVencidasExpanded}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-red-600">Vencidas ({vencidas.length})</p>
                  {vencidas.length > COLLAPSED_LIMIT && (
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs text-muted-foreground">
                        {vencidasExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {vencidasExpanded ? "Recolher" : `+${vencidas.length - COLLAPSED_LIMIT}`}
                      </Button>
                    </CollapsibleTrigger>
                  )}
                </div>
                <div className="space-y-1">
                  {vencidas.slice(0, COLLAPSED_LIMIT).map(c => renderChargeItem(c, true))}
                </div>
                <CollapsibleContent className="space-y-1 mt-1">
                  {vencidas.slice(COLLAPSED_LIMIT, vencidasLimit).map(c => renderChargeItem(c, true))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Pendentes */}
            {pendentes.length > 0 && (
              <Collapsible open={pendentesExpanded} onOpenChange={setPendentesExpanded}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-yellow-600">Pendentes ({pendentes.length})</p>
                  {pendentes.length > COLLAPSED_LIMIT && (
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs text-muted-foreground">
                        {pendentesExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {pendentesExpanded ? "Recolher" : `+${pendentes.length - COLLAPSED_LIMIT}`}
                      </Button>
                    </CollapsibleTrigger>
                  )}
                </div>
                <div className="space-y-1">
                  {pendentes.slice(0, COLLAPSED_LIMIT).map(c => renderChargeItem(c, false))}
                </div>
                <CollapsibleContent className="space-y-1 mt-1">
                  {pendentes.slice(COLLAPSED_LIMIT, pendentesLimit).map(c => renderChargeItem(c, false))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </CardContent>

      <ChargeChatDialog
        open={chatDialogOpen}
        onOpenChange={setChatDialogOpen}
        chargeId={chatCharge?.id || null}
        chargeTitle={chatCharge?.title || ""}
        propertyName={chatCharge?.property?.name || "Sem unidade"}
      />
    </Card>
  );
}
