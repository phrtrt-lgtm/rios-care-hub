import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Search, Pencil, Archive, Star, Check, X, Eye } from "lucide-react";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ContractTemplatePreview } from "@/components/contracts/ContractTemplatePreview";
import { useToast } from "@/hooks/use-toast";

interface Template {
  id: string;
  name: string;
  version: number;
  content_md: string;
  variables_schema: Record<string, any>;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

const PLACEHOLDER_DATA = {
  owner: {
    name: "João da Silva",
    doc_label: "CPF",
    doc: "123.456.789-00",
    address: "Rua das Palmeiras, 100 - Centro, Cabo Frio/RJ",
    email: "joao@exemplo.com",
    phone: "(22) 99999-9999",
  },
  rios: {
    name: "RIOS GESTÃO DE IMÓVEIS POR TEMPORADA",
    cnpj: "00.000.000/0001-00",
    address: "Cabo Frio, RJ",
    email: "contato@rioshospedagens.com.br",
    phone: "(22) 99999-0000",
  },
  property: {
    address: "Av. das Ondas, 500 - Praia do Forte",
    unit: "Apto 302 - Bloco B",
    condominium: "Residencial Oceano",
    city_uf: "Cabo Frio/RJ",
    max_guests: "6",
    parking_spots: "2",
  },
  contract: {
    commission_percent: 22,
    term_months: 24,
    start_date: "2026-01-01",
    maintenance_limit_cents: 300000,
    specific_terms: "Condição comercial específica acordada entre as partes.",
  },
};

export default function AdminContratoTemplates() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [variablesSchema, setVariablesSchema] = useState("{}");
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("contract_templates")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar modelos", description: error.message, variant: "destructive" });
    }
    setTemplates(data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filtered = templates.filter((t) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return t.name.toLowerCase().includes(s);
  });

  const openNew = () => {
    setEditing(null);
    setName("");
    setContentMd("");
    setVariablesSchema("{}");
    setDialogOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setName(t.name);
    setContentMd(t.content_md);
    setVariablesSchema(JSON.stringify(t.variables_schema ?? {}, null, 2));
    setDialogOpen(true);
  };

  const openPreview = (t: Template) => {
    setPreviewTemplate(t);
    setPreviewOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !contentMd.trim()) {
      toast({ title: "Preencha nome e conteúdo", variant: "destructive" });
      return;
    }
    let schemaObj: Record<string, any>;
    try {
      schemaObj = JSON.parse(variablesSchema);
    } catch {
      toast({ title: "Schema JSON inválido", variant: "destructive" });
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await (supabase as any)
        .from("contract_templates")
        .update({ name: name.trim(), content_md: contentMd.trim(), variables_schema: schemaObj })
        .eq("id", editing.id);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Modelo atualizado" });
        setDialogOpen(false);
        fetchTemplates();
      }
    } else {
      const { error } = await (supabase as any)
        .from("contract_templates")
        .insert({ name: name.trim(), content_md: contentMd.trim(), variables_schema: schemaObj, version: 1 });
      if (error) {
        toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Modelo criado" });
        setDialogOpen(false);
        fetchTemplates();
      }
    }
    setSaving(false);
  };

  const setDefault = async (id: string) => {
    const { error } = await (supabase as any).rpc("set_contract_template_default", { p_template_id: id });
    if (error) {
      // fallback: manual update
      await (supabase as any).from("contract_templates").update({ is_default: false }).neq("id", id).eq("is_default", true);
      const { error: e2 } = await (supabase as any).from("contract_templates").update({ is_default: true }).eq("id", id);
      if (e2) {
        toast({ title: "Erro", description: e2.message, variant: "destructive" });
        return;
      }
    }
    toast({ title: "Modelo padrão atualizado" });
    fetchTemplates();
  };

  const archiveTemplate = async (id: string) => {
    const { error } = await (supabase as any)
      .from("contract_templates")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao arquivar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Modelo arquivado" });
      fetchTemplates();
    }
  };

  const restoreTemplate = async (id: string) => {
    const { error } = await (supabase as any)
      .from("contract_templates")
      .update({ archived_at: null })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao restaurar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Modelo restaurado" });
      fetchTemplates();
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-8">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Modelos de Contrato
            </h1>
            <p className="text-sm text-muted-foreground">
              Edite o conteúdo markdown dos modelos usados na geração de contratos.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/contratos")}>
              <X className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Novo modelo
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar modelo..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {loading ? (
          <SectionSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="Nenhum modelo"
            description="Crie o primeiro modelo de contrato para começar."
            action={<Button onClick={openNew}>Novo modelo</Button>}
          />
        ) : (
          <div className="grid gap-3">
            {filtered.map((t) => (
              <Card key={t.id} className={t.archived_at ? "opacity-60" : ""}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{t.name}</p>
                      {t.is_default && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <Star className="h-3 w-3" /> Padrão
                        </span>
                      )}
                      {t.archived_at && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Arquivado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      v{t.version} · {t.content_md.length.toLocaleString()} caracteres ·{" "}
                      {new Date(t.updated_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!t.is_default && !t.archived_at && (
                      <Button variant="ghost" size="icon" title="Definir como padrão" onClick={() => setDefault(t.id)}>
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!t.archived_at ? (
                      <Button variant="ghost" size="icon" title="Arquivar" onClick={() => archiveTemplate(t.id)}>
                        <Archive className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" title="Restaurar" onClick={() => restoreTemplate(t.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              {editing ? "Editar modelo" : "Novo modelo"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="edit" className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-fit">
              <TabsTrigger value="edit">Edição</TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="h-3.5 w-3.5 mr-1" /> Pré-visualização
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="flex-1 min-h-0 overflow-auto space-y-4 mt-2">
              <div className="space-y-2">
                <Label htmlFor="tpl-name">Nome do modelo</Label>
                <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Contrato RIOS v2" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tpl-content">Conteúdo Markdown</Label>
                <Textarea
                  id="tpl-content"
                  value={contentMd}
                  onChange={(e) => setContentMd(e.target.value)}
                  placeholder="# Título do contrato\n\n{{owner.name}}..."
                  className="min-h-[300px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Use variáveis no formato {"{{owner.name}}"}, {"{{contract.commission_percent}}"}%, etc.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tpl-schema">Schema de variáveis (JSON)</Label>
                <Textarea
                  id="tpl-schema"
                  value={variablesSchema}
                  onChange={(e) => setVariablesSchema(e.target.value)}
                  placeholder='{"owner":["name","doc"],"contract":["commission_percent"]}'
                  className="min-h-[120px] font-mono text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="preview" className="flex-1 min-h-0 overflow-auto mt-2">
              <ContractTemplatePreview templateMd={contentMd} contract={PLACEHOLDER_DATA.contract} owner={PLACEHOLDER_DATA.owner} property={PLACEHOLDER_DATA.property} />
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar modelo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
