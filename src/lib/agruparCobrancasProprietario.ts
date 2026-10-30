import { valorDevido, type ValoresCobranca } from "./cobrancaMeta";
import { cobrancaVencida } from "./vencimento";

interface CobrancaAgrupavel extends ValoresCobranca {
  id: string;
  owner_id: string;
  status: string;
  due_date: string | null;
  owner: { name: string };
  property?: { id: string; name: string; cover_photo_url: string | null };
}

/** Titular financeiro é a chave: nunca juntar pessoas pelo nome ou por imóvel nulo. */
export function agruparCobrancasProprietario<T extends CobrancaAgrupavel>(charges: T[]) {
  const groups = new Map<string, {
    id: string; name: string; ownerName: string; cover_photo_url: string | null;
    charges: T[]; openCount: number; overdueCount: number; totalDueCents: number;
  }>();
  for (const charge of charges) {
    let group = groups.get(charge.owner_id);
    if (!group) {
      group = { id: charge.owner_id, name: "", ownerName: charge.owner.name,
        cover_photo_url: charge.property?.cover_photo_url ?? null,
        charges: [], openCount: 0, overdueCount: 0, totalDueCents: 0 };
      groups.set(charge.owner_id, group);
    }
    group.charges.push(charge);
    group.totalDueCents += valorDevido(charge);
    if (cobrancaVencida(charge)) group.overdueCount++;
    else group.openCount++;
  }
  for (const group of groups.values()) {
    group.name = [...new Set(group.charges.map(c => c.property?.name ?? "Sem imóvel"))]
      .sort((a, b) => a.localeCompare(b, "pt-BR")).join(" · ");
  }
  return [...groups.values()];
}