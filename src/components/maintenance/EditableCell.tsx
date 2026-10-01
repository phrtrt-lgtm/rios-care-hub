import React, { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { parseBRNumber } from "@/lib/parseBRNumber";
import { tomDaCor, type SortDirection, type SortField } from "./listaTipos";

// ===== SORTABLE HEADER COMPONENT =====
interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentSort: SortField | null;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
}

export function SortableHeader({ label, field, currentSort, direction, onSort, className }: SortableHeaderProps) {
  const isActive = currentSort === field;

  // Detect text alignment from className to align the inner flex accordingly.
  const justify = className?.includes("text-right")
    ? "justify-end"
    : className?.includes("text-left")
    ? "justify-start"
    : "justify-center";

  return (
    <th
      className={cn("px-1 py-2 font-medium cursor-pointer hover:bg-muted/50 transition-colors select-none", className)}
      onClick={() => onSort(field)}
    >
      <div className={cn("flex items-center gap-1", justify)}>
        <span>{label}</span>
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 text-primary" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-50" />
        )}
      </div>
    </th>
  );
}

// ===== INLINE EDIT CELL COMPONENT =====
interface EditableCellProps {
  value: string | number | null;
  type: "text" | "currency" | "date" | "select" | "multi-select";
  options?: { value: string; label: string; color?: string }[];
  onSave: (newValue: string | number | null) => void;
  className?: string;
  placeholder?: string;
}

export function EditableCell({ value, type, options, onSave, className, placeholder }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    setIsEditing(false);
    if (type === "currency") {
      const numValue = parseBRNumber(editValue);
      if (!isNaN(numValue)) {
        onSave(Math.round(numValue * 100));
      }
    } else {
      onSave(editValue || null);
    }
  }, [editValue, type, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue(String(value ?? ""));
    }
  }, [handleSave, value]);

  if (type === "multi-select") {
    // Value stored as CSV string. Dedupe + filter empties.
    const selectedValues = String(value || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    // De-duplicate options by canonical value (lower-case) so legacy + new options don't repeat
    const uniqueOptions = options?.filter((opt, idx, arr) => {
      return arr.findIndex((o) => o.label === opt.label) === idx;
    }) || [];
    const selectedOptions = uniqueOptions.filter((o) =>
      selectedValues.some(
        (sv) => sv === o.value || sv.toLowerCase() === o.value.toLowerCase() || sv === o.label,
      ),
    );

    const toggleValue = (optValue: string) => {
      const exists = selectedValues.some(
        (sv) => sv === optValue || sv.toLowerCase() === optValue.toLowerCase(),
      );
      let next: string[];
      if (exists) {
        next = selectedValues.filter(
          (sv) => sv !== optValue && sv.toLowerCase() !== optValue.toLowerCase(),
        );
      } else {
        next = [...selectedValues, optValue];
      }
      onSave(next.length > 0 ? next.join(",") : null);
    };

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-8 w-full flex items-center gap-1 px-2 rounded hover:bg-muted/50 transition-colors text-sm overflow-hidden",
              className,
            )}
            data-no-sheet
          >
            {selectedOptions.length > 0 ? (
              <div className="flex items-center gap-1 flex-wrap">
                {selectedOptions.slice(0, 2).map((opt) => (
                  <Etiqueta key={opt.value} solida tom={tomDaCor(opt.color)}>
                    {opt.label}
                  </Etiqueta>
                ))}
                {selectedOptions.length > 2 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    +{selectedOptions.length - 2}
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">{placeholder || "—"}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start" data-no-sheet>
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
            {uniqueOptions.map((opt) => {
              const isSelected = selectedOptions.some((s) => s.label === opt.label);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleValue(opt.value)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-left"
                >
                  <Checkbox checked={isSelected} className="pointer-events-none" />
                  <Etiqueta solida tom={tomDaCor(opt.color)}>{opt.label}</Etiqueta>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  if (type === "select") {
    const selectedOption = options?.find(o => o.value === value);
    return (
      <Select 
        value={String(value || "")} 
        onValueChange={(v) => onSave(v)}
      >
        <SelectTrigger className={cn("h-8 border-0 bg-transparent hover:bg-muted/50 transition-colors", className)} data-no-sheet>
          {selectedOption ? (
            <Etiqueta solida tom={tomDaCor(selectedOption.color)}>
              {selectedOption.label}
            </Etiqueta>
          ) : (
            <span className="text-muted-foreground text-sm">{placeholder || "—"}</span>
          )}
        </SelectTrigger>
        <SelectContent data-no-sheet>
          {options?.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              <Etiqueta solida tom={tomDaCor(opt.color)}>{opt.label}</Etiqueta>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1" data-no-sheet>
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          type={type === "date" ? "date" : "text"}
          className="h-8 text-sm w-full"
        />
      </div>
    );
  }

  let displayValue = value;
  if (type === "currency" && typeof value === "number") {
    displayValue = formatBRL(value);
  } else if (type === "date" && value) {
    displayValue = format(new Date(String(value)), "dd/MM/yyyy", { locale: ptBR });
  }

  return (
    <div
      data-no-sheet
      onClick={(e) => {
        e.stopPropagation();
        setEditValue(type === "currency" && typeof value === "number" 
          ? (value / 100).toFixed(2).replace(".", ",")
          : String(value ?? "")
        );
        setIsEditing(true);
      }}
      className={cn(
        "h-8 flex items-center px-2 rounded cursor-pointer hover:bg-muted/50 transition-colors text-sm",
        !displayValue && "text-muted-foreground",
        className
      )}
    >
      {displayValue || placeholder || "—"}
    </div>
  );
}
