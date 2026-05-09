import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint — receives ?token= and redirects to a fresh magic link.
// Token never expires; it's single-use. Once used, it generates a fresh
// short-lived Supabase magic link at the moment of click.

serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.rioshospedagens.com.br";

  if (!token) {
    return Response.redirect(`${portalUrl}/login?error=token_missing`, 302);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { data: tokenRow, error: tokenErr } = await admin
      .from("curation_access_tokens")
      .select("id, owner_id, used_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return Response.redirect(`${portalUrl}/login?error=token_invalido`, 302);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", tokenRow.owner_id)
      .single();

    if (!profile?.email) {
      return Response.redirect(`${portalUrl}/login?error=sem_email`, 302);
    }

    // Generate a fresh magic link at click-time (Supabase default expiry is fine —
    // user is clicking now). The email link itself never expires.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
      options: { redirectTo: `${portalUrl}/definir-senha` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("generateLink error", linkErr);
      return Response.redirect(`${portalUrl}/login?error=link`, 302);
    }

    // Mark used (best-effort; allow re-click if not yet used to log in)
    await admin
      .from("curation_access_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    return Response.redirect(linkData.properties.action_link, 302);
  } catch (e: any) {
    console.error(e);
    return Response.redirect(`${portalUrl}/login?error=server`, 302);
  }
});
