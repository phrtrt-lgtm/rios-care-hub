import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, differenceInDays, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building, Calendar, DollarSign, Percent, Clock, CheckCircle, AlertTriangle, Search } from "lucide-react";

interface PendingDebit {
  id: string;
  title: string;
  amount_cents: number;
  reserve_debit_date: string;
  reserve_commission_percent: number | null;
  reserve_base_commission_percent: number | null;
  reserve_extra_commission_percent: number | null;
  reserve_owner_value_cents: number | null;
  reserve_owner_receives_cents: number | null;
  property: {
    id: string;
    name: string;
    cover_photo_url: string | null;
  } | null;
  owner: {
    id: string;
    name: string;
    email: string;
  } | null;
}

const PendingReserveDebitsBoard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<PendingDebit | null>(null);
  const [newCommission, setNewCommission] = useState("");

  // Fetch pending reserve debits
  const { data: debits, isLoading } = useQuery({
    queryKey: ["pending-reserve-debits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select(`
          id,
          title,
          amount_cents,
          reserve_debit_date,
          reserve_commission_percent,
          reserve_base_commission_percent,
          reserve_extra_commission_percent,
          reserve_owner_value_cents,
          reserve_owner_receives_cents,
          property:properties(id, name, cover_photo_url),
          owner:profiles!charges_owner_id_fkey(id, name, email)
        `)
        .eq("status", "aguardando_reserva")
        .not("reserve_debit_date", "is", null)
        .order("reserve_debit_date", { ascending: true });

      if (error) throw error;
      return data as unknown as PendingDebit[];
    },
  });

  // Confirm debit mutation
  const confirmMutation = useMutation({
    mutationFn: async ({ id, newCommissionPercent }: { id: string; newCommissionPercent?: number }) => {
      const updateData: any = {
        status: "debited",
        debited_at: new Date().toISOString(),
      };

      // If new commission is provided, update it
      if (newCommissionPercent !== undefined) {
        updateData.reserve_commission_percent = newCommissionPercent;
      }

      const { error } = await supabase
        .from("charges")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      // Get charge details for notification
      const charge = debits?.find(d => d.id === id);
      if (charge?.owner?.id) {
        // Create notification for owner
        await supabase.from("notifications").insert({
          owner_id: charge.owner.id,
          title: "Débito Realizado",
          message: `O valor de R$ ${(charge.amount_cents / 100).toFixed(2)} foi debitado da reserva em ${charge.property?.name || "sua unidade"}.`,
          type: "charge",
          reference_id: id,
          reference_url: `/cobranca/${id}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-reserve-debits"] });
      toast.success("Débito confirmado e proprietário notificado!");
      setConfirmDialog(null);
      setNewCommission("");
    },
    onError: () => {
      toast.error("Erro ao confirmar débito");
    },
  });

  // Filter debits by search
  const filteredDebits = debits?.filter((d) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      d.title.toLowerCase().includes(searchLower) ||
      d.property?.name.toLowerCase().includes(searchLower) ||
      d.owner?.name.toLowerCase().includes(searchLower)
    );
  });

  // Group debits by urgency
  const overdueDebits = filteredDebits?.filter(d => isPast(new Date(d.reserve_debit_date)) && !isToday(new Date(d.reserve_debit_date))) || [];
  const todayDebits = filteredDebits?.filter(d => isToday(new Date(d.reserve_debit_date))) || [];
  const upcomingDebits = filteredDebits?.filter(d => {
    const date = new Date(d.reserve_debit_date);
    return !isPast(date) && !isToday(date);
  }) || [];

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);
  };

  const getUrgencyInfo = (debit: PendingDebit) => {
    const date = new Date(debit.reserve_debit_date);
    const days = differenceInDays(date, new Date());
    
    if (isPast(date) && !isToday(date)) {
      return { 
        label: "Atrasado", 
        color: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
        badgeVariant: "destructive" as const
      };
    }
    if (isToday(date)) {
      return { 
        label: "Hoje", 
        color: "bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400",
        badgeVariant: "default" as const
      };
    }
    if (days <= 3) {
      return { 
        label: `Em ${days} dia${days > 1 ? "s" : ""}`, 
        color: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
        badgeVariant: "secondary" as const
      };
    }
    return { 
      label: `Em ${days} dias`, 
      color: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400",
      badgeVariant: "outline" as const
    };
  };

  const openConfirmDialog = (debit: PendingDebit) => {
    setConfirmDialog(debit);
    setNewCommission(debit.reserve_commission_percent?.toString() || "");
  };

  const handleConfirm = () => {
    if (!confirmDialog) return;
    
    const newCommissionValue = newCommission ? parseFloat(newCommission) : undefined;
    confirmMutation.mutate({ 
      id: confirmDialog.id, 
      newCommissionPercent: newCommissionValue 
    });
  };

  const renderDebitCard = (debit: PendingDebit) => {
    const urgency = getUrgencyInfo(debit);
    
    return (
      <Card
        key={debit.id}
        className={`cursor-pointer hover:shadow-md transition-shadow border-2 ${urgency.color}`}
        onClick={() => navigate(`/cobranca/${debit.id}`)}
      >
        <CardContent className="p-4 space-y-3">
          {/* Property */}
          <div className="flex items-center gap-2">
            {debit.property?.cover_photo_url ? (
              <img
                src={debit.property.cover_photo_url}
                alt=""
                className="w-10 h-10 rounded object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                <Building className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium truncate block">
                {debit.property?.name || "Sem unidade"}
              </span>
              <span className="text-xs text-muted-foreground truncate block">
                {debit.owner?.name}
              </span>
            </div>
            <Badge variant={urgency.badgeVariant}>
              {urgency.label}
            </Badge>
          </div>

          <p className="text-sm line-clamp-2 font-medium">{debit.title}</p>

          {/* Check-in date */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>
              Check-in: {format(new Date(debit.reserve_debit_date), "dd/MM/yyyy", { locale: ptBR })}
            </span>
          </div>

          {/* Values */}
          <div className="grid grid-cols-2 gap-2 text-sm bg-muted/50 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Débito:</span>
              <span className="font-semibold">{formatCurrency(debit.amount_cents)}</span>
            </div>
            {debit.reserve_owner_value_cents && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Reserva:</span>
                <span className="font-medium">{formatCurrency(debit.reserve_owner_value_cents)}</span>
              </div>
            )}
          </div>

          {/* Commission info */}
          <div className="flex flex-wrap gap-2 text-xs">
            {debit.reserve_base_commission_percent && (
              <div className="flex items-center gap-1 bg-muted rounded px-2 py-1">
                <Percent className="h-3 w-3" />
                <span>Base: {debit.reserve_base_commission_percent}%</span>
              </div>
            )}
            {debit.reserve_extra_commission_percent !== null && debit.reserve_extra_commission_percent !== undefined && (
              <div className="flex items-center gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded px-2 py-1">
                <Percent className="h-3 w-3" />
                <span>Extra: +{debit.reserve_extra_commission_percent}%</span>
              </div>
            )}
            {debit.reserve_commission_percent && (
              <div className="flex items-center gap-1 bg-primary/10 text-primary rounded px-2 py-1 font-semibold">
                <Percent className="h-3 w-3" />
                <span>Nova: {debit.reserve_commission_percent}%</span>
              </div>
            )}
          </div>

          {/* Action button */}
          <Button
            size="sm"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              openConfirmDialog(debit);
            }}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Confirmar Débito
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-muted/50 rounded-lg p-4 animate-pulse h-64" />
        ))}
      </div>
    );
  }

  const totalDebits = (overdueDebits?.length || 0) + (todayDebits?.length || 0) + (upcomingDebits?.length || 0);

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por unidade, proprietário ou título..."
          className="pl-10"
        />
      </div>

      {totalDebits === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhum débito pendente</p>
          <p className="text-sm">Não há cobranças aguardando reserva no momento.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Overdue section */}
          {overdueDebits.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="font-semibold text-lg">
                  Atrasados ({overdueDebits.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {overdueDebits.map(renderDebitCard)}
              </div>
            </div>
          )}

          {/* Today section */}
          {todayDebits.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-orange-500" />
                <h3 className="font-semibold text-lg">
                  Hoje ({todayDebits.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {todayDebits.map(renderDebitCard)}
              </div>
            </div>
          )}

          {/* Upcoming section */}
          {upcomingDebits.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-blue-500" />
                <h3 className="font-semibold text-lg">
                  Próximos ({upcomingDebits.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingDebits.map(renderDebitCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Débito em Reserva</DialogTitle>
            <DialogDescription>
              Confirme que a comissão foi alterada no Airbnb e o débito está pronto para ser aplicado.
            </DialogDescription>
          </DialogHeader>
          {confirmDialog && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="font-medium">{confirmDialog.title}</p>
                <p className="text-sm text-muted-foreground">
                  {confirmDialog.property?.name} • {confirmDialog.owner?.name}
                </p>
                <p className="text-lg font-semibold mt-2">
                  {formatCurrency(confirmDialog.amount_cents)}
                </p>
              </div>

              <div className="space-y-3 bg-amber-500/10 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-amber-600" />
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    Comissão Original: {confirmDialog.reserve_base_commission_percent || "-"}%
                  </span>
                </div>
                {confirmDialog.reserve_extra_commission_percent !== null && (
                  <div className="text-sm text-amber-600">
                    + {confirmDialog.reserve_extra_commission_percent}% extra = {((confirmDialog.reserve_base_commission_percent || 0) + (confirmDialog.reserve_extra_commission_percent || 0))}% total esperado
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="newCommission">
                  Nova Comissão Configurada no Airbnb (%)
                </Label>
                <Input
                  id="newCommission"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={newCommission}
                  onChange={(e) => setNewCommission(e.target.value)}
                  placeholder="Ex: 18.5"
                />
                <p className="text-xs text-muted-foreground">
                  Informe o valor da comissão que você configurou no Airbnb para esta reserva.
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmDialog(null)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleConfirm}
                  disabled={confirmMutation.isPending}
                >
                  {confirmMutation.isPending ? "Confirmando..." : "Confirmar Débito"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PendingReserveDebitsBoard;
