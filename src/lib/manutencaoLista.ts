import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buscarCobrancaJaLancada } from "@/lib/cobrancaDuplicada";

/**
 * Operações da lista de manutenções que precisam ser UMA só, onde quer que
 * sejam chamadas: a lista da equipe (/admin/manutencoes-lista, de um item ou
 * em lote) e a página de imóveis novos (/novos-imoveis) usam estas funções.
 * Ao mudar o envio ao proprietário ou a edição em linha, mude aqui.
 */

export type ResultadoEnvio = "enviada" | "gratuita" | "sem_valor" | "ja_cobrada";

/** O que o envio e a edição em linha precisam saber de uma manutenção. */
export interface ManutencaoDaLista {
  id: string;
  subject: string;
  status: string;
  owner: { id: string } | null;
  property?: { id: string } | null;
  amount_cents?: number | null;
  management_contribution_cents?: number | null;
  service_type?: string | null;
  cost_responsible?: string | null;
  on_hold?: boolean | null;
}

/**
 * Envia uma manutenção ao proprietário: cria (ou reaproveita a aberta) a
 * cobrança como "sent", copia os anexos, conclui o ticket e manda o e-mail.
 * O WhatsApp sai pelo trigger do banco. Usado pelo envio de um item, pelo
 * envio em lote e pela página de imóveis novos: todos têm que fazer
 * exatamente a mesma coisa.
 */
export async function enviarAoProprietario(ticket: ManutencaoDaLista): Promise<ResultadoEnvio> {
  if (!ticket.owner) throw new Error("Proprietário não encontrado para este ticket");

  // Buscar cobranças vinculadas que ainda estejam ABERTAS (não pagas).
  // Cobranças já pagas não devem ser reabertas: geramos uma nova.
  const { data: existingCharges, error: chargeQueryError } = await supabase
    .from("charges")
    .select("id, amount_cents, paid_at, status")
    .eq("ticket_id", ticket.id)
    .is("archived_at", null)
    .is("paid_at", null)
    .order("created_at", { ascending: false });

  if (chargeQueryError) throw chargeQueryError;

  let chargeId: string;
  // Já existe cobrança (paga) deste ticket com o mesmo valor: não cria outra.
  const jaLancada =
    existingCharges && existingCharges.length > 0
      ? null
      : await buscarCobrancaJaLancada(ticket.id, ticket.amount_cents || 0);

  if (jaLancada) {
    chargeId = jaLancada.id;
  } else if (existingCharges && existingCharges.length > 0) {
    // Atualizar a cobrança aberta existente para "sent" (envia ao proprietário)
    const openCharge = existingCharges[0];
    const { error: updateError } = await supabase
      .from("charges")
      .update({
        status: "sent",
        amount_cents: ticket.amount_cents || openCharge.amount_cents || 0,
        management_contribution_cents: ticket.management_contribution_cents ?? 0,
        service_type: ticket.service_type || null,
        cost_responsible: ticket.cost_responsible || "owner",
      })
      .eq("id", openCharge.id);
    if (updateError) throw updateError;
    chargeId = openCharge.id;
  } else {
    // Criar nova cobrança já enviada ao proprietário
    const { data: newCharge, error: chargeError } = await supabase
      .from("charges")
      .insert({
        owner_id: ticket.owner.id,
        property_id: ticket.property?.id || null,
        ticket_id: ticket.id,
        title: ticket.subject,
        amount_cents: ticket.amount_cents || 0,
        management_contribution_cents: ticket.management_contribution_cents || 0,
        service_type: ticket.service_type || null,
        cost_responsible: ticket.cost_responsible || "owner",
        status: "sent",
      })
      .select("id")
      .single();
    if (chargeError) throw chargeError;
    chargeId = newCharge.id;
  }

  // Copia os anexos do ticket para a cobrança (a cobrança que já existia fica como está)
  const { data: ticketAttachments } = jaLancada
    ? { data: null }
    : await supabase
        .from("ticket_attachments")
        .select("path, file_name, file_type, file_url, mime_type, file_size, size_bytes")
        .eq("ticket_id", ticket.id);

  if (ticketAttachments && ticketAttachments.length > 0) {
    const chargeAttachmentsToInsert = ticketAttachments.map((a) => ({
      charge_id: chargeId,
      file_path: a.path,
      file_name: a.file_name || a.path.split("/").pop() || "anexo",
      mime_type: a.mime_type || a.file_type || null,
      file_size: a.file_size || a.size_bytes || null,
    }));
    await supabase.from("charge_attachments").insert(chargeAttachmentsToInsert);
  }

  // Só conclui se ainda não estava (o RLS barra update em ticket concluído)
  if (ticket.status !== "concluido") {
    const { error: ticketError } = await supabase
      .from("tickets")
      .update({ status: "concluido" })
      .eq("id", ticket.id);
    if (ticketError) throw ticketError;
  }

  // Nada novo foi criado: o proprietário já recebeu esta cobrança antes.
  if (jaLancada) return "ja_cobrada";

  // O trigger auto-paga a cobrança quando o aporte da gestão cobre 100%.
  const fullyCoveredByManagement =
    (ticket.management_contribution_cents ?? 0) >= (ticket.amount_cents ?? 0) &&
    (ticket.amount_cents ?? 0) > 0;

  // Notificar o proprietário (email + push + notificação interna).
  // Pulamos quando o aporte da gestão cobre 100% (não há cobrança a pagar).
  if (!fullyCoveredByManagement) {
    try {
      await supabase.functions.invoke("send-charge-email", {
        body: { type: "charge_created", chargeId },
      });
    } catch (notifyErr) {
      console.warn("Falha ao notificar proprietário (não crítico):", notifyErr);
    }
  }

  if (fullyCoveredByManagement) return "gratuita";
  if ((ticket.amount_cents ?? 0) === 0) return "sem_valor";
  return "enviada";
}

/** Toast padrão para o resultado do envio (mesmo texto na lista e nos imóveis novos). */
export function avisarResultadoEnvio(resultado: ResultadoEnvio) {
  if (resultado === "gratuita") {
    toast.success("Manutenção finalizada: o aporte da gestão cobriu 100% do custo.");
  } else if (resultado === "ja_cobrada") {
    toast.info("Esta manutenção já tinha cobrança lançada com esse valor. Foi só concluída, sem criar outra.");
  } else if (resultado === "sem_valor") {
    toast.success("Manutenção enviada ao proprietário sem valor de cobrança.");
  } else {
    toast.success("Cobrança criada e enviada ao proprietário!");
  }
}

export interface ResultadoCampo {
  /** Preenchido quando o campo era "Enviar ao Proprietário". */
  envio?: ResultadoEnvio;
  /** Cobrança de hóspede feita: o ticket foi arquivado e continua no aviso do painel. */
  hospedeArquivada?: boolean;
}

/**
 * Grava um campo editado em linha (valor, aporte, etiqueta, responsável pelo
 * custo, agendamento, stand-by ou status da lista), na cobrança ou no ticket.
 *
 * - valor/aporte/etiqueta: vão para a cobrança mais recente do ticket (ou
 *   nasce um rascunho) e para as colunas `charge_draft_*` do ticket;
 * - cost_responsible: no ticket e espelhado na cobrança aberta; "hóspede" em
 *   manutenção já feita arquiva o ticket (regra do aviso do painel);
 * - list_status: "feito" conclui, "em_progresso" reabre, "enviar_proprietario"
 *   chama `enviarAoProprietario`.
 */
export async function salvarCampoManutencao({
  id,
  field,
  value,
  isCharge = false,
  ticket,
}: {
  id: string;
  field: string;
  value: unknown;
  isCharge?: boolean;
  /** O ticket como está na lista (para o envio e para nascer o rascunho). */
  ticket?: ManutencaoDaLista | null;
}): Promise<ResultadoCampo> {
  if (isCharge) {
    const { error } = await supabase
      .from("charges")
      .update({ [field]: value })
      .eq("id", id);
    if (error) throw error;
    return {};
  }

  // "Enviar ao Proprietário": cria/atualiza a cobrança E conclui o ticket
  if (field === "list_status" && value === "enviar_proprietario") {
    if (!ticket || !ticket.owner) {
      throw new Error("Proprietário não encontrado para este ticket");
    }
    return { envio: await enviarAoProprietario(ticket) };
  }

  // Campos de cobrança: vão para a cobrança do ticket e para o rascunho dele
  if (["amount_cents", "management_contribution_cents", "service_type"].includes(field)) {
    const ticketDraftFieldMap: Record<string, string> = {
      amount_cents: "charge_draft_amount_cents",
      management_contribution_cents: "charge_draft_management_contribution_cents",
      service_type: "charge_draft_category",
    };
    const ticketDraftField = ticketDraftFieldMap[field];

    // limit para não cair no erro do maybeSingle com mais de uma linha
    const { data: existingCharges } = await supabase
      .from("charges")
      .select("id")
      .eq("ticket_id", id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const existingCharge = existingCharges?.[0] ?? null;

    if (existingCharge) {
      const { error } = await supabase
        .from("charges")
        .update({ [field]: value })
        .eq("id", existingCharge.id);
      if (error) throw error;

      if (ticketDraftField) {
        const { error: ticketDraftError } = await supabase
          .from("tickets")
          .update({ [ticketDraftField]: value })
          .eq("id", id);
        if (ticketDraftError) throw ticketDraftError;
      }
    } else if (ticket && ticket.owner) {
      // Nasce o rascunho de cobrança
      const { error } = await supabase
        .from("charges")
        .insert({
          owner_id: ticket.owner.id,
          property_id: ticket.property?.id || null,
          ticket_id: id,
          title: ticket.subject,
          [field]: value,
          amount_cents: field === "amount_cents" ? (value as number) : 0,
          management_contribution_cents: field === "management_contribution_cents" ? (value as number) : 0,
          service_type: field === "service_type" ? (value as string | null) : null,
          status: "draft",
        });
      if (error) throw error;

      if (ticketDraftField) {
        const { error: ticketDraftError } = await supabase
          .from("tickets")
          .update({ [ticketDraftField]: value })
          .eq("id", id);
        if (ticketDraftError) throw ticketDraftError;
      }
    }
    return {};
  }

  if (field === "scheduled_at") {
    const { error } = await supabase
      .from("tickets")
      .update({ scheduled_at: value as string | null })
      .eq("id", id);
    if (error) throw error;
    return {};
  }

  if (field === "on_hold") {
    // Stand-by da lista: coluna própria, sem tocar no status (que o
    // proprietário vê).
    const { error } = await supabase
      .from("tickets")
      .update({ on_hold: !!value })
      .eq("id", id);
    if (error) throw error;
    return {};
  }

  if (field === "cost_responsible") {
    // Fica no ticket. Já feita e passou a ser do hóspede: mesma regra do
    // "feito", sai da lista e fica no aviso do painel.
    const hospedeFeito = value === "guest" && ticket?.status === "concluido";
    const { error } = await supabase
      .from("tickets")
      .update(
        hospedeFeito
          ? { cost_responsible: value as string, archived_at: new Date().toISOString() }
          : { cost_responsible: value as string },
      )
      .eq("id", id);
    if (error) throw error;

    // Espelha na cobrança aberta mais recente, se houver
    const { data: linkedCharges } = await supabase
      .from("charges")
      .select("id")
      .eq("ticket_id", id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const linked = linkedCharges?.[0];
    if (linked) {
      await supabase
        .from("charges")
        .update({ cost_responsible: value as string })
        .eq("id", linked.id);
    }
    return { hospedeArquivada: hospedeFeito };
  }

  if (field === "list_status") {
    // - "feito"        -> ticket.status = "concluido"
    // - "em_progresso" -> reabre como "em_execucao"
    const newTicketStatus = value === "feito" ? "concluido" : "em_execucao";
    // Cobrança de hóspede feita não tem o que enviar ao proprietário: sai
    // da lista (vai para o Arquivo) e continua no aviso do painel até
    // alguém marcar como "Cobrada".
    const hospedeFeito = value === "feito" && ticket?.cost_responsible === "guest";
    const { error } = await supabase
      .from("tickets")
      .update(
        hospedeFeito
          ? { status: newTicketStatus, archived_at: new Date().toISOString() }
          : { status: newTicketStatus },
      )
      .eq("id", id);
    if (error) throw error;
    return { hospedeArquivada: hospedeFeito };
  }

  return {};
}
