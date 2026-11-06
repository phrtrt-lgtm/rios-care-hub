// Testes do cálculo do bloqueio de limpeza.
// Rodar: cd supabase/functions && npx -y deno@2 test _shared/limpeza/
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buffersDaReserva,
  decidirEvento,
  hojeEm,
  imovelLigado,
  imovelNoEscopo,
  IMOVEIS_LIMPEZA,
  lerConfig,
  lerEvento,
  type EntradaPlano,
  type Plano,
  planejarBuffers,
  type RegistroAtivo,
  type ReservaHostex,
  somarDias,
} from "./calculo.ts";

const CLAUDIA = 12673095;
const HOJE = "2026-11-06";
const LIGADO = lerConfig({ ativo: true, modo: "escrita", imoveis: "todos" });

const reserva = (codigo: string, entrada: string, saida: string, status = "accepted", imovel = CLAUDIA): ReservaHostex => ({
  reservation_code: codigo,
  property_id: imovel,
  check_in_date: entrada,
  check_out_date: saida,
  status,
});

/** Calendário em que tudo está livre, menos as datas listadas. */
const livreMenos = (...fechadas: string[]): Record<string, boolean> =>
  new Proxy({} as Record<string, boolean>, { get: (_t, data) => !fechadas.includes(String(data)) });

const entrada = (parcial: Partial<EntradaPlano> & Pick<EntradaPlano, "codigo">): EntradaPlano => ({
  hoje: HOJE,
  propertyId: CLAUDIA,
  reserva: null,
  ativas: [],
  registros: [],
  disponibilidade: livreMenos(),
  ...parcial,
});

/** Aplica um plano ao registro, como o fluxo faz, para testar a segunda rodada. */
function aplicar(registros: RegistroAtivo[], plano: Plano, codigo: string, imovel = CLAUDIA): RegistroAtivo[] {
  const saem = new Set([...plano.liberar, ...plano.encerrar].map((l) => l.id));
  const ficam = registros.filter((r) => !saem.has(r.id)).map((r) => {
    const t = plano.transferir.find((x) => x.id === r.id);
    return t ? { ...r, reservation_code: t.para, kind: t.kind } : r;
  });
  const novos = plano.bloquear.map((b) => ({ id: `${codigo}:${b.date}`, property_id: imovel, date: b.date, reservation_code: codigo, kind: b.kind }));
  return [...ficam, ...novos];
}

const datas = (itens: { date: string }[]) => itens.map((i) => i.date).sort();

// ----------------------------------------------------------------- básicos

Deno.test("somarDias atravessa mês e ano", () => {
  assertEquals(somarDias("2026-12-01", -1), "2026-11-30");
  assertEquals(somarDias("2027-01-01", -1), "2026-12-31");
  assertEquals(somarDias("2028-02-28", 1), "2028-02-29");
});

Deno.test("hoje é o dia em Brasília, não em UTC", () => {
  // 01:30 UTC do dia 7 ainda é dia 6 em Brasília (UTC-3).
  assertEquals(hojeEm(new Date("2026-11-07T01:30:00Z")), "2026-11-06");
  assertEquals(hojeEm(new Date("2026-11-07T03:00:00Z")), "2026-11-07");
});

Deno.test("buffers: véspera do check-in e dia do check-out, nunca check-out + 1", () => {
  const b = buffersDaReserva(reserva("R1", "2026-11-19", "2026-11-22"));
  assertEquals(b, [
    { date: "2026-11-18", kind: "checkin_minus_1" },
    { date: "2026-11-22", kind: "checkout" },
  ]);
  assert(!b.some((x) => x.date === "2026-11-23"));
});

Deno.test("o escopo tem exatamente os 18 imóveis", () => {
  assertEquals(Object.keys(IMOVEIS_LIMPEZA).length, 18);
  assert(imovelNoEscopo(12673105)); // GIOVANI1
  assert(!imovelNoEscopo(12673094));
});

// ---------------------------------------------------------------- os casos

Deno.test("reserva simples: fecha a véspera do check-in e o dia do check-out", () => {
  const r = reserva("R1", "2026-11-19", "2026-11-22");
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: r, ativas: [r] }));
  assertEquals(plano.abortado, null);
  assertEquals(plano.bloquear, [
    { date: "2026-11-18", kind: "checkin_minus_1" },
    { date: "2026-11-22", kind: "checkout" },
  ]);
  assertEquals(plano.liberar, []);
  assertEquals(plano.descartadas, []);
});

Deno.test("back-to-back no mesmo dia: o dia da troca é noite vendida e não é fechado", () => {
  const a = reserva("A", "2026-11-07", "2026-11-10");
  const b = reserva("B", "2026-11-10", "2026-11-13");

  // Evento da B: a véspera (dia 9) é noite da A; só o check-out (13) é fechado.
  const planoB = planejarBuffers(entrada({ codigo: "B", reserva: b, ativas: [a, b] }));
  assertEquals(datas(planoB.bloquear), ["2026-11-13"]);
  assertEquals(planoB.descartadas.map((d) => [d.date, d.motivo]), [["2026-11-09", "noite vendida da reserva A"]]);

  // Evento da A: o check-out (dia 10) é noite da B; só a véspera (6) é fechada.
  const planoA = planejarBuffers(entrada({ codigo: "A", reserva: a, ativas: [a, b] }));
  assertEquals(datas(planoA.bloquear), ["2026-11-06"]);
  assertEquals(planoA.descartadas.map((d) => [d.date, d.motivo]), [["2026-11-10", "noite vendida da reserva B"]]);
});

Deno.test("cancelamento com outra reserva justificando a data: a linha passa para ela, sem escrita", () => {
  // X sai dia 15 e Y entra dia 16: o dia 15 é check-out da X e véspera da Y.
  const x = reserva("X", "2026-11-12", "2026-11-15", "cancelled");
  const y = reserva("Y", "2026-11-16", "2026-11-19");
  const registros: RegistroAtivo[] = [
    { id: "1", property_id: CLAUDIA, date: "2026-11-11", reservation_code: "X", kind: "checkin_minus_1" },
    { id: "2", property_id: CLAUDIA, date: "2026-11-15", reservation_code: "X", kind: "checkout" },
    { id: "3", property_id: CLAUDIA, date: "2026-11-19", reservation_code: "Y", kind: "checkout" },
  ];
  const plano = planejarBuffers(entrada({ codigo: "X", reserva: x, ativas: [y], registros, disponibilidade: livreMenos("2026-11-11", "2026-11-15", "2026-11-19") }));

  assertEquals(plano.liberar, [{ id: "1", date: "2026-11-11", kind: "checkin_minus_1" }]);
  assertEquals(plano.transferir, [{ id: "2", date: "2026-11-15", para: "Y", kind: "checkin_minus_1" }]);
  assertEquals(plano.bloquear, []);
  assertEquals(plano.descartadas.length, 1);
  assertEquals(plano.descartadas[0].date, "2026-11-15");

  // Depois, se a Y cancelar, o dia 15 (agora dela) é liberado.
  const depois = aplicar(registros, plano, "X");
  const planoY = planejarBuffers(entrada({ codigo: "Y", reserva: { ...y, status: "cancelled" }, ativas: [], registros: depois }));
  assertEquals(datas(planoY.liberar), ["2026-11-15", "2026-11-19"]);
});

Deno.test("cancelamento: data que virou noite vendida de outra reserva não recebe escrita", () => {
  const z = reserva("Z", "2026-11-14", "2026-11-17");
  const registros: RegistroAtivo[] = [
    { id: "1", property_id: CLAUDIA, date: "2026-11-15", reservation_code: "X", kind: "checkout" },
  ];
  const plano = planejarBuffers(entrada({ codigo: "X", reserva: reserva("X", "2026-11-12", "2026-11-15", "cancelled"), ativas: [z], registros }));
  assertEquals(plano.liberar, []);
  assertEquals(plano.encerrar.map((l) => l.id), ["1"]);
});

Deno.test("data no passado: nunca fecha antes de hoje", () => {
  // Check-in hoje: a véspera já passou.
  const r = reserva("R1", HOJE, "2026-11-09");
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: r, ativas: [r] }));
  assertEquals(datas(plano.bloquear), ["2026-11-09"]);
  assertEquals(plano.descartadas.map((d) => [d.date, d.motivo]), [["2026-11-05", "data no passado"]]);

  // Check-out hoje: o dia do check-out é hoje e ainda é fechado.
  const s = reserva("R2", "2026-11-03", HOJE);
  const planoS = planejarBuffers(entrada({ codigo: "R2", reserva: s, ativas: [s] }));
  assertEquals(datas(planoS.bloquear), [HOJE]);
});

Deno.test("cancelamento com buffer já no passado: encerra a linha sem escrever", () => {
  const registros: RegistroAtivo[] = [
    { id: "1", property_id: CLAUDIA, date: "2026-11-04", reservation_code: "R1", kind: "checkin_minus_1" },
    { id: "2", property_id: CLAUDIA, date: "2026-11-08", reservation_code: "R1", kind: "checkout" },
  ];
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: reserva("R1", "2026-11-05", "2026-11-08", "cancelled"), registros }));
  assertEquals(plano.encerrar.map((l) => l.date), ["2026-11-04"]);
  assertEquals(datas(plano.liberar), ["2026-11-08"]);
});

Deno.test("imóvel fora da lista: o evento é ignorado e o cálculo se recusa", () => {
  const ev = lerEvento({ event: "reservation_created", event_id: "01M6Q9", reservation_code: "R1", property_id: 12673094 });
  assertEquals(decidirEvento(ev, LIGADO), { processar: false, motivo: "imóvel 12673094 fora do escopo" });

  const r = reserva("R1", "2026-11-19", "2026-11-22", "accepted", 12673094);
  const plano = planejarBuffers(entrada({ codigo: "R1", propertyId: 12673094, reserva: r, ativas: [r] }));
  assert(plano.abortado !== null);
  assertEquals(plano.bloquear, []);
});

Deno.test("evento duplicado: a segunda rodada não escreve nem libera de novo", () => {
  const r = reserva("R1", "2026-11-19", "2026-11-22");
  const primeiro = planejarBuffers(entrada({ codigo: "R1", reserva: r, ativas: [r] }));
  const registros = aplicar([], primeiro, "R1");
  assertEquals(registros.length, 2);

  // Mesmo evento de novo: as datas já estão no registro (e fechadas na Hostex).
  const segundo = planejarBuffers(entrada({ codigo: "R1", reserva: r, ativas: [r], registros, disponibilidade: livreMenos("2026-11-18", "2026-11-22") }));
  assertEquals(segundo, { abortado: null, bloquear: [], liberar: [], transferir: [], encerrar: [], descartadas: [] });

  // Cancelamento duas vezes: a segunda não tem linha ativa para liberar.
  const cancelada = { ...r, status: "cancelled" };
  const cancela1 = planejarBuffers(entrada({ codigo: "R1", reserva: cancelada, registros }));
  assertEquals(datas(cancela1.liberar), ["2026-11-18", "2026-11-22"]);
  const cancela2 = planejarBuffers(entrada({ codigo: "R1", reserva: cancelada, registros: aplicar(registros, cancela1, "R1") }));
  assertEquals(cancela2.liberar, []);
  assertEquals(cancela2.bloquear, []);
});

// ------------------------------------------------------------- mais regras

Deno.test("troca de datas: libera os buffers antigos e fecha os novos", () => {
  const registros: RegistroAtivo[] = [
    { id: "1", property_id: CLAUDIA, date: "2026-11-18", reservation_code: "R1", kind: "checkin_minus_1" },
    { id: "2", property_id: CLAUDIA, date: "2026-11-22", reservation_code: "R1", kind: "checkout" },
  ];
  const nova = reserva("R1", "2026-11-25", "2026-11-28");
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: nova, ativas: [nova], registros, disponibilidade: livreMenos("2026-11-18", "2026-11-22") }));
  assertEquals(datas(plano.liberar), ["2026-11-18", "2026-11-22"]);
  assertEquals(datas(plano.bloquear), ["2026-11-24", "2026-11-28"]);
});

Deno.test("estadia estendida: o antigo dia do check-out vira noite da própria reserva e não recebe escrita", () => {
  const registros: RegistroAtivo[] = [
    { id: "1", property_id: CLAUDIA, date: "2026-11-18", reservation_code: "R1", kind: "checkin_minus_1" },
    { id: "2", property_id: CLAUDIA, date: "2026-11-22", reservation_code: "R1", kind: "checkout" },
  ];
  const estendida = reserva("R1", "2026-11-19", "2026-11-23");
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: estendida, ativas: [estendida], registros, disponibilidade: livreMenos("2026-11-18", "2026-11-22") }));
  assertEquals(plano.liberar, []);
  assertEquals(plano.encerrar.map((l) => l.date), ["2026-11-22"]);
  assertEquals(datas(plano.bloquear), ["2026-11-23"]);
});

Deno.test("cancelamento antes da criação (fora de ordem): nada a fazer nas duas chegadas", () => {
  // O cancelamento chega primeiro: não há linha no registro.
  const cancelada = reserva("R1", "2026-11-19", "2026-11-22", "cancelled");
  const vazio = { abortado: null, bloquear: [], liberar: [], transferir: [], encerrar: [], descartadas: [] };
  assertEquals(planejarBuffers(entrada({ codigo: "R1", reserva: cancelada })), vazio);
  // A criação chega depois, mas a API já diz cancelada: continua sem fechar nada.
  assertEquals(planejarBuffers(entrada({ codigo: "R1", reserva: cancelada })), vazio);
});

Deno.test("status que não é accepted (aguardando pagamento) não gera buffer", () => {
  const r = reserva("R1", "2026-11-19", "2026-11-22", "wait_pay");
  assertEquals(planejarBuffers(entrada({ codigo: "R1", reserva: r })).bloquear, []);
});

Deno.test("data já fechada por outra origem é intocável: não fecha e não registra", () => {
  const r = reserva("R1", "2026-11-19", "2026-11-22");
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: r, ativas: [r], disponibilidade: livreMenos("2026-11-22") }));
  assertEquals(datas(plano.bloquear), ["2026-11-18"]);
  assertEquals(plano.descartadas.length, 1);
  assertEquals(plano.descartadas[0].date, "2026-11-22");
  assert(plano.descartadas[0].motivo.includes("outra origem"));
});

Deno.test("bloqueio manual nunca é liberado: sem linha no registro, o cancelamento não mexe", () => {
  // As duas datas estão fechadas na Hostex, mas não por este sistema.
  const plano = planejarBuffers(entrada({
    codigo: "R1",
    reserva: reserva("R1", "2026-11-19", "2026-11-22", "cancelled"),
    disponibilidade: livreMenos("2026-11-18", "2026-11-22"),
  }));
  assertEquals(plano.liberar, []);
  assertEquals(plano.encerrar, []);
});

Deno.test("sem resposta da Hostex sobre a data, não escreve às cegas", () => {
  const r = reserva("R1", "2026-11-19", "2026-11-22");
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: r, ativas: [r], disponibilidade: { "2026-11-18": true } }));
  assertEquals(datas(plano.bloquear), ["2026-11-18"]);
  assertEquals(plano.descartadas.map((d) => d.date), ["2026-11-22"]);
});

Deno.test("data já fechada por este sistema para outra reserva não é escrita de novo", () => {
  // Y sai dia 18 (buffer registrado) e R1 entra dia 19: a véspera da R1 é o mesmo dia 18.
  const y = reserva("Y", "2026-11-15", "2026-11-18");
  const r = reserva("R1", "2026-11-19", "2026-11-22");
  const registros: RegistroAtivo[] = [
    { id: "1", property_id: CLAUDIA, date: "2026-11-18", reservation_code: "Y", kind: "checkout" },
  ];
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: r, ativas: [y, r], registros, disponibilidade: livreMenos("2026-11-18") }));
  assertEquals(datas(plano.bloquear), ["2026-11-22"]);
  assertEquals(plano.transferir, []);
  assert(plano.descartadas[0].motivo.includes("reserva Y"));
});

Deno.test("linha de reserva que não está mais accepted é assumida por quem precisa da data", () => {
  // A Y cancelou e o evento dela se perdeu: o dia 18 continua fechado no registro em nome dela.
  const r = reserva("R1", "2026-11-19", "2026-11-22");
  const registros: RegistroAtivo[] = [
    { id: "1", property_id: CLAUDIA, date: "2026-11-18", reservation_code: "Y", kind: "checkout" },
  ];
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: r, ativas: [r], registros, disponibilidade: livreMenos("2026-11-18") }));
  assertEquals(plano.transferir, [{ id: "1", date: "2026-11-18", para: "R1", kind: "checkin_minus_1" }]);
  assertEquals(datas(plano.bloquear), ["2026-11-22"]);
});

Deno.test("reabertura nossa ainda em trânsito não é confundida com bloqueio manual", () => {
  // O sistema acabou de mandar reabrir o dia 18 e a Hostex ainda o mostra fechado.
  const r = reserva("R1", "2026-11-19", "2026-11-22");
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: r, ativas: [r], disponibilidade: livreMenos("2026-11-18"), recemLiberadas: ["2026-11-18"] }));
  assertEquals(datas(plano.bloquear), ["2026-11-18", "2026-11-22"]);
});

Deno.test("trava: mais de 2 datas a liberar para uma reserva aborta tudo", () => {
  const registros: RegistroAtivo[] = ["2026-11-18", "2026-11-22", "2026-11-25"].map((date, i) => ({
    id: String(i),
    property_id: CLAUDIA,
    date,
    reservation_code: "R1",
    kind: "checkout" as const,
  }));
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: reserva("R1", "2026-11-19", "2026-11-22", "cancelled"), registros }));
  assert(plano.abortado !== null);
  assertEquals(plano.liberar, []);
  assertEquals(plano.bloquear, []);
});

Deno.test("reserva com datas inválidas aborta", () => {
  const r = reserva("R1", "2026-11-22", "2026-11-19");
  assert(planejarBuffers(entrada({ codigo: "R1", reserva: r })).abortado !== null);
});

Deno.test("reserva de outro imóvel não conta como noite vendida deste", () => {
  const r = reserva("R1", "2026-11-19", "2026-11-22");
  const vizinha = reserva("V", "2026-11-17", "2026-11-19", "accepted", 12673096);
  const plano = planejarBuffers(entrada({ codigo: "R1", reserva: r, ativas: [r, vizinha] }));
  assertEquals(datas(plano.bloquear), ["2026-11-18", "2026-11-22"]);
});

// -------------------------------------------------------------------- flag

Deno.test("flag: ausente ou malformada é desligada; lista nunca sai do escopo", () => {
  assertEquals(lerConfig(null), { ativo: false, modo: "simulacao", imoveis: [] });
  assertEquals(lerConfig({ ativo: "true", modo: "escrita", imoveis: "todos" }).ativo, false);
  assertEquals(lerConfig({ ativo: true }).modo, "simulacao");

  const parcial = lerConfig({ ativo: true, modo: "escrita", imoveis: [CLAUDIA, "12673096", 12673094, "x"] });
  assertEquals(parcial.imoveis, [CLAUDIA, 12673096]);
  assert(imovelLigado(parcial, CLAUDIA));
  assert(!imovelLigado(parcial, 12673098)); // CONRADO: no escopo, mas não ligado
  assert(!imovelLigado(LIGADO, 12673094)); // fora do escopo, mesmo com "todos"
  assert(!imovelLigado(lerConfig({ ativo: false, imoveis: "todos" }), CLAUDIA));
});

Deno.test("porta de entrada: evento, código, imóvel e flag", () => {
  const ev = (extra: Record<string, unknown>) => lerEvento({ event: "reservation_updated", event_id: "E1", reservation_code: "R1", property_id: CLAUDIA, ...extra });
  assertEquals(decidirEvento(ev({}), LIGADO), { processar: true });
  assertEquals(decidirEvento(ev({ property_id: String(CLAUDIA) }), LIGADO), { processar: true });
  assert(!decidirEvento(ev({ event: "message_created" }), LIGADO).processar);
  assert(!decidirEvento(ev({ reservation_code: "" }), LIGADO).processar);
  assert(!decidirEvento(ev({ property_id: "CLAUDIA" }), LIGADO).processar); // nunca por nome
  assert(!decidirEvento(ev({}), lerConfig({ ativo: false, imoveis: "todos" })).processar);
  assert(!decidirEvento(ev({}), lerConfig({ ativo: true, imoveis: [12673096] })).processar);
});
