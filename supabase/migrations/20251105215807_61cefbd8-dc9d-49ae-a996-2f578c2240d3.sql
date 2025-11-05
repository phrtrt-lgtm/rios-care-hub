-- Inserir template de e-mail para notificação de vistoria
INSERT INTO email_templates (
  key,
  name,
  description,
  subject,
  body_html,
  available_variables
) VALUES (
  'inspection_created',
  'Vistoria Recebida',
  'E-mail enviado para a equipe quando uma nova vistoria de faxina é registrada',
  '[Vistoria] {{property_name}} • {{inspection_date}}',
  '<h2>Nova vistoria de faxina</h2>
<p><b>Imóvel:</b> {{property_name}}</p>
<p><b>Faxineira:</b> {{cleaner_name}} {{cleaner_phone}}</p>
<p><b>Data:</b> {{inspection_date}}</p>
{{#if has_audio}}
<p><b>Áudio:</b> Disponível</p>
{{/if}}
<p><b>Resumo:</b></p>
<p>{{inspection_notes}}</p>
<p><a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">Abrir no Portal</a></p>
{{#if monday_item_id}}
<p style="margin-top: 16px; color: #666;">Item Monday: <b>{{monday_item_id}}</b></p>
{{/if}}',
  '["property_name", "cleaner_name", "cleaner_phone", "inspection_date", "inspection_notes", "has_audio", "portal_url", "monday_item_id"]'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  available_variables = EXCLUDED.available_variables,
  updated_at = now();