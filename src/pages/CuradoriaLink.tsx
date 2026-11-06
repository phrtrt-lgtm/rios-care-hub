import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { abrirCuradoriaPorLink, urlDoArquivo } from "@/lib/curadoriaHtml";
import riosLogo from "@/assets/rios-logo.png";

type Estado = { tipo: "carregando" } | { tipo: "indisponivel" } | { tipo: "pronta"; html: string; titulo: string };

/**
 * /curadoria/:token: a proposta decorativa em tela cheia, sem login.
 * A página roda num iframe sandbox sem allow-same-origin: é HTML enviado por arquivo, então não pode
 * enxergar a sessão de quem está logado no portal. allow-popups abre o WhatsApp e allow-modals, a impressão.
 */
export default function CuradoriaLink() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    (async () => {
      try {
        const curadoria = await abrirCuradoriaPorLink(token);
        if (!curadoria) throw new Error("sem curadoria");
        const resposta = await fetch(urlDoArquivo(curadoria.html_path));
        if (!resposta.ok) throw new Error(`arquivo ${resposta.status}`);
        const html = await resposta.text();
        if (vivo) {
          document.title = `${curadoria.titulo} · RIOS`;
          setEstado({ tipo: "pronta", html, titulo: curadoria.titulo });
        }
      } catch {
        if (vivo) setEstado({ tipo: "indisponivel" });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token]);

  if (estado.tipo === "pronta") {
    return (
      <iframe
        title={estado.titulo}
        srcDoc={estado.html}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals"
        className="fixed inset-0 h-[100dvh] w-full border-0 bg-secondary"
      />
    );
  }

  if (estado.tipo === "indisponivel") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 bg-background px-6">
        <img src={riosLogo} alt="RIOS" className="h-9" />
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="Esta proposta não está mais disponível"
          description="Fale com a equipe RIOS para receber um link novo."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-secondary">
      <img src={riosLogo} alt="Carregando a proposta" className="h-9 animate-pulse brightness-0 invert" />
    </div>
  );
}
