import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { restoreScrollPosition } from "@/lib/navigation";

/**
 * Restaura automaticamente o scroll da página atual quando ela monta.
 * Usar no topo de páginas que são "destino" de navegação (listas, dashboards).
 */
export function useScrollRestoration() {
  const { pathname } = useLocation();

  useEffect(() => {
    restoreScrollPosition(pathname);
  }, [pathname]);
}
