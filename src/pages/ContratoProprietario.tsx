import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Download } from "lucide-react";
import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { ContractTemplatePreview } from "@/components/contracts/ContractTemplatePreview";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { toast } from "sonner";

type EntityKind = "fisica" | "juridica";

const EMPTY = {
  entity_kind: "fisica" as EntityKind,
  legal_name: "",
  document: "",
  rg_or_ie: "",
  marital_status: "",
  nationality: "Brasileira",
  profession: "",
  email: "",
  phone: "",
  address_full: "",
  property_address: "",
  property_unit: "",
  property_condominium: "",
  property_city_uf: "",
  property_max_guests: "",
  property_parking_spots: "",
  bank_name: "",
  bank_agency: "",
  bank_account: "",
  bank_account_type: "corrente",
  pix_key: "",
  accept_truthful: false,
  accept_terms: false,
};

export default function ContratoProprietario() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [property, setProperty] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readOnly = contract && !["awaiting_owner", "owner_filling", "correction_requested"].includes(contract.status);

  const load = async () => {
    setLoading(true);
    const { data: c } = await (supabase as any).from("contracts").select("*").eq("id", id).maybeSingle();
    if (!c) { setLoading(false); return; }
    const [t, o, p, s] = await Promise.all([
      (supabase as any).from("contract_templates").select("*").eq("id", c.template_id).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", c.owner_id).maybeSingle(),
      c.property_id ? supabase.from("properties").select("*").eq("id", c.property_id).maybeSingle() : Promise.resolve({ data: null }),
      (supabase as any).from("contract_owner_submissions").select("*").eq("contract_id", c.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setContract(c);
    setTemplate(t.data);
    setOwner(o.data);
    setProperty(p.data);
    setSubmission(s.data);
    if (s.data?.submitted_data) {
      setData({ ...EMPTY, ...s.data.submitted_data });
    } else {
      setData({ ...EMPTY, email: o.data?.email ?? "", legal_name: o.data?.name ?? "" });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Mark "owner_filling" on first interaction
  const markStarted = async () => {
    if (contract?.status === "awaiting_owner") {
      await (supabase as any).from("contracts").update({ status: "owner_filling" }).eq("id", id);
      await (supabase as any).from("contract_events").insert({
        contract_id: id, event_type: "owner_started_filling", actor_id: user?.id, actor_role: "owner",
      });
    }
  };

  // Autosave
  useEffect(() => {
    if (loading || readOnly || !contract) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      if (submission) {
        await (supabase as any).from("contract_owner_submissions").update({
          submitted_data: data, status: submission.status === "approved" ? submission.status : "draft",
        }).eq("id", submission.id);
      } else {
        const { data: ins } = await (supabase as any).from("contract_owner_submissions").insert({
          contract_id: id, owner_id: contract.owner_id, property_id: contract.property_id,
          submitted_data: data, status: "draft",
        }).select().maybeSingle();
        setSubmission(ins);
        markStarted();
      }
      setSaving(false);
    }, 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [data]);

  const setField = (k: keyof typeof EMPTY, v: any) => setData((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!data.accept_truthful || !data.accept_terms) {
      toast.error("Confirme as declarações antes de enviar");
      return;
    }
    setSaving(true);
    const submissionId = submission?.id ?? (await (supabase as any).from("contract_owner_submissions").insert({
      contract_id: id, owner_id: contract.owner_id, property_id: contract.property_id, submitted_data: data, status: "submitted", submitted_at: new Date().toISOString(),
    }).select("id").single()).data?.id;

    if (submission) {
      await (supabase as any).from("contract_owner_submissions").update({
        submitted_data: data, status: "submitted", submitted_at: new Date().toISOString(),
      }).eq("id", submission.id);
    }
    await (supabase as any).from("contracts").update({
      status: "submitted", current_submission_id: submissionId,
    }).eq("id", id);
    const isResub = contract.status === "correction_requested";
    await (supabase as any).from("contract_events").insert({
      contract_id: id, event_type: isResub ? "owner_resubmitted" : "owner_submitted",
      actor_id: user?.id, actor_role: "owner",
    });
    setSaving(false);
    toast.success("Dados enviados para revisão da RIOS");
    load();
  };

  if (loading) return <div className="container mx-auto px-4 py-8"><SectionSkeleton /></div>;
  if (!contract) return <div className="container mx-auto px-4 py-8">Contrato não encontrado.</div>;

  // After submission / generated → read-only view
  if (readOnly || contract.status === "submitted") {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/minha-caixa", { replace: true })}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold">Seu contrato</h1>
                <ContractStatusBadge status={contract.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {contract.status === "submitted" && "Seus dados estão em análise pela RIOS."}
                {contract.status === "approved" && "Dados aprovados. Aguardando geração do contrato final."}
                {contract.status === "generated" && "Contrato gerado. Aguardando assinatura."}
                {contract.status === "signed" && "Contrato assinado."}
              </p>
            </div>
            {(contract.status === "generated" || contract.status === "signed") && (
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Download className="h-4 w-4 mr-1" /> Baixar
              </Button>
            )}
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 max-w-3xl">
          {template && (
            <Card><CardContent className="p-0">
              <ContractTemplatePreview templateMd={template.content_md} contract={contract} owner={owner} property={property} submission={submission} />
            </CardContent></Card>
          )}
        </main>
      </div>
    );
  }

  const steps = ["Dados pessoais", "Imóvel", "Bancários", "Revisão"];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/minha-caixa", { replace: true })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold">Preenchimento do contrato</h1>
              <ContractStatusBadge status={contract.status} />
            </div>
            <p className="text-xs text-muted-foreground">Passo {step + 1} de {steps.length} · {steps[step]} {saving && "· salvando..."}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        {contract.status === "correction_requested" && submission?.correction_message && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription><strong>Correção solicitada:</strong> {submission.correction_message}</AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Atenção:</strong> esses dados serão utilizados na emissão do contrato. Revise com cuidado.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader><CardTitle className="text-base">{steps[step]}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <>
                <div>
                  <Label>Tipo</Label>
                  <RadioGroup value={data.entity_kind} onValueChange={(v) => setField("entity_kind", v as EntityKind)} className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="fisica" /> Pessoa física</label>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="juridica" /> Pessoa jurídica</label>
                  </RadioGroup>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>{data.entity_kind === "juridica" ? "Razão social" : "Nome completo"} *</Label>
                    <Input value={data.legal_name} onChange={(e) => setField("legal_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>{data.entity_kind === "juridica" ? "CNPJ" : "CPF"} *</Label>
                    <Input value={data.document} onChange={(e) => setField("document", e.target.value)} />
                  </div>
                  <div>
                    <Label>{data.entity_kind === "juridica" ? "Inscrição estadual" : "RG"}</Label>
                    <Input value={data.rg_or_ie} onChange={(e) => setField("rg_or_ie", e.target.value)} />
                  </div>
                  {data.entity_kind === "fisica" && (
                    <>
                      <div><Label>Estado civil</Label><Input value={data.marital_status} onChange={(e) => setField("marital_status", e.target.value)} /></div>
                      <div><Label>Profissão</Label><Input value={data.profession} onChange={(e) => setField("profession", e.target.value)} /></div>
                      <div><Label>Nacionalidade</Label><Input value={data.nationality} onChange={(e) => setField("nationality", e.target.value)} /></div>
                    </>
                  )}
                  <div><Label>E-mail *</Label><Input type="email" value={data.email} onChange={(e) => setField("email", e.target.value)} /></div>
                  <div><Label>Telefone *</Label><Input value={data.phone} onChange={(e) => setField("phone", e.target.value)} /></div>
                  <div className="col-span-2">
                    <Label>Endereço completo *</Label>
                    <Textarea rows={2} value={data.address_full} onChange={(e) => setField("address_full", e.target.value)} placeholder="Rua, número, complemento, bairro, cidade/UF, CEP" />
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Endereço do imóvel *</Label><Input value={data.property_address} onChange={(e) => setField("property_address", e.target.value)} /></div>
                <div><Label>Unidade / Apto</Label><Input value={data.property_unit} onChange={(e) => setField("property_unit", e.target.value)} /></div>
                <div><Label>Condomínio</Label><Input value={data.property_condominium} onChange={(e) => setField("property_condominium", e.target.value)} /></div>
                <div><Label>Cidade/UF</Label><Input value={data.property_city_uf} onChange={(e) => setField("property_city_uf", e.target.value)} /></div>
                <div><Label>Capacidade máxima (hóspedes)</Label><Input type="number" value={data.property_max_guests} onChange={(e) => setField("property_max_guests", e.target.value)} /></div>
                <div><Label>Vagas de garagem</Label><Input type="number" value={data.property_parking_spots} onChange={(e) => setField("property_parking_spots", e.target.value)} /></div>
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Banco</Label><Input value={data.bank_name} onChange={(e) => setField("bank_name", e.target.value)} /></div>
                <div><Label>Agência</Label><Input value={data.bank_agency} onChange={(e) => setField("bank_agency", e.target.value)} /></div>
                <div><Label>Conta</Label><Input value={data.bank_account} onChange={(e) => setField("bank_account", e.target.value)} /></div>
                <div>
                  <Label>Tipo de conta</Label>
                  <RadioGroup value={data.bank_account_type} onValueChange={(v) => setField("bank_account_type", v)} className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="corrente" /> Corrente</label>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="poupanca" /> Poupança</label>
                  </RadioGroup>
                </div>
                <div className="col-span-2"><Label>Chave PIX (preferencial para repasses)</Label><Input value={data.pix_key} onChange={(e) => setField("pix_key", e.target.value)} /></div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
                  <p><strong>{data.legal_name}</strong> · {data.document}</p>
                  <p className="text-muted-foreground">{data.email} · {data.phone}</p>
                  <p className="text-muted-foreground">{data.address_full}</p>
                  <hr className="my-2" />
                  <p><strong>Imóvel:</strong> {data.property_address} {data.property_unit}</p>
                  <p className="text-muted-foreground">{data.property_condominium} · {data.property_city_uf}</p>
                  <hr className="my-2" />
                  <p><strong>Pagamento:</strong> {data.bank_name} ag {data.bank_agency} cc {data.bank_account} ({data.bank_account_type})</p>
                  <p className="text-muted-foreground">PIX: {data.pix_key || "—"}</p>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={data.accept_truthful} onCheckedChange={(v) => setField("accept_truthful", !!v)} />
                  <span>Declaro que todas as informações fornecidas são verdadeiras e atualizadas.</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={data.accept_terms} onCheckedChange={(v) => setField("accept_terms", !!v)} />
                  <span>Concordo com as condições comerciais definidas no pré-contrato ({contract.commission_percent}% comissão, vigência {contract.term_months} meses).</span>
                </label>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              {step < steps.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)}>
                  Avançar <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={submit} disabled={saving || !data.accept_truthful || !data.accept_terms}>
                  <Check className="h-4 w-4 mr-1" /> Enviar para a RIOS
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
