import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface InspectionPayload {
  property_id: string;
  cleaner_name?: string;
  cleaner_phone?: string;
  notes?: string;
  transcript?: string;
  audio_url?: string;
  attachments?: Array<{
    file_url: string;
    file_name?: string;
    file_type?: string;
    size_bytes?: number;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const payload: InspectionPayload = await req.json();
    console.log('Creating inspection:', payload);

    // 1) Create inspection record
    const { data: inspection, error: inspError } = await supabase
      .from('cleaning_inspections')
      .insert({
        property_id: payload.property_id,
        cleaner_name: payload.cleaner_name,
        cleaner_phone: payload.cleaner_phone,
        notes: payload.notes,
        transcript: payload.transcript,
        audio_url: payload.audio_url,
      })
      .select()
      .single();

    if (inspError) throw inspError;
    console.log('Inspection created:', inspection.id);

    // 2) Create attachments
    if (payload.attachments?.length) {
      const attachmentRecords = payload.attachments.map(att => ({
        inspection_id: inspection.id,
        file_url: att.file_url,
        file_name: att.file_name,
        file_type: att.file_type,
        size_bytes: att.size_bytes,
      }));

      const { error: attError } = await supabase
        .from('cleaning_inspection_attachments')
        .insert(attachmentRecords);

      if (attError) console.error('Error creating attachments:', attError);
    }

    // 3) Get property and settings
    const { data: property } = await supabase
      .from('properties')
      .select('*, profiles!properties_owner_id_fkey(*)')
      .eq('id', payload.property_id)
      .single();

    const { data: settings } = await supabase
      .from('inspection_settings')
      .select('*')
      .eq('property_id', payload.property_id)
      .single();

    console.log('Property:', property?.name, 'Settings:', settings);

    // 4) Create Monday item
    let mondayItemId: string | null = null;
    const mondayEnabled = Deno.env.get('MONDAY_ENABLED') === 'true';
    
    if (mondayEnabled) {
      try {
        mondayItemId = await createMondayItem({
          unitName: property?.name || 'Imóvel',
          notes: payload.transcript || payload.notes || '',
          attachments: payload.attachments || [],
          audioUrl: payload.audio_url,
        });

        if (mondayItemId) {
          await supabase
            .from('cleaning_inspections')
            .update({ monday_item_id: mondayItemId })
            .eq('id', inspection.id);
        }
      } catch (e) {
        console.error('Monday error:', e);
      }
    }

    // 5) Send email to team
    const teamEmails = (Deno.env.get('TEAM_NOTIFY_EMAILS') || '')
      .split(',')
      .map(e => e.trim())
      .filter(Boolean);

    if (teamEmails.length > 0) {
      const portalUrl = `${Deno.env.get('PUBLIC_BASE_URL') || 'https://rios-care-hub.lovable.app'}/admin/vistorias/${inspection.id}`;
      
      await resend.emails.send({
        from: Deno.env.get('MAIL_FROM') || 'RIOS <onboarding@resend.dev>',
        to: teamEmails,
        subject: `[Vistoria] ${property?.name || 'Imóvel'} • ${new Date().toLocaleString('pt-BR')}`,
        html: `
          <h2>Nova vistoria de faxina</h2>
          <p><b>Imóvel:</b> ${property?.name || 'Imóvel'}</p>
          <p><b>Faxineira:</b> ${payload.cleaner_name || ''} ${payload.cleaner_phone ? `(${payload.cleaner_phone})` : ''}</p>
          <p><b>Resumo:</b> ${(payload.transcript || payload.notes || '').slice(0, 400)}</p>
          <p><a href="${portalUrl}">Abrir no Portal</a>${mondayItemId ? ` • Item Monday: <b>${mondayItemId}</b>` : ''}</p>
        `,
      });
    }

    // 6) Create ticket for owner if configured
    if (settings?.notify_owner && property) {
      const { data: ticket } = await supabase
        .from('tickets')
        .insert({
          owner_id: property.owner_id,
          property_id: property.id,
          subject: `Vistoria de Faxina – ${property.name}`,
          description: payload.transcript || payload.notes || 'Vistoria registrada com anexos.',
          ticket_type: 'duvida',
          priority: 'normal',
          status: 'novo',
          created_by: property.owner_id,
        })
        .select()
        .single();

      if (ticket) {
        await supabase.from('ticket_messages').insert({
          ticket_id: ticket.id,
          author_id: property.owner_id,
          body: 'Vistoria de faxina registrada. Verifique os detalhes e anexos.',
          is_internal: false,
        });

        const ownerProfile = property.profiles;
        if (ownerProfile?.email) {
          await resend.emails.send({
            from: Deno.env.get('MAIL_FROM') || 'RIOS <onboarding@resend.dev>',
            to: ownerProfile.email,
            subject: `Ticket aberto: Vistoria • ${property.name}`,
            html: `
              <p>Olá ${ownerProfile.name}, abrimos um ticket com a vistoria de faxina da sua unidade.</p>
              <p><a href="${Deno.env.get('PUBLIC_BASE_URL') || 'https://rios-care-hub.lovable.app'}/ticket/${ticket.id}">Acessar ticket</a></p>
            `,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, id: inspection.id, mondayItemId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function createMondayItem({
  unitName,
  notes,
  attachments,
  audioUrl,
}: {
  unitName: string;
  notes: string;
  attachments: Array<{ file_url: string; file_name?: string }>;
  audioUrl?: string;
}) {
  const mondayToken = Deno.env.get('MONDAY_API_TOKEN');
  if (!mondayToken) return null;

  const boardId = Deno.env.get('MONDAY_BOARD_ID');
  const colUnit = Deno.env.get('MONDAY_COL_UNIT_NAME') || 'imovel';
  const colDate = Deno.env.get('MONDAY_COL_DATE') || 'data_vistoria';
  const colNotes = Deno.env.get('MONDAY_COL_NOTES') || 'texto_vistoria';

  const columnValues: Record<string, any> = {};
  columnValues[colUnit] = unitName;
  columnValues[colDate] = { date: new Date().toISOString().slice(0, 10) };
  columnValues[colNotes] = notes.slice(0, 9500);

  const mutation = `
    mutation($boardId: Int!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id:$boardId, item_name:$itemName, column_values:$columnValues) { id }
    }
  `;

  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': mondayToken,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        boardId: Number(boardId),
        itemName: `Vistoria • ${unitName}`,
        columnValues: JSON.stringify(columnValues),
      },
    }),
  });

  const json = await response.json();
  return json?.data?.create_item?.id;
}
