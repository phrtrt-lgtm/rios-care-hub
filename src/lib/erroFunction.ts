/**
 * Texto do erro de uma edge function chamada por `supabase.functions.invoke`.
 *
 * Em resposta não-2xx o cliente devolve um FunctionsHttpError cuja `message`
 * é só "Edge Function returned a non-2xx status code"; o motivo de verdade
 * está no corpo (`{ error }`), guardado em `context` (a Response). Aqui lemos
 * esse corpo e traduzimos os textos conhecidos das functions.
 */
const TRADUCOES: Record<string, string> = {
  "Cannot add messages to closed tickets": "Este chamado está encerrado e não aceita mensagens novas.",
  Unauthorized: "Sessão expirada. Entre de novo.",
  Forbidden: "Você não tem acesso a este chamado.",
  "Ticket not found": "Chamado não encontrado.",
  "Message or attachments required": "Escreva uma mensagem ou anexe um arquivo.",
};

export async function descreverErroDaFunction(erro: unknown, padrao = "Tente novamente."): Promise<string> {
  const contexto = (erro as { context?: unknown } | null)?.context;
  if (typeof Response !== "undefined" && contexto instanceof Response) {
    try {
      const corpo = await contexto.clone().json();
      const texto =
        typeof corpo?.error === "string" ? corpo.error : typeof corpo?.message === "string" ? corpo.message : null;
      if (texto) return TRADUCOES[texto] ?? texto;
    } catch {
      /* corpo não é JSON */
    }
  }
  if (erro instanceof Error && erro.message && !/non-2xx/i.test(erro.message)) return erro.message;
  return padrao;
}
