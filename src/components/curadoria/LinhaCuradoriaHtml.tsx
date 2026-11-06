import { useRef, useState } from "react";
import { Copy, Eye, EyeOff, FileCode2, Loader2, MessageCircle, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  BUCKET_CURADORIAS,
  MAX_ARQUIVO_CURADORIA,
  enviarArquivoCuradoria,
  lerDadosDoArquivo,
  linkCuradoria,
  tabelaCuradorias,
  whatsappDaCuradoria,
} from "@/lib/curadoriaHtml";

export interface CuradoriaHtml {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  published_at: string | null;
  total_amount_cents: number | null;
  html_path: string;
  link_token: string;
  pecas: number | null;
  aberturas: number;
  primeira_abertura_em: string | null;
  ultima_abertura_em: string | null;
  imovel: string | null;
  owner: { name: string | null; email: string | null; phone?: string | null } | null;
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const BOTAO = "text-secondary-foreground/80 hover:bg-white/10";

/** Uma curadoria hospedada em HTML na lista da equipe: link, WhatsApp, troca do arquivo e publicação. */
export function LinhaCuradoriaHtml({
  curadoria: c,
  etiqueta,
  onMudou,
}: {
  curadoria: CuradoriaHtml;
  etiqueta: React.ReactNode;
  onMudou: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const publicada = c.status === "published" || c.status === "paid";
  const link = linkCuradoria(c.link_token);
  const whatsapp = whatsappDaCuradoria({ telefone: c.owner?.phone, nomeProprietario: c.owner?.name, imovel: c.imovel, token: c.link_token });

  const copiar = async () => {
    await navigator.clipboard.writeText(link);
    toast.success(publicada ? "Link copiado" : "Link copiado. Ele só abre para o proprietário depois de publicar.");
  };

  const alternarPublicacao = async () => {
    setTrabalhando(true);
    const { error } = await tabelaCuradorias()
      .update(publicada ? { status: "draft" } : { status: "published", published_at: c.published_at ?? new Date().toISOString() })
      .eq("id", c.id);
    setTrabalhando(false);
    if (error) {
      toast.error("Não consegui mudar a publicação");
      return;
    }
    toast.success(publicada ? "Proposta retirada: o link parou de abrir" : "Proposta publicada");
    onMudou();
  };

  const trocarArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (!/\.html?$/i.test(arquivo.name) || arquivo.size > MAX_ARQUIVO_CURADORIA) {
      toast.error("Escolha um .html de até 30 MB");
      return;
    }
    setTrabalhando(true);
    try {
      const dados = lerDadosDoArquivo(await arquivo.text());
      const caminho = await enviarArquivoCuradoria(c.link_token, arquivo);
      const { error } = await tabelaCuradorias()
        .update({
          html_path: caminho,
          source_filename: arquivo.name,
          ...(dados ? { pecas: dados.pecas, total_amount_cents: dados.totalCents } : {}),
        })
        .eq("id", c.id);
      if (error) throw error;
      // A versão antiga sai depois que a nova já está valendo; se falhar, sobra só um arquivo sem uso
      await supabase.storage.from(BUCKET_CURADORIAS).remove([c.html_path]);
      toast.success("Arquivo trocado. O link continua o mesmo.");
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui trocar o arquivo");
    } finally {
      setTrabalhando(false);
    }
  };

  const total = ((c.total_amount_cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[220px] flex-1 items-start gap-3">
          <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.title || "Proposta decorativa"}</span>
              {etiqueta}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary-foreground/60">
              {c.imovel && <span>{c.imovel}</span>}
              {c.pecas != null && <span>{c.pecas} peças</span>}
              {c.total_amount_cents != null && <span>{total} no Pix</span>}
              <span className={c.aberturas > 0 ? "font-semibold text-secondary-foreground/90" : undefined}>
                {c.aberturas > 0 && c.ultima_abertura_em
                  ? `Aberta ${c.aberturas === 1 ? "1 vez" : `${c.aberturas} vezes`} · última em ${dataHora(c.ultima_abertura_em)}`
                  : "Ainda não aberta"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <input
            ref={entrada}
            type="file"
            accept=".html,.htm,text/html"
            className="sr-only"
            aria-label={`Trocar o arquivo de ${c.title ?? "proposta"}`}
            onChange={(e) => {
              void trocarArquivo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="ghost" className={BOTAO} asChild>
            <a href={`/curadoria/${c.link_token}`} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir
            </a>
          </Button>
          <Button size="sm" variant="ghost" className={BOTAO} onClick={() => void copiar()}>
            <Copy className="mr-1 h-3.5 w-3.5" /> Link
          </Button>
          {whatsapp && publicada && (
            <Button size="sm" variant="ghost" className={BOTAO} asChild>
              <a href={whatsapp} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
              </a>
            </Button>
          )}
          <Button size="sm" variant="ghost" className={BOTAO} disabled={trabalhando} onClick={() => entrada.current?.click()}>
            {trabalhando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Trocar arquivo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={publicada ? BOTAO : "text-primary hover:bg-white/10"}
            disabled={trabalhando}
            onClick={() => void alternarPublicacao()}
          >
            {publicada ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
            {publicada ? "Retirar" : "Publicar"}
          </Button>
        </div>
      </div>
    </li>
  );
}
