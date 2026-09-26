import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Archive, ChevronDown, ChevronRight, UserRound, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { GrupoCaixa, LinhaCaixa, SeloContagem } from "@/components/painel/CaixaOperacao";
import { TOM, type Tom } from "@/components/painel/tons";

interface Props {
  /** Controlado pelo painel, para o resumo do topo conseguir abrir o lembrete. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Abre o item no painel lateral, sem sair do painel. */
  onOpenDetail: (id: string, type: DetailEntityType) => void;
}

const GRUPOS: { id: GuestChargeItem["grupo"]; titulo: string; tom: Tom }[] = [
  { id: "pronta", titulo: "Prontas para cobrar", tom: "success" },
  { id: "em_breve", titulo: "Em breve", tom: "neutral" },
  { id: "sem_data", titulo: "Sem data de check-out — informe a data para entrar na contagem", tom: "warning" },
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
      onClick={(e) => {
        e.stopPropagation();
        navigate("/cobrancas-hospede-arquivadas");
      }}
    >
      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Arquivadas</span>
    </Button>
  );

  const tomCabecalho: Tom = prontas.length > 0 ? "success" : "warning";

  if (itens.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted" aria-hidden="true">
            <UserRound className="h-4 w-4" />
          </span>
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
        "rounded-xl border border-border/70 bg-card shadow-sm",
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
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TOM[tomCabecalho].caixa)} aria-hidden="true">
          <UserRound className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">Cobranças de hóspede</span>

        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {prontas.length > 0 && (
            <SeloContagem tom="success">
              {prontas.length} {prontas.length === 1 ? "pronta" : "prontas"} para cobrar
            </SeloContagem>
          )}
          {emBreve.length > 0 && (
            <SeloContagem className="font-medium">
              {emBreve.length} em breve
              {proxima != null && ` · próxima em ${proxima} ${proxima === 1 ? "dia" : "dias"}`}
            </SeloContagem>
          )}
          {semData.length > 0 && (
            <SeloContagem tom="warning" className="font-medium">
              {semData.length} sem data de check-out
            </SeloContagem>
          )}
        </div>

        {botaoArquivadas}
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      {/* Lista completa — rola dentro da caixa, sem empurrar o painel */}
      {open && (
        <div className="max-h-[420px] space-y-3 overflow-y-auto border-t border-border/60 px-3 pb-3 pt-3">
          {GRUPOS.map((grupo) => {
            const lista = itens.filter((i) => i.grupo === grupo.id);
            if (lista.length === 0) return null;
            return (
              <GrupoCaixa key={grupo.id} titulo={grupo.titulo} quantidade={lista.length} tom={grupo.tom}>
                {lista.map((item) => (
                  <LinhaCaixa
                    key={item.id}
                    titulo={item.property_name}
                    subtitulo={item.subject}
                    onClick={() => abrir(item)}
                    semSeta
                    meta={
                      <div className="text-muted-foreground">
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
                    }
                    acoes={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        disabled={arquivandoId === item.id}
                        onClick={() => setConfirmar(item)}
                        aria-label={`Arquivar cobrança de hóspede de ${item.property_name}`}
                        title="Arquivar (cobrança feita pelo Airbnb)"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    }
                  />
                ))}
              </GrupoCaixa>
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
