-- Novos imóveis: sai o WhatsApp de movimentação, fica o e-mail de conclusão
-- (o gestor mudou de ideia em 2026-10-28; CLAUDE.md §3.19).
--
-- O proprietário recebe: a cobrança, como sempre (e-mail da cobrança e o
-- WhatsApp opt-in de §3.2), e UM e-mail quando itens da lista do imóvel novo
-- passam de em progresso para feito. Nada de WhatsApp de etapa, visita,
-- estreia ou item novo. Itens concluídos juntam por `agrupar_minutos` (10)
-- e saem num e-mail só; item que já virou cobrança não entra, porque o
-- e-mail da cobrança já avisou. O modelo é `manutencao_concluida`, em
-- email_templates (editável em /configuracao-email).

-- 1. Fora os gatilhos de movimentação ------------------------------------------
drop trigger if exists trg_viabilizacao_avisar on public.viabilizacoes;
drop function if exists public.viabilizacao_enfileirar_aviso();
drop trigger if exists trg_charge_avisar_viabilizacao on public.charges;
drop function if exists public.charge_enfileirar_aviso_viabilizacao();

-- 2. A fila só guarda conclusão; o destino é um e-mail -------------------------
delete from public.viabilizacao_avisos where tipo <> 'item_feito';
alter table public.viabilizacao_avisos drop column if exists valor_cents;
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'viabilizacao_avisos' and column_name = 'telefone'
  ) then
    alter table public.viabilizacao_avisos rename column telefone to destino;
  end if;
end
$$;
alter table public.viabilizacao_avisos drop constraint if exists viabilizacao_avisos_tipo_check;
alter table public.viabilizacao_avisos add constraint viabilizacao_avisos_tipo_check
  check (tipo in ('item_feito'));
alter table public.viabilizacao_avisos drop constraint if exists viabilizacao_avisos_status_check;
-- cobrado = não foi enviado porque a cobrança do item já avisou
alter table public.viabilizacao_avisos add constraint viabilizacao_avisos_status_check
  check (status in ('pendente', 'disparado', 'enviado', 'falhou', 'sem_destino', 'desligado', 'cobrado'));

-- 3. Destino: nome, e-mail e imóvel ----------------------------------------------
-- O e-mail da conta vale mais que o digitado no registro.
drop function if exists public.viabilizacao_destino(uuid);
create function public.viabilizacao_destino(p_id uuid)
returns table (nome text, email text, imovel text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(v.proprietario_nome), ''), pr.name) as nome,
         coalesce(nullif(trim(pr.email), ''), nullif(trim(v.proprietario_email), '')) as email,
         coalesce(p.name, v.nome) as imovel
    from public.viabilizacoes v
    left join public.properties p on p.id = v.property_id
    left join public.profiles pr on pr.id = p.owner_id
   where v.id = p_id;
$$;

revoke all on function public.viabilizacao_destino(uuid) from public, anon, authenticated;
grant execute on function public.viabilizacao_destino(uuid) to service_role;

-- 4. Enfileirar só a conclusão -----------------------------------------------------
create or replace function public.ticket_enfileirar_aviso_viabilizacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viab uuid;
begin
  if TG_OP <> 'UPDATE' then
    return new;
  end if;
  -- Só a passagem para concluído; reabrir e concluir de novo avisa de novo.
  if new.status <> 'concluido' or old.status is not distinct from 'concluido' then
    return new;
  end if;
  if new.property_id is null or new.ticket_type <> 'manutencao' or new.archived_at is not null then
    return new;
  end if;
  -- Custo de hóspede ou em espera: o proprietário não vê o item, então não é avisado.
  if coalesce(new.cost_responsible, 'owner') in ('pending', 'guest') then
    return new;
  end if;

  select v.id into v_viab
    from public.viabilizacoes v
   where v.property_id = new.property_id
     and v.concluida_em is null
     and v.avisar_proprietario
   limit 1;
  if v_viab is null then
    return new;
  end if;

  insert into public.viabilizacao_avisos (viabilizacao_id, tipo, referencia, ticket_id)
  values (v_viab, 'item_feito', left(new.subject, 160), new.id);
  return new;
exception when others then
  raise warning 'viabilizacao_avisos: % (ticket %)', sqlerrm, new.id;
  return new;
end;
$$;

drop trigger if exists trg_ticket_avisar_viabilizacao on public.tickets;
create trigger trg_ticket_avisar_viabilizacao
  after update of status on public.tickets
  for each row execute function public.ticket_enfileirar_aviso_viabilizacao();

-- 5. Configuração geral -------------------------------------------------------------
delete from public.system_config where key = 'viabilizacao_whatsapp';
insert into public.system_config (key, value)
select 'viabilizacao_email', jsonb_build_object('ativo', true, 'agrupar_minutos', 10)
where not exists (select 1 from public.system_config where key = 'viabilizacao_email');

-- 6. Modelo do e-mail (mesmo molde dos outros, editável em /configuracao-email) ----
insert into public.email_templates (key, name, description, subject, body_html, available_variables)
select
  'manutencao_concluida',
  'Manutenção Concluída - Proprietário',
  'Ao proprietário de imóvel novo quando itens da lista são concluídos. Itens concluídos em sequência juntam num e-mail só; item que já virou cobrança não entra.',
  '{{titulo}} - {{property_name}}',
  $html$<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>{{titulo}}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      @media (prefers-color-scheme: dark) {
        .card { background:#0b1e33 !important; }
        .text { color:#f1f5f9 !important; }
        .muted { color:#cbd5e1 !important; }
        .btn { background:#d36b4d !important; }
      }
      a { color:#0f3150; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <div class="preheader">{{titulo}} no {{property_name}}: {{itens_texto}}.</div>
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
              <td class="card" style="padding:24px;background:#ffffff;">
                <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#0f3150;">
                  {{titulo}}
                </h2>
                <p class="text" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  Olá, {{owner_first_name}}. Concluímos no imóvel <strong>{{property_name}}</strong>:
                </p>
                <ul class="text" style="margin:0 0 16px;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  {{itens_html}}
                </ul>
                <p class="text" style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11243a;">
                  Se algum item tiver custo para você, a cobrança chega em um e-mail separado, com o valor e o vencimento.
                </p>
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{portal_url}}" arcsize="10%" stroke="f" fillcolor="#d36b4d" style="height:44px;v-text-anchor:middle;width:220px;">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;">Ver no portal</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="{{portal_url}}" class="btn" style="display:inline-block;background:#d36b4d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;text-align:center;">
                  Ver no portal
                </a>
                <!--<![endif]-->
                <p class="muted" style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  Acompanhe as manutenções do seu imóvel no portal
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;padding:12px;text-align:center;">
                <p class="muted" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;">
                  Rios Hospedagens
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>$html$,
  '["owner_name", "owner_first_name", "property_name", "quantidade", "titulo", "itens_html", "itens_texto", "portal_url"]'::jsonb
where not exists (select 1 from public.email_templates where key = 'manutencao_concluida');

-- 7. Disparo em lote (o cron viabilizacao-whatsapp, a cada 5 min, continua) -------
create or replace function public.disparar_avisos_viabilizacao()
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_cfg jsonb;
  v_minutos integer;
  v_token text;
  v_lote uuid;
  v_alvo record;
  v_lotes integer := 0;
begin
  select value into v_cfg from public.system_config where key = 'viabilizacao_email';
  if not coalesce((v_cfg ->> 'ativo')::boolean, true) then
    update public.viabilizacao_avisos set status = 'desligado' where status = 'pendente';
    return 'desligado';
  end if;
  v_minutos := greatest(coalesce((v_cfg ->> 'agrupar_minutos')::integer, 10), 0);

  -- Lote disparado sem resposta em 30 min: volta à fila até 3 vezes, depois falha.
  update public.viabilizacao_avisos
     set status = 'pendente'
   where status = 'disparado' and disparado_em < now() - interval '30 minutes' and tentativas < 3;
  update public.viabilizacao_avisos
     set status = 'falhou', erro = 'A função de envio não respondeu.'
   where status = 'disparado' and disparado_em < now() - interval '30 minutes' and tentativas >= 3;

  -- Imóvel que desligou o aviso: o que estava na fila não sai.
  update public.viabilizacao_avisos a
     set status = 'desligado'
    from public.viabilizacoes v
   where v.id = a.viabilizacao_id and a.status = 'pendente' and not v.avisar_proprietario;

  -- Pendente há mais de 24 h (sem e-mail, por exemplo) não vai mais.
  update public.viabilizacao_avisos a
     set status = case when d.email is null then 'sem_destino' else 'falhou' end,
         erro = case when d.email is null then 'Sem e-mail do proprietário.' else 'Aviso expirou sem envio.' end
    from (
      select a2.id, d2.email
        from public.viabilizacao_avisos a2
        cross join lateral public.viabilizacao_destino(a2.viabilizacao_id) d2
       where a2.status = 'pendente' and a2.created_at < now() - interval '24 hours'
    ) d
   where a.id = d.id;

  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'notificar_cobranca_token';

  -- Um lote por imóvel, depois de agrupar_minutos desde a conclusão mais antiga.
  for v_alvo in
    select a.viabilizacao_id
      from public.viabilizacao_avisos a
      cross join lateral public.viabilizacao_destino(a.viabilizacao_id) d
     where a.status = 'pendente'
       and d.email is not null
     group by a.viabilizacao_id
    having min(a.created_at) <= now() - make_interval(mins => v_minutos)
  loop
    v_lote := gen_random_uuid();
    update public.viabilizacao_avisos
       set status = 'disparado', lote_id = v_lote, disparado_em = now(), tentativas = tentativas + 1
     where viabilizacao_id = v_alvo.viabilizacao_id and status = 'pendente';
    perform net.http_post(
      url     := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/notificar-listas',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-token', coalesce(v_token, '')),
      body    := jsonb_build_object('lote_email', v_lote),
      timeout_milliseconds := 60000
    );
    v_lotes := v_lotes + 1;
  end loop;
  return v_lotes || ' lote(s)';
end;
$$;

revoke all on function public.disparar_avisos_viabilizacao() from public, anon, authenticated;
