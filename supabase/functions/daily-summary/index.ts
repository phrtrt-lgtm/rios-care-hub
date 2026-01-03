import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DailySummary {
  date: string;
  ticketsNovos: number;
  ticketsUrgentes: number;
  ticketsAguardando: number;
  cobrancasVencendo: number;
  cobrancasAtrasadas: number;
  vistoriasHoje: number;
  manutencoesAgendadas: number;
  alertasAtivos: number;
  resumoIA: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId } = await req.json();

    // Get user profile to check role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, name")
      .eq("id", userId)
      .single();

    if (!profile) {
      throw new Error("User not found");
    }

    const isTeamMember = ["admin", "agent", "maintenance"].includes(profile.role);
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    let ticketsNovos = 0;
    let ticketsUrgentes = 0;
    let ticketsAguardando = 0;
    let cobrancasVencendo = 0;
    let cobrancasAtrasadas = 0;
    let vistoriasHoje = 0;
    let manutencoesAgendadas = 0;
    let alertasAtivos = 0;

    if (isTeamMember) {
      // Team member sees all data
      const [tickets, charges, inspections, maintenances, alerts] = await Promise.all([
        supabase.from("tickets").select("status, priority").is("archived_at", null),
        supabase.from("charges").select("status, due_date").in("status", ["pendente", "atrasado"]),
        supabase.from("cleaning_inspections").select("id, created_at").gte("created_at", today).lt("created_at", tomorrow),
        supabase.from("tickets").select("id, scheduled_at").eq("ticket_type", "manutencao").not("scheduled_at", "is", null).gte("scheduled_at", today),
        supabase.from("alerts").select("id").eq("is_active", true),
      ]);

      ticketsNovos = tickets.data?.filter(t => t.status === "novo").length || 0;
      ticketsUrgentes = tickets.data?.filter(t => t.priority === "urgente" && t.status !== "concluido").length || 0;
      ticketsAguardando = tickets.data?.filter(t => t.status === "aguardando_info").length || 0;
      cobrancasVencendo = charges.data?.filter(c => c.due_date === today || c.due_date === tomorrow).length || 0;
      cobrancasAtrasadas = charges.data?.filter(c => c.status === "atrasado").length || 0;
      vistoriasHoje = inspections.data?.length || 0;
      manutencoesAgendadas = maintenances.data?.filter(m => m.scheduled_at?.startsWith(today)).length || 0;
      alertasAtivos = alerts.data?.length || 0;
    } else {
      // Owner sees only their data
      const [tickets, charges] = await Promise.all([
        supabase.from("tickets").select("status, priority").eq("owner_id", userId).is("archived_at", null),
        supabase.from("charges").select("status, due_date").eq("owner_id", userId).in("status", ["pendente", "atrasado"]),
      ]);

      ticketsNovos = tickets.data?.filter(t => t.status === "novo").length || 0;
      ticketsUrgentes = tickets.data?.filter(t => t.priority === "urgente" && t.status !== "concluido").length || 0;
      ticketsAguardando = tickets.data?.filter(t => t.status === "aguardando_info").length || 0;
      cobrancasVencendo = charges.data?.filter(c => c.due_date === today || c.due_date === tomorrow).length || 0;
      cobrancasAtrasadas = charges.data?.filter(c => c.status === "atrasado").length || 0;
    }

    // Generate AI summary
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let resumoIA = "";

    if (LOVABLE_API_KEY) {
      const summaryData = {
        userName: profile.name,
        isTeamMember,
        ticketsNovos,
        ticketsUrgentes,
        ticketsAguardando,
        cobrancasVencendo,
        cobrancasAtrasadas,
        vistoriasHoje,
        manutencoesAgendadas,
        alertasAtivos,
      };

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `Você é um assistente de gestão de propriedades. Gere um resumo diário breve e amigável em português brasileiro.
              Use no máximo 3 frases. Seja direto e destaque apenas o que precisa de atenção urgente.
              Se não houver nada urgente, seja positivo e breve.`,
            },
            {
              role: "user",
              content: `Gere um resumo matinal para ${summaryData.userName}:
              - Tickets novos: ${summaryData.ticketsNovos}
              - Tickets urgentes: ${summaryData.ticketsUrgentes}
              - Aguardando informação: ${summaryData.ticketsAguardando}
              - Cobranças vencendo hoje/amanhã: ${summaryData.cobrancasVencendo}
              - Cobranças atrasadas: ${summaryData.cobrancasAtrasadas}
              ${summaryData.isTeamMember ? `- Vistorias hoje: ${summaryData.vistoriasHoje}
              - Manutenções agendadas hoje: ${summaryData.manutencoesAgendadas}
              - Alertas ativos: ${summaryData.alertasAtivos}` : ""}`,
            },
          ],
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        resumoIA = aiData.choices?.[0]?.message?.content || "";
      }
    }

    const summary: DailySummary = {
      date: today,
      ticketsNovos,
      ticketsUrgentes,
      ticketsAguardando,
      cobrancasVencendo,
      cobrancasAtrasadas,
      vistoriasHoje,
      manutencoesAgendadas,
      alertasAtivos,
      resumoIA,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error generating daily summary:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
