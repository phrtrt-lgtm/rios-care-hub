
INSERT INTO public.email_templates (key, name, description, subject, body_html, available_variables)
SELECT
  'reserve_debit_retroactive',
  'Débito em Reserva - Retroativo',
  'Enviado ao proprietário quando o débito em reserva é efetuado imediatamente (retroativo), com uma ou mais reservas usadas e possível saldo credor.',
  'Débito efetuado em reserva - {{property_name}}',
$html$<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><title>Débito em Reserva Efetuado</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;">
      <tr><td align="center" style="padding:24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr><td style="background:#0f3150;padding:20px;">
            <h1 style="margin:0;font-size:20px;line-height:24px;color:#ffffff;">Rios • Portal do Proprietário</h1>
          </td></tr>
          <tr><td style="padding:24px;">
            <h2 style="margin:0 0 12px;font-size:18px;color:#0f3150;">Débito em Reserva Efetuado</h2>
            <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#334155;">
              Olá <strong>{{owner_name}}</strong>, o débito referente às cobranças abaixo já foi <strong>efetuado</strong> por meio de retenção em reserva(s) de <strong>{{property_name}}</strong>.
            </p>
            <div style="margin:16px 0;padding:14px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;">
              <p style="margin:0;color:#1e3a8a;font-size:14px;">
                <strong>Débito já efetuado em {{debit_date}}.</strong> Nenhuma ação é necessária da sua parte — as cobranças abaixo já estão quitadas.
              </p>
            </div>
            <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Cobrança(s):</strong> {{charge_title}}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Valor retido total:</strong> {{debt_amount}}</p>
            {{reservations_table}}
            {{surplus_block}}
            <p style="margin:20px 0 0;font-size:13px;color:#64748b;">
              Você pode acompanhar o histórico completo em <a href="{{portal_url}}" style="color:#0f3150;">Minhas Cobranças</a>.
            </p>
          </td></tr>
          <tr><td style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">
            © Rios Hospedagens — este é um e-mail automático.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>$html$,
  '["owner_name","property_name","charge_title","debt_amount","debit_date","reservations_table","surplus_block","portal_url"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE key = 'reserve_debit_retroactive');
