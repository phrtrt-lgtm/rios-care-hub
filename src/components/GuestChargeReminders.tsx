import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Check, ChevronDown, ChevronRight, Download, Loader2, Paperclip, UserRound } from "lucide-react";
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
import { GrupoCaixa, SeloContagem } from "@/components/painel/CaixaOperacao";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { formatarBRL, formatarData } from "@/lib/cobrancaMeta";
import { baixarAnexosEmZip, resumoDownloadAnexos } from "@/lib/baixarAnexos";
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
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

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
      toast.success("Marcada como cobrada. Saiu dos avisos.");
    } catch (err) {
      console.error("Erro ao arquivar cobrança de hóspede:", err);
      toast.error("Não foi possível marcar como cobrada");
    } finally {
      setArquivandoId(null);
      setConfirmar(null);
    }
  };

  const baixarAnexos = async (item: GuestChargeItem) => {
    setBaixandoId(item.id);
    try {
      const resultado = await baixarAnexosEmZip([
        {
          ticketId: item.id,
          checkout: item.guest_checkout_date,
          imovel: item.property_name,
          dano: item.subject,
        },
      ]);
      if (resultado.baixados === 0) {
        toast.error(resultado.falhas > 0 ? "Não foi possível baixar os anexos" : "Nenhum anexo para baixar");
      } else {
        toast.success("Download iniciado", { description: resumoDownloadAnexos(resultado) });
      }
    } catch (err) {
      console.error("Erro ao baixar anexos:", err);
      toast.error("Não foi possível baixar os anexos");
    } finally {
      setBaixandoId(null);
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
      <span className="hidden sm:inline">Cobradas</span>
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
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight sm:flex-none">Cobranças de hóspede</span>

        {/* No celular os selos vão para a linha de baixo: espremidos ao lado do
            título, o texto quebrava dentro da pílula de altura fixa. */}
        <div className="order-last flex basis-full flex-wrap items-center gap-1.5 sm:order-none sm:basis-auto sm:flex-1 [&>span]:whitespace-nowrap">
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
        <div className="max-h-[520px] space-y-3 overflow-y-auto border-t border-border/60 px-3 pb-3 pt-3">
          {GRUPOS.map((grupo) => {
            const lista = itens.filter((i) => i.grupo === grupo.id);
            if (lista.length === 0) return null;
            return (
              <GrupoCaixa key={grupo.id} titulo={grupo.titulo} quantidade={lista.length} tom={grupo.tom}>
                {lista.map((item) => (
                  <LinhaHospede
                    key={item.id}
                    item={item}
                    onAbrir={() => abrir(item)}
                    onCobrada={() => setConfirmar(item)}
                    onBaixar={() => baixarAnexos(item)}
                    baixando={baixandoId === item.id}
                    arquivando={arquivandoId === item.id}
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
            <AlertDialogTitle>Marcar como cobrada?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme quando a cobrança já foi feita ao hóspede (pelo Airbnb ou por fora). O aviso sai do painel e
              fica salvo em "Cobradas", de onde dá para restaurar se precisar.
              {confirmar && (
                <span className="mt-2 block font-medium text-foreground">
                  {confirmar.subject} — {confirmar.property_name}
                  {confirmar.amount_cents ? ` — ${formatarBRL(confirmar.amount_cents)}` : ""}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmar && arquivar(confirmar)}>Sim, já foi cobrada</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface LinhaHospedeProps {
  item: GuestChargeItem;
  onAbrir: () => void;
  onCobrada: () => void;
  onBaixar: () => void;
  baixando: boolean;
  arquivando: boolean;
}

/** Um dado da linha: rótulo pequeno em cima, valor embaixo. */
function Dado({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="truncate text-xs font-medium tabular-nums">{children}</p>
    </div>
  );
}

/**
 * Linha detalhada de uma cobrança de hóspede: dano e imóvel, check-out, valor,
 * situação da manutenção e do prazo, e as ações (baixar anexos, Cobrada).
 */
function LinhaHospede({ item, onAbrir, onCobrada, onBaixar, baixando, arquivando }: LinhaHospedeProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
      className="flex cursor-pointer flex-col gap-2 rounded-lg bg-muted/40 px-2.5 py-2 transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex-row lg:items-center lg:gap-4"
    >
      <div className="min-w-0 lg:flex-1">
        <p className="truncate text-[13px] font-medium leading-tight">{item.subject}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.property_name}</p>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-1 lg:w-[330px] lg:shrink-0">
        <Dado rotulo="Check-out">
          {item.guest_checkout_date ? formatarData(item.guest_checkout_date) : <span className="text-warning">Sem data</span>}
        </Dado>
        <Dado rotulo="Valor">
          {item.amount_cents ? formatarBRL(item.amount_cents) : <span className="text-muted-foreground">Sem valor</span>}
        </Dado>
        <Dado rotulo="Cobrar">
          {item.grupo === "pronta" ? (
            <span className="text-success">Já pode</span>
          ) : item.grupo === "em_breve" && item.days_until_charge != null ? (
            <>
              em {item.days_until_charge} {item.days_until_charge === 1 ? "dia" : "dias"}
              {item.cobrar_a_partir_de && (
                <span className="font-normal text-muted-foreground"> · {formatarData(item.cobrar_a_partir_de, "dd/MM")}</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Dado>
      </div>

      <div className="flex items-center justify-between gap-1.5 lg:shrink-0 lg:justify-end" onClick={(e) => e.stopPropagation()}>
        <Etiqueta tom={item.feita ? "success" : "info"} className="shrink-0">
          {item.feita ? "Manutenção feita" : "Em andamento"}
        </Etiqueta>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            disabled={baixando || item.attachments_count === 0}
            onClick={onBaixar}
            aria-label={`Baixar todos os anexos (.zip): ${item.property_name}`}
            title={item.attachments_count === 0 ? "Sem anexos" : "Baixar todos os anexos (.zip)"}
          >
            {baixando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : item.attachments_count === 0 ? (
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {item.attachments_count === 0 ? "Sem anexos" : `Anexos (${item.attachments_count})`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 border-success/40 px-2 text-xs text-success hover:bg-success/10 hover:text-success"
            disabled={arquivando}
            onClick={onCobrada}
            aria-label={`Marcar como cobrada: ${item.property_name}`}
            title="Já cobrei do hóspede: tirar dos avisos"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Cobrada
          </Button>
        </div>
      </div>
    </div>
  );
}
