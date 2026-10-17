import { Check, ExternalLink, Loader2, MessageSquarePlus, MoreHorizontal, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { TOM } from "@/components/painel/tons";
import { cn } from "@/lib/utils";
import { STATUS_COMPRA, lojaDoLink } from "@/lib/compraMeta";
import { nomeCurto, quando } from "@/components/listas/formato";
import type { Compra } from "@/hooks/useCompras";

interface Props {
  compra: Compra;
  podeResolver: boolean;
  podeApagar: boolean;
  /** Nome do imóvel no cartão (dispensável quando a lista já agrupa por imóvel). */
  mostrarImovel?: boolean;
  mostrarAutor?: boolean;
  mostrarStatusPendente?: boolean;
  ocupado?: boolean;
  onComprado: () => void;
  onResolverComNota: (status: "comprado" | "descartado") => void;
  onReabrir: () => void;
  onApagar: () => void;
}

/** Um item da lista: o que comprar, quantos, onde comprar e quem pediu. */
export function CartaoCompra({
  compra,
  podeResolver,
  podeApagar,
  mostrarImovel = false,
  mostrarAutor = true,
  mostrarStatusPendente = false,
  ocupado = false,
  onComprado,
  onResolverComNota,
  onReabrir,
  onApagar,
}: Props) {
  const status = STATUS_COMPRA[compra.status] ?? STATUS_COMPRA.pendente;
  const pendente = compra.status === "pendente";
  const criado = quando(compra.created_at);
  const resolvido = compra.resolvido_em ? quando(compra.resolvido_em) : null;
  const nomeImovel = compra.imovel?.name ?? (compra.property_id ? "Imóvel" : "Geral");
  const temMenu = podeResolver || (podeApagar && !pendente);

  return (
    <article aria-label={compra.item} className="rounded-xl border border-border/70 bg-card px-3.5 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className={cn("min-w-0 break-words text-sm font-semibold leading-snug", compra.status === "descartado" && "text-muted-foreground line-through")}>
          {compra.item}
        </h3>
        {compra.quantidade > 1 && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground/80">
            × {compra.quantidade}
          </span>
        )}
        {mostrarImovel && <span className="text-xs text-muted-foreground">{nomeImovel}</span>}
        {(!pendente || mostrarStatusPendente) && (
          <Etiqueta tom={status.tom} ponto>
            {status.rotulo}
          </Etiqueta>
        )}
      </div>

      {compra.link && (
        <a
          href={compra.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Ver na loja · {lojaDoLink(compra.link)}</span>
        </a>
      )}

      {!pendente && (
        <div className={cn("mt-2 rounded-lg border px-3 py-2 text-xs", TOM[status.tom].fundo, TOM[status.tom].borda)}>
          <p className="font-medium">
            {status.rotulo}
            {compra.resolvido_por_nome && ` por ${nomeCurto(compra.resolvido_por_nome)}`}
            {resolvido && <span title={resolvido.completo}>{` · ${resolvido.relativo}`}</span>}
          </p>
          {compra.resposta && <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{compra.resposta}</p>}
        </div>
      )}

      <div className="mt-1.5 flex min-h-8 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground" title={criado.completo}>
          {mostrarAutor && compra.autor_nome ? `${nomeCurto(compra.autor_nome)} · ` : ""}
          {criado.relativo}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          {ocupado && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Salvando" />}

          {pendente && podeResolver && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={onComprado}
              className="h-8 gap-1 border-success/40 px-2.5 text-success hover:bg-success/10 hover:text-success"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Comprado
            </Button>
          )}

          {!pendente && podeResolver && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={ocupado}
              onClick={onReabrir}
              className="h-8 gap-1 px-2.5 text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reabrir
            </Button>
          )}

          {!podeResolver && podeApagar && pendente && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={ocupado}
              onClick={onApagar}
              className="h-8 gap-1 px-2.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Apagar
            </Button>
          )}

          {temMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={ocupado}
                  aria-label="Mais ações"
                  className="h-8 w-8 text-muted-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {pendente && podeResolver && (
                  <>
                    <DropdownMenuItem onSelect={() => onResolverComNota("comprado")}>
                      <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                      Comprado, com observação…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onResolverComNota("descartado")}>
                      <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                      Não vai comprar…
                    </DropdownMenuItem>
                  </>
                )}
                {!pendente && podeResolver && (
                  <DropdownMenuItem
                    onSelect={() => onResolverComNota(compra.status === "descartado" ? "descartado" : "comprado")}
                  >
                    <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                    {compra.resposta ? "Editar observação…" : "Adicionar observação…"}
                  </DropdownMenuItem>
                )}
                {podeApagar && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={onApagar}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Apagar pedido
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </article>
  );
}
