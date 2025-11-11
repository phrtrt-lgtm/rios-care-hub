export const CHARGE_CATEGORIES = {
  hidraulica: 'Hidráulica',
  eletrica: 'Elétrica',
  marcenaria: 'Marcenaria',
  itens: 'Itens',
  estrutural: 'Estrutural',
  refrigeracao: 'Refrigeração',
} as const;

export type ChargeCategory = keyof typeof CHARGE_CATEGORIES;

export const CHARGE_CATEGORY_OPTIONS = Object.entries(CHARGE_CATEGORIES).map(([value, label]) => ({
  value,
  label,
}));
