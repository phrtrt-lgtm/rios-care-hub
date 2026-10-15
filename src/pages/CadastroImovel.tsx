import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MetaPixel } from "@/components/MetaPixel";
import { cn } from "@/lib/utils";
import type { IntakeFormData } from "@/constants/intakeOptions";
import {
  CabecalhoCaptacao,
  PainelMarca,
  useTelaLarga,
} from "@/components/captacao/LandingCaptacao";
import { FormularioCaptacao } from "@/components/captacao/FormularioCaptacao";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"];
const UTM_STORAGE = "cadastro-imovel:utm";

function lerUtm(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const TITULO_PAGINA = "Cadastre seu imóvel · RIOS Hospedagens";

/**
 * Página pública de captação: é para onde os anúncios mandam o proprietário.
 * Sem rolagem de página: no desktop, painel da marca e formulário lado a
 * lado cabendo na tela; no celular, duas telas que deslizam (painel e
 * formulário; `?tela=cadastro` abre direto na segunda). O envio é o de
 * sempre: submit-property-intake + login automático.
 */
export default function CadastroImovel() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const larga = useTelaLarga();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of UTM_KEYS) {
      const v = sp.get(k);
      if (v) utm[k] = v;
    }
    if (Object.keys(utm).length) {
      try { sessionStorage.setItem(UTM_STORAGE, JSON.stringify(utm)); } catch { /* */ }
    }
  }, []);

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
      const { data, error } = await supabase.functions.invoke(
        "submit-property-intake",
        {
          body: { ...form, notes: form.notes, rooms_data: [], utm: lerUtm() },
        },
      );
      if (error) throw error;
      if ((data as { error?: string })?.error)
        throw new Error((data as { error: string }).error);

      const autoLogin = (
        data as { auto_login?: { email: string; password: string } | null }
      )?.auto_login;
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
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <CabecalhoCaptacao />
        <main className="flex min-h-0 flex-1">
          {larga ? (
            // Em tela muito alta (1080p+) o par não estica até o chão: fica com no máximo 920 px, centralizado.
            <div className="container mx-auto my-auto grid h-full max-h-[920px] w-full max-w-6xl grid-cols-[1.15fr,1fr] gap-6 px-4 pb-4 xl:gap-8">
              <div className="flex min-h-0 flex-col">
                <PainelMarca className="min-h-0 flex-1" />
              </div>
              {/* `my-auto` em vez de `items-center`: centraliza sem cortar o topo quando o cartão é mais alto que a tela. */}
              <div className="flex min-h-0 overflow-y-auto">
                <div className="my-auto w-full py-1">
                  <FormularioCaptacao onEnviar={enviar} enviando={enviando} />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full w-full">
              <TelasMoveis
                inicial={params.get("tela") === "cadastro" ? 1 : 0}
                renderPainel={(ir) => (
                  <PainelMarca
                    className="min-h-full"
                    aoCadastrar={() => ir(1)}
                  />
                )}
                renderFormulario={(ir) => (
                  <FormularioCaptacao
                    onEnviar={enviar}
                    enviando={enviando}
                    aoVoltarParaMarca={() => ir(0)}
                  />
                )}
              />
            </div>
          )}
        </main>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Celular: duas telas lado a lado, cada uma do tamanho da janela            */
/* ------------------------------------------------------------------------ */

interface TelasMoveisProps {
  inicial: 0 | 1;
  renderPainel: (ir: (tela: 0 | 1) => void) => React.ReactNode;
  renderFormulario: (ir: (tela: 0 | 1) => void) => React.ReactNode;
}

const NOMES_TELAS = ["A RIOS", "Cadastro"] as const;

function TelasMoveis({
  inicial,
  renderPainel,
  renderFormulario,
}: TelasMoveisProps) {
  const reduzido = useReducedMotion();
  const trilhoRef = useRef<HTMLDivElement>(null);
  const [tela, setTela] = useState<0 | 1>(inicial);

  const ir = useCallback(
    (destino: 0 | 1) => {
      const el = trilhoRef.current;
      if (!el) return;
      el.scrollTo({
        left: destino * el.clientWidth,
        behavior: reduzido ? "auto" : "smooth",
      });
      setTela(destino);
    },
    [reduzido],
  );

  // Abre já na segunda tela quando o link pede (?tela=cadastro), sem animar.
  useEffect(() => {
    const el = trilhoRef.current;
    if (el && inicial === 1) el.scrollLeft = el.clientWidth;
  }, [inicial]);

  const aoRolar = () => {
    const el = trilhoRef.current;
    if (!el) return;
    const atual = Math.round(el.scrollLeft / el.clientWidth) === 1 ? 1 : 0;
    setTela((t) => (t === atual ? t : atual));
  };

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={trilhoRef}
        onScroll={aoRolar}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {[renderPainel, renderFormulario].map((render, i) => (
          <section
            key={NOMES_TELAS[i]}
            aria-label={NOMES_TELAS[i]}
            aria-hidden={tela !== i}
            className="h-full w-full shrink-0 snap-start overflow-y-auto px-4 pb-9 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {render(ir)}
          </section>
        ))}
      </div>

      <div
        role="tablist"
        aria-label="Telas"
        className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-2"
      >
        {NOMES_TELAS.map((nome, i) => (
          <button
            key={nome}
            type="button"
            role="tab"
            aria-selected={tela === i}
            aria-label={nome}
            onClick={() => ir(i as 0 | 1)}
            className={cn(
              "pointer-events-auto h-2 rounded-full transition-all duration-300",
              tela === i
                ? "w-6 bg-primary"
                : "w-2 bg-muted-foreground/40 hover:bg-muted-foreground/70",
            )}
          />
        ))}
      </div>
    </div>
  );
}
