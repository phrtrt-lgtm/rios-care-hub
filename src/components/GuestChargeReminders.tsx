import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Archive, ChevronDown, ChevronRight, DollarSign, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useGuestCharges, type GuestChargeItem } from "@/hooks/useGuestCharges";
import type { DetailEntityType } from "@/hooks/useDetailSheet";

interface Props {
  /** Controlado pelo painel, para o resumo do topo conseguir abrir o lembrete. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Abre o item no painel lateral, sem sair do painel. */
  onOpenDetail: (id: string, type: DetailEntityType) => void;
}

const GRUPOS: { id: GuestChargeItem["grupo"]; titulo: string; classe: string }[] = [
  { id: "pronta", titulo: "Prontas para cobrar", classe: "text-success" },
  { id: "em_breve", titulo: "Em breve", classe: "text-muted-foreground" },
  { id: "sem_data", titulo: "Sem data de check-out — informe a data para entrar na contagem", classe: "text-warning" },
];

/**
 * Lembrete de cobranças de hóspede.
 *
 * Fechado, é uma linha só com os totais — lembra sem ocupar o topo do painel.
 * Aberto, mostra a lista inteira (antes eram 3 itens e um "+ N mais" que não
 * abria), com rolagem própria, e cada item abre no painel lateral.
 */
export function GuestChargeReminders({ open, onOpenChange, onOpenDetail }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: itens = [], isLoading } = useGuestCharges();
  const [confirmar, setConfirmar] = useState<GuestChargeItem | null>(null);
  const [arquivandoId, setArquivandoId] = useState<string | null>(null);

  if (isLoading) return null;

  const prontas = itens.filter((i) => i.grupo === "pronta");
  const emBreve = itens.filter((i) => i.grupo === "em_breve");
  const semData = itens.filter((i) => i.grupo === "sem_data");
  const proxima = emBreve[0]?.days_until_charge;

  const arquivar = async (item: GuestChargeItem) => {
    setArquivandoId(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("tickets")
        .update({
          guest_charge_dismissed_at: new Date().toISOString(),
          guest_charge_dismissed_by: user?.id ?? null,
        })
        .eq("id", item.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["painel", "guest-charges"] });
      toast.success("Cobrança arquivada (feita pelo Airbnb)");
    } catch (err) {
      console.error("Erro ao arquivar cobrança de hóspede:", err);
      toast.error("Erro ao arquivar cobrança");
    } finally {
      setArquivandoId(null);
      setConfirmar(null);
    }
  };

  const abrir = (item: GuestChargeItem) =>
    item.charge_id ? onOpenDetail(item.charge_id, "cobranca") : onOpenDetail(item.id, "maintenance");

  const botaoArquivadas = (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 text-xs text-muted-foreground"
      onClick={(e) => {
        e.stopPropagation();
        navigate("/cobrancas-hospede-arquivadas");
      }}
    >
      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Arquivadas</span>
    </Button>
  );

  if (itens.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <DollarSign className="h-4 w-4" aria-hidden="true" />
          Nenhuma cobrança de hóspede pendente
        </span>
        {botaoArquivadas}
      </div>
    );
  }

  return (
    <div
      id="lembrete-hospede"
      className={cn(
        "rounded-lg border bg-card",
        prontas.length > 0 && "border-success/40",
      )}
    >
      {/* Linha de resumo — sempre visível */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenChange(!open);
          }
        }}
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <DollarSign className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <span className="text-sm font-medium">Cobranças de hóspede</span>

        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {prontas.length > 0 && (
            <Badge className="bg-success text-success-foreground hover:bg-success">
              {prontas.length} {prontas.length === 1 ? "pronta" : "prontas"} para cobrar
            </Badge>
          )}
          {emBreve.length > 0 && (
            <Badge variant="outline" className="font-normal">
              {emBreve.length} em breve
              {proxima != null && ` · próxima em ${proxima} ${proxima === 1 ? "dia" : "dias"}`}
            </Badge>
          )}
          {semData.length > 0 && (
            <Badge variant="outline" className="border-warning/40 font-normal text-warning">
              {semData.length} sem data de check-out
            </Badge>
          )}
        </div>

        {botaoArquivadas}
      </div>

      {/* Lista completa — rola dentro da caixa, sem empurrar o painel */}
      {open && (
        <div className="max-h-[420px] space-y-3 overflow-y-auto border-t px-3 pb-3 pt-2">
          {GRUPOS.map((grupo) => {
            const lista = itens.filter((i) => i.grupo === grupo.id);
            if (lista.length === 0) return null;
            return (
              <div key={grupo.id} className="space-y-1">
                <p className={cn("text-xs font-semibold", grupo.classe)}>
                  {grupo.titulo} ({lista.length})
                </p>
                {lista.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => abrir(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") abrir(item);
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-md bg-muted/40 px-2.5 py-1.5 transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.property_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.subject}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      {item.guest_checkout_date && (
                        <p>Check-out {format(new Date(item.guest_checkout_date), "dd/MM", { locale: ptBR })}</p>
                      )}
                      {item.grupo === "em_breve" && item.days_until_charge != null && (
                        <p>
                          cobrar em {item.days_until_charge} {item.days_until_charge === 1 ? "dia" : "dias"}
                        </p>
                      )}
                      {item.grupo === "pronta" && <p className="font-medium text-success">já pode cobrar</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      disabled={arquivandoId === item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmar(item);
                      }}
                      aria-label={`Arquivar cobrança de hóspede de ${item.property_name}`}
                      title="Arquivar (cobrança feita pelo Airbnb)"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar cobrança de hóspede?</AlertDialogTitle>
            <AlertDialogDescription>
              Use esta opção quando a cobrança já foi feita diretamente pelo Airbnb. O aviso sai do painel mas
              fica salvo em "Cobranças de hóspede arquivadas" — você pode restaurar depois se precisar.
              {confirmar && (
                <span className="mt-2 block font-medium text-foreground">
                  {confirmar.subject} — {confirmar.property_name}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmar && arquivar(confirmar)}>Arquivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
