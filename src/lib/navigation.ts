import type { NavigateFunction } from "react-router-dom";

const SCROLL_KEY_PREFIX = "scroll_pos:";

/**
 * Salva a posição de scroll atual associada ao pathname.
 * Chamar antes de navegar para outra página.
 */
export function saveScrollPosition(pathname: string) {
  try {
    sessionStorage.setItem(
      SCROLL_KEY_PREFIX + pathname,
      String(window.scrollY)
    );
  } catch {}
}

/**
 * Restaura a posição de scroll salva para um pathname.
 * Chamar no onMount da página destino.
 */
export function restoreScrollPosition(pathname: string) {
  try {
    const saved = sessionStorage.getItem(SCROLL_KEY_PREFIX + pathname);
    if (saved !== null) {
      const y = parseInt(saved, 10);
      // Usar requestAnimationFrame para garantir que o DOM já renderizou
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, behavior: "instant" });
        });
      });
      // Limpar após restaurar (não guardar entre sessões)
      sessionStorage.removeItem(SCROLL_KEY_PREFIX + pathname);
    }
  } catch {}
}

/**
 * Volta para a página anterior do app respeitando o histórico do react-router.
 *
 * Estratégia (em ordem):
 *  1. Se o react-router tem uma entrada anterior dentro do app (idx > 0),
 *     usa navigate(-1) para reproduzir o botão voltar do navegador.
 *  2. Caso contrário (entrou direto via link, notificação, abrir nova aba,
 *     PWA standalone, etc.), navega para o fallback informado.
 *
 * Isso evita "saltos" estranhos onde o usuário entra direto numa rota e
 * o voltar leva para outro site / página de login antiga.
 *
 * @param navigate - função navigate do react-router-dom
 * @param fallback - rota de fallback quando não há histórico interno (default: "/painel")
 */
export function goBack(navigate: NavigateFunction, fallback = "/painel") {
  // O react-router mantém um índice da entrada atual dentro do histórico do app.
  // Se idx > 0, há pelo menos uma página anterior do nosso app no histórico.
  const state = (typeof window !== "undefined" ? window.history.state : null) as
    | { idx?: number }
    | null;
  const idx = state?.idx ?? 0;

  if (idx > 0) {
    navigate(-1);
  } else {
    navigate(fallback, { replace: true });
  }
}
