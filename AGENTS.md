# Architecture rules

- Group charge-management and reserve-debit queues with `agruparCobrancasProprietario`, keyed by financial owner ID, so multiple units share totals and owner credits are displayed once.
- Maintenance reports include reserve-retention credits through `ReserveRetentionsHistory` alongside direct charge debits; use recorded credit applications for allocation, never infer retention from paid status.
- Purchase items in /novos-imoveis carry the store link in `tickets.product_link` (validated by `normalizarLink` from `src/lib/compraMeta.ts`, same as the compras list); edit it via `salvarCampoManutencao` field `product_link`, and surface it to owners through `OwnerPreparacao` and `ResumoManutencao` so they can buy the item themselves.