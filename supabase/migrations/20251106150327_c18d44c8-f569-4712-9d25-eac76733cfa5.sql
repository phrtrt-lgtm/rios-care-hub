-- Atualizar o template de email de vistoria com o novo HTML profissional
UPDATE email_templates
SET 
  subject = 'Nova vistoria de faxina • {{property_name}}',
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
                      {{#if cleaner_phone}} — <a href="tel:{{cleaner_phone}}" style="color:#0f3150;text-decoration:underline;">{{cleaner_phone}}</a>{{/if}}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">
                      <strong>Data:</strong> {{inspection_date}}
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
                  <strong>Resumo:</strong>
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