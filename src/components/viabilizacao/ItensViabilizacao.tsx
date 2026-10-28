import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Check, Circle, ExternalLink, Loader2, MessageSquare, MoreHorizontal, Paperclip, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { BotaoLinha, SeloContagem } from "@/components/painel/CaixaOperacao";
import { EditableCell } from "@/components/maintenance/EditableCell";
import { QuickAttachUploader } from "@/components/maintenance/QuickAttachUploader";
import { COST_RESPONSIBLE_OPTIONS, INTERVALO_ENVIO_LOTE_MS, tomDaCor } from "@/components/maintenance/listaTipos";
import { EtiquetaStatusCobranca } from "@/components/cobrancas/EtiquetaStatusCobranca";
import { formatBRL } from "@/lib/format";
import { parseBRNumber } from "@/lib/parseBRNumber";
import { estaPaga, formatarData } from "@/lib/cobrancaMeta";
import { devido } from "@/lib/viabilizacaoResumo";
import { avisarResultadoEnvio, enviarAoProprietario, type ResultadoEnvio } from "@/lib/manutencaoLista";
import { cn } from "@/lib/utils";
import {
  useApagarItem,
  useCriarItemViabilizacao,
  useRecarregarItens,
  useSalvarCampoItem,
  type CobrancaAvulsa,
  type ItemViabilizacao,
  type Viabilizacao,
} from "@/hooks/useViabilizacoes";

type Custo = "owner" | "pm" | "guest" | "pending";

export interface AcoesItem {
  onAbrirChat: (item: ItemViabilizacao) => void;
  onAbrirAnexos: (item: ItemViabilizacao) => void;
  onAbrirDetalhe: (item: ItemViabilizacao) => void;
  onEditarItem: (item: ItemViabilizacao) => void;
  unreadCounts?: Record<string, number>;
}

interface Props extends AcoesItem {
  viabilizacao: Viabilizacao;
  itens: ItemViabilizacao[];
  avulsas: CobrancaAvulsa[];
  userId?: string;
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

function textoDoErro(erro: unknown): string {
  return erro instanceof Error && erro.message ? erro.message : "Não foi possível salvar. Tente de novo.";
}

/* ------------------------------------------------------------------------ */
/* Linha de item                                                             */
/* ------------------------------------------------------------------------ */

function LinhaItem({
  item,
  feito,
  ocupado,
  onToggleFeito,
  onCampo,
  onEnviar,
  onApagar,
  acoes,
}: {
  item: ItemViabilizacao;
  feito: boolean;
  ocupado: boolean;
  onToggleFeito: () => void;
  onCampo: (field: string, value: unknown) => void;
  onEnviar?: () => void;
  onApagar: () => void;
  acoes: AcoesItem;
}) {
  const recarregar = useRecarregarItens();
  const custo = (item.cost_responsible ?? "pending") as Custo;
  const opcaoCusto = COST_RESPONSIBLE_OPTIONS.find((o) => o.value === custo);
  const naoLidas = acoes.unreadCounts?.[item.id] ?? 0;

  // No celular são duas linhas (título em cima, controles embaixo); no
  // desktop os dois blocos se desfazem (`md:contents`) numa linha só.
  return (
    <li
      className={cn(
        "group rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50 md:flex md:items-center md:gap-2",
        ocupado && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2 md:contents">
        <button
          type="button"
          onClick={onToggleFeito}
          disabled={ocupado}
          aria-pressed={feito}
          aria-label={feito ? "Reabrir item" : "Marcar como feito"}
          title={feito ? "Reabrir" : "Marcar como feito"}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            feito ? "border-success bg-success text-success-foreground" : "border-border text-transparent hover:border-success hover:text-success/60",
          )}
        >
          {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : feito ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <TituloItem titulo={item.subject} suave={feito} ocupado={ocupado} onSalvar={(novo) => onCampo("subject", novo)} />
        </div>


        <div className="shrink-0 md:order-last">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50 bg-popover">
              <DropdownMenuItem onClick={() => acoes.onAbrirDetalhe(item)}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Abrir detalhes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => acoes.onEditarItem(item)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Editar
              </DropdownMenuItem>
              {!onEnviar && !feito && custo !== "guest" && (
                <DropdownMenuItem onClick={() => onCampo("list_status", "enviar_proprietario")}>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Feito e enviar ao proprietário
                </DropdownMenuItem>
              )}
              {feito && (
                <DropdownMenuItem onClick={onToggleFeito}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  Reabrir
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onApagar} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-9 md:contents">
        {/* Quem paga */}
        <Select value={custo} onValueChange={(v) => onCampo("cost_responsible", v)} disabled={ocupado}>
          <SelectTrigger
            className="h-7 w-auto gap-1 border-0 bg-transparent px-1.5 py-0 text-xs hover:bg-muted/60"
            aria-label="Quem paga"
          >
            <SelectValue>
              <Etiqueta tom={tomDaCor(opcaoCusto?.color)}>{opcaoCusto?.label ?? "Em espera"}</Etiqueta>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="z-50 bg-popover">
            {COST_RESPONSIBLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <Etiqueta solida tom={tomDaCor(o.color)}>{o.label}</Etiqueta>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Valor e aporte */}
        <div className="flex items-center gap-1 text-xs" data-no-sheet>
          <EditableCell
            value={item.amount_cents || null}
            type="currency"
            placeholder="R$ 0,00"
            onSave={(v) => onCampo("amount_cents", v)}
            className="w-[96px] justify-end font-medium tabular-nums"
          />
          <span className="text-muted-foreground" title="Aporte da gestão">
            −
          </span>
          <EditableCell
            value={item.management_contribution_cents || null}
            type="currency"
            placeholder="aporte"
            onSave={(v) => onCampo("management_contribution_cents", v)}
            className="w-[88px] justify-end tabular-nums text-success"
          />
        </div>

        {/* Anexos e conversa */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => item.attachments_count > 0 && acoes.onAbrirAnexos(item)}
            disabled={item.attachments_count === 0}
            aria-label="Ver anexos"
            title="Ver anexos"
            className={cn(
              "flex h-7 items-center gap-1 rounded px-1.5 text-xs transition-colors",
              item.attachments_count > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground",
            )}
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            {item.attachments_count}
          </button>
          <QuickAttachUploader itemId={item.id} isCharge={false} onSuccess={recarregar} className="h-7 w-7" />
          <BotaoLinha rotulo="Abrir conversa" naoLidas={naoLidas} onClick={() => acoes.onAbrirChat(item)}>
            <MessageSquare />
          </BotaoLinha>
        </div>

        {onEnviar && (
          <Button type="button" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs md:ml-0" onClick={onEnviar} disabled={ocupado}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            Enviar ao proprietário
          </Button>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------------ */
/* Cobrança enviada                                                          */
/* ------------------------------------------------------------------------ */

function LinhaCobranca({
  id,
  titulo,
  status,
  dueDate,
  valor,
  aporte,
}: {
  id: string;
  titulo: string;
  status: string;
  dueDate: string | null;
  valor: number;
  aporte: number;
}) {
  const paga = estaPaga(status);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 hover:bg-muted/50 md:flex-nowrap">
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", paga ? "bg-success/10 text-success" : "bg-primary/10 text-primary")} aria-hidden="true">
        {paga ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
      </span>
      <p className="min-w-0 flex-1 basis-[12rem] truncate text-sm" title={titulo}>
        {titulo}
      </p>
      <EtiquetaStatusCobranca status={status} />
      {!paga && dueDate && <span className="text-xs text-muted-foreground">vence {formatarData(dueDate, "dd/MM")}</span>}
      <span className="text-sm font-medium tabular-nums">{formatBRL(devido(valor, aporte))}</span>
      <Link to={`/cobranca/${id}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
        Ver cobrança
      </Link>
    </li>
  );
}

/* ------------------------------------------------------------------------ */
/* Inclusão rápida                                                           */
/* ------------------------------------------------------------------------ */

function NovoItem({ viabilizacao, userId }: { viabilizacao: Viabilizacao; userId?: string }) {
  const criar = useCriarItemViabilizacao();
  const [texto, setTexto] = useState("");
  const [valor, setValor] = useState("");
  const [custo, setCusto] = useState<Custo>("owner");
  const campo = useRef<HTMLInputElement>(null);
  const imovel = viabilizacao.imovel;

  const adicionar = async (linhas: string[], valorCents: number | null) => {
    if (!imovel || !userId) return;
    const limpas = linhas.map((l) => l.trim()).filter((l) => l.length >= 2);
    if (limpas.length === 0) return;
    try {
      const n = await criar.mutateAsync(
        limpas.map((subject) => ({
          propertyId: imovel.id,
          ownerId: imovel.owner_id,
          autorId: userId,
          subject,
          amountCents: limpas.length === 1 ? valorCents : null,
          costResponsible: custo,
        })),
      );
      toast.success(n === 1 ? "Item adicionado" : `${n} itens adicionados`);
      setTexto("");
      setValor("");
      campo.current?.focus();
    } catch (erro) {
      toast.error(textoDoErro(erro));
    }
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const cents = valor.trim() ? Math.round(parseBRNumber(valor) * 100) : null;
    void adicionar([texto], cents && cents > 0 ? cents : null);
  };

  // Colar uma lista (uma linha por item) cria todos de uma vez.
  const colar = (e: ClipboardEvent<HTMLInputElement>) => {
    const colado = e.clipboardData.getData("text");
    const linhas = colado.split(/\r?\n/).map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim()).filter(Boolean);
    if (linhas.length < 2) return;
    e.preventDefault();
    void adicionar(linhas, null);
  };

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2 md:flex-nowrap">
      <Input
        ref={campo}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onPaste={colar}
        placeholder="O que precisa ser feito? (cole uma lista para criar vários)"
        aria-label="Novo item"
        maxLength={200}
        className="h-9 min-w-0 flex-1 basis-[14rem] border-0 bg-card text-sm"
        disabled={criar.isPending}
      />
      <Input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="R$ 0,00"
        aria-label="Valor"
        inputMode="decimal"
        className="h-9 w-[104px] border-0 bg-card text-right text-sm tabular-nums"
        disabled={criar.isPending}
      />
      <Select value={custo} onValueChange={(v) => setCusto(v as Custo)}>
        <SelectTrigger className="h-9 w-[132px] border-0 bg-card text-xs" aria-label="Quem paga">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-50 bg-popover">
          {COST_RESPONSIBLE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" className="h-9 gap-1" disabled={criar.isPending || texto.trim().length < 2}>
        {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
        Adicionar
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------------ */
/* Lista do imóvel                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Os itens de um imóvel novo: a fazer, feitos aguardando envio e já
 * enviados ao proprietário. Cada item é uma manutenção do imóvel (a mesma
 * da lista de manutenções); as edições passam pelas mesmas funções.
 */
export function ItensViabilizacao({ viabilizacao, itens, avulsas, userId, ...acoes }: Props) {
  const salvar = useSalvarCampoItem();
  const apagar = useApagarItem();
  const recarregar = useRecarregarItens();
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [paraApagar, setParaApagar] = useState<ItemViabilizacao | null>(null);
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);

  const aFazer = useMemo(() => itens.filter((i) => i.status !== "concluido"), [itens]);
  const feitos = useMemo(() => itens.filter((i) => i.status === "concluido" && !i.cobranca), [itens]);
  const enviados = useMemo(() => itens.filter((i) => !!i.cobranca), [itens]);
  const paraEnviar = useMemo(() => feitos.filter((i) => i.owner && i.cost_responsible !== "guest"), [feitos]);

  const comOcupado = async (id: string, acao: () => Promise<void>) => {
    setOcupados((s) => new Set(s).add(id));
    try {
      await acao();
    } finally {
      setOcupados((s) => {
        const novo = new Set(s);
        novo.delete(id);
        return novo;
      });
    }
  };

  const campo = (item: ItemViabilizacao, field: string, value: unknown) =>
    void comOcupado(item.id, async () => {
      try {
        const r = await salvar.mutateAsync({ item, field, value });
        if (r.envio) avisarResultadoEnvio(r.envio);
        if (r.hospedeArquivada) toast.info("Cobrança de hóspede feita: foi para o Arquivo e continua no aviso do painel.");
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });

  const toggleFeito = (item: ItemViabilizacao) =>
    campo(item, "list_status", item.status === "concluido" ? "em_progresso" : "feito");

  const confirmarApagar = async () => {
    if (!paraApagar) return;
    const alvo = paraApagar;
    await comOcupado(alvo.id, async () => {
      try {
        await apagar.mutateAsync(alvo.id);
        toast.success("Item excluído");
        setParaApagar(null);
      } catch (erro) {
        toast.error(textoDoErro(erro));
      }
    });
  };

  // Envio em lote: um por vez, com a mesma pausa da lista (cada envio cria
  // cobrança, copia anexos e manda e-mail; o WhatsApp sai pelo trigger).
  const enviarTodos = async () => {
    setConfirmarLote(false);
    const lista = paraEnviar;
    if (lista.length === 0) return;
    const contagem: Record<ResultadoEnvio, number> = { enviada: 0, gratuita: 0, sem_valor: 0, ja_cobrada: 0 };
    const falhas: string[] = [];
    setProgresso({ feitos: 0, total: lista.length });
    for (let i = 0; i < lista.length; i++) {
      const item = lista[i];
      try {
        contagem[await enviarAoProprietario(item)]++;
      } catch (erro) {
        console.error("[novos-imoveis] falha no envio em lote:", item.id, erro);
        falhas.push(item.subject);
      }
      setProgresso({ feitos: i + 1, total: lista.length });
      if (i < lista.length - 1) await pausa(INTERVALO_ENVIO_LOTE_MS);
    }
    setProgresso(null);
    recarregar();
    const enviadas = contagem.enviada + contagem.gratuita + contagem.sem_valor + contagem.ja_cobrada;
    if (falhas.length === 0) {
      toast.success(enviadas === 1 ? "1 cobrança enviada ao proprietário" : `${enviadas} cobranças enviadas ao proprietário`);
    } else {
      toast.warning(`${enviadas} enviadas; ${falhas.length} falharam`, { description: falhas.join(", ") });
    }
  };

  const totalParaEnviar = paraEnviar.reduce((s, i) => s + devido(i.amount_cents, i.management_contribution_cents), 0);

  const secao = (titulo: string, quantidade: number, tom: "warning" | "success" | "primary", acao?: React.ReactNode) => (
    <div className="mb-1 flex items-center justify-between gap-2 px-1">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", tom === "warning" ? "bg-warning" : tom === "success" ? "bg-success" : "bg-primary")} aria-hidden="true" />
        {titulo}
        <SeloContagem tom={quantidade > 0 ? tom : "neutral"}>{quantidade}</SeloContagem>
      </p>
      {acao}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        {secao("A fazer", aFazer.length, "warning")}
        {aFazer.length > 0 && (
          <ul className="mb-2 divide-y divide-border/50">
            {aFazer.map((item) => (
              <LinhaItem
                key={item.id}
                item={item}
                feito={false}
                ocupado={ocupados.has(item.id)}
                onToggleFeito={() => toggleFeito(item)}
                onCampo={(f, v) => campo(item, f, v)}
                onApagar={() => setParaApagar(item)}
                acoes={acoes}
              />
            ))}
          </ul>
        )}
        <NovoItem viabilizacao={viabilizacao} userId={userId} />
      </div>

      {feitos.length > 0 && (
        <div>
          {secao(
            "Feitos, aguardando envio",
            feitos.length,
            "success",
            paraEnviar.length > 1 ? (
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setConfirmarLote(true)} disabled={!!progresso}>
                {progresso ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                {progresso ? `Enviando ${progresso.feitos} de ${progresso.total}…` : `Enviar os ${paraEnviar.length} ao proprietário`}
              </Button>
            ) : undefined,
          )}
          <ul className="divide-y divide-border/50">
            {feitos.map((item) => (
              <LinhaItem
                key={item.id}
                item={item}
                feito
                ocupado={ocupados.has(item.id) || !!progresso}
                onToggleFeito={() => toggleFeito(item)}
                onCampo={(f, v) => campo(item, f, v)}
                onEnviar={item.owner && item.cost_responsible !== "guest" ? () => campo(item, "list_status", "enviar_proprietario") : undefined}
                onApagar={() => setParaApagar(item)}
                acoes={acoes}
              />
            ))}
          </ul>
        </div>
      )}

      {(enviados.length > 0 || avulsas.length > 0) && (
        <div>
          {secao("Enviados ao proprietário", enviados.length + avulsas.length, "primary")}
          <ul className="divide-y divide-border/50">
            {enviados.map((item) => (
              <LinhaCobranca
                key={item.id}
                id={item.cobranca!.id}
                titulo={item.subject}
                status={item.cobranca!.status}
                dueDate={item.cobranca!.due_date}
                valor={item.cobranca!.amount_cents}
                aporte={item.cobranca!.management_contribution_cents}
              />
            ))}
            {avulsas.map((c) => (
              <LinhaCobranca key={c.id} id={c.id} titulo={c.title} status={c.status} dueDate={c.due_date} valor={c.amount_cents} aporte={c.management_contribution_cents} />
            ))}
          </ul>
        </div>
      )}

      <ConfirmationDialog
        open={!!paraApagar}
        onOpenChange={(aberto) => !aberto && setParaApagar(null)}
        title="Excluir este item?"
        description={
          paraApagar ? (
            <span>
              <strong>{paraApagar.subject}</strong> sai da lista de vez, com a conversa e os anexos. Para registrar que foi feito, use o círculo ao lado dele.
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="Excluir"
        variant="destructive"
        loading={!!paraApagar && ocupados.has(paraApagar.id)}
        onConfirm={confirmarApagar}
      />

      <ConfirmationDialog
        open={confirmarLote}
        onOpenChange={setConfirmarLote}
        title={`Enviar ${paraEnviar.length} itens ao proprietário?`}
        description={
          <span>
            Cada item vira uma cobrança para {viabilizacao.imovel?.owner?.name ?? "o proprietário"}, com os anexos, e-mail e WhatsApp (se ligado).
            Total a pagar: <strong>{formatBRL(totalParaEnviar)}</strong>. Um envio a cada {INTERVALO_ENVIO_LOTE_MS / 1000} s.
          </span>
        }
        confirmLabel="Enviar todos"
        onConfirm={enviarTodos}
      />
    </div>
  );
}
