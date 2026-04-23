import { ReactNode } from "react";
import { Search, X, SlidersHorizontal, Calendar as CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { ListFiltersState, DateRangePreset } from "@/hooks/useListFilters";

export interface FilterOption {
  value: string;
  label: string;
}

export interface ListFiltersProps {
  filters: ListFiltersState;
  setSearch: (v: string) => void;
  setStatus: (v: string) => void;
  setPriority: (v: string) => void;
  setProperty: (v: string) => void;
  setDatePreset: (v: DateRangePreset) => void;
  setDateFrom: (v: string | null) => void;
  setDateTo: (v: string | null) => void;
  reset: () => void;
  hasActive: boolean;
  activeCount: number;

  searchPlaceholder?: string;
  statusOptions?: FilterOption[];
  priorityOptions?: FilterOption[];
  propertyOptions?: FilterOption[];
  showDateRange?: boolean;

  totalCount: number;
  filteredCount: number;

  /** Optional extra controls rendered to the right (desktop) / inside sheet (mobile) */
  extra?: ReactNode;
  className?: string;
}

function FieldsBlock(props: ListFiltersProps & { isMobileLayout?: boolean }) {
  const {
    filters,
    setStatus,
    setPriority,
    setProperty,
    setDatePreset,
    setDateFrom,
    setDateTo,
    statusOptions,
    priorityOptions,
    propertyOptions,
    showDateRange,
    extra,
    isMobileLayout,
  } = props;

  return (
    <div
      className={cn(
        "grid gap-3",
        isMobileLayout
          ? "grid-cols-1"
          : "grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
      )}
    >
      {statusOptions && statusOptions.length > 0 && (
        <Select value={filters.status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">Todos os status</SelectItem>
            {statusOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {priorityOptions && priorityOptions.length > 0 && (
        <Select value={filters.priority} onValueChange={setPriority}>
          <SelectTrigger>
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">Todas as prioridades</SelectItem>
            {priorityOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {propertyOptions && propertyOptions.length > 0 && (
        <Select value={filters.property} onValueChange={setProperty}>
          <SelectTrigger>
            <SelectValue placeholder="Imóvel" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50 max-h-72">
            <SelectItem value="all">Todos os imóveis</SelectItem>
            {propertyOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showDateRange && (
        <Select value={filters.datePreset} onValueChange={(v) => setDatePreset(v as DateRangePreset)}>
          <SelectTrigger>
            <CalendarIcon className="h-4 w-4 mr-1 opacity-60" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">Qualquer período</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="custom">Personalizado…</SelectItem>
          </SelectContent>
        </Select>
      )}

      {showDateRange && filters.datePreset === "custom" && (
        <div className={cn("flex items-center gap-2", isMobileLayout ? "col-span-1" : "col-span-2 lg:col-span-2")}>
          <Input
            type="date"
            value={filters.dateFrom ?? ""}
            onChange={(e) => setDateFrom(e.target.value || null)}
            className="w-full"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            value={filters.dateTo ?? ""}
            onChange={(e) => setDateTo(e.target.value || null)}
            className="w-full"
          />
        </div>
      )}

      {extra}
    </div>
  );
}

export function ListFilters(props: ListFiltersProps) {
  const isMobile = useIsMobile();
  const {
    filters,
    setSearch,
    reset,
    hasActive,
    activeCount,
    searchPlaceholder = "Buscar…",
    totalCount,
    filteredCount,
    className,
  } = props;

  const counter = (
    <div className="text-xs text-muted-foreground whitespace-nowrap">
      Mostrando <strong className="text-foreground">{filteredCount}</strong> de{" "}
      <strong className="text-foreground">{totalCount}</strong>
    </div>
  );

  if (isMobile) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={filters.search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="relative shrink-0">
                <SlidersHorizontal className="h-4 w-4" />
                {activeCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                    style={{ background: "hsl(var(--rios-terra, var(--primary)))" }}
                  >
                    {activeCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85vh] flex flex-col">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto py-4">
                <FieldsBlock {...props} isMobileLayout />
              </div>
              <SheetFooter className="flex-row gap-2">
                {hasActive && (
                  <Button variant="outline" onClick={reset} className="flex-1">
                    <X className="h-4 w-4 mr-1" /> Limpar
                  </Button>
                )}
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
        <div className="flex items-center justify-between">
          {counter}
          {hasActive && (
            <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
              <X className="h-3 w-3 mr-1" /> Limpar filtros
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={filters.search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex-[2]">
          <FieldsBlock {...props} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {counter}
        {hasActive && (
          <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
            <X className="h-3 w-3 mr-1" /> Limpar filtros ({activeCount})
          </Button>
        )}
      </div>
    </div>
  );
}
