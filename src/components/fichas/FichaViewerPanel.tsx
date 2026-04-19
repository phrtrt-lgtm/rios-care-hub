import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, Pencil, Copy, Check, FileText, Clock, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FichaHistoryDialog } from "./FichaHistoryDialog";

interface Props {
  propertyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (propertyId: string) => void;
}

interface FichaData {
  propertyName: string;
  content: string;
  version: number;
  updatedAt: string | null;
  hasContent: boolean;
}

/** Gera um id estável a partir do texto do heading (para anchors do TOC) */
const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

/** Botão de copiar reutilizável */
const CopyButton = ({ text, label }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copiado!", description: label ? `${label} copiado para a área de transferência.` : undefined });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
      aria-label="Copiar"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

export const FichaViewerPanel = ({ propertyId, open, onOpenChange, onEdit }: Props) => {
  const [data, setData] = useState<FichaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!open || !propertyId) return;
    void loadFicha(propertyId);
  }, [open, propertyId]);

  const loadFicha = async (id: string) => {
    setLoading(true);
    setData(null);
    try {
      const [{ data: prop }, { data: file }] = await Promise.all([
        supabase.from("properties").select("name").eq("id", id).maybeSingle(),
        supabase.from("property_files").select("content_md, version, updated_at").eq("property_id", id).maybeSingle(),
      ]);
      const content = file?.content_md || "";
      setData({
        propertyName: prop?.name || "Imóvel",
        content,
        version: file?.version ?? 1,
        updatedAt: file?.updated_at ?? null,
        hasContent: content.trim().length > 0,
      });
    } finally {
      setLoading(false);
    }
  };

  // Extrai TOC a partir dos headings (## e ###)
  const toc = useMemo(() => {
    if (!data?.content) return [];
    const lines = data.content.split("\n");
    const items: { level: number; text: string; id: string }[] = [];
    for (const line of lines) {
      const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
      if (m) {
        items.push({ level: m[1].length, text: m[2].trim(), id: slugify(m[2].trim()) });
      }
    }
    return items;
  }, [data?.content]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex items-center gap-2 text-left">
                <FileText className="h-5 w-5 text-primary shrink-0" />
                <span className="truncate">{data?.propertyName || "Carregando..."}</span>
              </SheetTitle>
              {data && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {data.hasContent ? (
                    <>
                      <Badge variant="outline" className="font-mono">v{data.version}</Badge>
                      {data.updatedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(data.updatedAt), { locale: ptBR, addSuffix: true })}
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge variant="outline">
                      Sem ficha cadastrada
                    </Badge>
                  )}
                </div>
              )}
            </div>
            {propertyId && (
              <div className="flex items-center gap-1 shrink-0">
                {data?.hasContent && data.version > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    Histórico
                  </Button>
                )}
                <Button size="sm" onClick={() => onEdit(propertyId)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Editar
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>

        {loading || !data ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data.hasContent ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Esta unidade ainda não tem ficha. Clique em "Editar" para criar.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {toc.length > 2 && (
              <aside className="hidden md:block w-48 shrink-0 border-r bg-muted/30">
                <ScrollArea className="h-full">
                  <div className="p-3 space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">
                      Sumário
                    </p>
                    {toc.map((item, i) => (
                      <a
                        key={i}
                        href={`#${item.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className={`block rounded px-2 py-1 text-xs hover:bg-accent hover:text-foreground transition-colors ${
                          item.level === 3 ? "pl-5 text-muted-foreground" : "font-medium text-foreground/80"
                        }`}
                      >
                        {item.text}
                      </a>
                    ))}
                  </div>
                </ScrollArea>
              </aside>
            )}

            <ScrollArea className="flex-1">
              <article className="prose prose-sm dark:prose-invert max-w-none px-6 py-5
                prose-headings:scroll-mt-4
                prose-h1:text-xl prose-h1:mb-3 prose-h1:mt-0
                prose-h2:text-base prose-h2:mt-6 prose-h2:mb-2 prose-h2:pb-1 prose-h2:border-b
                prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1.5
                prose-p:my-2 prose-p:leading-relaxed
                prose-ul:my-2 prose-li:my-0.5
                prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-muted prose-pre:text-foreground
                prose-a:text-primary">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children, ...props }) => {
                      const text = String(children);
                      return <h1 id={slugify(text)} {...props}>{children}</h1>;
                    },
                    h2: ({ children, ...props }) => {
                      const text = String(children);
                      return (
                        <h2 id={slugify(text)} className="group flex items-center gap-2" {...props}>
                          <span className="flex-1">{children}</span>
                          <CopyButton text={text} label={text} />
                        </h2>
                      );
                    },
                    h3: ({ children, ...props }) => {
                      const text = String(children);
                      return (
                        <h3 id={slugify(text)} className="group flex items-center gap-2" {...props}>
                          <span className="flex-1">{children}</span>
                          <CopyButton text={text} label={text} />
                        </h3>
                      );
                    },
                    li: ({ children, ...props }) => {
                      const text = String(
                        Array.isArray(children) ? children.join("") : children || ""
                      ).trim();
                      // Detecta padrão "Label: valor" para colocar copy no valor
                      const colonMatch = text.match(/^([^:]{1,30}):\s*(.+)$/s);
                      if (colonMatch && colonMatch[2].length < 200) {
                        return (
                          <li className="group flex items-start gap-2" {...props}>
                            <span className="flex-1">{children}</span>
                            <CopyButton text={colonMatch[2].trim()} label={colonMatch[1].trim()} />
                          </li>
                        );
                      }
                      return <li {...props}>{children}</li>;
                    },
                    pre: ({ children, ...props }) => {
                      const codeText =
                        // @ts-ignore - acessa o texto bruto do bloco
                        children?.props?.children?.toString?.() || "";
                      return (
                        <div className="group relative">
                          <pre {...props}>{children}</pre>
                          <div className="absolute top-2 right-2">
                            <CopyButton text={codeText} label="Bloco de código" />
                          </div>
                        </div>
                      );
                    },
                    p: ({ children, ...props }) => {
                      const text = String(
                        Array.isArray(children) ? children.join("") : children || ""
                      ).trim();
                      // Parágrafos curtos ganham botão de copiar
                      if (text.length > 0 && text.length < 250) {
                        return (
                          <p className="group flex items-start gap-2" {...props}>
                            <span className="flex-1">{children}</span>
                            <CopyButton text={text} />
                          </p>
                        );
                      }
                      return <p {...props}>{children}</p>;
                    },
                  }}
                >
                  {data.content}
                </ReactMarkdown>
                <Separator className="my-6" />
                <p className="text-[11px] text-muted-foreground italic">
                  Passe o mouse sobre títulos, parágrafos curtos e itens "Label: valor" para ver o botão de copiar.
                </p>
              </article>
            </ScrollArea>
          </div>
        )}
      </SheetContent>

      <FichaHistoryDialog
        propertyId={propertyId}
        propertyName={data?.propertyName || ""}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRestored={() => propertyId && loadFicha(propertyId)}
      />
    </Sheet>
  );
};
