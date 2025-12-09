import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, 
  ArrowRight, 
  Building, 
  MessageSquare, 
  CreditCard,
  AlertCircle,
  Clock
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL } from "@/lib/format";

type Charge = {
  id: string;
  title: string;
  amount_cents: number;
  management_contribution_cents: number;
  due_date: string | null;
  status: string;
  created_at: string;
  payment_link_url: string | null;
  service_type: string | null;
  property: { name: string; cover_photo_url: string | null } | null;
  owner: { name: string } | null;
  _count?: { messages: number };
};

type KanbanColumn = {
  key: string;
  title: string;
  color: string;
  bgColor: string;
};

const columns: KanbanColumn[] = [
  { key: "pendente", title: "Pendentes", color: "text-yellow-600", bgColor: "bg-yellow-50 dark:bg-yellow-950/30" },
  { key: "vencida", title: "Vencidas", color: "text-red-600", bgColor: "bg-red-50 dark:bg-red-950/30" },
];

const SERVICE_TYPE_LABELS: Record<string, string> = {
  hidraulica: "Hidráulica",
  eletrica: "Elétrica",
  marcenaria: "Marcenaria",
  itens: "Itens",
  estrutural: "Estrutural",
  refrigeracao: "Refrigeração",
};

export function ChargesKanbanPreview() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwner = profile?.role === "owner";

  useEffect(() => {
    fetchCharges();
  }, []);

  const fetchCharges = async () => {
    try {
      let query = supabase
        .from("charges")
        .select(`
          id,
          title,
          amount_cents,
          management_contribution_cents,
          due_date,
          status,
          created_at,
          payment_link_url,
          service_type,
          property:properties(name, cover_photo_url),
          owner:profiles!charges_owner_id_fkey(name)
        `)
        .in("status", ["sent", "overdue"])
        .order("due_date", { ascending: true, nullsFirst: false });

      const { data, error } = await query;

      if (error) throw error;

      // Fetch message counts
      const enrichedCharges = await Promise.all(
        (data || []).map(async (charge) => {
          const { count } = await supabase
            .from("charge_messages")
            .select("id", { count: "exact", head: true })
            .eq("charge_id", charge.id);

          return {
            ...charge,
            _count: { messages: count || 0 },
          } as Charge;
        })
      );

      setCharges(enrichedCharges);
    } catch (error) {
      console.error("Error fetching charges:", error);
    } finally {
      setLoading(false);
    }
  };

  const getChargesForColumn = (columnKey: string) => {
    if (columnKey === "pendente") {
      return charges.filter((c) => {
        if (c.status !== "sent") return false;
        if (!c.due_date) return true;
        return !isPast(new Date(c.due_date));
      });
    }
    if (columnKey === "vencida") {
      return charges.filter((c) => {
        if (c.status === "overdue") return true;
        if (c.status === "sent" && c.due_date && isPast(new Date(c.due_date))) return true;
        return false;
      });
    }
    return [];
  };

  const getDueDateInfo = (due_date: string | null, status: string) => {
    if (!due_date) return null;
    
    const dueDate = new Date(due_date);
    const now = new Date();
    const daysLeft = differenceInDays(dueDate, now);
    const isOverdue = isPast(dueDate) || status === "overdue";
    
    let colorClass = "text-muted-foreground";
    let text = format(dueDate, "dd/MM", { locale: ptBR });
    
    if (isOverdue) {
      colorClass = "text-red-600";
      text = `Vencida há ${Math.abs(daysLeft)} dias`;
    } else if (daysLeft <= 2) {
      colorClass = "text-orange-600";
      text = `Vence em ${daysLeft}d`;
    } else if (daysLeft <= 7) {
      colorClass = "text-yellow-600";
      text = `Vence em ${daysLeft}d`;
    }
    
    return { text, colorClass };
  };

  const getDueAmount = (charge: Charge) => {
    return charge.amount_cents - (charge.management_contribution_cents || 0);
  };

  const totalPending = charges.length;
  const totalOverdue = charges.filter(c => 
    c.status === "overdue" || (c.status === "sent" && c.due_date && isPast(new Date(c.due_date)))
  ).length;

  if (loading) {
    return (
      <Card className="border-2 border-green-200 dark:border-green-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-green-200 dark:border-green-800">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <DollarSign className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Quadro de Cobranças</CardTitle>
            {totalPending > 0 && (
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                {totalPending} em aberto
              </Badge>
            )}
            {totalOverdue > 0 && (
              <Badge variant="destructive">
                {totalOverdue} vencidas
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(isOwner ? "/minhas-cobrancas" : "/gerenciar-cobrancas")}
            className="text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950 w-full sm:w-auto"
          >
            Ver todas
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {charges.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma cobrança pendente</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {columns.map((column) => {
              const columnCharges = getChargesForColumn(column.key);

              return (
                <div key={column.key} className={`rounded-lg p-2 ${column.bgColor}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold ${column.color}`}>
                      {column.title}
                    </span>
                    <Badge variant="outline" className="text-xs h-5 px-1.5">
                      {columnCharges.length}
                    </Badge>
                  </div>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2 pr-2">
                      {columnCharges.map((charge) => {
                        const dueDateInfo = getDueDateInfo(charge.due_date, charge.status);
                        const dueAmount = getDueAmount(charge);

                        return (
                          <div
                            key={charge.id}
                            onClick={() => navigate(`/cobranca/${charge.id}`)}
                            className="bg-card rounded p-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow text-xs"
                          >
                            {/* Property */}
                            <div className="flex items-center gap-1 mb-1">
                              {charge.property?.cover_photo_url ? (
                                <img
                                  src={charge.property.cover_photo_url}
                                  alt=""
                                  className="w-5 h-5 rounded object-cover"
                                />
                              ) : (
                                <Building className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-medium truncate flex-1">
                                {charge.property?.name || "Sem unidade"}
                              </span>
                            </div>

                            {/* Title */}
                            <p className="text-muted-foreground line-clamp-1 text-[10px] mb-1">
                              {charge.title}
                            </p>

                            {/* Service Type */}
                            {charge.service_type && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 mb-1">
                                {SERVICE_TYPE_LABELS[charge.service_type] || charge.service_type}
                              </Badge>
                            )}

                            {/* Amount */}
                            <div className="flex items-center justify-between mt-1">
                              <span className="font-bold text-green-600">
                                {formatBRL(dueAmount)}
                              </span>
                              {dueDateInfo && (
                                <span className={`text-[10px] ${dueDateInfo.colorClass}`}>
                                  {dueDateInfo.text}
                                </span>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-1 mt-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-[10px] h-6 px-2 relative"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/cobranca/${charge.id}`);
                                }}
                                title="Ver detalhes / Chat"
                              >
                                <MessageSquare className="h-3 w-3" />
                                {(charge._count?.messages || 0) > 0 && (
                                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[8px] rounded-full h-4 min-w-[16px] flex items-center justify-center px-1 font-bold">
                                    {charge._count?.messages || 0}
                                  </span>
                                )}
                              </Button>
                              
                              {isOwner && charge.payment_link_url && (
                                <Button
                                  size="sm"
                                  className="flex-1 text-[10px] h-6 px-1 bg-green-600 hover:bg-green-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(charge.payment_link_url!, "_blank");
                                  }}
                                >
                                  <CreditCard className="h-3 w-3 mr-1" />
                                  Pagar
                                </Button>
                              )}
                              
                              {!isOwner && (
                                <div className="flex-1 text-[10px] text-muted-foreground truncate">
                                  {charge.owner?.name}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {columnCharges.length === 0 && (
                        <p className="text-[10px] text-muted-foreground text-center py-2">
                          Nenhum item
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
