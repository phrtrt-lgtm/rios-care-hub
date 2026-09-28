export const CHARGE_CATEGORIES = {
  hidraulica: 'Hidráulica',
  eletrica: 'Elétrica',
  marcenaria: 'Marcenaria',
  itens: 'Itens',
  estrutural: 'Estrutural',
  refrigeracao: 'Refrigeração',
  vidracaria: 'Vidraçaria',
  dedetizacao: 'Dedetização',
  servico_misto: 'Serviço Misto',
} as const;

export type ChargeCategory = keyof typeof CHARGE_CATEGORIES;

export const CHARGE_CATEGORY_OPTIONS = Object.entries(CHARGE_CATEGORIES).map(([value, label]) => ({
  value,
  label,
}));

/* ------------------------------------------------------------------------ */
/* Tipo de serviço (a "etiqueta" da lista de manutenções)                    */
/* ------------------------------------------------------------------------ */

/**
 * Rótulos de tipo de serviço. São as categorias de cobrança mais
 * `infiltracao`, que também define o quadro Infiltração da lista
 * (ver `src/lib/maintenanceBoard.ts`) e por isso não entra em
 * `CHARGE_CATEGORY_OPTIONS`, usado nos formulários de cobrança.
 */
export const SERVICE_TYPE_LABELS = {
  ...CHARGE_CATEGORIES,
  infiltracao: 'Infiltração',
} as const;

export type ServiceType = keyof typeof SERVICE_TYPE_LABELS;

export const SERVICE_TYPE_OPTIONS = Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Rótulo de um tipo de serviço. Aceita o identificador (`hidraulica`), o
 * rótulo gravado nas linhas antigas (`Hidráulica`) e grafias sem acento.
 * Valor desconhecido volta como veio, nunca vazio.
 */
export function rotuloServico(value: string | null | undefined): string {
  const bruto = (value ?? '').trim();
  if (!bruto) return '';
  const direto = SERVICE_TYPE_LABELS[bruto as ServiceType];
  if (direto) return direto;
  const alvo = normalizar(bruto);
  for (const [id, rotulo] of Object.entries(SERVICE_TYPE_LABELS)) {
    if (normalizar(id) === alvo || normalizar(rotulo) === alvo) return rotulo;
  }
  return bruto;
}

/** O campo é multi-select gravado como "a,b,c": devolve os rótulos, sem vazios. */
export function rotulosServico(csv: string | null | undefined): string[] {
  return (csv ?? '')
    .split(',')
    .map((v) => rotuloServico(v))
    .filter(Boolean);
}

/* ------------------------------------------------------------------------ */
/* Responsável pelo custo                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Quem paga a manutenção (`tickets.cost_responsible` / `charges.cost_responsible`).
 * `pending` é "ainda não decidido": o proprietário não vê a manutenção e
 * nenhuma notificação sai até a equipe escolher um responsável.
 */
export const RESPONSAVEL_CUSTO = {
  pending: 'Em espera',
  owner: 'Proprietário',
  pm: 'Gestão',
  guest: 'Hóspede',
} as const;

export type ResponsavelCusto = keyof typeof RESPONSAVEL_CUSTO;

export const RESPONSAVEL_CUSTO_OPTIONS = (Object.keys(RESPONSAVEL_CUSTO) as ResponsavelCusto[]).map((value) => ({
  value,
  label: RESPONSAVEL_CUSTO[value],
}));

/**
 * Rótulo seguro para qualquer valor gravado, inclusive os antigos
 * (`management` = Gestão, `split` = Dividido). Vazio vira "—".
 */
export function rotuloResponsavelCusto(
  value: string | null | undefined,
  splitOwnerPercent?: number | null,
): string {
  if (!value) return '—';
  const conhecido = RESPONSAVEL_CUSTO[value as ResponsavelCusto];
  if (conhecido) return conhecido;
  if (value === 'management') return RESPONSAVEL_CUSTO.pm;
  if (value === 'split') {
    return splitOwnerPercent != null ? `Dividido (${splitOwnerPercent}% do proprietário)` : 'Dividido';
  }
  return value;
}
