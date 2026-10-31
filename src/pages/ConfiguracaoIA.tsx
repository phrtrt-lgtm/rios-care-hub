import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Save, History, TestTube } from "lucide-react";
import { ConfigAgenteIA } from "@/components/ia/ConfigAgenteIA";
import { EFFORTS_IA, MODELOS_IA } from "@/lib/iaMeta";
import { descreverErroDaFunction } from "@/lib/erroFunction";

export default function ConfiguracaoIA() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // AI Settings
  const [settings, setSettings] = useState<any>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [styleGuide, setStyleGuide] = useState("");
  const [guardrails, setGuardrails] = useState("");
  const [model, setModel] = useState("claude-sonnet-5-5");
  const [effort, setEffort] = useState("medium");
  const [maxTokens, setMaxTokens] = useState(800);

  // Templates
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  // Versions
  const [versions, setVersions] = useState<any[]>([]);

  // Test
  const [testContext, setTestContext] = useState("");
  const [testResult, setTestResult] = useState("");

  useEffect(() => {
    if (profile?.role !== "admin") {
      navigate("/");
      return;
    }
    loadData();
  }, [profile, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load settings
      const { data: settingsData, error: settingsError } = await supabase
        .from("ai_settings")
        .select("*")
        .single();

      if (settingsError) throw settingsError;

      if (settingsData) {
        setSettings(settingsData);
        setSystemPrompt(settingsData.system_prompt || "");
        setStyleGuide(settingsData.style_guide || "");
        setGuardrails(settingsData.guardrails || "");
        setModel(settingsData.model || "claude-sonnet-5-5");
        setEffort(settingsData.effort || "medium");
        setMaxTokens(settingsData.max_tokens || 800);
      }

      // Load templates
      const { data: templatesData, error: templatesError } = await supabase
        .from("ai_templates")
        .select("*")
        .order("order_index");

      if (templatesError) throw templatesError;
      setTemplates(templatesData || []);

      // Load versions
      const { data: versionsData, error: versionsError } = await supabase
        .from("ai_prompt_versions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (versionsError) throw versionsError;
      setVersions(versionsData || []);

    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (createVersion = false) => {
    try {
      setSaving(true);

      const updates = {
        system_prompt: systemPrompt,
        style_guide: styleGuide,
        guardrails: guardrails,
        model,
        effort,
        max_tokens: maxTokens,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("ai_settings")
        .update(updates)
        .eq("id", settings.id);

      if (error) throw error;

      if (createVersion) {
        const { data: { user } } = await supabase.auth.getUser();
        
        const changelog = prompt("Descreva as mudanças desta versão:");
        if (!changelog) return;

        const { error: versionError } = await supabase
          .from("ai_prompt_versions")
          .insert({
            ai_settings_id: settings.id,
            system_prompt: systemPrompt,
            style_guide: styleGuide,
            guardrails: guardrails,
            model,
            effort,
            max_tokens: maxTokens,
            changelog,
            created_by: user?.id,
          });

        if (versionError) throw versionError;
      }

      toast.success(createVersion ? "Nova versão salva!" : "Configurações salvas!");
      loadData();
    } catch (error: any) {
      console.error("Error saving:", error);
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = async (version: any) => {
    if (!confirm("Restaurar esta versão? As configurações atuais serão substituídas.")) return;

    setSystemPrompt(version.system_prompt);
    setStyleGuide(version.style_guide || "");
    setGuardrails(version.guardrails || "");
    setModel(version.model);
    setEffort(version.effort || "medium");
    setMaxTokens(version.max_tokens);

    toast.success("Versão restaurada. Clique em Salvar para aplicar.");
  };

  const testPrompt = async () => {
    try {
      setTesting(true);
      setTestResult("");

      // O teste passa pela function (a chave fica no servidor): antes chamava o
      // gateway direto do navegador com uma variável que não existe no .env.
      const { data, error } = await supabase.functions.invoke("ai-generate-response", {
        body: {
          action: "test_prompt",
          context: { systemPrompt, styleGuide, guardrails, userPrompt: testContext, model, effort, maxTokens },
        },
      });
      if (error) throw error;
      setTestResult(data?.text || "Sem resposta");
    } catch (error: unknown) {
      console.error("Test error:", error);
      toast.error(await descreverErroDaFunction(error, "Erro ao testar o prompt."));
    } finally {
      setTesting(false);
    }
  };

  const saveTemplate = async (template: any) => {
    try {
      const { error } = await supabase
        .from("ai_templates")
        .update({
          label: template.label,
          template_prompt: template.template_prompt,
          enabled: template.enabled,
          order_index: template.order_index,
          updated_at: new Date().toISOString(),
        })
        .eq("id", template.id);

      if (error) throw error;

      toast.success("Template salvo!");
      loadData();
      setSelectedTemplate(null);
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast.error("Erro ao salvar template");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => goBack(navigate, "/painel")}
              className="mb-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Painel
            </Button>
            <h1 className="text-3xl font-bold">Configuração da IA</h1>
            <p className="text-muted-foreground">
              Configure o comportamento da IA Assistente RIOS
            </p>
          </div>
        </div>

        <Tabs defaultValue="prompt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="prompt">Prompt Geral</TabsTrigger>
            <TabsTrigger value="templates">Templates & Atalhos</TabsTrigger>
            <TabsTrigger value="versions">Versões</TabsTrigger>
            <TabsTrigger value="agente">Agente</TabsTrigger>
          </TabsList>

          <TabsContent value="agente" className="space-y-6">
            <ConfigAgenteIA />
          </TabsContent>

          <TabsContent value="prompt" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Prompt</CardTitle>
                <CardDescription>
                  Prompt principal que define o comportamento da IA
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="systemPrompt">Prompt do Sistema</Label>
                  <Textarea
                    id="systemPrompt"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={8}
                    className="font-mono text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="styleGuide">Guia de Estilo (opcional)</Label>
                  <Textarea
                    id="styleGuide"
                    value={styleGuide}
                    onChange={(e) => setStyleGuide(e.target.value)}
                    rows={4}
                    className="font-mono text-sm"
                    placeholder="Tom de voz, estrutura de resposta, etc."
                  />
                </div>

                <div>
                  <Label htmlFor="guardrails">Regras de Segurança (opcional)</Label>
                  <Textarea
                    id="guardrails"
                    value={guardrails}
                    onChange={(e) => setGuardrails(e.target.value)}
                    rows={4}
                    className="font-mono text-sm"
                    placeholder="Restrições e comportamentos proibidos"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="model">Modelo</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODELOS_IA.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="effort">Effort (quanto pensa)</Label>
                    <Select value={effort} onValueChange={setEffort}>
                      <SelectTrigger id="effort">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EFFORTS_IA.map((e) => (
                          <SelectItem key={e.value} value={e.value}>
                            {e.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="maxTokens">Max Tokens</Label>
                    <Input
                      id="maxTokens"
                      type="number"
                      step="100"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={() => saveSettings(false)} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar
                  </Button>
                  <Button onClick={() => saveSettings(true)} variant="outline" disabled={saving}>
                    <History className="mr-2 h-4 w-4" />
                    Salvar Nova Versão
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <TestTube className="mr-2 h-4 w-4" />
                        Testar Prompt
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Testar Prompt</DialogTitle>
                        <DialogDescription>
                          Digite um contexto de teste para ver como a IA responde
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Contexto de teste</Label>
                          <Textarea
                            value={testContext}
                            onChange={(e) => setTestContext(e.target.value)}
                            rows={4}
                            placeholder="Ex: Proprietário perguntando sobre bloqueio de data..."
                          />
                        </div>
                        <Button onClick={testPrompt} disabled={testing || !testContext}>
                          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Gerar Resposta
                        </Button>
                        {testResult && (
                          <div>
                            <Label>Resposta gerada</Label>
                            <div className="rounded-md border bg-muted p-4 text-sm">
                              {testResult}
                            </div>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Templates de Resposta</CardTitle>
                <CardDescription>
                  Atalhos rápidos para gerar respostas contextualizadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Ordem</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell>{template.label}</TableCell>
                        <TableCell className="font-mono text-sm">{template.key}</TableCell>
                        <TableCell>{template.order_index}</TableCell>
                        <TableCell>
                          {template.enabled ? (
                            <span className="text-success">Ativo</span>
                          ) : (
                            <span className="text-muted-foreground">Inativo</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedTemplate(template)}
                          >
                            Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {selectedTemplate && (
              <Card>
                <CardHeader>
                  <CardTitle>Editar Template: {selectedTemplate.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Label</Label>
                    <Input
                      value={selectedTemplate.label}
                      onChange={(e) =>
                        setSelectedTemplate({ ...selectedTemplate, label: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Prompt do Template</Label>
                    <Textarea
                      value={selectedTemplate.template_prompt}
                      onChange={(e) =>
                        setSelectedTemplate({
                          ...selectedTemplate,
                          template_prompt: e.target.value,
                        })
                      }
                      rows={8}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <Label>Ordem</Label>
                      <Input
                        type="number"
                        value={selectedTemplate.order_index}
                        onChange={(e) =>
                          setSelectedTemplate({
                            ...selectedTemplate,
                            order_index: parseInt(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-8">
                      <input
                        type="checkbox"
                        id="enabled"
                        checked={selectedTemplate.enabled}
                        onChange={(e) =>
                          setSelectedTemplate({
                            ...selectedTemplate,
                            enabled: e.target.checked,
                          })
                        }
                        className="h-4 w-4"
                      />
                      <Label htmlFor="enabled">Habilitado</Label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => saveTemplate(selectedTemplate)}>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Template
                    </Button>
                    <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="versions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Versões</CardTitle>
                <CardDescription>
                  Últimas 10 versões salvas do prompt
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="rounded-lg border p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{version.changelog}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Intl.DateTimeFormat("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            }).format(new Date(version.created_at))}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreVersion(version)}
                        >
                          Restaurar
                        </Button>
                      </div>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground">
                          Ver detalhes
                        </summary>
                        <div className="mt-2 space-y-2 rounded-md bg-muted p-3">
                          <p><strong>Modelo:</strong> {version.model}</p>
                          <p><strong>Effort:</strong> {version.effort ?? "—"}</p>
                          <p><strong>Max Tokens:</strong> {version.max_tokens}</p>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
