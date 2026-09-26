import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DollarSign, ArrowRight, MessageSquare, Package } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { diasParaVencer, estaVencida } from "@/lib/vencimento";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChargeChatDialog } from "./ChargeChatDialog";
import {
  BotaoExpandir,
  BotaoLinha,
  CaixaCarregando,
  CaixaOperacao,
  CaixaVazia,
  GrupoCaixa,
  LinhaCaixa,
  SeloContagem,
} from "@/components/painel/CaixaOperacao";

const COLLAPSED_LIMIT = 3;
// Expandido mostra tudo; a lista rola dentro da caixa (ver CollapsibleContent).
const EXPANDED_LIMIT = Number.POSITIVE_INFINITY;

type Charge = {
  id: string;
  title: string;
  amount_cents: number;
  management_contribution_cents: number;
  credit_applied_cents: number;
  due_date: string | null;
  status: string;
  property: { name: string } | null;
  owner: { name: string } | null;
};

export function ChargesKanbanPreview() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
          id, title, amount_cents, management_contribution_cents, credit_applied_cents, due_date, status,
          property:properties(name),
          owner:profiles!charges_owner_id_fkey(name)
        `)
        .in("status", ["pendente", "sent", "overdue"])
        .is("archived_at", null)
        // Sem teto: antes era .limit(50) ordenado por vencimento, então o painel
        // mostrava "50 vencidas" (o teto) com 104 reais, e as pendentes ainda
        // não vencidas nunca apareciam — as 50 vagas iam todas para as vencidas.
        .order("due_date", { ascending: true, nullsFirst: false });

      if (error) throw error;
      setCharges((data || []) as Charge[]);
    } catch (error) {
      console.error("Error fetching charges:", error);
    } finally {
      setLoading(false);
    }
  };

  const openChatDialog = (charge: Charge) => {
    setChatCharge(charge);
    setChatDialogOpen(true);
  };

  const getDueInfo = (due_date: string | null, status: string) => {
    if (!due_date) return { text: "", color: "" };
    const daysLeft = diasParaVencer(due_date);
    const isOverdue = daysLeft < 0 || status === "overdue";

    if (isOverdue) return { text: `${Math.abs(daysLeft)}d atrás`, color: "text-destructive" };
    if (daysLeft === 0) return { text: "vence hoje", color: "text-warning" };
    if (daysLeft <= 7) return { text: `${daysLeft}d`, color: "text-warning" };
    return { text: `${daysLeft}d`, color: "text-muted-foreground" };
  };

  const getDueAmount = (charge: Charge) =>
    Math.max(0, charge.amount_cents - (charge.management_contribution_cents || 0) - (charge.credit_applied_cents || 0));

  const pendentes = charges.filter((c) => {
    if (c.status !== "sent" && c.status !== "pendente") return false;
    return !estaVencida(c.due_date);
  });

  // Mesma definição do resumo do topo do painel (PainelResumo).
  const vencidas = charges.filter((c) => estaVencida(c.due_date, c.status));

  const vencidasLimit = vencidasExpanded ? EXPANDED_LIMIT : COLLAPSED_LIMIT;
  const pendentesLimit = pendentesExpanded ? EXPANDED_LIMIT : COLLAPSED_LIMIT;

  const renderChargeItem = (charge: Charge, isOverdue = false) => {
    const dueInfo = getDueInfo(charge.due_date, charge.status);
    return (
      <LinhaCaixa
        key={charge.id}
        titulo={charge.property?.name || charge.owner?.name || "Sem unidade"}
        subtitulo={charge.title}
        tom={isOverdue ? "destructive" : "neutral"}
        tingida={isOverdue}
        onClick={() => (saveScrollPosition(pathname), navigate(`/cobranca/${charge.id}`))}
        meta={
          <>
            <p className="font-semibold tabular-nums text-foreground">{formatBRL(getDueAmount(charge))}</p>
            {dueInfo.text && (
              <p className={cn("hidden text-[11px] font-medium sm:block", dueInfo.color)}>{dueInfo.text}</p>
            )}
          </>
        }
        acoes={
          <BotaoLinha rotulo="Abrir conversa da cobrança" onClick={() => openChatDialog(charge)}>
            <MessageSquare />
          </BotaoLinha>
        }
      />
    );
  };

  if (loading) {
    return <CaixaCarregando icone={<DollarSign />} titulo="Cobranças" tom="success" />;
  }

  return (
    <CaixaOperacao
      icone={<DollarSign />}
      titulo="Cobranças"
      tom="success"
      selos={
        <>
          {charges.length > 0 && <SeloContagem>{charges.length}</SeloContagem>}
          {vencidas.length > 0 && <SeloContagem tom="destructive">{vencidas.length} vencidas</SeloContagem>}
        </>
      }
      acoes={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/nova-cobranca?reposicao=true")}
            className="h-7 gap-1 px-2 text-xs"
          >
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reposição</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(isOwner ? "/minhas-cobrancas" : "/gerenciar-cobrancas")}
            className="h-7 gap-1 px-2 text-xs text-success hover:text-success"
          >
            <span className="hidden sm:inline">Ver todas</span>
            <span className="sm:hidden">Ver</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </>
      }
    >
      {charges.length === 0 ? (
        <CaixaVazia icone={<DollarSign className="h-5 w-5" />} titulo="Nenhuma cobrança pendente" />
      ) : (
        <div className="space-y-3">
          {/* Vencidas primeiro */}
          {vencidas.length > 0 && (
            <Collapsible open={vencidasExpanded} onOpenChange={setVencidasExpanded}>
              <GrupoCaixa
                titulo="Vencidas"
                quantidade={vencidas.length}
                tom="destructive"
                acao={
                  vencidas.length > COLLAPSED_LIMIT && (
                    <CollapsibleTrigger asChild>
                      <BotaoExpandir aberto={vencidasExpanded} restantes={vencidas.length - COLLAPSED_LIMIT} />
                    </CollapsibleTrigger>
                  )
                }
              >
                {vencidas.slice(0, COLLAPSED_LIMIT).map((c) => renderChargeItem(c, true))}
                <CollapsibleContent className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {vencidas.slice(COLLAPSED_LIMIT, vencidasLimit).map((c) => renderChargeItem(c, true))}
                </CollapsibleContent>
              </GrupoCaixa>
            </Collapsible>
          )}

          {/* Pendentes */}
          {pendentes.length > 0 && (
            <Collapsible open={pendentesExpanded} onOpenChange={setPendentesExpanded}>
              <GrupoCaixa
                titulo="Pendentes"
                quantidade={pendentes.length}
                tom="warning"
                acao={
                  pendentes.length > COLLAPSED_LIMIT && (
                    <CollapsibleTrigger asChild>
                      <BotaoExpandir aberto={pendentesExpanded} restantes={pendentes.length - COLLAPSED_LIMIT} />
                    </CollapsibleTrigger>
                  )
                }
              >
                {pendentes.slice(0, COLLAPSED_LIMIT).map((c) => renderChargeItem(c, false))}
                <CollapsibleContent className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {pendentes.slice(COLLAPSED_LIMIT, pendentesLimit).map((c) => renderChargeItem(c, false))}
                </CollapsibleContent>
              </GrupoCaixa>
            </Collapsible>
          )}
        </div>
      )}

      <ChargeChatDialog
        open={chatDialogOpen}
        onOpenChange={setChatDialogOpen}
        chargeId={chatCharge?.id || null}
        chargeTitle={chatCharge?.title || ""}
        propertyName={chatCharge?.property?.name || "Sem unidade"}
      />
    </CaixaOperacao>
  );
}
