-- Inserir template de email para pagamento confirmado
INSERT INTO email_templates (key, name, description, subject, body_html, available_variables)
VALUES (
  'charge_paid',
  'Pagamento Confirmado',
  'Email enviado ao proprietário quando o pagamento de uma cobrança é confirmado',
  'Pagamento Confirmado - {{charge_title}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .success-icon { font-size: 48px; margin-bottom: 10px; }
    .amount { font-size: 32px; font-weight: bold; color: #10b981; margin: 20px 0; }
    .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .label { color: #6b7280; }
    .value { font-weight: 600; }
    .button { background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✅</div>
      <h1>Pagamento Confirmado!</h1>
    </div>
    <div class="content">
      <p>Olá {{owner_name}},</p>
      
      <p>Temos uma ótima notícia! Seu pagamento foi confirmado com sucesso.</p>
      
      <div class="amount">{{due_amount}}</div>
      
      <div class="details">
        <div class="detail-row">
          <span class="label">Cobrança:</span>
          <span class="value">{{charge_title}}</span>
        </div>
        <div class="detail-row">
          <span class="label">Imóvel:</span>
          <span class="value">{{property_name}}</span>
        </div>
        <div class="detail-row">
          <span class="label">Data Pagamento:</span>
          <span class="value">{{paid_date}}</span>
        </div>
      </div>
      
      <p>Você pode visualizar o comprovante e todos os detalhes da cobrança no portal:</p>
      
      <center>
        <a href="{{charge_url}}" class="button">Ver Detalhes da Cobrança</a>
      </center>
      
      <p>Obrigado por manter seus pagamentos em dia!</p>
      
      <p>Atenciosamente,<br>
      <strong>Equipe RIOS</strong></p>
    </div>
    <div class="footer">
      Este é um email automático. Em caso de dúvidas, entre em contato conosco.
    </div>
  </div>
</body>
</html>',
  jsonb_build_array(
    'owner_name',
    'charge_title',
    'charge_description',
    'total_amount',
    'management_contribution',
    'due_amount',
    'maintenance_date',
    'paid_date',
    'property_name',
    'property_address',
    'charge_url'
  )
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  available_variables = EXCLUDED.available_variables,
  updated_at = now();