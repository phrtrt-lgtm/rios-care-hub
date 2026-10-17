import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tom } from "@/components/painel/tons";
import { assinarAnexos, enviarAnexos, novoId, removerAnexos } from "@/lib/anexosListas";

/**
 * Tarefas da equipe de rua (tabela `tarefas_rua`, página /tarefas-rua):
 * o que alguém precisa ir fazer em um imóvel. Só a equipe vê e mexe.
 */

export type StatusTarefa = "pendente" | "feita" | "descartada";

export const STATUS_TAREFA: Record<StatusTarefa, { rotulo: string; tom: Tom }> = {
  pendente: { rotulo: "A fazer", tom: "warning" },
  feita: { rotulo: "Feita", tom: "success" },
  descartada: { rotulo: "Não precisa", tom: "neutral" },
};

export const DESCRICAO_TAREFA_MIN = 3;
export const DESCRICAO_TAREFA_MAX = 1000;

// A tabela é de 2026-10-17 e o types.ts (gerado pelo Lovable) ainda não a
// conhece: até ele ser regenerado, ela passa pelo cliente sem tipos.
const clienteSemTipos = supabase as unknown as SupabaseClient;
const tabelaTarefas = () => clienteSemTipos.from("tarefas_rua");

export interface TarefaRua {
  id: string;
  property_id: string | null;
  descricao: string;
  status: StatusTarefa;
  autor_id: string | null;
  autor_nome: string | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  resposta: string | null;
  created_at: string;
  /** Quem vai cuidar (recebe o WhatsApp). Padrão em system_config 'listas_whatsapp'. */
  responsavel_id: string | null;
  responsavel_nome: string | null;
  /** Fotos e vídeos (caminhos no bucket) e as URLs assinadas na mesma ordem. */
  anexos: string[];
  anexosUrls: (string | null)[];
  notificacao_status: string | null;
  notificacao_erro: string | null;
  imovel: { name: string } | null;
}

export type VisaoTarefas = "pendentes" | "resolvidas";

const CAMPOS =
  "id, property_id, descricao, status, autor_id, autor_nome, resolvido_por_nome, resolvido_em, resposta, created_at, " +
  "responsavel_id, responsavel_nome, anexos, notificacao_status, notificacao_erro, imovel:properties(name)";

export function useTarefasRua(visao: VisaoTarefas, ativo = true) {
  return useQuery({
    queryKey: ["tarefas-rua", "lista", visao],
    enabled: ativo,
    staleTime: 30_000,
    queryFn: async (): Promise<TarefaRua[]> => {
      let consulta = tabelaTarefas().select(CAMPOS);
      consulta =
        visao === "pendentes"
          ? consulta.eq("status", "pendente").order("created_at", { ascending: true })
          : consulta.neq("status", "pendente").order("resolvido_em", { ascending: false }).limit(80);
      const { data, error } = await consulta;
      if (error) throw error;
      const linhas = (data ?? []) as unknown as Omit<TarefaRua, "anexosUrls">[];
      const urls = await assinarAnexos(linhas.flatMap((l) => l.anexos ?? []));
      return linhas.map((l) => {
        const anexos = l.anexos ?? [];
        return { ...l, anexos, anexosUrls: anexos.map((c) => urls.get(c) ?? null) };
      });
    },
  });
}

export function useContagemTarefasRua(ativo = true) {
  return useQuery({
    queryKey: ["tarefas-rua", "contagem"],
    enabled: ativo,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await tabelaTarefas().select("id", { count: "exact", head: true }).eq("status", "pendente");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useCriarTarefaRua() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nova: {
      propertyId: string | null;
      descricao: string;
      responsavelId: string | null;
      autorId: string;
      arquivos: File[];
    }) => {
      // O id nasce aqui para os anexos irem direto para a pasta da tarefa.
      const id = novoId();
      const anexos = await enviarAnexos(nova.autorId, id, nova.arquivos);
      // Autor, situação e nome do responsável são gravados pelo trigger tarefas_rua_preencher;
      // sem responsável, ele usa o padrão da configuração.
      const { error } = await tabelaTarefas().insert({
        id,
        anexos,
        property_id: nova.propertyId,
        descricao: nova.descricao.trim(),
        responsavel_id: nova.responsavelId,
      });
      if (error) {
        await removerAnexos(anexos);
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tarefas-rua"] }),
  });
}

export function useMudarStatusTarefaRua() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, resposta }: { id: string; status: StatusTarefa; resposta?: string }) => {
      const mudanca: Record<string, unknown> = { status };
      if (resposta !== undefined) mudanca.resposta = resposta.trim() || null;
      const { data, error } = await tabelaTarefas().update(mudanca).eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Você não tem permissão para mudar esta tarefa.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tarefas-rua"] }),
  });
}

export function useApagarTarefaRua() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await tabelaTarefas().delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Esta tarefa não pode mais ser apagada.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tarefas-rua"] }),
  });
}
