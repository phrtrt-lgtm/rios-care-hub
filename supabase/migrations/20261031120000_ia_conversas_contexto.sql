-- Assistente de IA: retomada de conversa compatível com o "preserved thinking"
-- do Claude. A assinatura de cada bloco de thinking grava o system prompt, as
-- ferramentas e as mensagens anteriores; se qualquer um muda entre duas
-- chamadas, a API recusa (400 "bound to a different conversation"). Foi o que
-- aconteceu no primeiro bloqueio de datas em 2026-10-31: o bloco variável do
-- system (hora, página) mudava a cada chamada.
--
-- Correção: o contexto estável (usuário, papel, imóveis) é montado uma vez e
-- guardado na conversa; data/hora e página viram mensagens `system` dentro do
-- histórico, que só anexa.

alter table public.ia_conversas add column if not exists contexto text;

alter table public.ia_mensagens drop constraint if exists ia_mensagens_role_check;
alter table public.ia_mensagens add constraint ia_mensagens_role_check
  check (role in ('user', 'assistant', 'system'));

-- `json` preserva o texto exatamente como veio da API (jsonb reordena chaves);
-- os blocos voltam para a API byte a byte iguais.
alter table public.ia_mensagens alter column blocos type json using blocos::text::json;
