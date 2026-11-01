import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CalendarOff,
  Database,
  ListChecks,
  Loader2,
  Lock,
  MessageSquare,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { ItemChat, useConversaIA } from "@/hooks/useAssistenteIA";
import { useIsMobile } from "@/hooks/use-mobile";
import { rotuloFerramenta } from "@/lib/iaMeta";
import { renderizarCorpo } from "@/components/chat/CorpoMensagem";
import { saudacao } from "@/components/painel/tons";
import { cn } from "@/lib/utils";
import { CartaoAcao } from "./CartaoAcao";
import { OrbeAssistente } from "./OrbeAssistente";

interface Props {
  conversa: ReturnType<typeof useConversaIA>;
  sugestoes: string[];
  /** Primeiro nome de quem está logado, para a saudação. */
  nome: string;
  equipe: boolean;
}

const ALTURA_MAXIMA_CAMPO = 140;

/** Ícone de cada sugestão, pelo assunto. */
function iconeSugestao(texto: string): LucideIcon {
  const t = texto.toLowerCase();
  if (/ocupa|resultado|diária/.test(t)) return BarChart3;
  if (/bloque/.test(t)) return CalendarOff;
  if (/reserva|entra|sai /.test(t)) return CalendarDays;
  if (/cobran|atraso|vencid/.test(t)) return Receipt;
  if (/chamado/.test(t)) return MessageSquare;
  if (/manuten/.test(t)) return Wrench;
  if (/lista|pendente/.test(t)) return ListChecks;
  return Sparkles;
}

/**
 * Corpo do painel do assistente: boas-vindas com sugestões, a conversa e o
 * campo de envio. A lógica (envio, confirmação de ação) vem toda do hook
 * `useConversaIA`; aqui é só a tela.
 */
export function ConversaAssistente({ conversa, sugestoes, nome, equipe }: Props) {
  const [texto, setTexto] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const { itens, ocupado, carregando, enviar, decidir } = conversa;
  const celular = useIsMobile();

  // No desktop o campo já nasce focado; no celular não, para o teclado não
  // subir antes da pessoa querer escrever.
  useEffect(() => {
    if (!celular) campoRef.current?.focus({ preventScroll: true });
  }, [celular]);

  // Rola até a última mensagem; as boas-vindas ficam no topo.
  useEffect(() => {
    if (itens.length === 0 && !ocupado) return;
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [itens, ocupado]);

  // O campo cresce com o texto até um limite; depois rola por dentro.
  useEffect(() => {
    const el = campoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAXIMA_CAMPO)}px`;
  }, [texto]);

  const mandar = (t?: string) => {
    const conteudo = (t ?? texto).trim();
    if (!conteudo || ocupado) return;
    setTexto("");
    void enviar(conteudo);
  };

  const aoTeclar = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      mandar();
    }
  };

  const vazia = !carregando && itens.length === 0;

  return (
    <>
      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-4">
        {carregando && <CarregandoConversa />}

        {vazia && <BoasVindas nome={nome} equipe={equipe} sugestoes={sugestoes} onEscolher={mandar} />}

        {itens.map((item, i) => {
          const anterior = itens[i - 1];
          const agrupada = !!anterior && anterior.role === item.role && !anterior.pendente;
          return (
            <Mensagem
              key={item.id}
              item={item}
              agrupada={agrupada}
              ocupado={ocupado}
              onConfirmar={() => item.pendente && void decidir(item.pendente.id, "confirmar")}
              onCancelar={() => item.pendente && void decidir(item.pendente.id, "cancelar")}
            />
          );
        })}

        {ocupado && <Pensando />}
        <div ref={fimRef} className="h-1" />
      </div>

      <div className="shrink-0 border-t border-border/70 bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
        <div
          className={cn(
            "flex items-end gap-2 rounded-2xl border border-border bg-muted/40 p-1.5 pl-3 transition-all",
            "focus-within:border-primary/50 focus-within:bg-background focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]",
          )}
        >
          <textarea
            ref={campoRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={aoTeclar}
            placeholder={equipe ? "Pergunte ou peça uma ação…" : "Pergunte sobre o seu imóvel…"}
            rows={1}
            aria-label="Mensagem para o assistente"
            disabled={carregando}
            className="min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => mandar()}
            disabled={!texto.trim() || ocupado || carregando}
            aria-label="Enviar"
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-md transition-all",
              "bg-gradient-to-br from-primary to-[hsl(var(--rios-terra-light))] hover:shadow-lg active:scale-95",
              "disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none",
            )}
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <p className="mt-1.5 hidden px-1 text-[10px] text-muted-foreground md:block">
          Enter envia · Shift+Enter quebra a linha · Toda ação pede a sua confirmação
        </p>
      </div>
    </>
  );
}

function BoasVindas({
  nome,
  equipe,
  sugestoes,
  onEscolher,
}: {
  nome: string;
  equipe: boolean;
  sugestoes: string[];
  onEscolher: (texto: string) => void;
}) {
  return (
    <div className="animate-fade-in-up motion-reduce:animate-none">
      <div className="flex items-start gap-3">
        <OrbeAssistente className="mt-0.5 h-10 w-10" iconeClassName="h-5 w-5" />
        <div className="rounded-2xl rounded-tl-md border border-border/70 bg-card px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-foreground">
            {saudacao()}
            {nome ? `, ${nome}` : ""}.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {equipe
              ? "Pergunte sobre imóveis, reservas, chamados, cobranças e manutenções, ou peça uma ação. Eu consulto o portal e respondo com a fonte."
              : "Pergunte sobre o seu imóvel, as reservas, cobranças e chamados, ou peça um bloqueio de datas. Eu consulto o portal e respondo com a fonte."}
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Como o assistente funciona">
        <Selo icone={Database}>Lê o portal em tempo real</Selo>
        <Selo icone={ShieldCheck}>Ações só com a sua confirmação</Selo>
        {!equipe && <Selo icone={Lock}>Só os seus imóveis</Selo>}
      </ul>

      <p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sugestões</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {sugestoes.map((s, i) => {
          const Icone = iconeSugestao(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => onEscolher(s)}
              style={{ animationDelay: `${80 + i * 50}ms` }}
              className={cn(
                "group flex items-start gap-2.5 rounded-2xl border border-border/70 bg-card px-3 py-2.5 text-left text-[13px] leading-snug text-foreground/90 shadow-sm",
                "transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                "opacity-0 animate-fade-in-up motion-reduce:animate-none motion-reduce:opacity-100",
              )}
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                <Icone className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="flex-1">{s}</span>
              <ArrowUpRight
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Selo({ icone: Icone, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
      <Icone className="h-3 w-3 text-secondary" aria-hidden="true" />
      {children}
    </li>
  );
}

function Mensagem({
  item,
  agrupada,
  ocupado,
  onConfirmar,
  onCancelar,
}: {
  item: ItemChat;
  agrupada: boolean;
  ocupado: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (item.role === "user") {
    return (
      <div className={cn("flex justify-end animate-fade-in motion-reduce:animate-none", agrupada ? "mt-1" : "mt-4")}>
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-2 text-sm leading-relaxed text-secondary-foreground shadow-sm">
          {renderizarCorpo(item.texto)}
        </div>
      </div>
    );
  }

  const consultas = item.consultas ?? [];
  return (
    <div className={cn("flex items-start gap-2.5 animate-fade-in motion-reduce:animate-none", agrupada ? "mt-1.5" : "mt-4")}>
      {agrupada ? <span className="w-7 shrink-0" /> : <OrbeAssistente className="mt-0.5 h-7 w-7" iconeClassName="h-3.5 w-3.5" />}
      <div className="min-w-0 max-w-[88%] flex-1">
        {item.texto && (
          <div
            className={cn(
              "rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-sm",
              item.erro ? "border-destructive/40 bg-destructive/5" : "border-border/70 bg-card",
            )}
          >
            {item.erro && (
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Não deu certo
              </p>
            )}
            {renderizarCorpo(item.texto)}
          </div>
        )}
        {consultas.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1 px-0.5" aria-label="Fontes consultadas">
            {consultas.map((c) => (
              <li
                key={c}
                className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info/5 px-2 py-0.5 text-[11px] text-info"
              >
                <Database className="h-3 w-3" aria-hidden="true" />
                {rotuloFerramenta(c)}
              </li>
            ))}
          </ul>
        )}
        {item.pendente && (
          <CartaoAcao
            acao={item.pendente}
            decisao={item.decisao}
            resultado={item.resultado}
            ocupado={ocupado}
            onConfirmar={onConfirmar}
            onCancelar={onCancelar}
          />
        )}
      </div>
    </div>
  );
}

function Pensando() {
  return (
    <div className="mt-4 flex items-center gap-2.5 animate-fade-in motion-reduce:animate-none" role="status" aria-live="polite">
      <OrbeAssistente className="h-7 w-7" iconeClassName="h-3.5 w-3.5 animate-pulse-subtle motion-reduce:animate-none" />
      <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-border/70 bg-card px-3.5 py-2.5 shadow-sm">
        <span className="flex items-center gap-1" aria-hidden="true">
          {[0, 150, 300].map((atraso) => (
            <span
              key={atraso}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary motion-reduce:animate-none"
              style={{ animationDelay: `${atraso}ms` }}
            />
          ))}
        </span>
        <span className="text-xs text-muted-foreground">Consultando o portal…</span>
      </div>
    </div>
  );
}

function CarregandoConversa() {
  return (
    <div className="space-y-4 py-2" aria-busy="true" aria-label="Carregando a conversa">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn("flex gap-2.5", i === 1 && "justify-end")}>
          {i !== 1 && <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />}
          <span className={cn("h-12 animate-pulse rounded-2xl bg-muted", i === 1 ? "w-1/2" : "w-3/4")} />
        </div>
      ))}
    </div>
  );
}
