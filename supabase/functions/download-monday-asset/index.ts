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
    const url = new URL(req.url);
    const assetId = url.searchParams.get("assetId");

    if (!assetId) {
      throw new Error("assetId is required");
    }

    const MONDAY_API_KEY = Deno.env.get("MONDAY_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!MONDAY_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    // Verify user has access to this attachment
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Get asset URL from Monday
    const assetQuery = `
      query ($assetId: [ID!]) {
        assets(ids: $assetId) {
          url
          name
        }
      }
    `;

    const assetResponse = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Authorization": MONDAY_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: assetQuery,
        variables: { assetId: [assetId] },
      }),
    });

    if (!assetResponse.ok) {
      throw new Error("Failed to get asset from Monday");
    }

    const assetData = await assetResponse.json();
    const asset = assetData.data?.assets?.[0];

    if (!asset) {
      throw new Error("Asset not found");
    }

    // Download file from Monday
    const fileResponse = await fetch(asset.url, {
      headers: {
        "Authorization": MONDAY_API_KEY,
      },
    });

    if (!fileResponse.ok) {
      throw new Error("Failed to download file from Monday");
    }

    const fileBlob = await fileResponse.blob();
    
    // Return file with proper headers
    return new Response(fileBlob, {
      headers: {
        ...corsHeaders,
        "Content-Type": fileBlob.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asset.name}"`,
      },
    });
  } catch (error) {
    console.error("Error in download-monday-asset function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
