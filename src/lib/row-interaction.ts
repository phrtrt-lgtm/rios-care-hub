import React from 'react';

/**
 * Handlers reutilizáveis para linhas de lista:
 * - onClick: abre Sheet de preview lateral
 * - onMouseDown (botão do meio): abre a página de detalhe em nova aba
 *
 * Elementos filhos com [data-no-sheet], button, input, select, textarea ou
 * label não disparam o Sheet — preserva comportamentos inline existentes.
 */
export function getRowHandlers(route: string, onOpenSheet: () => void) {
  return {
    onClick: (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = target.closest(
        'button, input, select, textarea, label, a, [role="checkbox"], [data-no-sheet]',
      );
      if (isInteractive) return;
      onOpenSheet();
    },
    onMouseDown: (e: React.MouseEvent) => {
      // Botão do meio (middle-click)
      if (e.button === 1) {
        const target = e.target as HTMLElement;
        const isInteractive = target.closest(
          'button, input, select, textarea, [data-no-sheet]',
        );
        if (isInteractive) return;
        e.preventDefault();
        window.open(route, '_blank', 'noopener,noreferrer');
      }
    },
    onAuxClick: (e: React.MouseEvent) => {
      // Alguns navegadores disparam apenas auxclick para middle-click
      if (e.button === 1) {
        const target = e.target as HTMLElement;
        const isInteractive = target.closest(
          'button, input, select, textarea, [data-no-sheet]',
        );
        if (isInteractive) return;
        e.preventDefault();
        window.open(route, '_blank', 'noopener,noreferrer');
      }
    },
    style: { cursor: 'pointer' } as React.CSSProperties,
  };
}
