import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Archive, Building2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import {
  BotaoLinha,
  CaixaCarregando,
  CaixaOperacao,
  LinhaCaixa,
  MiniaturaImovel,
  SeloContagem,
} from "@/components/painel/CaixaOperacao";
import { formatarData } from "@/lib/cobrancaMeta";

interface DismissedItem {
  id: string;
  subject: string;
  guest_checkout_date: string | null;
  property_name: string;
  guest_charge_dismissed_at: string;
  dismissed_by_name: string | null;
  charge_id: string | null;
}

export default function CobrancasHospedeArquivadas() {
  const navigate = useNavigate();
  const [items, setItems] = useState<DismissedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [itemParaRestaurar, setItemParaRestaurar] = useState<DismissedItem | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data: tickets, error } = await supabase
        .from("tickets")
        .select(`
          id, subject, guest_checkout_date, guest_charge_dismissed_at, guest_charge_dismissed_by,
          properties!tickets_property_id_fkey(name)
        `)
        .eq("ticket_type", "manutencao")
        .eq("cost_responsible", "guest")
        .not("guest_charge_dismissed_at", "is", null)
        .order("guest_charge_dismissed_at", { ascending: false });

      if (error) throw error;

      const ticketIds = (tickets || []).map(t => t.id);
      const dismisserIds = Array.from(
        new Set((tickets || []).map(t => t.guest_charge_dismissed_by).filter(Boolean) as string[])
      );

      const chargeByTicket = new Map<string, string>();
      if (ticketIds.length > 0) {
        const { data: charges } = await supabase
          .from("charges")
          .select("id, ticket_id")
          .in("ticket_id", ticketIds);
        (charges || []).forEach(c => c.ticket_id && chargeByTicket.set(c.ticket_id, c.id));
      }

      const namesById = new Map<string, string>();
      if (dismisserIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", dismisserIds);
        (profs || []).forEach(p => namesById.set(p.id, p.name));
      }

      setItems(
        (tickets || []).map(t => ({
          id: t.id,
          subject: t.subject,
          guest_checkout_date: t.guest_checkout_date,
          property_name: (t.properties as any)?.name || "Imóvel desconhecido",
          guest_charge_dismissed_at: t.guest_charge_dismissed_at as string,
          dismissed_by_name: t.guest_charge_dismissed_by ? namesById.get(t.guest_charge_dismissed_by) ?? null : null,
          charge_id: chargeByTicket.get(t.id) ?? null,
        }))
      );
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar as cobranças arquivadas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleRestore = async (item: DismissedItem) => {
    setRestoringId(item.id);
    try {
      const { error } = await supabase
        .from("tickets")
        .update({
          guest_charge_dismissed_at: null,
          guest_charge_dismissed_by: null,
          guest_charge_dismiss_reason: null,
        })
        .eq("id", item.id);
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== item.id));
      setItemParaRestaurar(null);
      toast.success("Cobrança restaurada para o painel");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível restaurar a cobrança.");
    } finally {
      setRestoringId(null);
    }
  };

  const abrirItem = (item: DismissedItem) =>
    navigate(item.charge_id ? `/cobranca/${item.charge_id}` : `/ticket-detalhes/${item.id}`);

  const formatarArquivamento = (iso: string) => format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  return (
    <PaginaInterna
      largura="media"
      cabecalho={
        <CabecalhoPagina
          titulo="Cobranças de hóspede já cobradas"
          subtitulo="Marcadas como cobradas e fora dos avisos. Restaure se precisar cobrar de novo."
          icone={<Archive />}
          tom="neutral"
          voltarPara="/painel"
        />
      }
    >
      {loading ? (
        <CaixaCarregando icone={<Archive />} titulo="Cobradas" linhas={4} />
      ) : items.length === 0 ? (
        <CaixaOperacao icone={<Archive />} titulo="Cobradas">
          <EmptyState
            ilustracao="cobrancas"
            title="Nenhuma cobrança marcada como cobrada"
            description="Quando você arquivar uma cobrança de hóspede no painel, ela aparecerá aqui."
          />
        </CaixaOperacao>
      ) : (
        <CaixaOperacao
          icone={<Archive />}
          titulo="Cobradas"
          selos={<SeloContagem>{items.length}</SeloContagem>}
        >
          <div className="space-y-1">
            {items.map(item => (
              <LinhaCaixa
                key={item.id}
                miniatura={<MiniaturaImovel fallback={<Building2 />} />}
                titulo={item.subject}
                subtitulo={
                  <>
                    {item.property_name}
                    {item.guest_checkout_date && <> · Check-out {formatarData(item.guest_checkout_date)}</>}
                  </>
                }
                meta={
                  <span className="text-[11px] text-muted-foreground">
                    Cobrada em {formatarArquivamento(item.guest_charge_dismissed_at)}
                    {item.dismissed_by_name && <> por {item.dismissed_by_name}</>}
                  </span>
                }
                acoes={
                  <BotaoLinha
                    rotulo="Restaurar para o painel"
                    texto="Restaurar"
                    disabled={restoringId === item.id}
                    onClick={() => setItemParaRestaurar(item)}
                  >
                    <RotateCcw />
                  </BotaoLinha>
                }
                onClick={() => abrirItem(item)}
              />
            ))}
          </div>
        </CaixaOperacao>
      )}

      <ConfirmationDialog
        open={!!itemParaRestaurar}
        onOpenChange={(aberto) => !aberto && setItemParaRestaurar(null)}
        title="Restaurar cobrança de hóspede?"
        description={
          itemParaRestaurar
            ? `"${itemParaRestaurar.subject}" volta para o lembrete de cobrança de hóspede no painel da equipe.`
            : ""
        }
        confirmLabel="Restaurar"
        loading={!!restoringId}
        onConfirm={() => itemParaRestaurar && handleRestore(itemParaRestaurar)}
      />
    </PaginaInterna>
  );
}
