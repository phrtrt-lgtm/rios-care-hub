import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, ArrowRight, Clock, User, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type MaintenanceTicket = {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  property: { name: string } | null;
  service_provider: { name: string; phone: string } | null;
};

type KanbanColumn = {
  key: string;
  title: string;
  color: string;
  bgColor: string;
};

const columns: KanbanColumn[] = [
  { key: "pendente", title: "Pendente", color: "text-yellow-600", bgColor: "bg-yellow-50 dark:bg-yellow-950/30" },
  { key: "agendado", title: "Agendado", color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30" },
  { key: "em_execucao", title: "Em Execução", color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950/30" },
  { key: "concluido", title: "Concluído", color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-950/30" },
];

const MAX_ITEMS_PER_COLUMN = 2;

export function MaintenanceKanbanPreview() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMaintenanceTickets();
  }, []);

  const fetchMaintenanceTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          status,
          created_at,
          scheduled_at,
          property:properties(name),
          service_provider:service_providers(name, phone)
        `)
        .eq("ticket_type", "manutencao")
        .neq("status", "cancelado")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error("Error fetching maintenance tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const getColumnStatus = (columnKey: string): string[] => {
    switch (columnKey) {
      case "pendente":
        return ["novo", "em_analise", "aguardando_info"];
      case "agendado":
        return ["em_execucao"];
      case "em_execucao":
        return ["em_execucao"];
      case "concluido":
        return ["concluido"];
      default:
        return [];
    }
  };

  const getTicketsForColumn = (columnKey: string) => {
    if (columnKey === "pendente") {
      return tickets.filter(
        (t) =>
          ["novo", "em_analise", "aguardando_info"].includes(t.status) &&
          !t.scheduled_at
      );
    }
    if (columnKey === "agendado") {
      return tickets.filter(
        (t) =>
          t.scheduled_at &&
          t.status !== "concluido"
      );
    }
    if (columnKey === "em_execucao") {
      return tickets.filter(
        (t) =>
          t.status === "em_execucao" &&
          t.scheduled_at
      );
    }
    if (columnKey === "concluido") {
      return tickets.filter((t) => t.status === "concluido");
    }
    return [];
  };

  const totalPending = tickets.filter(
    (t) =>
      ["novo", "em_analise", "aguardando_info", "em_execucao"].includes(t.status) &&
      t.status !== "concluido"
  ).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Don't show if no maintenance tickets
  if (tickets.length === 0) {
    return null;
  }

  return (
    <Card className="border-2 border-purple-200 dark:border-purple-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">Quadro de Manutenções</CardTitle>
            {totalPending > 0 && (
              <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                {totalPending} em aberto
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/manutencoes")}
            className="text-purple-600 border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950"
          >
            Ver quadro completo
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {columns.map((column) => {
            const columnTickets = getTicketsForColumn(column.key);
            const displayTickets = columnTickets.slice(0, MAX_ITEMS_PER_COLUMN);
            const hasMore = columnTickets.length > MAX_ITEMS_PER_COLUMN;

            return (
              <div key={column.key} className={`rounded-lg p-2 ${column.bgColor}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold ${column.color}`}>
                    {column.title}
                  </span>
                  <Badge variant="outline" className="text-xs h-5 px-1.5">
                    {columnTickets.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {displayTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                      className="bg-card rounded p-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow text-xs"
                    >
                      <p className="font-medium line-clamp-1 mb-1">
                        {ticket.property?.name || "Sem unidade"}
                      </p>
                      <p className="text-muted-foreground line-clamp-1 text-[10px]">
                        {ticket.subject}
                      </p>
                      {ticket.scheduled_at && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-600">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(ticket.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
                        </div>
                      )}
                      {ticket.service_provider && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-purple-600">
                          <User className="h-3 w-3" />
                          {ticket.service_provider.name}
                        </div>
                      )}
                    </div>
                  ))}
                  {columnTickets.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-2">
                      Nenhum item
                    </p>
                  )}
                  {hasMore && (
                    <p className="text-[10px] text-center text-muted-foreground">
                      +{columnTickets.length - MAX_ITEMS_PER_COLUMN} mais
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
