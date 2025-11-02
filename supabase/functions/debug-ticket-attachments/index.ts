import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1'
import { corsHeaders } from '../_shared/email-utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const url = new URL(req.url)
    const ticketId = url.pathname.split('/').pop()

    if (!ticketId) {
      return new Response(JSON.stringify({ error: 'Ticket ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verifica permissão
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isTeam = profile?.role === 'admin' || profile?.role === 'agent'

    const { data: ticket } = await supabase
      .from('tickets')
      .select('id, owner_id')
      .eq('id', ticketId)
      .single()

    if (!ticket) {
      return new Response(JSON.stringify({ error: 'Ticket not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!isTeam && ticket.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Setar contexto RLS
    await supabase.rpc('set_session_context', {
      p_role: profile?.role || 'owner',
      p_owner_id: ticket.owner_id
    })

    // Lista TODOS os anexos do ticket (debug)
    const { data: attachments, error: attachmentsError } = await supabase
      .from('ticket_attachments')
      .select('id, ticket_id, message_id, file_url, file_type, file_name, name, size_bytes, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })

    if (attachmentsError) throw attachmentsError

    console.log(`📊 Debug: Found ${attachments?.length || 0} attachments for ticket ${ticketId}`)

    return new Response(JSON.stringify({
      count: attachments?.length || 0,
      items: attachments || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error('❌ debug-ticket-attachments error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
