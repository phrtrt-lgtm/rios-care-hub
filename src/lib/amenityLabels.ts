import {
  KITCHEN_ITEMS,
  SPECIAL_AMENITIES,
  CONDO_AMENITIES,
} from "@/constants/intakeOptions";

type AmenityEntry = { value: string; label: string; icon: string };

const ALL: AmenityEntry[] = [
  ...KITCHEN_ITEMS,
  ...SPECIAL_AMENITIES,
  ...CONDO_AMENITIES,
];

const MAP = new Map<string, AmenityEntry>(ALL.map((a) => [a.value, a]));

/**
 * Resolve uma amenidade vinda do intake (pode ser o `value` interno
 * ou uma string livre) para `{ label, icon }`. Sempre retorna algo
 * apresentável, mesmo para valores fora do catálogo.
 */
export function resolveAmenity(raw: string): { label: string; icon: string } {
  if (!raw) return { label: "—", icon: "✨" };
  const found = MAP.get(raw);
  if (found) return { label: found.label, icon: found.icon };

  // Heurística leve para amenidades livres que não estão no catálogo
  const lower = raw.toLowerCase();
  if (lower.includes("wi-fi") || lower.includes("wifi")) return { label: raw, icon: "📶" };
  if (lower.includes("ar-cond") || lower.includes("ar cond")) return { label: raw, icon: "❄️" };
  if (lower.includes("tv")) return { label: raw, icon: "📺" };
  if (lower.includes("piscina")) return { label: raw, icon: "🏊" };
  if (lower.includes("churrasq")) return { label: raw, icon: "🍖" };
  if (lower.includes("academ")) return { label: raw, icon: "🏋️" };
  if (lower.includes("praia") || lower.includes("mar")) return { label: raw, icon: "🌊" };
  if (lower.includes("vista")) return { label: raw, icon: "🌅" };
  if (lower.includes("jardim")) return { label: raw, icon: "🌿" };
  if (lower.includes("portaria")) return { label: raw, icon: "🛎️" };
  if (lower.includes("pet")) return { label: raw, icon: "🐾" };
  if (lower.includes("cama") || lower.includes("colchão")) return { label: raw, icon: "🛏️" };
  return { label: raw, icon: "✨" };
}

export function resolveAmenities(list: string[] | null | undefined) {
  return (list ?? []).map(resolveAmenity);
}
