# Architecture rules

- Group charge-management and reserve-debit queues with `agruparCobrancasProprietario`, keyed by financial owner ID, so multiple units share totals and owner credits are displayed once.
- Maintenance reports include reserve-retention credits through `ReserveRetentionsHistory` alongside direct charge debits; use recorded credit applications for allocation, never infer retention from paid status.