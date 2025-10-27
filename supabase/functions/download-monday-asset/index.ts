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
      query ($assetId: [ID!]!) {
        assets(ids: $assetId) {
          url
          name
        }
      }
    `;

    console.log('Fetching asset from Monday with ID:', assetId);

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
      console.error('Monday API response not OK:', assetResponse.status, assetResponse.statusText);
      throw new Error("Failed to get asset from Monday");
    }

    const assetData = await assetResponse.json();
    console.log('Monday API response:', JSON.stringify(assetData));

    if (assetData.errors) {
      console.error('Monday API errors:', assetData.errors);
      throw new Error(`Monday API error: ${JSON.stringify(assetData.errors)}`);
    }

    const asset = assetData.data?.assets?.[0];

    if (!asset) {
      console.error('Asset not found in response. Full response:', JSON.stringify(assetData));
      throw new Error("Asset not found");
    }

    console.log('Downloading file from URL:', asset.url);

    // Download file from Monday - try with full browser headers
    const fileResponse = await fetch(asset.url, {
      method: 'GET',
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://monday.com/",
        "Connection": "keep-alive",
      },
      redirect: 'follow',
    });

    console.log('File download response status:', fileResponse.status, fileResponse.statusText);
    console.log('Response headers:', Object.fromEntries(fileResponse.headers.entries()));

    if (!fileResponse.ok) {
      const errorText = await fileResponse.text();
      console.error('Failed to download file. Status:', fileResponse.status, 'Error:', errorText);
      throw new Error(`Failed to download file from Monday: ${fileResponse.status} ${fileResponse.statusText}`);
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
