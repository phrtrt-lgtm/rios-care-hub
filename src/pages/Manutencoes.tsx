import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMaintenances, useMaintenanceCharts } from "@/hooks/useMaintenances";
import { MaintenanceCharts } from "@/components/MaintenanceCharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Building2, Gift, Paperclip, Search } from "lucide-react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { MediaGallery } from "@/components/MediaGallery";
import { ownerScopeFilter } from "@/lib/ownerScope";
import { fetchChargeGalleryAttachments, type GalleryAttachment } from "@/lib/chargeAttachments";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { BotaoLinha, CaixaOperacao, LinhaCaixa } from "@/components/painel/CaixaOperacao";
import { TituloSecao } from "@/components/painel/TituloSecao";
import { EtiquetaStatusCobranca } from "@/components/cobrancas/EtiquetaStatusCobranca";
import {
  STATUS_COBRANCA,
  STATUS_COBRANCA_EDITAVEIS,
  estaEmAberto,
  estaPaga,
  formatarBRL,
  formatarData,
  valorDevido,
} from "@/lib/cobrancaMeta";
import { rotuloResponsavelCusto, rotulosServico } from "@/constants/chargeCategories";

/** Linha do relatório: uma cobrança de manutenção com o que já foi pago. */
interface Manutencao {
  id: string;
  title: string;
  created_at: string;
  property_id: string | null;
  amount_cents: number | null;
  management_contribution_cents: number | null;
  credit_applied_cents?: number | null;
  paid_cents: number;
  status: string;
  cost_responsible: string | null;
  split_owner_percent: number | null;
  category: string | null;
  service_type: string | null;
  ticket_id: string | null;
  property: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
}

interface ServiceTypeData {
  service_type: string;
  total_amount: number;
  charge_count: number;
}

interface PropertyOption {
  id: string;
  name: string;
  owner: { name: string } | null;
}

const ANO_ATUAL = new Date().getFullYear();

export default function Manutencoes() {
  useScrollRestoration();
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [year, setYear] = useState<number>(ANO_ATUAL);
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("");
  const [serviceTypeData, setServiceTypeData] = useState<ServiceTypeData[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(searchParams.get("property") || "");
  const [attachmentsByCharge, setAttachmentsByCharge] = useState<Record<string, GalleryAttachment[]>>({});
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryAttachment[]>([]);

  const isOwner = profile?.role === "owner";
  const isTeam = profile?.role === "admin" || profile?.role === "agent" || profile?.role === "maintenance";
  const ownerId = isOwner ? profile?.id : undefined;
  const propertyId = selectedPropertyId || undefined;

  // Todos os filtros aplicam ao mudar; a busca espera 300 ms de digitação.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useMaintenances({
    ownerId,
    propertyId,
    status: status || undefined,
    search: debouncedSearch || undefined,
    serviceType: serviceTypeFilter || undefined,
  });
  const maintenances = useMemo(() => (data ?? []) as unknown as Manutencao[], [data]);
  const { data: charts } = useMaintenanceCharts(ownerId, year, propertyId, serviceTypeFilter || undefined);

  // Imóveis para o filtro da equipe
  useEffect(() => {
    if (!isTeam) return;
    supabase
      .from("properties")
      .select("id, name, owner:profiles!properties_owner_id_fkey(name)")
      .order("name")
      .then(({ data: rows }) => setProperties((rows ?? []) as unknown as PropertyOption[]));
  }, [isTeam]);

  // Totais por tipo de serviço (gráfico e opções do filtro)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        let query = supabase
          .from("charges")
          .select("service_type, amount_cents")
          .is("archived_at", null)
          .not("service_type", "is", null);
        if (ownerId) query = query.or(await ownerScopeFilter(ownerId));
        if (propertyId) query = query.eq("property_id", propertyId);
        if (serviceTypeFilter) query = query.eq("service_type", serviceTypeFilter);

        const { data: rows, error } = await query;
        if (error) throw error;
        if (cancelled) return;

        const grouped: Record<string, ServiceTypeData> = {};
        (rows ?? []).forEach((charge) => {
          const type = charge.service_type || "Outros";
          if (!grouped[type]) grouped[type] = { service_type: type, total_amount: 0, charge_count: 0 };
          grouped[type].total_amount += charge.amount_cents ?? 0;
          grouped[type].charge_count += 1;
        });
        setServiceTypeData(Object.values(grouped));
      } catch (error) {
        console.error("Erro ao carregar dados de tipo de serviço:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, ownerId, propertyId, serviceTypeFilter]);

  const serviceTypes = useMemo(() => serviceTypeData.map((d) => d.service_type), [serviceTypeData]);

  // Anexos da galeria (da cobrança ou, na falta, do ticket de origem)
  useEffect(() => {
    const list = maintenances.map((m) => ({ id: m.id, ticket_id: m.ticket_id }));
    if (list.length === 0) {
      setAttachmentsByCharge({});
      return;
    }
    let cancelled = false;
    (async () => {
      const grouped = await fetchChargeGalleryAttachments(list);
      if (cancelled) return;
      setAttachmentsByCharge(grouped);
    })();
    return () => {
      cancelled = true;
    };
  }, [maintenances]);

  // Aporte da gestão no ano (o único número do resumo que a tela usa)
  const aporteTotalCents = useMemo(
    () =>
      maintenances
        .filter((m) => new Date(m.created_at).getFullYear() === year)
        .reduce((sum, m) => sum + (m.management_contribution_cents || 0), 0),
    [maintenances, year],
  );

  // Resumo por imóvel (equipe, sem imóvel selecionado)
  const propertyReports = useMemo(() => {
    if (!isTeam || selectedPropertyId) return [];
    const yearData = maintenances.filter((m) => new Date(m.created_at).getFullYear() === year);
    const byProperty: Record<string, { name: string; ownerName: string; items: Manutencao[] }> = {};
    yearData.forEach((m) => {
      const pid = m.property_id || "sem-imovel";
      if (!byProperty[pid]) {
        byProperty[pid] = {
          name: m.property?.name || "Sem imóvel",
          ownerName: m.owner?.name || "—",
          items: [],
        };
      }
      byProperty[pid].items.push(m);
    });
    return Object.entries(byProperty)
      .map(([id, group]) => ({
        id,
        ...group,
        totalCents: group.items.reduce((s, m) => s + (m.amount_cents || 0), 0),
        openCount: group.items.filter((m) => estaEmAberto(m.status)).length,
        paidCount: group.items.filter((m) => estaPaga(m.status)).length,
        count: group.items.length,
      }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }, [isTeam, maintenances, year, selectedPropertyId]);

  const handlePropertyChange = (value: string) => {
    const pid = value === "all" ? "" : value;
    setSelectedPropertyId(pid);
    setSearchParams(pid ? { property: pid } : {});
  };

  const temFiltro = !!(status || debouncedSearch || serviceTypeFilter || selectedPropertyId);
  const limparFiltros = () => {
    setStatus("");
    setSearch("");
    setServiceTypeFilter("");
    handlePropertyChange("all");
  };

  const abrirCobranca = (m: Manutencao) => {
    saveScrollPosition(pathname);
    navigate(`/cobranca/${m.id}`);
  };

  const abrirGaleria = (itens: GalleryAttachment[]) => {
    setGalleryItems(itens);
    setGalleryOpen(true);
  };

  const subtitulo = isLoading
    ? undefined
    : `${maintenances.length} ${maintenances.length === 1 ? "manutenção" : "manutenções"}`;

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Relatório de manutenções"
          subtitulo={subtitulo}
          icone={<BarChart3 />}
          tom="primary"
          voltarPara={isOwner ? "/minha-caixa" : "/admin/manutencoes-lista"}
        />
      }
    >
      {/* Filtros: todos aplicam ao mudar */}
      <Card className="rounded-xl border-border/70 p-3 md:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {isTeam && (
            <div className="space-y-1.5">
              <Label htmlFor="filtro-imovel" className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" aria-hidden="true" />
                Imóvel
              </Label>
              <Select value={selectedPropertyId || "all"} onValueChange={handlePropertyChange}>
                <SelectTrigger id="filtro-imovel" aria-label="Imóvel">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  <SelectItem value="all">Todos os imóveis</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.owner?.name ? ` (${p.owner.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="filtro-ano" className="text-xs text-muted-foreground">
              Ano
            </Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger id="filtro-ano" aria-label="Ano">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                {[ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filtro-status" className="text-xs text-muted-foreground">
              Status
            </Label>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger id="filtro-status" aria-label="Status">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                <SelectItem value="all">Todos</SelectItem>
                {STATUS_COBRANCA_EDITAVEIS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_COBRANCA[s].rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {serviceTypes.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="filtro-servico" className="text-xs text-muted-foreground">
                Tipo de serviço
              </Label>
              <Select value={serviceTypeFilter || "all"} onValueChange={(v) => setServiceTypeFilter(v === "all" ? "" : v)}>
                <SelectTrigger id="filtro-servico" aria-label="Tipo de serviço">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {serviceTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {rotulosServico(type).join(", ") || type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="filtro-busca" className="text-xs text-muted-foreground">
              Buscar
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="filtro-busca"
                placeholder="Título ou descrição…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Aporte da gestão no ano */}
      {aporteTotalCents > 0 && (
        <Card className="rounded-xl border-success/30 bg-success/5 px-4 py-4 text-center">
          <div className="mb-1 flex items-center justify-center gap-2">
            <Gift className="h-4 w-4 text-success" aria-hidden="true" />
            <p className="text-[11px] font-medium uppercase tracking-wide text-success">
              A RIOS já aportou {selectedPropertyId ? "neste imóvel" : isOwner ? "no seu imóvel" : "nos imóveis"}
            </p>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-success">{formatarBRL(aporteTotalCents)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">em {year}</p>
        </Card>
      )}

      {/* Lista */}
      {isLoading ? (
        <Card className="rounded-xl border-border/70 p-3" aria-busy="true" aria-label="Carregando manutenções">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      ) : maintenances.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          {temFiltro ? (
            <EmptyState
              ilustracao="busca"
              title="Nenhuma manutenção com esses filtros"
              description="Mude os filtros acima ou limpe todos para ver as demais."
              action={
                <Button variant="outline" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              ilustracao="manutencoes"
              title="Nenhuma manutenção ainda"
              description={
                isOwner
                  ? "As manutenções do seu imóvel aparecem aqui assim que a equipe as enviar."
                  : "As manutenções enviadas aos proprietários aparecem aqui."
              }
            />
          )}
        </Card>
      ) : (
        <>
          {/* Desktop: tabela */}
          <Card className="hidden overflow-hidden rounded-xl border-border/70 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-[90px] pl-4">Data</TableHead>
                  <TableHead className="min-w-[140px]">Imóvel</TableHead>
                  <TableHead className="min-w-[220px]">Manutenção</TableHead>
                  <TableHead className="w-[110px] text-right">Total</TableHead>
                  <TableHead className="w-[110px] text-right">Aporte</TableHead>
                  <TableHead className="w-[110px] text-right">A pagar</TableHead>
                  <TableHead className="w-[120px]">Responsável</TableHead>
                  <TableHead className="w-[110px] text-right">Pago</TableHead>
                  <TableHead className="w-[80px] text-center">Anexos</TableHead>
                  <TableHead className="w-[150px] pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maintenances.map((m) => {
                  const atts = attachmentsByCharge[m.id] || [];
                  const servicos = rotulosServico(m.service_type);
                  return (
                    <TableRow
                      key={m.id}
                      className="cursor-pointer"
                      onClick={() => abrirCobranca(m)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") abrirCobranca(m);
                      }}
                      tabIndex={0}
                    >
                      <TableCell className="pl-4 text-xs tabular-nums text-muted-foreground">
                        {formatarData(m.created_at)}
                      </TableCell>
                      <TableCell className="text-[13px]">{m.property?.name || "—"}</TableCell>
                      <TableCell>
                        <p className="line-clamp-1 text-[13px] font-medium">{m.title}</p>
                        {(m.category || servicos.length > 0) && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {[m.category, servicos.join(", ")].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums">{formatarBRL(m.amount_cents ?? 0)}</TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums text-success">
                        {(m.management_contribution_cents ?? 0) > 0 ? formatarBRL(m.management_contribution_cents ?? 0) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-[13px] font-semibold tabular-nums">{formatarBRL(valorDevido(m))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {rotuloResponsavelCusto(m.cost_responsible, m.split_owner_percent)}
                      </TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums">
                        {m.paid_cents > 0 ? formatarBRL(m.paid_cents) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {atts.length > 0 ? (
                          <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                            <BotaoLinha rotulo={`Ver anexos (${atts.length})`} texto={String(atts.length)} onClick={() => abrirGaleria(atts)}>
                              <Paperclip />
                            </BotaoLinha>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4">
                        <EtiquetaStatusCobranca status={m.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Celular: linhas */}
          <div className="space-y-1.5 md:hidden">
            {maintenances.map((m) => {
              const atts = attachmentsByCharge[m.id] || [];
              const servicos = rotulosServico(m.service_type);
              return (
                <LinhaCaixa
                  key={m.id}
                  titulo={m.title}
                  subtitulo={
                    <>
                      {m.property?.name || "—"} · {formatarData(m.created_at)}
                      {servicos.length > 0 ? ` · ${servicos.join(", ")}` : ""}
                    </>
                  }
                  meta={
                    <div className="flex flex-col items-end gap-1">
                      <EtiquetaStatusCobranca status={m.status} />
                      <span className="text-[13px] font-semibold tabular-nums">{formatarBRL(valorDevido(m))}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {rotuloResponsavelCusto(m.cost_responsible, m.split_owner_percent)}
                        {m.paid_cents > 0 ? ` · pago ${formatarBRL(m.paid_cents)}` : ""}
                      </span>
                    </div>
                  }
                  acoes={
                    atts.length > 0 ? (
                      <BotaoLinha rotulo={`Ver anexos (${atts.length})`} onClick={() => abrirGaleria(atts)}>
                        <Paperclip />
                      </BotaoLinha>
                    ) : undefined
                  }
                  onClick={() => abrirCobranca(m)}
                  className="bg-card"
                />
              );
            })}
          </div>
        </>
      )}

      {/* Resumo por imóvel (equipe) */}
      {isTeam && !selectedPropertyId && propertyReports.length > 0 && (
        <section className="space-y-3">
          <TituloSecao titulo="Resumo por imóvel" subtitulo={`Manutenções de ${year}`} />
          {propertyReports.map((prop) => (
            <CaixaOperacao
              key={prop.id}
              icone={<Building2 />}
              titulo={prop.name}
              tom="primary"
              subcabecalho={<p className="text-xs text-muted-foreground">Proprietário: {prop.ownerName}</p>}
              acoes={
                prop.id !== "sem-imovel" && (
                  <Button variant="outline" size="sm" className="h-8" onClick={() => handlePropertyChange(prop.id)}>
                    Ver detalhes
                  </Button>
                )
              }
            >
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Total gasto</div>
                  <div className="text-lg font-bold tabular-nums">{formatarBRL(prop.totalCents)}</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Manutenções</div>
                  <div className="text-lg font-bold tabular-nums">{prop.count}</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Em aberto</div>
                  <div className="text-lg font-bold tabular-nums text-warning">{prop.openCount}</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Pagas</div>
                  <div className="text-lg font-bold tabular-nums text-success">{prop.paidCount}</div>
                </div>
              </div>
            </CaixaOperacao>
          ))}
        </section>
      )}

      {/* Gráficos no final */}
      <MaintenanceCharts charts={charts ?? null} serviceTypeData={serviceTypeData} />

      <MediaGallery items={galleryItems} initialIndex={0} open={galleryOpen} onOpenChange={setGalleryOpen} />
    </PaginaInterna>
  );
}
