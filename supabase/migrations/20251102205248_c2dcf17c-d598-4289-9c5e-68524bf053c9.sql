-- Create email templates table
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  subject text NOT NULL,
  body_html text NOT NULL,
  available_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Admins can manage templates
CREATE POLICY "Admins can manage email templates"
  ON public.email_templates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Team can view templates
CREATE POLICY "Team can view email templates"
  ON public.email_templates
  FOR SELECT
  USING (is_team_member(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates
INSERT INTO public.email_templates (key, name, description, subject, body_html, available_variables) VALUES
(
  'ticket_created_owner',
  'Ticket Criado - Notificação ao Proprietário',
  'Email enviado ao proprietário quando ele cria um ticket',
  'Chamado #{{ticket_id_short}} criado com sucesso',
  '<h1>Chamado criado com sucesso!</h1>
<p>Olá {{owner_name}},</p>
<p>Seu chamado foi recebido e nossa equipe está analisando.</p>
<p><strong>Assunto:</strong> {{ticket_subject}}</p>
<p><strong>Tipo:</strong> {{ticket_type}}</p>
<p><strong>Prioridade:</strong> {{ticket_priority}}</p>
{{#if property_name}}
<p><strong>Unidade:</strong> {{property_name}}</p>
{{/if}}
<p><strong>Previsão de primeira resposta:</strong> {{sla_time}}</p>
<p>Agradecemos pela confiança!</p>
<p>— Equipe RIOS</p>',
  '["owner_name", "owner_email", "ticket_id", "ticket_id_short", "ticket_subject", "ticket_type", "ticket_priority", "ticket_description", "property_name", "property_address", "sla_time", "created_date"]'::jsonb
),
(
  'ticket_created_team',
  'Ticket Criado - Notificação à Equipe',
  'Email enviado à equipe quando um novo ticket é criado',
  'Novo chamado: {{ticket_subject}}',
  '<h1>Novo chamado criado</h1>
<p><strong>Cliente:</strong> {{owner_name}} ({{owner_email}})</p>
<p><strong>Assunto:</strong> {{ticket_subject}}</p>
<p><strong>Tipo:</strong> {{ticket_type}}</p>
<p><strong>Prioridade:</strong> {{ticket_priority_badge}}</p>
{{#if property_name}}
<p><strong>Unidade:</strong> {{property_name}}</p>
{{/if}}
<p><strong>Descrição:</strong></p>
<p>{{ticket_description}}</p>
<p><strong>Data de criação:</strong> {{created_date}}</p>
<p>— Sistema RIOS</p>',
  '["owner_name", "owner_email", "ticket_id", "ticket_id_short", "ticket_subject", "ticket_type", "ticket_priority", "ticket_priority_badge", "ticket_description", "property_name", "property_address", "sla_time", "created_date"]'::jsonb
),
(
  'ticket_message_owner',
  'Nova Mensagem no Ticket - Proprietário',
  'Email enviado ao proprietário quando a equipe responde',
  'Nova resposta no seu chamado #{{ticket_id_short}}',
  '<h1>Nova mensagem no seu chamado</h1>
<p>Olá {{owner_name}},</p>
<p>Recebemos uma nova resposta da equipe no seu chamado:</p>
<p><strong>Assunto:</strong> {{ticket_subject}}</p>
<p><strong>Mensagem:</strong></p>
<div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #2563eb; margin: 10px 0;">
{{message_body}}
</div>
<p><strong>Respondido por:</strong> {{author_name}}</p>
<p><strong>Data:</strong> {{message_date}}</p>
<p>— Equipe RIOS</p>',
  '["owner_name", "owner_email", "ticket_id", "ticket_id_short", "ticket_subject", "message_body", "author_name", "message_date"]'::jsonb
),
(
  'ticket_message_team',
  'Nova Mensagem no Ticket - Equipe',
  'Email enviado à equipe quando o proprietário responde',
  'Nova mensagem do proprietário - Chamado #{{ticket_id_short}}',
  '<h1>Nova mensagem do proprietário</h1>
<p><strong>Cliente:</strong> {{owner_name}} ({{owner_email}})</p>
<p><strong>Chamado:</strong> {{ticket_subject}}</p>
<p><strong>Mensagem:</strong></p>
<div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #2563eb; margin: 10px 0;">
{{message_body}}
</div>
<p><strong>Data:</strong> {{message_date}}</p>
<p>— Sistema RIOS</p>',
  '["owner_name", "owner_email", "ticket_id", "ticket_id_short", "ticket_subject", "message_body", "message_date"]'::jsonb
),
(
  'charge_created',
  'Cobrança Criada',
  'Email enviado quando uma nova cobrança é criada',
  '[RIOS] Nova cobrança – {{charge_title}}',
  '<h1>Nova cobrança disponível</h1>
<p>Olá {{owner_name}},</p>
<p>Uma nova cobrança foi registrada em sua conta:</p>
<p><strong>Título:</strong> {{charge_title}}</p>
{{#if charge_description}}
<p><strong>Descrição:</strong> {{charge_description}}</p>
{{/if}}
<p><strong>Valor:</strong> {{charge_amount}}</p>
<p><strong>Vencimento:</strong> {{charge_due_date}}</p>
{{#if property_name}}
<p><strong>Unidade:</strong> {{property_name}}</p>
{{/if}}
{{#if payment_link}}
<p><a href="{{payment_link}}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">Pagar Agora</a></p>
{{/if}}
<p><strong>Prazo para contestação:</strong> {{contest_deadline}}</p>
<p>Você pode contestar esta cobrança através do portal até a data limite, anexando comprovantes se necessário.</p>
<p><a href="{{portal_url}}">Acessar Portal</a></p>
<p>— Equipe RIOS</p>',
  '["owner_name", "owner_email", "charge_id", "charge_title", "charge_description", "charge_amount", "charge_due_date", "payment_link", "contest_deadline", "portal_url", "property_name", "property_address"]'::jsonb
),
(
  'charge_reminder_48h',
  'Lembrete de Cobrança - 48h',
  'Email enviado 48h antes do vencimento',
  '[RIOS] Lembrete: cobrança vence em 2 dias – {{charge_title}}',
  '<h1>Lembrete: Cobrança vence em 2 dias</h1>
<p>Olá {{owner_name}},</p>
<p>Este é um lembrete de que você tem uma cobrança com vencimento próximo:</p>
<p><strong>Título:</strong> {{charge_title}}</p>
<p><strong>Valor:</strong> {{charge_amount}}</p>
<p><strong>Vencimento:</strong> {{charge_due_date}}</p>
{{#if payment_link}}
<p><a href="{{payment_link}}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">Pagar Agora</a></p>
{{/if}}
<p><a href="{{portal_url}}">Acessar Portal</a></p>
<p>— Equipe RIOS</p>',
  '["owner_name", "owner_email", "charge_id", "charge_title", "charge_amount", "charge_due_date", "payment_link", "portal_url"]'::jsonb
),
(
  'charge_reminder_24h',
  'Lembrete de Cobrança - 24h',
  'Email enviado 24h antes do vencimento',
  '[RIOS] Lembrete: cobrança vence amanhã – {{charge_title}}',
  '<h1>Lembrete: Cobrança vence amanhã</h1>
<p>Olá {{owner_name}},</p>
<p>Este é um lembrete de que você tem uma cobrança com vencimento amanhã:</p>
<p><strong>Título:</strong> {{charge_title}}</p>
<p><strong>Valor:</strong> {{charge_amount}}</p>
<p><strong>Vencimento:</strong> {{charge_due_date}}</p>
{{#if payment_link}}
<p><a href="{{payment_link}}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">Pagar Agora</a></p>
{{/if}}
<p><a href="{{portal_url}}">Acessar Portal</a></p>
<p>— Equipe RIOS</p>',
  '["owner_name", "owner_email", "charge_id", "charge_title", "charge_amount", "charge_due_date", "payment_link", "portal_url"]'::jsonb
),
(
  'charge_reminder_day',
  'Lembrete de Cobrança - Dia do Vencimento',
  'Email enviado no dia do vencimento',
  '[RIOS] Última chance: cobrança vence hoje – {{charge_title}}',
  '<h1>Cobrança vence hoje</h1>
<p>Olá {{owner_name}},</p>
<p>Este é um lembrete de que você tem uma cobrança com vencimento hoje:</p>
<p><strong>Título:</strong> {{charge_title}}</p>
<p><strong>Valor:</strong> {{charge_amount}}</p>
<p><strong>Vencimento:</strong> HOJE ({{charge_due_date}})</p>
{{#if payment_link}}
<p><a href="{{payment_link}}" style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">Pagar Agora</a></p>
{{/if}}
<p><a href="{{portal_url}}">Acessar Portal</a></p>
<p>— Equipe RIOS</p>',
  '["owner_name", "owner_email", "charge_id", "charge_title", "charge_amount", "charge_due_date", "payment_link", "portal_url"]'::jsonb
),
(
  'charge_overdue',
  'Cobrança Vencida',
  'Email enviado quando a cobrança está vencida',
  '[RIOS] Cobrança vencida – {{charge_title}}',
  '<h1 style="color: #dc2626;">Cobrança Vencida</h1>
<p>Olá {{owner_name}},</p>
<p>Identificamos que a seguinte cobrança está vencida:</p>
<p><strong>Título:</strong> {{charge_title}}</p>
<p><strong>Valor:</strong> {{charge_amount}}</p>
<p><strong>Vencimento:</strong> {{charge_due_date}}</p>
<p style="color: #dc2626; font-weight: bold;">Status: VENCIDA</p>
{{#if payment_link}}
<p><a href="{{payment_link}}" style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">Regularizar Pagamento</a></p>
{{/if}}
<p>Por favor, regularize esta pendência o quanto antes.</p>
<p><a href="{{portal_url}}">Acessar Portal</a></p>
<p>— Equipe RIOS</p>',
  '["owner_name", "owner_email", "charge_id", "charge_title", "charge_amount", "charge_due_date", "payment_link", "portal_url"]'::jsonb
),
(
  'charge_debit_notice',
  'Aviso de Débito em Reserva',
  'Email enviado quando a cobrança será debitada em reserva futura',
  '[RIOS] Aviso: débito será realizado em reserva futura – {{charge_title}}',
  '<h1>Aviso de Débito em Reserva Futura</h1>
<p>Olá {{owner_name}},</p>
<p>Informamos que a cobrança abaixo está vencida e será debitada automaticamente em sua próxima reserva:</p>
<p><strong>Título:</strong> {{charge_title}}</p>
<p><strong>Valor:</strong> {{charge_amount}}</p>
<p><strong>Vencimento original:</strong> {{charge_due_date}}</p>
<p>Este débito será realizado conforme previsto nas regras de cobrança.</p>
{{#if payment_link}}
<p>Se preferir, você ainda pode realizar o pagamento antecipadamente:</p>
<p><a href="{{payment_link}}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">Pagar Agora</a></p>
{{/if}}
<p><a href="{{portal_url}}">Acessar Portal</a></p>
<p>— Equipe RIOS</p>',
  '["owner_name", "owner_email", "charge_id", "charge_title", "charge_amount", "charge_due_date", "payment_link", "portal_url"]'::jsonb
),
(
  'charge_message_owner',
  'Nova Mensagem na Cobrança - Proprietário',
  'Email enviado ao proprietário quando a equipe responde na cobrança',
  'Nova resposta na cobrança: {{charge_title}}',
  '<h1>Nova mensagem na sua cobrança</h1>
<p>Olá {{owner_name}},</p>
<p>Recebemos uma nova resposta da equipe na sua cobrança:</p>
<p><strong>Cobrança:</strong> {{charge_title}}</p>
<p><strong>Mensagem:</strong></p>
<div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #2563eb; margin: 10px 0;">
{{message_body}}
</div>
<p><strong>Respondido por:</strong> {{author_name}}</p>
<p><strong>Data:</strong> {{message_date}}</p>
<p><a href="{{portal_url}}">Acessar Portal</a></p>
<p>— Equipe RIOS</p>',
  '["owner_name", "owner_email", "charge_id", "charge_title", "message_body", "author_name", "message_date", "portal_url"]'::jsonb
),
(
  'charge_message_team',
  'Nova Mensagem na Cobrança - Equipe',
  'Email enviado à equipe quando o proprietário responde na cobrança',
  'Nova mensagem do proprietário na cobrança: {{charge_title}}',
  '<h1>Nova mensagem do proprietário</h1>
<p><strong>Cliente:</strong> {{owner_name}} ({{owner_email}})</p>
<p><strong>Cobrança:</strong> {{charge_title}}</p>
<p><strong>Mensagem:</strong></p>
<div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #2563eb; margin: 10px 0;">
{{message_body}}
</div>
<p><strong>Data:</strong> {{message_date}}</p>
<p>— Sistema RIOS</p>',
  '["owner_name", "owner_email", "charge_id", "charge_title", "message_body", "message_date"]'::jsonb
),
(
  'alert_created',
  'Alerta Criado',
  'Email enviado quando um alerta é criado',
  '[RIOS] {{alert_type_label}}: {{alert_title}}',
  '<div style="border-left: 4px solid {{alert_color}}; padding: 15px; background: #f9fafb;">
<h1 style="color: {{alert_color}}; margin-top: 0;">{{alert_type_emoji}} {{alert_type_label}}</h1>
<h2>{{alert_title}}</h2>
<p>{{alert_message}}</p>
{{#if alert_expires_at}}
<p><strong>Válido até:</strong> {{alert_expires_at}}</p>
{{/if}}
<p><strong>Enviado em:</strong> {{created_date}}</p>
</div>
<p>— Equipe RIOS</p>',
  '["alert_title", "alert_message", "alert_type", "alert_type_label", "alert_type_emoji", "alert_color", "alert_expires_at", "created_date"]'::jsonb
),
(
  'approval_request',
  'Solicitação de Aprovação',
  'Email enviado aos admins quando há um novo cadastro pendente',
  'Novo cadastro aguardando aprovação',
  '<h1>Novo cadastro para aprovação</h1>
<p><strong>Nome:</strong> {{user_name}}</p>
<p><strong>E-mail:</strong> {{user_email}}</p>
<p><strong>Telefone:</strong> {{user_phone}}</p>
<p>Acesse o painel administrativo para aprovar ou recusar este cadastro.</p>
<p>— Sistema RIOS</p>',
  '["user_name", "user_email", "user_phone"]'::jsonb
),
(
  'approval_approved',
  'Cadastro Aprovado',
  'Email enviado ao usuário quando seu cadastro é aprovado',
  'Seu acesso foi aprovado!',
  '<h1>Bem-vindo ao Portal RIOS!</h1>
<p>Olá {{user_name}},</p>
<p>Seu cadastro foi aprovado com sucesso!</p>
<p>Você já pode acessar o portal e abrir seus chamados.</p>
<p>Estamos à disposição para atendê-lo!</p>
<p>— Equipe RIOS</p>',
  '["user_name", "user_email"]'::jsonb
);