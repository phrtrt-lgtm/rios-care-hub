import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMaintenances, useMaintenanceCharts } from "@/hooks/useMaintenances";
import { MaintenanceCharts } from "@/components/MaintenanceCharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, Building2, ArrowLeft, Paperclip, FileText, Film, Gift, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { goBack, saveScrollPosition } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { MediaGallery } from "@/components/MediaGallery";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function AttachmentThumbs({
  attachments,
  max = 4,
  onOpen,
}: {
  attachments: Array<{ id: string; mime: string; poster: boolean }>;
  max?: number;
  onOpen?: (index: number) => void;
}) {
  if (!attachments || attachments.length === 0) return null;
  const shown = attachments.slice(0, max);
  const extra = attachments.length - shown.length;
  const handleClick = (e: React.MouseEvent, index: number) => {
    if (!onOpen) return;
    e.stopPropagation();
    e.preventDefault();
    onOpen(index);
  };
  return (
    <div className="flex items-center gap-1 shrink-0">
      {shown.map((a, idx) => {
        const isImage = a.mime?.startsWith("image/");
        const isVideo = a.mime?.startsWith("video/");
        const isPdf = a.mime === "application/pdf";
        const common = "h-8 w-8 rounded border overflow-hidden";
        if (isImage) {
          return (
            <button
              key={a.id}
              type="button"
              onClick={(e) => handleClick(e, idx)}
              className={common}
            >
              <img
                src={`${SUPABASE_URL}/functions/v1/serve-attachment/${a.id}/file`}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          );
        }
        if (isVideo) {
          return (
            <button
              key={a.id}
              type="button"
              onClick={(e) => handleClick(e, idx)}
              className={`${common} bg-muted flex items-center justify-center relative`}
            >
              {a.poster ? (
                <img
                  src={`${SUPABASE_URL}/functions/v1/serve-attachment/${a.id}/poster`}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Film className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          );
        }
        return (
          <button
            key={a.id}
            type="button"
            onClick={(e) => handleClick(e, idx)}
            className={`${common} bg-muted flex items-center justify-center`}
          >
            {isPdf ? (
              <FileText className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        );
      })}
      {extra > 0 && (
        <button
          type="button"
          onClick={(e) => handleClick(e, 0)}
          className="h-8 min-w-8 px-1 rounded border bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground"
        >
          +{extra}
        </button>
      )}
    </div>
  );
}

export default function Manutencoes() {
  useScrollRestoration();
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("");
  const [activeFilters, setActiveFilters] = useState({ status: "", search: "", serviceType: "" });
  const [serviceTypeData, setServiceTypeData] = useState<any[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(searchParams.get('property') || "");
  const [attachmentsByCharge, setAttachmentsByCharge] = useState<Record<string, Array<{ id: string; file_url: string; file_name: string; file_type: string }>>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<Array<{ id: string; file_url: string; file_name: string; file_type: string }>>([]);

  const isOwner = profile?.role === 'owner';
  const isTeam = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';
  const ownerId = isOwner ? profile?.id : undefined;
  const propertyId = selectedPropertyId || undefined;

  const { data: maintenances, isLoading } = useMaintenances({
    ownerId,
    propertyId,
    status: activeFilters.status || undefined,
    search: activeFilters.search || undefined,
    serviceType: serviceTypeFilter || undefined,
  });
  const { data: charts } = useMaintenanceCharts(ownerId, year, propertyId, serviceTypeFilter || undefined);

  // Fetch properties for team filter
  useEffect(() => {
    if (isTeam) {
      supabase.from('properties').select('id, name, owner:profiles!properties_owner_id_fkey(name)').order('name')
        .then(({ data }) => setProperties(data || []));
    }
  }, [isTeam]);

  useEffect(() => {
    if (user) {
      fetchServiceTypeData();
    }
  }, [user, year, propertyId, serviceTypeFilter]);

  // Fetch attachments for listed maintenances (full info for gallery)
  useEffect(() => {
    const ids = (maintenances || []).map((m: any) => m.id);
    if (ids.length === 0) {
      setAttachmentsByCharge({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("charge_attachments")
        .select("id, charge_id, file_path, file_name, mime_type, mime_type_override, created_at")
        .in("charge_id", ids)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const grouped: Record<string, Array<{ id: string; file_url: string; file_name: string; file_type: string }>> = {};
      (data || []).forEach((a: any) => {
        const path = a.file_path || "";
        let url = path;
        if (path && !path.startsWith("http://") && !path.startsWith("https://")) {
          const { data: pub } = supabase.storage.from("attachments").getPublicUrl(path);
          url = pub.publicUrl;
        }
        const mime = a.mime_type_override || a.mime_type || "";
        if (!grouped[a.charge_id]) grouped[a.charge_id] = [];
        grouped[a.charge_id].push({ id: a.id, file_url: url, file_name: a.file_name || "", file_type: mime });
      });
      setAttachmentsByCharge(grouped);
    })();
    return () => {
      cancelled = true;
    };
  }, [maintenances]);


  const fetchServiceTypeData = async () => {
    try {
      let query = supabase
        .from('charges')
        .select('service_type, amount_cents')
        .is('archived_at', null)
        .not('service_type', 'is', null) as any;

      if (ownerId) {
        query = query.eq('owner_id', ownerId);
      }

      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }

      if (serviceTypeFilter) {
        query = query.eq('service_type', serviceTypeFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      const grouped = (data || []).reduce((acc: any, charge: any) => {
        const type = charge.service_type || 'Outros';
        if (!acc[type]) {
          acc[type] = { service_type: type, total_amount: 0, charge_count: 0 };
        }
        acc[type].total_amount += charge.amount_cents;
        acc[type].charge_count += 1;
        return acc;
      }, {});

      const groupedData = Object.values(grouped);
      setServiceTypeData(groupedData);
      setServiceTypes(groupedData.map((d: any) => d.service_type));
    } catch (error) {
      console.error('Erro ao carregar dados de tipo de serviço:', error);
    }
  };

  // Summary computed from maintenances
  const summary = useMemo(() => {
    if (!maintenances) return null;
    const yearData = maintenances.filter((m: any) => new Date(m.created_at).getFullYear() === year);
    const openCount = yearData.filter((m: any) => ['draft', 'pending'].includes(m.status)).length;
    const completedCount = yearData.filter((m: any) => m.status === 'paid').length;
    const paidCount = completedCount;
    const totalCents = yearData.reduce((sum: number, m: any) => sum + ((m.amount_cents || 0) - (m.management_contribution_cents || 0)), 0);
    const avgOrderCents = yearData.length > 0 ? totalCents / yearData.length : 0;
    const aporteTotalCents = yearData.reduce((sum: number, m: any) => sum + (m.management_contribution_cents || 0), 0);
    return { openCount, completedCount, paidCount, totalCents, avgOrderCents, aporteTotalCents };
  }, [maintenances, year]);

  // Per-property summaries for team overview
  const propertyReports = useMemo(() => {
    if (!isTeam || !maintenances || selectedPropertyId) return [];
    const yearData = maintenances.filter((m: any) => new Date(m.created_at).getFullYear() === year);
    const byProperty: Record<string, { name: string; ownerName: string; items: any[] }> = {};
    yearData.forEach((m: any) => {
      const pid = m.property_id || 'sem-imovel';
      if (!byProperty[pid]) {
        byProperty[pid] = {
          name: m.property?.name || 'Sem imóvel',
          ownerName: m.owner?.name || '-',
          items: [],
        };
      }
      byProperty[pid].items.push(m);
    });
    return Object.entries(byProperty).map(([id, data]) => {
      const totalCents = data.items.reduce((s: number, m: any) => s + (m.amount_cents || 0), 0);
      const openCount = data.items.filter((m: any) => ['draft', 'pending'].includes(m.status)).length;
      const paidCount = data.items.filter((m: any) => m.status === 'paid').length;
      return { id, ...data, totalCents, openCount, paidCount, count: data.items.length };
    }).sort((a, b) => b.totalCents - a.totalCents);
  }, [isTeam, maintenances, year, selectedPropertyId]);

  const handleFilter = () => {
    setActiveFilters({ status, search, serviceType: serviceTypeFilter });
  };

  const handlePropertyChange = (value: string) => {
    const pid = value === "all" ? "" : value;
    setSelectedPropertyId(pid);
    if (pid) {
      setSearchParams({ property: pid });
    } else {
      setSearchParams({});
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      draft: { variant: "secondary", label: "Rascunho" },
      pending: { variant: "default", label: "Pendente" },
      paid: { variant: "default", label: "Paga" },
      contested: { variant: "destructive", label: "Contestada" },
      debited: { variant: "outline", label: "Debitada" },
      cancelled: { variant: "destructive", label: "Cancelada" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getResponsibleLabel = (responsible: string, percent?: number | null) => {
    if (responsible === 'owner') return 'Proprietário';
    if (responsible === 'management') return 'Gestão';
    if (responsible === 'split') return `Dividido (${percent}% prop.)`;
    return responsible;
  };

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(isOwner ? '/minha-caixa' : '/painel', { replace: true })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl sm:text-3xl font-bold">Manutenções</h1>
      </div>

      {/* Filtros (toggle) */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filtros
          {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        {showFilters && (
          <Card className="mt-3">
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-3 items-end">
                {isTeam && (
                  <div className="space-y-2 w-full sm:w-56">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Unidade
                    </label>
                    <Select value={selectedPropertyId || "all"} onValueChange={handlePropertyChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as unidades</SelectItem>
                        {properties.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} {p.owner?.name ? `(${p.owner.name})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2 w-32">
                  <label className="text-sm font-medium">Ano</label>
                  <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[year, year - 1, year - 2].map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 w-full sm:w-48">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="draft">Rascunho</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="paid">Paga</SelectItem>
                      <SelectItem value="contested">Contestada</SelectItem>
                      <SelectItem value="debited">Debitada</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {serviceTypes.length > 0 && (
                  <div className="space-y-2 w-full sm:w-48">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Filter className="h-3 w-3" />
                      Tipo de Serviço
                    </label>
                    <Select value={serviceTypeFilter || "all"} onValueChange={(v) => setServiceTypeFilter(v === "all" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os tipos</SelectItem>
                        {serviceTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2 flex-1 min-w-[200px]">
                  <label className="text-sm font-medium">Buscar</label>
                  <Input
                    placeholder="Título ou descrição..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
                  />
                </div>

                <Button onClick={handleFilter}>Filtrar</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Aporte RIOS */}
      {summary && summary.aporteTotalCents > 0 && (
        <Card className="overflow-hidden border-success/30">
          <CardContent className="p-0">
            <div className="rounded-xl bg-gradient-to-r from-success/15 to-success/5 px-4 py-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Gift className="h-4 w-4 text-success" />
                <p className="text-[11px] text-success font-medium tracking-wide uppercase">
                  A RIOS já aportou {selectedPropertyId ? 'neste imóvel' : 'no seu imóvel'}
                </p>
              </div>
              <p className="text-2xl font-extrabold text-success">
                {formatBRL(summary.aporteTotalCents)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">em {year}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Manutenções */}
      <Card>
        <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
          <CardTitle className="text-base">Lista de Manutenções</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop / tablet table */}
          <div className="hidden md:block overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Imóvel</th>
                  <th className="text-left p-3">Título / Categoria</th>
                  <th className="text-right p-3">Valor Total</th>
                  <th className="text-right p-3">Aporte Gestão</th>
                  <th className="text-right p-3">Valor Devido</th>
                  <th className="text-center p-3">Responsável</th>
                  <th className="text-right p-3">Pago</th>
                  <th className="text-left p-3">Anexos</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="text-center p-8 text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : maintenances && maintenances.length > 0 ? (
                  maintenances
                    .filter((m: any) => !activeFilters.serviceType || (m.service_type && String(m.service_type).split(",").map((s: string) => s.trim()).includes(activeFilters.serviceType)))
                    .map((m: any) => (
                    <tr
                      key={m.id}
                      className="border-t hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => { saveScrollPosition(pathname); navigate(`/cobranca/${m.id}`); }}
                    >
                      <td className="p-3">{formatDateTime(m.created_at)}</td>
                      <td className="p-3">{m.property?.name || '-'}</td>
                      <td className="p-3">
                        <div className="font-medium">{m.title}</div>
                        {m.category && (
                          <div className="text-xs text-muted-foreground">{m.category}</div>
                        )}
                        {m.service_type && (
                          <div className="text-xs text-muted-foreground">
                            🏷️ {String(m.service_type).split(",").map((s: string) => s.trim()).filter(Boolean).join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatBRL(m.amount_cents)}
                      </td>
                      <td className="p-3 text-right font-medium text-success">
                        {m.management_contribution_cents > 0 ? formatBRL(m.management_contribution_cents) : '-'}
                      </td>
                      <td className="p-3 text-right font-bold">
                        {formatBRL(m.amount_cents - (m.management_contribution_cents || 0))}
                      </td>
                      <td className="p-3 text-center text-xs">
                        {getResponsibleLabel(m.cost_responsible, m.split_owner_percent)}
                      </td>
                      <td className="p-3 text-right">
                        {formatBRL(m.paid_cents)}
                      </td>
                      <td className="p-3">
                        {(() => {
                          const atts = attachmentsByCharge[m.id] || [];
                          if (atts.length === 0) return <span className="text-xs text-muted-foreground">-</span>;
                          return (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setGalleryItems(atts); setGalleryOpen(true); }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm hover:bg-primary/10 text-primary transition-colors"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              <span>{atts.length}</span>
                            </button>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-center">{getStatusBadge(m.status)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="text-center p-8 text-muted-foreground">
                      Nenhuma manutenção encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : maintenances && maintenances.length > 0 ? (
              maintenances
                .filter((m: any) => !activeFilters.serviceType || (m.service_type && String(m.service_type).split(",").map((s: string) => s.trim()).includes(activeFilters.serviceType)))
                .map((m: any) => {
                  const due = m.amount_cents - (m.management_contribution_cents || 0);
                  const atts = attachmentsByCharge[m.id] || [];
                  return (
                    <button
                      key={m.id}
                      onClick={() => { saveScrollPosition(pathname); navigate(`/cobranca/${m.id}`); }}
                      className="w-full text-left p-3 active:bg-accent transition-colors"
                    >
                      {/* Header: property + status */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-muted-foreground truncate">
                            {m.property?.name || '-'} · {formatDateTime(m.created_at)}
                          </div>
                          <div className="font-medium text-sm leading-tight truncate">{m.title}</div>
                          {(m.category || m.service_type) && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {[m.category, m.service_type && String(m.service_type).split(",").map((s: string) => s.trim()).filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">{getStatusBadge(m.status)}</div>
                      </div>

                      {/* Values grid */}
                      <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                        <div className="bg-muted/50 rounded px-2 py-1">
                          <div className="text-muted-foreground">Total</div>
                          <div className="font-medium text-xs">{formatBRL(m.amount_cents)}</div>
                        </div>
                        <div className="bg-muted/50 rounded px-2 py-1">
                          <div className="text-muted-foreground">Aporte</div>
                          <div className="font-medium text-success text-xs">
                            {m.management_contribution_cents > 0 ? formatBRL(m.management_contribution_cents) : '-'}
                          </div>
                        </div>
                        <div className="bg-muted/50 rounded px-2 py-1">
                          <div className="text-muted-foreground">Devido</div>
                          <div className="font-bold text-xs">{formatBRL(due)}</div>
                        </div>
                      </div>

                      {/* Footer: paid + responsible + attachments */}
                      <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">
                            {getResponsibleLabel(m.cost_responsible, m.split_owner_percent)}
                          </span>
                          {m.paid_cents > 0 && (
                            <span className="text-success">· Pago {formatBRL(m.paid_cents)}</span>
                          )}
                        </div>
                        {atts.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setGalleryItems(atts); setGalleryOpen(true); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-primary/10 text-primary transition-colors shrink-0"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">{atts.length}</span>
                          </button>
                        )}
                      </div>
                    </button>
                  );
                })
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma manutenção encontrada</div>
            )}
          </div>
        </CardContent>
      </Card>


      {/* Por Unidade - Team only */}
      {isTeam && !selectedPropertyId && propertyReports.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Resumo por Unidade</h2>
          {propertyReports.map((prop) => (
            <Card key={prop.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      {prop.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Proprietário: {prop.ownerName}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePropertyChange(prop.id)}
                  >
                    Ver detalhes
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Total Gasto</div>
                    <div className="text-lg font-bold">{formatBRL(prop.totalCents)}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Manutenções</div>
                    <div className="text-lg font-bold">{prop.count}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Abertas</div>
                    <div className="text-lg font-bold text-warning">{prop.openCount}</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Pagas</div>
                    <div className="text-lg font-bold text-success">{prop.paidCount}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Gráficos no final */}
      <MaintenanceCharts charts={charts} serviceTypeData={serviceTypeData} />

      <MediaGallery
        items={galleryItems}
        initialIndex={0}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
      />
    </div>
  );
}
