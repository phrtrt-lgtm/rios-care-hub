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
import { ArrowLeft } from "lucide-react";

export default function AdminContratoNovo() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [owners, setOwners] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    owner_id: "",
    property_id: "",
    template_id: "",
    commission_percent: 22,
    term_months: 24,
    start_date: "",
    maintenance_limit_brl: 3000,
    specific_terms: "",
  });

  useEffect(() => {
    (async () => {
      const [o, t] = await Promise.all([
        supabase.from("profiles").select("id,name,email").eq("role", "owner").order("name"),
        (supabase as any).from("contract_templates").select("id,name,is_default").is("archived_at", null).order("is_default", { ascending: false }),
      ]);
      setOwners(o.data ?? []);
      setTemplates(t.data ?? []);
      const def = t.data?.find((x: any) => x.is_default);
      if (def) setForm((f) => ({ ...f, template_id: def.id }));
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
    if (!form.owner_id || !form.template_id) {
      toast.error("Selecione proprietário e modelo de contrato");
      return;
    }
    setSaving(true);
    const { data, error } = await (supabase as any)
      .from("contracts")
      .insert({
        owner_id: form.owner_id,
        property_id: form.property_id || null,
        template_id: form.template_id,
        commission_percent: form.commission_percent,
        term_months: form.term_months,
        start_date: form.start_date || null,
        maintenance_limit_cents: Math.round(Number(form.maintenance_limit_brl) * 100),
        specific_terms: form.specific_terms || null,
        status: "awaiting_owner",
        created_by: user?.id,
      })
      .select("id")
      .single();
    if (error) {
      setSaving(false);
      toast.error("Erro ao criar contrato: " + error.message);
      return;
    }
    await (supabase as any).from("contract_events").insert({
      contract_id: data.id,
      event_type: "created",
      actor_id: user?.id,
      actor_role: "admin",
      payload: { commission_percent: form.commission_percent, term_months: form.term_months },
    });
    toast.success("Pré-contrato criado. Proprietário pode preencher os dados.");
    navigate(`/admin/contratos/${data.id}`, { replace: true });
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
            <p className="text-sm text-muted-foreground">Defina condições comerciais e envie ao proprietário.</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Card>
          <CardHeader><CardTitle className="text-base">Condições comerciais</CardTitle></CardHeader>
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
              <Label>Imóvel</Label>
              <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })} disabled={!form.owner_id}>
                <SelectTrigger><SelectValue placeholder={form.owner_id ? "Selecione" : "Selecione um proprietário"} /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Modelo de contrato *</Label>
              <Select value={form.template_id} onValueChange={(v) => setForm({ ...form, template_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? " (padrão)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Comissão RIOS (%)</Label>
                <Input type="number" step="0.01" value={form.commission_percent}
                  onChange={(e) => setForm({ ...form, commission_percent: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Vigência (meses)</Label>
                <Input type="number" value={form.term_months}
                  onChange={(e) => setForm({ ...form, term_months: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Data de início</Label>
                <Input type="date" value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Limite manutenção sem aprovação (R$)</Label>
                <Input type="number" step="0.01" value={form.maintenance_limit_brl}
                  onChange={(e) => setForm({ ...form, maintenance_limit_brl: Number(e.target.value) })} />
              </div>
            </div>

            <div>
              <Label>Condições específicas / observações</Label>
              <Textarea rows={4} value={form.specific_terms}
                onChange={(e) => setForm({ ...form, specific_terms: e.target.value })}
                placeholder="Cláusulas adicionais ou observações específicas deste contrato..." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate("/admin/contratos", { replace: true })}>Cancelar</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "Criando..." : "Criar e enviar ao proprietário"}</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
