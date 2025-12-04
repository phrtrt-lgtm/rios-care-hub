import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Missing environment variables");
    }

    // Get authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user client with the JWT to verify the user
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    
    // Get user from the token
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError || !user) {
      console.error("User verification error:", userError);
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("User authenticated:", user.id);
    
    // Create admin client for privileged operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      console.error("Profile check error:", profileError, "Role:", profile?.role);
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas administradores podem cadastrar proprietários." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Admin verified:", user.id);

    // Get request body
    const { email, password, name, phone } = await req.json();

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Email, senha e nome são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to create user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        phone,
      },
    });

    let userId: string;

    // If user already exists, check if it's a rejected profile that can be reactivated
    if (createError && createError.message.includes("already been registered")) {
      console.log("User already exists, checking if can be reactivated...");
      
      // Find the existing profile by email
      const { data: existingProfile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, status, role")
        .eq("email", email)
        .single();

      if (profileError || !existingProfile) {
        console.error("Error finding existing profile:", profileError);
        throw new Error("Email já cadastrado no sistema");
      }

      // Check if profile was rejected and can be reactivated
      if (existingProfile.status === "rejected") {
        console.log("Reactivating rejected profile:", existingProfile.id);
        
        // Update the existing profile back to pending
        const { error: reactivateError } = await supabaseAdmin
          .from("profiles")
          .update({
            role: "pending_owner",
            status: "pending",
            name,
            phone,
          })
          .eq("id", existingProfile.id);

        if (reactivateError) {
          console.error("Error reactivating profile:", reactivateError);
          throw reactivateError;
        }

        // Update auth user password
        const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
          existingProfile.id,
          {
            password,
            user_metadata: { name, phone },
          }
        );

        if (passwordError) {
          console.error("Error updating user password:", passwordError);
          throw passwordError;
        }

        userId = existingProfile.id;
        console.log("Profile reactivated successfully:", userId);
      } else {
        // Profile exists but is not rejected (pending or approved)
        throw new Error("Email já cadastrado e aguardando aprovação ou já aprovado");
      }
    } else if (createError) {
      console.error("Error creating user:", createError);
      throw createError;
    } else {
      if (!newUser.user) {
        throw new Error("Erro ao criar usuário");
      }

      userId = newUser.user.id;

      // Update profile to pending_owner role and pending status
      const { error: profileUpdateError } = await supabaseAdmin
        .from("profiles")
        .update({
          role: "pending_owner",
          status: "pending",
          name,
          phone,
        })
        .eq("id", userId);

      if (profileUpdateError) {
        console.error("Error updating profile:", profileUpdateError);
        throw profileUpdateError;
      }

      console.log("Owner created successfully with pending status:", userId);
    }

    // Send notification for approval request
    try {
      await supabaseAdmin.functions.invoke("notify-ticket", {
        body: {
          type: "approval_request",
          userId: userId,
          data: {
            name,
            email,
          },
        },
      });
      console.log("Approval notification sent");
    } catch (notifyError) {
      console.error("Error sending notification (non-critical):", notifyError);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        user_id: userId,
        email: email,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in create-owner function:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Erro desconhecido" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
