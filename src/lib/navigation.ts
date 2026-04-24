import type { NavigateFunction, Location } from "react-router-dom";

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
 * Volta para a página anterior respeitando a origem registrada (location.state.from)
 * ou o histórico do browser. Se nada estiver disponível, vai para o fallback.
 *
 * Padrão de uso recomendado nas páginas de origem:
 *   navigate('/destino', { state: { from: pathname } })
 *
 * E na página destino, no clique do botão voltar:
 *   goBack(navigate, '/fallback', location)
 *
 * @param navigate - função navigate do react-router-dom
 * @param fallback - rota de fallback quando não há origem nem histórico
 * @param location - objeto de location atual (para ler state.from)
 */
export function goBack(
  navigate: NavigateFunction,
  fallback = "/painel",
  location?: Location
) {
  const from = (location?.state as { from?: string } | null)?.from;
  if (from && typeof from === "string") {
    navigate(from);
    return;
  }
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate(fallback, { replace: true });
  }
}
