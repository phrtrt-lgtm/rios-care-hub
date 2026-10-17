import { Camera, Check, Loader2, MessageSquarePlus, MoreHorizontal, RotateCcw, Trash2, XCircle } from "lucide-react";
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
import { nomeCurto, quando } from "@/components/listas/formato";
import { MiniaturasAnexos } from "@/components/listas/MiniaturasAnexos";
import { STATUS_TAREFA, type TarefaRua } from "@/hooks/useTarefasRua";
import { EstadoImovel } from "@/components/listas/EstadoImovel";
import { SeloWhatsapp } from "@/components/listas/SeloWhatsapp";
import type { JanelaImovel } from "@/hooks/useJanelaImoveis";

interface Props {
  tarefa: TarefaRua;
  /** Estado do imóvel e próximo check-out (só quando a lista não agrupa por imóvel). */
  janela?: JanelaImovel;
  podeResolver: boolean;
  podeApagar: boolean;
  /** Nome do imóvel no cartão (dispensável quando a lista já agrupa por imóvel). */
  mostrarImovel?: boolean;
  mostrarAutor?: boolean;
  ocupado?: boolean;
  onFeita: () => void;
  onResolverComNota: (status: "feita" | "descartada") => void;
  onReabrir: () => void;
  onApagar: () => void;
  onAbrirAnexo?: (indice: number) => void;
  /** "Adicionar foto ou vídeo" no menu (equipe). */
  onAnexar?: () => void;
  /** Arquivos subindo para este item. */
  anexando?: boolean;
}

/** Uma tarefa de rua: o que fazer, onde, quem pediu e quem fez. */
export function CartaoTarefa({
  tarefa,
  janela,
  podeResolver,
  podeApagar,
  mostrarImovel = false,
  mostrarAutor = true,
  ocupado = false,
  onFeita,
  onResolverComNota,
  onReabrir,
  onApagar,
  onAbrirAnexo,
  onAnexar,
  anexando = false,
}: Props) {
  const status = STATUS_TAREFA[tarefa.status] ?? STATUS_TAREFA.pendente;
  const pendente = tarefa.status === "pendente";
  const criado = quando(tarefa.created_at);
  const resolvido = tarefa.resolvido_em ? quando(tarefa.resolvido_em) : null;
  const nomeImovel = tarefa.imovel?.name ?? (tarefa.property_id ? "Imóvel" : "Geral");
  const temMenu = podeResolver || (podeApagar && !pendente);

  return (
    <article aria-label={tarefa.descricao} className="rounded-xl border border-border/70 bg-card px-3.5 py-3 shadow-sm">
      {(mostrarImovel || !pendente) && (
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {mostrarImovel && <span className="text-xs font-semibold">{nomeImovel}</span>}
          {!pendente && (
            <Etiqueta tom={status.tom} ponto>
              {status.rotulo}
            </Etiqueta>
          )}
          {mostrarImovel && pendente && janela && <EstadoImovel janela={janela} variante="linha" />}
        </div>
      )}
      <p
        className={cn(
          "whitespace-pre-wrap break-words text-sm leading-relaxed",
          tarefa.status === "descartada" ? "text-muted-foreground line-through" : "text-foreground/90",
        )}
      >
        {tarefa.descricao}
      </p>

      <MiniaturasAnexos caminhos={tarefa.anexos} urls={tarefa.anexosUrls} onAbrir={(i) => onAbrirAnexo?.(i)} />

      {!pendente && (
        <div className={cn("mt-2 rounded-lg border px-3 py-2 text-xs", TOM[status.tom].fundo, TOM[status.tom].borda)}>
          <p className="font-medium">
            {status.rotulo}
            {tarefa.resolvido_por_nome && ` por ${nomeCurto(tarefa.resolvido_por_nome)}`}
            {resolvido && <span title={resolvido.completo}>{` · ${resolvido.relativo}`}</span>}
          </p>
          {tarefa.resposta && <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{tarefa.resposta}</p>}
        </div>
      )}

      <div className="mt-1.5 flex min-h-8 items-center justify-between gap-2">
        <p className="min-w-0 text-xs leading-snug text-muted-foreground" title={criado.completo}>
          {tarefa.responsavel_nome && pendente ? `Com ${nomeCurto(tarefa.responsavel_nome)} · ` : ""}
          {mostrarAutor && tarefa.autor_nome ? `pedido por ${nomeCurto(tarefa.autor_nome)} · ` : ""}
          {criado.relativo}
          {pendente && <SeloWhatsapp status={tarefa.notificacao_status} erro={tarefa.notificacao_erro} className="ml-1.5" />}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          {(ocupado || anexando) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Salvando" />}

          {pendente && podeResolver && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={onFeita}
              className="h-8 gap-1 border-success/40 px-2.5 text-success hover:bg-success/10 hover:text-success"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Feita
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
                {onAnexar && podeResolver && (
                  <DropdownMenuItem onSelect={onAnexar}>
                    <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
                    Adicionar foto ou vídeo
                  </DropdownMenuItem>
                )}
                {pendente && podeResolver && (
                  <>
                    <DropdownMenuItem onSelect={() => onResolverComNota("feita")}>
                      <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                      Feita, com observação…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onResolverComNota("descartada")}>
                      <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                      Não precisa…
                    </DropdownMenuItem>
                  </>
                )}
                {!pendente && podeResolver && (
                  <DropdownMenuItem
                    onSelect={() => onResolverComNota(tarefa.status === "descartada" ? "descartada" : "feita")}
                  >
                    <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                    {tarefa.resposta ? "Editar observação…" : "Adicionar observação…"}
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
                      Apagar tarefa
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
