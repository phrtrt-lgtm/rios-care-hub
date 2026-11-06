import { useState } from "react";
import { useLocation } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, History, MessageSquare, Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { type ConversaResumo, useConversaIA, useConversasIA, useIaLiberada } from "@/hooks/useAssistenteIA";
import { SUGESTOES_EQUIPE, SUGESTOES_PROPRIETARIO } from "@/lib/iaMeta";
import { primeiroNome } from "@/components/painel/tons";
import { cn } from "@/lib/utils";
import { ConversaAssistente } from "./ConversaAssistente";
import { CLASSE_BOTAO_CABECALHO, CLASSES_PAINEL } from "./estilos";
import { OrbeAssistente } from "./OrbeAssistente";

const EQUIPE = ["admin", "agent", "maintenance"];
const ROTAS_SEM_WIDGET = ["/login", "/cadastro", "/cadastro-imovel", "/debug-app", "/definir-senha", "/aguardando-aprovacao", "/curadoria/"];

const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Assistente de IA do portal, montado uma vez em App.tsx (PLANO_IA_AGENTE.md §6),
 * fora das rotas: por isso o balão está em toda página logada, e a conversa
 * sobrevive à navegação. Aparece quando `ia_agente_liberado()` diz que o
 * assistente está ligado para o papel de quem está logado (equipe desde a
 * Fase 1; proprietário desde a Fase 2, com as ferramentas dele e sem dado de
 * hóspede). Usuário só de curadoria nunca vê.
 *
 * No desktop o painel é um cartão ancorado no canto do balão, não modal: a
 * pessoa continua usando a página com ele aberto. No celular é uma folha de
 * baixo, quase tela cheia.
 */
export default function AssistenteIA() {
  const { user, profile } = useAuth();
  const { pathname } = useLocation();
  const celular = useIsMobile();
  const papel = (profile?.role as string | undefined) ?? "";
  const equipe = EQUIPE.includes(papel);
  const curadoriaApenas = (profile as { curation_only?: boolean | null } | null)?.curation_only === true;
  const liberada = useIaLiberada(!!user && !curadoriaApenas);
  const [aberto, setAberto] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  const conversa = useConversaIA(pathname);
  const historico = useConversasIA(user?.id, aberto && verHistorico);

  if (!user || curadoriaApenas) return null;
  if (ROTAS_SEM_WIDGET.some((r) => pathname.startsWith(r))) return null;
  if (liberada.data !== true) return null;

  const abrirConversa = async (c: ConversaResumo) => {
    await conversa.abrirConversa(c.id);
    setVerHistorico(false);
  };

  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={setAberto} modal={celular}>
      <Balao oculto={aberto} onClick={() => setAberto(true)} />

      <DialogPrimitive.Portal>
        {celular && (
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-secondary/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        )}
        <DialogPrimitive.Content
          // No desktop o painel fica aberto enquanto a pessoa mexe na página;
          // fecha pelo X, pelo Esc ou pelo próprio balão.
          onInteractOutside={(e) => {
            if (!celular) e.preventDefault();
          }}
          // O foco vai para o campo de texto (ConversaAssistente), não para o
          // primeiro botão do cabeçalho.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={CLASSES_PAINEL}
        >
          <Cabecalho
            ocupado={conversa.ocupado}
            verHistorico={verHistorico}
            onHistorico={() => setVerHistorico((v) => !v)}
            onNova={() => {
              conversa.novaConversa();
              setVerHistorico(false);
            }}
            descricao={
              equipe
                ? "Consulta imóveis, reservas, chamados, cobranças e manutenções. Ações só com a sua confirmação."
                : "Consulta seus imóveis, reservas, cobranças e chamados, e pede bloqueio de datas. Ações só com a sua confirmação."
            }
          />

          <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-muted/40 to-background">
            {verHistorico ? (
              <ListaConversas
                conversas={historico.data ?? []}
                carregando={historico.isLoading}
                atual={conversa.conversaId}
                onAbrir={abrirConversa}
              />
            ) : (
              <ConversaAssistente
                conversa={conversa}
                sugestoes={equipe ? SUGESTOES_EQUIPE : SUGESTOES_PROPRIETARIO}
                nome={primeiroNome((profile as { full_name?: string | null } | null)?.full_name)}
                equipe={equipe}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** O balão flutuante: gradiente da marca, orbe pulsando e selo de "online". */
export function Balao({ oculto, onClick }: { oculto: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir o assistente de IA"
      tabIndex={oculto ? -1 : 0}
      className={cn(
        "group fixed right-4 z-40 flex items-center gap-2.5 rounded-full p-1.5 pr-1.5 text-sm font-semibold text-secondary-foreground sm:pr-4",
        "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:right-6",
        "bg-gradient-to-r from-secondary via-[hsl(var(--rios-blue))] to-primary",
        "shadow-[0_12px_32px_-10px_hsl(var(--secondary)/0.6)] ring-1 ring-secondary-foreground/20",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-12px_hsl(var(--secondary)/0.65)] active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "animate-fade-in-scale motion-reduce:animate-none",
        oculto && "pointer-events-none scale-90 opacity-0",
      )}
    >
      <OrbeAssistente className="h-9 w-9 bg-none bg-secondary-foreground/15 shadow-none backdrop-blur-sm" iconeClassName="h-[18px] w-[18px]" pulsar />
      <span className="hidden sm:inline">Assistente</span>
      <span
        className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-background bg-success"
        aria-hidden="true"
      />
    </button>
  );
}

/** Cabeçalho do painel (precisa estar dentro de um `DialogPrimitive.Root`). */
export function Cabecalho({
  ocupado,
  verHistorico,
  descricao,
  onHistorico,
  onNova,
}: {
  ocupado: boolean;
  verHistorico: boolean;
  descricao: string;
  onHistorico: () => void;
  onNova: () => void;
}) {
  return (
    <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-secondary via-[hsl(var(--rios-blue-deep))] to-[hsl(var(--rios-blue))] px-4 pb-4 pt-4 text-secondary-foreground md:pt-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-44 w-44 rounded-full bg-primary/35 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-6 h-44 w-44 rounded-full bg-[hsl(var(--rios-blue-light)/0.35)] blur-3xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <OrbeAssistente className="h-11 w-11 ring-2 ring-secondary-foreground/25" iconeClassName="h-5 w-5" />
          <div>
            <DialogPrimitive.Title className="text-base font-semibold leading-tight">Assistente RIOS</DialogPrimitive.Title>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-secondary-foreground/75">
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              {ocupado ? "Consultando o portal…" : "Conectado ao portal"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <BotaoCabecalho icone={History} rotulo="Conversas anteriores" pressionado={verHistorico} onClick={onHistorico} />
          <BotaoCabecalho icone={Plus} rotulo="Nova conversa" onClick={onNova} disabled={ocupado} />
          <DialogPrimitive.Close className={CLASSE_BOTAO_CABECALHO} aria-label="Fechar o assistente">
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
      </div>
      <DialogPrimitive.Description className="sr-only">{descricao}</DialogPrimitive.Description>
    </header>
  );
}

function BotaoCabecalho({
  icone: Icone,
  rotulo,
  pressionado,
  disabled,
  onClick,
}: {
  icone: LucideIcon;
  rotulo: string;
  pressionado?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={pressionado}
      disabled={disabled}
      onClick={onClick}
      className={cn(CLASSE_BOTAO_CABECALHO, pressionado && "bg-secondary-foreground/20 text-secondary-foreground")}
    >
      <Icone className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function ListaConversas({
  conversas,
  carregando,
  atual,
  onAbrir,
}: {
  conversas: ConversaResumo[];
  carregando: boolean;
  atual: string | null;
  onAbrir: (c: ConversaResumo) => void;
}) {
  if (carregando) {
    return (
      <div className="space-y-2 px-4 py-4" aria-busy="true" aria-label="Carregando as conversas">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }
  if (conversas.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <History className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-semibold text-foreground">Nenhuma conversa anterior</p>
        <p className="mt-1 text-xs text-muted-foreground">As conversas ficam guardadas e você pode voltar a elas.</p>
      </div>
    );
  }
  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Conversas anteriores</p>
      <ul className="space-y-2">
        {conversas.map((c) => {
          const ativa = c.id === atual;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onAbrir(c)}
                aria-current={ativa ? "true" : undefined}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                  ativa ? "border-primary/50 bg-primary/5" : "border-border/70",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                    ativa ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
                  )}
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{c.titulo || "Conversa"}</span>
                  <span className="block text-[11px] text-muted-foreground">{quando(c.atualizada_em)}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
