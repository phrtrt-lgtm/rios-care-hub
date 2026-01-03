import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Search, Loader2 } from "lucide-react";

interface ResponseTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  shortcut: string | null;
}

interface ResponseTemplatesPickerProps {
  onSelect: (content: string) => void;
  disabled?: boolean;
}

const CATEGORIES = [
  { value: "geral", label: "Geral" },
  { value: "saudacao", label: "Saudação" },
  { value: "fechamento", label: "Fechamento" },
  { value: "manutencao", label: "Manutenção" },
  { value: "cobranca", label: "Cobrança" },
  { value: "informacao", label: "Informação" },
];

export function ResponseTemplatesPicker({ onSelect, disabled }: ResponseTemplatesPickerProps) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';

  useEffect(() => {
    if (open && isTeamMember) {
      fetchTemplates();
    }
  }, [open, isTeamMember]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("response_templates")
        .select("id, title, content, category, shortcut")
        .eq("is_active", true)
        .order("usage_count", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (template: ResponseTemplate) => {
    onSelect(template.content);
    setOpen(false);
    setSearchTerm("");

    // Increment usage count
    try {
      const currentCount = templates.find(t => t.id === template.id) as any;
      await supabase
        .from("response_templates")
        .update({ usage_count: (currentCount?.usage_count || 0) + 1 })
        .eq("id", template.id);
    } catch (e) {
      // Ignore usage tracking errors
    }
  };

  const filteredTemplates = templates.filter(t => {
    const term = searchTerm.toLowerCase();
    return t.title.toLowerCase().includes(term) ||
      t.content.toLowerCase().includes(term) ||
      (t.shortcut?.toLowerCase().includes(term));
  });

  if (!isTeamMember) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 flex-shrink-0"
          disabled={disabled}
          title="Templates de resposta"
        >
          <FileText className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar template ou atalho..."
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="h-64">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {templates.length === 0 ? "Nenhum template cadastrado" : "Nenhum resultado"}
            </div>
          ) : (
            <div className="p-2">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                  onClick={() => handleSelect(template)}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm truncate">{template.title}</span>
                    {template.shortcut && (
                      <code className="text-[10px] bg-muted px-1 rounded flex-shrink-0">
                        {template.shortcut}
                      </code>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                      {CATEGORIES.find(c => c.value === template.category)?.label || template.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">
                      {template.content.substring(0, 50)}...
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
