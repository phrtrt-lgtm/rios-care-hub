create table if not exists public.integration_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz default now()
);
revoke all on public.integration_secrets from anon, authenticated;
grant all on public.integration_secrets to service_role;
alter table public.integration_secrets enable row level security;