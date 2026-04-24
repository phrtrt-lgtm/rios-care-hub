
## Objetivo

Acabar com o chat de manutenção do lado do proprietário. Toda manutenção criada pela equipe (ticket_type = 'manutencao' OU charge sem ticket associado) abrirá uma **página de acompanhamento em popup** com dados, mídias e timeline de comentários da equipe — sem campo de envio para o proprietário. Ele apenas visualiza e é notificado.

A equipe continua tendo seu chat operacional interno (em `MaintenanceChatDialog`) nas telas administrativas, mas o proprietário nunca mais será exposto a esse chat. Tickets que o **próprio proprietário criou** (dúvida, conversar com hóspedes, etc.) continuam usando chat normalmente.

---

## 1. Banco de dados

### Nova tabela `maintenance_updates`
Timeline de atualizações que a equipe publica para o proprietário acompanhar. Diferente de `ticket_messages` (chat operacional interno).

```sql
create table public.maintenance_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid,        -- quando origem é ticket (manutenção criada pela equipe)
  charge_id uuid,        -- quando origem é charge avulsa
  author_id uuid not null,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check (ticket_id is not null or charge_id is not null)
);

create index on public.maintenance_updates (ticket_id);
create index on public.maintenance_updates (charge_id);
```

**RLS:**
- **INSERT/UPDATE/DELETE**: apenas `is_team_member(auth.uid())`.
- **SELECT (team)**: `is_team_member(auth.uid())`.
- **SELECT (owner)**: owner pode ler se for dono do ticket OU charge referenciado.

### Trigger de notificação
Trigger `AFTER INSERT` em `maintenance_updates` cria registro em `notifications` para o proprietário do ticket/charge correspondente, com link `/manutencao/:id` (ou `/ticket/:id` quando aplicável). Reaproveita `trigger_send_push_notification` para disparar push automático.

---

## 2. Unificar a página de acompanhamento `/manutencao/:id`

Hoje `ManutencaoDetalhes.tsx` e `useMaintenance` só leem da tabela `charges`, por isso aparece "Manutenção não encontrada" para tickets sem charge.

### Refatorar `useMaintenance(id)` em `src/hooks/useMaintenances.ts`
- Tentar buscar primeiro como `ticket` (tabela `tickets` + `ticket_attachments`).
- Se não encontrar, buscar como `charge` (comportamento atual).
- Retornar objeto normalizado: `{ source: 'ticket' | 'charge', id, title, description, status, property, owner, attachments[], payments[], amount_cents, management_contribution_cents, ... }`.
- Para tickets, valores financeiros vêm como `0` (ou da charge vinculada via `charges.ticket_id`, se existir).

### Refatorar `ManutencaoDetalhes.tsx`
- Renderiza dados da manutenção (foto, descrição, status, imóvel, valores quando aplicável, mídias com `MediaGallery`).
- **Nova seção "Acompanhamento"** no lugar de qualquer botão de chat:
  - Lista cronológica de `maintenance_updates` (avatar, nome, data, texto, anexos).
  - Para a equipe: campo de input + upload + botão "Publicar atualização".
  - Para o proprietário: somente leitura (sem textarea, sem botão).
- Bloco de pagamento (`MaintenancePaymentForm`) só aparece se houver `charge` associada.

### Novo componente `MaintenanceDetailsDialog`
Wrapper Dialog (similar ao `EditMaintenanceDialog`) que abre `ManutencaoDetalhes` em popup no painel do proprietário. Aceita `id` e `onOpenChange`.

---

## 3. Remover o chat do proprietário

**Substituir `MaintenanceChatDialog` por `MaintenanceDetailsDialog` nestes arquivos do lado owner:**
- `src/components/OwnerMaintenanceProgress.tsx`
- `src/components/OwnerTicketsPreview.tsx`
- `src/components/MaintenanceKanbanPreview.tsx` (apenas no caminho do owner; admin continua com chat)
- `src/pages/MeusChamados.tsx` (tickets do tipo `manutencao` abrem o popup; demais tipos seguem com chat)

**Lógica de roteamento dentro de `MeusChamados.tsx`:**
```ts
if (ticket.ticket_type === 'manutencao' && ticket.created_by !== user.id) {
  // manutenção criada pela equipe → popup de acompanhamento
  openMaintenanceDetailsDialog(ticket.id);
} else {
  // ticket criado pelo próprio owner → chat normal
  openChatDialog(ticket.id);
}
```

A equipe (`AdminManutencoesLista`, `AdminManutencoesKanban`, `AdminChamadosKanban`, `TodosTickets`) **continua** usando `MaintenanceChatDialog` para conversa operacional interna.

---

## 4. Edge Function `notify-maintenance-update` (opcional, se quisermos email)

Se quiser e-mail além de push, criar função `supabase/functions/notify-maintenance-update/index.ts` que:
- Recebe `update_id`.
- Resolve owner via ticket/charge.
- Envia e-mail usando o motor de templates unificado (`_shared/template-renderer.ts`) com link `https://portal.rioshospedagens.com.br/manutencao/:id`.

Pode ser chamada pela própria UI após inserir o update, ou por trigger via `pg_net`. **Padrão sugerido:** chamar via `supabase.functions.invoke` no client logo após insert (mais simples e debugável).

---

## 5. Resumo de arquivos

**Novos:**
- `supabase/migrations/<timestamp>_maintenance_updates.sql`
- `src/components/MaintenanceDetailsDialog.tsx`
- `src/components/MaintenanceUpdatesThread.tsx` (timeline + form para team)
- `src/hooks/useMaintenanceUpdates.ts`
- (opcional) `supabase/functions/notify-maintenance-update/index.ts`

**Editados:**
- `src/hooks/useMaintenances.ts` — `useMaintenance` aceita ticket OU charge
- `src/pages/ManutencaoDetalhes.tsx` — nova seção de acompanhamento, sem chat
- `src/components/OwnerMaintenanceProgress.tsx` — troca chat por popup
- `src/components/OwnerTicketsPreview.tsx` — idem
- `src/components/MaintenanceKanbanPreview.tsx` — idem (apenas owner)
- `src/pages/MeusChamados.tsx` — roteamento condicional ticket próprio vs manutenção da equipe

**Sem alteração:** páginas administrativas mantêm o chat operacional interno.

---

## Resultado

- Proprietário **nunca mais** vê chat de manutenção.
- Ao clicar numa manutenção (no painel, lista de chamados ou notificação), abre popup de acompanhamento limpo: status, imóvel, valores, mídias e timeline somente-leitura.
- Equipe publica atualizações que disparam notificação + push para o proprietário.
- Tickets criados pelo próprio proprietário (dúvidas, hóspedes, etc.) continuam com chat normal.
