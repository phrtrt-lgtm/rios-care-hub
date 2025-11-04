import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface MaintenanceFilters {
  ownerId?: string;
  propertyId?: string;
  status?: string;
  category?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

export interface MaintenanceFormData {
  id?: string;
  owner_id: string;
  property_id?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  status?: string;
  cost_total_cents: number;
  cost_responsible: 'owner' | 'management' | 'split';
  split_owner_percent?: number | null;
  due_at?: string | null;
}

export interface PaymentFormData {
  maintenance_id: string;
  amount_cents: number;
  payment_date?: string;
  method?: string;
  applies_to?: 'total' | 'owner_share' | 'management_share';
  proof_file_url?: string | null;
  note?: string | null;
}

export const useMaintenances = (filters?: MaintenanceFilters) => {
  return useQuery({
    queryKey: ["maintenances", filters],
    queryFn: async () => {
      let query = supabase
        .from("maintenances")
        .select(`
          *,
          property:properties(id, name),
          owner:profiles!maintenances_owner_id_fkey(id, name),
          payments:maintenance_payments(amount_cents)
        `)
        .order("opened_at", { ascending: false });

      if (filters?.ownerId) {
        query = query.eq("owner_id", filters.ownerId);
      }
      if (filters?.propertyId) {
        query = query.eq("property_id", filters.propertyId);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.category) {
        query = query.eq("category", filters.category);
      }
      if (filters?.fromDate) {
        query = query.gte("opened_at", filters.fromDate);
      }
      if (filters?.toDate) {
        query = query.lte("opened_at", filters.toDate);
      }
      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data.map((m: any) => ({
        ...m,
        paid_cents: m.payments?.reduce((sum: number, p: any) => sum + (p.amount_cents || 0), 0) || 0,
      }));
    },
  });
};

export const useMaintenance = (id?: string) => {
  return useQuery({
    queryKey: ["maintenance", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("maintenances")
        .select(`
          *,
          property:properties(id, name),
          owner:profiles!maintenances_owner_id_fkey(id, name, email),
          payments:maintenance_payments(*),
          attachments:maintenance_attachments(*),
          events:maintenance_events(*)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
};

export const useMaintenanceSummary = (ownerId?: string, year?: number) => {
  const currentYear = year || new Date().getFullYear();
  
  return useQuery({
    queryKey: ["maintenance-summary", ownerId, currentYear],
    queryFn: async () => {
      let query = supabase
        .from("maintenances")
        .select("*")
        .gte("opened_at", `${currentYear}-01-01`)
        .lte("opened_at", `${currentYear}-12-31`);

      if (ownerId) {
        query = query.eq("owner_id", ownerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const openCount = data.filter(m => ['open', 'in_progress'].includes(m.status)).length;
      const completedCount = data.filter(m => m.status === 'completed').length;
      const paidCount = data.filter(m => m.status === 'paid').length;
      const totalCents = data.reduce((sum, m) => sum + (m.cost_total_cents || 0), 0);
      const avgOrderCents = data.length > 0 ? totalCents / data.length : 0;

      // Próximos pagamentos (30 dias)
      const today = new Date();
      const next30Days = new Date(today);
      next30Days.setDate(today.getDate() + 30);

      const nextPayments = data
        .filter(m => m.due_at && new Date(m.due_at) >= today && new Date(m.due_at) <= next30Days)
        .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

      return {
        openCount,
        completedCount,
        paidCount,
        totalCents,
        avgOrderCents,
        nextPayments,
      };
    },
  });
};

export const useUpsertMaintenance = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: MaintenanceFormData) => {
      // Validações
      if (data.cost_responsible === 'split' && (data.split_owner_percent == null)) {
        throw new Error('Percentual do proprietário é obrigatório quando dividido');
      }
      if (data.cost_responsible !== 'split') {
        data.split_owner_percent = null;
      }

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Não autenticado');

      const payload = {
        owner_id: data.owner_id,
        property_id: data.property_id || null,
        title: data.title,
        description: data.description || null,
        category: data.category || null,
        status: data.status || 'open',
        cost_total_cents: data.cost_total_cents,
        cost_responsible: data.cost_responsible,
        split_owner_percent: data.split_owner_percent,
        due_at: data.due_at || null,
        created_by: user.user.id,
      };

      if (data.id) {
        // Update
        const { data: result, error } = await supabase
          .from("maintenances")
          .update(payload)
          .eq("id", data.id)
          .select()
          .single();

        if (error) throw error;

        // Event
        await supabase.from("maintenance_events").insert({
          maintenance_id: data.id,
          event_type: 'updated',
          metadata: payload,
          actor_id: user.user.id,
        });

        return result;
      } else {
        // Create
        const { data: result, error } = await supabase
          .from("maintenances")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        // Event
        await supabase.from("maintenance_events").insert({
          maintenance_id: result.id,
          event_type: 'created',
          metadata: payload,
          actor_id: user.user.id,
        });

        return result;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-summary"] });
      toast({
        title: "Sucesso",
        description: "Manutenção salva com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao salvar manutenção",
        variant: "destructive",
      });
    },
  });
};

export const useAddPayment = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Não autenticado');

      // Inserir pagamento
      const { data: payment, error: payError } = await supabase
        .from("maintenance_payments")
        .insert({
          maintenance_id: data.maintenance_id,
          amount_cents: data.amount_cents,
          payment_date: data.payment_date || new Date().toISOString(),
          method: data.method || 'pix',
          applies_to: data.applies_to || 'total',
          proof_file_url: data.proof_file_url || null,
          note: data.note || null,
          created_by: user.user.id,
        })
        .select()
        .single();

      if (payError) throw payError;

      // Event
      await supabase.from("maintenance_events").insert({
        maintenance_id: data.maintenance_id,
        event_type: 'payment_added',
        metadata: { amount_cents: data.amount_cents, method: data.method },
        actor_id: user.user.id,
      });

      // Verificar se já está totalmente pago
      const { data: maintenance } = await supabase
        .from("maintenances")
        .select("cost_total_cents, status")
        .eq("id", data.maintenance_id)
        .single();

      const { data: payments } = await supabase
        .from("maintenance_payments")
        .select("amount_cents")
        .eq("maintenance_id", data.maintenance_id);

      const totalPaid = payments?.reduce((sum, p) => sum + p.amount_cents, 0) || 0;

      if (maintenance && totalPaid >= maintenance.cost_total_cents && maintenance.status !== 'paid') {
        await supabase
          .from("maintenances")
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq("id", data.maintenance_id);

        await supabase.from("maintenance_events").insert({
          maintenance_id: data.maintenance_id,
          event_type: 'status_changed',
          metadata: { from: maintenance.status, to: 'paid' },
          actor_id: user.user.id,
        });
      }

      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-summary"] });
      toast({
        title: "Sucesso",
        description: "Pagamento registrado com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao registrar pagamento",
        variant: "destructive",
      });
    },
  });
};

export const useMaintenanceCharts = (ownerId?: string, year?: number, propertyId?: string) => {
  const currentYear = year || new Date().getFullYear();

  return useQuery({
    queryKey: ["maintenance-charts", ownerId, currentYear, propertyId],
    queryFn: async () => {
      let query = supabase
        .from("maintenances")
        .select("*")
        .gte("opened_at", `${currentYear}-01-01`)
        .lte("opened_at", `${currentYear}-12-31`);

      if (ownerId) query = query.eq("owner_id", ownerId);
      if (propertyId) query = query.eq("property_id", propertyId);

      const { data, error } = await query;
      if (error) throw error;

      // Barras mensais
      const monthly = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        total_cents: 0,
      }));

      data.forEach(m => {
        const month = new Date(m.opened_at).getMonth();
        monthly[month].total_cents += m.cost_total_cents || 0;
      });

      // Pizza por responsável
      const pieData: Record<string, number> = {};
      data.forEach(m => {
        const key = m.cost_responsible;
        pieData[key] = (pieData[key] || 0) + (m.cost_total_cents || 0);
      });

      const pie = Object.entries(pieData).map(([name, value]) => ({
        name,
        value,
      }));

      // Linha acumulada
      const line = monthly.map((m, idx) => ({
        month: m.month,
        ytd_cents: monthly.slice(0, idx + 1).reduce((sum, item) => sum + item.total_cents, 0),
      }));

      return { monthly, pie, line };
    },
  });
};
