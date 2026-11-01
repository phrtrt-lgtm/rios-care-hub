/**
 * Visibilidade do score de pagamentos do proprietário.
 *
 * O cálculo continua (webhook do Mercado Pago, ajuste manual em
 * CobrancaDetalhes, histórico em owner_payment_scores); só a área saiu das
 * telas em 2026-11-01, a pedido do gestor: não ficou relevante e poluía,
 * principalmente para o proprietário. Para voltar, basta trocar para true —
 * MinhaCaixa, OwnerResumo, NovaCobranca e o "(+5 pts)" do seletor de status
 * em CobrancaDetalhes leem daqui.
 */
export const SCORE_VISIVEL = false;
