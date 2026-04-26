UPDATE public.email_templates
SET body_html = $TEMPLATE$<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Novo ticket criado</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">{{owner_name}} criou um novo ticket: {{ticket_subject}}.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(15,49,80,0.08);">
            <!-- Header -->
            <tr>
              <td style="background:#0f3150;padding:22px 28px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;letter-spacing:0.3px;">
                  RIOS • Sistema Interno
                </h1>
                <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#a5b8cf;">Operação e Gestão de Hospedagens</p>
              </td>
            </tr>

            <!-- Title -->
            <tr>
              <td style="padding:24px 28px 8px;background:#ffffff;">
                <h2 style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:26px;color:#0f3150;">
                  🎫 Novo ticket criado
                </h2>
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#64748b;">
                  Recebemos uma nova solicitação no portal.
                </p>
              </td>
            </tr>

            <!-- Meta info -->
            <tr>
              <td style="padding:8px 28px 4px;background:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                  <tr>
                    <td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#334155;">
                      <strong style="color:#0f3150;">Proprietário:</strong> {{owner_name}}<br>
                      <strong style="color:#0f3150;">Imóvel:</strong> {{property_name}}<br>
                      <strong style="color:#0f3150;">Assunto:</strong> {{ticket_subject}}<br>
                      <strong style="color:#0f3150;">Tipo:</strong> {{ticket_type}}<br>
                      <strong style="color:#0f3150;">Prioridade:</strong> {{ticket_priority_badge}}<br>
                      <strong style="color:#0f3150;">Data:</strong> {{created_date}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Description (HTML rendered from markdown) -->
            <tr>
              <td style="padding:18px 28px 8px;background:#ffffff;">
                <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;">
                  Conteúdo da solicitação
                </p>
                <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;">
                  {{ticket_description_html}}
                </div>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td align="center" style="padding:20px 28px 28px;background:#ffffff;">
                <a href="{{ticket_url}}" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;text-align:center;font-weight:600;">
                  Abrir ticket no portal
                </a>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 28px;background:#f0f2f7;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#64748b;text-align:center;">
                  Este é um e-mail automático do sistema interno RIOS.<br>
                  © RIOS Hospedagens — Operação e Gestão.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>$TEMPLATE$,
    updated_at = now()
WHERE key = 'ticket_created_team';