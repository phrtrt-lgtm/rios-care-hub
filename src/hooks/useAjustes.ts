import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { CategoriaAjuste, StatusAjuste } from "@/lib/ajusteMeta";

/**
 * Ajustes avisados pela equipe (tabela `ajustes`, página /ajustes).
 *
 * Quem vê o quê é decidido pelo RLS: a equipe recebe tudo, a faxineira só o
 * que ela mesma avisou. As fotos ficam no bucket privado `ajustes` e chegam
 * aqui como URL assinada.
 */

export const BUCKET_AJUSTES = "ajustes";

// A tabela é de 2026-10-16 e o types.ts (gerado pelo Lovable) ainda não a
// conhece: até ele ser regenerado, ela passa pelo cliente sem tipos.
const clienteSemTipos = supabase as unknown as SupabaseClient;
export const tabelaAjustes = () => clienteSemTipos.from("ajustes");

export interface Ajuste {
  id: string;
  property_id: string | null;
  categoria: CategoriaAjuste;
  descricao: string;
  urgente: boolean;
  /** Caminhos no bucket. */
  fotos: string[];
  /** URLs assinadas, na mesma ordem de `fotos` (null quando a assinatura falhou). */
  fotosUrls: (string | null)[];
  status: StatusAjuste;
  autor_id: string | null;
  autor_nome: string | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  resposta: string | null;
  created_at: string;
  /** Resultado do WhatsApp ao gestor (notificar-listas). */
  notificacao_status: string | null;
  notificacao_erro: string | null;
  /** Nulo quando o aviso é geral ou o imóvel não é visível para quem lê. */
  imovel: { name: string } | null;
}

/**
 * - abertos: tudo "a fazer" (equipe), urgentes primeiro e depois o mais antigo;
 * - resolvidos: feitos e sem mudança, o mais recente primeiro;
 * - meus: o que a pessoa avisou, em qualquer situação.
 */
export type VisaoAjustes = "abertos" | "resolvidos" | "meus";

const CAMPOS =
  "id, property_id, categoria, descricao, urgente, fotos, status, autor_id, autor_nome, " +
  "resolvido_por_nome, resolvido_em, resposta, created_at, notificacao_status, notificacao_erro, imovel:properties(name)";

const LIMITE_RESOLVIDOS = 60;
const LIMITE_MEUS = 40;
/** As URLs vencem em 1 h; o React Query refaz a busca ao voltar para a aba. */
const VALIDADE_URL_S = 60 * 60;

async function assinarFotos(caminhos: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (caminhos.length === 0) return mapa;
  const { data, error } = await supabase.storage.from(BUCKET_AJUSTES).createSignedUrls(caminhos, VALIDADE_URL_S);
  if (error) {
    console.warn("[ajustes] não foi possível assinar as fotos:", error.message);
    return mapa;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) mapa.set(item.path, item.signedUrl);
  }
  return mapa;
}

async function buscarAjustes(visao: VisaoAjustes, autorId?: string): Promise<Ajuste[]> {
  let consulta = tabelaAjustes().select(CAMPOS);
  if (visao === "abertos") {
    consulta = consulta
      .eq("status", "aberto")
      .order("urgente", { ascending: false })
      .order("created_at", { ascending: true });
  } else if (visao === "resolvidos") {
    consulta = consulta.neq("status", "aberto").order("resolvido_em", { ascending: false }).limit(LIMITE_RESOLVIDOS);
  } else {
    consulta = consulta.eq("autor_id", autorId ?? "").order("created_at", { ascending: false }).limit(LIMITE_MEUS);
  }

  const { data, error } = await consulta;
  if (error) throw error;

  const linhas = (data ?? []) as unknown as Omit<Ajuste, "fotosUrls">[];
  const urls = await assinarFotos(linhas.flatMap((l) => l.fotos ?? []));
  return linhas.map((l) => {
    const fotos = l.fotos ?? [];
    return { ...l, fotos, fotosUrls: fotos.map((c) => urls.get(c) ?? null) };
  });
}

export function useAjustes(visao: VisaoAjustes, autorId?: string, ativo = true) {
  return useQuery({
    queryKey: ["ajustes", "lista", visao, visao === "meus" ? autorId : null],
    queryFn: () => buscarAjustes(visao, autorId),
    enabled: ativo && (visao !== "meus" || !!autorId),
    staleTime: 30_000,
  });
}

/** Contagem do lembrete do painel. Falha em silêncio: o painel não depende dela. */
export function useContagemAjustes(ativo = true) {
  return useQuery({
    queryKey: ["ajustes", "contagem"],
    enabled: ativo,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await tabelaAjustes().select("urgente").eq("status", "aberto");
      if (error) throw error;
      const linhas = (data ?? []) as unknown as { urgente: boolean }[];
      return { abertos: linhas.length, urgentes: linhas.filter((l) => l.urgente).length };
    },
  });
}

export interface ImovelAjuste {
  id: string;
  name: string;
}

/** Imóveis do seletor. Para a faxineira, o RLS devolve só os dela. */
export function useImoveisAjuste() {
  return useQuery({
    queryKey: ["imoveis-ajuste"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ImovelAjuste[]> => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .is("archived_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMudarStatusAjuste() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, resposta }: { id: string; status: StatusAjuste; resposta?: string }) => {
      // Quem resolveu e quando é o trigger que grava; reabrir limpa tudo.
      const mudanca: Record<string, unknown> = { status };
      if (resposta !== undefined) mudanca.resposta = resposta.trim() || null;
      const { data, error } = await tabelaAjustes().update(mudanca).eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Você não tem permissão para mudar este aviso.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["ajustes"] }),
  });
}

export function useApagarAjuste() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ajuste: Ajuste) => {
      const { data, error } = await tabelaAjustes().delete().eq("id", ajuste.id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Este aviso não pode mais ser apagado.");
      // A linha já saiu; se a foto ficar para trás, não aparece em lugar nenhum.
      if (ajuste.fotos.length > 0) await supabase.storage.from(BUCKET_AJUSTES).remove(ajuste.fotos);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["ajustes"] }),
  });
}
