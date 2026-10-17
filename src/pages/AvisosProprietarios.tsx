import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCheck, ChevronRight, Inbox, Loader2, Megaphone, Plus, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { TituloSecao } from "@/components/painel/TituloSecao";
import { SeletorImovel } from "@/components/listas/SeletorImovel";
import { imovelEhValido } from "@/components/listas/imovel";
import { nomeCurto, quando } from "@/components/listas/formato";
import { useImoveisAjuste } from "@/hooks/useAjustes";
import {
  useAvisosProprietario,
  useEncerrarConversa,
  useEnviarAviso,
  type ConversaProprietario,
} from "@/hooks/useAvisosProprietario";
import { TIPO_TICKET, type TipoTicket } from "@/lib/ticketMeta";
import { cn } from "@/lib/utils";

type Aba = "responder" | "aguardando" | "encerrados";

function FormularioAviso({ onFechar }: { onFechar?: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const imoveis = useImoveisAjuste();
  const enviar = useEnviarAviso();
  const [imovel, setImovel] = useState<string | null>(null);
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [tentou, setTentou] = useState(false);

  const lista = imoveis.data ?? [];
  const erroImovel = tentou && !(imovel && imovelEhValido(imovel, lista));
  const erroAssunto = tentou && assunto.trim().length < 3;
  const erroMensagem = tentou && mensagem.trim().length < 3;

  const submeter = async (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (!user || !imovel || erroImovel || assunto.trim().length < 3 || mensagem.trim().length < 3) return;
    try {
      const id = await enviar.mutateAsync({ propertyId: imovel, assunto, mensagem, autorId: user.id });
      toast.success("Aviso enviado ao proprietário", {
        action: { label: "Abrir conversa", onClick: () => navigate(`/ticket-detalhes/${id}`) },
      });
      setAssunto("");
      setMensagem("");
      setTentou(false);
    } catch (erro) {
      toast.error(erro instanceof Error && erro.message ? erro.message : "Não foi possível enviar. Tente de novo.");
    }
  };

  return (
    <form
      onSubmit={submeter}
      noValidate
      aria-labelledby="titulo-novo-aviso"
      className="space-y-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="titulo-novo-aviso" className="text-[15px] font-semibold tracking-tight">
            Passar ao proprietário
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Abre uma conversa com o dono do imóvel. Ele recebe por e-mail e responde pelo portal.
          </p>
        </div>
        {onFechar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onFechar}
            aria-label="Fechar formulário"
            className="-mr-1.5 -mt-1.5 h-8 w-8 shrink-0 text-muted-foreground lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <SeletorImovel
        id="imovel-aviso"
        valor={imovel}
        onChange={setImovel}
        imoveis={lista}
        carregando={imoveis.isLoading}
        ehFaxineira={false}
        erro={erroImovel}
        semGeral
      />

      <div className="space-y-1.5">
        <Label htmlFor="aviso-assunto">Assunto</Label>
        <Input
          id="aviso-assunto"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          maxLength={150}
          placeholder="Ex.: troca do chuveiro do banheiro social"
          aria-invalid={erroAssunto || undefined}
          className={cn("h-11", erroAssunto && "border-destructive")}
        />
        {erroAssunto && <p className="text-xs text-destructive">Escreva o assunto.</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="aviso-mensagem">Mensagem</Label>
        <Textarea
          id="aviso-mensagem"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="O que o proprietário precisa saber."
          aria-invalid={erroMensagem || undefined}
          className={cn("min-h-[96px] resize-y text-sm", erroMensagem && "border-destructive")}
        />
        {erroMensagem && <p className="text-xs text-destructive">Escreva a mensagem.</p>}
      </div>

      <Button type="submit" size="lg" className="w-full gap-2 px-4" disabled={enviar.isPending}>
        {enviar.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Enviando…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" aria-hidden="true" />
            Enviar ao proprietário
          </>
        )}
      </Button>
    </form>
  );
}

function CartaoConversa({
  c,
  ocupado,
  onAbrir,
  onEncerrar,
  onReabrir,
}: {
  c: ConversaProprietario;
  ocupado: boolean;
  onAbrir: () => void;
  onEncerrar: () => void;
  onReabrir: () => void;
}) {
  const aberto = !["concluido", "cancelado"].includes(c.status);
  const ultima = c.ultima ? quando(c.ultima.em) : quando(c.created_at);
  return (
    <article
      className={cn(
        "rounded-xl border bg-card px-3.5 py-3 shadow-sm",
        aberto && c.vez === "equipe" ? "border-warning/40" : "border-border/70",
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        className="block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold">{nomeCurto(c.donoNome) || "Proprietário"}</span>
          {c.imovelNome && <span className="text-xs text-muted-foreground">{c.imovelNome}</span>}
          <Etiqueta tom={c.recebido ? "info" : "neutral"}>{c.recebido ? "Recebido" : "Enviado"}</Etiqueta>
          {c.recebido && c.ticket_type !== "informacao" && (
            <span className="text-xs text-muted-foreground">{TIPO_TICKET[c.ticket_type as TipoTicket]?.rotulo}</span>
          )}
          {aberto && (
            <Etiqueta tom={c.vez === "equipe" ? "warning" : "neutral"} ponto>
              {c.vez === "equipe" ? "Responder" : "Aguardando proprietário"}
            </Etiqueta>
          )}
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        </div>
        <p className="mt-1 break-words text-sm font-medium leading-snug">{c.subject}</p>
        {c.ultima?.texto && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">{c.ultima.autorEhDono ? "Proprietário" : "Equipe"}:</span>{" "}
            {c.ultima.texto}
          </p>
        )}
      </button>
      <div className="mt-1.5 flex min-h-8 items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" title={ultima.completo}>
          {ultima.relativo}
        </p>
        <div className="flex items-center gap-1">
          {ocupado && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Salvando" />}
          {aberto ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={onEncerrar}
              className="h-8 gap-1 border-success/40 px-2.5 text-success hover:bg-success/10 hover:text-success"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              Encerrar
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" disabled={ocupado} onClick={onReabrir} className="h-8 gap-1 px-2.5 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reabrir
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * /avisos-proprietarios — o que a equipe precisa passar ao proprietário e o
 * que ele mandou, com conversa. Cada item é um chamado; a conversa abre em
 * /ticket-detalhes/:id. Só equipe. Ver useAvisosProprietario.
 */
export default function AvisosProprietarios() {
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>("responder");
  const [formAberto, setFormAberto] = useState(false);
  const abertos = useAvisosProprietario("abertos");
  const encerrados = useAvisosProprietario("encerrados", aba === "encerrados");
  const encerrar = useEncerrarConversa();
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());

  const responder = useMemo(() => (abertos.data ?? []).filter((c) => c.vez === "equipe"), [abertos.data]);
  const aguardando = useMemo(() => (abertos.data ?? []).filter((c) => c.vez === "proprietario"), [abertos.data]);
  const consulta = aba === "encerrados" ? encerrados : abertos;
  const itens = aba === "responder" ? responder : aba === "aguardando" ? aguardando : encerrados.data ?? [];

  const mudar = async (c: ConversaProprietario, reabrir: boolean) => {
    setOcupados((s) => new Set(s).add(c.id));
    try {
      await encerrar.mutateAsync({ id: c.id, reabrir });
      toast.success(reabrir ? "Conversa reaberta" : "Conversa encerrada");
    } catch (erro) {
      toast.error(erro instanceof Error && erro.message ? erro.message : "Não foi possível salvar.");
    } finally {
      setOcupados((s) => {
        const n = new Set(s);
        n.delete(c.id);
        return n;
      });
    }
  };

  const titulo =
    aba === "responder"
      ? { texto: "Para responder", sub: "O proprietário mandou ou respondeu e espera a equipe" }
      : aba === "aguardando"
        ? { texto: "Aguardando proprietário", sub: "Avisos enviados que ainda não tiveram resposta" }
        : { texto: "Encerrados", sub: "Os mais recentes primeiro" };

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Avisos a proprietários"
          subtitulo="O que passar ao proprietário e o que ele mandou"
          icone={<Megaphone />}
          voltarPara="/painel"
          abaixo={
            <BarraFiltros role="tablist" aria-label="Situação das conversas">
              <AbaPilula ativa={aba === "responder"} quantidade={abertos.data ? responder.length : undefined} tom="warning" onClick={() => setAba("responder")}>
                Para responder
              </AbaPilula>
              <AbaPilula ativa={aba === "aguardando"} quantidade={abertos.data ? aguardando.length : undefined} onClick={() => setAba("aguardando")}>
                Aguardando proprietário
              </AbaPilula>
              <AbaPilula ativa={aba === "encerrados"} onClick={() => setAba("encerrados")}>
                Encerrados
              </AbaPilula>
            </BarraFiltros>
          }
        />
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside aria-label="Novo aviso" className="min-w-0">
          {!formAberto && (
            <button
              type="button"
              onClick={() => setFormAberto(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Passar ao proprietário
            </button>
          )}
          <div className={cn(!formAberto && "hidden lg:block")}>
            <FormularioAviso onFechar={() => setFormAberto(false)} />
          </div>
        </aside>

        <section aria-labelledby="titulo-lista-avisos" className="min-w-0 space-y-3">
          <TituloSecao id="titulo-lista-avisos" titulo={titulo.texto} subtitulo={titulo.sub} />
          {consulta.isLoading ? (
            <div className="space-y-2.5" aria-busy="true" aria-label="Carregando conversas">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : consulta.isError ? (
            <EmptyState
              icon={<AlertTriangle className="h-6 w-6" />}
              title="Não foi possível carregar as conversas"
              description="Confira a internet e tente de novo."
              action={
                <Button variant="outline" onClick={() => consulta.refetch()}>
                  Tentar de novo
                </Button>
              }
              className="rounded-xl border border-dashed border-border/70"
            />
          ) : itens.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-6 w-6" />}
              title={aba === "responder" ? "Nada para responder" : aba === "aguardando" ? "Nenhum aviso esperando resposta" : "Nenhuma conversa encerrada"}
              description={aba === "responder" ? "Quando um proprietário mandar algo ou responder, aparece aqui." : undefined}
              className="rounded-xl border border-dashed border-border/70"
            />
          ) : (
            <div className="space-y-2">
              {itens.map((c) => (
                <CartaoConversa
                  key={c.id}
                  c={c}
                  ocupado={ocupados.has(c.id)}
                  onAbrir={() => navigate(`/ticket-detalhes/${c.id}`)}
                  onEncerrar={() => void mudar(c, false)}
                  onReabrir={() => void mudar(c, true)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </PaginaInterna>
  );
}
