import { useState, useCallback } from 'react';

export type DetailEntityType = 'maintenance' | 'vistoria' | 'cobranca';

interface DetailSheetState {
  open: boolean;
  entityId: string | null;
  entityType: DetailEntityType | null;
}

export function useDetailSheet() {
  const [state, setState] = useState<DetailSheetState>({
    open: false,
    entityId: null,
    entityType: null,
  });

  const openSheet = useCallback((entityId: string, entityType: DetailEntityType) => {
    setState({ open: true, entityId, entityType });
  }, []);

  const closeSheet = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  return { ...state, openSheet, closeSheet };
}
