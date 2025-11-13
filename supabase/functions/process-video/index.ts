import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoMetadata {
  duration_sec: number;
  width: number;
  height: number;
  poster_path: string;
  posterData?: Uint8Array;
}

async function extractVideoMetadata(videoUrl: string): Promise<Partial<VideoMetadata>> {
  try {
    // Download video temporarily
    const videoResponse = await fetch(videoUrl);
    const videoBlob = await videoResponse.blob();
    const videoArrayBuffer = await videoBlob.arrayBuffer();
    
    // Create temporary file
    const tempVideoPath = `/tmp/video_${Date.now()}.mp4`;
    await Deno.writeFile(tempVideoPath, new Uint8Array(videoArrayBuffer));
    
    // Extract duration and dimensions using ffprobe
    const ffprobeCmd = new Deno.Command("ffprobe", {
      args: [
        "-v", "error",
        "-show_entries", "format=duration:stream=width,height",
        "-of", "json",
        tempVideoPath
      ],
      stdout: "piped",
      stderr: "piped",
    });
    
    const ffprobeOutput = await ffprobeCmd.output();
    const probeResult = JSON.parse(new TextDecoder().decode(ffprobeOutput.stdout));
    
    const duration = parseFloat(probeResult.format?.duration || "0");
    const width = probeResult.streams?.[0]?.width || null;
    const height = probeResult.streams?.[0]?.height || null;
    
    // Generate thumbnail at 1 second mark
    const tempPosterPath = `/tmp/poster_${Date.now()}.jpg`;
    const ffmpegCmd = new Deno.Command("ffmpeg", {
      args: [
        "-i", tempVideoPath,
        "-ss", "00:00:01",
        "-vframes", "1",
        "-vf", "scale=640:-1",
        "-q:v", "2",
        tempPosterPath
      ],
      stdout: "piped",
      stderr: "piped",
    });
    
    await ffmpegCmd.output();
    
    const posterData = await Deno.readFile(tempPosterPath);
    
    // Clean up temp files
    await Deno.remove(tempVideoPath);
    await Deno.remove(tempPosterPath);
    
    return {
      duration_sec: Math.round(duration),
      width,
      height,
      posterData: posterData,
    };
  } catch (error) {
    console.error("Error extracting video metadata:", error);
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { attachmentId } = await req.json();

    if (!attachmentId) {
      throw new Error("attachmentId is required");
    }

    // Get attachment
    const { data: attachment, error: fetchError } = await supabase
      .from("charge_attachments")
      .select("*")
      .eq("id", attachmentId)
      .single();

    if (fetchError || !attachment) {
      throw new Error("Attachment not found");
    }

    // Check if it's a video
    if (!attachment.mime_type?.startsWith("video/")) {
      return new Response(
        JSON.stringify({ error: "Not a video file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get signed URL for video
    const { data: signedUrlData } = await supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.file_path, 300);

    if (!signedUrlData) {
      throw new Error("Could not generate signed URL");
    }

    // Extract metadata and generate thumbnail
    const metadata = await extractVideoMetadata(signedUrlData.signedUrl);

    if (!metadata.posterData) {
      throw new Error("Could not generate thumbnail");
    }

    // Upload thumbnail
    const posterFileName = `${attachment.charge_id}/posters/${attachment.id}.jpg`;
    const { data: posterUpload, error: posterError } = await supabase.storage
      .from("attachments")
      .upload(posterFileName, metadata.posterData, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (posterError) {
      console.error("Error uploading poster:", posterError);
    }

    // Update attachment with metadata
    const updateData: any = {
      duration_sec: metadata.duration_sec,
      width: metadata.width,
      height: metadata.height,
    };

    if (posterUpload) {
      updateData.poster_path = posterUpload.path;
    }

    const { error: updateError } = await supabase
      .from("charge_attachments")
      .update(updateData)
      .eq("id", attachmentId);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, metadata: updateData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing video:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
