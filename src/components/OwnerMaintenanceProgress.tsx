import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Wrench, Calendar, Clock, CheckCircle2, Building2, MessageSquare, ChevronRight } from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useChatPreloader } from "@/hooks/useChatPreloader";
import { MaintenanceChatDialog } from "@/components/MaintenanceChatDialog";

interface MaintenanceTicket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  property: {
    id: string;
    name: string;
    cover_photo_url: string | null;
  } | null;
}

const STATUS_CONFIG = {
  novo: { label: "Pendente", color: "bg-amber-500", step: 1 },
  em_analise: { label: "Em Análise", color: "bg-amber-500", step: 1 },
  aguardando_info: { label: "Aguardando Info", color: "bg-amber-500", step: 1 },
  em_execucao: { label: "Em Execução", color: "bg-purple-500", step: 3 },
  concluido: { label: "Concluído", color: "bg-green-500", step: 4 },
  cancelado: { label: "Cancelado", color: "bg-gray-500", step: 0 },
};

export function OwnerMaintenanceProgress() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceTicket | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const { data: maintenances, isLoading } = useQuery({
    queryKey: ["owner-maintenances", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          status,
          created_at,
          scheduled_at,
          cost_responsible,
          property:properties(id, name, cover_photo_url)
        `)
        .eq("owner_id", user.id)
        .eq("ticket_type", "manutencao")
        .or("cost_responsible.is.null,cost_responsible.neq.guest")
        .in("status", ["novo", "em_analise", "aguardando_info", "em_execucao"])
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as unknown as MaintenanceTicket[];
    },
    enabled: !!user,
  });

  const ticketIds = maintenances?.map((t) => t.id) || [];
  const { unreadCounts, markAsRead } = useUnreadMessages(ticketIds);
  useChatPreloader(ticketIds);

  const handleOpenChat = (ticket: MaintenanceTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTicket(ticket);
    setChatOpen(true);
    markAsRead(ticket.id);
  };

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!maintenances || maintenances.length === 0) {
    return null;
  }

  const getStep = (ticket: MaintenanceTicket) => {
    // If has scheduled_at and not in execution, it's step 2 (Agendado)
    if (ticket.scheduled_at && !["em_execucao", "concluido"].includes(ticket.status)) {
      return 2;
    }
    return STATUS_CONFIG[ticket.status as keyof typeof STATUS_CONFIG]?.step || 1;
  };

  const steps = [
    { label: "Pendente", icon: Clock },
    { label: "Agendado", icon: Calendar },
    { label: "Em Execução", icon: Wrench },
    { label: "Concluído", icon: CheckCircle2 },
  ];

  return (
    <>
      <Card className="mb-6 overflow-hidden border-primary/20">
        <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              Manutenções em Andamento
            </CardTitle>
            <Badge variant="secondary" className="font-medium">
              {maintenances.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-4">
            {maintenances.map((ticket) => {
              const currentStep = getStep(ticket);
              const unreadCount = unreadCounts[ticket.id] || 0;

              return (
                <div
                  key={ticket.id}
                  className="p-4 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors group"
                  onClick={() => navigate(`/ticket-detalhes/${ticket.id}`)}
                >
                  <div className="flex items-start gap-3 mb-4">
                    {/* Property photo */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {ticket.property?.cover_photo_url ? (
                        <img
                          src={ticket.property.cover_photo_url}
                          alt={ticket.property.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Building2 className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                        {ticket.subject}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {ticket.property?.name}
                      </p>
                      {ticket.scheduled_at && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Agendado: {format(new Date(ticket.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </div>

                    {/* Chat button */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 relative gap-1.5"
                        onClick={(e) => handleOpenChat(ticket, e)}
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span className="text-xs">Mensagens</span>
                        {unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>

                  {/* Progress Steps */}
                  <div className="flex items-center justify-between relative">
                    {/* Progress line */}
                    <div className="absolute top-4 left-0 right-0 h-0.5 bg-muted" />
                    <div 
                      className="absolute top-4 left-0 h-0.5 bg-primary transition-all"
                      style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
                    />

                    {steps.map((step, index) => {
                      const stepNumber = index + 1;
                      const isActive = currentStep === stepNumber;
                      const isComplete = currentStep > stepNumber;
                      const Icon = step.icon;

                      return (
                        <div key={step.label} className="flex flex-col items-center relative z-10">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                              isActive
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                                : isComplete
                                ? "bg-primary/20 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <span
                            className={`text-[10px] mt-1 ${
                              isActive ? "text-primary font-medium" : "text-muted-foreground"
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <MaintenanceChatDialog
        open={chatOpen}
        onOpenChange={(open) => {
          setChatOpen(open);
          if (!open) setSelectedTicket(null);
        }}
        ticketId={selectedTicket?.id || null}
        ticketSubject={selectedTicket?.subject || ""}
        propertyName={selectedTicket?.property?.name || ""}
      />
    </>
  );
}
