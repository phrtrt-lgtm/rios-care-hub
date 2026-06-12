import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle2, Download, ExternalLink, FileText, Upload, XCircle } from "lucide-react";
import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { ContractTimeline } from "@/components/contracts/ContractTimeline";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { toast } from "sonner";

export default function AdminContratoDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [property, setProperty] = useState<any>(null);
  const [contractUrl, setContractUrl] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: c } = await (supabase as any).from("contracts").select("*").eq("id", id).maybeSingle();
    if (!c) { setLoading(false); return; }
    const [o, p] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", c.owner_id).maybeSingle(),
      c.property_id ? supabase.from("properties").select("*").eq("id", c.property_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setContract(c);
    setOwner(o.data);
    setProperty(p.data);

    if (c.generated_pdf_path) {
      const { data: s } = await supabase.storage.from("contracts").createSignedUrl(c.generated_pdf_path, 3600);
      setContractUrl(s?.signedUrl ?? null);
    }
    if (c.signed_pdf_path) {
      const { data: s } = await supabase.storage.from("contract-attachments").createSignedUrl(c.signed_pdf_path, 3600);
      setSignedUrl(s?.signedUrl ?? null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const logEvent = async (event_type: string, payload: any = {}) => {
    await (supabase as any).from("contract_events").insert({
      contract_id: id, event_type, actor_id: user?.id, actor_role: "admin", payload,
    });
  };

  const replacePdf = async (file: File) => {
    if (!contract) return;
    if (file.type !== "application/pdf") return toast.error("Envie um PDF");
    setBusy(true);
    try {
      const path = `${contract.owner_id}/${contract.id}/contrato.pdf`;
      const up = await supabase.storage.from("contracts").upload(path, file, {
        contentType: "application/pdf", upsert: true,
      });
      if (up.error) throw up.error;
      await (supabase as any).from("contracts").update({ generated_pdf_path: path }).eq("id", contract.id);
      await logEvent("contract_pdf_replaced");
      toast.success("PDF substituído");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  };

  const markSigned = async () => {
    setBusy(true);
    await (supabase as any).from("contracts").update({
      status: "signed", signed_at: new Date().toISOString(), signature_provider: "gov.br",
    }).eq("id", id);
    await logEvent("contract_signed", { provider: "gov.br" });
    toast.success("Contrato marcado como assinado");
    setBusy(false);
    load();
  };

  const cancel = async () => {
    if (!confirm("Cancelar este contrato?")) return;
    setBusy(true);
    await (supabase as any).from("contracts").update({ status: "cancelled" }).eq("id", id);
    await logEvent("contract_cancelled");
    toast.success("Contrato cancelado");
    setBusy(false);
    load();
  };

  if (loading) return <div className="container mx-auto px-4 py-8"><SectionSkeleton /></div>;
  if (!contract) return <div className="container mx-auto px-4 py-8">Contrato não encontrado.</div>;

  const isOpen = contract.status !== "signed" && contract.status !== "cancelled";

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
              {property?.name ?? "Sem imóvel"} · {owner?.email}
            </p>
          </div>
          <div className="flex gap-2">
            {signedUrl && contract.status !== "signed" && (
              <Button size="sm" onClick={markSigned} disabled={busy}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar como assinado
              </Button>
            )}
            {isOpen && (
              <Button size="sm" variant="outline" onClick={cancel} disabled={busy}>
                <XCircle className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <Tabs defaultValue="documento">
          <TabsList>
            <TabsTrigger value="documento">Documento</TabsTrigger>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="documento" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Contrato enviado</CardTitle>
                <div className="flex gap-2">
                  {contractUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a href={contractUrl} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1" /> Baixar</a>
                    </Button>
                  )}
                  {isOpen && (
                    <Button asChild size="sm" variant="outline">
                      <label className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-1" /> Substituir PDF
                        <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && replacePdf(e.target.files[0])} />
                      </label>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {contractUrl ? (
                  <iframe src={contractUrl} className="w-full h-[70vh] border rounded" title="Contrato" />
                ) : <p className="text-sm text-muted-foreground">Nenhum PDF anexado.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Contrato assinado</CardTitle>
              </CardHeader>
              <CardContent>
                {signedUrl ? (
                  <div className="space-y-2">
                    <Button asChild size="sm" variant="outline">
                      <a href={signedUrl} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1" /> Baixar assinado</a>
                    </Button>
                    <iframe src={signedUrl} className="w-full h-[70vh] border rounded" title="Assinado" />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    O proprietário ainda não enviou o PDF assinado. Quando ele assinar no <a className="underline" href="https://assinador.iti.br/" target="_blank" rel="noreferrer">assinador gov.br <ExternalLink className="inline h-3 w-3" /></a> e fizer upload aqui, o arquivo aparecerá nesta seção.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resumo">
            <Card>
              <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground text-xs">Proprietário</p><p className="font-medium">{owner?.name}</p></div>
                <div><p className="text-muted-foreground text-xs">E-mail</p><p className="font-medium">{owner?.email}</p></div>
                <div><p className="text-muted-foreground text-xs">Imóvel</p><p className="font-medium">{property?.name ?? "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Enviado em</p><p className="font-medium">{contract.sent_to_owner_at ? new Date(contract.sent_to_owner_at).toLocaleString("pt-BR") : "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Assinado em</p><p className="font-medium">{contract.signed_at ? new Date(contract.signed_at).toLocaleString("pt-BR") : "—"}</p></div>
                {contract.notes && <div className="col-span-2"><p className="text-muted-foreground text-xs">Observações internas</p><p className="whitespace-pre-wrap">{contract.notes}</p></div>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="historico">
            <ContractTimeline contractId={contract.id} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
