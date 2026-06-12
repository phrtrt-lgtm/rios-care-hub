import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Download, ExternalLink, FileSignature, Upload, CheckCircle2 } from "lucide-react";
import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { toast } from "sonner";

export default function ContratoProprietario() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<any>(null);
  const [contractUrl, setContractUrl] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: c } = await (supabase as any).from("contracts").select("*").eq("id", id).maybeSingle();
    if (!c) { setLoading(false); return; }
    setContract(c);

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

  const uploadSigned = async (file: File) => {
    if (!contract || !user) return;
    if (file.type !== "application/pdf") return toast.error("Envie um PDF assinado");
    setUploading(true);
    try {
      const path = `${user.id}/${contract.id}/assinado.pdf`;
      const up = await supabase.storage.from("contract-attachments").upload(path, file, {
        contentType: "application/pdf", upsert: true,
      });
      if (up.error) throw up.error;
      await (supabase as any).from("contracts").update({
        signed_pdf_path: path,
        signed_at: new Date().toISOString(),
        signature_provider: "gov.br",
        status: "signed",
      }).eq("id", contract.id);
      await (supabase as any).from("contract_events").insert({
        contract_id: contract.id,
        event_type: "owner_uploaded_signed",
        actor_id: user.id,
        actor_role: "owner",
      });
      toast.success("Contrato assinado enviado com sucesso!");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setUploading(false); }
  };

  if (loading) return <div className="container mx-auto px-4 py-8"><SectionSkeleton /></div>;
  if (!contract) return <div className="container mx-auto px-4 py-8">Contrato não encontrado.</div>;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/minha-caixa", { replace: true })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold">Seu contrato</h1>
              <ContractStatusBadge status={contract.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {contract.status === "signed" ? "Assinatura registrada." : "Baixe, assine no gov.br e envie o PDF assinado de volta."}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        {contract.status !== "signed" && (
          <Alert>
            <FileSignature className="h-4 w-4" />
            <AlertDescription>
              <strong>Passo 1:</strong> baixe o PDF abaixo.{" "}
              <strong>Passo 2:</strong> acesse o <a className="underline font-medium" href="https://assinador.iti.br/" target="_blank" rel="noreferrer">assinador gov.br <ExternalLink className="inline h-3 w-3" /></a>, faça login com sua conta gov.br e assine o documento.{" "}
              <strong>Passo 3:</strong> envie o PDF já assinado de volta no botão abaixo.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Contrato</CardTitle>
            {contractUrl && (
              <Button asChild size="sm">
                <a href={contractUrl} target="_blank" rel="noreferrer" download>
                  <Download className="h-4 w-4 mr-1" /> Baixar PDF
                </a>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {contractUrl ? (
              <iframe src={contractUrl} className="w-full h-[70vh] border rounded" title="Contrato" />
            ) : <p className="text-sm text-muted-foreground">Aguardando upload do contrato.</p>}
          </CardContent>
        </Card>

        {contract.status !== "signed" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Enviar PDF assinado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Após assinar no gov.br, selecione o arquivo PDF resultante:
              </p>
              <label className="block">
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={uploading}
                  onChange={(e) => e.target.files?.[0] && uploadSigned(e.target.files[0])}
                  className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90"
                />
              </label>
              {uploading && <p className="text-xs text-muted-foreground">Enviando...</p>}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-success/40 bg-success/5">
            <CardContent className="p-5 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Contrato assinado</p>
                <p className="text-sm text-muted-foreground">
                  Recebemos seu contrato assinado em {contract.signed_at ? new Date(contract.signed_at).toLocaleString("pt-BR") : "—"}.
                </p>
                {signedUrl && (
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <a href={signedUrl} target="_blank" rel="noreferrer">
                      <Download className="h-4 w-4 mr-1" /> Baixar contrato assinado
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
