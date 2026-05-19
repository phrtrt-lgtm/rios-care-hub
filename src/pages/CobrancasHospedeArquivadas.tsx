import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Archive, Building2, RotateCcw, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionSkeleton } from "@/components/ui/section-skeleton";

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
      toast.error("Erro ao carregar arquivadas");
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
      toast.success("Cobrança restaurada para o painel");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao restaurar");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-muted-foreground" />
            Cobranças de hóspede arquivadas
            <Badge variant="secondary" className="ml-2">{items.length}</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cobranças marcadas como feitas diretamente pelo Airbnb. Restaure se precisar processá-las pelo portal.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <SectionSkeleton />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Archive className="h-6 w-6" />}
              title="Nenhuma cobrança arquivada"
              description="Quando você arquivar uma cobrança de hóspede no painel, ela aparecerá aqui."
            />
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(item.charge_id ? `/cobranca/${item.charge_id}` : `/ticket-detalhes/${item.id}`)}
                >
                  <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.property_name}
                      {item.guest_checkout_date && (
                        <> · Check-out {format(new Date(item.guest_checkout_date), "dd/MM/yyyy", { locale: ptBR })}</>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Arquivada em {format(new Date(item.guest_charge_dismissed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      {item.dismissed_by_name && <> por {item.dismissed_by_name}</>}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 gap-1"
                    disabled={restoringId === item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(item);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurar
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
