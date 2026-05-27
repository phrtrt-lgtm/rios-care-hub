# Plano: Migração para Hostex API (iCal como fallback)

## 1. Backend — Edge Function `hostex-proxy`

Criar `supabase/functions/hostex-proxy/index.ts`:

- Recebe `{ action, params }` no body.
- Lê `HOSTEX_API_KEY` do secret (você cadastra manualmente depois).
- Whitelist de actions **somente leitura**:
  - `search_reservations`
  - `search_properties`
  - `search_listing_calendars`
  - `search_transactions`
- Qualquer outra action → 403.
- Faz GET para `https://api.hostex.io/v3/<endpoint>` com header `Hostex-Access-Token`.
- Cache em memória (Map) por 5 min, chave = `action + JSON(params)`.
- Retorna `{ source: "hostex", data }` em sucesso.
- Em erro/timeout (>8s): tenta fallback iCal e retorna `{ source: "ical_fallback", data, error }`.
- `verify_jwt = true` (default) — só usuários logados consomem.

Helper interno `fetchIcalFallback(action, params)` que reaproveita a lógica existente de iCal do TalkGuest (procurar em `supabase/functions/` qual function já parseia iCal e importar/duplicar o parser mínimo) — só para `search_reservations` e `search_listing_calendars`. Para `search_properties` e `search_transactions`, fallback retorna lista vazia + flag de erro.

## 2. Cliente — `src/lib/hostex.ts`

Wrapper tipado:

```ts
hostex.searchReservations({ start_date, end_date, property_ids?, channel_type?, status? })
hostex.searchProperties()
hostex.searchListingCalendars({ listing_id, start_date, end_date })
hostex.searchTransactions({ start_date, end_date })
```

Cada um chama `supabase.functions.invoke("hostex-proxy", { body: { action, params } })` e retorna `{ source, data }`.

Tipos baseados nos campos descritos: `reservation_code, property_id, channel_type, check_in_date, check_out_date, number_of_guests, status, stay_status, guest_name, booked_at, rates: { total_rate, total_commission, details[] }`.

## 3. Calendário / Ocupações

Atualizar `src/components/UnifiedCalendarWidget.tsx` e `src/pages/CalendarioReservas.tsx`:

- Substituir leitura do iCal por `hostex.searchReservations` para o mês visível.
- Cada bloco `check_in_date → check_out_date` vira um evento tipo `reservation` (novo tipo, ao lado de inspection/maintenance/charge/blocked/checkout).
- Tooltip/detalhe exibe: canal (badge colorido por airbnb/booking/etc), valor `total_rate.amount` formatado BRL, nº hóspedes, status, nome do hóspede.
- Badge global "Fonte: Hostex" / "Fonte: iCal (fallback)" lendo `source`.

## 4. Indicadores de ocupação

Criar `src/lib/occupancyMetrics.ts` com funções puras sobre array de reservas:

- `occupancyRate(reservations, properties, periodStart, periodEnd)` — noites ocupadas / noites disponíveis, por imóvel e portfólio.
- `revenueWeightedOccupancy(reservations)` — usa `total_rate.amount`.
- `calendarGaps(reservations, periodStart, periodEnd)` — janelas vazias entre reservas, por imóvel.
- `averageLeadTime(reservations)` — média (check_in − booked_at) em dias.
- `forecastRevenue(reservations, periodStart, periodEnd)` — soma `total_rate.amount` das reservas confirmadas do período.
- `channelMix(reservations)` e `adrByProperty(reservations)` — para a IA.

Renderizar esses indicadores em `CalendarioReservas.tsx` em cards no topo da página.

## 5. IA de Consultas

Atualizar `supabase/functions/ai-consulta/index.ts`:

- Adicionar tools (function calling) que mapeiam 1-para-1 com as actions da `hostex-proxy`:
  - `get_reservations(start_date, end_date, property_id?, channel?, status?)`
  - `get_properties()`
  - `get_listing_calendar(listing_id, start_date, end_date)`
  - `get_transactions(start_date, end_date)` *(fase 2 — preparado mas pode retornar "indisponível")*
- A função executa as tools chamando internamente a `hostex-proxy` (server-to-server, usando SERVICE_ROLE para invocar).
- Sempre que retornar números, instruir a IA via system prompt a citar **período + fonte** (`source`).
- System prompt explícito: "Você é somente leitura. Se o usuário pedir para alterar preço, disponibilidade, criar tarefa ou enviar mensagem, responda que essa ação ainda não está habilitada nesta fase."
- Remover/desabilitar tools de escrita se existirem.

## 6. Secret

Você cadastra `HOSTEX_API_KEY` manualmente em Project Settings → Secrets após o deploy. Nada de chave em código nem no front.

## 7. Fora de escopo (confirmado)

- Nenhuma escrita na Hostex.
- iCal do TalkGuest permanece intacto como fallback.

---

### Ordem de execução

1. Criar Edge Function `hostex-proxy` + deploy.
2. Você adiciona o secret `HOSTEX_API_KEY`.
3. Criar `src/lib/hostex.ts` + `src/lib/occupancyMetrics.ts`.
4. Migrar Calendário/Ocupações.
5. Atualizar IA de consultas com novas tools.
6. QA: validar fonte (selo Hostex), simular falha (chave inválida) → ver fallback iCal.

### Pergunta antes de começar

A documentação que você passou cita endpoints como `search_reservations` etc., mas o domínio/versão exata da API Hostex que você usa é `https://api.hostex.io/v3/`? Se for diferente, me confirme a base URL para eu já deixar correto no proxy.
