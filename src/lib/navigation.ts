import type { NavigateFunction } from "react-router-dom";

/**
 * Safely navigate back. If there's no history (e.g. direct link, PWA),
 * falls back to the given route (default: /painel).
 */
export function goBack(navigate: NavigateFunction, fallback = "/painel") {
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate(fallback, { replace: true });
  }
}
