import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  HandCoins,
  Link2,
  Receipt,
  Tag,
  User,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { MediaGallery } from "@/components/MediaGallery";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { TOM, type Tom } from "@/components/painel/tons";
import { EtiquetaStatusCobranca } from "@/components/cobrancas/EtiquetaStatusCobranca";
import { useMaintenanceUpdates } from "@/hooks/useMaintenanceUpdates";
import type { MaintenanceNote } from "@/hooks/useMaintenances";
import { CHARGE_CATEGORIES, rotuloResponsavelCusto, rotulosServico } from "@/constants/chargeCategories";
import { STATUS_TICKET, type StatusTicket } from "@/lib/ticketMeta";
import { STATUS_COBRANCA, type StatusCobranca, formatarBRL, formatarData, valorDevido } from "@/lib/cobrancaMeta";
import { formatDateTime } from "@/lib/format";
import { detectMediaKind } from "@/lib/mediaType";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------ */
/* Etapas                                                                    */
/* ------------------------------------------------------------------------ */

export const ETAPAS_MANUTENCAO = [
  { rotulo: "Pendente", icone: Clock },
  { rotulo: "Agendado", icone: Calendar },
  { rotulo: "Em execução", icone: Wrench },
  { rotulo: "Concluído", icone: CheckCircle2 },
] as const;

const ETAPA_POR_STATUS: Record<string, number> = {
  novo: 1,
  em_analise: 1,
  aguardando_info: 1,
  em_execucao: 3,
  concluido: 4,
  cancelado: 0,
};

/** 1 a 4 na ordem acima; 0 = cancelada. Agendada e ainda não executando = 2. */
export function etapaManutencao(status: string | null | undefined, scheduledAt: string | null | undefined): number {
  if (scheduledAt && !["em_execucao", "concluido", "cancelado"].includes(status ?? "")) return 2;
  return ETAPA_POR_STATUS[status ?? ""] ?? 1;
}

/** Linha de etapas com o ponto da etapa atual aceso. Usada na caixa do painel e no popup. */
export function EtapasManutencao({ etapa, className }: { etapa: number; className?: string }) {
  if (etapa === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Etiqueta tom="neutral" ponto>
          Cancelada
        </Etiqueta>
        Esta manutenção não vai acontecer.
      </div>
    );
  }
  const progresso = ((etapa - 1) / (ETAPAS_MANUTENCAO.length - 1)) * 100;
  return (
    <ol className={cn("relative flex items-start justify-between", className)} aria-label="Etapas da manutenção">
      <div className="absolute left-4 right-4 top-4 h-0.5 bg-border" aria-hidden="true" />
      <div
        className="absolute left-4 top-4 h-0.5 bg-primary transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `calc((100% - 2rem) * ${progresso / 100})` }}
        aria-hidden="true"
      />
      {ETAPAS_MANUTENCAO.map((e, i) => {
        const n = i + 1;
        const atual = n === etapa;
        const feita = n < etapa;
        const Icone = e.icone;
        return (
          <li key={e.rotulo} className="relative z-10 flex w-16 flex-col items-center" aria-current={atual ? "step" : undefined}>
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                atual
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/30 ring-4 ring-primary/15"
                  : feita
                    ? "bg-primary/15 text-primary"
                    : "bg-background text-muted-foreground ring-1 ring-border",
              )}
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className={cn("mt-1.5 text-center text-[10px] leading-tight", atual ? "font-semibold text-primary" : "text-muted-foreground")}>
              {e.rotulo}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------------ */
/* Peças pequenas                                                            */
/* ------------------------------------------------------------------------ */

function Fato({ icone, rotulo, valor, tom = "neutral" }: { icone: ReactNode; rotulo: string; valor: ReactNode; tom?: Tom }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-xl border border-border/70 bg-card p-3">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4", TOM[tom].caixa)} aria-hidden="true">
        {icone}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
        <p className="mt-0.5 break-words text-sm font-medium leading-snug text-foreground">{valor}</p>
      </div>
    </div>
  );
}

function TituloBloco({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</h3>
      {extra}
    </div>
  );
}

/** Chip de status sobre o fundo escuro do topo: ponto no tom, texto claro. */
function ChipTopo({ tom, children }: { tom: Tom; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-background/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm">
      <span className={cn("h-1.5 w-1.5 rounded-full", TOM[tom].ponto)} aria-hidden="true" />
      {children}
    </span>
  );
}

const ehMidia = (a: { file_type?: string | null; file_name?: string | null; file_url?: string | null }) => {
  const kind = detectMediaKind(a.file_type, a.file_name, a.file_url);
  return kind === "image" || kind === "video";
};

const ROTULO_ARQUIVO: Record<string, string> = { pdf: "PDF", audio: "Áudio", other: "Documento" };

/* ------------------------------------------------------------------------ */
/* Resumo                                                                    */
/* ------------------------------------------------------------------------ */

interface Props {
  /** Resultado de `useMaintenance` (cobrança ou ticket; ver useMaintenances.ts). */
  maintenance: any;
  /** Chamado antes de navegar para outra página (fecha o popup). */
  onNavegar?: () => void;
}

/**
 * Resumo da manutenção para o proprietário, no popup da caixa do painel:
 * topo com a capa do imóvel, etapas, fatos essenciais, financeiro, o que
 * será feito, fotos e as últimas atualizações da equipe. Pedido do gestor
 * em 2026-11-01: cabia tudo numa folha longa; agora é um cartão que cabe
 * em tela pequena, no visual da área de resultados.
 */
export function ResumoManutencao({ maintenance, onNavegar }: Props) {
  const navigate = useNavigate();
  const [descricaoAberta, setDescricaoAberta] = useState(false);
  const [todasAtualizacoes, setTodasAtualizacoes] = useState(false);
  const [galeria, setGaleria] = useState<{ aberta: boolean; indice: number }>({ aberta: false, indice: 0 });

  const source: "charge" | "ticket" = maintenance.source === "charge" ? "charge" : "ticket";
  const ticketId: string | null = source === "ticket" ? maintenance.id : (maintenance.ticket_id ?? null);
  const chargeId: string | null = source === "charge" ? maintenance.id : (maintenance.charge_id ?? null);
  const statusTicket: string | null = source === "ticket" ? maintenance.status : null;
  const statusCobranca: string | null = source === "charge" ? maintenance.status : (maintenance.charge_status ?? null);

  // Etapa: cobrança já lançada = serviço feito (a cobrança nasce ao concluir).
  const etapa = source === "charge" ? 4 : etapaManutencao(statusTicket, maintenance.scheduled_at);
  const metaTicket = statusTicket ? STATUS_TICKET[statusTicket as StatusTicket] : null;
  const metaCobranca = statusCobranca ? STATUS_COBRANCA[statusCobranca as StatusCobranca] : null;

  const total: number = maintenance.amount_cents || 0;
  const aporte: number = maintenance.management_contribution_cents || 0;
  const pago: number = maintenance.paid_cents || 0;
  const aPagar = Math.max(0, valorDevido(maintenance) - pago);
  const temFinanceiro = total > 0 || !!chargeId;

  const servicos = rotulosServico(maintenance.service_type);
  const categoria = maintenance.category
    ? CHARGE_CATEGORIES[maintenance.category as keyof typeof CHARGE_CATEGORIES] || maintenance.category
    : null;
  const tipo = [categoria, ...servicos].filter(Boolean).join(" · ");
  const descricao: string | null = maintenance.description || maintenance.ticket_description || null;
  const descricaoLonga = (descricao?.length ?? 0) > 220 || (descricao?.split("\n").length ?? 0) > 4;

  const anexos: any[] = maintenance.attachments ?? [];
  const midia = anexos.filter(ehMidia);
  const outros = anexos.filter((a) => !ehMidia(a));
  const itensGaleria = [...midia, ...outros].map((a: any) => ({
    id: a.id,
    file_url: a.file_url,
    file_name: a.file_name,
    file_type: a.file_type,
    size_bytes: a.size_bytes,
  }));

  const { data: updates, isLoading: carregandoUpdates } = useMaintenanceUpdates({ ticketId, chargeId });
  const atualizacoes = useMemo(() => {
    const notas: MaintenanceNote[] = (maintenance.ticket_notes ?? []).filter((n: MaintenanceNote) => !n.is_internal);
    const lista = [
      ...(updates ?? []).map((u) => ({ id: `u-${u.id}`, autor: u.author?.name || "Equipe RIOS", quando: u.created_at, texto: u.body })),
      ...notas.map((n) => ({ id: `n-${n.id}`, autor: n.author?.name || "Equipe RIOS", quando: n.created_at, texto: n.body })),
    ];
    return lista.sort((a, b) => (a.quando < b.quando ? 1 : -1));
  }, [updates, maintenance.ticket_notes]);
  const visiveis = todasAtualizacoes ? atualizacoes : atualizacoes.slice(0, 3);

  const irPara = (rota: string) => {
    onNavegar?.();
    navigate(rota);
  };

  const capa: string | null = maintenance.property?.cover_photo_url ?? null;

  return (
    <div className="flex flex-col">
      {/* Topo: capa do imóvel sob o gradiente da marca, como o hero de resultados */}
      <header className="relative isolate overflow-hidden bg-gradient-to-br from-secondary via-[hsl(var(--rios-blue-deep))] to-[hsl(var(--rios-blue))] px-5 pb-5 pt-5 text-secondary-foreground">
        {capa && (
          <img src={capa} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-35" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-secondary/95 via-secondary/75 to-secondary/35" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-10 -top-10 -z-10 h-40 w-40 rounded-full bg-primary/30 blur-3xl" aria-hidden="true" />

        <p className="flex items-center gap-1.5 pr-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary-foreground/75">
          <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
          Manutenção
          {maintenance.property?.name && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex min-w-0 items-center gap-1 truncate normal-case tracking-normal">
                <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                {maintenance.property.name}
              </span>
            </>
          )}
        </p>
        <h2 className="mt-2 pr-8 text-xl font-semibold leading-tight tracking-tight md:text-2xl">{maintenance.title || "Manutenção"}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {metaTicket && <ChipTopo tom={metaTicket.tom}>{metaTicket.rotulo}</ChipTopo>}
          {source === "charge" && metaCobranca && <ChipTopo tom={metaCobranca.tom}>Cobrança {metaCobranca.rotulo.toLowerCase()}</ChipTopo>}
          <span className="inline-flex items-center gap-1 text-[11px] text-secondary-foreground/70">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            Aberta em {formatarData(maintenance.created_at)}
          </span>
        </div>
      </header>

      {/* Etapas */}
      <div className="border-b border-border/60 bg-muted/30 px-5 py-4">
        <EtapasManutencao etapa={etapa} />
      </div>

      <div className="space-y-5 px-5 py-4">
        {/* Fatos essenciais */}
        <div className="grid grid-cols-2 gap-2">
          <Fato
            icone={<Calendar />}
            rotulo="Execução"
            tom={maintenance.scheduled_at ? "info" : "neutral"}
            valor={maintenance.scheduled_at ? formatDateTime(maintenance.scheduled_at) : "A agendar"}
          />
          <Fato icone={<HandCoins />} rotulo="Quem paga" tom="primary" valor={rotuloResponsavelCusto(maintenance.cost_responsible, maintenance.split_owner_percent)} />
          {maintenance.service_provider?.name && <Fato icone={<User />} rotulo="Profissional" valor={maintenance.service_provider.name} />}
          {tipo && <Fato icone={<Tag />} rotulo="Serviço" valor={tipo} />}
        </div>

        {/* Financeiro */}
        {temFinanceiro && (
          <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div className="h-1 bg-gradient-to-r from-success via-[hsl(var(--rios-blue))] to-primary" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">A pagar</p>
                <p className={cn("mt-1 text-2xl font-semibold leading-none tracking-tight tabular-nums", aPagar === 0 ? "text-success" : "text-foreground")}>
                  {formatarBRL(aPagar)}
                </p>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                  <span>Total {formatarBRL(total)}</span>
                  {aporte > 0 && <span className="text-success">Aporte RIOS {formatarBRL(aporte)}</span>}
                  {pago > 0 && <span>Pago {formatarBRL(pago)}</span>}
                  {maintenance.due_date && <span>Vence {formatarData(maintenance.due_date)}</span>}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {statusCobranca && <EtiquetaStatusCobranca status={statusCobranca} />}
                {chargeId && (
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => irPara(`/cobranca/${chargeId}`)}>
                    <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                    Ver cobrança
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* O que será feito */}
        {descricao && (
          <section>
            <TituloBloco>O que será feito</TituloBloco>
            <p className={cn("whitespace-pre-wrap text-sm leading-relaxed text-foreground/90", !descricaoAberta && descricaoLonga && "line-clamp-4")}>
              {descricao}
            </p>
            {descricaoLonga && (
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => setDescricaoAberta((v) => !v)}
                aria-expanded={descricaoAberta}
              >
                {descricaoAberta ? "Ver menos" : "Ver tudo"}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", descricaoAberta && "rotate-180")} aria-hidden="true" />
              </button>
            )}
          </section>
        )}

        {/* Fotos e documentos: o nome do arquivo nunca aparece */}
        {anexos.length > 0 && (
          <section>
            <TituloBloco
              extra={
                <span className="text-[11px] text-muted-foreground">
                  {midia.length > 0 && `${midia.length} ${midia.length === 1 ? "foto" : "fotos"}`}
                  {midia.length > 0 && outros.length > 0 && " · "}
                  {outros.length > 0 && `${outros.length} ${outros.length === 1 ? "documento" : "documentos"}`}
                </span>
              }
            >
              Fotos e documentos
            </TituloBloco>
            {midia.length > 0 && (
              <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:thin]">
                {midia.map((a: any, i: number) => (
                  <div key={a.id} className="shrink-0 overflow-hidden rounded-lg ring-1 ring-border/60">
                    <MediaThumbnail src={a.file_url} fileType={a.file_type} fileName={a.file_name} size="md" onClick={() => setGaleria({ aberta: true, indice: i })} />
                  </div>
                ))}
              </div>
            )}
            {outros.length > 0 && (
              <div className={cn("flex flex-wrap gap-1.5", midia.length > 0 && "mt-2")}>
                {outros.map((a: any, i: number) => (
                  <button
                    key={a.id}
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted"
                    onClick={() => setGaleria({ aberta: true, indice: midia.length + i })}
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    {ROTULO_ARQUIVO[detectMediaKind(a.file_type, a.file_name, a.file_url)] ?? "Documento"}
                  </button>
                ))}
              </div>
            )}
            <MediaGallery items={itensGaleria} initialIndex={galeria.indice} open={galeria.aberta} onOpenChange={(o) => setGaleria((g) => ({ ...g, aberta: o }))} />
          </section>
        )}

        {/* Atualizações da equipe */}
        <section>
          <TituloBloco extra={atualizacoes.length > 0 ? <span className="text-[11px] text-muted-foreground">{atualizacoes.length}</span> : undefined}>
            Atualizações da equipe
          </TituloBloco>
          {carregandoUpdates ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-3/4 rounded-lg" />
            </div>
          ) : atualizacoes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
              A equipe ainda não publicou atualizações. Quando houver novidade, ela aparece aqui.
            </p>
          ) : (
            <ol className="relative space-y-3 border-l border-border/70 pl-4">
              {visiveis.map((a, i) => (
                <li key={a.id} className="relative">
                  <span
                    className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background", i === 0 ? "bg-primary" : "bg-muted-foreground/40")}
                    aria-hidden="true"
                  />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{a.autor}</span> · {formatDistanceToNow(new Date(a.quando), { addSuffix: true, locale: ptBR })}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{a.texto}</p>
                </li>
              ))}
            </ol>
          )}
          {atualizacoes.length > 3 && (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={() => setTodasAtualizacoes((v) => !v)}
              aria-expanded={todasAtualizacoes}
            >
              {todasAtualizacoes ? "Mostrar só as recentes" : `Ver todas (${atualizacoes.length})`}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", todasAtualizacoes && "rotate-180")} aria-hidden="true" />
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

/** Esqueleto com a mesma silhueta do resumo, para o popup não "pular". */
export function ResumoManutencaoCarregando() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Carregando manutenção">
      <div className="bg-gradient-to-br from-secondary via-[hsl(var(--rios-blue-deep))] to-[hsl(var(--rios-blue))] px-5 pb-5 pt-5">
        <Skeleton className="h-3 w-32 bg-background/20" />
        <Skeleton className="mt-3 h-6 w-3/4 bg-background/20" />
        <Skeleton className="mt-3 h-5 w-24 rounded-full bg-background/20" />
      </div>
      <div className="border-b border-border/60 bg-muted/30 px-5 py-4">
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    </div>
  );
}
