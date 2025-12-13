import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
};

serve(async (req) => {
  // Handle CORS preflight and HEAD requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing environment variables");
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(p => p);
    const attachmentId = pathParts[pathParts.length - 1] === 'poster' || pathParts[pathParts.length - 1] === 'file' 
      ? pathParts[pathParts.length - 2] 
      : pathParts[pathParts.length - 1];
    const isPoster = pathParts.includes("poster");
    const forceDownload = url.searchParams.get("download") === "1";

    console.log(`Serving ${isPoster ? 'poster' : 'file'} for attachment ID:`, attachmentId);

    // Get user from JWT (check both Authorization header and token query param)
    let authHeader = req.headers.get("Authorization");
    const tokenParam = url.searchParams.get("token");
    
    if (!authHeader && tokenParam) {
      authHeader = `Bearer ${tokenParam}`;
    }
    
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

    // Check user profile first
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';

    // Try to get attachment from charge_attachments first
    let attachment: any = null;
    let ownerId: string | null = null;

    const { data: chargeAttachment } = await supabase
      .from("charge_attachments")
      .select(`
        *,
        charges!inner(
          owner_id
        )
      `)
      .eq("id", attachmentId)
      .single();

    if (chargeAttachment) {
      attachment = chargeAttachment;
      ownerId = chargeAttachment.charges.owner_id;
    } else {
      // Try charge_message_attachments
      const { data: messageAttachment } = await supabase
        .from("charge_message_attachments")
        .select(`
          *,
          charge_messages!inner(
            charge_id
          )
        `)
        .eq("id", attachmentId)
        .single();

      if (messageAttachment) {
        // Get the charge to check owner
        const { data: charge } = await supabase
          .from("charges")
          .select("owner_id")
          .eq("id", messageAttachment.charge_messages.charge_id)
          .single();

        if (charge) {
          attachment = messageAttachment;
          ownerId = charge.owner_id;
        }
      }
    }

    if (!attachment) {
      return new Response(JSON.stringify({ error: "Attachment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check permission: user is owner OR team member
    const isOwner = ownerId === user.id;

    if (!isTeamMember && !isOwner) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine which file to serve
    const filePath = isPoster ? attachment.poster_path : attachment.file_path;
    const mimeType = isPoster ? "image/jpeg" : (attachment.mime_type || "application/octet-stream");
    const fileName = isPoster 
      ? attachment.file_name.replace(/\.[^.]+$/, '.jpg')
      : attachment.file_name;

    if (!filePath) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`File path: ${filePath}, MIME: ${mimeType}`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("attachments")
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Error downloading file:", downloadError);
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileBuffer = await fileData.arrayBuffer();
    const totalSize = fileBuffer.byteLength;

    console.log(`File size: ${totalSize} bytes`);

    // Handle HEAD requests
    if (req.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": mimeType,
          "Content-Length": totalSize.toString(),
          "Accept-Ranges": "bytes",
          "Cache-Control": isPoster ? "public, max-age=86400" : "private, max-age=3600",
        },
      });
    }

    // Handle Range requests for video streaming
    const rangeHeader = req.headers.get("Range");
    
    if (rangeHeader) {
      console.log(`Range request: ${rangeHeader}`);
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        const chunkSize = end - start + 1;

        console.log(`Serving range: ${start}-${end}/${totalSize}`);

        const chunk = fileBuffer.slice(start, end + 1);

        return new Response(chunk, {
          status: 206,
          headers: {
            ...corsHeaders,
            "Content-Type": mimeType,
            "Content-Range": `bytes ${start}-${end}/${totalSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize.toString(),
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
    }

    // Regular response (no range)
    const headers: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": mimeType,
      "Content-Length": totalSize.toString(),
      "Accept-Ranges": "bytes",
      "Cache-Control": isPoster ? "public, max-age=86400" : "private, max-age=3600",
    };

    // Add Content-Disposition ONLY for downloads (not for video playback)
    if (forceDownload && !isPoster) {
      headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
    } else if (mimeType.startsWith("video/")) {
      // For video, explicitly set inline to prevent download
      headers["Content-Disposition"] = `inline; filename="${fileName}"`;
    }

    console.log(`Serving full file (${totalSize} bytes)`);

    return new Response(fileBuffer, {
      status: 200,
      headers,
    });

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
