import { useQuery } from "@tanstack/react-query";
import { addDays, differenceInDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/** Dias entre o check-out e o momento em que a cobrança ao hóspede pode ser feita. */
export const DIAS_PARA_COBRAR_HOSPEDE = 14;

export interface GuestChargeItem {
  /** id do ticket de manutenção */
  id: string;
  /** id da cobrança já gerada para o ticket, se houver */
  charge_id: string | null;
  subject: string;
  property_name: string;
  guest_checkout_date: string | null;
  /** Valor a cobrar do hóspede: o da cobrança gerada ou o rascunho do ticket. */
  amount_cents: number | null;
  /** Manutenção já feita (ticket concluído; saiu da lista de manutenções). */
  feita: boolean;
  attachments_count: number;
  /** Dia a partir do qual dá para cobrar (check-out + 14), "aaaa-mm-dd". */
  cobrar_a_partir_de: string | null;
  /** null quando não há data de check-out */
  days_until_charge: number | null;
  grupo: "pronta" | "em_breve" | "sem_data";
}

const STATUS_ENCERRADOS = new Set([
  "pago_antecipado",
  "pago_no_vencimento",
  "pago_com_atraso",
  "arquivado",
  "cancelled",
  "debited",
]);

/**
 * Manutenções cujo custo é do hóspede e que ainda precisam ser cobradas.
 *
 * Três grupos:
 * - pronta: passaram 14 dias do check-out, já dá para cobrar;
 * - em_breve: check-out recente (ou futuro), ainda dentro da janela;
 * - sem_data: ninguém informou o check-out — antes eram descartadas em silêncio
 *   e nunca apareciam no painel; agora aparecem para alguém preencher.
 *
 * Usa React Query com chave fixa: o resumo do topo e o lembrete compartilham
 * a mesma busca.
 */
export function useGuestCharges() {
  return useQuery({
    queryKey: ["painel", "guest-charges"],
    staleTime: 60_000,
    queryFn: async (): Promise<GuestChargeItem[]> => {
      const { data: tickets, error } = await supabase
        .from("tickets")
        .select(
          "id, subject, status, guest_checkout_date, charge_draft_amount_cents, ticket_attachments(count), properties!tickets_property_id_fkey(name)",
        )
        .eq("ticket_type", "manutencao")
        .eq("cost_responsible", "guest")
        .is("guest_charge_dismissed_at", null)
        .in("status", ["novo", "em_analise", "aguardando_info", "em_execucao", "concluido"]);
      if (error) throw error;

      const ids = (tickets || []).map((t) => t.id);
      const cobrancaPorTicket = new Map<string, { id: string; status: string | null; amount_cents: number | null }>();
      if (ids.length > 0) {
        const { data: charges } = await supabase
          .from("charges")
          .select("id, ticket_id, status, amount_cents, created_at")
          .in("ticket_id", ids)
          .order("created_at", { ascending: true });
        // Ordenado por criação: a mais recente sobrescreve as anteriores.
        (charges || []).forEach((c) => {
          if (c.ticket_id) cobrancaPorTicket.set(c.ticket_id, { id: c.id, status: c.status, amount_cents: c.amount_cents });
        });
      }

      const hoje = new Date();
      const itens: GuestChargeItem[] = [];

      for (const t of tickets || []) {
        const cobranca = cobrancaPorTicket.get(t.id);
        if (cobranca?.status && STATUS_ENCERRADOS.has(cobranca.status)) continue;

        const base = {
          id: t.id,
          charge_id: cobranca?.id ?? null,
          subject: t.subject,
          property_name: (t.properties as { name?: string } | null)?.name || "Imóvel desconhecido",
          guest_checkout_date: t.guest_checkout_date,
          amount_cents: cobranca?.amount_cents || t.charge_draft_amount_cents || null,
          feita: t.status === "concluido",
          attachments_count: (t.ticket_attachments as { count: number }[] | null)?.[0]?.count ?? 0,
        };

        if (!t.guest_checkout_date) {
          itens.push({ ...base, cobrar_a_partir_de: null, days_until_charge: null, grupo: "sem_data" });
          continue;
        }

        // Coluna DATE: lida como dia local. `new Date("aaaa-mm-dd")` é meia-noite
        // UTC, e no Brasil cai na véspera.
        const [ano, mes, dia] = t.guest_checkout_date.slice(0, 10).split("-").map(Number);
        const checkout = new Date(ano, mes - 1, dia);
        const liberaEm = addDays(checkout, DIAS_PARA_COBRAR_HOSPEDE);
        const faltam = differenceInDays(liberaEm, hoje);
        itens.push({
          ...base,
          cobrar_a_partir_de: format(liberaEm, "yyyy-MM-dd"),
          days_until_charge: Math.max(0, faltam),
          grupo: differenceInDays(hoje, checkout) >= DIAS_PARA_COBRAR_HOSPEDE ? "pronta" : "em_breve",
        });
      }

      const ordemGrupo = { pronta: 0, em_breve: 1, sem_data: 2 } as const;
      return itens.sort(
        (a, b) =>
          ordemGrupo[a.grupo] - ordemGrupo[b.grupo] ||
          (a.days_until_charge ?? 0) - (b.days_until_charge ?? 0),
      );
    },
  });
}
