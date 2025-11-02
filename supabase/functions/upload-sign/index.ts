import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { v4 as uuid } from 'https://esm.sh/uuid@10.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sanitizeFilename(name: string) {
  const noAccent = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cleaned = noAccent
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 140);
  return cleaned || `file-${Date.now()}`;
}

function buildStorageKey(opts: { kind: 'ticket-draft' | 'ticket-message'; ownerId?: string; ticketId?: string; filename: string }) {
  const safe = sanitizeFilename(opts.filename);
  const id = uuid();
  if (opts.kind === 'ticket-draft') {
    return `tickets/${opts.ownerId}/drafts/${id}-${safe}`;
  }
  return `tickets/${opts.ticketId}/messages/${id}-${safe}`;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    });

    // Get user from auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user profile to check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, id')
      .eq('id', user.id)
      .single();

    const body = await req.json();
    const { scope, ownerId, ticketId, filename } = body;

    if (!filename || !scope) {
      return new Response(
        JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Permission checks
    if (profile?.role !== 'admin' && profile?.role !== 'agent') {
      if (scope === 'ticket-draft') {
        if (!ownerId || ownerId !== user.id) {
          return new Response(
            JSON.stringify({ error: 'Forbidden' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    let key: string;
    if (scope === 'ticket-draft') {
      key = buildStorageKey({ kind: 'ticket-draft', ownerId: ownerId || user.id, filename });
    } else {
      key = buildStorageKey({ kind: 'ticket-message', ticketId: ticketId!, filename });
    }

    return new Response(
      JSON.stringify({ key }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('uploads/sign error', err);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
