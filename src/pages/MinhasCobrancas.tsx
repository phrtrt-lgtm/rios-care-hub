import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ChevronRight, Copy, CreditCard, DollarSign, Loader2, Paperclip, QrCode, Zap } from "lucide-react";
import { MediaGallery } from "@/components/MediaGallery";
import { toast } from "sonner";
import { CHARGE_CATEGORIES } from "@/constants/chargeCategories";
import { ListFilters } from "@/components/list/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { OwnerCreditBanner } from "@/components/OwnerCreditBanner";
import { ReserveRetentionsHistory } from "@/components/ReserveRetentionsHistory";
import { ownerScopeFilter } from "@/lib/ownerScope";
import { cn } from "@/lib/utils";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { BotaoLinha, CaixaOperacao, SeloContagem } from "@/components/painel/CaixaOperacao";
import { EtiquetaStatusCobranca } from "@/components/cobrancas/EtiquetaStatusCobranca";
import { ResumoValorCobranca } from "@/components/cobrancas/ResumoValorCobranca";
import { estaEmAberto, estaPaga, formatarBRL, formatarData, rotuloStatusCobranca, valorDevido } from "@/lib/cobrancaMeta";
import { diasParaVencer } from "@/lib/vencimento";
import { nomeAnonimoAnexo } from "@/lib/zipFileName";

interface Charge {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  service_type?: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  credit_applied_cents?: number | null;
  currency: string;
  due_date: string | null;
  maintenance_date: string | null;
  status: string;
  payment_link_url: string | null;
  created_at: string;
  property_id: string | null;
  property?: {
    name: string;
  };
  attachments?: ChargeAttachment[];
  _count?: {
    messages: number;
  };
}

interface ChargeAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  poster_path: string | null;
}

type Escopo = "abertas" | "pagas" | "todas";

const ESCOPOS: Array<{ valor: Escopo; rotulo: string }> = [
  { valor: "abertas", rotulo: "Em aberto" },
  { valor: "pagas", rotulo: "Pagas" },
  { valor: "todas", rotulo: "Todas" },
];

/**
 * Nome genérico para a galeria: o nome real do arquivo nunca aparece na
 * interface (regra nº 4). A extensão é mantida para o download.
 */

/** "Vence em 3 dias", "Vence hoje", "Vencida há 2 dias" — só para cobranças em aberto. */
function textoVencimento(charge: Charge): string | null {
  if (!charge.due_date) return null;
  const data = formatarData(charge.due_date);
  if (!estaEmAberto(charge.status)) return `Vencimento ${data}`;
  const dias = diasParaVencer(charge.due_date);
  const plural = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;
  if (dias < 0) return `Vencida há ${plural(-dias)} · ${data}`;
  if (dias === 0) return `Vence hoje · ${data}`;
  return `Vence em ${plural(dias)} · ${data}`;
}

const MinhasCobrancas = () => {
  useScrollRestoration();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [escopo, setEscopo] = useState<Escopo>("abertas");
  const [selectedCharges, setSelectedCharges] = useState<string[]>([]);
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [groupPayment, setGroupPayment] = useState<{
    payment_link: string;
    pix_qr_code: string;
    pix_qr_code_base64: string;
    total_amount: number;
  } | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<{ id: string; file_url: string; file_name: string; file_type: string }[]>([]);
  const filtersHook = useListFilters("filters:minhas-cobrancas");
  const { applyTo, reset: resetFilters, hasActive } = filtersHook;

  useEffect(() => {
    if (!user || profile?.role !== 'owner') {
      navigate("/");
      return;
    }
    fetchCharges();
  }, [user, profile, navigate]);

  const fetchCharges = async () => {
    try {
      setLoading(true);

      const { data: chargesData, error: chargesError } = await supabase
        .from('charges')
        .select('*')
        .or(await ownerScopeFilter(user!.id))
        .order('created_at', { ascending: false });

      if (chargesError) throw chargesError;

      // Fetch property, attachments and message counts for all charges
      const enrichedCharges = await Promise.all(
        (chargesData || []).map(async (charge) => {
          const [propertyResult, attachmentsResult, messagesResult] = await Promise.all([
            charge.property_id
              ? supabase.from('properties').select('name').eq('id', charge.property_id).single()
              : Promise.resolve({ data: null }),
            supabase
              .from('charge_attachments')
              .select('id, file_name, file_path, file_size, mime_type, poster_path')
              .eq('charge_id', charge.id),
            supabase
              .from('charge_messages')
              .select('id', { count: 'exact', head: true })
              .eq('charge_id', charge.id)
          ]);

          return {
            ...charge,
            property: propertyResult.data || undefined,
            attachments: attachmentsResult.data || [],
            _count: {
              messages: messagesResult.count || 0
            }
          };
        })
      );

      setCharges(enrichedCharges);
    } catch (error) {
      console.error('Erro ao carregar cobranças:', error);
      toast.error("Não foi possível carregar as cobranças.");
    } finally {
      setLoading(false);
    }
  };

  const toggleChargeSelection = (chargeId: string) => {
    setSelectedCharges(prev =>
      prev.includes(chargeId)
        ? prev.filter(id => id !== chargeId)
        : [...prev, chargeId]
    );
    // O link gerado vale para a seleção anterior; com outra seleção, precisa gerar de novo.
    setGroupPayment(null);
  };

  const limparSelecao = () => {
    setSelectedCharges([]);
    setGroupPayment(null);
  };

  const handleGenerateGroupPayment = async () => {
    try {
      setGeneratingPayment(true);

      const { data, error } = await supabase.functions.invoke('create-group-payment', {
        body: { chargeIds: selectedCharges }
      });

      if (error) throw error;

      setGroupPayment({
        payment_link: data.payment_link,
        pix_qr_code: data.pix_qr_code,
        pix_qr_code_base64: data.pix_qr_code_base64,
        total_amount: data.total_amount
      });

      toast.success('Pagamento agrupado gerado');
    } catch (error) {
      console.error('Erro ao gerar pagamento:', error);
      toast.error('Erro ao gerar pagamento agrupado');
    } finally {
      setGeneratingPayment(false);
    }
  };

  const contagens = useMemo(
    () => ({
      abertas: charges.filter((c) => estaEmAberto(c.status)).length,
      pagas: charges.filter((c) => estaPaga(c.status)).length,
      todas: charges.length,
    }),
    [charges],
  );

  const selectedChargesData = useMemo(() => charges.filter((c) => selectedCharges.includes(c.id)), [charges, selectedCharges]);
  const totalSelecionado = useMemo(() => selectedChargesData.reduce((sum, c) => sum + valorDevido(c), 0), [selectedChargesData]);

  const propertyOptions = useMemo(
    () =>
      Array.from(
        new Map(charges.filter((c) => c.property?.name && c.property_id).map((c) => [c.property_id!, c.property!.name])).entries(),
      ).map(([value, label]) => ({ value, label })),
    [charges],
  );

  // Só os status que existem nas cobranças deste proprietário, com o rótulo do vocabulário único.
  const statusOptions = useMemo(
    () =>
      Array.from(new Set(charges.map((c) => c.status)))
        .map((s) => ({ value: s, label: rotuloStatusCobranca(s) }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [charges],
  );

  const filteredCharges = useMemo(() => {
    const porEscopo = charges.filter((c) =>
      escopo === "abertas" ? estaEmAberto(c.status) : escopo === "pagas" ? estaPaga(c.status) : true,
    );
    return applyTo(porEscopo, {
      searchFields: (c) => [c.title, c.description, c.property?.name],
      status: (c) => c.status,
      propertyId: (c) => c.property_id,
      date: (c) => c.created_at,
    });
  }, [charges, escopo, applyTo]);

  useEffect(() => {
    setVisibleCount(100);
  }, [filteredCharges.length]);

  const visibleCharges = filteredCharges.slice(0, visibleCount);
  const hasMore = filteredCharges.length > visibleCount;

  const abrirCobranca = (charge: Charge) => {
    saveScrollPosition(pathname);
    navigate(`/cobranca/${charge.id}`);
  };

  const abrirAnexos = (charge: Charge) => {
    const atts = (charge.attachments || []).map((a, i) => {
      const path = a.file_path || "";
      let url = path;
      if (path && !path.startsWith("http://") && !path.startsWith("https://")) {
        const { data: pub } = supabase.storage.from("attachments").getPublicUrl(path);
        url = pub.publicUrl;
      }
      return {
        id: a.id,
        file_url: url,
        file_name: nomeAnonimoAnexo(a.file_name, a.mime_type, i),
        file_type: a.mime_type || "",
      };
    });
    setGalleryItems(atts);
    setGalleryOpen(true);
  };

  const subtitulo = loading
    ? undefined
    : `${contagens.abertas} em aberto${contagens.abertas > 0 ? ` · ${formatarBRL(charges.filter((c) => estaEmAberto(c.status)).reduce((s, c) => s + valorDevido(c), 0))} a pagar` : ""}`;

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Minhas cobranças"
          subtitulo={subtitulo}
          icone={<DollarSign />}
          tom="success"
          voltarPara="/minha-caixa"
          abaixo={
            <BarraFiltros role="tablist" aria-label="Escopo das cobranças">
              {ESCOPOS.map((e) => (
                <AbaPilula
                  key={e.valor}
                  ativa={escopo === e.valor}
                  quantidade={loading ? undefined : contagens[e.valor]}
                  tom={e.valor === "abertas" ? "success" : "neutral"}
                  onClick={() => setEscopo(e.valor)}
                >
                  {e.rotulo}
                </AbaPilula>
              ))}
            </BarraFiltros>
          }
        />
      }
    >
      <OwnerCreditBanner ownerId={user?.id} />

      {/* Pagamento agrupado: só aparece com cobranças selecionadas */}
      {selectedCharges.length > 0 && (
        <CaixaOperacao
          icone={<QrCode />}
          titulo="Pagamento agrupado"
          tom="primary"
          selos={<SeloContagem tom="primary">{selectedCharges.length}</SeloContagem>}
          acoes={
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={limparSelecao} disabled={generatingPayment}>
              Limpar seleção
            </Button>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/40 px-4 py-3">
            <div>
              <p className="text-sm text-muted-foreground">
                {selectedCharges.length} {selectedCharges.length === 1 ? 'cobrança selecionada' : 'cobranças selecionadas'}
              </p>
              <p className="text-2xl font-bold tabular-nums">{formatarBRL(totalSelecionado)}</p>
              <p className="text-xs text-muted-foreground">PIX à vista ou cartão em até 12x pelo Mercado Pago</p>
            </div>
            <Button onClick={handleGenerateGroupPayment} disabled={generatingPayment || groupPayment !== null} size="lg">
              {generatingPayment ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
              {generatingPayment ? "Gerando pagamento…" : "Gerar pagamento"}
            </Button>
          </div>

          {groupPayment && !generatingPayment && (
            <div className={cn("mt-3 grid gap-3", groupPayment.pix_qr_code ? "md:grid-cols-2" : "mx-auto max-w-md md:grid-cols-1")}>
              {groupPayment.pix_qr_code && (
                <div className="rounded-xl border border-success/30 bg-success/5 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success" aria-hidden="true">
                      <Zap className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">PIX</p>
                      <p className="text-xs text-muted-foreground">À vista, aprovação imediata</p>
                    </div>
                  </div>
                  {/* Fundo branco atrás do QR: única exceção de cor crua, para o leitor conseguir ler o código. */}
                  <div className="flex justify-center rounded-lg border bg-white p-3">
                    <img src={groupPayment.pix_qr_code_base64} alt="QR Code do PIX" className="h-48 w-48" />
                  </div>
                  <p className="mt-2 text-center text-sm">
                    Valor <span className="font-semibold tabular-nums">{formatarBRL(totalSelecionado)}</span>
                  </p>
                  <Button
                    className="mt-2 w-full"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(groupPayment.pix_qr_code);
                      toast.success('Código PIX copiado');
                    }}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copiar código PIX
                  </Button>
                </div>
              )}

              <div className="rounded-xl border border-info/30 bg-info/10 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info" aria-hidden="true">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Cartão de crédito</p>
                    <p className="text-xs text-muted-foreground">Parcele em até 12x com juros</p>
                  </div>
                </div>
                <div className="space-y-2 rounded-lg border border-dashed border-info/30 bg-muted p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Valor total</span>
                    <span className="text-lg font-bold tabular-nums">{formatarBRL(totalSelecionado)}</span>
                  </div>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    <li>Parcele em até 12x no cartão</li>
                    <li>Aceita os principais cartões</li>
                    <li>Pagamento seguro pelo Mercado Pago</li>
                  </ul>
                </div>
                <Button className="mt-3 w-full" size="lg" onClick={() => window.open(groupPayment.payment_link, '_blank')}>
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  Pagar com Mercado Pago
                </Button>
              </div>
            </div>
          )}
        </CaixaOperacao>
      )}

      <Card className="rounded-xl border-border/70 p-3 md:p-4">
        <ListFilters
          {...filtersHook}
          searchPlaceholder="Buscar por título ou imóvel…"
          statusOptions={statusOptions}
          propertyOptions={propertyOptions}
          showDateRange
          totalCount={charges.length}
          filteredCount={filteredCharges.length}
        />
      </Card>

      {loading ? (
        <Card className="rounded-xl border-border/70 p-3" aria-busy="true" aria-label="Carregando cobranças">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      ) : charges.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="cobrancas"
            title="Nenhuma cobrança"
            description="Você não tem cobranças no momento. Quando a RIOS enviar uma, ela aparece aqui."
          />
        </Card>
      ) : filteredCharges.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="busca"
            title="Nenhuma cobrança com esses filtros"
            description="Mude o escopo acima ou limpe os filtros para ver as demais."
            action={
              (hasActive || escopo !== "todas") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    resetFilters();
                    setEscopo("todas");
                  }}
                >
                  Limpar filtros
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <CaixaOperacao
          icone={<DollarSign />}
          titulo="Cobranças"
          tom="success"
          selos={<SeloContagem>{filteredCharges.length}</SeloContagem>}
          subcabecalho={
            contagens.abertas > 0 && selectedCharges.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Marque as cobranças em aberto abaixo para pagar várias de uma vez.
              </p>
            ) : undefined
          }
        >
          <div className="space-y-1.5">
            {visibleCharges.map((charge) => {
              const aberta = estaEmAberto(charge.status);
              const selecionada = selectedCharges.includes(charge.id);
              const vencida = aberta && !!charge.due_date && diasParaVencer(charge.due_date) < 0;
              const anexos = charge.attachments?.length || 0;
              const categoria = charge.category
                ? CHARGE_CATEGORIES[charge.category as keyof typeof CHARGE_CATEGORIES] || charge.category
                : charge.service_type || null;
              const vencimento = textoVencimento(charge);

              return (
                <div
                  key={charge.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => abrirCobranca(charge)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      abrirCobranca(charge);
                    }
                  }}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 transition-colors hover:bg-muted/60",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    vencida && "border-destructive/30 bg-destructive/5",
                    selecionada && "border-primary/40 ring-2 ring-primary/40",
                  )}
                >
                  {aberta && (
                    <span className="flex h-5 items-center pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selecionada}
                        onCheckedChange={() => toggleChargeSelection(charge.id)}
                        aria-label={`Selecionar ${charge.title} para pagamento agrupado`}
                      />
                    </span>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-[13px] font-medium leading-tight">{charge.title}</p>
                      <EtiquetaStatusCobranca status={charge.status} />
                    </div>
                    {(charge.property || categoria) && (
                      <p className="truncate text-xs text-muted-foreground">
                        {charge.property?.name}
                        {charge.property && categoria ? " · " : ""}
                        {categoria}
                      </p>
                    )}
                    {vencimento && (
                      <p className={cn("text-xs", vencida ? "font-medium text-destructive" : "text-muted-foreground")}>{vencimento}</p>
                    )}
                    <ResumoValorCobranca cobranca={charge} variante="compacto" />
                  </div>

                  {anexos > 0 && (
                    <div className="flex shrink-0 items-center self-center" onClick={(e) => e.stopPropagation()}>
                      <BotaoLinha
                        rotulo={`Ver ${anexos} ${anexos === 1 ? "anexo" : "anexos"}`}
                        texto={String(anexos)}
                        tom="primary"
                        onClick={() => abrirAnexos(charge)}
                      >
                        <Paperclip />
                      </BotaoLinha>
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/60" aria-hidden="true" />
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-3">
              <Button variant="outline" onClick={() => setVisibleCount((v) => v + 100)}>
                Carregar mais ({filteredCharges.length - visibleCount} restantes)
              </Button>
            </div>
          )}
        </CaixaOperacao>
      )}

      {/* Débitos retroativos em reserva (retenções já efetuadas) */}
      <ReserveRetentionsHistory
        ownerId={user?.id}
        title="Débitos efetuados em reserva"
        hideWhenEmpty
      />

      <MediaGallery
        items={galleryItems}
        initialIndex={0}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
      />
    </PaginaInterna>
  );
};

export default MinhasCobrancas;
