-- Compras: quem paga (mesmos valores de tickets.cost_responsible) e a
-- cobrança lançada ao proprietário quando a compra é dele (pedido do gestor,
-- 2026-10-17). Ao marcar "Comprado" numa compra do proprietário, a tela abre
-- a Nova cobrança preenchida; a cobrança criada fica ligada aqui.
alter table public.compras add column if not exists custo text not null default 'owner';
alter table public.compras drop constraint if exists compras_custo_check;
alter table public.compras add constraint compras_custo_check check (custo in ('owner', 'pm', 'guest'));
alter table public.compras add column if not exists charge_id uuid references public.charges(id) on delete set null;
create index if not exists idx_compras_charge on public.compras (charge_id);
