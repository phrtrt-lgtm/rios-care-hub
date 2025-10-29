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

    // Get property name from Monday - using the actual column ID from your board
    // The column ID is "text_mkx3ehs" based on the logs
    const propertyName = getColumnValue("text_mkx3ehs");
    
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

    // Extract charge data using the actual column IDs from your Monday board
    const chargeData = {
      title: item.name,
      description: getColumnValue("long_text_mkx3tx1b") || item.name,
      amount_cents: parseInt(getColumnValue("numeric_mkx355en") || "0") * 100, // Convert to cents
      due_date: getColumnValue("data") || null,
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
          const isVideo = mimeType.startsWith('video/');

          if (isVideo) {
            console.log("Processing video file:", asset.name);
            
            // Save to temp file
            const tempInputPath = join("/tmp", `input_${asset.id}${asset.file_extension}`);
            const tempOutputPath = join("/tmp", `output_${asset.id}.mp4`);
            const tempPosterPath = join("/tmp", `poster_${asset.id}.jpg`);

            const fileBlob = await fileResponse.blob();
            const arrayBuffer = await fileBlob.arrayBuffer();
            await Deno.writeFile(tempInputPath, new Uint8Array(arrayBuffer));

            try {
              // Check if we need transcoding using ffprobe
              const probeCommand = new Deno.Command("ffprobe", {
                args: [
                  "-v", "quiet",
                  "-print_format", "json",
                  "-show_streams",
                  "-show_format",
                  tempInputPath
                ],
              });

              const { stdout: probeOutput } = await probeCommand.output();
              const probeData = JSON.parse(new TextDecoder().decode(probeOutput));
              
              const videoStream = probeData.streams?.find((s: any) => s.codec_type === "video");
              const audioStream = probeData.streams?.find((s: any) => s.codec_type === "audio");
              
              const needsTranscode = videoStream?.codec_name !== "h264" || audioStream?.codec_name !== "aac";
              
              // Extract metadata
              const duration = Math.round(parseFloat(probeData.format?.duration || "0"));
              const width = videoStream?.width || null;
              const height = videoStream?.height || null;

              console.log(`Video info: ${width}x${height}, ${duration}s, needs transcode: ${needsTranscode}`);

              // Convert/remux video
              const ffmpegArgs = needsTranscode
                ? ["-i", tempInputPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", 
                   "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-y", tempOutputPath]
                : ["-i", tempInputPath, "-c", "copy", "-movflags", "+faststart", "-y", tempOutputPath];

              const convertCommand = new Deno.Command("ffmpeg", { args: ffmpegArgs });
              const { success: convertSuccess } = await convertCommand.output();

              if (!convertSuccess) {
                throw new Error("FFmpeg conversion failed");
              }

              // Generate poster
              const posterCommand = new Deno.Command("ffmpeg", {
                args: [
                  "-ss", "00:00:01",
                  "-i", tempOutputPath,
                  "-frames:v", "1",
                  "-vf", "scale='min(1280,iw)':-2",
                  "-y",
                  tempPosterPath
                ],
              });
              
              const { success: posterSuccess } = await posterCommand.output();
              
              if (!posterSuccess) {
                console.error("Failed to generate poster");
              }

              // Upload video
              const videoData = await Deno.readFile(tempOutputPath);
              const videoPath = `${charge.id}/${asset.id}.mp4`;
              
              const { data: videoUpload, error: videoUploadError } = await supabase.storage
                .from("attachments")
                .upload(videoPath, videoData, {
                  contentType: "video/mp4",
                  upsert: false,
                });

              if (videoUploadError) {
                console.error("Error uploading video:", videoUploadError);
                continue;
              }

              console.log("Video uploaded:", videoPath);

              // Upload poster if it was generated
              let posterUploadPath = null;
              
              try {
                const posterData = await Deno.readFile(tempPosterPath);
                const posterPath = `${charge.id}/${asset.id}.jpg`;
                
                const { data: posterUpload, error: posterUploadError } = await supabase.storage
                  .from("attachments")
                  .upload(posterPath, posterData, {
                    contentType: "image/jpeg",
                    upsert: false,
                  });

                if (posterUploadError) {
                  console.error("Error uploading poster:", posterUploadError);
                } else {
                  posterUploadPath = posterUpload.path;
                  console.log("Poster uploaded:", posterPath);
                }
              } catch (error) {
                console.error("Error reading/uploading poster:", error);
              }

              // Save attachment metadata
              const { error: attachmentError } = await supabase
                .from("charge_attachments")
                .insert({
                  charge_id: charge.id,
                  file_name: asset.name.replace(/\.[^.]+$/, '.mp4'),
                  file_path: videoUpload.path,
                  file_size: videoData.length,
                  mime_type: "video/mp4",
                  poster_path: posterUploadPath,
                  duration_sec: duration,
                  width: width,
                  height: height,
                  created_by: charge.owner_id,
                  source: 'monday',
                  monday_asset_id: String(asset.id),
                });

              if (attachmentError) {
                console.error("Error creating attachment record:", attachmentError);
              } else {
                console.log("Video attachment saved:", asset.name);
              }

            } finally {
              // Cleanup temp files
              try { await Deno.remove(tempInputPath); } catch {}
              try { await Deno.remove(tempOutputPath); } catch {}
              try { await Deno.remove(tempPosterPath); } catch {}
            }

          } else {
            // Non-video files - upload as-is
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
