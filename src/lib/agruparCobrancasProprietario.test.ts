import { test } from "node:test";
import { strict as assert } from "node:assert";
import { agruparCobrancasProprietario } from "./agruparCobrancasProprietario";

test("Patricia reúne PATPERO e PATPERO2 para um débito, sem incluir outro proprietário", () => {
  const charge = (id: string, owner_id: string, name: string, amount_cents: number) => ({
    id, owner_id, owner: { name: "Patricia" }, property: { id: name, name, cover_photo_url: null },
    amount_cents, management_contribution_cents: 0, status: "sent", due_date: "2099-01-01",
  });
  const groups = agruparCobrancasProprietario([
    charge("1", "patricia", "PATPERO", 10000),
    charge("2", "patricia", "PATPERO2", 20000),
    charge("3", "outra-pessoa", "OUTRO", 50000),
  ]);
  const patricia = groups.find(g => g.id === "patricia");
  assert.equal(groups.length, 2);
  assert.deepEqual(patricia?.charges.map(c => c.id), ["1", "2"]);
  assert.equal(patricia?.name, "PATPERO · PATPERO2");
  assert.equal(patricia?.totalDueCents, 30000);
});