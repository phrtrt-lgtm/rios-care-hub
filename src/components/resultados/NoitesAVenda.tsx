import { Suspense, useMemo, useState } from "react";
import { CalendarPlus, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lazyPage } from "@/lib/lazyPage";
import type { NoiteAFrente, NoitesAVenda as Venda } from "@/lib/resultadosAFrente";
import { diaDaSemana, formatarDiaExtenso, reais } from "@/lib/resultadosImovel";
import { Cartao } from "./blocos";

// O diálogo de bloqueio (datas, PIX, meus bloqueios) só baixa quando o proprietário abre.
const DialogoDeBloqueio = lazyPage(() => import("@/components/DateBlockRequestDialog").then((m) => ({ default: m.DateBlockRequestDialog })));

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const DIA_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

interface Props {
  id?: string;
  venda: Venda;
  hoje: number;
  imovel: { id: string; nome: string };
  /** O proprietário pode bloquear datas para uso próprio; a equipe só vê. */
  podeBloquear: boolean;
  onVerCalendario?: () => void;
}

function descrever(n: NoiteAFrente): string {
  const quando = `${DIA_DA_SEMANA[diaDaSemana(n.dia)]}, ${formatarDiaExtenso(n.dia)}`;
  if (n.situacao === "reservada") return `${quando}: reservada`;
  if (n.situacao === "fechada") return `${quando}: fechada no calendário (bloqueio ou dia de limpeza)`;
  const preco = n.precoCents != null ? `à venda por ${reais(n.precoCents)}` : "à venda, sem preço definido";
  const minimo = n.minimo && n.minimo > 1 ? `, mínimo de ${n.minimo} noites` : "";
  return `${quando}: ${preco}${minimo}`;
}

/**
 * Os próximos 30 dias, noite a noite: o que já está reservado, o que está
 * fechado e o que ainda está à venda, com o preço anunciado hoje. "À venda"
 * não é promessa de receita: o texto diz isso, e o preço muda com a procura.
 */
export function NoitesAVenda({ id, venda, hoje, imovel, podeBloquear, onVerCalendario }: Props) {
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const [bloqueando, setBloqueando] = useState(false);

  const { celulas, porDia } = useMemo(() => {
    const mapa = new Map(venda.noites.map((n) => [n.dia, n]));
    const ultimo = venda.noites[venda.noites.length - 1].dia;
    const inicio = hoje - diaDaSemana(hoje);
    const fim = ultimo + (6 - diaDaSemana(ultimo));
    const lista: number[] = [];
    for (let d = inicio; d <= fim; d++) lista.push(d);
    return { celulas: lista, porDia: mapa };
  }, [venda.noites, hoje]);

  const noite = escolhida != null ? porDia.get(escolhida) : undefined;

  return (
    <Cartao id={id} titulo="Noites à venda" subtitulo="Os próximos 30 dias, com o preço anunciado hoje">
      <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
        <div>
          <p className="text-[34px] font-semibold leading-none tracking-tight tabular-nums">{venda.aVenda}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{venda.aVenda === 1 ? "noite à venda" : "noites à venda"}</p>
        </div>
        {venda.valorCents > 0 && (
          <div>
            <p className="text-xl font-semibold leading-none tracking-tight tabular-nums">{reais(venda.valorCents)}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">se todas saírem pelo preço de hoje</p>
          </div>
        )}
        <p className="ml-auto text-right text-xs leading-relaxed text-muted-foreground">
          {venda.reservadas} {venda.reservadas === 1 ? "reservada" : "reservadas"}
          {venda.fechadas > 0 && (
            <>
              <br />
              {venda.fechadas} {venda.fechadas === 1 ? "fechada" : "fechadas"}
            </>
          )}
        </p>
      </div>

      <div className="mt-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted-foreground" aria-hidden="true">
          {SEMANA.map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {celulas.map((d) => {
            const n = porDia.get(d);
            if (!n) return <span key={d} className="h-11 rounded-lg" aria-hidden="true" />;
            const dia = formatarDiaExtenso(d).split(" ")[0];
            return (
              <button
                key={d}
                type="button"
                onClick={() => setEscolhida(d)}
                onMouseEnter={() => setEscolhida(d)}
                aria-label={descrever(n)}
                aria-pressed={escolhida === d}
                className={cn(
                  "relative flex h-11 flex-col items-center justify-center rounded-lg text-center transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card motion-safe:hover:scale-[1.06]",
                  n.situacao === "reservada" && "bg-primary text-primary-foreground",
                  n.situacao === "a_venda" && "border border-border bg-background",
                  n.situacao === "fechada" && "bg-muted text-muted-foreground",
                  d === hoje && "ring-2 ring-foreground/70 ring-offset-1 ring-offset-card",
                  escolhida === d && d !== hoje && "ring-2 ring-ring ring-offset-1 ring-offset-card",
                )}
              >
                <span className={cn("text-[10px] leading-none", n.situacao === "a_venda" ? "text-muted-foreground" : "opacity-80")}>{dia}</span>
                {n.situacao === "a_venda" && (
                  <span className="mt-0.5 text-[11px] font-semibold leading-none tabular-nums">
                    {n.precoCents != null ? Math.round(n.precoCents / 100).toLocaleString("pt-BR") : "—"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 min-h-[2.25rem] text-xs leading-snug text-muted-foreground first-letter:uppercase" role="status">
        {noite ? descrever(noite) : "Toque numa noite para ver o preço. Valores em reais, por noite."}
      </p>

      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] border border-border bg-background" aria-hidden="true" />À venda
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-primary" aria-hidden="true" />
          Reservada
        </li>
        {venda.fechadas > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-muted" aria-hidden="true" />
            Fechada
          </li>
        )}
      </ul>

      <p className="mt-3 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
        O preço é o anunciado hoje e muda com a procura. Noite à venda não é receita garantida.
      </p>

      {(podeBloquear || onVerCalendario) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {podeBloquear && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setBloqueando(true)}>
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Bloquear para uso próprio
            </Button>
          )}
          {onVerCalendario && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={onVerCalendario}>
              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
              Ver o calendário
            </Button>
          )}
        </div>
      )}

      {bloqueando && (
        <Suspense fallback={null}>
          <DialogoDeBloqueio open onOpenChange={(aberto: boolean) => !aberto && setBloqueando(false)} propertyId={imovel.id} propertyName={imovel.nome} />
        </Suspense>
      )}
    </Cartao>
  );
}
