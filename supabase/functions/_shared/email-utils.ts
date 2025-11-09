// Email template utility functions for Deno edge functions

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export interface ChargeEmailData {
  ownerName: string;
  chargeTitle: string;
  amountBRL: string;
  totalAmount?: string;
  managementContribution?: string;
  dueAmount?: string;
  maintenanceDate?: string;
  dueDate: string;
  paymentLink?: string;
  description?: string;
  contestDeadline?: string;
  portalUrl: string;
}

export function generateChargeEmailHTML(data: ChargeEmailData): string {
  const {
    ownerName,
    chargeTitle,
    amountBRL,
    totalAmount,
    managementContribution,
    dueAmount,
    maintenanceDate,
    dueDate,
    paymentLink,
    description,
    contestDeadline,
    portalUrl
  } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nova Cobrança - RIOS</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">RIOS</h1>
      <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 14px;">Operação e Gestão de Hospedagens</p>
    </div>
    
    <div style="padding: 40px 32px;">
      <p style="color: #1a1a1a; font-size: 16px; margin: 0 0 24px 0;">Olá ${ownerName},</p>
      
      <p style="color: #4a4a4a; font-size: 15px; margin: 0 0 24px 0;">
        Uma nova cobrança foi cadastrada para sua unidade:
      </p>
      
      <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 0 0 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 12px 0; color: #1a1a1a;"><strong>Descrição:</strong> ${chargeTitle}</p>
        ${maintenanceDate ? `<p style="margin: 0 0 12px 0; color: #2563eb;"><strong>📅 Data da Manutenção:</strong> ${maintenanceDate}</p>` : ''}
        ${totalAmount ? `<p style="margin: 0 0 8px 0; color: #4a4a4a;"><strong>Total:</strong> ${totalAmount}</p>` : ''}
        ${managementContribution ? `<p style="margin: 0 0 8px 0; color: #4a4a4a;"><strong>Aporte de Gestão:</strong> ${managementContribution}</p>` : ''}
        <p style="margin: 0 0 12px 0; color: #1a1a1a; font-size: 18px;"><strong>Valor Devido:</strong> <span style="color: #667eea; font-size: 24px; font-weight: 600;">${dueAmount || amountBRL}</span></p>
        <p style="margin: 0; color: #1a1a1a;"><strong>Vencimento:</strong> ${dueDate}</p>
      </div>
      
      ${description ? `
      <div style="margin: 0 0 24px 0;">
        <p style="color: #4a4a4a; font-size: 14px; margin: 0;">${description}</p>
      </div>
      ` : ''}
      
      <div style="margin: 32px 0;">
        ${paymentLink ? `
        <a href="${paymentLink}" style="display: inline-block; background-color: #667eea; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 15px; margin-bottom: 12px;">
          Pagar Agora
        </a>
        <br>
        ` : ''}
        <a href="${portalUrl}" style="display: inline-block; background-color: transparent; color: #667eea; text-decoration: none; padding: 14px 32px; border: 2px solid #667eea; border-radius: 6px; font-weight: 600; font-size: 15px;">
          Acessar Portal
        </a>
      </div>
      
      ${contestDeadline ? `
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          <strong>Importante:</strong> Você pode contestar esta cobrança até ${contestDeadline}, anexando evidências através do portal.
        </p>
      </div>
      ` : ''}
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      
      <p style="color: #6b7280; font-size: 13px; margin: 0;">
        Em caso de dúvidas, responda este e-mail ou acesse o portal para abrir um ticket de suporte.
      </p>
      
      <p style="color: #1a1a1a; font-size: 14px; margin: 24px 0 0 0;">
        Atenciosamente,<br>
        <strong>Equipe RIOS</strong>
      </p>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        © ${new Date().getFullYear()} RIOS - Operação e Gestão de Hospedagens<br>
        Este é um e-mail automático, por favor não responda.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
