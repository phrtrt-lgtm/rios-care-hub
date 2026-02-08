import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTemplate, getTemplate } from "../_shared/template-renderer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface ChecklistData {
  ac_filters_cleaned?: boolean;
  batteries_replaced?: boolean;
  ac_working?: string;
  ac_notes?: string;
  tv_internet_working?: string;
  tv_internet_notes?: string;
  outlets_switches_working?: string;
  outlets_switches_notes?: string;
  doors_locks_working?: string;
  doors_locks_notes?: string;
  curtains_rods_working?: string;
  curtains_rods_notes?: string;
  bathroom_working?: string;
  bathroom_notes?: string;
  furniture_working?: string;
  furniture_notes?: string;
  kitchen_working?: string;
  kitchen_notes?: string;
  glasses_count?: number | null;
  pillows_count?: number | null;
}

interface InspectionPayload {
  property_id: string;
  cleaner_name?: string;
  cleaner_phone?: string;
  notes?: string;
  internal_only?: boolean;
  is_routine?: boolean;
  checklist_data?: ChecklistData | null;
  audio_data?: Array<{
    audio_url: string;
    transcript: string;
    summary?: string;
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
    
    // Combinar todos os resumos da IA
    const transcriptSummary = payload.audio_data
      ?.filter(a => a.summary?.trim())
      .map(a => a.summary?.trim())
      .join('\n\n') || '';
    
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
        transcript_summary: transcriptSummary,
        audio_url: firstAudioUrl,
        internal_only: payload.internal_only ?? false,
        is_routine: payload.is_routine ?? false,
      })
      .select()
      .single();

    if (inspError) throw inspError;
    console.log('Inspection created:', inspection.id);

    // 2) Create routine checklist if this is a routine inspection
    if (payload.is_routine && payload.checklist_data) {
      const { error: checklistError } = await supabase
        .from('routine_inspection_checklists')
        .insert({
          inspection_id: inspection.id,
          ac_filters_cleaned: payload.checklist_data.ac_filters_cleaned ?? false,
          batteries_replaced: payload.checklist_data.batteries_replaced ?? false,
          ac_working: payload.checklist_data.ac_working || null,
          ac_notes: payload.checklist_data.ac_notes || null,
          tv_internet_working: payload.checklist_data.tv_internet_working || null,
          tv_internet_notes: payload.checklist_data.tv_internet_notes || null,
          outlets_switches_working: payload.checklist_data.outlets_switches_working || null,
          outlets_switches_notes: payload.checklist_data.outlets_switches_notes || null,
          doors_locks_working: payload.checklist_data.doors_locks_working || null,
          doors_locks_notes: payload.checklist_data.doors_locks_notes || null,
          curtains_rods_working: payload.checklist_data.curtains_rods_working || null,
          curtains_rods_notes: payload.checklist_data.curtains_rods_notes || null,
          bathroom_working: payload.checklist_data.bathroom_working || null,
          bathroom_notes: payload.checklist_data.bathroom_notes || null,
          furniture_working: payload.checklist_data.furniture_working || null,
          furniture_notes: payload.checklist_data.furniture_notes || null,
          kitchen_working: payload.checklist_data.kitchen_working || null,
          kitchen_notes: payload.checklist_data.kitchen_notes || null,
          glasses_count: payload.checklist_data.glasses_count ?? null,
          pillows_count: payload.checklist_data.pillows_count ?? null,
        });

      if (checklistError) {
        console.error('Error creating checklist:', checklistError);
      } else {
        console.log('Routine checklist created for inspection:', inspection.id);
      }
    }

    // 3) Create attachments
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

    // 4) Get property and settings
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

    // 5) Create Monday item
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
          transcriptSummary: transcriptSummary || '',
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

    // 5) Send notifications via dedicated edge function
    try {
      await supabase.functions.invoke('send-inspection-email', {
        body: {
          inspectionId: inspection.id,
          propertyId: payload.property_id,
        },
      });
      console.log('Inspection notification triggered');
    } catch (error) {
      console.error('Error triggering inspection notification:', error);
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
  transcriptSummary,
  attachments,
  audioUrl,
}: {
  ownerName: string;
  unitName: string;
  inspectionDate: string;
  cleanerName: string;
  status: string;
  transcript: string;
  transcriptSummary: string;
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
  // Include both transcript and AI summary
  const fullTranscript = transcriptSummary 
    ? `📋 RESUMO IA:\n${transcriptSummary}\n\n📝 TRANSCRIÇÃO:\n${transcript}` 
    : transcript;
  columnValues[colTranscript] = fullTranscript.slice(0, 9500);
  
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
