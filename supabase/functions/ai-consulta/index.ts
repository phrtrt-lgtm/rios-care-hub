// ai-consulta — DESLIGADA em 2026-10-30 (PLANO_IA_AGENTE.md §1.2).
//
// Era o chat "I.A" do painel: lia o banco inteiro com a service role (perfis
// com telefone, fichas com senhas, todas as cobranças) sem conferir quem
// chamava, e mandava tudo ao Gemini pelo gateway do Lovable. O chat agora é
// a function `ia-agente` (Claude, RLS do usuário, log de cada ação).
//
// Este stub fica publicado respondendo 410 até o agente do Lovable remover a
// function do backend; assim nenhum cliente antigo volta a receber dados.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: "Esta função foi desligada. O assistente agora é a function ia-agente." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
