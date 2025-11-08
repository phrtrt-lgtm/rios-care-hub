-- Atualizar template de email de proposta criada
INSERT INTO email_templates (key, name, description, subject, body_html, available_variables)
VALUES (
  'proposal_created',
  'Nova Proposta de Votação',
  'Email enviado aos proprietários quando uma nova proposta de votação é criada',
  'Nova Proposta: {{title}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">📋 Nova Proposta de Votação</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Olá <strong>{{owner_name}}</strong>,
              </p>
              
              <p style="margin: 0 0 30px; color: #666666; font-size: 15px; line-height: 1.6;">
                Uma nova proposta de votação foi criada e precisa da sua participação:
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                <h2 style="margin: 0 0 15px; color: #333333; font-size: 20px; font-weight: 600;">{{title}}</h2>
                <p style="margin: 0; color: #666666; font-size: 15px; line-height: 1.6;">{{description}}</p>
                {{#if amount}}
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                  <p style="margin: 0; color: #333333; font-size: 16px;">
                    <strong>Valor:</strong> <span style="color: #667eea; font-weight: 600;">{{amount}}</span>
                  </p>
                </div>
                {{/if}}
              </div>
              
              <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 0 0 30px; border-radius: 4px;">
                <p style="margin: 0; color: #856404; font-size: 14px;">
                  ⏰ <strong>Prazo para votação:</strong> {{deadline}}
                </p>
              </div>
              
              <p style="margin: 0 0 20px; color: #666666; font-size: 15px; line-height: 1.6;">
                Por favor, acesse o sistema para registrar seu voto o quanto antes.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px; color: #999999; font-size: 13px;">
                Este é um email automático, por favor não responda.
              </p>
              <p style="margin: 0; color: #999999; font-size: 13px;">
                © 2025 Sistema de Gestão de Propriedades
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  '["owner_name", "title", "description", "amount", "deadline"]'::jsonb
)
ON CONFLICT (key) 
DO UPDATE SET
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  available_variables = EXCLUDED.available_variables,
  updated_at = now();