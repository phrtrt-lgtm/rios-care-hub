import { useEffect, useRef, useState, type FormEvent } from "react";
import { Building2, Camera, Check, ChevronsUpDown, Globe2, ImageIcon, Loader2, Send, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  CATEGORIA_AJUSTE,
  DESCRICAO_MAX,
  DESCRICAO_MIN,
  FOTOS_MAX,
  ORDEM_CATEGORIA_AJUSTE,
  type CategoriaAjuste,
} from "@/lib/ajusteMeta";
import { enviarAjuste } from "@/lib/enviarAjuste";
import type { ImovelAjuste } from "@/hooks/useAjustes";

/** Valor do seletor para "não é de um imóvel só" (grava property_id nulo). */
export const IMOVEL_GERAL = "geral";

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

interface FotoEscolhida {
  arquivo: File;
  url: string;
}

function mensagemDeErro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro ?? "");
  if (/mime|type .* not supported/i.test(texto)) return "Esse formato de imagem não é aceito. Envie JPG, PNG ou um print.";
  if (/size|too large|exceed/i.test(texto)) return "Uma das fotos é grande demais. Tente com outra.";
  return "Não foi possível enviar o aviso. Confira a internet e tente de novo.";
}

/** Miniatura da foto escolhida; HEIC não abre no navegador e vira ícone. */
function MiniaturaLocal({ url }: { url: string }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <ImageIcon className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  }
  return <img src={url} alt="" className="h-full w-full object-cover" onError={() => setFalhou(true)} />;
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
  const [fotos, setFotos] = useState<FotoEscolhida[]>([]);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const inputFotos = useRef<HTMLInputElement>(null);
  const campoDescricao = useRef<HTMLTextAreaElement>(null);

  const imovelValido = imovel === IMOVEL_GERAL || imoveis.some((i) => i.id === imovel);
  const rotuloGeral = ehFaxineira ? "Outro imóvel ou geral" : "Geral (vale para todos)";
  const nomeImovel = imovel === IMOVEL_GERAL ? rotuloGeral : imoveis.find((i) => i.id === imovel)?.name;

  // Faxineira com uma casa só: já vem escolhida.
  useEffect(() => {
    if (ehFaxineira && imovel === null && !carregandoImoveis && imoveis.length === 1) {
      setImovel(imoveis[0].id);
    }
  }, [ehFaxineira, imovel, carregandoImoveis, imoveis]);

  // As miniaturas usam URL local; libera ao sair da página.
  const fotosAtuais = useRef(fotos);
  fotosAtuais.current = fotos;
  useEffect(() => () => fotosAtuais.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  const erroImovel = tentouEnviar && !imovelValido;
  const erroCategoria = tentouEnviar && !categoria;
  const erroDescricao = tentouEnviar && descricao.trim().length < DESCRICAO_MIN;

  const escolherImovel = (valor: string) => {
    setImovel(valor);
    setSeletorAberto(false);
  };

  const escolherFotos = (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    const novas = Array.from(lista).filter(
      (f) => (f.type || "").startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name || ""),
    );
    const vagas = FOTOS_MAX - fotos.length;
    if (novas.length > vagas) toast.info(`Até ${FOTOS_MAX} fotos por aviso.`);
    setFotos((atuais) => [
      ...atuais,
      ...novas.slice(0, Math.max(0, vagas)).map((arquivo) => ({ arquivo, url: URL.createObjectURL(arquivo) })),
    ]);
    if (inputFotos.current) inputFotos.current.value = "";
  };

  const tirarFoto = (indice: number) => {
    setFotos((atuais) => {
      const saindo = atuais[indice];
      if (saindo) URL.revokeObjectURL(saindo.url);
      return atuais.filter((_, i) => i !== indice);
    });
  };

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
        fotos: fotos.map((f) => f.arquivo),
      });
      toast.success(urgente ? "Aviso urgente enviado. Obrigado!" : "Aviso enviado. Obrigado!");
      fotos.forEach((f) => URL.revokeObjectURL(f.url));
      setFotos([]);
      setDescricao("");
      setUrgente(false);
      setCategoria(null);
      setTentouEnviar(false);
      queryClient.invalidateQueries({ queryKey: ["ajustes"] });
      onEnviado?.();
    } catch (erro) {
      console.error("[ajustes] erro ao enviar:", erro);
      toast.error(mensagemDeErro(erro));
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

      {/* Imóvel */}
      <div className="space-y-1.5">
        <Label id="rotulo-imovel-ajuste">Imóvel</Label>
        <Button
          type="button"
          variant="outline"
          aria-labelledby="rotulo-imovel-ajuste"
          aria-haspopup="dialog"
          aria-invalid={erroImovel || undefined}
          onClick={() => setSeletorAberto(true)}
          className={cn("h-11 w-full justify-between px-3 font-normal", erroImovel && "border-destructive")}
        >
          <span className="flex min-w-0 items-center gap-2">
            {imovel === IMOVEL_GERAL ? (
              <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className={cn("truncate", !nomeImovel && "text-muted-foreground")}>
              {nomeImovel ?? (carregandoImoveis ? "Carregando imóveis…" : "Escolher imóvel")}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
        {erroImovel && <p className="text-xs text-destructive">Escolha o imóvel.</p>}
      </div>

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

      {/* Fotos */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium leading-none">
          Foto ou print <span className="font-normal text-muted-foreground">(se tiver)</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {fotos.map((foto, i) => (
            <div key={foto.url} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/70 bg-muted">
              <MiniaturaLocal url={foto.url} />
              <button
                type="button"
                onClick={() => tirarFoto(i)}
                aria-label={`Tirar a foto ${i + 1}`}
                className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/75 text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          {fotos.length < FOTOS_MAX && (
            <Button
              type="button"
              variant="outline"
              onClick={() => inputFotos.current?.click()}
              className="h-16 gap-1.5 border-dashed px-3 text-xs"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              {fotos.length === 0 ? "Adicionar" : "Mais uma"}
            </Button>
          )}
        </div>
        <input
          ref={inputFotos}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => escolherFotos(e.target.files)}
        />
      </div>

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

      <Dialog open={seletorAberto} onOpenChange={setSeletorAberto}>
        <DialogContent className="max-w-md overflow-hidden p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>Qual imóvel?</DialogTitle>
            <DialogDescription>
              {ehFaxineira
                ? "Estes são os seus imóveis. Se não estiver aqui, escolha “Outro imóvel ou geral” e diga qual na descrição."
                : "Escolha “Geral” quando vale para todos os imóveis."}
            </DialogDescription>
          </DialogHeader>
          <Command>
            {imoveis.length > 6 && <CommandInput placeholder="Buscar imóvel..." />}
            <CommandList className="max-h-80">
              <CommandEmpty>Nenhum imóvel encontrado.</CommandEmpty>
              <CommandGroup>
                <CommandItem value={rotuloGeral} onSelect={() => escolherImovel(IMOVEL_GERAL)} className="gap-2">
                  <Globe2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{rotuloGeral}</span>
                  {imovel === IMOVEL_GERAL && <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" />}
                </CommandItem>
              </CommandGroup>
              {imoveis.length > 0 && <CommandSeparator />}
              {imoveis.length > 0 && (
                <CommandGroup heading="Imóveis">
                  {imoveis.map((i) => (
                    <CommandItem key={i.id} value={i.name} onSelect={() => escolherImovel(i.id)} className="gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{i.name}</span>
                      {imovel === i.id && <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </form>
  );
}
