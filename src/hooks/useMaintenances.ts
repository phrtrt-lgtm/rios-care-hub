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
  proof_file?: File | null;
  proof_file_url?: string | null;
  note?: string | null;
}

export const useMaintenances = (filters?: MaintenanceFilters) => {
  return useQuery({
    queryKey: ["maintenances", filters],
    queryFn: async () => {
      let query = supabase
        .from("charges")
        .select(`
          *,
          property:properties(id, name),
          owner:profiles!charges_owner_id_fkey(id, name)
        `)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

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
        query = query.gte("created_at", filters.fromDate);
      }
      if (filters?.toDate) {
        query = query.lte("created_at", filters.toDate);
      }
      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Enrich with paid amounts from charge_payments
      const enriched = await Promise.all(
        (data || []).map(async (charge) => {
          const { data: payments } = await supabase
            .from("charge_payments")
            .select("amount_cents")
            .eq("charge_id", charge.id);
          
          const paid_cents = payments?.reduce((sum, p) => sum + p.amount_cents, 0) || 0;
          return { ...charge, paid_cents };
        })
      );

      return enriched;
    },
  });
};

export const useMaintenance = (id?: string) => {
  return useQuery({
    queryKey: ["maintenance", id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data: charge, error } = await supabase
        .from("charges")
        .select(`
          *,
          property:properties(id, name),
          owner:profiles!charges_owner_id_fkey(id, name, email)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      // Fetch payments from charge_payments
      const { data: payments } = await supabase
        .from("charge_payments")
        .select("*")
        .eq("charge_id", id)
        .order("payment_date", { ascending: false });

      // Fetch attachments
      const { data: attachments } = await supabase
        .from("charge_attachments")
        .select("*")
        .eq("charge_id", id)
        .order("created_at", { ascending: false });

      const paid_cents = payments?.reduce((sum, p) => sum + p.amount_cents, 0) || 0;

      return { ...charge, payments, attachments, paid_cents };
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
        .from("charges")
        .select("*")
        .is("archived_at", null)
        .gte("created_at", `${currentYear}-01-01`)
        .lte("created_at", `${currentYear}-12-31`);

      if (ownerId) {
        query = query.eq("owner_id", ownerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const openCount = data.filter(m => ['draft', 'pending'].includes(m.status)).length;
      const completedCount = data.filter(m => m.status === 'paid').length;
      const paidCount = data.filter(m => m.status === 'paid').length;
      const totalCents = data.reduce((sum, m) => sum + (m.amount_cents || 0), 0);
      const avgOrderCents = data.length > 0 ? totalCents / data.length : 0;

      // Próximos pagamentos (30 dias)
      const today = new Date();
      const next30Days = new Date(today);
      next30Days.setDate(today.getDate() + 30);

      const nextPayments = data
        .filter(m => m.due_date && new Date(m.due_date) >= today && new Date(m.due_date) <= next30Days)
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

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
        status: data.status || 'draft',
        amount_cents: data.cost_total_cents,
        cost_responsible: data.cost_responsible,
        split_owner_percent: data.split_owner_percent,
        due_date: data.due_at || null,
      };

      if (data.id) {
        // Update
        const { data: result, error } = await supabase
          .from("charges")
          .update(payload)
          .eq("id", data.id)
          .select()
          .single();

        if (error) throw error;
        return result;
      } else {
        // Create
        const { data: result, error } = await supabase
          .from("charges")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        return result;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["charges"] });
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

      // Upload do comprovante se fornecido
      let proofPath: string | null = null;
      if (data.proof_file) {
        const fileExt = data.proof_file.name.split('.').pop();
        const fileName = `${user.user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('maintenance-payment-proofs')
          .upload(fileName, data.proof_file);

        if (uploadError) {
          console.error('Error uploading proof:', uploadError);
        } else {
          proofPath = fileName;
        }
      }

      // Inserir pagamento em charge_payments
      const { error: payError } = await supabase
        .from("charge_payments")
        .insert({
          charge_id: data.maintenance_id,
          amount_cents: data.amount_cents,
          payment_date: data.payment_date || new Date().toISOString(),
          method: data.method || 'pix',
          applies_to: data.applies_to || 'total',
          proof_file_url: proofPath,
          note: data.note || null,
          created_by: user.user.id,
        });

      if (payError) throw payError;

      // Verificar se já está totalmente pago
      const { data: charge } = await supabase
        .from("charges")
        .select("amount_cents, status")
        .eq("id", data.maintenance_id)
        .single();

      const { data: payments } = await supabase
        .from("charge_payments")
        .select("amount_cents")
        .eq("charge_id", data.maintenance_id);

      const totalPaid = payments?.reduce((sum, p) => sum + p.amount_cents, 0) || 0;

      if (charge && totalPaid >= charge.amount_cents && charge.status !== 'paid') {
        await supabase
          .from("charges")
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq("id", data.maintenance_id);
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["charges"] });
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
        .from("charges")
        .select("*")
        .is("archived_at", null)
        .gte("created_at", `${currentYear}-01-01`)
        .lte("created_at", `${currentYear}-12-31`);

      if (ownerId) query = query.eq("owner_id", ownerId);
      if (propertyId) query = query.eq("property_id", propertyId);

      const { data, error } = await query;
      if (error) throw error;

      // Barras mensais com split proprietário/gestão
      const monthly = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        total_cents: 0,
        owner_cents: 0,
        management_cents: 0,
      }));

      data.forEach(m => {
        const month = new Date(m.created_at).getMonth();
        const total = m.amount_cents || 0;
        const mgmt = m.management_contribution_cents || 0;
        monthly[month].total_cents += total;
        monthly[month].management_cents += mgmt;
        monthly[month].owner_cents += (total - mgmt);
      });

      // Pizza por responsável
      const pieData: Record<string, number> = {
        owner: 0,
        management: 0,
        split: 0,
      };
      
      data.forEach(m => {
        const totalCents = m.amount_cents || 0;
        const managementCents = m.management_contribution_cents || 0;
        const ownerCents = totalCents - managementCents;
        
        // Sempre adiciona o aporte da gestão se existir
        if (managementCents > 0) {
          pieData.management += managementCents;
        }
        
        // Adiciona o valor do proprietário baseado no cost_responsible
        if (m.cost_responsible === 'owner') {
          pieData.owner += ownerCents;
        } else if (m.cost_responsible === 'management') {
          // Se a gestão é responsável, nada vai para o proprietário
          // O valor já foi adicionado ao management acima
        } else if (m.cost_responsible === 'split') {
          pieData.split += ownerCents;
        } else {
          // Padrão: adiciona ao owner
          pieData.owner += ownerCents;
        }
      });

      // Filtrar apenas valores maiores que zero
      const pie = Object.entries(pieData)
        .filter(([_, value]) => value > 0)
        .map(([name, value]) => ({
          name,
          value,
        }));

      // Linha acumulada (apenas parte do proprietário)
      const line = monthly.map((m, idx) => ({
        month: m.month,
        ytd_cents: monthly.slice(0, idx + 1).reduce((sum, item) => sum + item.owner_cents, 0),
      }));

      return { monthly, pie, line };
    },
  });
};
