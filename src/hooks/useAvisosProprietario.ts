import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Avisos a proprietários (/avisos-proprietarios): o que a equipe precisa passar
 * ao proprietário e o que ele mandou. Não há tabela nova: cada aviso é um
 * chamado (`tickets`), e a conversa é o chat do chamado (TicketDetalhes).
 *
 * - Enviado pela equipe: ticket_type = "informacao", created_by ≠ owner_id.
 * - Recebido: chamado aberto pelo próprio proprietário (created_by = owner_id)
 *   dos tipos de conversa (informação, dúvida, hóspedes, bloqueio, outros).
 *   Manutenção em debate (kind = "maintenance") fica de fora: é da lista de manutenções.
 */

const TIPOS_CONVERSA = ["informacao", "duvida", "conversar_hospedes", "bloqueio_data", "outros"] as const;
const FECHADOS = ["concluido", "cancelado"] as const;

export interface ConversaProprietario {
  id: string;
  subject: string;
  ticket_type: string;
  status: string;
  owner_id: string;
  created_by: string | null;
  created_at: string;
  property_id: string | null;
  imovelNome: string | null;
  donoNome: string | null;
  /** Aberto pelo proprietário (recebido) ou pela equipe (enviado). */
  recebido: boolean;
  ultima: { autorEhDono: boolean; texto: string; em: string } | null;
  /** Quem deve a próxima resposta. */
  vez: "equipe" | "proprietario";
}

export type VisaoAvisos = "abertos" | "encerrados";

async function buscar(visao: VisaoAvisos): Promise<ConversaProprietario[]> {
  let consulta = supabase
    .from("tickets")
    .select("id, subject, ticket_type, status, owner_id, created_by, created_at, property_id, kind, imovel:properties(name)")
    .in("ticket_type", [...TIPOS_CONVERSA]);
  consulta =
    visao === "abertos"
      ? consulta.not("status", "in", `(${FECHADOS.join(",")})`).order("created_at", { ascending: false })
      : consulta.in("status", [...FECHADOS]).order("updated_at", { ascending: false }).limit(60);
  const { data, error } = await consulta;
  if (error) throw error;

  const linhas = (data ?? []).filter((t) => t.kind !== "maintenance");
  // Equipe só manda "informação"; o resto aberto pela equipe é de outras telas.
  const relevantes = linhas.filter((t) => t.created_by === t.owner_id || t.ticket_type === "informacao");
  if (relevantes.length === 0) return [];

  const ids = relevantes.map((t) => t.id);
  const donos = [...new Set(relevantes.map((t) => t.owner_id))];
  const [msgs, perfis] = await Promise.all([
    supabase
      .from("ticket_messages")
      .select("ticket_id, author_id, body, created_at")
      .in("ticket_id", ids)
      .eq("is_internal", false)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("profiles").select("id, name").in("id", donos),
  ]);
  if (msgs.error) throw msgs.error;

  const ultimaPorTicket = new Map<string, { author_id: string | null; body: string | null; created_at: string }>();
  for (const m of msgs.data ?? []) if (!ultimaPorTicket.has(m.ticket_id)) ultimaPorTicket.set(m.ticket_id, m);
  const nomes = new Map((perfis.data ?? []).map((p) => [p.id, p.name as string]));

  return relevantes.map((t) => {
    const recebido = t.created_by === t.owner_id;
    const u = ultimaPorTicket.get(t.id);
    const ultima = u
      ? { autorEhDono: u.author_id === t.owner_id, texto: (u.body ?? "").replace(/\s+/g, " ").trim(), em: u.created_at }
      : null;
    // Sem mensagem: o recebido espera a equipe; o enviado espera o proprietário.
    const vez = ultima ? (ultima.autorEhDono ? "equipe" : "proprietario") : recebido ? "equipe" : "proprietario";
    return {
      id: t.id,
      subject: t.subject,
      ticket_type: t.ticket_type,
      status: t.status,
      owner_id: t.owner_id,
      created_by: t.created_by,
      created_at: t.created_at,
      property_id: t.property_id,
      imovelNome: (t.imovel as { name: string } | null)?.name ?? null,
      donoNome: nomes.get(t.owner_id) ?? null,
      recebido,
      ultima,
      vez,
    };
  });
}

export function useAvisosProprietario(visao: VisaoAvisos, ativo = true) {
  return useQuery({
    queryKey: ["avisos-proprietario", visao],
    enabled: ativo,
    staleTime: 30_000,
    queryFn: () => buscar(visao),
  });
}

/** Passa uma informação ao proprietário do imóvel: abre o chamado com a mensagem e avisa por e-mail. */
export function useEnviarAviso() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ propertyId, assunto, mensagem, autorId }: { propertyId: string; assunto: string; mensagem: string; autorId: string }) => {
      const { data: imovel, error: erroImovel } = await supabase.from("properties").select("owner_id").eq("id", propertyId).maybeSingle();
      if (erroImovel) throw erroImovel;
      if (!imovel?.owner_id) throw new Error("Esse imóvel não tem proprietário cadastrado.");

      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert([
          {
            owner_id: imovel.owner_id,
            created_by: autorId,
            ticket_type: "informacao",
            subject: assunto.trim(),
            description: mensagem.trim(),
            priority: "normal",
            property_id: propertyId,
          },
        ])
        .select("id")
        .single();
      if (error) throw error;

      // Primeira mensagem da conversa (mesmo caminho do "Novo ticket"); a function avisa o proprietário.
      const { data: sessao } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-ticket-message/${ticket.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessao.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ author_type: "agent", message: mensagem.trim(), attachments: [] }),
      });
      if (!resp.ok) console.warn("[avisos] mensagem inicial não gravada:", resp.status);

      try {
        await supabase.functions.invoke("notify-ticket", { body: { type: "ticket_created", ticketId: ticket.id } });
      } catch (e) {
        console.warn("[avisos] e-mail ao proprietário não saiu:", e);
      }
      return ticket.id as string;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["avisos-proprietario"] }),
  });
}

export function useEncerrarConversa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reabrir = false }: { id: string; reabrir?: boolean }) => {
      const { error } = await supabase.from("tickets").update({ status: reabrir ? "em_analise" : "concluido" }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["avisos-proprietario"] }),
  });
}
