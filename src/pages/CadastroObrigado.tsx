import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetaPixel, trackMetaEvent } from "@/components/MetaPixel";
import riosLogo from "@/assets/rios-logo.png";

export default function CadastroObrigado() {
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState(5);

  useEffect(() => {
    // Dispara o evento de lead assim que a página é exibida.
    trackMetaEvent("Lead", {
      content_name: "Cadastro de Imóvel",
      content_category: "Pré-cadastro",
      value: 0,
      currency: "BRL",
    });
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) {
      navigate("/bem-vindo", { replace: true });
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, navigate]);

  return (
    <>
      <MetaPixel />
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--rios-terra))]/8 via-background to-[hsl(var(--rios-terra))]/12 relative overflow-hidden flex items-center justify-center px-4">
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--rios-terra))]/20 blur-3xl" />
          <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-[hsl(var(--rios-terra-light))]/18 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] rounded-full bg-[hsl(var(--rios-blue))]/10 blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative w-full max-w-lg"
        >
          <div className="rounded-3xl border border-primary/10 bg-background/80 backdrop-blur-xl shadow-2xl p-8 md:p-10 text-center">
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-primary/10 p-4 ring-1 ring-primary/20">
                <CheckCircle2 className="h-10 w-10 text-primary" />
              </div>
            </div>

            <img
              src={riosLogo}
              alt="RIOS"
              className="h-10 w-auto object-contain mx-auto mb-6"
            />

            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              Recebemos seu cadastro!
            </h1>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Em breve entraremos em contato.
            </p>

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-8">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Redirecionando para o seu portal em{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {secondsLeft}s
              </span>
            </div>

            <Button
              onClick={() => navigate("/bem-vindo", { replace: true })}
              size="lg"
              className="gap-2 w-full"
            >
              Acessar meu portal agora
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
