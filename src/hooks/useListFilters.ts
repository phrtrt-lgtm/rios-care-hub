import { useCallback, useEffect, useMemo, useState } from "react";

export type DateRangePreset = "all" | "7d" | "30d" | "custom";

export interface ListFiltersState {
  search: string;
  status: string;
  priority: string;
  property: string;
  datePreset: DateRangePreset;
  dateFrom: string | null; // ISO date (yyyy-mm-dd)
  dateTo: string | null;
}

export const DEFAULT_FILTERS: ListFiltersState = {
  search: "",
  status: "all",
  priority: "all",
  property: "all",
  datePreset: "all",
  dateFrom: null,
  dateTo: null,
};

function loadFromStorage(key: string): ListFiltersState {
  if (typeof window === "undefined") return { ...DEFAULT_FILTERS };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...DEFAULT_FILTERS };
    const parsed = JSON.parse(raw) as Partial<ListFiltersState>;
    return { ...DEFAULT_FILTERS, ...parsed };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

/**
 * Persistent list filters (localStorage by storageKey).
 * Returns full state + setters + helpers.
 */
export function useListFilters(storageKey: string) {
  const [filters, setFilters] = useState<ListFiltersState>(() =>
    loadFromStorage(storageKey)
  );

  // Persist
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(filters));
    } catch {
      // ignore quota / SSR
    }
  }, [filters, storageKey]);

  // Debounced search value (250ms)
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 250);
    return () => clearTimeout(t);
  }, [filters.search]);

  const setSearch = useCallback((v: string) => {
    setFilters((f) => ({ ...f, search: v }));
  }, []);
  const setStatus = useCallback((v: string) => {
    setFilters((f) => ({ ...f, status: v }));
  }, []);
  const setPriority = useCallback((v: string) => {
    setFilters((f) => ({ ...f, priority: v }));
  }, []);
  const setProperty = useCallback((v: string) => {
    setFilters((f) => ({ ...f, property: v }));
  }, []);
  const setDatePreset = useCallback((v: DateRangePreset) => {
    setFilters((f) => {
      if (v === "all") return { ...f, datePreset: v, dateFrom: null, dateTo: null };
      if (v === "7d") {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 7);
        return {
          ...f,
          datePreset: v,
          dateFrom: from.toISOString().slice(0, 10),
          dateTo: to.toISOString().slice(0, 10),
        };
      }
      if (v === "30d") {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 30);
        return {
          ...f,
          datePreset: v,
          dateFrom: from.toISOString().slice(0, 10),
          dateTo: to.toISOString().slice(0, 10),
        };
      }
      return { ...f, datePreset: v };
    });
  }, []);
  const setDateFrom = useCallback((v: string | null) => {
    setFilters((f) => ({ ...f, datePreset: "custom", dateFrom: v }));
  }, []);
  const setDateTo = useCallback((v: string | null) => {
    setFilters((f) => ({ ...f, datePreset: "custom", dateTo: v }));
  }, []);

  const reset = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n++;
    if (filters.status !== "all") n++;
    if (filters.priority !== "all") n++;
    if (filters.property !== "all") n++;
    if (filters.datePreset !== "all") n++;
    return n;
  }, [filters]);

  const hasActive = activeCount > 0;

  /**
   * Generic helper to filter an array of items using the current filters.
   * `getters` map filter keys to value extractors on each item.
   */
  const applyTo = useCallback(
    <T,>(
      items: T[],
      getters: {
        searchFields?: (item: T) => Array<string | null | undefined>;
        status?: (item: T) => string | null | undefined;
        priority?: (item: T) => string | null | undefined;
        propertyId?: (item: T) => string | null | undefined;
        date?: (item: T) => string | Date | null | undefined;
      }
    ): T[] => {
      const search = debouncedSearch.trim().toLowerCase();
      const fromTs = filters.dateFrom ? new Date(filters.dateFrom + "T00:00:00").getTime() : null;
      const toTs = filters.dateTo ? new Date(filters.dateTo + "T23:59:59").getTime() : null;

      return items.filter((item) => {
        if (search && getters.searchFields) {
          const haystack = getters
            .searchFields(item)
            .filter(Boolean)
            .map((s) => String(s).toLowerCase())
            .join(" \u0001 ");
          if (!haystack.includes(search)) return false;
        }
        if (filters.status !== "all" && getters.status) {
          if (getters.status(item) !== filters.status) return false;
        }
        if (filters.priority !== "all" && getters.priority) {
          if (getters.priority(item) !== filters.priority) return false;
        }
        if (filters.property !== "all" && getters.propertyId) {
          if (getters.propertyId(item) !== filters.property) return false;
        }
        if ((fromTs || toTs) && getters.date) {
          const raw = getters.date(item);
          if (!raw) return false;
          const ts = new Date(raw).getTime();
          if (Number.isNaN(ts)) return false;
          if (fromTs && ts < fromTs) return false;
          if (toTs && ts > toTs) return false;
        }
        return true;
      });
    },
    [debouncedSearch, filters.status, filters.priority, filters.property, filters.dateFrom, filters.dateTo]
  );

  return {
    filters,
    debouncedSearch,
    setSearch,
    setStatus,
    setPriority,
    setProperty,
    setDatePreset,
    setDateFrom,
    setDateTo,
    reset,
    activeCount,
    hasActive,
    applyTo,
  };
}
