-- Add fields to charges table for reserve debit tracking
ALTER TABLE public.charges 
ADD COLUMN IF NOT EXISTS reserve_debit_date date,
ADD COLUMN IF NOT EXISTS reserve_commission_percent numeric,
ADD COLUMN IF NOT EXISTS reserve_base_commission_percent numeric,
ADD COLUMN IF NOT EXISTS reserve_extra_commission_percent numeric,
ADD COLUMN IF NOT EXISTS reserve_owner_value_cents integer,
ADD COLUMN IF NOT EXISTS reserve_owner_receives_cents integer;

-- Add email template for reserve debit notification
INSERT INTO public.email_templates (key, name, description, subject, body_html, available_variables)
VALUES (
  'reserve_debit_notification',
  'Notificação de Débito em Reserva',
  'Email enviado ao proprietário quando uma cobrança é debitada via reserva com ajuste de comissão',
  'Débito em Reserva - {{property_name}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333;">Débito em Reserva</h2>
  
  <p>Olá <strong>{{owner_name}}</strong>,</p>
  
  <p>Informamos que a cobrança <strong>{{charge_title}}</strong> foi processada através do débito em reserva.</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin-top: 0; color: #495057;">📊 Detalhes do Cálculo</h3>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6;">Valor da Reserva (sua parte):</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; text-align: right; font-weight: bold;">{{owner_value}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6;">Débito a cobrir:</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; text-align: right; color: #dc3545;">- {{debt_amount}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: bold;">Valor que você receberá:</td>
        <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #28a745;">{{owner_receives}}</td>
      </tr>
    </table>
  </div>
  
  <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
    <h4 style="margin-top: 0; color: #856404;">⚙️ Ajuste de Comissão</h4>
    <p style="margin-bottom: 0;">
      Comissão base: <strong>{{base_commission}}%</strong><br>
      Extra para débito: <strong>{{extra_commission}}%</strong><br>
      <strong>Comissão total configurada: {{total_commission}}%</strong>
    </p>
  </div>
  
  {{#if reserve_date}}
  <p><strong>Data da reserva:</strong> {{reserve_date}}</p>
  {{/if}}
  
  <p>Acesse o <a href="{{portal_url}}" style="color: #007bff;">Portal do Proprietário</a> para mais detalhes.</p>
  
  <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">
    Atenciosamente,<br>
    <strong>Equipe RIOS</strong>
  </p>
</div>',
  '["owner_name", "charge_title", "property_name", "owner_value", "debt_amount", "owner_receives", "base_commission", "extra_commission", "total_commission", "reserve_date", "portal_url"]'::jsonb
) ON CONFLICT (key) DO NOTHING;