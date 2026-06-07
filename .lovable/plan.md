# Plano: Central Hostex (substituir TalkGuest no Calendário + IA)

## Objetivo
Ter um único local "vivo" puxando a API da Hostex, persistindo reservas/propriedades no banco a cada 6h, e usando esses dados como fonte primária para:
1. Calendário de reservas
2. Métricas de ocupação e receita
3. Insights de pricing para os próximos 30 dias
4. IA de consultas (`ai-consulta`)

iCal do TalkGuest deixa de ser consultado em tempo real — fica só como fallback de emergência se a Hostex cair.

---

## 1. Banco — cache local da Hostex

Migration:

- `hostex_reservations` — espelho das reservas:
  `reservation_code (PK)`, `property_id_hostex`, `property_id` (FK opcional → `properties.id`, casado por nome), `channel_type`, `check_in_date`, `check_out_date`, `nights`, `guests`, `status`, `stay_status`, `guest_name`, `booked_at`, `total_rate_cents`, `total_commission_cents`, `currency`, `raw jsonb`, `synced_at`.
- `hostex_properties` — espelho mínimo: `id_hostex (PK)`, `name`, `address`, `property_id` (FK → `properties.id`), `raw jsonb`, `synced_at`.
- `hostex_sync_log` — `id`, `started_at`, `finished_at`, `status` (`ok`/`partial`/`error`), `reservations_upserted`, `properties_upserted`, `error_message`.

RLS: SELECT para `authenticated`; ALL para `service_role`. Sem acesso a `anon`.

## 2. Edge function `hostex-sync` (cron 6h)

Nova função que:
1. Chama `search_properties` → upsert em `hostex_properties` + tenta casar com `properties.name` (via `find_property_by_name_unaccent`).
2. Para janela `[hoje−30d, hoje+180d]`, chama `search_reservations` paginado → upsert em `hostex_reservations`.
3. Marca reservas sumidas no período como `status='cancelled'` localmente.
4. Registra execução em `hostex_sync_log`.
5. Endpoint também aceita `?force=1` para rodar on-demand.

`verify_jwt = false` + checagem de `CRON_SECRET_TOKEN` no header/query.

Cron pg_cron via `supabase--insert` (não migration): roda a cada 6 horas chamando a função.

## 3. Refatorar `hostex-proxy`

- `search_reservations`, `search_properties`, `search_listing_calendars` passam a ler **primeiro do cache local** (`hostex_reservations`/`hostex_properties`), retornando `source: "hostex_cache"` + `synced_at`.
- Se cache vazio/stale (>12h) e Hostex disponível, faz fetch ao vivo e popula o cache.
- Fallback `reservations` (iCal) só se cache vazio E Hostex falhar.
- `search_transactions` segue ao vivo (não cacheamos transações ainda).

## 4. Lib `src/lib/hostexInsights.ts`

Funções puras sobre `HostexReservation[]`:
- `pricingInsights30d(reservations, properties, today)` → por imóvel:
  - dias vagos nos próximos 30
  - ADR atual vs ADR mesma janela ano anterior (se houver)
  - gaps críticos (>=3 noites livres em fim de semana)
  - sugestão de ação: `subir_preco` / `manter` / `descontar_gap` / `min_stay_relax` com justificativa textual.
- `revenuePace30d(reservations, today)` → receita confirmada vs meta projetada (média dos últimos 90d).
- `channelMix30d`, `leadTimeTrend`, `weekendOccupancy30d`.

## 5. Página `/admin/central-hostex` (nova)

Rota nova em `App.tsx`, link no menu admin.

Layout (tabs):
- **Visão geral**: cards — ocupação 30d, ADR, receita confirmada 30d, lead time médio, badge `Fonte: Hostex (sincronizado há Xh)` + botão "Sincronizar agora" (chama `hostex-sync?force=1`).
- **Calendário**: reaproveita `UnifiedCalendarWidget` já migrado para Hostex.
- **Insights de pricing (30d)**: tabela por imóvel com colunas (vagos, ADR, gaps, ação sugerida, justificativa). Export CSV.
- **Mix de canais e pacing**: gráficos (recharts) — receita por canal, pacing diário acumulado.
- **Log de sync**: últimas 20 execuções de `hostex_sync_log`.

## 6. IA `ai-consulta`

- Adicionar tools de função:
  - `get_pricing_insights_30d()`
  - `get_occupancy_summary(start_date, end_date)`
  - `get_channel_mix(start_date, end_date)`
  - `get_calendar_gaps(start_date, end_date, min_nights?)`
- System prompt: "Fonte primária = cache Hostex (sincronizado a cada 6h). Sempre cite período + `synced_at`. Apenas leitura."

## 7. Migrar consumidores existentes

- `UnifiedCalendarWidget` e `CalendarioReservas` continuam usando `hostex.searchReservations` (já existe) — ganham automaticamente o cache.
- Mostrar selo de fonte: "Hostex • atualizado há Xh" / "Hostex (ao vivo)" / "iCal (fallback)".

## 8. Fora de escopo
- Escrita na Hostex.
- Substituir o sync iCal do TalkGuest (fica como fallback frio).
- Transações financeiras detalhadas (fase 2).

---

## Ordem de execução
1. Migration (`hostex_reservations`, `hostex_properties`, `hostex_sync_log`) + GRANTs + RLS.
2. Edge function `hostex-sync` + agendar pg_cron 6h.
3. Refatorar `hostex-proxy` para usar cache.
4. `src/lib/hostexInsights.ts`.
5. Página `/admin/central-hostex` + rota + link no menu.
6. Atualizar `ai-consulta` com novas tools.
7. QA: rodar sync manual, conferir cards e insights, simular Hostex offline.

## Pergunta antes de começar
Confirma que posso criar essas 3 tabelas novas (`hostex_*`) e o cron de 6h, e que o nome de menu pode ser **"Central Hostex"** em `/admin/central-hostex`? Ou prefere outro nome/rota (ex.: "Ocupação", `/admin/ocupacao`)?
