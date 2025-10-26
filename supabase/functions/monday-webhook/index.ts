import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-monday-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MONDAY_API_KEY = Deno.env.get("MONDAY_API_KEY");
    const MONDAY_WEBHOOK_SECRET = Deno.env.get("MONDAY_WEBHOOK_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!MONDAY_API_KEY || !MONDAY_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    // Validate webhook signature
    const signature = req.headers.get("x-monday-signature");
    const providedSecret = req.headers.get("authorization")?.replace("Bearer ", "");
    
    if (providedSecret !== MONDAY_WEBHOOK_SECRET) {
      console.error("Invalid webhook secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    console.log("Received Monday webhook:", JSON.stringify(payload, null, 2));

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

    // Get property name from Monday (adjust column ID based on your board)
    const propertyName = getColumnValue("text") || getColumnValue("text0");
    
    if (!propertyName) {
      throw new Error('Coluna "Imóvel" não encontrada no item do Monday');
    }

    // Find property and get owner_id
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('owner_id')
      .eq('name', propertyName)
      .single();

    if (propertyError || !property) {
      console.error("Property not found:", propertyName, propertyError);
      throw new Error(`Imóvel "${propertyName}" não encontrado no sistema`);
    }

    console.log("Found property owner:", property.owner_id);

    // Extract charge data (adjust column IDs based on your Monday board)
    const chargeData = {
      title: item.name,
      description: getColumnValue("long_text") || item.name,
      amount_cents: parseInt(getColumnValue("numbers") || "0") * 100, // Convert to cents
      due_date: getColumnValue("date") || null,
      owner_id: property.owner_id,
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

    // Download and upload attachments if any
    if (item.assets && item.assets.length > 0) {
      for (const asset of item.assets) {
        try {
          console.log("Downloading asset:", asset.name);

          // Download file from Monday
          const fileResponse = await fetch(asset.url);
          if (!fileResponse.ok) {
            console.error("Failed to download file:", asset.name);
            continue;
          }

          const fileBlob = await fileResponse.blob();
          const fileBuffer = await fileBlob.arrayBuffer();

          // Upload to Supabase storage
          const fileName = `${charge.id}/${asset.name}`;
          const { error: uploadError } = await supabase.storage
            .from("attachments")
            .upload(fileName, fileBuffer, {
              contentType: fileBlob.type,
              upsert: false,
            });

          if (uploadError) {
            console.error("Error uploading file to storage:", uploadError);
            continue;
          }

          // Create attachment record
          const { error: attachmentError } = await supabase
            .from("charge_attachments")
            .insert({
              charge_id: charge.id,
              file_name: asset.name,
              file_path: fileName,
              file_size: asset.file_size || fileBuffer.byteLength,
              mime_type: fileBlob.type,
              created_by: charge.owner_id,
            });

          if (attachmentError) {
            console.error("Error creating attachment record:", attachmentError);
          } else {
            console.log("Uploaded attachment:", asset.name);
          }
        } catch (error) {
          console.error("Error processing attachment:", asset.name, error);
        }
      }
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
