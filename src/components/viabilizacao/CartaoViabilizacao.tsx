import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
  List,
  Loader2,
  Mail,
  MailX,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Rocket,
  ShoppingCart,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { SeloContagem } from "@/components/painel/CaixaOperacao";
import { TOM } from "@/components/painel/tons";
import { MiniaturasAnexos } from "@/components/listas/MiniaturasAnexos";
import { nomeCurto, quando } from "@/components/listas/formato";
import { formatBRL } from "@/lib/format";
import { resumirItens } from "@/lib/viabilizacaoResumo";
import { cn } from "@/lib/utils";
import {
  ETAPAS,
  ORDEM_ETAPAS,
  OBSERVACOES_MAX,
  diaLocal,
  linkMapa,
  linkWhatsapp,
  situacaoAvisos,
  type EtapaViabilizacao,
} from "@/lib/viabilizacaoMeta";
import {
  enderecoViabilizacao,
  nomeViabilizacao,
  useAtualizarViabilizacao,
  type CobrancaAvulsa,
  type ItemViabilizacao,
  type Viabilizacao,
} from "@/hooks/useViabilizacoes";
import { EtiquetaConta } from "./SeletorProprietario";
import { ItensViabilizacao, type AcoesItem } from "./ItensViabilizacao";

interface Props extends AcoesItem {
  viabilizacao: Viabilizacao;
  itens: ItemViabilizacao[];
  avulsas: CobrancaAvulsa[];
  carregandoItens: boolean;
  userId?: string;
  podeApagar: boolean;
  aberto: boolean;
  onToggle: () => void;
  onEditar: (v: Viabilizacao) => void;
  onVincular: (v: Viabilizacao) => void;
  onApagar: (v: Viabilizacao) => void;
  /** Etapa final pede confirmação na página; as outras gravam direto. */
  onMudarEtapa: (v: Viabilizacao, etapa: EtapaViabilizacao) => void;
  onAnexar: (v: Viabilizacao) => void;
  anexando: boolean;
  onAbrirAnexo: (v: Viabilizacao, indice: number) => void;
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function diaCurto(valor: string | null): string | null {
  const d = diaLocal(valor);
  return d ? `${SEMANA[d.getDay()]} ${format(d, "dd/MM", { locale: ptBR })}` : null;
}

/** Um imóvel em viabilização: cabeçalho, situação, itens e fotos da visita. */
export function CartaoViabilizacao({
  viabilizacao: v,
  itens,
  avulsas,
  carregandoItens,
  userId,
  podeApagar,
  aberto,
  onToggle,
  onEditar,
  onVincular,
  onApagar,
  onMudarEtapa,
  onAnexar,
  anexando,
  onAbrirAnexo,
  ...acoesItem
}: Props) {
  const navigate = useNavigate();
  const atualizar = useAtualizarViabilizacao();
  const meta = ETAPAS[v.etapa] ?? ETAPAS.captado;
  const nome = nomeViabilizacao(v);
  const endereco = enderecoViabilizacao(v);
  const conta = v.imovel?.owner ?? null;
  const propNome = conta?.name ?? v.proprietario_nome;
  const propTelefone = conta?.phone ?? v.proprietario_telefone;
  const whatsapp = linkWhatsapp(propTelefone);
  const mapa = linkMapa(endereco);
  const resumo = useMemo(() => resumirItens(itens, avulsas), [itens, avulsas]);
  const criado = quando(v.created_at);
  const visita = diaCurto(v.visita_em);
  const estreia = diaCurto(v.estreia_prevista);
  const hoje = new Date();
  const visitaData = diaLocal(v.visita_em);
  const visitaPassou = !!visitaData && visitaData < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  // Mesma precedência do banco (viabilizacao_destino): o e-mail da conta, senão o do registro.
  const aviso = situacaoAvisos(v.avisos, v.avisar_proprietario, !!(conta?.email?.trim() || v.proprietario_email?.trim()));
  const avisoQuando = aviso.em ? quando(aviso.em) : null;

  const alternarAvisos = async () => {
    try {
      await atualizar.mutateAsync({ id: v.id, propertyId: v.property_id, mudanca: { avisarProprietario: !v.avisar_proprietario } });
      toast.success(
        v.avisar_proprietario
          ? "O proprietário não recebe mais e-mail de conclusão deste imóvel"
          : "O proprietário volta a receber e-mail quando um item for concluído",
      );
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar");
    }
  };

  // Observações editadas no próprio cartão; gravam ao sair do campo.
  const [obs, setObs] = useState<string | null>(null);
  const salvarObs = async () => {
    if (obs === null || obs.trim() === (v.observacoes ?? "").trim()) {
      setObs(null);
      return;
    }
    try {
      await atualizar.mutateAsync({ id: v.id, propertyId: v.property_id, mudanca: { observacoes: obs } });
      toast.success("Observações salvas");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar");
    } finally {
      setObs(null);
    }
  };

  const progresso = resumo.total > 0 ? Math.round(((resumo.feitos + resumo.enviados) / resumo.total) * 100) : 0;

  return (
    <Card className={cn("overflow-hidden rounded-xl border-border/70", TOM[meta.tom].borda)}>
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pt-3.5 pb-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={aberto}
          aria-label={aberto ? "Recolher imóvel" : "Expandir imóvel"}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="min-w-0 flex-1 basis-[16rem]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold leading-tight tracking-tight">{nome}</h3>
            {!v.imovel && (
              <Etiqueta tom="warning" title="Sem conta do proprietário no portal: ainda não dá para listar itens nem cobrar">
                sem conta no portal
              </Etiqueta>
            )}
            {v.imovel && (
              <span className="text-xs text-muted-foreground">
                {resumo.total === 0
                  ? "nenhum item ainda"
                  : `${resumo.total} ${resumo.total === 1 ? "item" : "itens"}${
                      resumo.compras > 0 ? ` · ${resumo.compras} ${resumo.compras === 1 ? "compra" : "compras"}` : ""
                    }`}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {endereco ? (
              <a
                href={mapa ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
                title="Abrir no mapa"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{endereco}</span>
              </a>
            ) : (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                sem endereço
              </span>
            )}
            <span className="inline-flex max-w-full items-center gap-1">
              <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{propNome || "proprietário não informado"}</span>
              {conta && <EtiquetaConta role={conta.role} />}
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-success underline-offset-4 hover:underline"
                  title={`WhatsApp ${propTelefone}`}
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  WhatsApp
                </a>
              )}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={cn("inline-flex items-center gap-1", visita && !visitaPassou && v.etapa === "visita" && "font-medium text-info")}>
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {visita ? `Visita ${visitaPassou ? "feita em" : ""} ${visita}` : "Visita não marcada"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Rocket className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {estreia ? `Estreia prevista ${estreia}` : "Sem data de estreia"}
            </span>
            <span title={criado.completo}>
              {v.autor_nome ? `por ${nomeCurto(v.autor_nome)} · ` : ""}
              {criado.relativo}
            </span>
            <span
              className={cn("inline-flex items-center gap-1", TOM[aviso.tom].texto)}
              title={[aviso.detalhe, avisoQuando?.completo].filter(Boolean).join(" · ") || undefined}
            >
              {v.avisar_proprietario ? (
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <MailX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {aviso.rotulo}
              {avisoQuando ? ` ${avisoQuando.relativo}` : ""}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Select value={v.etapa} onValueChange={(e) => onMudarEtapa(v, e as EtapaViabilizacao)}>
            <SelectTrigger className="h-8 w-auto gap-1.5 border-0 bg-transparent px-1.5 hover:bg-muted/60" aria-label="Etapa">
              <SelectValue>
                <Etiqueta tom={meta.tom} ponto tamanho="md" solida>
                  {meta.rotulo}
                </Etiqueta>
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end" className="z-50 bg-popover">
              {ORDEM_ETAPAS.map((e) => (
                <SelectItem key={e} value={e}>
                  <span className="flex flex-col py-0.5">
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", TOM[ETAPAS[e].tom].ponto)} aria-hidden="true" />
                      {ETAPAS[e].rotulo}
                    </span>
                    <span className="text-xs text-muted-foreground">{ETAPAS[e].descricao}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Mais ações do imóvel">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50 bg-popover">
              <DropdownMenuItem onClick={() => onEditar(v)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Editar dados
              </DropdownMenuItem>
              {!v.imovel && (
                <DropdownMenuItem onClick={() => onVincular(v)}>
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  Vincular conta ou imóvel
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onAnexar(v)} disabled={anexando}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                Adicionar foto ou vídeo da visita
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void alternarAvisos()} disabled={atualizar.isPending}>
                {v.avisar_proprietario ? <MailX className="h-4 w-4" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
                {v.avisar_proprietario ? "Desligar e-mail de conclusão" : "Ligar e-mail de conclusão"}
              </DropdownMenuItem>
              {v.imovel && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate(`/compras?novo=1&imovel=${v.imovel!.id}`)}>
                    <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                    Pedir compra para este imóvel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/tarefas-rua?novo=1&imovel=${v.imovel!.id}`)}>
                    <Truck className="h-4 w-4" aria-hidden="true" />
                    Tarefa de rua neste imóvel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/admin/manutencoes-lista")}>
                    <List className="h-4 w-4" aria-hidden="true" />
                    Ver na lista de manutenções
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/resultados/${v.imovel!.id}`)}>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Resultados do imóvel
                  </DropdownMenuItem>
                </>
              )}
              {podeApagar && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onApagar(v)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Apagar registro
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Situação: contagens, dinheiro e barra */}
      {v.imovel && (
        <div className="border-t border-border/60 bg-muted/30 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <SeloContagem tom={resumo.aFazer > 0 ? "warning" : "neutral"}>{resumo.aFazer}</SeloContagem> a fazer
            </span>
            <span className="flex items-center gap-1.5">
              <SeloContagem tom={resumo.feitos > 0 ? "success" : "neutral"}>{resumo.feitos}</SeloContagem> feitos
            </span>
            <span className="flex items-center gap-1.5">
              <SeloContagem tom={resumo.enviados > 0 ? "primary" : "neutral"}>{resumo.enviados}</SeloContagem> enviados
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-x-3 tabular-nums text-muted-foreground">
              <span title="Itens do proprietário ainda não enviados: valor menos aporte">
                Previsto <strong className="font-semibold text-foreground">{formatBRL(resumo.previsto)}</strong>
              </span>
              <span title="Cobranças já enviadas (valor a pagar)">
                Cobrado <strong className="font-semibold text-foreground">{formatBRL(resumo.cobrado)}</strong>
              </span>
              <span title="Cobranças enviadas e ainda não pagas">
                Em aberto{" "}
                <strong className={cn("font-semibold", resumo.emAberto > 0 ? "text-warning" : "text-foreground")}>{formatBRL(resumo.emAberto)}</strong>
              </span>
            </span>
          </div>
          {resumo.total > 0 && (
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100} aria-label="Itens feitos ou enviados">
              <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${progresso}%` }} />
            </div>
          )}
        </div>
      )}

      {aberto && (
        <div className="space-y-4 border-t border-border/60 px-4 py-3">
          {v.imovel ? (
            carregandoItens ? (
              <div className="space-y-2" aria-busy="true" aria-label="Carregando itens">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            ) : (
              <ItensViabilizacao viabilizacao={v} itens={itens} avulsas={avulsas} userId={userId} {...acoesItem} />
            )
          ) : (
            <div className="rounded-xl border border-dashed border-warning/50 bg-warning/5 px-4 py-3 text-sm">
              <p className="font-medium">Ainda sem conta do proprietário no portal.</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Para listar o que fazer (e cobrar depois), o imóvel precisa existir no portal, no nome do proprietário. Quando ele tiver
                conta (ou se já tiver e você não achou), vincule aqui.
              </p>
              <Button type="button" size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => onVincular(v)}>
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                Vincular conta ou imóvel
              </Button>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Observações</p>
              <Textarea
                value={obs ?? v.observacoes ?? ""}
                onChange={(e) => setObs(e.target.value)}
                onBlur={() => void salvarObs()}
                rows={2}
                maxLength={OBSERVACOES_MAX}
                placeholder="Chaves, horários, combinados com o proprietário…"
                className="min-h-[56px] resize-y bg-muted/30 text-sm"
                aria-label="Observações do imóvel"
              />
              {atualizar.isPending && obs === null && (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> salvando…
                </p>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fotos da visita</p>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onAnexar(v)} disabled={anexando}>
                  {anexando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Camera className="h-3.5 w-3.5" aria-hidden="true" />}
                  Adicionar
                </Button>
              </div>
              {v.anexos.length > 0 ? (
                <MiniaturasAnexos caminhos={v.anexos} urls={v.anexosUrls} onAbrir={(i) => onAbrirAnexo(v, i)} />
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma foto ainda.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
