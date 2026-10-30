# Architecture rules

- Group charge-management and reserve-debit queues with `agruparCobrancasProprietario`, keyed by financial owner ID, so multiple units share totals and owner credits are displayed once.