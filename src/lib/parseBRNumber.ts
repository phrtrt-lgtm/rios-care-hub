/**
 * Aceita valores em formato BR ("2.956,06") e internacional ("2956.06").
 * - Se houver vírgula: pontos são separadores de milhar e vírgula é o decimal.
 * - Caso contrário: usa parseFloat padrão (decimal com ponto).
 */
export function parseBRNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).trim();
  if (!s) return 0;
  if (s.includes(",")) {
    const normalized = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(normalized);
    return isNaN(n) ? 0 : n;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
