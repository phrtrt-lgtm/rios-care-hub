/** Valor do seletor para "não é de um imóvel só" (grava property_id nulo). */
export const IMOVEL_GERAL = "geral";

export interface ImovelOpcao {
  id: string;
  name: string;
}

/** Imóvel escolhido ou "geral"; o resto é tratado como não escolhido. */
export function imovelEhValido(valor: string | null, imoveis: ImovelOpcao[]): boolean {
  return valor === IMOVEL_GERAL || imoveis.some((i) => i.id === valor);
}
