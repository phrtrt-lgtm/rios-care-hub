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

    // Log all columns for debugging
    console.log("=== ALL MONDAY COLUMNS ===");
    item.column_values.forEach((col: any) => {
      console.log(`Column ID: ${col.id}, Type: ${col.type}, Text: ${col.text}, Value: ${col.value}`);
    });
    console.log("=========================");

    // Map Monday columns to charge fields
    const getColumnValue = (columnId: string) => {
      const column = item.column_values.find((col: any) => col.id === columnId);
      return column?.text || column?.value;
    };

    // Get property name from the text column (text_mkx3ehs)
    const propertyName = getColumnValue("text_mkx3ehs");
    
    if (!propertyName) {
      throw new Error('Nome da unidade não encontrado no item do Monday');
    }

    console.log("Looking for property with name:", propertyName);

    // Find property and get owner_id and property_id
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('id, owner_id')
      .ilike('name', propertyName)
      .maybeSingle();

    if (propertyError || !property) {
      console.error("Property not found:", propertyName, propertyError);
      throw new Error(`Unidade "${propertyName}" não encontrada no sistema. Certifique-se de que a propriedade existe e está associada a um proprietário.`);
    }

    console.log("Found property:", property.id, "owner:", property.owner_id);

    // Extract charge data using the actual column IDs from your Monday board
    // The title will be the Monday item name
    const description = getColumnValue("long_text_mkx3tx1b");
    
    // Numeric columns from Monday board
    const totalAmount = parseFloat(getColumnValue("numeric_mkx355en") || "0"); // Total value column
    const managementContributionValue = parseFloat(getColumnValue("numeric_mkxgn45q") || "0"); // Management contribution column
    
    console.log("Total amount from Monday:", totalAmount);
    console.log("Management contribution from Monday:", managementContributionValue);
    
    const chargeData = {
      title: item.name || `Cobrança - ${propertyName}`,
      description: description || null,
      amount_cents: Math.round(totalAmount * 100), // Convert to cents
      management_contribution_cents: Math.round(managementContributionValue * 100), // Convert to cents
      due_date: getColumnValue("due_date") || null,
      maintenance_date: getColumnValue("data") || null, // Date when the issue/maintenance occurred
      owner_id: property.owner_id,
      property_id: property.id,
      currency: "BRL",
      status: "sent",
    };
    
    console.log("Charge data to insert:", JSON.stringify(chargeData, null, 2));

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

    // Generate Mercado Pago payment link automatically
    try {
      await supabase.functions.invoke('create-mercadopago-payment', {
        body: { 
          chargeId: charge.id 
        }
      });
      console.log("Mercado Pago payment link generated");
    } catch (mpError) {
      console.error("Error generating Mercado Pago payment link:", mpError);
      // Don't fail the whole webhook if payment link generation fails
    }

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
