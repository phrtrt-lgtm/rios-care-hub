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

    // Busca mensagens com anexos
    const { data: messages, error: messagesError } = await supabase
      .from('ticket_messages')
      .select(`
        id,
        body,
        created_at,
        author_id,
        is_internal,
        profiles!ticket_messages_author_id_fkey (
          name,
          photo_url,
          role
        )
      `)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })

    if (messagesError) throw messagesError

    // Busca anexos para cada mensagem
    const messagesWithAttachments = await Promise.all(
      (messages || []).map(async (message) => {
        const { data: attachments } = await supabase
          .from('ticket_attachments')
          .select('id, file_url, file_name, file_type, size_bytes')
          .eq('message_id', message.id)
          .order('created_at', { ascending: true })

        return {
          ...message,
          attachments: attachments || []
        }
      })
    )

    console.log(`✅ Retrieved ${messagesWithAttachments.length} messages for ticket ${ticketId}`)

    return new Response(JSON.stringify(messagesWithAttachments), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error('❌ get-ticket-messages error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
