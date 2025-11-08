import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) {
      throw new Error('Unauthorized');
    }

    const { ticketId } = await req.json();

    if (!ticketId) {
      throw new Error('ticketId is required');
    }

    // Get ticket details with all related data
    const { data: ticket, error: ticketError } = await supabaseClient
      .from('tickets')
      .select(`
        *,
        owner:profiles!tickets_owner_id_fkey(name, email),
        property:properties(name, address),
        messages:ticket_messages(
          id,
          body,
          created_at,
          attachments:ticket_attachments(*)
        )
      `)
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      throw new Error('Ticket not found');
    }

    // Check Monday integration
    const mondayEnabled = Deno.env.get('MONDAY_ENABLED') === 'true';
    if (!mondayEnabled) {
      return new Response(
        JSON.stringify({ error: 'Monday integration is not enabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mondayToken = Deno.env.get('MONDAY_API_TOKEN');
    const boardId = '18370925775'; // Board de Chamados Importados

    if (!mondayToken) {
      throw new Error('Monday API token not configured');
    }

    // First, let's query the board columns to show the user
    const columnsQuery = `
      query {
        boards(ids: [${boardId}]) {
          columns {
            id
            title
            type
          }
        }
      }
    `;

    const columnsResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayToken,
      },
      body: JSON.stringify({ query: columnsQuery }),
    });

    const columnsData = await columnsResponse.json();
    console.log('Monday board columns:', JSON.stringify(columnsData?.data?.boards?.[0]?.columns, null, 2));

    // Get column IDs from environment or use defaults from Monday board logs
    const colDate = Deno.env.get('MONDAY_COL_TICKET_DATE') || 'data';
    const colOwner = Deno.env.get('MONDAY_COL_TICKET_OWNER') || 'text_mkxg7kvy'; // Proprietário
    const colUnit = Deno.env.get('MONDAY_COL_TICKET_UNIT') || 'text_mkxghmwg'; // Unidade
    const colTitle = Deno.env.get('MONDAY_COL_TICKET_TITLE') || 'text_mkxgmm85'; // Título
    const colDescription = Deno.env.get('MONDAY_COL_TICKET_DESCRIPTION') || 'text_mkxg9nq'; // Descrição
    const colAttachments = Deno.env.get('MONDAY_COL_TICKET_ATTACHMENTS') || 'file_mkxg8wzx'; // Arquivos

    // Build column values
    const columnValues: Record<string, any> = {};

    // Date
    if (ticket.created_at) {
      columnValues[colDate] = {
        date: new Date(ticket.created_at).toISOString().split('T')[0]
      };
    }

    // Owner
    if (ticket.owner?.name) {
      columnValues[colOwner] = ticket.owner.name;
    }

    // Unit - handle case where property might be null
    if (ticket.property?.name) {
      columnValues[colUnit] = ticket.property.name;
    } else if (ticket.property_id === null) {
      columnValues[colUnit] = 'Sem unidade';
    }

    // Title
    if (ticket.subject) {
      columnValues[colTitle] = ticket.subject;
    }

    // Description
    if (ticket.description) {
      columnValues[colDescription] = ticket.description;
    }

    console.log('Column values to send:', JSON.stringify(columnValues, null, 2));

    // Create Monday item
    const itemName = `${ticket.subject || 'Ticket'} - ${ticket.owner?.name || 'Sem proprietário'}`;
    
    const mutation = `
      mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
        create_item(
          board_id: $boardId,
          item_name: $itemName,
          column_values: $columnValues
        ) {
          id
        }
      }
    `;

    const variables = {
      boardId: boardId,
      itemName: itemName,
      columnValues: JSON.stringify(columnValues),
    };

    console.log('Creating Monday item with:', JSON.stringify(variables, null, 2));

    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayToken,
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables,
      }),
    });

    const json = await response.json();
    console.log('Monday create item response:', JSON.stringify(json, null, 2));

    if (json.errors) {
      console.error('Monday API errors:', json.errors);
      throw new Error(`Monday API error: ${JSON.stringify(json.errors)}`);
    }

    const mondayItemId = json.data?.create_item?.id;

    if (!mondayItemId) {
      throw new Error('Failed to create Monday item');
    }

    // Upload attachments if any
    const allAttachments: any[] = [];
    if (ticket.messages) {
      for (const message of ticket.messages) {
        if (message.attachments) {
          allAttachments.push(...message.attachments);
        }
      }
    }

    if (allAttachments.length > 0) {
      console.log(`Uploading ${allAttachments.length} attachments to Monday item ${mondayItemId}`);
      
      for (const attachment of allAttachments) {
        try {
          // Download file from Supabase
          const { data: fileData, error: downloadError } = await supabaseClient
            .storage
            .from('attachments')
            .download(attachment.path);

          if (downloadError || !fileData) {
            console.error('Error downloading attachment:', downloadError);
            continue;
          }

          // Get file as array buffer
          const arrayBuffer = await fileData.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Create form data for Monday upload
          const formData = new FormData();
          const blob = new Blob([uint8Array], { type: attachment.mime_type || 'application/octet-stream' });
          const fileName = attachment.file_name || `file-${attachment.id}`;
          
          // Monday.com file upload GraphQL mutation
          const uploadQuery = `mutation ($file: File!) {
            add_file_to_column (
              item_id: ${mondayItemId}, 
              column_id: "${colAttachments}", 
              file: $file
            ) {
              id
            }
          }`;
          
          formData.append('query', uploadQuery);
          formData.append('variables[file]', blob, fileName);

          const uploadResponse = await fetch('https://api.monday.com/v2/file', {
            method: 'POST',
            headers: {
              'Authorization': mondayToken,
            },
            body: formData,
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error(`Monday upload failed for ${fileName}:`, errorText);
            continue;
          }

          const uploadResult = await uploadResponse.json();
          console.log(`Successfully uploaded ${fileName}:`, uploadResult);
        } catch (e) {
          console.error(`Error uploading file to Monday:`, e);
        }
      }
    }

    // Update ticket to mark as exported
    await supabaseClient
      .from('tickets')
      .update({ 
        updated_at: new Date().toISOString()
      })
      .eq('id', ticketId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        mondayItemId,
        mondayUrl: `https://phrtrts-team.monday.com/boards/${boardId}/pulses/${mondayItemId}`,
        columnsFound: columnsData?.data?.boards?.[0]?.columns
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('Error in export-ticket-to-monday:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
