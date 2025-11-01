-- Create AI Settings table
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_prompt TEXT NOT NULL DEFAULT 'Você é a IA de atendimento da RIOS – Operação e Gestão de Hospedagens, usada internamente por administradores/atendentes para responder proprietários.
Nunca responda como se fosse "uma IA genérica".
Objetivo: redigir respostas claras, objetivas, em PT-BR, mantendo tom profissional, cordial e resolutivo.
Nunca invente fatos, dados de reservas ou promessas; se algo faltar, peça somente o essencial.
Jamais ofereça reembolso/compensação sem instrução explícita do atendente.
Prioridades: cumprir prazos (SLA), registrar orientações acionáveis, e orientar para o canal correto (portal).
Áreas-chave: tickets (dúvidas, manutenção, bloqueio de datas), cobranças com vencimento em 7 dias e possibilidade de contestação com anexo, e eventual débito em reservas futuras, conforme regras.',
  style_guide TEXT DEFAULT 'Voz: humana, simples, direta; 2–4 parágrafos; bullets só quando clarear.
Evite jargões técnicos.
Assinatura: "— Equipe RIOS".
Evitar frases do tipo "como IA".',
  guardrails TEXT DEFAULT 'Não compartilhar dados de outro proprietário.
Não prometer valores, upgrades, reembolsos ou descontos sem instrução explícita.
Em urgência/risco, escalar (orientar o atendente a marcar prioridade).
Se o assunto for fora do escopo, responda breve e direcione ao canal adequado.',
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  temperature NUMERIC NOT NULL DEFAULT 0.2,
  max_tokens INTEGER NOT NULL DEFAULT 800,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create AI Prompt Versions table
CREATE TABLE IF NOT EXISTS public.ai_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_settings_id UUID REFERENCES public.ai_settings(id) ON DELETE CASCADE,
  system_prompt TEXT NOT NULL,
  style_guide TEXT,
  guardrails TEXT,
  model TEXT NOT NULL,
  temperature NUMERIC NOT NULL,
  max_tokens INTEGER NOT NULL,
  changelog TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create AI Templates table
CREATE TABLE IF NOT EXISTS public.ai_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  template_prompt TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create AI Usage Logs table
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  charge_id UUID REFERENCES public.charges(id) ON DELETE SET NULL,
  template_key TEXT,
  request_tokens INTEGER,
  response_tokens INTEGER,
  model TEXT NOT NULL,
  latency_ms INTEGER,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT
);

-- Enable RLS
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_settings (admin only)
CREATE POLICY "Admin can manage ai_settings"
  ON public.ai_settings
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for ai_prompt_versions (admin only)
CREATE POLICY "Admin can view ai_prompt_versions"
  ON public.ai_prompt_versions
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can create ai_prompt_versions"
  ON public.ai_prompt_versions
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for ai_templates (team can view, admin can edit)
CREATE POLICY "Team can view ai_templates"
  ON public.ai_templates
  FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Admin can manage ai_templates"
  ON public.ai_templates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for ai_usage_logs (team can view)
CREATE POLICY "Team can view ai_usage_logs"
  ON public.ai_usage_logs
  FOR SELECT
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team can create ai_usage_logs"
  ON public.ai_usage_logs
  FOR INSERT
  WITH CHECK (is_team_member(auth.uid()));

-- Trigger to update updated_at on ai_settings
CREATE TRIGGER update_ai_settings_updated_at
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to update updated_at on ai_templates
CREATE TRIGGER update_ai_templates_updated_at
  BEFORE UPDATE ON public.ai_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default ai_settings
INSERT INTO public.ai_settings (id) 
VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- Insert default templates
INSERT INTO public.ai_templates (key, label, template_prompt, order_index) VALUES
('bloqueio_data', 'Bloqueio de data', 
'Tarefa: redigir resposta pedindo os dados mínimos para bloquear data da unidade.

Inclua: data(s), intervalo/horário, motivo breve (ex.: manutenção, uso pessoal), se é dia inteiro, e confirmação de autorização. 
Se o ticket já trouxer datas/motivo, apenas confirme o entendimento e peça só o que falta.
Finalize avisando prazo padrão de até 24h e que enviaremos a confirmação por aqui.', 1),

('cobranca_7dias', 'Cobrança – 7 dias',
'Tarefa: redigir mensagem ao proprietário explicando a cobrança cadastrada (usar valores/datas do contexto).
Inclua: valor (formato R$ 0.000,00), vencimento D+7, como pagar (link/PIX conforme contexto), e opções:
- Anexar comprovante (botão na própria cobrança),
- Contestar no prazo (anexando evidências).
Avise que, após o prazo sem pagamento/contestação procedente, o valor poderá ser debitado de reservas futuras, conforme Regras de Cobrança.
Tom cordial e objetivo.', 2),

('duvida_manutencao', 'Dúvida de manutenção',
'Tarefa: responder dúvida técnica simples do proprietário.
Inclua passo-a-passo curto ou a orientação operacional (abrir ticket de manutenção, indicar fotos/vídeo, acesso ao imóvel).
Se faltar dado essencial, peça só o mínimo.', 3),

('informacao_geral', 'Informação geral',
'Tarefa: redigir resposta de esclarecimento, objetiva, com links do portal quando fizer sentido.', 4)
ON CONFLICT (key) DO NOTHING;