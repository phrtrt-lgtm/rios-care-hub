import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lembrete de atraso por WhatsApp (modelo cobranca_atraso_proprietario):
 * UM por proprietário, com o resumo de todas as cobranças dele em atraso.
 * A regra de "em atraso" mora no banco (public.cobrancas_em_atraso) e é a
 * mesma que a função notificar-cobranca usa para montar a mensagem.
 */

// A tabela whatsapp_lembrete_config e as funções abaixo ainda não estão no
// types.ts gerado; o cliente sem tipo evita casts espalhados até a regeneração.
const db = supabase as unknown as SupabaseClient;

/** Mesmo critério de /admin/gerenciar-usuarios: telefone com DDD. */
export const temWhatsapp = (phone?: string | null) => (phone || "").replace(/\D/g, "").length >= 10;

export interface ResumoAtraso {
  quantidade: number;
  totalCents: number;
  /** yyyy-mm-dd do vencimento mais antigo */
  maisAntiga: string | null;
}

export async function buscarResumoAtraso(ownerId: string): Promise<ResumoAtraso> {
  const { data, error } = await db.rpc("cobrancas_em_atraso", { p_owner: ownerId });
  if (error) throw error;
  const lista = (data ?? []) as { a_pagar_cents: number; due_date: string | null }[];
  return {
    quantidade: lista.length,
    totalCents: lista.reduce((soma, c) => soma + Number(c.a_pagar_cents), 0),
    maisAntiga: lista.map((c) => c.due_date).filter((d): d is string => !!d).sort()[0] ?? null,
  };
}

/** Envia o lembrete de um proprietário. Devolve o status da função. */
export async function enviarLembreteAtraso(ownerId: string): Promise<{ status: string; erro?: string }> {
  const { data, error } = await supabase.functions.invoke("notificar-cobranca", {
    body: { tipo: "atraso", proprietario_id: ownerId },
  });
  if (error) return { status: "falhou", erro: error.message };
  return { status: data?.status ?? "falhou", erro: data?.erro };
}

export interface ConfigLembrete {
  ativo: boolean;
  intervalo_dias: number;
  max_lembretes: number;
  max_por_dia: number;
  atualizado_em: string | null;
}

export async function buscarConfigLembrete(): Promise<ConfigLembrete> {
  const { data, error } = await db.from("whatsapp_lembrete_config").select("*").maybeSingle();
  if (error) throw error;
  return (
    (data as ConfigLembrete | null) ?? {
      ativo: false,
      intervalo_dias: 7,
      max_lembretes: 3,
      max_por_dia: 20,
      atualizado_em: null,
    }
  );
}

export async function salvarConfigLembrete(
  config: Pick<ConfigLembrete, "ativo" | "intervalo_dias" | "max_lembretes" | "max_por_dia">,
  userId: string | undefined,
) {
  const { error } = await db
    .from("whatsapp_lembrete_config")
    .update({ ...config, atualizado_em: new Date().toISOString(), atualizado_por: userId ?? null })
    .eq("id", true);
  if (error) throw error;
}

/** Quantos proprietários receberiam na próxima rodada, com a config salva. */
export async function contarProximaRodada(): Promise<number> {
  const { data, error } = await db.rpc("proprietarios_para_lembrete_atraso", {});
  if (error) throw error;
  return (data ?? []).length;
}
