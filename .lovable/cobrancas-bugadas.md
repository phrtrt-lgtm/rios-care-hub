# Cobranças com status inconsistente — auditoria antes da correção

Data da auditoria: 25/06/2026

## Critério da busca

Cobranças onde:
- `debited_at` está **preenchido** (ou seja, foi marcada a data do débito em reserva)
- mas o `status` ainda está como `overdue` / `pendente` / outro não-final
- e não estão arquivadas / canceladas / pagas

Essas são as cobranças que aparecem indevidamente em "Valor devido" no painel `/gerenciar-cobrancas`, mesmo já tendo sido debitadas da reserva do proprietário.

---

## Total encontrado no sistema inteiro: **5 cobranças** — todas do mesmo proprietário

> Varredura feita em **todos os imóveis e proprietários** do banco. Nenhum outro caso encontrado.
>
> Também rodei uma busca cruzada de "cobranças overdue há mais de 30 dias sem `debited_at`" (que seriam casos onde o débito em reserva nem chegou a rodar) → **zero ocorrências**. Ou seja, o sistema de débito em reserva está rodando; o bug é só na atualização do status final desse lote de 17/05.

### Nilson Maia — imóvel NILSON

Todas com `debited_at = 17/05/2026 18:58:58` (mesmo lote), vencimento `07/05/2026`, status atual `overdue`:

| # | Cobrança | Valor (R$) | Aporte (R$) | Valor devido (R$) |
|---|---|---:|---:|---:|
| 1 | instalação de ventilador | 430,00 | 180,00 | **250,00** |
| 2 | conserto de 2 cadeiras | 180,00 | 60,00 | **120,00** |
| 3 | troca de chuveiro + inversão de rede + instalação de disjuntor bipolar | 565,00 | 200,00 | **365,00** |
| 4 | fixação de vaso sanitário solto | 305,00 | 105,00 | **200,00** |
| 5 | troca de registro | 358,00 | 138,00 | **220,00** |
| | **TOTAL** | **1.838,00** | **683,00** | **1.155,00** |

> Observação: o painel mostrava R$ 1.995,00 devido pro Nilson em 07/05. Esses R$ 1.155 saem do "devido" depois da correção; os R$ 840 restantes vêm de outras cobranças com vencimento 07/05 que **não** têm `debited_at` (ex.: as 27/06 e a `reparo em chuveiro` que já está `debited` corretamente).

---

## Contexto do bug

No lote de 12 cobranças do Nilson com vencimento 07/05/2026, todas tiveram `debited_at` setado em 17/05 (10 dias após o vencimento, conforme regra de débito em reserva).

- **6 cobranças** tiveram o status atualizado corretamente para `debited` ✅
- **5 cobranças** ficaram com status `overdue` ❌ (são as listadas acima)
- 1 (`Multa Condomínio`) é separada e já está paga

Provável causa: a função de débito em reserva gravou `debited_at` em todas, mas o `UPDATE status = 'debited'` rodou parcial (talvez filtrado por algum critério extra, ex.: valor mínimo, categoria, ou erro silencioso no meio do batch).

---

## Correção proposta

```sql
UPDATE public.charges
SET status = 'debited', updated_at = now()
WHERE debited_at IS NOT NULL
  AND status NOT IN (
    'debited','arquivado','cancelled',
    'pago_antecipado','pago_no_vencimento','pago_com_atraso'
  )
  AND archived_at IS NULL;
```

Impacto esperado: 5 cobranças atualizadas, todas do Nilson Maia.

---

## Próximo passo (a confirmar)

1. Aplicar a correção acima nas 5 cobranças listadas.
2. Investigar a função/edge function que processa débito em reserva pra evitar reincidência.
