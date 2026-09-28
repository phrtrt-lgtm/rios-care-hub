import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, ChevronDown, ChevronRight, Wrench, Building2 } from "lucide-react";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { LinhaCaixa, MiniaturaImovel, SeloContagem } from "@/components/painel/CaixaOperacao";
import { Etiqueta } from "@/components/painel/Etiqueta";
import type { Tom } from "@/components/painel/tons";
import { EtiquetaStatusCobranca } from "@/components/cobrancas/EtiquetaStatusCobranca";
import { formatarData } from "@/lib/cobrancaMeta";
import { RESPONSAVEL_CUSTO, type ResponsavelCusto } from "@/constants/chargeCategories";

interface CompletedMaintenance {
  id: string;
  subject: string;
  description: string;
  created_at: string;
  updated_at: string;
  scheduled_at: string | null;
  cost_responsible: "owner" | "pm" | "guest" | "pending" | null;
  property_id: string | null;
  service_provider: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  owner: {
    id: string;
    name: string;
  } | null;
  charges: {
    id: string;
    title: string;
    status: string;
    amount_cents: number;
  }[];
}

interface PropertyGroup {
  id: string;
  name: string;
  cover_photo_url: string | null;
  maintenances: CompletedMaintenance[];
}

/** Tom da etiqueta de responsável; sem valor não há etiqueta (nunca "Proprietário" por padrão). */
const TOM_RESPONSAVEL: Record<ResponsavelCusto, Tom> = {
  pending: "neutral",
  owner: "success",
  pm: "info",
  guest: "warning",
};

function EtiquetaResponsavel({ responsavel }: { responsavel: string | null }) {
  const chave = responsavel as ResponsavelCusto;
  if (!responsavel || !RESPONSAVEL_CUSTO[chave]) return null;
  return <Etiqueta tom={TOM_RESPONSAVEL[chave]}>{RESPONSAVEL_CUSTO[chave]}</Etiqueta>;
}

const AdminManutencoesConluidas = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [search, setSearch] = useState("");
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());

  // Fetch completed maintenance tickets
  const { data: maintenances, isLoading } = useQuery({
    queryKey: ["completed-maintenances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          description,
          created_at,
          updated_at,
          scheduled_at,
          cost_responsible,
          property_id,
          service_provider:service_providers(id, name, phone),
          owner:profiles!tickets_owner_id_fkey(id, name),
          charges(id, title, status, amount_cents)
        `)
        .eq("ticket_type", "manutencao")
        .eq("status", "concluido")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data as unknown as CompletedMaintenance[];
    },
  });

  // Fetch properties
  const { data: properties } = useQuery({
    queryKey: ["properties-for-completed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, cover_photo_url")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Group maintenances by property
  const propertyGroups = useMemo(() => {
    if (!maintenances || !properties) return [];

    const searchLower = search.toLowerCase();

    // Filter maintenances by search
    const filteredMaintenances = search
      ? maintenances.filter(m =>
          m.subject.toLowerCase().includes(searchLower) ||
          m.owner?.name.toLowerCase().includes(searchLower) ||
          m.service_provider?.name.toLowerCase().includes(searchLower)
        )
      : maintenances;

    // Group by property
    const groups: PropertyGroup[] = [];
    const propertyMap = new Map<string, CompletedMaintenance[]>();
    const noPropertyMaintenances: CompletedMaintenance[] = [];

    filteredMaintenances.forEach(m => {
      if (m.property_id) {
        const existing = propertyMap.get(m.property_id) || [];
        existing.push(m);
        propertyMap.set(m.property_id, existing);
      } else {
        noPropertyMaintenances.push(m);
      }
    });

    // Filter properties by search if searching
    const filteredProperties = search
      ? properties.filter(p =>
          p.name.toLowerCase().includes(searchLower) ||
          propertyMap.has(p.id)
        )
      : properties.filter(p => propertyMap.has(p.id));

    filteredProperties.forEach(p => {
      const propMaintenances = propertyMap.get(p.id) || [];
      if (propMaintenances.length > 0 || (search && p.name.toLowerCase().includes(searchLower))) {
        groups.push({
          id: p.id,
          name: p.name,
          cover_photo_url: p.cover_photo_url,
          maintenances: propMaintenances,
        });
      }
    });

    // Add "sem imóvel" group if there are maintenances without property
    if (noPropertyMaintenances.length > 0) {
      groups.push({
        id: "no-property",
        name: "Sem imóvel",
        cover_photo_url: null,
        maintenances: noPropertyMaintenances,
      });
    }

    return groups;
  }, [maintenances, properties, search]);

  const toggleProperty = (propertyId: string) => {
    setExpandedProperties(prev => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  const abrirManutencao = (maintenance: CompletedMaintenance) => {
    // Se tem cobrança ativa, abre a cobrança; senão a primeira cobrança; senão o ticket
    const activeCharge = maintenance.charges?.find(c => ['pendente', 'sent', 'overdue', 'contested'].includes(c.status));
    const anyCharge = maintenance.charges?.[0];
    if (activeCharge) {
      navigate(`/manutencao/${activeCharge.id}`);
    } else if (anyCharge) {
      navigate(`/manutencao/${anyCharge.id}`);
    } else {
      saveScrollPosition(pathname);
      navigate(`/ticket-detalhes/${maintenance.id}`);
    }
  };

  const total = maintenances?.length ?? 0;
  const subtitulo = isLoading ? undefined : `${total} ${total === 1 ? "concluída" : "concluídas"} · histórico por imóvel`;

  return (
    <PaginaInterna
      largura="larga"
      cabecalho={
        <CabecalhoPagina
          titulo="Manutenções concluídas"
          subtitulo={subtitulo}
          icone={<Wrench />}
          tom="success"
          voltarPara="/admin/manutencoes-lista"
        />
      }
    >
      {/* Busca */}
      <Card className="rounded-xl border-border/70 p-3 md:p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por imóvel, proprietário ou profissional…"
            aria-label="Buscar manutenções concluídas"
            className="pl-8"
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando manutenções concluídas">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : propertyGroups.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          {search ? (
            <EmptyState
              ilustracao="busca"
              title="Nada encontrado para a busca"
              description="Tente outro imóvel, proprietário ou profissional."
              action={
                <Button variant="outline" onClick={() => setSearch("")}>
                  Limpar busca
                </Button>
              }
            />
          ) : (
            <EmptyState
              ilustracao="manutencoes"
              title="Nenhuma manutenção concluída"
              description="As manutenções concluídas aparecem aqui, agrupadas por imóvel."
            />
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {propertyGroups.map((group) => {
            const aberto = expandedProperties.has(group.id);
            return (
              <Collapsible key={group.id} open={aberto} onOpenChange={() => toggleProperty(group.id)}>
                <Card className="overflow-hidden rounded-xl border-border/70">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-4"
                      aria-expanded={aberto}
                    >
                      <MiniaturaImovel url={group.cover_photo_url} fallback={<Building2 />} tamanho="h-12 w-16" />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold md:text-[15px]">{group.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {group.maintenances.length} {group.maintenances.length === 1 ? "manutenção concluída" : "manutenções concluídas"}
                        </p>
                      </div>
                      <SeloContagem tom="success">{group.maintenances.length}</SeloContagem>
                      {aberto ? (
                        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-1 border-t border-border/60 p-2">
                      {group.maintenances.map((maintenance) => {
                        const cobranca = maintenance.charges?.[0];
                        return (
                          <LinhaCaixa
                            key={maintenance.id}
                            titulo={maintenance.subject}
                            subtitulo={
                              <>
                                Concluída em {formatarData(maintenance.updated_at)}
                                {maintenance.service_provider ? ` · ${maintenance.service_provider.name}` : ""}
                                {cobranca ? ` · Cobrança: ${cobranca.title}` : ""}
                              </>
                            }
                            meta={
                              <div className="flex flex-col items-end gap-1">
                                <EtiquetaResponsavel responsavel={maintenance.cost_responsible} />
                                {cobranca && <EtiquetaStatusCobranca status={cobranca.status} />}
                              </div>
                            }
                            onClick={() => abrirManutencao(maintenance)}
                          />
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </PaginaInterna>
  );
};

export default AdminManutencoesConluidas;
