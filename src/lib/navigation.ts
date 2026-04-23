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
 * Volta para a página anterior respeitando o histórico do browser.
 * Se não houver histórico (PWA, link direto), navega para o fallback.
 *
 * @param navigate - função navigate do react-router-dom
 * @param fallback - rota de fallback quando não há histórico (default: "/painel")
 */
export function goBack(navigate: NavigateFunction, fallback = "/painel") {
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate(fallback, { replace: true });
  }
}
