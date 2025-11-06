import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from "../_shared/template-renderer.ts";

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
  audio_data?: Array<{
    audio_url: string;
    transcript: string;
  }>;
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
    
    // Combinar todas as transcrições numeradas
    const transcript = payload.audio_data?.map((a, idx) => {
      const audioNum = idx + 1;
      const text = a.transcript?.trim() || '(sem transcrição)';
      return `Áudio ${audioNum}: ${text}`;
    }).join(' | ') || '';
    const firstAudioUrl = payload.audio_data?.[0]?.audio_url;

    // 1) Create inspection record
    const { data: inspection, error: inspError } = await supabase
      .from('cleaning_inspections')
      .insert({
        property_id: payload.property_id,
        cleaner_name: payload.cleaner_name,
        cleaner_phone: payload.cleaner_phone,
        notes: payload.notes,
        transcript,
        audio_url: firstAudioUrl,
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

    console.log('Property:', property?.name, 'Owner:', property?.profiles?.name, 'Settings:', settings);

    // Get cleaner profile to send confirmation email
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    const { data: cleanerProfile } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('id', user?.id)
      .single();

    // 4) Create Monday item
    let mondayItemId: string | null = null;
    const mondayEnabled = Deno.env.get('MONDAY_ENABLED') === 'true';
    
    if (mondayEnabled) {
      try {
        // List board columns to help debug
        const boardId = Deno.env.get('MONDAY_BOARD_ID');
        const mondayToken = Deno.env.get('MONDAY_API_TOKEN');
        
        if (boardId && mondayToken) {
          const columnsQuery = `query { boards(ids: [${boardId}]) { columns { id title type } } }`;
          const columnsRes = await fetch('https://api.monday.com/v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': mondayToken },
            body: JSON.stringify({ query: columnsQuery }),
          });
          const columnsData = await columnsRes.json();
          console.log('Monday board columns:', JSON.stringify(columnsData?.data?.boards?.[0]?.columns, null, 2));
        }
        
        mondayItemId = await createMondayItem({
          ownerName: property?.profiles?.name || 'Proprietário',
          unitName: property?.name || 'Imóvel',
          inspectionDate: new Date().toISOString().slice(0, 10),
          cleanerName: payload.cleaner_name || 'Faxineira',
          status: payload.notes || '',
          transcript: transcript || '',
          attachments: payload.attachments || [],
          audioUrl: firstAudioUrl,
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

    // 5) Send email to team/admins using template
    const teamEmails = (Deno.env.get('ADMIN_NOTIFY_EMAILS') || '')
      .split(',')
      .map(e => e.trim())
      .filter(Boolean);

    console.log('Team emails to notify:', teamEmails);

    if (teamEmails.length > 0) {
      const portalUrl = `${Deno.env.get('PUBLIC_BASE_URL') || 'https://rios-care-hub.lovable.app'}/admin/vistorias/${inspection.id}`;
      
      try {
        const template = await getTemplate(supabase, 'inspection_created');
        
        if (template) {
          const variables = {
            property_name: property?.name || 'Imóvel',
            cleaner_name: payload.cleaner_name || '',
            cleaner_phone: payload.cleaner_phone ? `(${payload.cleaner_phone})` : '',
            inspection_date: new Date().toLocaleString('pt-BR'),
            inspection_notes: (transcript || payload.notes || '').slice(0, 400),
            has_audio: !!firstAudioUrl,
            portal_url: portalUrl,
            monday_item_id: mondayItemId || '',
          };

          const subject = renderTemplate(template.subject, variables);
          const body = renderTemplate(template.body_html, variables);
          
          await resend.emails.send({
            from: Deno.env.get('MAIL_FROM') || 'RIOS <onboarding@resend.dev>',
            to: teamEmails,
            subject,
            html: body,
          });
          
          console.log('Team notification email sent to:', teamEmails.join(', '));
        } else {
          // Fallback email for team if template doesn't exist
          await resend.emails.send({
            from: Deno.env.get('MAIL_FROM') || 'RIOS <onboarding@resend.dev>',
            to: teamEmails,
            subject: `[Vistoria] ${property?.name || 'Imóvel'} • ${new Date().toLocaleString('pt-BR')}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Nova Vistoria Registrada</h2>
                <p><strong>Unidade:</strong> ${property?.name || 'Imóvel'}</p>
                <p><strong>Faxineira:</strong> ${payload.cleaner_name || ''} ${payload.cleaner_phone ? `(${payload.cleaner_phone})` : ''}</p>
                <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                <p><strong>Status:</strong> ${payload.notes || ''}</p>
                ${transcript ? `<p><strong>Transcrição:</strong> ${transcript.slice(0, 400)}</p>` : ''}
                <p><a href="${portalUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px; margin-top: 16px;">Ver Detalhes</a></p>
                <p style="margin-top: 24px; color: #666; font-size: 12px;">— Equipe RIOS</p>
              </div>
            `,
          });
          
          console.log('Team fallback notification email sent to:', teamEmails.join(', '));
        }
      } catch (error) {
        console.error('Error sending team email:', error);
      }
    }

    // 6) Send email to owner if notify_owner is enabled
    if (settings?.notify_owner && property) {
      const ownerProfile = property.profiles;
      if (ownerProfile?.email) {
        const portalUrl = `${Deno.env.get('PUBLIC_BASE_URL') || 'https://rios-care-hub.lovable.app'}/vistorias/${inspection.id}`;
        
        try {
          // Always use fallback for owner notification
          await resend.emails.send({
            from: Deno.env.get('MAIL_FROM') || 'RIOS <onboarding@resend.dev>',
            to: ownerProfile.email,
            subject: `Nova Vistoria • ${property.name}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Nova Vistoria Registrada</h2>
                <p>Olá ${ownerProfile.name},</p>
                <p>Uma nova vistoria foi registrada para sua unidade <strong>${property.name}</strong>.</p>
                <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                <p><strong>Status:</strong> ${payload.notes || 'Informações disponíveis no portal'}</p>
                ${transcript ? `<p><strong>Observações:</strong> ${transcript.slice(0, 400)}</p>` : ''}
                <p><a href="${portalUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px; margin-top: 16px;">Ver Detalhes da Vistoria</a></p>
                <p style="margin-top: 24px; color: #666; font-size: 12px;">— Equipe RIOS</p>
              </div>
            `,
          });
          
          console.log('Owner notification email sent to:', ownerProfile.email);
        } catch (error) {
          console.error('Error sending owner email:', error);
      }
    }

    // 7) Send confirmation email to cleaner
    if (cleanerProfile?.email) {
      try {
        await resend.emails.send({
          from: Deno.env.get('MAIL_FROM') || 'RIOS <onboarding@resend.dev>',
          to: cleanerProfile.email,
          subject: 'Vistoria enviada com sucesso',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>✓ Vistoria Enviada</h2>
              <p>Olá ${cleanerProfile.name || payload.cleaner_name},</p>
              <p>Sua vistoria foi enviada com sucesso!</p>
              <p><strong>Unidade:</strong> ${property?.name || 'Imóvel'}</p>
              <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
              <p style="margin-top: 24px; color: #666; font-size: 12px;">— Equipe RIOS</p>
            </div>
          `,
        });
        
        console.log('Cleaner confirmation email sent to:', cleanerProfile.email);
      } catch (error) {
        console.error('Error sending cleaner confirmation email:', error);
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
  ownerName,
  unitName,
  inspectionDate,
  cleanerName,
  status,
  transcript,
  attachments,
  audioUrl,
}: {
  ownerName: string;
  unitName: string;
  inspectionDate: string;
  cleanerName: string;
  status: string;
  transcript: string;
  attachments: Array<{ file_url: string; file_name?: string }>;
  audioUrl?: string;
}) {
  const mondayToken = Deno.env.get('MONDAY_API_TOKEN');
  if (!mondayToken) return null;

  const boardId = Deno.env.get('MONDAY_BOARD_ID');
  const colUnit = Deno.env.get('MONDAY_COL_UNIT') || 'unidade';
  const colDate = Deno.env.get('MONDAY_COL_DATE') || 'data';
  const colCleaner = Deno.env.get('MONDAY_COL_CLEANER') || 'faxineira';
  const colStatus = Deno.env.get('MONDAY_COL_STATUS') || 'status';
  const colTranscript = Deno.env.get('MONDAY_COL_TRANSCRIPT') || 'transcricao';
  const colAttachments = Deno.env.get('MONDAY_COL_ATTACHMENTS') || 'arquivos';

  const columnValues: Record<string, any> = {};
  
  // Preencher valores das colunas
  columnValues[colUnit] = unitName;
  columnValues[colDate] = inspectionDate;
  columnValues[colCleaner] = cleanerName;
  columnValues[colStatus] = status;
  columnValues[colTranscript] = transcript.slice(0, 9500);
  
  console.log('Monday column values:', JSON.stringify(columnValues, null, 2));

  const mutation = `
    mutation($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id:$boardId, item_name:$itemName, column_values:$columnValues) { id }
    }
  `;
  
  console.log('Monday mutation variables:', {
    boardId: String(boardId),
    itemName: ownerName,
    columnValues: JSON.stringify(columnValues)
  });

  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': mondayToken,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        boardId: String(boardId),
        itemName: ownerName,
        columnValues: JSON.stringify(columnValues),
      },
    }),
  });

  const json = await response.json();
  console.log('Monday response:', json);
  
  if (json.errors) {
    console.error('Monday API errors:', json.errors);
    return null;
  }
  
  const itemId = json?.data?.create_item?.id;
  
  // Upload attachments to Monday
  if (itemId && attachments.length > 0) {
    for (const attachment of attachments) {
      try {
        // Download file from Supabase
        const fileResponse = await fetch(attachment.file_url);
        const fileBlob = await fileResponse.blob();
        
        // Upload to Monday
        const formData = new FormData();
        formData.append('query', `mutation ($file: File!) { add_file_to_column (item_id: ${itemId}, column_id: "${colAttachments}", file: $file) { id } }`);
        formData.append('variables[file]', fileBlob, attachment.file_name || 'file');
        
        const uploadResponse = await fetch('https://api.monday.com/v2/file', {
          method: 'POST',
          headers: {
            'Authorization': mondayToken,
          },
          body: formData,
        });
        
        const uploadJson = await uploadResponse.json();
        console.log('File upload response:', uploadJson);
      } catch (e) {
        console.error('Error uploading file to Monday:', e);
      }
    }
  }
  
  return itemId;
}
