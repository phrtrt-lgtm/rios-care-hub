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
import { CATEGORIA_AJUSTE, STATUS_AJUSTE } from "@/lib/ajusteMeta";
import type { Ajuste } from "@/hooks/useAjustes";
import { nomeCurto, quando } from "@/components/listas/formato";
import { SeloWhatsapp } from "@/components/listas/SeloWhatsapp";
import { MiniaturasAnexos } from "@/components/listas/MiniaturasAnexos";

interface Props {
  ajuste: Ajuste;
  /** Equipe: marca feito, sem mudança e reabre. */
  podeResolver: boolean;
  podeApagar: boolean;
  /** Quem avisou (na lista "seus avisos" é sempre a própria pessoa). */
  mostrarAutor?: boolean;
  /** Mostra a etiqueta "A fazer" também nos abertos. */
  mostrarStatusAberto?: boolean;
  /** Uma ação deste aviso está em andamento. */
  ocupado?: boolean;
  onFeito: () => void;
  onResolverComNota: (status: "feito" | "descartado") => void;
  onReabrir: () => void;
  onApagar: () => void;
  onAbrirFoto: (indice: number) => void;
  /** "Adicionar foto ou vídeo" no menu (equipe). */
  onAnexar?: () => void;
  anexando?: boolean;
}

/** Um aviso: imóvel, tipo, o que mudar, fotos, quem avisou e o que foi feito. */
export function CartaoAjuste({
  ajuste,
  podeResolver,
  podeApagar,
  mostrarAutor = true,
  mostrarStatusAberto = false,
  ocupado = false,
  onFeito,
  onResolverComNota,
  onReabrir,
  onApagar,
  onAbrirFoto,
  onAnexar,
  anexando = false,
}: Props) {
  const meta = CATEGORIA_AJUSTE[ajuste.categoria] ?? CATEGORIA_AJUSTE.outro;
  const Icone = meta.icone;
  const status = STATUS_AJUSTE[ajuste.status] ?? STATUS_AJUSTE.aberto;
  const aberto = ajuste.status === "aberto";
  const criado = quando(ajuste.created_at);
  const resolvido = ajuste.resolvido_em ? quando(ajuste.resolvido_em) : null;
  const nomeImovel = ajuste.imovel?.name ?? (ajuste.property_id ? "Imóvel" : "Geral");
  const temMenu = podeResolver || (podeApagar && !aberto);

  return (
    <article
      aria-label={`${meta.rotulo} · ${nomeImovel}`}
      className={cn(
        "rounded-xl border bg-card p-3.5 shadow-sm",
        aberto && ajuste.urgente ? "border-destructive/40" : "border-border/70",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TOM.neutral.caixa)}
          aria-hidden="true"
        >
          <Icone className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold leading-tight">{nomeImovel}</h3>
            <span className="text-xs text-muted-foreground">{meta.rotulo}</span>
            {aberto && ajuste.urgente && (
              <Etiqueta tom="destructive" solida>
                Urgente
              </Etiqueta>
            )}
            {(!aberto || mostrarStatusAberto) && (
              <Etiqueta tom={status.tom} ponto>
                {status.rotulo}
              </Etiqueta>
            )}
          </div>

          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            {ajuste.descricao}
          </p>

          <MiniaturasAnexos caminhos={ajuste.fotos} urls={ajuste.fotosUrls} onAbrir={onAbrirFoto} />

          {!aberto && (
            <div className={cn("mt-2.5 rounded-lg border px-3 py-2 text-xs", TOM[status.tom].fundo, TOM[status.tom].borda)}>
              <p className="font-medium">
                {status.rotulo}
                {ajuste.resolvido_por_nome && ` por ${nomeCurto(ajuste.resolvido_por_nome)}`}
                {resolvido && <span title={resolvido.completo}>{` · ${resolvido.relativo}`}</span>}
              </p>
              {ajuste.resposta && (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{ajuste.resposta}</p>
              )}
            </div>
          )}

          <div className="mt-2 flex min-h-8 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground" title={criado.completo}>
              {mostrarAutor && ajuste.autor_nome ? `${nomeCurto(ajuste.autor_nome)} · ` : ""}
              {criado.relativo}
              {mostrarAutor && aberto && (
                <SeloWhatsapp status={ajuste.notificacao_status} erro={ajuste.notificacao_erro} className="ml-1.5" />
              )}
            </p>

            <div className="flex shrink-0 items-center gap-1">
              {(ocupado || anexando) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Salvando" />}

              {aberto && podeResolver && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={onFeito}
                  className="h-8 gap-1 border-success/40 px-2.5 text-success hover:bg-success/10 hover:text-success"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Feito
                </Button>
              )}

              {!aberto && podeResolver && (
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

              {!podeResolver && podeApagar && aberto && (
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
                    {aberto && podeResolver && (
                      <>
                        <DropdownMenuItem onSelect={() => onResolverComNota("feito")}>
                          <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                          Feito, com observação…
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onResolverComNota("descartado")}>
                          <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                          Não precisa mudar…
                        </DropdownMenuItem>
                      </>
                    )}
                    {!aberto && podeResolver && (
                      <DropdownMenuItem onSelect={() => onResolverComNota(ajuste.status === "descartado" ? "descartado" : "feito")}>
                        <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                        {ajuste.resposta ? "Editar observação…" : "Adicionar observação…"}
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
                          Apagar aviso
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
