import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { diffLines } from "diff";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyIds: string[];
  onApplied?: () => void;
}

interface PreviewItem {
  property_id: string;
  property_name: string;
  file_id: string;
  version: number;
  old_content: string;
  new_content: string;
  changed: boolean;
  error: string | null;
}

type Step = "instruction" | "preview" | "applying" | "done";

export const BulkAIEditDialog = ({ open, onOpenChange, propertyIds, onApplied }: Props) => {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("instruction");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applyResult, setApplyResult] = useState<{ updated: number; errors: any[] } | null>(null);

  const reset = () => {
    setStep("instruction");
    setInstruction("");
    setPreviews([]);
    setExpandedId(null);
    setExcluded(new Set());
    setApplyResult(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      reset();
      onOpenChange(false);
    }
  };

  const generatePreview = async () => {
    if (!instruction.trim()) {
      toast({ title: "Digite a instrução", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-edit-fichas", {
        body: { mode: "preview", instruction: instruction.trim(), property_ids: propertyIds },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPreviews(data.results || []);
      setStep("preview");
    } catch (e: any) {
      toast({
        title: "Erro ao gerar preview",
        description: e.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyChanges = async () => {
    const toApply = previews.filter((p) => p.changed && !p.error && !excluded.has(p.property_id));
    if (toApply.length === 0) {
      toast({ title: "Nenhuma alteração para aplicar", variant: "destructive" });
      return;
    }
    setStep("applying");
    try {
      const { data, error } = await supabase.functions.invoke("bulk-edit-fichas", {
        body: {
          mode: "apply",
          change_reason: `IA em massa: ${instruction.trim().slice(0, 200)}`,
          changes: toApply.map((p) => ({
            property_id: p.property_id,
            file_id: p.file_id,
            new_content: p.new_content,
          })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setApplyResult(data);
      setStep("done");
      onApplied?.();
    } catch (e: any) {
      toast({
        title: "Erro ao aplicar",
        description: e.message || "Tente novamente",
        variant: "destructive",
      });
      setStep("preview");
    }
  };

  const toggleExcluded = (id: string) => {
    setExcluded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const renderDiff = (oldText: string, newText: string) => {
    const parts = diffLines(oldText, newText);
    return (
      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
        {parts.map((part, i) => (
          <span
            key={i}
            className={
              part.added
                ? "block bg-green-500/15 text-green-900 dark:text-green-200"
                : part.removed
                ? "block bg-red-500/15 text-red-900 dark:text-red-200 line-through opacity-80"
                : "block text-muted-foreground"
            }
          >
            {part.value}
          </span>
        ))}
      </pre>
    );
  };

  const changedCount = previews.filter((p) => p.changed && !p.error).length;
  const errorCount = previews.filter((p) => !!p.error).length;
  const willApply = previews.filter((p) => p.changed && !p.error && !excluded.has(p.property_id)).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Editar fichas em massa com IA
          </DialogTitle>
        </DialogHeader>

        {step === "instruction" && (
          <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="font-medium">{propertyIds.length} imóveis com ficha</div>
              <div className="text-muted-foreground text-xs mt-1">
                A IA vai aplicar a instrução em cada ficha individualmente, preservando o resto do conteúdo.
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Instrução para a IA</label>
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={6}
                placeholder="Ex: Adicione uma seção 'Check-out' explicando que o hóspede deve deixar as chaves na mesa da cozinha e enviar mensagem no WhatsApp avisando da saída até as 11h."
                className="resize-none"
              />
              <div className="mt-2 text-xs text-muted-foreground">
                Seja específico. Inclua o conteúdo exato que deve aparecer — a IA não vai inventar informações do imóvel.
              </div>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex-1 overflow-hidden flex flex-col px-6 pb-4">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                <CheckCircle2 className="mr-1 h-3 w-3" /> {changedCount} com alterações
              </Badge>
              {errorCount > 0 && (
                <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100">
                  <AlertCircle className="mr-1 h-3 w-3" /> {errorCount} com erro
                </Badge>
              )}
              {previews.length - changedCount - errorCount > 0 && (
                <Badge variant="outline">
                  {previews.length - changedCount - errorCount} sem mudança
                </Badge>
              )}
              <div className="ml-auto text-sm text-muted-foreground">
                Vai aplicar em <strong className="text-foreground">{willApply}</strong> ficha(s)
              </div>
            </div>

            <ScrollArea className="flex-1 pr-3 -mr-3">
              <div className="space-y-2">
                {previews.map((p) => {
                  const isExpanded = expandedId === p.property_id;
                  const isExcluded = excluded.has(p.property_id);
                  return (
                    <Card
                      key={p.property_id}
                      className={isExcluded ? "opacity-50" : ""}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{p.property_name}</span>
                              {p.error ? (
                                <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100">
                                  <AlertCircle className="mr-1 h-3 w-3" /> Erro
                                </Badge>
                              ) : p.changed ? (
                                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                                  Alterada
                                </Badge>
                              ) : (
                                <Badge variant="outline">Sem mudança</Badge>
                              )}
                            </div>
                            {p.error && (
                              <div className="text-xs text-red-600 mt-1">{p.error}</div>
                            )}
                          </div>
                          {p.changed && !p.error && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleExcluded(p.property_id)}
                              >
                                {isExcluded ? "Incluir" : "Excluir"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedId(isExpanded ? null : p.property_id)}
                              >
                                {isExpanded ? "Ocultar diff" : "Ver diff"}
                              </Button>
                            </>
                          )}
                        </div>
                        {isExpanded && p.changed && !p.error && (
                          <div className="mt-3 max-h-72 overflow-y-auto rounded-md border bg-background p-2">
                            {renderDiff(p.old_content, p.new_content)}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {step === "applying" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <div className="text-sm text-muted-foreground">Aplicando alterações...</div>
            </div>
          </div>
        )}

        {step === "done" && applyResult && (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center max-w-md">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <div className="text-lg font-semibold mb-1">
                {applyResult.updated} ficha(s) atualizada(s)
              </div>
              <div className="text-sm text-muted-foreground">
                Cada alteração ficou registrada no histórico de versões e pode ser revertida.
              </div>
              {applyResult.errors.length > 0 && (
                <div className="mt-4 text-sm text-red-600">
                  {applyResult.errors.length} erro(s) ao salvar.
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="px-6 py-4 border-t">
          {step === "instruction" && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={generatePreview} disabled={loading || !instruction.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando preview...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Gerar preview
                  </>
                )}
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("instruction")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={applyChanges} disabled={willApply === 0}>
                Aplicar em {willApply} ficha(s)
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => handleClose(false)} className="ml-auto">
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
