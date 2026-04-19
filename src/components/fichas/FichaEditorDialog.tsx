import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, History, Eye, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface VersionRow {
  id: string;
  version: number;
  content_md: string;
  created_at: string;
  edited_by: string | null;
  editor_name?: string;
}

export const FichaEditorDialog = ({ propertyId, open, onOpenChange, onSaved }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [propertyName, setPropertyName] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<VersionRow[]>([]);

  useEffect(() => {
    if (!open) return;
    loadFicha();
  }, [open, propertyId]);

  const loadFicha = async () => {
    try {
      setLoading(true);
      const { data: prop } = await supabase
        .from("properties")
        .select("name")
        .eq("id", propertyId)
        .maybeSingle();
      setPropertyName(prop?.name || "");

      const { data: file } = await supabase
        .from("property_files")
        .select("id, content_md, version")
        .eq("property_id", propertyId)
        .maybeSingle();

      if (file) {
        setFileId(file.id);
        setContent(file.content_md || "");
        setOriginalContent(file.content_md || "");
        setVersion(file.version);
        await loadVersions(file.id);
      } else {
        setFileId(null);
        setContent("");
        setOriginalContent("");
        setVersion(1);
        setVersions([]);
      }
    } catch (error: any) {
      toast({ title: "Erro ao carregar ficha", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (fid: string) => {
    const { data } = await supabase
      .from("property_file_versions")
      .select("id, version, content_md, created_at, edited_by")
      .eq("property_file_id", fid)
      .order("version", { ascending: false })
      .limit(20);

    const editorIds = Array.from(new Set((data || []).map((v) => v.edited_by).filter(Boolean))) as string[];
    const { data: editors } = editorIds.length
      ? await supabase.from("profiles").select("id, name").in("id", editorIds)
      : { data: [] as { id: string; name: string }[] };

    setVersions(
      (data || []).map((v) => ({
        ...v,
        editor_name: editors?.find((e) => e.id === v.edited_by)?.name,
      }))
    );
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      setSaving(true);
      if (fileId) {
        const { error } = await supabase
          .from("property_files")
          .update({ content_md: content, updated_by: user.id })
          .eq("id", fileId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("property_files").insert({
          property_id: propertyId,
          content_md: content,
          updated_by: user.id,
        });
        if (error) throw error;
      }
      toast({ title: "Ficha salva!", description: "A ficha foi atualizada com sucesso." });
      setOriginalContent(content);
      onSaved?.();
      await loadFicha();
    } catch (error: any) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = (v: VersionRow) => {
    if (!confirm(`Restaurar a versão ${v.version}? O conteúdo atual será substituído (você ainda poderá revisar antes de salvar).`)) {
      return;
    }
    setContent(v.content_md);
    toast({ title: `Versão ${v.version} carregada`, description: "Clique em Salvar para confirmar a restauração." });
  };

  const isDirty = content !== originalContent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            Ficha — {propertyName}
            {fileId && <Badge variant="outline">v{version}</Badge>}
            {isDirty && <Badge variant="destructive">não salvo</Badge>}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="edit" className="flex flex-1 flex-col overflow-hidden px-6">
            <TabsList className="w-fit">
              <TabsTrigger value="edit">
                <Pencil className="mr-2 h-3 w-3" /> Editar
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="mr-2 h-3 w-3" /> Preview
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="mr-2 h-3 w-3" /> Histórico ({versions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="flex-1 overflow-hidden mt-3">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="# Nome do imóvel&#10;&#10;## Acesso&#10;- Wifi: ...&#10;- Chave: ...&#10;&#10;## Comodidades&#10;..."
                className="h-full min-h-[400px] resize-none font-mono text-sm"
              />
            </TabsContent>

            <TabsContent value="preview" className="flex-1 overflow-hidden mt-3">
              <ScrollArea className="h-full rounded-md border p-4">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {content.trim() ? <ReactMarkdown>{content}</ReactMarkdown> : (
                    <p className="text-muted-foreground italic">Sem conteúdo para visualizar.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="history" className="flex-1 overflow-hidden mt-3">
              <ScrollArea className="h-full">
                <div className="space-y-2">
                  {versions.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">Nenhuma versão anterior ainda.</p>
                  )}
                  {versions.map((v) => (
                    <div key={v.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Versão {v.version}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(v.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            {v.editor_name ? ` • ${v.editor_name}` : ""}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleRestore(v)}>
                          Restaurar
                        </Button>
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Ver conteúdo
                        </summary>
                        <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
                          {v.content_md.slice(0, 2000)}
                          {v.content_md.length > 2000 ? "\n..." : ""}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Fechar
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar ficha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
