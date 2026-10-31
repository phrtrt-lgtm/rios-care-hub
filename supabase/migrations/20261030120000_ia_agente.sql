-- Assistente de IA com ações (PLANO_IA_AGENTE.md, Fase 1).
--
-- Três tabelas de registro, gravadas só pela function `ia-agente` (service
-- role): a conversa, cada mensagem trocada com o Claude (blocos como vieram,
-- com uso de tokens) e cada ação que o modelo pediu (leitura executada na
-- hora, escrita que esperou confirmação, negada pela política, erro).
--
-- Quem lê: o próprio usuário vê as suas; admin e agent veem tudo (é o log de
-- "o que cada proprietário fez"). Ninguém grava pela chave anônima.
--
-- A configuração do agente fica em system_config 'ia_agente' e nasce
-- DESLIGADA: o widget só aparece quando o admin ligar, depois do deploy da
-- function e do secret ANTHROPIC_API_KEY.

create table if not exists public.ia_conversas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  papel text not null,
  pagina_inicial text,
  titulo text,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  encerrada_em timestamptz
);

create index if not exists idx_ia_conversas_usuario
  on public.ia_conversas (usuario_id, atualizada_em desc);

create table if not exists public.ia_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.ia_conversas(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  ordem integer not null,
  role text not null,
  -- blocos do Claude como vieram (text, thinking, tool_use, tool_result)
  blocos jsonb not null,
  -- texto visível, extraído dos blocos (listagem e busca); nulo em mensagem só de tool_result
  texto text,
  modelo text,
  effort text,
  stop_reason text,
  tokens_entrada integer,
  tokens_saida integer,
  tokens_cache_lidos integer,
  tokens_cache_gravados integer,
  latencia_ms integer,
  -- micro-dólares (1 USD = 1.000.000); estimado pela tabela de preços
  custo_estimado_microusd bigint,
  criada_em timestamptz not null default now(),
  constraint ia_mensagens_role_check check (role in ('user', 'assistant')),
  constraint ia_mensagens_ordem_unica unique (conversa_id, ordem)
);

create index if not exists idx_ia_mensagens_usuario_data
  on public.ia_mensagens (usuario_id, criada_em desc);

create table if not exists public.ia_acoes (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid references public.ia_conversas(id) on delete set null,
  mensagem_id uuid references public.ia_mensagens(id) on delete set null,
  -- id do bloco tool_use, para casar o tool_result na retomada
  tool_use_id text,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  papel text not null,
  ferramenta text not null,
  nivel text not null,
  property_id uuid references public.properties(id) on delete set null,
  entrada jsonb not null default '{}'::jsonb,
  -- frase para a pessoa ("Abrir chamado 'Infiltração' no imóvel MARCELO")
  resumo text,
  -- o que o modelo recebeu, cortado em 4 KB
  resultado jsonb,
  status text not null,
  motivo_negada text,
  confirmada_em timestamptz,
  executada_em timestamptz,
  duracao_ms integer,
  erro text,
  criada_em timestamptz not null default now(),
  constraint ia_acoes_nivel_check check (nivel in ('leitura', 'escrita')),
  constraint ia_acoes_status_check check (status in (
    'executada', 'aguardando_confirmacao', 'confirmada', 'cancelada', 'negada', 'erro', 'expirada'
  ))
);

create index if not exists idx_ia_acoes_usuario_data on public.ia_acoes (usuario_id, criada_em desc);
create index if not exists idx_ia_acoes_imovel_data on public.ia_acoes (property_id, criada_em desc);
create index if not exists idx_ia_acoes_mensagem on public.ia_acoes (mensagem_id);
create index if not exists idx_ia_acoes_pendentes on public.ia_acoes (criada_em)
  where status = 'aguardando_confirmacao';

alter table public.ia_conversas enable row level security;
alter table public.ia_mensagens enable row level security;
alter table public.ia_acoes enable row level security;

-- Leitura: o próprio usuário, ou admin/agent (auditoria). Sem policy de
-- escrita para `authenticated`: só a service role grava.
drop policy if exists "ia_conversas: dono ou auditoria" on public.ia_conversas;
create policy "ia_conversas: dono ou auditoria" on public.ia_conversas
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'agent'::app_role)
  );

drop policy if exists "ia_mensagens: dono ou auditoria" on public.ia_mensagens;
create policy "ia_mensagens: dono ou auditoria" on public.ia_mensagens
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'agent'::app_role)
  );

drop policy if exists "ia_acoes: dono ou auditoria" on public.ia_acoes;
create policy "ia_acoes: dono ou auditoria" on public.ia_acoes
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'agent'::app_role)
  );

-- Configuração do agente. Nasce desligada.
insert into public.system_config (key, value)
select 'ia_agente', jsonb_build_object(
  'ativo', false,
  'modelo', 'claude-sonnet-5-5',
  'effort', 'medium',
  'papeis', jsonb_build_object('admin', true, 'agent', true, 'maintenance', true, 'owner', false, 'cleaner', false),
  'cotas', jsonb_build_object('mensagens_por_hora_equipe', 60, 'mensagens_por_hora_proprietario', 20, 'tokens_por_dia', 400000),
  'ferramentas_desligadas', '[]'::jsonb
)
where not exists (select 1 from public.system_config where key = 'ia_agente');

-- ai_settings (sugestões de resposta em chamado/cobrança): o Claude não
-- aceita temperature fora do padrão; o controle passa a ser o effort.
alter table public.ai_settings add column if not exists effort text not null default 'medium';
alter table public.ai_prompt_versions add column if not exists effort text;

update public.ai_settings
set model = 'claude-sonnet-5-5'
where model is null or model like 'google/%' or model like 'openai/%';
