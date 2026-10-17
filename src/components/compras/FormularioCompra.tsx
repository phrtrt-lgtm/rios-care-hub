import { useRef, useState, type FormEvent } from "react";
import { Globe, Link2, Loader2, Minus, Plus, ShoppingCart, Store, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SeletorImovel } from "@/components/listas/SeletorImovel";
import { IMOVEL_GERAL, imovelEhValido, type ImovelOpcao } from "@/components/listas/imovel";
import { CANAL_COMPRA, CUSTO_COMPRA, ITEM_MAX, ITEM_MIN, QUANTIDADE_MAX, lojaDoLink, normalizarLink, type CanalCompra, type CustoCompra } from "@/lib/compraMeta";
import { useCriarCompra } from "@/hooks/useCompras";
import { useAuth } from "@/hooks/useAuth";
import { erroDeAnexo } from "@/lib/anexosListas";
import { EscolherAnexos } from "@/components/listas/EscolherAnexos";

interface Props {
  imoveis: ImovelOpcao[];
  carregandoImoveis: boolean;
  ehFaxineira: boolean;
  imovelInicial?: string | null;
  onEnviado?: () => void;
  /** Botão de fechar no celular (a equipe abre o formulário só quando precisa). */
  onFechar?: () => void;
  className?: string;
}

/**
 * Pedido de compra: imóvel, item, quantidade e o link do produto.
 *
 * Depois de adicionar, o imóvel continua escolhido e o foco volta para o item:
 * é comum pedir várias coisas para a mesma casa em seguida.
 */
export function FormularioCompra({
  imoveis,
  carregandoImoveis,
  ehFaxineira,
  imovelInicial = null,
  onEnviado,
  onFechar,
  className,
}: Props) {
  const criar = useCriarCompra();
  const { user } = useAuth();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [imovel, setImovel] = useState<string | null>(imovelInicial);
  const [item, setItem] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [link, setLink] = useState("");
  const [canal, setCanal] = useState<CanalCompra>("rua");
  // Colar um link sugere "Online", até a pessoa escolher por conta própria.
  const [canalEscolhido, setCanalEscolhido] = useState(false);
  // Quem paga: imóvel escolhido sugere o proprietário; "geral" sugere a gestão.
  const [custoEscolhido, setCustoEscolhido] = useState<CustoCompra | null>(null);
  const custo: CustoCompra = custoEscolhido ?? (imovel && imovel !== IMOVEL_GERAL ? "owner" : "pm");
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const campoItem = useRef<HTMLInputElement>(null);

  const imovelValido = imovelEhValido(imovel, imoveis);
  const linkNormalizado = normalizarLink(link);
  const erroImovel = tentouEnviar && !imovelValido;
  const erroItem = tentouEnviar && item.trim().length < ITEM_MIN;
  // Link inválido aparece logo, sem esperar o envio: quem colou quer saber na hora.
  const erroLink = link.trim() !== "" && linkNormalizado === undefined;

  const mudarQuantidade = (delta: number) =>
    setQuantidade((q) => Math.min(QUANTIDADE_MAX, Math.max(1, q + delta)));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setTentouEnviar(true);
    if (!user || !imovelValido || item.trim().length < ITEM_MIN || erroLink) {
      if (imovelValido) campoItem.current?.focus();
      return;
    }
    try {
      await criar.mutateAsync({
        propertyId: imovel === IMOVEL_GERAL ? null : imovel,
        item,
        quantidade,
        link: linkNormalizado ?? null,
        canal,
        custo,
        autorId: user.id,
        arquivos,
      });
      toast.success("Adicionado à lista de compras");
      setItem("");
      setQuantidade(1);
      setLink("");
      setArquivos([]);
      setCanal("rua");
      setCanalEscolhido(false);
      setCustoEscolhido(null);
      setTentouEnviar(false);
      campoItem.current?.focus();
      onEnviado?.();
    } catch (erro) {
      console.error("[compras] erro ao adicionar:", erro);
      toast.error(erroDeAnexo(erro));
    }
  };

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-labelledby="titulo-nova-compra"
      className={cn("space-y-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm", className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="titulo-nova-compra" className="text-[15px] font-semibold tracking-tight">
            Adicionar à lista
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">O que precisa comprar, para qual imóvel e onde comprar.</p>
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
        id="imovel-compra"
        valor={imovel}
        onChange={setImovel}
        imoveis={imoveis}
        carregando={carregandoImoveis}
        ehFaxineira={ehFaxineira}
        erro={erroImovel}
        rotuloGeralEquipe="Geral (estoque ou vários imóveis)"
        ondeDizerOutro="no item"
      />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="compra-item">Item</Label>
          <Input
            id="compra-item"
            ref={campoItem}
            value={item}
            onChange={(e) => setItem(e.target.value)}
            maxLength={ITEM_MAX}
            placeholder="Ex.: jogo de lençol casal"
            autoComplete="off"
            aria-invalid={erroItem || undefined}
            className={cn("h-11", erroItem && "border-destructive")}
          />
        </div>
        <div className="space-y-1.5">
          <Label id="compra-quantidade-rotulo">Qtd.</Label>
          <div className="flex h-11 items-center rounded-md border border-input" role="group" aria-labelledby="compra-quantidade-rotulo">
            <button
              type="button"
              onClick={() => mudarQuantidade(-1)}
              disabled={quantidade <= 1}
              aria-label="Diminuir quantidade"
              className="flex h-full w-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="w-7 text-center text-sm font-medium tabular-nums" aria-live="polite">
              {quantidade}
            </span>
            <button
              type="button"
              onClick={() => mudarQuantidade(1)}
              disabled={quantidade >= QUANTIDADE_MAX}
              aria-label="Aumentar quantidade"
              className="flex h-full w-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {erroItem && <p className="-mt-2 text-xs text-destructive">Escreva o que precisa comprar.</p>}

      <div className="space-y-1.5">
        <Label htmlFor="compra-link">
          Link do produto <span className="font-normal text-muted-foreground">(se tiver)</span>
        </Label>
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="compra-link"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              if (!canalEscolhido) setCanal(normalizarLink(e.target.value) ? "online" : "rua");
            }}
            inputMode="url"
            autoComplete="off"
            placeholder="Cole aqui o link da loja"
            aria-invalid={erroLink || undefined}
            className={cn("h-11 pl-9", erroLink && "border-destructive")}
          />
        </div>
        <p className={cn("text-xs", erroLink ? "text-destructive" : "text-muted-foreground")}>
          {erroLink
            ? "Isso não parece um link. Copie o endereço da página do produto."
            : linkNormalizado
              ? `Loja: ${lojaDoLink(linkNormalizado)}`
              : "Amazon, Mercado Livre, Shopee… Pode colar a mensagem inteira de compartilhar."}
        </p>
      </div>

      <EscolherAnexos arquivos={arquivos} onChange={setArquivos} rotulo="Foto ou vídeo do objeto ou do problema" />

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-sm font-medium leading-none">Onde comprar</legend>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Onde comprar">
          {(Object.keys(CANAL_COMPRA) as CanalCompra[]).map((c) => {
            const ativo = canal === c;
            const Icone = c === "rua" ? Store : Globe;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => {
                  setCanal(c);
                  setCanalEscolhido(true);
                }}
                className={cn(
                  "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border/70 bg-background text-foreground/80 hover:bg-muted",
                )}
              >
                <Icone className="h-4 w-4" aria-hidden="true" />
                {CANAL_COMPRA[c].rotulo}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{CANAL_COMPRA[canal].dica}. Quem compra recebe aviso no WhatsApp.</p>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-sm font-medium leading-none">Quem paga</legend>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Quem paga">
          {(Object.keys(CUSTO_COMPRA) as CustoCompra[]).map((c) => {
            const ativo = custo === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setCustoEscolhido(c)}
                className={cn(
                  "h-10 rounded-lg border text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border/70 bg-background text-foreground/80 hover:bg-muted",
                )}
              >
                {CUSTO_COMPRA[c].rotulo}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {custo === "owner"
            ? "Ao marcar como comprado, abre a cobrança ao proprietário já preenchida."
            : custo === "guest"
              ? "Fica registrado que o custo é do hóspede."
              : "A gestão paga; não vira cobrança."}
        </p>
      </fieldset>

      <Button type="submit" size="lg" className="w-full gap-2 px-4" disabled={criar.isPending}>
        {criar.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {arquivos.length > 0 ? "Enviando arquivos…" : "Adicionando…"}
          </>
        ) : (
          <>
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            Adicionar à lista
          </>
        )}
      </Button>
    </form>
  );
}
