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
    const ticketId = url.pathname.split('/')[url.pathname.split('/').length - 2]
    const body = await req.json()

    if (!ticketId) {
      return new Response(JSON.stringify({ error: 'Ticket ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { message, attachments, is_internal } = body

    if (!message && (!attachments || attachments.length === 0)) {
      return new Response(JSON.stringify({ error: 'Message or attachments required' }), {
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

    // Setar contexto RLS antes de qualquer query
    await supabase.rpc('set_session_context', {
      p_role: profile?.role || 'owner',
      p_owner_id: user.id
    })

    const { data: ticket } = await supabase
      .from('tickets')
      .select('id, owner_id, status')
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

    if (ticket.status === 'concluido' || ticket.status === 'cancelado') {
      return new Response(JSON.stringify({ error: 'Cannot add messages to closed tickets' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Cria a mensagem
    const { data: messageData, error: messageError } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: ticketId,
        author_id: user.id,
        body: message || '',
        is_internal: is_internal || false
      })
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
      .single()

    if (messageError) throw messageError

    // Insere anexos se houver
    const insertedAttachments = []
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        if (!att.file_url) continue
        
        const { data: attachmentData, error: attachmentError } = await supabase
          .from('ticket_attachments')
          .insert({
            message_id: messageData.id,
            ticket_id: ticketId,
            file_url: att.file_url,
            file_name: att.file_name || null,
            file_type: att.file_type || null,
            size_bytes: att.size_bytes || null,
            path: att.path || null
          })
          .select('id, file_url, file_name, file_type, size_bytes')
          .single()

        if (attachmentError) {
          console.error('Attachment insert error:', attachmentError)
        } else {
          insertedAttachments.push(attachmentData)
        }
      }
    }

    // Atualiza o ticket
    await supabase
      .from('tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticketId)

    console.log(`✅ Created message ${messageData.id} with ${insertedAttachments.length} attachments for ticket ${ticketId}`)

    return new Response(JSON.stringify({
      ...messageData,
      attachments: insertedAttachments
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error('❌ create-ticket-message error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
