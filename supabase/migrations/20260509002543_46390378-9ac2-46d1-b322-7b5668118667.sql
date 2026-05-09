INSERT INTO public.email_templates (key, name, description, subject, body_html, available_variables)
VALUES
(
  'curation_paid_owner',
  'Curadoria Paga - Proprietária',
  'Enviado à proprietária quando o pagamento da curadoria é confirmado e o acesso ao portal é liberado.',
  '🎉 Acesso liberado · Bem-vinda à RIOS',
  $HTML$<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Acesso liberado · RIOS</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">Pagamento de {{amount}} confirmado. Seu acesso ao portal está liberado.</div>
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
              <td style="padding:24px;background:#ffffff;">
                <div style="text-align:center;padding:16px 0 24px;">
                  <div style="display:inline-block;background:#10b981;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;">🎉</div>
                </div>
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:26px;color:#0f3150;text-align:center;">
                  Bem-vinda à RIOS, {{owner_first_name}}!
                </h2>
                <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;text-align:center;">
                  Pagamento confirmado. Seu imóvel entra agora na operação completa da RIOS.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background:#f5f7fb;border-radius:8px;">
                  <tr><td style="padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;"><strong>Curadoria:</strong> {{curation_title}}</td></tr>
                  <tr><td style="padding:0 16px 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;color:#10b981;"><strong>Valor pago:</strong> {{amount}}</td></tr>
                </table>
                <h3 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#0f3150;">O que acontece agora</h3>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                  <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">🛒 <strong>Compras centralizadas</strong> — fornecedores parceiros recebem o pedido em até 48h.</td></tr>
                  <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">🔧 <strong>Instalação e montagem</strong> — frete, montagem e ajustes pela equipe RIOS.</td></tr>
                  <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">📸 <strong>Sessão de fotos</strong> — fotografia profissional para destacar o imóvel.</td></tr>
                  <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding:6px 0;">📈 <strong>No ar nas plataformas</strong> — anúncios otimizados e precificação dinâmica.</td></tr>
                </table>
                <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">Acesse o portal a qualquer momento:</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                  <tr><td align="center"><a href="{{portal_url}}" style="display:inline-block;padding:12px 32px;background:#d36b4d;color:#ffffff;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;">Acessar o portal RIOS</a></td></tr>
                </table>
                <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#64748b;text-align:center;">Use o e-mail e a senha que você cadastrou.</p>
                <p style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#64748b;"><strong>Custos de execução:</strong> frete, montagem e instalação são consolidados pela equipe e cobrados de forma transparente na sua plataforma RIOS, junto das demais cobranças do imóvel.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px;text-align:center;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#64748b;">RIOS Hospedagens · sistema@rioshospedagens.com.br</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>$HTML$,
  '["owner_first_name", "owner_name", "amount", "curation_title", "portal_url"]'::jsonb
),
(
  'curation_paid_team',
  'Curadoria Paga - Equipe',
  'Alerta interno enviado à equipe RIOS quando uma proprietária paga a curadoria.',
  '💰 Curadoria paga · {{owner_name}} · {{amount}}',
  $HTML$<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Curadoria paga · RIOS</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">{{owner_name}} pagou {{amount}} - acesso liberado automaticamente.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f3150;padding:20px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;">Rios • Alerta interno</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;background:#ffffff;">
                <div style="text-align:center;padding:8px 0 20px;">
                  <div style="display:inline-block;background:#10b981;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:28px;">💰</div>
                </div>
                <h2 style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;text-align:center;">{{owner_name}} pagou {{amount}}</h2>
                <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#64748b;text-align:center;">Curadoria confirmada · proprietária promovida automaticamente.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background:#f5f7fb;border-radius:8px;">
                  <tr><td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;width:140px;">Proprietária</td><td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f3150;font-weight:600;">{{owner_name}}</td></tr>
                  <tr><td style="padding:0 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">E-mail</td><td style="padding:0 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#11243a;">{{owner_email}}</td></tr>
                  <tr><td style="padding:0 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">Curadoria</td><td style="padding:0 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#11243a;">{{curation_title}}</td></tr>
                  <tr><td style="padding:0 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">Valor</td><td style="padding:0 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#10b981;font-weight:700;">{{amount}}</td></tr>
                  <tr><td style="padding:0 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">MP Payment ID</td><td style="padding:0 16px 12px;font-family:'SF Mono',Menlo,monospace;font-size:12px;color:#11243a;">{{payment_id}}</td></tr>
                  <tr><td style="padding:0 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">Curadoria ID</td><td style="padding:0 16px 12px;font-family:'SF Mono',Menlo,monospace;font-size:12px;color:#11243a;">{{curation_id_short}}</td></tr>
                </table>
                <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;"><strong>Ação automática:</strong> proprietária promovida para <strong>etapa 04 (active)</strong>. Já tem acesso completo ao portal.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 0;">
                  <tr><td align="center"><a href="{{admin_url}}" style="display:inline-block;padding:12px 32px;background:#0f3150;color:#ffffff;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;">Abrir admin</a></td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px;text-align:center;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#64748b;">RIOS Hospedagens · Operação e Gestão</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>$HTML$,
  '["owner_name", "owner_email", "amount", "curation_title", "curation_id_short", "payment_id", "admin_url"]'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  available_variables = EXCLUDED.available_variables,
  updated_at = now();