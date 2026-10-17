import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { CanalCompra, CustoCompra, StatusCompra } from "@/lib/compraMeta";
import { assinarAnexos, enviarAnexos, novoId, removerAnexos } from "@/lib/anexosListas";

/**
 * Lista de compras (tabela `compras`, página /compras). Mesmo modelo dos
 * ajustes: o RLS decide quem vê o quê (equipe tudo, faxineira só os seus).
 */

// A tabela é de 2026-10-17 e o types.ts (gerado pelo Lovable) ainda não a
// conhece: até ele ser regenerado, ela passa pelo cliente sem tipos.
const clienteSemTipos = supabase as unknown as SupabaseClient;
export const tabelaCompras = () => clienteSemTipos.from("compras");

export interface Compra {
  id: string;
  property_id: string | null;
  item: string;
  quantidade: number;
  link: string | null;
  canal: CanalCompra;
  custo: CustoCompra;
  /** Cobrança lançada ao proprietário ao concluir (custo = owner). */
  charge_id: string | null;
  /** Fotos e vídeos (caminhos no bucket) e as URLs assinadas na mesma ordem. */
  anexos: string[];
  anexosUrls: (string | null)[];
  status: StatusCompra;
  autor_id: string | null;
  autor_nome: string | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  resposta: string | null;
  created_at: string;
  /** Resultado do WhatsApp ao responsável (notificar-listas). */
  notificacao_status: string | null;
  notificacao_erro: string | null;
  /** Nulo quando é geral ou o imóvel não é visível para quem lê. */
  imovel: { name: string; owner_id: string | null } | null;
}

/**
 * - pendentes: tudo "a comprar" (equipe), o mais antigo primeiro;
 * - resolvidos: comprados e "não vai comprar", o mais recente primeiro;
 * - meus: o que a pessoa pediu, em qualquer situação.
 */
export type VisaoCompras = "pendentes" | "resolvidos" | "meus";

const CAMPOS =
  "id, property_id, item, quantidade, link, canal, custo, charge_id, anexos, status, autor_id, autor_nome, notificacao_status, notificacao_erro, " +
  "resolvido_por_nome, resolvido_em, resposta, created_at, imovel:properties(name, owner_id)";

const LIMITE_RESOLVIDOS = 80;
const LIMITE_MEUS = 40;

async function buscarCompras(visao: VisaoCompras, autorId?: string): Promise<Compra[]> {
  let consulta = tabelaCompras().select(CAMPOS);
  if (visao === "pendentes") {
    consulta = consulta.eq("status", "pendente").order("created_at", { ascending: true });
  } else if (visao === "resolvidos") {
    consulta = consulta.neq("status", "pendente").order("resolvido_em", { ascending: false }).limit(LIMITE_RESOLVIDOS);
  } else {
    consulta = consulta.eq("autor_id", autorId ?? "").order("created_at", { ascending: false }).limit(LIMITE_MEUS);
  }
  const { data, error } = await consulta;
  if (error) throw error;
  const linhas = (data ?? []) as unknown as Omit<Compra, "anexosUrls">[];
  const urls = await assinarAnexos(linhas.flatMap((l) => l.anexos ?? []));
  return linhas.map((l) => {
    const anexos = l.anexos ?? [];
    return { ...l, anexos, anexosUrls: anexos.map((c) => urls.get(c) ?? null) };
  });
}

export function useCompras(visao: VisaoCompras, autorId?: string, ativo = true) {
  return useQuery({
    queryKey: ["compras", "lista", visao, visao === "meus" ? autorId : null],
    queryFn: () => buscarCompras(visao, autorId),
    enabled: ativo && (visao !== "meus" || !!autorId),
    staleTime: 30_000,
  });
}

/** Contagem do lembrete do painel. */
export function useContagemCompras(ativo = true) {
  return useQuery({
    queryKey: ["compras", "contagem"],
    enabled: ativo,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await tabelaCompras()
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export interface NovaCompra {
  propertyId: string | null;
  item: string;
  quantidade: number;
  link: string | null;
  canal: CanalCompra;
  custo: CustoCompra;
  autorId: string;
  arquivos: File[];
}

export function useCriarCompra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nova: NovaCompra) => {
      // O id nasce aqui para os anexos irem direto para a pasta do item.
      const id = novoId();
      const anexos = await enviarAnexos(nova.autorId, id, nova.arquivos);
      // Autor e situação são gravados pelo trigger compras_preencher.
      const { error } = await tabelaCompras().insert({
        id,
        anexos,
        property_id: nova.propertyId,
        item: nova.item.trim(),
        quantidade: nova.quantidade,
        link: nova.link,
        canal: nova.canal,
        custo: nova.custo,
      });
      if (error) {
        await removerAnexos(anexos);
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["compras"] }),
  });
}

export function useMudarStatusCompra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      resposta,
      chargeId,
    }: {
      id: string;
      status: StatusCompra;
      resposta?: string;
      chargeId?: string;
    }) => {
      const mudanca: Record<string, unknown> = { status };
      if (chargeId) mudanca.charge_id = chargeId;
      if (resposta !== undefined) mudanca.resposta = resposta.trim() || null;
      const { data, error } = await tabelaCompras().update(mudanca).eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Você não tem permissão para mudar este pedido.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["compras"] }),
  });
}

export function useApagarCompra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await tabelaCompras().delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Este pedido não pode mais ser apagado.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["compras"] }),
  });
}
