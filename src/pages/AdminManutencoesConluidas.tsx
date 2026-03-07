import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Search, Building, ChevronDown, ChevronRight, Calendar, User, Receipt, Wrench } from "lucide-react";

interface CompletedMaintenance {
  id: string;
  subject: string;
  description: string;
  created_at: string;
  updated_at: string;
  scheduled_at: string | null;
  cost_responsible: "owner" | "pm" | "guest" | null;
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

const AdminManutencoesConluidas = () => {
  const navigate = useNavigate();
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

    // Add "sem unidade" group if there are maintenances without property
    if (noPropertyMaintenances.length > 0) {
      groups.push({
        id: "no-property",
        name: "Sem Unidade",
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

  const getResponsibleBadge = (responsible: string | null) => {
    switch (responsible) {
      case "guest":
        return (
          <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30">
            Hóspede
          </Badge>
        );
      case "pm":
        return (
          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">
            Gestão
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
            Proprietário
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold">Manutenções Concluídas</h1>
            <p className="text-muted-foreground text-sm">
              Histórico de manutenções por imóvel
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por imóvel, proprietário ou profissional..."
            className="pl-10"
          />
        </div>

        {/* Property List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 bg-muted rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-muted rounded w-1/3" />
                    <div className="h-4 bg-muted rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : propertyGroups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Wrench className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {search ? "Nenhum resultado encontrado" : "Nenhuma manutenção concluída"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {propertyGroups.map((group) => (
              <Collapsible
                key={group.id}
                open={expandedProperties.has(group.id)}
                onOpenChange={() => toggleProperty(group.id)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors text-left">
                      {group.cover_photo_url ? (
                        <img
                          src={group.cover_photo_url}
                          alt={group.name}
                          className="w-16 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-16 h-12 rounded-lg bg-muted flex items-center justify-center">
                          <Building className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{group.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {group.maintenances.length} manutenção{group.maintenances.length !== 1 ? "ões" : ""} concluída{group.maintenances.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      {expandedProperties.has(group.id) ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t divide-y">
                      {group.maintenances.map((maintenance) => (
                        <div
                          key={maintenance.id}
                          className="p-4 hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => {
                            // Se tem cobrança ativa, navega para a cobrança; senão para o ticket
                            const activeCharge = maintenance.charges?.find(c => ['pendente','sent','overdue','contested'].includes(c.status));
                            const anyCharge = maintenance.charges?.[0];
                            if (activeCharge) {
                              navigate(`/manutencao-detalhes/${activeCharge.id}`);
                            } else if (anyCharge) {
                              navigate(`/manutencao-detalhes/${anyCharge.id}`);
                            } else {
                              navigate(`/ticket-detalhes/${maintenance.id}`);
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium">{maintenance.subject}</h4>
                                {getResponsibleBadge(maintenance.cost_responsible)}
                              </div>
                              
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5" />
                                  Concluído em {format(new Date(maintenance.updated_at), "dd/MM/yyyy", { locale: ptBR })}
                                </span>
                                
                                {maintenance.service_provider && (
                                  <span className="flex items-center gap-1">
                                    <User className="h-3.5 w-3.5" />
                                    {maintenance.service_provider.name}
                                  </span>
                                )}
                              </div>

                              {maintenance.charges && maintenance.charges.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm">
                                    Cobrança: {maintenance.charges[0].title}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {maintenance.charges[0].status === "paid" ? "Pago" : 
                                     maintenance.charges[0].status === "pending" ? "Pendente" : 
                                     maintenance.charges[0].status}
                                  </Badge>
                                </div>
                              )}
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminManutencoesConluidas;
