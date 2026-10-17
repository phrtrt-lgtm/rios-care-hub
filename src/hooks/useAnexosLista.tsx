import { useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MediaGallery } from "@/components/MediaGallery";
import {
  ANEXOS_MAX_ITEM,
  ANEXOS_POR_ENVIO,
  ehMidiaAceita,
  enviarAnexos,
  erroDeAnexo,
  itensGaleria,
  removerAnexos,
} from "@/lib/anexosListas";

/** Galeria dos anexos de um item (fotos e vídeos), igual à das manutenções. */
export function useGaleriaAnexos() {
  const [aberta, setAberta] = useState<{ caminhos: string[]; urls: (string | null)[]; indice: number } | null>(null);
  const itens = useMemo(() => (aberta ? itensGaleria(aberta.caminhos, aberta.urls) : []), [aberta]);
  // O índice clicado conta só os anexos com URL (os sem URL não entram na galeria).
  const inicial = aberta ? aberta.urls.slice(0, aberta.indice).filter(Boolean).length : 0;

  const elemento =
    aberta && itens.length > 0 ? (
      <MediaGallery
        key={`${aberta.caminhos[0]}-${aberta.indice}`}
        items={itens}
        initialIndex={inicial}
        open
        onOpenChange={(v) => !v && setAberta(null)}
      />
    ) : null;

  return {
    abrir: (caminhos: string[], urls: (string | null)[], indice: number) => setAberta({ caminhos, urls, indice }),
    elemento,
  };
}

interface AlvoAnexo {
  id: string;
  /** Anexos que o item já tem (a coluna recebe a lista inteira). */
  atuais: string[];
}

/**
 * "Adicionar foto ou vídeo" num item já criado: escolhe os arquivos, sobe na
 * pasta de quem está anexando e acrescenta à coluna do item. Só a equipe
 * consegue (o UPDATE das três tabelas é da equipe).
 */
export function useAnexarDepois(tabela: "ajustes" | "compras" | "tarefas_rua", coluna: "fotos" | "anexos", userId?: string) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const alvo = useRef<AlvoAnexo | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  const anexar = async (arquivos: File[]) => {
    const item = alvo.current;
    if (!item || !userId) return;
    const aceitos = arquivos.filter(ehMidiaAceita);
    const vagas = Math.min(ANEXOS_POR_ENVIO, ANEXOS_MAX_ITEM - item.atuais.length);
    if (vagas <= 0) {
      toast.info(`Esse item já tem ${ANEXOS_MAX_ITEM} anexos.`);
      return;
    }
    if (aceitos.length > vagas) toast.info(`Só cabem mais ${vagas}.`);
    setEnviando(item.id);
    let novos: string[] = [];
    try {
      novos = await enviarAnexos(userId, item.id, aceitos.slice(0, vagas));
      const { data, error } = await (supabase as unknown as SupabaseClient)
        .from(tabela)
        .update({ [coluna]: [...item.atuais, ...novos] })
        .eq("id", item.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Sem permissão para anexar neste item.");
      toast.success(novos.length === 1 ? "Anexo adicionado" : `${novos.length} anexos adicionados`);
      await queryClient.invalidateQueries({ queryKey: [tabela === "tarefas_rua" ? "tarefas-rua" : tabela] });
    } catch (erro) {
      if (novos.length > 0) await removerAnexos(novos);
      toast.error(erro instanceof Error && /permissão/.test(erro.message) ? erro.message : erroDeAnexo(erro));
    } finally {
      setEnviando(null);
    }
  };

  const elemento = (
    <input
      ref={input}
      type="file"
      accept="image/*,video/*"
      multiple
      className="hidden"
      onChange={(e) => {
        const arquivos = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (arquivos.length > 0) void anexar(arquivos);
      }}
    />
  );

  return {
    escolher: (item: AlvoAnexo) => {
      alvo.current = item;
      input.current?.click();
    },
    enviando,
    elemento,
  };
}
