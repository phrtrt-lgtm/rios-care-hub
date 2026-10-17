import { useRef, useState, type FormEvent } from "react";
import { Loader2, Send, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CATEGORIA_AJUSTE,
  DESCRICAO_MAX,
  DESCRICAO_MIN,
  ORDEM_CATEGORIA_AJUSTE,
  type CategoriaAjuste,
} from "@/lib/ajusteMeta";
import { enviarAjuste } from "@/lib/enviarAjuste";
import { erroDeAnexo } from "@/lib/anexosListas";
import { EscolherAnexos } from "@/components/listas/EscolherAnexos";
import type { ImovelAjuste } from "@/hooks/useAjustes";
import { SeletorImovel } from "@/components/listas/SeletorImovel";
import { IMOVEL_GERAL, imovelEhValido } from "@/components/listas/imovel";

interface Props {
  autorId: string;
  imoveis: ImovelAjuste[];
  carregandoImoveis: boolean;
  /** A faxineira só enxerga os imóveis dela; o "geral" vira "outro imóvel". */
  ehFaxineira: boolean;
  imovelInicial?: string | null;
  categoriaInicial?: CategoriaAjuste | null;
  onEnviado?: () => void;
  /** Botão de fechar no celular (a equipe abre o formulário só quando precisa). */
  onFechar?: () => void;
  className?: string;
}

/**
 * Formulário de aviso: imóvel, onde está o erro, o que mudar, foto e urgência.
 *
 * Feito para o celular da faxineira: botões grandes, nada obrigatório além do
 * imóvel, do tipo e de uma frase. Depois de enviar, o imóvel continua
 * escolhido (é comum avisar duas coisas da mesma casa).
 */
export function FormularioAjuste({
  autorId,
  imoveis,
  carregandoImoveis,
  ehFaxineira,
  imovelInicial = null,
  categoriaInicial = null,
  onEnviado,
  onFechar,
  className,
}: Props) {
  const queryClient = useQueryClient();
  const [imovel, setImovel] = useState<string | null>(imovelInicial);
  const [categoria, setCategoria] = useState<CategoriaAjuste | null>(categoriaInicial);
  const [descricao, setDescricao] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const campoDescricao = useRef<HTMLTextAreaElement>(null);

  const imovelValido = imovelEhValido(imovel, imoveis);

  const erroImovel = tentouEnviar && !imovelValido;
  const erroCategoria = tentouEnviar && !categoria;
  const erroDescricao = tentouEnviar && descricao.trim().length < DESCRICAO_MIN;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setTentouEnviar(true);
    if (!imovelValido || !categoria || descricao.trim().length < DESCRICAO_MIN) {
      if (imovelValido && categoria) campoDescricao.current?.focus();
      return;
    }

    setEnviando(true);
    try {
      await enviarAjuste({
        autorId,
        propertyId: imovel === IMOVEL_GERAL ? null : imovel,
        categoria,
        descricao,
        urgente,
        fotos,
      });
      toast.success(urgente ? "Aviso urgente enviado. Obrigado!" : "Aviso enviado. Obrigado!");
      setFotos([]);
      setDescricao("");
      setUrgente(false);
      setCategoria(null);
      setTentouEnviar(false);
      queryClient.invalidateQueries({ queryKey: ["ajustes"] });
      onEnviado?.();
    } catch (erro) {
      console.error("[ajustes] erro ao enviar:", erro);
      toast.error(erroDeAnexo(erro));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-labelledby="titulo-novo-ajuste"
      className={cn("space-y-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm", className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="titulo-novo-ajuste" className="text-[15px] font-semibold tracking-tight">
            Avisar um ajuste
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Viu algo errado? Conte aqui. Fica na lista até alguém arrumar.
          </p>
        </div>
        {onFechar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onFechar}
            aria-label="Fechar formulário"
            className="-mr-1.5 -mt-1.5 h-8 w-8 shrink-0 text-muted-foreground lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <SeletorImovel
        id="imovel-ajuste"
        valor={imovel}
        onChange={setImovel}
        imoveis={imoveis}
        carregando={carregandoImoveis}
        ehFaxineira={ehFaxineira}
        erro={erroImovel}
      />

      {/* Onde está o erro */}
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-sm font-medium leading-none">O que está errado?</legend>
        <div className="flex flex-wrap gap-1.5">
          {ORDEM_CATEGORIA_AJUSTE.map((chave) => {
            const meta = CATEGORIA_AJUSTE[chave];
            const Icone = meta.icone;
            const ativa = categoria === chave;
            return (
              <button
                key={chave}
                type="button"
                aria-pressed={ativa}
                onClick={() => setCategoria(chave)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativa
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border/70 bg-background text-foreground/80 hover:bg-muted",
                  erroCategoria && "border-destructive/50",
                )}
              >
                <Icone className="h-4 w-4" aria-hidden="true" />
                {meta.rotulo}
              </button>
            );
          })}
        </div>
        <p className={cn("text-xs", erroCategoria ? "text-destructive" : "text-muted-foreground")}>
          {erroCategoria
            ? "Escolha uma das opções."
            : categoria
              ? CATEGORIA_AJUSTE[categoria].dica
              : "Escolha a que mais se parece."}
        </p>
      </fieldset>

      {/* Descrição */}
      <div className="space-y-1.5">
        <Label htmlFor="ajuste-descricao">O que precisa mudar?</Label>
        <Textarea
          id="ajuste-descricao"
          ref={campoDescricao}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={4}
          maxLength={DESCRICAO_MAX}
          placeholder={categoria ? CATEGORIA_AJUSTE[categoria].exemplo : "Conte o que viu e como deveria ser."}
          aria-invalid={erroDescricao || undefined}
          className={cn("min-h-[96px] resize-y text-sm", erroDescricao && "border-destructive")}
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={erroDescricao ? "text-destructive" : "text-muted-foreground"}>
            {erroDescricao ? "Escreva o que precisa ajustar." : "Quanto mais detalhe, mais rápido se arruma."}
          </span>
          {descricao.length > DESCRICAO_MAX - 200 && (
            <span className="tabular-nums text-muted-foreground">
              {descricao.length}/{DESCRICAO_MAX}
            </span>
          )}
        </div>
      </div>

      {/* Fotos e vídeos */}
      <EscolherAnexos arquivos={fotos} onChange={setFotos} rotulo="Foto, print ou vídeo" />

      {/* Urgência */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors",
          urgente ? "border-destructive/40 bg-destructive/5" : "border-border/70",
        )}
      >
        <Label htmlFor="ajuste-urgente" className="min-w-0 cursor-pointer">
          <span className="block text-sm font-medium">Urgente</span>
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            Atrapalha um hóspede que já vai chegar.
          </span>
        </Label>
        <Switch id="ajuste-urgente" checked={urgente} onCheckedChange={setUrgente} />
      </div>

      <Button type="submit" size="lg" className="w-full gap-2 px-4" disabled={enviando}>
        {enviando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Enviando…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" aria-hidden="true" />
            Enviar aviso
          </>
        )}
      </Button>

    </form>
  );
}
