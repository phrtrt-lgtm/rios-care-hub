import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Sparkles,
  Upload,
  Send,
  Save,
  Trash2,
  Plus,
  Loader2,
  ArrowLeft,
  Eye,
  Mail,
  X,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PlanoPerformanceSection } from "@/components/bemvindo/PlanoPerformanceSection";

type Item = {
  name: string;
  why: string;
  price: string;
  img?: string;
  link?: string;
  priority?: "essencial" | "recomendado" | "";
  optional?: boolean;
  alternativeGroup?: string;
  quantity?: number | null;
  unit?: string | null;
  dimensions?: string | null;
};
type Category = {
  key: string;
  title: string;
  emoji: string;
  desc: string;
  items: Item[];
};
type Observation = { icon: string; tag: string; title: string; body: string };
type ChatMsg = { role: "user" | "assistant"; content: string };

function compactSpreadsheetText(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 350)
    .join("\n");
}

async function invokeCurationAI(body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/curadoria-ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        typeof payload?.error === "string"
          ? payload.error
          : controller.signal.aborted
            ? "A geração demorou além do esperado. Tente novamente com uma planilha menor."
            : "Falha ao gerar curadoria";
      throw new Error(message);
    }

    return payload;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("A geração demorou além do esperado. Tente novamente com uma planilha menor.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export default function AdminCuradoriaNova() {
  const navigate = useNavigate();
  const [owners, setOwners] = useState<{ id: string; name: string; email: string; status: string }[]>([]);
  const [ownerId, setOwnerId] = useState<string>("");
  const [spreadsheetText, setSpreadsheetText] = useState("");
  const [filename, setFilename] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("phrtrt@gmail.com");
  const [sendingTest, setSendingTest] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const publicUrl = publishedId
    ? `${window.location.origin}/curadoria/p/${publishedId}`
    : null;

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, name, email, status, role")
      .in("role", ["owner", "pending_owner"])
      .order("name")
      .then(({ data }) => setOwners((data as any) || []));
  }, []);

  const totalItems = useMemo(
    () => categories.reduce((a, c) => a + c.items.length, 0),
    [categories],
  );

  async function handleFile(file: File) {
    setFilename(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const allText = wb.SheetNames.map((sn) => {
        const sheet = wb.Sheets[sn];
        return `# ${sn}\n${XLSX.utils.sheet_to_csv(sheet)}`;
      }).join("\n\n");
      setSpreadsheetText(allText);
    } else {
      const txt = await file.text();
      setSpreadsheetText(txt);
    }
    toast.success("Planilha carregada — clique em 'Gerar com IA'");
  }

  async function generate() {
    if (!spreadsheetText.trim()) {
      toast.error("Anexe ou cole uma planilha primeiro");
      return;
    }
    setLoading(true);
    try {
      const compactedSpreadsheet = compactSpreadsheetText(spreadsheetText);
      const data = await invokeCurationAI({ mode: "from_spreadsheet", spreadsheet_text: compactedSpreadsheet });
      setCategories(data.categories || []);
      setObservations(data.observations || []);
      setHistory([{ role: "assistant", content: data.ai_message || "Curadoria gerada." }]);
      toast.success("Curadoria gerada");
    } catch (e: any) {
      toast.error(e.message || "Falha ao gerar");
    } finally {
      setLoading(false);
    }
  }

  async function refine() {
    if (!chatInput.trim() || !categories.length) return;
    const cmd = chatInput;
    setChatInput("");
    setHistory((h) => [...h, { role: "user", content: cmd }]);
    setLoading(true);
    try {
      const data = await invokeCurationAI({
        mode: "refine",
        current: { categories, observations },
        instruction: cmd,
        history,
      });
      setCategories(data.categories || []);
      setObservations(data.observations || []);
      setHistory((h) => [...h, { role: "assistant", content: data.ai_message || "Atualizado." }]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  function updateItem(ci: number, ii: number, patch: Partial<Item>) {
    setCategories((cs) => {
      const next = [...cs];
      next[ci] = { ...next[ci], items: next[ci].items.map((it, i) => (i === ii ? { ...it, ...patch } : it)) };
      return next;
    });
  }
  function removeItem(ci: number, ii: number) {
    setCategories((cs) => {
      const next = [...cs];
      next[ci] = { ...next[ci], items: next[ci].items.filter((_, i) => i !== ii) };
      return next;
    });
  }
  function addItem(ci: number) {
    setCategories((cs) => {
      const next = [...cs];
      next[ci] = { ...next[ci], items: [...next[ci].items, { name: "", why: "", price: "R$ 0" }] };
      return next;
    });
  }

  async function publish() {
    if (!ownerId) {
      toast.error("Selecione o proprietário");
      return;
    }
    if (!categories.length) {
      toast.error("Gere a curadoria primeiro");
      return;
    }
    setPublishing(true);
    try {
      const { data: cur, error } = await supabase
        .from("owner_curations")
        .insert({
          owner_id: ownerId,
          status: "published",
          categories: categories as any,
          observations: observations as any,
          source_filename: filename,
          ai_history: history as any,
          published_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      // dispara magic link + email
      await supabase.functions.invoke("notify-curation-ready", {
        body: { owner_id: ownerId, curation_id: cur.id },
      });

      setPublishedId(cur.id);
      toast.success("Curadoria publicada — link público gerado abaixo");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPublishing(false);
    }
  }

  async function sendTestEmail() {
    if (!testEmail.trim()) {
      toast.error("Informe um e-mail de teste");
      return;
    }
    setSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke("notify-curation-ready", {
        body: { test_email: testEmail.trim() },
      });
      if (error) throw error;
      toast.success(`E-mail de teste enviado para ${testEmail}`);
    } catch (e: any) {
      toast.error(e.message || "Falha ao enviar e-mail teste");
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="container max-w-7xl py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/admin/cadastros-proprietarios">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nova curadoria</h1>
          <p className="text-sm text-muted-foreground">
            Anexe a planilha, refine com a IA e publique para o proprietário.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Coluna esquerda: setup + preview */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Proprietário</label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} {o.status === "pending" && <Badge variant="outline" className="ml-2">pendente</Badge>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Planilha de origem</label>
                <div className="flex gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx,.xls,.tsv,.txt"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  <Button variant="outline" onClick={() => fileInput.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    {filename || "Anexar arquivo"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium">
                Ou cole a planilha (qualquer formato)
              </label>
              <Textarea
                rows={4}
                value={spreadsheetText}
                onChange={(e) => setSpreadsheetText(e.target.value)}
                placeholder="cole aqui CSV, lista de produtos com links e preços, etc."
              />
            </div>

            <Button onClick={generate} disabled={loading} className="mt-4">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Gerar com IA
            </Button>
          </Card>

          {publicUrl && (
            <Card className="border-success/40 bg-success/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-success">
                    Curadoria publicada — link público gerado
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{publicUrl}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use para revisar como o proprietário verá. Se houver erro, exclua e gere novamente.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(publicUrl);
                      toast.success("Link copiado");
                    }}
                  >
                    <Copy className="mr-2 h-3 w-3" />
                    Copiar link
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={publicUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-3 w-3" />
                      Abrir
                    </a>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      if (!confirm("Excluir esta curadoria publicada?")) return;
                      const { error } = await supabase
                        .from("owner_curations")
                        .delete()
                        .eq("id", publishedId!);
                      if (error) return toast.error(error.message);
                      toast.success("Curadoria excluída");
                      setPublishedId(null);
                    }}
                  >
                    <Trash2 className="mr-2 h-3 w-3" />
                    Excluir
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {categories.length > 0 && (
            <Card className="p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">
                  Preview editável <span className="text-sm text-muted-foreground">· {totalItems} itens</span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                    <Eye className="mr-2 h-4 w-4" />
                    Visualizar como proprietário
                  </Button>
                  <div className="flex items-center gap-1">
                    <Input
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="email@teste.com"
                      className="h-9 w-52"
                    />
                    <Button variant="outline" onClick={sendTestEmail} disabled={sendingTest}>
                      {sendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      E-mail teste
                    </Button>
                  </div>
                  <Button onClick={publish} disabled={publishing || !ownerId}>
                    {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Publicar e notificar
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                {categories.map((cat, ci) => (
                  <div key={cat.key + ci}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-lg">{cat.emoji}</span>
                      <Input
                        value={cat.title}
                        onChange={(e) =>
                          setCategories((cs) => cs.map((c, i) => (i === ci ? { ...c, title: e.target.value } : c)))
                        }
                        className="h-8 max-w-sm font-semibold"
                      />
                      <Button size="sm" variant="ghost" onClick={() => addItem(ci)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <ul className="divide-y rounded-lg border">
                      {cat.items.map((it, ii) => (
                        <li key={ii} className="space-y-2 p-2">
                          <div className="grid grid-cols-[1fr_2fr_100px_120px_auto] items-center gap-2">
                            <Input
                              value={it.name}
                              onChange={(e) => updateItem(ci, ii, { name: e.target.value })}
                              placeholder="Nome"
                              className="h-8"
                            />
                            <Input
                              value={it.why}
                              onChange={(e) => updateItem(ci, ii, { why: e.target.value })}
                              placeholder="Por quê"
                              className="h-8"
                            />
                            <Input
                              value={it.price}
                              onChange={(e) => updateItem(ci, ii, { price: e.target.value })}
                              placeholder="R$ 0"
                              className="h-8"
                            />
                            <Select
                              value={it.priority || "none"}
                              onValueChange={(v) => updateItem(ci, ii, { priority: v === "none" ? "" : (v as any) })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                <SelectItem value="essencial">Essencial</SelectItem>
                                <SelectItem value="recomendado">Recomendado</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="icon" variant="ghost" onClick={() => removeItem(ci, ii)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 pl-1 text-xs text-muted-foreground">
                            <label className="flex items-center gap-1.5">
                              <Checkbox
                                checked={!!it.optional}
                                onCheckedChange={(v) => updateItem(ci, ii, { optional: !!v })}
                              />
                              Opcional (proprietário pode desmarcar)
                            </label>
                            <div className="flex items-center gap-1.5">
                              <span>Grupo de alternativa:</span>
                              <Input
                                value={it.alternativeGroup || ""}
                                onChange={(e) => updateItem(ci, ii, { alternativeGroup: e.target.value })}
                                placeholder="ex: cama-premium"
                                className="h-7 w-44 text-xs"
                              />
                              <span className="text-[10px] opacity-70">
                                (mesmo grupo = escolha entre opções; 1ª = melhor ROI)
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span>Link:</span>
                              <Input
                                value={it.link || ""}
                                onChange={(e) => updateItem(ci, ii, { link: e.target.value })}
                                placeholder="https://..."
                                className="h-7 w-56 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span>Qtd:</span>
                              <Input
                                type="number"
                                min={0}
                                value={it.quantity ?? ""}
                                onChange={(e) =>
                                  updateItem(ci, ii, {
                                    quantity: e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                placeholder="2"
                                className="h-7 w-16 text-xs"
                              />
                              <Input
                                value={it.unit || ""}
                                onChange={(e) => updateItem(ci, ii, { unit: e.target.value })}
                                placeholder="un / par / kit"
                                className="h-7 w-24 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span>Tamanho:</span>
                              <Input
                                value={it.dimensions || ""}
                                onChange={(e) => updateItem(ci, ii, { dimensions: e.target.value })}
                                placeholder='ex: King 193x203, 2x2,5m, 50"'
                                className="h-7 w-52 text-xs"
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {observations.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Observações
                  </h3>
                  <ul className="space-y-2">
                    {observations.map((o, i) => (
                      <li key={i} className="rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{o.tag}</Badge>
                          <Input
                            value={o.title}
                            onChange={(e) =>
                              setObservations((os) => os.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                            }
                            className="h-8 font-semibold"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setObservations((os) => os.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <Textarea
                          value={o.body}
                          onChange={(e) =>
                            setObservations((os) => os.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))
                          }
                          rows={2}
                          className="mt-2"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Coluna direita: chat com a IA */}
        <Card className="flex h-[calc(100vh-180px)] flex-col p-4">
          <div className="mb-3 flex items-center gap-2 border-b pb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Chat com a IA</h2>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto">
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Depois de gerar a curadoria, mande comandos aqui pra ajustar — ex: "remove os itens acima de R$ 1500", "adiciona uma seção de banheiro", "deixa o tom mais informal".
              </p>
            )}
            {history.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 text-sm ${
                  m.role === "user" ? "bg-primary/10 ml-6" : "bg-muted mr-6"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && <div className="text-sm text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> processando…</div>}
          </div>
          <div className="mt-3 flex gap-2 border-t pt-3">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refine()}
              placeholder="Comando para a IA…"
              disabled={loading || !categories.length}
            />
            <Button onClick={refine} disabled={loading || !categories.length || !chatInput.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>

      {/* Preview do que o proprietário verá */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="h-[95vh] max-w-[95vw] overflow-y-auto bg-secondary p-0 text-secondary-foreground">
          <DialogTitle className="sr-only">Preview da curadoria</DialogTitle>
          <div className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-secondary/95 px-6 py-3 backdrop-blur">
            <div className="flex items-center gap-2 text-sm">
              <Eye className="h-4 w-4 text-primary" />
              <span className="font-medium">Visualizando como o proprietário verá em /bem-vindo</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setPreviewOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="px-4 py-6 md:px-8">
            <PlanoPerformanceSection
              customCategories={categories as any}
              customObservations={observations as any}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
