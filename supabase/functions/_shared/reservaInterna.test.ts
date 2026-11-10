// cd supabase/functions && npx -y deno@2 test _shared/reservaInterna.test.ts
import { CANAL_ENTREGA_LIMPO, CANAL_SEM_LIMPEZA, classeDoCanal, escolherCanalInterno, nomeReservaInterna } from "./reservaInterna.ts";

function igual(obtido: unknown, esperado: unknown, oQue: string) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${oQue}: esperado ${b}, veio ${a}`);
}

// Canais da conta em 2026-11-10, mais os dois sem taxa que o gestor vai criar.
const PADRAO = [
  { id: 8, name: "Booking.com" },
  { id: 19, name: "****" },
  { id: 5879, name: "PROPRIETÁRIO" },
  { id: 5880, name: "MANUTENÇÃO" },
];
const SEM = { id: 6001, name: CANAL_SEM_LIMPEZA };
const ENTREGA = { id: 6002, name: CANAL_ENTREGA_LIMPO };
const COMPLETO = [...PADRAO, SEM, ENTREGA];
const COMUM = { id: 5879, name: "PROPRIETÁRIO" };

Deno.test("cada nome de canal cai na classe certa", () => {
  igual(classeDoCanal("PROPRIETÁRIO"), "comum", "comum");
  igual(classeDoCanal(CANAL_SEM_LIMPEZA), "sem_limpeza", "sem limpeza");
  igual(classeDoCanal(CANAL_ENTREGA_LIMPO), "entrega_limpo", "entrega limpo");
  igual(classeDoCanal("proprietario - nao pediu limpeza/limpar na saida"), "sem_limpeza", "sem acento e minúsculas");
  igual(classeDoCanal("Proprietário (limpeza especial)"), "outro", "limpeza não reconhecida");
  igual(classeDoCanal("MANUTENÇÃO"), null, "não é de proprietário");
});

Deno.test("reserva paga vai só para o canal PROPRIETÁRIO comum", () => {
  igual(escolherCanalInterno(COMPLETO, "proprietario"), { ...COMUM, generico: false }, "ordem normal");
  igual(escolherCanalInterno([...COMPLETO].reverse(), "proprietario"), { ...COMUM, generico: false }, "ordem invertida");
  // Só os canais sem taxa na conta: melhor falhar do que marcar "não pagou taxa" em quem pagou.
  igual(escolherCanalInterno([SEM, ENTREGA], "proprietario"), null, "só os canais sem taxa");
  igual(escolherCanalInterno([{ id: 9, name: "Proprietário (limpeza especial)" }], "proprietario"), null, "canal de limpeza desconhecido");
});

Deno.test("sem limpeza e entrega limpo usam cada um o seu canal", () => {
  igual(escolherCanalInterno(COMPLETO, "proprietario_sem_limpeza"), { ...SEM, generico: false }, "sem limpeza");
  igual(escolherCanalInterno(COMPLETO, "proprietario_entrega_limpo"), { ...ENTREGA, generico: false }, "entrega limpo");
  igual(escolherCanalInterno([...COMPLETO].reverse(), "proprietario_sem_limpeza"), { ...SEM, generico: false }, "sem limpeza, invertida");
  igual(escolherCanalInterno([...COMPLETO].reverse(), "proprietario_entrega_limpo"), { ...ENTREGA, generico: false }, "entrega limpo, invertida");
});

Deno.test("sem o canal próprio cai no PROPRIETÁRIO comum (genérico), nunca no canal do outro modo", () => {
  igual(escolherCanalInterno(PADRAO, "proprietario_sem_limpeza"), { ...COMUM, generico: true }, "sem limpeza, conta de hoje");
  igual(escolherCanalInterno(PADRAO, "proprietario_entrega_limpo"), { ...COMUM, generico: true }, "entrega limpo, conta de hoje");
  igual(escolherCanalInterno([...PADRAO, SEM], "proprietario_entrega_limpo"), { ...COMUM, generico: true }, "só existe o de sem limpeza");
  igual(escolherCanalInterno([...PADRAO, ENTREGA], "proprietario_sem_limpeza"), { ...COMUM, generico: true }, "só existe o de entrega limpo");
  igual(escolherCanalInterno([SEM], "proprietario_entrega_limpo"), null, "nem o comum existe");
  igual(escolherCanalInterno([{ id: 8, name: "Booking.com" }], "proprietario_sem_limpeza"), null, "sem canal de proprietário");
});

Deno.test("manutenção não muda e não pega canal de proprietário", () => {
  igual(escolherCanalInterno(COMPLETO, "manutencao"), { id: 5880, name: "MANUTENÇÃO", generico: false }, "manutenção");
  igual(escolherCanalInterno([SEM, ENTREGA], "manutencao"), null, "só canais de proprietário");
});

Deno.test("canal sem id numérico ou sem nome é ignorado", () => {
  igual(escolherCanalInterno([{ id: "x", name: "PROPRIETÁRIO" }, { id: 3, name: "" }], "proprietario"), null, "inválidos");
});

Deno.test("nome do hóspede começa por Proprietário (hostex_reservations.interna casa pelo início)", () => {
  igual(nomeReservaInterna("proprietario"), "Proprietário", "pago");
  for (const tipo of ["proprietario_sem_limpeza", "proprietario_entrega_limpo"] as const) {
    const nome = nomeReservaInterna(tipo);
    if (!/^propriet/i.test(nome)) throw new Error(`nome não começa por Proprietário: ${nome}`);
    if (nome.length > 80) throw new Error(`nome longo demais (${nome.length}): ${nome}`);
  }
  if (!/LIMPAR NA SAÍDA/.test(nomeReservaInterna("proprietario_sem_limpeza"))) throw new Error("sem limpeza sem o aviso");
  if (!/ENTREGAR LIMPO.*NÃO PAGOU TAXA/.test(nomeReservaInterna("proprietario_entrega_limpo"))) throw new Error("entrega limpo sem o aviso");
  igual(nomeReservaInterna("manutencao", " Pintura  geral "), "MANUTENÇÃO · Pintura geral", "manutenção");
});
