// DESATIVADA EM 2026-09-18 — FALHA CRÍTICA DE SEGURANÇA.
//
// A versão anterior recebia { email, newPassword } e chamava
// auth.admin.updateUserById com a SERVICE_ROLE_KEY, sem verificar JWT
// (verify_jwt = false no config.toml), sem segredo compartilhado e sem
// checar papel. Qualquer pessoa na internet podia trocar a senha de
// qualquer conta do portal, incluindo as de admin, com um único POST.
// A URL do projeto Supabase é pública por construção — está no bundle
// que todo visitante do portal baixa.
//
// Nenhum arquivo do front chamava esta função: era utilitário de
// depuração que foi publicado e ficou para trás.
//
// Reset de senha do proprietário já é atendido pelo fluxo normal do
// Supabase Auth (recuperação por e-mail), usado em ForgotPasswordDialog.
//
// PENDENTE: apagar a função de vez no painel (Supabase → Edge Functions →
// admin-reset-password → Delete). Enquanto ela seguir publicada, este
// corpo garante que não faz nada. Ver ROADMAP.md, item 1.1.

Deno.serve((req) => {
  const ip = req.headers.get("x-forwarded-for")
    ?? req.headers.get("cf-connecting-ip")
    ?? "desconhecido";
  console.warn(`[admin-reset-password] chamada bloqueada — função desativada. origem=${ip}`);

  return new Response(
    JSON.stringify({ error: "gone", message: "Endpoint desativado." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
});
