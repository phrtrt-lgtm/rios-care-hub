import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1'
import { corsHeaders } from '../_shared/email-utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    // Create client with user's token for auth validation
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    })
    
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { ticketId } = await req.json()

    if (!ticketId) {
      return new Response(JSON.stringify({ error: 'Ticket ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Busca perfil do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    console.log(`👤 User ${user.id} has role: ${profile?.role}`)

    const isTeam = profile?.role === 'admin' || profile?.role === 'agent'

    // Seta contexto de sessão para RLS
    await supabase.rpc('set_session_context', {
      p_role: profile?.role || 'owner',
      p_owner_id: user.id
    })

    console.log(`🔍 Searching for ticket ${ticketId}`)

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, owner_id')
      .eq('id', ticketId)
      .single()

    if (ticketError) {
      console.error(`❌ Error fetching ticket:`, ticketError)
    }

    console.log(`🎫 Ticket found:`, ticket ? 'Yes' : 'No')

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
        const { data: attachments, error: attachmentsError } = await supabase
          .from('ticket_attachments')
          .select('id, file_url, file_name, file_type, size_bytes')
          .eq('message_id', message.id)
          .order('created_at', { ascending: true })

        if (attachmentsError) {
          console.error(`❌ Error fetching attachments for message ${message.id}:`, attachmentsError)
        }

        console.log(`📎 Message ${message.id} has ${attachments?.length || 0} attachments`)

        return {
          ...message,
          attachments: attachments || []
        }
      })
    )

    console.log(`✅ Retrieved ${messagesWithAttachments.length} messages for ticket ${ticketId}`)
    console.log(`📊 Total attachments: ${messagesWithAttachments.reduce((sum, m) => sum + (m.attachments?.length || 0), 0)}`)

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
