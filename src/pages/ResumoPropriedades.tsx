import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { goBack } from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Building2, 
  ChevronDown, 
  ChevronRight,
  Ticket, 
  Receipt, 
  Wrench, 
  ClipboardCheck,
  ArrowLeft
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";

interface PropertySummary {
  id: string;
  name: string;
  address: string | null;
  owner: { id: string; name: string; email: string } | null;
  tickets: Array<{
    id: string;
    subject: string;
    status: string;
    ticket_type: string;
    created_at: string;
  }>;
  charges: Array<{
    id: string;
    title: string;
    status: string;
    amount_cents: number;
    due_date: string | null;
  }>;
  maintenances: Array<{
    id: string;
    title: string;
    status: string;
    amount_cents: number;
  }>;
  inspections: Array<{
    id: string;
    created_at: string;
    notes: string | null;
  }>;
}

const statusColors: Record<string, string> = {
  novo: "bg-blue-100 text-blue-800",
  em_analise: "bg-yellow-100 text-yellow-800",
  aguardando_info: "bg-orange-100 text-orange-800",
  em_execucao: "bg-purple-100 text-purple-800",
  concluido: "bg-green-100 text-green-800",
  cancelado: "bg-gray-100 text-gray-800",
  draft: "bg-gray-100 text-gray-800",
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  contested: "bg-red-100 text-red-800",
  debited: "bg-blue-100 text-blue-800",
};

const statusLabels: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em Análise",
  aguardando_info: "Aguardando Info",
  em_execucao: "Em Execução",
  concluido: "Concluído",
  cancelado: "Cancelado",
  draft: "Rascunho",
  pending: "Pendente",
  paid: "Pago",
  contested: "Contestado",
  debited: "Debitado",
};

export default function ResumoPropriedades() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());

  const role = profile?.role;
  const isTeamMember = role === "admin" || role === "agent" || role === "maintenance";

  const { data: properties, isLoading } = useQuery({
    queryKey: ["property-summaries", user?.id, role],
    queryFn: async () => {
      // Fetch properties
      let propertiesQuery = supabase
        .from("properties")
        .select(`
          id,
          name,
          address,
          owner:profiles!properties_owner_id_fkey(id, name, email)
        `)
        .order("name");

      if (!isTeamMember) {
        propertiesQuery = propertiesQuery.eq("owner_id", user?.id);
      }

      const { data: propertiesData, error: propertiesError } = await propertiesQuery;
      if (propertiesError) throw propertiesError;

      // Fetch related data for each property
      const summaries: PropertySummary[] = await Promise.all(
        (propertiesData || []).map(async (property) => {
          // Tickets
          const { data: tickets } = await supabase
            .from("tickets")
            .select("id, subject, status, ticket_type, created_at")
            .eq("property_id", property.id)
            .order("created_at", { ascending: false })
            .limit(10);

          // Charges (excluding maintenance type)
          const { data: charges } = await supabase
            .from("charges")
            .select("id, title, status, amount_cents, due_date")
            .eq("property_id", property.id)
            .is("category", null)
            .order("created_at", { ascending: false })
            .limit(10);

          // Maintenances (charges with category = 'maintenance')
          const { data: maintenances } = await supabase
            .from("charges")
            .select("id, title, status, amount_cents")
            .eq("property_id", property.id)
            .eq("category", "maintenance")
            .order("created_at", { ascending: false })
            .limit(10);

          // Inspections
          const { data: inspections } = await supabase
            .from("cleaning_inspections")
            .select("id, created_at, notes")
            .eq("property_id", property.id)
            .is("archived_at", null)
            .order("created_at", { ascending: false })
            .limit(10);

          return {
            ...property,
            owner: property.owner as PropertySummary["owner"],
            tickets: tickets || [],
            charges: charges || [],
            maintenances: maintenances || [],
            inspections: inspections || [],
          };
        })
      );

      return summaries;
    },
    enabled: !!user,
  });

  const toggleProperty = (propertyId: string) => {
    setExpandedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <MobileHeader />
        <div className="container mx-auto p-4 pb-24 space-y-4">
          <Skeleton className="h-8 w-48" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader />
      <div className="container mx-auto p-4 pb-24">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Resumo por Propriedade</h1>
        </div>

        <div className="space-y-3">
          {properties?.map((property) => {
            const isExpanded = expandedProperties.has(property.id);
            const totalItems = 
              property.tickets.length + 
              property.charges.length + 
              property.maintenances.length + 
              property.inspections.length;

            return (
              <Collapsible
                key={property.id}
                open={isExpanded}
                onOpenChange={() => toggleProperty(property.id)}
              >
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <Building2 className="h-5 w-5 text-primary" />
                          <div>
                            <CardTitle className="text-base">{property.name}</CardTitle>
                            {property.address && (
                              <p className="text-xs text-muted-foreground">{property.address}</p>
                            )}
                            {isTeamMember && property.owner && (
                              <p className="text-xs text-muted-foreground">
                                Proprietário: {property.owner.name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {totalItems} itens
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-4">
                      {/* Tickets */}
                      {property.tickets.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Ticket className="h-4 w-4 text-blue-600" />
                            <span className="font-medium text-sm">Tickets ({property.tickets.length})</span>
                          </div>
                          <div className="space-y-1 pl-6">
                            {property.tickets.map((ticket) => (
                              <div
                                key={ticket.id}
                                className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-muted/50 cursor-pointer"
                                onClick={() => navigate(`/ticket/${ticket.id}`)}
                              >
                                <span className="truncate flex-1">{ticket.subject}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(ticket.created_at)}
                                  </span>
                                  <Badge className={`text-xs ${statusColors[ticket.status] || ""}`}>
                                    {statusLabels[ticket.status] || ticket.status}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Charges */}
                      {property.charges.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Receipt className="h-4 w-4 text-orange-600" />
                            <span className="font-medium text-sm">Cobranças ({property.charges.length})</span>
                          </div>
                          <div className="space-y-1 pl-6">
                            {property.charges.map((charge) => (
                              <div
                                key={charge.id}
                                className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-muted/50 cursor-pointer"
                                onClick={() => navigate(`/cobranca/${charge.id}`)}
                              >
                                <span className="truncate flex-1">{charge.title}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium">
                                    {formatCurrency(charge.amount_cents)}
                                  </span>
                                  {charge.due_date && (
                                    <span className="text-xs text-muted-foreground">
                                      Venc: {formatDate(charge.due_date)}
                                    </span>
                                  )}
                                  <Badge className={`text-xs ${statusColors[charge.status] || ""}`}>
                                    {statusLabels[charge.status] || charge.status}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Maintenances */}
                      {property.maintenances.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Wrench className="h-4 w-4 text-purple-600" />
                            <span className="font-medium text-sm">Manutenções ({property.maintenances.length})</span>
                          </div>
                          <div className="space-y-1 pl-6">
                            {property.maintenances.map((maintenance) => (
                              <div
                                key={maintenance.id}
                                className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-muted/50 cursor-pointer"
                                onClick={() => navigate(`/manutencao/${maintenance.id}`)}
                              >
                                <span className="truncate flex-1">{maintenance.title}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium">
                                    {formatCurrency(maintenance.amount_cents)}
                                  </span>
                                  <Badge className={`text-xs ${statusColors[maintenance.status] || ""}`}>
                                    {statusLabels[maintenance.status] || maintenance.status}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Inspections */}
                      {property.inspections.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <ClipboardCheck className="h-4 w-4 text-green-600" />
                            <span className="font-medium text-sm">Vistorias ({property.inspections.length})</span>
                          </div>
                          <div className="space-y-1 pl-6">
                            {property.inspections.map((inspection) => (
                              <div
                                key={inspection.id}
                                className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-muted/50 cursor-pointer"
                                onClick={() => navigate(`/vistoria/${inspection.id}`)}
                              >
                                <span className="truncate flex-1">
                                  Vistoria de {formatDate(inspection.created_at)}
                                </span>
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {inspection.notes || "Sem observações"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {totalItems === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum item encontrado para esta propriedade
                        </p>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}

          {properties?.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhuma propriedade encontrada
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
}
