import { useEffect, useMemo, useState } from "react";
import { diffLines, Change } from "diff";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, History, RotateCcw, Clock, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  propertyId: string | null;
  propertyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored?: () => void;
}

interface VersionRow {
  id: string;
  version: number;
  content_md: string;
  created_at: string;
  edited_by: string | null;
  editor_name?: string;
}

interface CurrentFile {
  id: string;
  version: number;
  content_md: string;
  updated_at: string;
}

export const FichaHistoryDialog = ({
  propertyId,
  propertyName,
  open,
  onOpenChange,
  onRestored,
}: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<CurrentFile | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open || !propertyId) return;
    void load(propertyId);
  }, [open, propertyId]);

  const load = async (id: string) => {
    setLoading(true);
    setCurrent(null);
    setVersions([]);
    setSelectedId(null);
    try {
      const { data: file } = await supabase
        .from("property_files")
        .select("id, version, content_md, updated_at")
        .eq("property_id", id)
        .maybeSingle();

      if (file) {
        setCurrent(file as CurrentFile);
      }

      const { data: vData } = await supabase
        .from("property_file_versions")
        .select("id, version, content_md, created_at, edited_by")
        .eq("property_id", id)
        .order("version", { ascending: false });

      const editorIds = Array.from(
        new Set((vData || []).map((v) => v.edited_by).filter(Boolean) as string[])
      );
      let nameMap: Record<string, string> = {};
      if (editorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", editorIds);
        nameMap = Object.fromEntries((profs || []).map((p) => [p.id, p.name]));
      }
      const enriched = (vData || []).map((v) => ({
        ...v,
        editor_name: v.edited_by ? nameMap[v.edited_by] || "—" : "—",
      })) as VersionRow[];
      setVersions(enriched);
      if (enriched.length > 0) setSelectedId(enriched[0].id);
    } catch (err: any) {
      toast({
        title: "Erro ao carregar histórico",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const selected = useMemo(
    () => versions.find((v) => v.id === selectedId) || null,
    [versions, selectedId]
  );

  const diff: Change[] = useMemo(() => {
    if (!selected || !current) return [];
    return diffLines(selected.content_md || "", current.content_md || "");
  }, [selected, current]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    diff.forEach((p) => {
      const lines = p.value.split("\n").filter((l) => l.length > 0).length;
      if (p.added) added += lines;
      if (p.removed) removed += lines;
    });
    return { added, removed };
  }, [diff]);

  const handleRestore = async () => {
    if (!selected || !current || !propertyId) return;
    setRestoring(true);
    try {
      const { error } = await supabase
        .from("property_files")
        .update({
          content_md: selected.content_md,
          updated_by: user?.id || null,
        })
        .eq("id", current.id);
      if (error) throw error;

      toast({
        title: "Versão restaurada!",
        description: `O conteúdo da versão v${selected.version} foi aplicado. A versão anterior foi salva no histórico.`,
      });
      setConfirmRestore(false);
      onOpenChange(false);
      onRestored?.();
    } catch (err: any) {
      toast({
        title: "Erro ao restaurar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              Histórico de versões — {propertyName}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Compare versões anteriores com a atual e restaure se necessário.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !current || versions.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <History className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Ainda não há versões anteriores. O histórico começa a ser salvo a partir da segunda edição.
              </p>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0">
              {/* Lista de versões */}
              <aside className="w-64 shrink-0 border-r bg-muted/20 flex flex-col">
                <div className="px-3 py-2 border-b bg-background">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Versões anteriores ({versions.length})
                  </p>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    {versions.map((v) => {
                      const isSelected = v.id === selectedId;
                      return (
                        <button
                          key={v.id}
                          onClick={() => setSelectedId(v.id)}
                          className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                            isSelected
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-accent border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono text-[10px] h-4 px-1.5">
                              v{v.version}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(v.created_at), {
                                locale: ptBR,
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <UserIcon className="h-2.5 w-2.5" />
                            <span className="truncate">{v.editor_name}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 mt-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {format(new Date(v.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </aside>

              {/* Diff */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="px-4 py-2 border-b bg-background flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-xs min-w-0">
                    {selected && (
                      <>
                        <Badge variant="outline" className="font-mono">v{selected.version}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge variant="outline" className="font-mono bg-primary/10">
                          v{current.version} (atual)
                        </Badge>
                        <span className="text-success font-mono">+{stats.added}</span>
                        <span className="text-destructive font-mono">−{stats.removed}</span>
                      </>
                    )}
                  </div>
                  {selected && selected.content_md !== current.content_md && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmRestore(true)}
                      className="shrink-0"
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Restaurar v{selected.version}
                    </Button>
                  )}
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-4 font-mono text-xs leading-relaxed">
                    {selected && selected.content_md === current.content_md ? (
                      <div className="text-center text-muted-foreground py-8">
                        Esta versão é idêntica à atual.
                      </div>
                    ) : (
                      diff.map((part, i) => {
                        const bg = part.added
                          ? "bg-success/10 border-l-2 border-success"
                          : part.removed
                          ? "bg-destructive/10 border-l-2 border-destructive line-through opacity-80"
                          : "border-l-2 border-transparent";
                        const prefix = part.added ? "+ " : part.removed ? "− " : "  ";
                        return (
                          <div key={i} className={`whitespace-pre-wrap break-words px-2 py-0.5 ${bg}`}>
                            {part.value
                              .split("\n")
                              .filter((line, idx, arr) => !(idx === arr.length - 1 && line === ""))
                              .map((line, idx) => (
                                <div key={idx}>
                                  <span className="text-muted-foreground/60 select-none mr-1">{prefix}</span>
                                  {line || "\u00A0"}
                                </div>
                              ))}
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar versão v{selected?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              O conteúdo desta versão substituirá a ficha atual. A versão atual (v{current?.version}) será salva
              automaticamente no histórico — então você sempre poderá voltar atrás.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={restoring}>
              {restoring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Restaurando...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
