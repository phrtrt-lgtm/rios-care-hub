import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle2, AlertTriangle, FileText, Printer } from "lucide-react";
import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { ContractTimeline } from "@/components/contracts/ContractTimeline";
import { ContractTemplatePreview } from "@/components/contracts/ContractTemplatePreview";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { toast } from "sonner";

export default function AdminContratoDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [property, setProperty] = useState<any>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionMsg, setCorrectionMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: c } = await (supabase as any).from("contracts").select("*").eq("id", id).maybeSingle();
    if (!c) { setLoading(false); return; }
    const [t, o, p, s] = await Promise.all([
      (supabase as any).from("contract_templates").select("*").eq("id", c.template_id).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", c.owner_id).maybeSingle(),
      c.property_id ? supabase.from("properties").select("*").eq("id", c.property_id).maybeSingle() : Promise.resolve({ data: null }),
      c.current_submission_id
        ? (supabase as any).from("contract_owner_submissions").select("*").eq("id", c.current_submission_id).maybeSingle()
        : (supabase as any).from("contract_owner_submissions").select("*").eq("contract_id", c.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setContract(c);
    setTemplate(t.data);
    setOwner(o.data);
    setProperty(p.data);
    setSubmission(s.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const logEvent = async (event_type: string, payload: any = {}) => {
    await (supabase as any).from("contract_events").insert({
      contract_id: id, event_type, actor_id: user?.id, actor_role: "admin", payload,
    });
  };

  const approve = async () => {
    if (!submission) return;
    await (supabase as any).from("contract_owner_submissions").update({
      status: "approved", approved_at: new Date().toISOString(), approved_by: user?.id,
    }).eq("id", submission.id);
    await (supabase as any).from("contracts").update({
      status: "approved", current_submission_id: submission.id,
    }).eq("id", id);
    await logEvent("rios_approved");
    toast.success("Dados aprovados");
    load();
  };

  const requestCorrection = async () => {
    if (!submission || !correctionMsg.trim()) return;
    await (supabase as any).from("contract_owner_submissions").update({
      status: "correction_requested", correction_message: correctionMsg,
    }).eq("id", submission.id);
    await (supabase as any).from("contracts").update({ status: "correction_requested" }).eq("id", id);
    await logEvent("rios_requested_correction", { message: correctionMsg });
    setCorrectionOpen(false);
    setCorrectionMsg("");
    toast.success("Correção solicitada ao proprietário");
    load();
  };

  const generateFinal = async () => {
    const frozen = {
      owner: owner,
      property: property,
      submission: submission?.submitted_data,
      contract: {
        commission_percent: contract.commission_percent,
        term_months: contract.term_months,
        start_date: contract.start_date,
        maintenance_limit_cents: contract.maintenance_limit_cents,
        specific_terms: contract.specific_terms,
      },
      generated_at: new Date().toISOString(),
    };
    await (supabase as any).from("contracts").update({
      status: "generated", frozen_data: frozen, version: (contract.version ?? 1) + (contract.frozen_data ? 1 : 0),
    }).eq("id", id);
    await logEvent("contract_generated", { version: (contract.version ?? 1) });
    toast.success("Contrato final gerado");
    load();
  };

  const markSigned = async () => {
    await (supabase as any).from("contracts").update({
      status: "signed", signed_at: new Date().toISOString(), signature_provider: "manual",
    }).eq("id", id);
    await logEvent("contract_signed", { provider: "manual" });
    toast.success("Contrato marcado como assinado");
    load();
  };

  if (loading) return <div className="container mx-auto px-4 py-8"><SectionSkeleton /></div>;
  if (!contract) return <div className="container mx-auto px-4 py-8">Contrato não encontrado.</div>;

  const sub = submission?.submitted_data ?? {};
  const canApprove = contract.status === "submitted";
  const canGenerate = contract.status === "approved" || contract.status === "generated";

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/contratos", { replace: true })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold truncate">{owner?.name}</h1>
              <ContractStatusBadge status={contract.status} />
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {property?.name ?? "Sem imóvel"} · {contract.commission_percent}% · {contract.term_months} meses
            </p>
          </div>
          <div className="flex gap-2">
            {canApprove && (
              <>
                <Button variant="outline" size="sm" onClick={() => setCorrectionOpen(true)}>
                  <AlertTriangle className="h-4 w-4 mr-1" /> Pedir correção
                </Button>
                <Button size="sm" onClick={approve}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar dados
                </Button>
              </>
            )}
            {canGenerate && (
              <Button size="sm" onClick={generateFinal} variant={contract.status === "generated" ? "outline" : "default"}>
                <FileText className="h-4 w-4 mr-1" /> {contract.status === "generated" ? "Regenerar" : "Gerar contrato final"}
              </Button>
            )}
            {contract.status === "generated" && (
              <Button size="sm" variant="default" onClick={markSigned}>Marcar assinado</Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="resumo">
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="dados">Dados do proprietário</TabsTrigger>
            <TabsTrigger value="documento">Documento</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Condições comerciais</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground text-xs">Comissão RIOS</p><p className="font-medium">{contract.commission_percent}%</p></div>
                <div><p className="text-muted-foreground text-xs">Vigência</p><p className="font-medium">{contract.term_months} meses</p></div>
                <div><p className="text-muted-foreground text-xs">Início</p><p className="font-medium">{contract.start_date ?? "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Limite manutenção</p><p className="font-medium">R$ {(contract.maintenance_limit_cents/100).toFixed(2)}</p></div>
                {contract.specific_terms && (
                  <div className="col-span-2"><p className="text-muted-foreground text-xs">Condições específicas</p><p className="whitespace-pre-wrap">{contract.specific_terms}</p></div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dados">
            <Card>
              <CardHeader><CardTitle className="text-base">Dados enviados pelo proprietário</CardTitle></CardHeader>
              <CardContent>
                {!submission ? (
                  <p className="text-sm text-muted-foreground">Proprietário ainda não enviou dados.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {Object.entries(sub).map(([k, v]) => (
                      <div key={k}>
                        <p className="text-xs text-muted-foreground">{k}</p>
                        <p className="font-medium break-words">{String(v ?? "—")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documento">
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir / PDF
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {template ? (
                  <ContractTemplatePreview
                    templateMd={template.content_md}
                    contract={contract}
                    owner={owner}
                    property={property}
                    submission={submission}
                  />
                ) : <p className="p-6 text-sm text-muted-foreground">Modelo não encontrado.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="historico">
            <ContractTimeline contractId={contract.id} />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitar correção</DialogTitle></DialogHeader>
          <Textarea rows={5} value={correctionMsg} onChange={(e) => setCorrectionMsg(e.target.value)} placeholder="Descreva o que precisa ser corrigido..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionOpen(false)}>Cancelar</Button>
            <Button onClick={requestCorrection} disabled={!correctionMsg.trim()}>Enviar pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
