/**
 * Quadros da lista de manutenções da equipe (/admin/manutencoes-lista).
 *
 * "Quadro" não é uma coluna: é a combinação de dois campos reais do ticket,
 * porque um item pode ser infiltração E estar parado ao mesmo tempo.
 *
 * - Infiltração  → a label de serviço contém `infiltracao` (gravada onde as
 *                  labels já vivem: charge.service_type / tickets.charge_draft_category).
 * - Stand-by     → `tickets.on_hold = true`. Coluna própria, invisível ao
 *                  proprietário; não mexe no status do ticket.
 *
 * Precedência decidida pelo gestor em 2026-09-22: Infiltração vence Stand-by.
 * Uma infiltração parada continua no quadro Infiltração, com etiqueta.
 */

export type Board = "em_progresso" | "stand_by" | "infiltracao";

export const BOARD_OPTIONS: { value: Board; label: string; color: string }[] = [
  { value: "em_progresso", label: "Em Progresso", color: "bg-warning" },
  { value: "stand_by", label: "Stand-by", color: "bg-muted-foreground" },
  { value: "infiltracao", label: "Infiltração", color: "bg-info" },
];

const INFILTRACAO_VALUES = ["infiltracao", "infiltração"];

/** A label de serviço é multi-select gravada como "a,b,c". */
export const splitLabels = (s?: string | null): string[] =>
  (s || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export const hasInfiltracao = (serviceType?: string | null): boolean =>
  splitLabels(serviceType).some((v) => INFILTRACAO_VALUES.includes(v.toLowerCase()));

export const deriveBoard = (item: {
  service_type?: string | null;
  on_hold?: boolean | null;
}): Board => {
  if (hasInfiltracao(item.service_type)) return "infiltracao";
  if (item.on_hold) return "stand_by";
  return "em_progresso";
};

/** Devolve a label com `infiltracao` adicionada ou removida, preservando o resto. */
export const withInfiltracao = (serviceType: string | null | undefined, on: boolean): string => {
  const rest = splitLabels(serviceType).filter(
    (v) => !INFILTRACAO_VALUES.includes(v.toLowerCase()),
  );
  return (on ? [...rest, "infiltracao"] : rest).join(",");
};

/**
 * Traduz a escolha no seletor "Quadro" para os dois campos reais.
 *
 * | escolha       | on_hold | label infiltracao |
 * |---------------|---------|-------------------|
 * | Em Progresso  | false   | removida          |
 * | Stand-by      | true    | mantida           |
 * | Infiltração   | false   | adicionada        |
 */
export const boardChange = (
  atual: { service_type?: string | null; on_hold?: boolean | null },
  escolha: Board,
): { on_hold: boolean; service_type: string | null | undefined } => {
  const on_hold = escolha === "stand_by";
  if (escolha === "stand_by") {
    return { on_hold, service_type: undefined }; // label não muda
  }
  const nova = withInfiltracao(atual.service_type, escolha === "infiltracao");
  return { on_hold, service_type: nova || null };
};
