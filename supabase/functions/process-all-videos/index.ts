import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all video attachments without duration
    const { data: videos, error: fetchError } = await supabase
      .from("charge_attachments")
      .select("id, file_name")
      .like("mime_type", "video/%")
      .is("duration_sec", null)
      .limit(50); // Process in batches

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${videos?.length || 0} videos to process`);

    const results = [];
    for (const video of videos || []) {
      console.log(`Processing video: ${video.file_name}`);
      
      try {
        // Call process-video function for each video
        const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ attachmentId: video.id }),
        });

        const result = await processResponse.json();
        results.push({ id: video.id, file_name: video.file_name, success: result.success });
      } catch (error) {
        console.error(`Error processing ${video.file_name}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ id: video.id, file_name: video.file_name, success: false, error: errorMessage });
      }
    }

    return new Response(
      JSON.stringify({ 
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
