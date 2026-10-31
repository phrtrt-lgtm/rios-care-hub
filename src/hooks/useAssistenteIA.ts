import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { descreverErroDaFunction } from "@/lib/erroFunction";
import { type AcaoPendente, type ConfigIA, type RespostaAgente, lerConfigIA } from "@/lib/iaMeta";

// As tabelas ia_* ainda não estão no types.ts (o Lovable regenera); até lá,
// cliente sem tipos, como em useAjustes.
const db = supabase as unknown as SupabaseClient;

const CHAVE_CONFIG = ["ia", "config"] as const;
const CHAVE_CONVERSAS = ["ia", "conversas"] as const;

/** Configuração do agente (`system_config.ia_agente`). Só a equipe lê. */
export function useConfigIA(habilitado = true) {
  return useQuery({
    queryKey: CHAVE_CONFIG,
    enabled: habilitado,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ConfigIA> => {
      const { data, error } = await db.from("system_config").select("value").eq("key", "ia_agente").maybeSingle();
      if (error) throw error;
      return lerConfigIA(data?.value);
    },
  });
}

export function useSalvarConfigIA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: ConfigIA) => {
      const { data: existe } = await db.from("system_config").select("id").eq("key", "ia_agente").maybeSingle();
      const linha = { value: config, updated_at: new Date().toISOString() };
      const { error } = existe
        ? await db.from("system_config").update(linha).eq("key", "ia_agente")
        : await db.from("system_config").insert({ key: "ia_agente", ...linha });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE_CONFIG });
      toast.success("Configuração do assistente salva.");
    },
    onError: () => toast.error("Não consegui salvar a configuração."),
  });
}

export interface ConversaResumo {
  id: string;
  titulo: string | null;
  atualizada_em: string;
}

export function useConversasIA(usuarioId: string | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: [...CHAVE_CONVERSAS, usuarioId],
    enabled: habilitado && !!usuarioId,
    staleTime: 60_000,
    queryFn: async (): Promise<ConversaResumo[]> => {
      const { data, error } = await db
        .from("ia_conversas")
        .select("id, titulo, atualizada_em")
        .eq("usuario_id", usuarioId)
        .order("atualizada_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ConversaResumo[];
    },
  });
}

export type DecisaoAcao = "confirmada" | "cancelada" | "expirada" | "erro";

export interface ItemChat {
  id: string;
  role: "user" | "assistant";
  texto: string;
  criadaEm: string;
  /** Ferramentas de leitura que o modelo usou para esta resposta. */
  consultas?: string[];
  pendente?: AcaoPendente | null;
  decisao?: DecisaoAcao;
  erro?: boolean;
}

interface LinhaMensagem {
  id: string;
  role: "user" | "assistant";
  texto: string | null;
  criada_em: string;
}

interface LinhaAcao {
  id: string;
  mensagem_id: string | null;
  ferramenta: string;
  nivel: "leitura" | "escrita";
  status: string;
  resumo: string | null;
  entrada: Record<string, unknown> | null;
}

function montarItens(mensagens: LinhaMensagem[], acoes: LinhaAcao[]): ItemChat[] {
  const porMensagem = new Map<string, LinhaAcao[]>();
  for (const a of acoes) {
    if (!a.mensagem_id) continue;
    const lista = porMensagem.get(a.mensagem_id) ?? [];
    lista.push(a);
    porMensagem.set(a.mensagem_id, lista);
  }
  const itens: ItemChat[] = [];
  let consultasAcumuladas: string[] = [];
  for (const m of mensagens) {
    if (m.role === "user") {
      if (m.texto) itens.push({ id: m.id, role: "user", texto: m.texto, criadaEm: m.criada_em });
      continue;
    }
    const acoesDaMsg = porMensagem.get(m.id) ?? [];
    consultasAcumuladas.push(...acoesDaMsg.filter((a) => a.nivel === "leitura" && a.status === "executada").map((a) => a.ferramenta));
    const escrita = acoesDaMsg.find((a) => a.nivel === "escrita");
    if (!m.texto && !escrita) continue;
    const decisao: DecisaoAcao | undefined = escrita
      ? escrita.status === "executada" || escrita.status === "confirmada"
        ? "confirmada"
        : escrita.status === "cancelada"
          ? "cancelada"
          : escrita.status === "expirada"
            ? "expirada"
            : escrita.status === "erro" || escrita.status === "negada"
              ? "erro"
              : undefined
      : undefined;
    itens.push({
      id: m.id,
      role: "assistant",
      texto: m.texto ?? "",
      criadaEm: m.criada_em,
      consultas: [...new Set(consultasAcumuladas)],
      pendente: escrita
        ? { id: escrita.id, ferramenta: escrita.ferramenta, resumo: escrita.resumo ?? escrita.ferramenta, entrada: escrita.entrada ?? {} }
        : null,
      decisao,
    });
    consultasAcumuladas = [];
  }
  return itens;
}

/**
 * Estado de uma conversa com o assistente: mensagens, envio, confirmação de
 * ação e troca de conversa. Fica no widget (sempre montado), então sobrevive
 * à navegação entre páginas.
 */
export function useConversaIA(rota: string) {
  const qc = useQueryClient();
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemChat[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const anexarResposta = useCallback((data: RespostaAgente) => {
    setConversaId(data.conversa_id);
    setItens((prev) => [
      ...prev,
      {
        id: data.mensagem_id ?? crypto.randomUUID(),
        role: "assistant",
        texto: data.texto,
        criadaEm: new Date().toISOString(),
        consultas: data.ferramentas_usadas ?? [],
        pendente: data.acao_pendente ?? null,
      },
    ]);
    qc.invalidateQueries({ queryKey: CHAVE_CONVERSAS });
  }, [qc]);

  const falhar = useCallback(async (erro: unknown) => {
    const msg = await descreverErroDaFunction(erro, "Não consegui falar com o assistente. Tente de novo.");
    setItens((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "assistant", texto: msg, criadaEm: new Date().toISOString(), erro: true },
    ]);
  }, []);

  const enviar = useCallback(
    async (texto: string) => {
      const limpo = texto.trim();
      if (!limpo || ocupado) return;
      setItens((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", texto: limpo, criadaEm: new Date().toISOString() },
      ]);
      setOcupado(true);
      try {
        const { data, error } = await supabase.functions.invoke<RespostaAgente>("ia-agente", {
          body: { mensagem: limpo, conversa_id: conversaId, pagina: { rota } },
        });
        if (error) throw error;
        if (!data) throw new Error("O assistente não respondeu.");
        anexarResposta(data);
      } catch (e) {
        await falhar(e);
      } finally {
        setOcupado(false);
      }
    },
    [anexarResposta, conversaId, falhar, ocupado, rota],
  );

  const decidir = useCallback(
    async (acaoId: string, decisao: "confirmar" | "cancelar") => {
      if (ocupado) return;
      setOcupado(true);
      setItens((prev) =>
        prev.map((i) =>
          i.pendente?.id === acaoId ? { ...i, decisao: decisao === "confirmar" ? "confirmada" : "cancelada" } : i,
        ),
      );
      try {
        const { data, error } = await supabase.functions.invoke<RespostaAgente>("ia-agente", {
          body: decisao === "confirmar" ? { confirmar: acaoId } : { cancelar: acaoId },
        });
        if (error) throw error;
        if (!data) throw new Error("O assistente não respondeu.");
        anexarResposta(data);
      } catch (e) {
        setItens((prev) => prev.map((i) => (i.pendente?.id === acaoId ? { ...i, decisao: "erro" } : i)));
        await falhar(e);
      } finally {
        setOcupado(false);
      }
    },
    [anexarResposta, falhar, ocupado],
  );

  const novaConversa = useCallback(() => {
    setConversaId(null);
    setItens([]);
  }, []);

  const abrirConversa = useCallback(async (id: string) => {
    setCarregando(true);
    try {
      const [msgs, acoes] = await Promise.all([
        db.from("ia_mensagens").select("id, role, texto, criada_em").eq("conversa_id", id).order("ordem"),
        db
          .from("ia_acoes")
          .select("id, mensagem_id, ferramenta, nivel, status, resumo, entrada")
          .eq("conversa_id", id)
          .order("criada_em"),
      ]);
      if (msgs.error) throw msgs.error;
      setConversaId(id);
      setItens(montarItens((msgs.data ?? []) as LinhaMensagem[], (acoes.data ?? []) as LinhaAcao[]));
    } catch (e) {
      console.error("[ia] abrir conversa:", e);
      toast.error("Não consegui abrir essa conversa.");
    } finally {
      setCarregando(false);
    }
  }, []);

  return { conversaId, itens, ocupado, carregando, enviar, decidir, novaConversa, abrirConversa };
}
