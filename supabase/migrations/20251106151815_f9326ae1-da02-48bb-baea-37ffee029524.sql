-- Update all email templates with improved design

-- 1. Update inspection_created template (with your edits)
UPDATE email_templates
SET 
  subject = 'Nova vistoria de faxina - {{property_name}}',
  body_html = '<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Nova vistoria de faxina</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:#d36b4d !important; }
      }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">Vistoria registrada para {{property_name}} em {{inspection_date}}. Áudios Transcritos disponíveis no Portal.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Portal do Proprietário
                </h1>
              </td>
            </tr>
            <tr>
              <td class="card" style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;">
                  Nova vistoria de faxina
                </h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Imóvel:</strong> {{property_name}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Faxineira:</strong> {{cleaner_name}}                  
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Data e Horário:</strong> {{inspection_date}}
                    </td>
                  </tr>
                  {{#if has_audio}}
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Áudio:</strong> Disponível
                    </td>
                  </tr>
                  {{/if}}
                </table>
                <p class="text" style="margin:12px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  <strong>Áudio Transcrito:</strong>
                </p>
                <p class="text" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  {{inspection_notes}}
                </p>
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{portal_url}}" arcsize="10%" stroke="f" fillcolor="#d36b4d" style="height:44px;v-text-anchor:middle;width:220px;">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;">Abrir no Portal</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="{{portal_url}}" class="btn" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;">
                  Abrir no Portal
                </a>
                <!--<![endif]-->
                <p class="muted" style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  <strong>Observações:</strong> Áudios Transcritos{{#if has_audio}} — a transcrição do áudio da vistoria está disponível no Portal.{{/if}}
                  {{#if monday_item_id}} · Item Monday: <strong>{{monday_item_id}}</strong>{{/if}}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f0f2f7;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#334155;">
                        Abraços,<br><strong>Equipe RIOS</strong>
                      </p>
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#64748b;">
                        Este é um e-mail automático. Em caso de dúvidas, acesse o Portal.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  updated_at = now()
WHERE key = 'inspection_created';

-- 2. Update charge_created template
UPDATE email_templates
SET 
  subject = 'Nova cobrança - {{charge_title}}',
  body_html = '<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Nova cobrança</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:#d36b4d !important; }
      }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">Nova cobrança de {{charge_amount}} com vencimento em {{due_date}}.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Portal do Proprietário
                </h1>
              </td>
            </tr>
            <tr>
              <td class="card" style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;">
                  Nova cobrança
                </h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Descrição:</strong> {{charge_title}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Valor:</strong> {{charge_amount}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Vencimento:</strong> {{due_date}}
                    </td>
                  </tr>
                  {{#if property_name}}
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Imóvel:</strong> {{property_name}}
                    </td>
                  </tr>
                  {{/if}}
                </table>
                {{#if charge_description}}
                <p class="text" style="margin:12px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  <strong>Detalhes:</strong>
                </p>
                <p class="text" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  {{charge_description}}
                </p>
                {{/if}}
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{charge_url}}" arcsize="10%" stroke="f" fillcolor="#d36b4d" style="height:44px;v-text-anchor:middle;width:220px;">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;">Ver Cobrança</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="{{charge_url}}" class="btn" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;">
                  Ver Cobrança
                </a>
                <!--<![endif]-->
                <p class="muted" style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  <strong>Importante:</strong> Você tem 7 dias para contestar esta cobrança através do Portal. Após este prazo, o valor poderá ser debitado de suas próximas reservas.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f0f2f7;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#334155;">
                        Abraços,<br><strong>Equipe RIOS</strong>
                      </p>
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#64748b;">
                        Este é um e-mail automático. Em caso de dúvidas, acesse o Portal.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  available_variables = '["charge_title", "charge_description", "charge_amount", "due_date", "property_name", "charge_url"]'::jsonb,
  updated_at = now()
WHERE key = 'charge_created';

-- 3. Update charge_reminder template
UPDATE email_templates
SET 
  subject = 'Lembrete: Cobrança vence em breve - {{charge_title}}',
  body_html = '<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Lembrete de cobrança</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:#d36b4d !important; }
      }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">Lembrete: Cobrança de {{charge_amount}} vence em {{due_date}}.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Portal do Proprietário
                </h1>
              </td>
            </tr>
            <tr>
              <td class="card" style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;">
                  ⏰ Lembrete: Cobrança vence em breve
                </h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Descrição:</strong> {{charge_title}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Valor:</strong> {{charge_amount}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Vencimento:</strong> {{due_date}}
                    </td>
                  </tr>
                </table>
                <p class="text" style="margin:12px 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  Este é um lembrete de que você possui uma cobrança pendente. Por favor, verifique os detalhes no Portal.
                </p>
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{charge_url}}" arcsize="10%" stroke="f" fillcolor="#d36b4d" style="height:44px;v-text-anchor:middle;width:220px;">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;">Ver Cobrança</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="{{charge_url}}" class="btn" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;">
                  Ver Cobrança
                </a>
                <!--<![endif]-->
                <p class="muted" style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  <strong>Importante:</strong> Você ainda pode contestar esta cobrança através do Portal. Após o prazo, o valor poderá ser debitado de suas próximas reservas.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f0f2f7;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#334155;">
                        Abraços,<br><strong>Equipe RIOS</strong>
                      </p>
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#64748b;">
                        Este é um e-mail automático. Em caso de dúvidas, acesse o Portal.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  available_variables = '["charge_title", "charge_amount", "due_date", "charge_url"]'::jsonb,
  updated_at = now()
WHERE key = 'charge_reminder';

-- 4. Update charge_overdue template
UPDATE email_templates
SET 
  subject = 'Cobrança vencida - {{charge_title}}',
  body_html = '<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Cobrança vencida</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:#d36b4d !important; }
      }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">Cobrança de {{charge_amount}} está vencida desde {{due_date}}.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Portal do Proprietário
                </h1>
              </td>
            </tr>
            <tr>
              <td class="card" style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#dc2626;">
                  ⚠️ Cobrança vencida
                </h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Descrição:</strong> {{charge_title}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Valor:</strong> {{charge_amount}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Vencimento:</strong> {{due_date}}
                    </td>
                  </tr>
                </table>
                <p class="text" style="margin:12px 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  Esta cobrança está vencida. O valor será debitado de suas próximas reservas conforme as regras de cobrança.
                </p>
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{charge_url}}" arcsize="10%" stroke="f" fillcolor="#d36b4d" style="height:44px;v-text-anchor:middle;width:220px;">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;">Ver Cobrança</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="{{charge_url}}" class="btn" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;">
                  Ver Cobrança
                </a>
                <!--<![endif]-->
                <p class="muted" style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  <strong>Atenção:</strong> Se você discorda desta cobrança, entre em contato através do Portal o mais breve possível.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f0f2f7;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#334155;">
                        Abraços,<br><strong>Equipe RIOS</strong>
                      </p>
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#64748b;">
                        Este é um e-mail automático. Em caso de dúvidas, acesse o Portal.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  available_variables = '["charge_title", "charge_amount", "due_date", "charge_url"]'::jsonb,
  updated_at = now()
WHERE key = 'charge_overdue';

-- 5. Update ticket_message_owner template
UPDATE email_templates
SET 
  subject = 'Nova mensagem no ticket: {{ticket_subject}}',
  body_html = '<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Nova mensagem no ticket</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:#d36b4d !important; }
      }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">A equipe RIOS respondeu seu ticket "{{ticket_subject}}".</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Portal do Proprietário
                </h1>
              </td>
            </tr>
            <tr>
              <td class="card" style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;">
                  💬 Nova mensagem no ticket
                </h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Assunto:</strong> {{ticket_subject}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>De:</strong> {{author_name}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Data:</strong> {{message_date}}
                    </td>
                  </tr>
                </table>
                <p class="text" style="margin:12px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  <strong>Mensagem:</strong>
                </p>
                <p class="text" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  {{message_body}}
                </p>
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{ticket_url}}" arcsize="10%" stroke="f" fillcolor="#d36b4d" style="height:44px;v-text-anchor:middle;width:220px;">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;">Ver Ticket</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="{{ticket_url}}" class="btn" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;">
                  Ver Ticket
                </a>
                <!--<![endif]-->
                <p class="muted" style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  <strong>Dica:</strong> Você pode responder diretamente no Portal para continuar a conversa.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f0f2f7;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#334155;">
                        Abraços,<br><strong>Equipe RIOS</strong>
                      </p>
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#64748b;">
                        Este é um e-mail automático. Em caso de dúvidas, acesse o Portal.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  available_variables = '["ticket_subject", "author_name", "message_body", "message_date", "ticket_url"]'::jsonb,
  updated_at = now()
WHERE key = 'ticket_message_owner';

-- 6. Update ticket_message_team template
UPDATE email_templates
SET 
  subject = 'Nova mensagem do proprietário: {{ticket_subject}}',
  body_html = '<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Nova mensagem do proprietário</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:#d36b4d !important; }
      }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">{{owner_name}} enviou uma nova mensagem no ticket "{{ticket_subject}}".</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Sistema Interno
                </h1>
              </td>
            </tr>
            <tr>
              <td class="card" style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;">
                  📨 Nova mensagem do proprietário
                </h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Proprietário:</strong> {{owner_name}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Ticket:</strong> {{ticket_subject}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Data:</strong> {{message_date}}
                    </td>
                  </tr>
                </table>
                <p class="text" style="margin:12px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  <strong>Mensagem:</strong>
                </p>
                <p class="text" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  {{message_body}}
                </p>
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{ticket_url}}" arcsize="10%" stroke="f" fillcolor="#d36b4d" style="height:44px;v-text-anchor:middle;width:220px;">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;">Ver Ticket</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="{{ticket_url}}" class="btn" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;">
                  Ver Ticket
                </a>
                <!--<![endif]-->
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f0f2f7;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#64748b;">
                        Este é um e-mail automático do sistema interno RIOS.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  available_variables = '["ticket_subject", "owner_name", "message_body", "message_date", "ticket_url"]'::jsonb,
  updated_at = now()
WHERE key = 'ticket_message_team';

-- 7. Update charge_message_owner template
UPDATE email_templates
SET 
  subject = 'Nova mensagem na cobrança: {{charge_title}}',
  body_html = '<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Nova mensagem na cobrança</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:#d36b4d !important; }
      }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">A equipe RIOS respondeu sobre a cobrança "{{charge_title}}".</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Portal do Proprietário
                </h1>
              </td>
            </tr>
            <tr>
              <td class="card" style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;">
                  💬 Nova mensagem na cobrança
                </h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Cobrança:</strong> {{charge_title}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>De:</strong> {{author_name}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Data:</strong> {{message_date}}
                    </td>
                  </tr>
                </table>
                <p class="text" style="margin:12px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  <strong>Mensagem:</strong>
                </p>
                <p class="text" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  {{message_body}}
                </p>
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{charge_url}}" arcsize="10%" stroke="f" fillcolor="#d36b4d" style="height:44px;v-text-anchor:middle;width:220px;">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;">Ver Cobrança</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="{{charge_url}}" class="btn" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;">
                  Ver Cobrança
                </a>
                <!--<![endif]-->
                <p class="muted" style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  <strong>Dica:</strong> Você pode responder diretamente no Portal para continuar a conversa.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f0f2f7;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#334155;">
                        Abraços,<br><strong>Equipe RIOS</strong>
                      </p>
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#64748b;">
                        Este é um e-mail automático. Em caso de dúvidas, acesse o Portal.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  available_variables = '["charge_title", "author_name", "message_body", "message_date", "charge_url"]'::jsonb,
  updated_at = now()
WHERE key = 'charge_message_owner';

-- 8. Update charge_message_team template
UPDATE email_templates
SET 
  subject = 'Nova mensagem do proprietário: {{charge_title}}',
  body_html = '<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Nova mensagem do proprietário</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:#d36b4d !important; }
      }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">{{owner_name}} enviou uma nova mensagem sobre a cobrança "{{charge_title}}".</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">
                  Rios • Sistema Interno
                </h1>
              </td>
            </tr>
            <tr>
              <td class="card" style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;">
                  📨 Nova mensagem do proprietário
                </h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Proprietário:</strong> {{owner_name}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Cobrança:</strong> {{charge_title}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Data:</strong> {{message_date}}
                    </td>
                  </tr>
                </table>
                <p class="text" style="margin:12px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  <strong>Mensagem:</strong>
                </p>
                <p class="text" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  {{message_body}}
                </p>
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{charge_url}}" arcsize="10%" stroke="f" fillcolor="#d36b4d" style="height:44px;v-text-anchor:middle;width:220px;">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;">Ver Cobrança</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="{{charge_url}}" class="btn" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;">
                  Ver Cobrança
                </a>
                <!--<![endif]-->
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f0f2f7;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#64748b;">
                        Este é um e-mail automático do sistema interno RIOS.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  available_variables = '["charge_title", "owner_name", "message_body", "message_date", "charge_url"]'::jsonb,
  updated_at = now()
WHERE key = 'charge_message_team';