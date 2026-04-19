import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  properties: { id: string; name: string }[];
  onCompleted?: () => void;
}

interface FileMatch {
  fileName: string;
  content: string;
  matchedPropertyId: string | null;
  matchedPropertyName: string | null;
  status: "matched" | "ambiguous" | "unmatched";
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const stripExt = (name: string) => name.replace(/\.md$/i, "");

export const BulkUploadFichasDialog = ({ open, onOpenChange, properties, onCompleted }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [matches, setMatches] = useState<FileMatch[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".md"));
    if (arr.length === 0) {
      toast({ title: "Nenhum arquivo .md", description: "Envie arquivos com extensão .md", variant: "destructive" });
      return;
    }

    const results: FileMatch[] = await Promise.all(
      arr.map(async (file) => {
        const content = await file.text();
        const fileBase = normalize(stripExt(file.name));

        // Match: ranking by similarity (exact normalized > contains)
        const candidates = properties
          .map((p) => {
            const propNorm = normalize(p.name);
            let score = 0;
            if (propNorm === fileBase) score = 100;
            else if (fileBase.includes(propNorm) || propNorm.includes(fileBase)) score = 50;
            return { p, score };
          })
          .filter((c) => c.score > 0)
          .sort((a, b) => b.score - a.score);

        if (candidates.length === 0) {
          return {
            fileName: file.name,
            content,
            matchedPropertyId: null,
            matchedPropertyName: null,
            status: "unmatched" as const,
          };
        }
        if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
          return {
            fileName: file.name,
            content,
            matchedPropertyId: candidates[0].p.id,
            matchedPropertyName: candidates[0].p.name,
            status: "ambiguous" as const,
          };
        }
        return {
          fileName: file.name,
          content,
          matchedPropertyId: candidates[0].p.id,
          matchedPropertyName: candidates[0].p.name,
          status: "matched" as const,
        };
      })
    );

    setMatches(results);
  };

  const updateMatch = (index: number, propertyId: string) => {
    setMatches((prev) =>
      prev.map((m, i) =>
        i === index
          ? {
              ...m,
              matchedPropertyId: propertyId,
              matchedPropertyName: properties.find((p) => p.id === propertyId)?.name || null,
              status: "matched",
            }
          : m
      )
    );
  };

  const removeMatch = (index: number) => {
    setMatches((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (!user) return;
    const toApply = matches.filter((m) => m.matchedPropertyId);
    if (toApply.length === 0) {
      toast({ title: "Nada para enviar", description: "Selecione um imóvel para cada ficha.", variant: "destructive" });
      return;
    }

    try {
      setUploading(true);
      let success = 0;
      let failed = 0;

      for (const m of toApply) {
        // Upsert ficha
        const { data: existing } = await supabase
          .from("property_files")
          .select("id")
          .eq("property_id", m.matchedPropertyId!)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("property_files")
            .update({ content_md: m.content, updated_by: user.id })
            .eq("id", existing.id);
          if (error) failed++;
          else success++;
        } else {
          const { error } = await supabase.from("property_files").insert({
            property_id: m.matchedPropertyId!,
            content_md: m.content,
            updated_by: user.id,
          });
          if (error) failed++;
          else success++;
        }
      }

      toast({
        title: "Upload concluído",
        description: `${success} ficha(s) salvas${failed > 0 ? `, ${failed} com erro` : ""}.`,
        variant: failed > 0 ? "destructive" : "default",
      });
      setMatches([]);
      onCompleted?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const matchedCount = matches.filter((m) => m.matchedPropertyId).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setMatches([]); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Upload em massa de fichas</DialogTitle>
          <DialogDescription>
            Selecione vários arquivos .md de uma vez. O sistema tenta casar o nome do arquivo com o imóvel automaticamente.
          </DialogDescription>
        </DialogHeader>

        {matches.length === 0 ? (
          <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-12 cursor-pointer hover:bg-accent/30 transition-colors">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <div className="font-medium">Clique para selecionar arquivos .md</div>
              <div className="text-xs text-muted-foreground">Você pode selecionar vários de uma vez</div>
            </div>
            <input
              type="file"
              accept=".md,text/markdown"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        ) : (
          <ScrollArea className="flex-1 min-h-0 max-h-[60vh] pr-2">
            <div className="space-y-2">
              {matches.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-sm">{m.fileName}</span>
                      {m.status === "matched" && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> casado
                        </Badge>
                      )}
                      {m.status === "ambiguous" && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                          <AlertCircle className="mr-1 h-3 w-3" /> revisar
                        </Badge>
                      )}
                      {m.status === "unmatched" && (
                        <Badge variant="destructive">
                          <AlertCircle className="mr-1 h-3 w-3" /> sem match
                        </Badge>
                      )}
                    </div>
                    <Select
                      value={m.matchedPropertyId || ""}
                      onValueChange={(v) => updateMatch(i, v)}
                    >
                      <SelectTrigger className="mt-1 h-8 text-xs">
                        <SelectValue placeholder="Selecione o imóvel..." />
                      </SelectTrigger>
                      <SelectContent>
                        {properties.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {(m.content.length / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeMatch(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {matches.length > 0 && `${matchedCount} de ${matches.length} pronta(s) para envio`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
              Cancelar
            </Button>
            {matches.length > 0 && (
              <Button onClick={handleConfirm} disabled={matchedCount === 0 || uploading}>
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Salvar {matchedCount} ficha(s)
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
