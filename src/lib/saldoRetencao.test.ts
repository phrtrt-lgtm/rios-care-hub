import { test } from "node:test";
import { strict as assert } from "node:assert";
import { saldoRetencao } from "./saldoRetencao";

test("Claudia: caixa d’água mantém R$ 153,78 após retenção de R$ 245,22", () => {
  assert.equal(saldoRetencao({ amount_cents: 49900, management_contribution_cents: 10000,
    credit_applied_cents: 24522 }), 15378);
});

test("Claudia: troca de tomadas fica zerada com retenção de R$ 78,00", () => {
  assert.equal(saldoRetencao({ amount_cents: 9800, management_contribution_cents: 2000,
    credit_applied_cents: 7800 }), 0);
});