import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing environment variables");
    }

    // Extract attachment ID from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const attachmentId = pathParts[pathParts.length - 1];
    const isDownload = url.searchParams.get('download') === '1';

    if (!attachmentId) {
      return new Response(JSON.stringify({ error: "Attachment ID required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify JWT and get user
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get attachment metadata
    const { data: attachment, error: attachmentError } = await supabase
      .from("charge_attachments")
      .select(`
        *,
        charges!inner(
          owner_id
        )
      `)
      .eq("id", attachmentId)
      .single();

    if (attachmentError || !attachment) {
      return new Response(JSON.stringify({ error: "Attachment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check permission: user is owner OR team member
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent';
    const isOwner = attachment.charges.owner_id === user.id;

    if (!isTeamMember && !isOwner) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get file from storage
    const { data: fileData, error: storageError } = await supabase.storage
      .from("attachments")
      .download(attachment.file_path);

    if (storageError || !fileData) {
      console.error("Storage error:", storageError);
      return new Response(JSON.stringify({ error: "File not found in storage" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle Range requests for video streaming
    const range = req.headers.get("Range");
    const mimeType = attachment.mime_type || "application/octet-stream";
    const fileName = attachment.file_name;

    if (range) {
      const fileBuffer = await fileData.arrayBuffer();
      const fileSize = fileBuffer.byteLength;
      
      // Parse range header (e.g., "bytes=0-1024")
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      const chunk = fileBuffer.slice(start, end + 1);

      return new Response(chunk, {
        status: 206,
        headers: {
          ...corsHeaders,
          "Content-Type": mimeType,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    // Regular response
    const headers: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": mimeType,
      "Cache-Control": "private, max-age=3600",
    };

    if (isDownload) {
      headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
    }

    return new Response(fileData, { headers });

  } catch (error) {
    console.error("Error in serve-attachment function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
