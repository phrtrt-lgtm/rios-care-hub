import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Ticket, DollarSign, Building2, User, Loader2, FileText, ArrowRight, Command } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  type: "ticket" | "charge" | "property" | "owner";
  status?: string;
  url: string;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const searchAll = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    const searchResults: SearchResult[] = [];

    try {
      // Search tickets
      const { data: tickets } = await supabase
        .from("tickets")
        .select("id, subject, status, priority")
        .or(`subject.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        .limit(5);

      if (tickets) {
        tickets.forEach((ticket) => {
          searchResults.push({
            id: ticket.id,
            title: ticket.subject,
            subtitle: `Ticket • ${ticket.status}`,
            type: "ticket",
            status: ticket.status,
            url: `/ticket-detalhes/${ticket.id}`,
          });
        });
      }

      // Search charges
      const { data: charges } = await supabase
        .from("charges")
        .select("id, title, status, amount_cents")
        .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        .limit(5);

      if (charges) {
        charges.forEach((charge) => {
          searchResults.push({
            id: charge.id,
            title: charge.title,
            subtitle: `Cobrança • R$ ${(charge.amount_cents / 100).toFixed(2)}`,
            type: "charge",
            status: charge.status,
            url: `/cobranca/${charge.id}`,
          });
        });
      }

      // Search properties
      const { data: properties } = await supabase
        .from("properties")
        .select("id, name, address")
        .or(`name.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
        .limit(5);

      if (properties) {
        properties.forEach((property) => {
          searchResults.push({
            id: property.id,
            title: property.name,
            subtitle: property.address || "Propriedade",
            type: "property",
            url: `/admin/vistorias/${property.id}`,
          });
        });
      }

      // Search owners
      const { data: owners } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("role", "owner")
        .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(5);

      if (owners) {
        owners.forEach((owner) => {
          searchResults.push({
            id: owner.id,
            title: owner.name,
            subtitle: owner.email,
            type: "owner",
            url: `/propriedades?owner=${owner.id}`,
          });
        });
      }

      setResults(searchResults);
      setSelectedIndex(0);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchAll(query);
    }, 300);

    return () => clearTimeout(debounce);
  }, [query, searchAll]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleResultClick(results[selectedIndex]);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    onOpenChange(false);
    navigate(result.url);
  };

  const getIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "ticket":
        return <Ticket className="h-4 w-4" />;
      case "charge":
        return <DollarSign className="h-4 w-4" />;
      case "property":
        return <Building2 className="h-4 w-4" />;
      case "owner":
        return <User className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: SearchResult["type"]) => {
    switch (type) {
      case "ticket":
        return "bg-info/10 text-info border-info/30/30";
      case "charge":
        return "bg-success/10 text-success border-success/30/30";
      case "property":
        return "bg-primary/10 text-primary border-primary/30/30";
      case "owner":
        return "bg-warning/10 text-warning border-warning/30/30";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b px-4">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            placeholder="Buscar tickets, cobranças, propriedades..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-14 text-base"
          />
          {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>

        <ScrollArea className="max-h-[400px]">
          {results.length > 0 ? (
            <div className="p-2">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                    "hover:bg-accent/50",
                    index === selectedIndex && "bg-accent"
                  )}
                >
                  <div className={cn("p-2 rounded-md border", getTypeColor(result.type))}>
                    {getIcon(result.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{result.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{result.subtitle}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          ) : query.length >= 2 && !isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nenhum resultado encontrado</p>
              <p className="text-sm">Tente buscar por outro termo</p>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Digite para buscar</p>
              <p className="text-sm">Busque em tickets, cobranças, propriedades e proprietários</p>
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-2 flex items-center justify-between text-xs text-muted-foreground bg-muted/30">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">Enter</kbd>
              selecionar
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">Esc</kbd>
            fechar
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useGlobalSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return { open, setOpen };
}
