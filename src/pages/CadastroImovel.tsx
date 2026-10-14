import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MetaPixel } from "@/components/MetaPixel";
import type { IntakeFormData } from "@/constants/intakeOptions";
import { CabecalhoCaptacao, PainelMarca, RodapeCaptacao } from "@/components/captacao/LandingCaptacao";
import { FormularioCaptacao } from "@/components/captacao/FormularioCaptacao";

const TITULO_PAGINA = "Cadastre seu imóvel · RIOS Hospedagens";

/**
 * Página pública de captação: é para onde os anúncios mandam o proprietário.
 * Uma tela só: painel da marca animado de um lado, formulário em três passos
 * do outro. O envio é o de sempre: submit-property-intake + login automático.
 */
export default function CadastroImovel() {
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const anterior = document.title;
    document.title = TITULO_PAGINA;
    return () => {
      document.title = anterior;
    };
  }, []);

  const enviar = async (form: IntakeFormData) => {
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-property-intake", {
        body: { ...form, notes: form.notes, rooms_data: [] },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);

      const autoLogin = (data as { auto_login?: { email: string; password: string } | null })?.auto_login;
      if (autoLogin?.email && autoLogin?.password) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: autoLogin.email,
          password: autoLogin.password,
        });
        if (!signInErr) {
          toast.success("Cadastro recebido! Bem-vindo à RIOS.");
          navigate("/cadastro-imovel/obrigado", { replace: true });
          return;
        }
        console.error("Auto-login falhou:", signInErr);
      }

      navigate("/cadastro-imovel/obrigado", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <MetaPixel />
      <div className="flex min-h-dvh flex-col bg-background">
        <CabecalhoCaptacao />
        <main className="container mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-1 sm:pt-2">
          <div className="grid gap-6 lg:grid-cols-[1.15fr,1fr] lg:items-start xl:gap-10">
            <PainelMarca />
            <div className="lg:sticky lg:top-6">
              <FormularioCaptacao onEnviar={enviar} enviando={enviando} />
            </div>
          </div>
        </main>
        <RodapeCaptacao />
      </div>
    </>
  );
}
