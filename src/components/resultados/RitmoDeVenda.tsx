import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { RitmoMes } from "@/lib/resultadosAFrente";
import { nomeDoMes, pct } from "@/lib/resultadosImovel";
import { Cartao } from "./blocos";
import { COR, useNaTela } from "./graficos";

interface LinhaProps {
  rotulo: string;
  valor: number;
  cor: string;
  forte?: boolean;
  /** Risco na trilha: onde esse mesmo mês terminou no ano passado */
  marca?: number | null;
  visivel: boolean;
  atraso: number;
}

function Linha({ rotulo, valor, cor, forte, marca, visivel, atraso }: LinhaProps) {
  const f = Math.max(0, Math.min(1, valor));
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("w-[104px] shrink-0 truncate text-xs", forte ? "font-medium text-foreground" : "text-muted-foreground")}>{rotulo}</span>
      <div className="relative h-2.5 min-w-0 flex-1 rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: visivel ? `${f * 100}%` : 0, background: cor, transitionDelay: `${atraso}ms` }}
        />
        {marca != null && marca > 0 && (
          <span
            className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-foreground/55"
            style={{ left: `calc(${Math.min(1, marca) * 100}% - 1px)` }}
            aria-hidden="true"
          />
        )}
      </div>
      <span className={cn("w-10 shrink-0 text-right text-xs tabular-nums", forte ? "font-semibold" : "text-muted-foreground")}>{pct(valor)}</span>
    </div>
  );
}

function dataCurta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Quanto de cada um dos próximos meses já está reservado, lado a lado: o
 * imóvel, a média dos imóveis RIOS e o mercado em volta. O risco na barra do
 * mercado mostra onde ele terminou o mesmo mês no ano passado, para dar a
 * medida de quanto um mês ainda costuma encher.
 */
export function RitmoDeVenda({ id, meses }: { id?: string; meses: RitmoMes[] }) {
  const caixa = useRef<HTMLDivElement>(null);
  const visivel = useNaTela(caixa);
  if (meses.length === 0) return null;

  const temCarteira = meses.some((m) => m.carteira != null);
  const temMercado = meses.some((m) => m.mercado != null);
  const coleta = dataCurta(meses.find((m) => m.mercadoEm)?.mercadoEm ?? null);
  const ativos = meses.find((m) => m.imoveisNaCarteira)?.imoveisNaCarteira;

  return (
    <Cartao id={id} titulo="Ritmo de venda" subtitulo="Quanto de cada mês à frente já está reservado">
      <div ref={caixa} className="space-y-5">
        {meses.map((m, i) => {
          const nome = nomeDoMes(m.ano, m.mes0, false);
          return (
            <div key={m.chave} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-sm font-semibold first-letter:uppercase">{nome}</h4>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {m.noites} de {m.dias} noites
                </span>
              </div>
              <Linha rotulo="Seu imóvel" valor={m.imovel} cor={COR.serie1} forte visivel={visivel} atraso={i * 120} />
              {m.carteira != null && <Linha rotulo="Imóveis RIOS" valor={m.carteira} cor={COR.neutro} visivel={visivel} atraso={i * 120 + 60} />}
              {m.mercado != null && (
                <Linha rotulo="Mercado em volta" valor={m.mercado} cor={COR.serie2} marca={m.mercadoAnoPassado} visivel={visivel} atraso={i * 120 + 120} />
              )}
              {m.mercado != null && m.mercadoAnoPassado != null && (
                <p className="pl-[114px] text-[11px] leading-snug text-muted-foreground">
                  No ano passado o mercado fechou {nome} em {pct(m.mercadoAnoPassado)} <span aria-hidden="true">(o risco na barra)</span>.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {(temCarteira || temMercado) && (
        <p className="mt-4 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          {temMercado && `Mercado: imóveis vizinhos, pelo PriceLabs${coleta ? `, posição de ${coleta}` : ""}. `}
          {temCarteira && `Imóveis RIOS: média dos ${ativos ?? ""} imóveis ativos, hoje.`}
        </p>
      )}
    </Cartao>
  );
}
