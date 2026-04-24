import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface MaintenanceFilters {
  ownerId?: string;
  propertyId?: string;
  status?: string;
  category?: string;
  serviceType?: string;
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
  cost_responsible: 'owner' | 'management';
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
      if (filters?.serviceType) {
        query = query.eq("service_type", filters.serviceType);
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
  return useQuery<any>({
    queryKey: ["maintenance", id],
    queryFn: async (): Promise<any> => {
      if (!id) return null;

      // 1) Try as charge first (existing behavior)
      const { data: charge } = await supabase
        .from("charges")
        .select(`
          *,
          property:properties(id, name),
          owner:profiles!charges_owner_id_fkey(id, name, email)
        `)
        .eq("id", id)
        .maybeSingle();

      if (charge) {
        const { data: payments } = await supabase
          .from("charge_payments")
          .select("*")
          .eq("charge_id", id)
          .order("payment_date", { ascending: false });

        const { data: rawAttachments } = await supabase
          .from("charge_attachments")
          .select("*")
          .eq("charge_id", id)
          .order("created_at", { ascending: false });

        // Normalize attachment shape (file_url via serve-attachment edge fn)
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const attachments = (rawAttachments || []).map((a: any) => ({
          ...a,
          file_url: `${supabaseUrl}/functions/v1/serve-attachment/${a.id}/file`,
          poster_url: a.poster_path
            ? `${supabaseUrl}/functions/v1/serve-attachment/${a.id}/poster`
            : null,
          file_type: a.mime_type_override || a.mime_type,
          size_bytes: a.file_size,
        }));

        const paid_cents = payments?.reduce((sum, p) => sum + p.amount_cents, 0) || 0;

        return { ...charge, source: "charge" as const, payments, attachments, paid_cents };
      }

      // 2) Fallback to ticket (maintenance created by team without a charge yet)
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          description,
          status,
          created_at,
          owner_id,
          property_id,
          ticket_type,
          scheduled_at,
          cost_responsible,
          property:properties(id, name),
          owner:profiles!tickets_owner_id_fkey(id, name, email)
        `)
        .eq("id", id)
        .maybeSingle();

      if (ticketError) throw ticketError;
      if (!ticket) return null;

      // Look for a linked charge (when maintenance is finalized with a charge)
      const { data: linkedCharge } = await supabase
        .from("charges")
        .select("id, amount_cents, management_contribution_cents, status, paid_at, contested_at, debited_at, due_date")
        .eq("ticket_id", id)
        .maybeSingle();

      // Fetch ticket attachments — anexos podem estar ligados pelo ticket_id OU
      // pelo message_id (mensagens daquele ticket). Buscar ambos e mesclar.
      const [{ data: directAtt }, { data: msgRows }] = await Promise.all([
        supabase
          .from("ticket_attachments" as any)
          .select("*")
          .eq("ticket_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("ticket_messages" as any)
          .select("id")
          .eq("ticket_id", id),
      ]);

      let viaMessages: any[] = [];
      const messageIds = (msgRows || []).map((m: any) => m.id);
      if (messageIds.length > 0) {
        const { data: msgAtt } = await supabase
          .from("ticket_attachments" as any)
          .select("*")
          .in("message_id", messageIds)
          .order("created_at", { ascending: false });
        viaMessages = msgAtt || [];
      }

      // De-duplicar por id
      const merged = new Map<string, any>();
      [...(directAtt || []), ...viaMessages].forEach((a: any) => {
        if (!merged.has(a.id)) merged.set(a.id, a);
      });

      const attachments = Array.from(merged.values()).map((a: any) => ({
        id: a.id,
        file_name: a.file_name || a.name || 'Anexo',
        file_url: a.file_url,
        file_type: a.file_type || a.mime_type,
        size_bytes: a.size_bytes ?? a.file_size ?? null,
      }));

      let payments: any[] = [];
      let paid_cents = 0;
      if (linkedCharge?.id) {
        const { data: pays } = await supabase
          .from("charge_payments")
          .select("*")
          .eq("charge_id", linkedCharge.id)
          .order("payment_date", { ascending: false });
        payments = pays || [];
        paid_cents = payments.reduce((s, p) => s + p.amount_cents, 0);
      }

      return {
        id: ticket.id,
        source: "ticket" as const,
        title: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        created_at: ticket.created_at,
        owner_id: ticket.owner_id,
        property_id: ticket.property_id,
        property: ticket.property,
        owner: ticket.owner,
        ticket_id: ticket.id,
        charge_id: linkedCharge?.id ?? null,
        amount_cents: linkedCharge?.amount_cents ?? 0,
        management_contribution_cents: linkedCharge?.management_contribution_cents ?? 0,
        due_date: linkedCharge?.due_date ?? null,
        paid_at: linkedCharge?.paid_at ?? null,
        contested_at: linkedCharge?.contested_at ?? null,
        debited_at: linkedCharge?.debited_at ?? null,
        category: null,
        attachments,
        payments,
        paid_cents,
      };
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
      const totalCents = data.reduce((sum, m) => sum + ((m.amount_cents || 0) - (m.management_contribution_cents || 0)), 0);
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
        split_owner_percent: null,
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

export const useMaintenanceCharts = (ownerId?: string, year?: number, propertyId?: string, serviceType?: string) => {
  const currentYear = year || new Date().getFullYear();

  return useQuery({
    queryKey: ["maintenance-charts", ownerId, currentYear, propertyId, serviceType],
    queryFn: async () => {
      let query = supabase
        .from("charges")
        .select("*")
        .is("archived_at", null)
        .gte("created_at", `${currentYear}-01-01`)
        .lte("created_at", `${currentYear}-12-31`);

      if (ownerId) query = query.eq("owner_id", ownerId);
      if (propertyId) query = query.eq("property_id", propertyId);
      if (serviceType) query = query.eq("service_type", serviceType);

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
