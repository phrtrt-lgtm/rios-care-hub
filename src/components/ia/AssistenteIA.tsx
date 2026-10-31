import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { BrainCircuit, Clock, Loader2, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { type ConversaResumo, useConfigIA, useConversaIA, useConversasIA } from "@/hooks/useAssistenteIA";
import { SUGESTOES_EQUIPE, rotuloFerramenta } from "@/lib/iaMeta";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { ChatTypingIndicator } from "@/components/chat/ChatTypingIndicator";
import { renderizarCorpo } from "@/components/chat/CorpoMensagem";
import { CartaoAcao } from "./CartaoAcao";

const EQUIPE = ["admin", "agent", "maintenance"];
const ROTAS_SEM_WIDGET = ["/login", "/cadastro", "/cadastro-imovel", "/debug-app", "/definir-senha", "/aguardando-aprovacao", "/curadoria/p"];

const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Assistente de IA do portal, montado uma vez em App.tsx (PLANO_IA_AGENTE.md §6).
 * Fase 1: só a equipe, e só quando `system_config.ia_agente.ativo` estiver ligado.
 * O estado da conversa fica aqui, então ela sobrevive à navegação entre páginas.
 */
export default function AssistenteIA() {
  const { user, profile } = useAuth();
  const { pathname } = useLocation();
  const papel = (profile?.role as string | undefined) ?? "";
  const equipe = EQUIPE.includes(papel);
  const config = useConfigIA(!!user && equipe);
  const [aberto, setAberto] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  const conversa = useConversaIA(pathname);
  const historico = useConversasIA(user?.id, aberto && verHistorico);

  if (!user || !profile || !equipe) return null;
  if (ROTAS_SEM_WIDGET.some((r) => pathname.startsWith(r))) return null;
  if (!config.data?.ativo || !config.data.papeis?.[papel]) return null;

  const abrirConversa = async (c: ConversaResumo) => {
    await conversa.abrirConversa(c.id);
    setVerHistorico(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir o assistente de IA"
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 active:scale-95 md:bottom-6 md:right-6"
      >
        <BrainCircuit className="h-4 w-4" aria-hidden="true" />
        I.A
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="flex h-[85vh] max-h-[700px] w-full flex-col gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="flex-shrink-0 border-b px-4 pb-3 pt-4">
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle className="flex items-center gap-2 text-base">
                <BrainCircuit className="h-4 w-4 text-primary" aria-hidden="true" />
                Assistente RIOS
              </DialogTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Conversas anteriores"
                  aria-pressed={verHistorico}
                  onClick={() => setVerHistorico((v) => !v)}
                >
                  <Clock className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Nova conversa"
                  onClick={() => {
                    conversa.novaConversa();
                    setVerHistorico(false);
                  }}
                  disabled={conversa.ocupado}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <DialogDescription className="text-xs">
              Consulta imóveis, reservas, chamados, cobranças e manutenções. Ações só com a sua confirmação.
            </DialogDescription>
          </DialogHeader>

          {verHistorico ? (
            <ListaConversas
              conversas={historico.data ?? []}
              carregando={historico.isLoading}
              atual={conversa.conversaId}
              onAbrir={abrirConversa}
            />
          ) : (
            <Conversa conversa={conversa} />
          )}
        </DialogContent>
      </Dialog>
    </>
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
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (conversas.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="text-sm font-semibold text-foreground">Nenhuma conversa anterior</p>
        <p className="mt-1 text-xs text-muted-foreground">As conversas ficam guardadas e você pode voltar a elas.</p>
      </div>
    );
  }
  return (
    <ul className="flex-1 overflow-y-auto px-3 py-3">
      {conversas.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onAbrir(c)}
            aria-current={c.id === atual ? "true" : undefined}
            className={`mb-1.5 w-full rounded-xl border px-3 py-2 text-left transition-colors hover:bg-muted ${
              c.id === atual ? "border-primary/40 bg-primary/5" : "border-border/60"
            }`}
          >
            <p className="truncate text-sm text-foreground">{c.titulo || "Conversa"}</p>
            <p className="text-[11px] text-muted-foreground">{quando(c.atualizada_em)}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Conversa({ conversa }: { conversa: ReturnType<typeof useConversaIA> }) {
  const [texto, setTexto] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);
  const { itens, ocupado, carregando, enviar, decidir } = conversa;

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [itens, ocupado]);

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

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {carregando && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!carregando && itens.length === 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-center text-xs text-muted-foreground">
              Pergunte em linguagem natural. Eu consulto o portal e respondo com a fonte.
            </p>
            <div className="space-y-2">
              {SUGESTOES_EQUIPE.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => mandar(s)}
                  className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-left text-xs text-foreground/80 transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {itens.map((item, i) => {
          const anterior = itens[i - 1];
          const agrupada = !!anterior && anterior.role === item.role && !anterior.pendente;
          return (
            <ChatMessageBubble
              key={item.id}
              authorName={item.role === "user" ? "Você" : "Assistente"}
              authorRole={item.role === "user" ? null : "assistente"}
              createdAt={item.criadaEm}
              isOwn={item.role === "user"}
              grouped={agrupada}
              isInternal={item.erro}
              body={item.texto ? renderizarCorpo(item.texto) : undefined}
              attachments={
                item.role === "assistant" && ((item.consultas && item.consultas.length > 0) || item.pendente) ? (
                  <div className="w-full">
                    {item.consultas && item.consultas.length > 0 && (
                      <p className="px-1 text-[11px] text-muted-foreground">
                        Consultou: {item.consultas.map(rotuloFerramenta).join(", ")}
                      </p>
                    )}
                    {item.pendente && (
                      <CartaoAcao
                        acao={item.pendente}
                        decisao={item.decisao}
                        ocupado={ocupado}
                        onConfirmar={() => void decidir(item.pendente!.id, "confirmar")}
                        onCancelar={() => void decidir(item.pendente!.id, "cancelar")}
                      />
                    )}
                  </div>
                ) : undefined
              }
            />
          );
        })}

        {ocupado && (
          <div className="mt-3">
            <ChatTypingIndicator names={["Assistente"]} />
          </div>
        )}
        <div ref={fimRef} />
      </div>

      <div className="flex flex-shrink-0 items-end gap-2 border-t px-3 py-3">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          placeholder="Pergunte algo…"
          rows={1}
          aria-label="Mensagem para o assistente"
          className="max-h-[120px] min-h-[38px] flex-1 resize-none text-sm"
          disabled={carregando}
        />
        <Button
          size="icon"
          onClick={() => mandar()}
          disabled={!texto.trim() || ocupado || carregando}
          aria-label="Enviar"
          className="h-9 w-9 flex-shrink-0"
        >
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </>
  );
}
