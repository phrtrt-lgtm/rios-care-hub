import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-monday-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Received Monday webhook:", JSON.stringify(payload, null, 2));

    // Handle Monday.com webhook challenge/verification
    if (payload.challenge) {
      console.log("Responding to Monday webhook challenge");
      return new Response(
        JSON.stringify({ challenge: payload.challenge }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const MONDAY_API_KEY = Deno.env.get("MONDAY_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!MONDAY_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    // Extract data from Monday webhook payload
    const { event } = payload;
    
    if (!event || event.type !== "create_pulse" && event.type !== "update_column_value") {
      console.log("Skipping event type:", event?.type);
      return new Response(JSON.stringify({ message: "Event type not processed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Query Monday API to get full item details including files
    const mondayQuery = `
      query ($itemId: [ID!]) {
        items(ids: $itemId) {
          id
          name
          column_values {
            id
            text
            value
            type
          }
          assets {
            id
            name
            url
            file_extension
            file_size
          }
        }
      }
    `;

    const mondayResponse = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Authorization": MONDAY_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: mondayQuery,
        variables: { itemId: [event.pulseId || event.itemId] },
      }),
    });

    if (!mondayResponse.ok) {
      const errorText = await mondayResponse.text();
      console.error("Monday API error:", mondayResponse.status, errorText);
      throw new Error("Failed to fetch Monday data");
    }

    const mondayData = await mondayResponse.json();
    const item = mondayData.data?.items?.[0];

    if (!item) {
      console.error("Item not found in Monday response");
      throw new Error("Item not found");
    }

    console.log("Monday item data:", JSON.stringify(item, null, 2));

    // Map Monday columns to charge fields
    const getColumnValue = (columnId: string) => {
      const column = item.column_values.find((col: any) => col.id === columnId);
      return column?.text || column?.value;
    };

    // Get owner name from the text column (text_mkx3ehs)
    const ownerName = getColumnValue("text_mkx3ehs");
    
    if (!ownerName) {
      throw new Error('Nome do proprietário não encontrado no item do Monday');
    }

    console.log("Looking for owner with name:", ownerName);

    // Find owner by name
    const { data: owner, error: ownerError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('name', ownerName)
      .eq('role', 'owner')
      .single();

    if (ownerError || !owner) {
      console.error("Owner not found:", ownerName, ownerError);
      throw new Error(`Proprietário "${ownerName}" não encontrado no sistema. Certifique-se de que o nome está correto.`);
    }

    console.log("Found owner:", owner.id);

    // Extract charge data using the actual column IDs from your Monday board
    // The title will be the Monday item name
    const description = getColumnValue("long_text_mkx3tx1b");
    const chargeData = {
      title: item.name || `Cobrança - ${ownerName}`,
      description: description || null,
      amount_cents: parseInt(getColumnValue("numeric_mkx355en") || "0") * 100, // Convert to cents
      due_date: getColumnValue("data") || null,
      owner_id: owner.id,
      property_id: null,
      currency: "BRL",
      status: "draft",
    };

    // Create the charge
    const { data: charge, error: chargeError } = await supabase
      .from("charges")
      .insert(chargeData)
      .select()
      .single();

    if (chargeError) {
      console.error("Error creating charge:", chargeError);
      throw chargeError;
    }

    console.log("Created charge:", charge.id);

    // Send email notification
    try {
      await supabase.functions.invoke('send-charge-email', {
        body: { 
          type: 'charge_created', 
          chargeId: charge.id 
        }
      });
      console.log("Charge email notification sent");
    } catch (emailError) {
      console.error("Error sending charge email:", emailError);
      // Don't fail the whole webhook if email fails
    }

    // Download and upload attachments to Supabase Storage
    if (item.assets && item.assets.length > 0) {
      for (const asset of item.assets) {
        try {
          console.log("Processing asset from Monday:", asset.name, "ID:", asset.id);
          
          // Get asset URL from Monday API
          const assetQuery = `
            query ($assetId: [ID!]!) {
              assets(ids: $assetId) {
                public_url
              }
            }
          `;

          const assetResponse = await fetch("https://api.monday.com/v2", {
            method: "POST",
            headers: {
              "Authorization": MONDAY_API_KEY,
              "Content-Type": "application/json",
              "API-Version": "2023-10",
            },
            body: JSON.stringify({
              query: assetQuery,
              variables: { assetId: [asset.id] },
            }),
          });

          if (!assetResponse.ok) {
            console.error("Failed to query Monday API for asset:", assetResponse.status);
            continue;
          }

          const assetData = await assetResponse.json();
          const publicUrl = assetData.data?.assets?.[0]?.public_url;

          if (!publicUrl) {
            console.error("No public_url from Monday for asset:", asset.name);
            continue;
          }

          // Download file from Monday
          console.log("Downloading file from Monday public URL");
          const fileResponse = await fetch(publicUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          });

          if (!fileResponse.ok) {
            console.error("Failed to download file:", fileResponse.status, fileResponse.statusText);
            continue;
          }

            const mimeType = getMimeType(asset.file_extension);
            
            // Download file from Monday
            const fileBlob = await fileResponse.blob();
            const arrayBuffer = await fileBlob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            const fileName = `${charge.id}/${asset.name}`;
            console.log("Uploading to Supabase Storage:", fileName);
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("attachments")
              .upload(fileName, uint8Array, {
                contentType: mimeType,
                upsert: false,
              });

            if (uploadError) {
              console.error("Error uploading to storage:", uploadError);
              continue;
            }

            console.log("File uploaded successfully:", uploadData.path);

            // Save attachment metadata
            const { error: attachmentError } = await supabase
              .from("charge_attachments")
              .insert({
                charge_id: charge.id,
                file_name: asset.name,
                file_path: uploadData.path,
                file_size: asset.file_size,
                mime_type: mimeType,
                created_by: charge.owner_id,
                source: 'monday',
                monday_asset_id: String(asset.id),
              });

            if (attachmentError) {
              console.error("Error creating attachment record:", attachmentError);
            } else {
              console.log("Saved attachment metadata:", asset.name);
            }
        } catch (error) {
          console.error("Error processing attachment:", asset.name, error);
        }
      }
    }

    function getMimeType(extension: string): string {
      const mimeTypes: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.jpeg': 'image/jpeg',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }

    return new Response(
      JSON.stringify({
        success: true,
        charge_id: charge.id,
        attachments_count: item.assets?.length || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in monday-webhook function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
