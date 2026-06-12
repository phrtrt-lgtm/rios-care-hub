import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileText } from "lucide-react";

export default function AdminContratoNovo() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [owners, setOwners] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [pdf, setPdf] = useState<File | null>(null);

  const [form, setForm] = useState({
    owner_id: "",
    property_id: "",
    notes: "",
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,name,email")
        .eq("role", "owner")
        .order("name");
      setOwners(data ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!form.owner_id) { setProperties([]); return; }
    (async () => {
      const { data } = await supabase.from("properties").select("id,name").eq("owner_id", form.owner_id).order("name");
      setProperties(data ?? []);
    })();
  }, [form.owner_id]);

  const submit = async () => {
    if (!form.owner_id) return toast.error("Selecione o proprietário");
    if (!pdf) return toast.error("Anexe o PDF do contrato");
    if (pdf.type !== "application/pdf") return toast.error("O arquivo precisa ser um PDF");

    setSaving(true);
    try {
      const { data: contract, error } = await (supabase as any)
        .from("contracts")
        .insert({
          owner_id: form.owner_id,
          property_id: form.property_id || null,
          status: "awaiting_owner",
          created_by: user?.id,
          notes: form.notes || null,
          sent_to_owner_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;

      const path = `${form.owner_id}/${contract.id}/contrato.pdf`;
      const up = await supabase.storage.from("contracts").upload(path, pdf, {
        contentType: "application/pdf", upsert: true,
      });
      if (up.error) throw up.error;

      await (supabase as any).from("contracts").update({ generated_pdf_path: path }).eq("id", contract.id);

      await (supabase as any).from("contract_events").insert({
        contract_id: contract.id,
        event_type: "contract_sent_to_owner",
        actor_id: user?.id,
        actor_role: "admin",
        payload: { pdf_path: path },
      });

      toast.success("Contrato enviado ao proprietário para assinatura no gov.br");
      navigate(`/admin/contratos/${contract.id}`, { replace: true });
    } catch (e: any) {
      toast.error("Erro: " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/contratos", { replace: true })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Novo contrato</h1>
            <p className="text-sm text-muted-foreground">Anexe o PDF e envie ao proprietário para assinar no gov.br.</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do envio</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Proprietário *</Label>
              <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v, property_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {owners.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} — {o.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Imóvel (opcional)</Label>
              <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })} disabled={!form.owner_id}>
                <SelectTrigger><SelectValue placeholder={form.owner_id ? "Selecione" : "Selecione um proprietário"} /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>PDF do contrato *</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
              </div>
              {pdf && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {pdf.name} · {(pdf.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>

            <div>
              <Label>Observações internas</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas visíveis apenas para a equipe RIOS..." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate("/admin/contratos", { replace: true })}>Cancelar</Button>
              <Button onClick={submit} disabled={saving}>
                <Upload className="h-4 w-4 mr-1" /> {saving ? "Enviando..." : "Enviar ao proprietário"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
