import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { email, newPassword } = await req.json();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (profErr) return new Response(JSON.stringify({ error: profErr.message }), { status: 400 });
  const user = profile ? { id: profile.id } : null;
  if (!user) return new Response(JSON.stringify({ error: "user not found" }), { status: 404 });


  const { error } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  return new Response(JSON.stringify({ success: true, userId: user.id }), { status: 200 });
});
