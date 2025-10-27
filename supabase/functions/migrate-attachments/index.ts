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
    const MONDAY_API_KEY = Deno.env.get("MONDAY_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!MONDAY_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find all attachments with Monday IDs (numeric file_path)
    const { data: attachments, error: fetchError } = await supabase
      .from("charge_attachments")
      .select("*")
      .not("file_path", "like", "%/%"); // Paths without "/" are Monday IDs

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${attachments?.length || 0} attachments to migrate`);

    const results = {
      total: attachments?.length || 0,
      migrated: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const attachment of attachments || []) {
      try {
        console.log(`Migrating attachment: ${attachment.file_name} (ID: ${attachment.file_path})`);

        // Get asset URL from Monday
        const assetQuery = `
          query ($assetId: [ID!]!) {
            assets(ids: $assetId) {
              url
              name
              file_extension
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
            variables: { assetId: [attachment.file_path] },
          }),
        });

        const assetData = await assetResponse.json();
        const assetUrl = assetData.data?.assets?.[0]?.url;

        if (!assetUrl) {
          console.error(`Could not get asset URL for: ${attachment.file_name}`);
          results.failed++;
          results.errors.push(`No URL for ${attachment.file_name}`);
          continue;
        }

        // Download file from Monday
        console.log(`Downloading from Monday: ${assetUrl}`);
        const fileResponse = await fetch(assetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "*/*",
          },
        });

        if (!fileResponse.ok) {
          console.error(`Failed to download file: ${fileResponse.status}`);
          results.failed++;
          results.errors.push(`Download failed for ${attachment.file_name}: ${fileResponse.status}`);
          continue;
        }

        const fileBlob = await fileResponse.blob();
        const arrayBuffer = await fileBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Upload to Supabase Storage
        const fileName = `${attachment.charge_id}/${attachment.file_name}`;
        console.log(`Uploading to Supabase Storage: ${fileName}`);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(fileName, uint8Array, {
            contentType: attachment.mime_type || "application/octet-stream",
            upsert: true,
          });

        if (uploadError) {
          console.error(`Error uploading to storage: ${uploadError.message}`);
          results.failed++;
          results.errors.push(`Upload failed for ${attachment.file_name}: ${uploadError.message}`);
          continue;
        }

        console.log(`File uploaded successfully: ${uploadData.path}`);

        // Update attachment record with new storage path
        const { error: updateError } = await supabase
          .from("charge_attachments")
          .update({ file_path: uploadData.path })
          .eq("id", attachment.id);

        if (updateError) {
          console.error(`Error updating attachment record: ${updateError.message}`);
          results.failed++;
          results.errors.push(`Update failed for ${attachment.file_name}: ${updateError.message}`);
          continue;
        }

        console.log(`Successfully migrated: ${attachment.file_name}`);
        results.migrated++;
      } catch (error) {
        console.error(`Error processing attachment ${attachment.file_name}:`, error);
        results.failed++;
        results.errors.push(`Error for ${attachment.file_name}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    return new Response(
      JSON.stringify(results),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in migrate-attachments function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
