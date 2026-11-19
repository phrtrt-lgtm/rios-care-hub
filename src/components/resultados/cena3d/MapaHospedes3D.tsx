import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { nomeDaUf, pct, type OrigemUf } from "@/lib/resultadosImovel";
import { MapaBrasil } from "../MapaBrasil";
import { criarCenaMapa, type ApontadoNoMapa, type CenaMapa } from "./mapaCena";

interface Props {
  ufs: OrigemUf[];
  /** Estado do imóvel: as rotas chegam nele. Sem ele, o mapa fica só com os blocos. */
  destino: string | null;
  /** Estado em foco na lista ao lado */
  emFoco?: string | null;
  className?: string;
}

/**
 * O mapa em blocos de "De onde vêm os hóspedes", em 3D: a altura de cada estado
 * é o número de reservas e as rotas correm até o estado do imóvel. Gira com o
 * dedo e mostra o estado ao toque. Os números continuam na lista ao lado.
 *
 * Traz o three.js: carregue sempre por `lazyPage`.
 */
export default function MapaHospedes3D({ ufs, destino, emFoco, className }: Props) {
  const reduzido = useReducedMotion();
  const caixa = useRef<HTMLDivElement>(null);
  const rotulos = useRef<Record<string, HTMLElement | null>>({});
  const dicaRef = useRef<HTMLDivElement>(null);
  const cena = useRef<CenaMapa | null>(null);
  const dados = useRef({ ufs, destino });
  const [dica, setDica] = useState<ApontadoNoMapa | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const nova = criarCenaMapa(el, {
      reduzido: !!reduzido,
      ufs: dados.current.ufs,
      destino: dados.current.destino,
      rotulos,
      dica: dicaRef,
      aoApontar: setDica,
    });
    if (!nova) {
      setFalhou(true);
      return;
    }
    cena.current = nova;
    const aoTocarFora = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) nova.soltar();
    };
    document.addEventListener("pointerdown", aoTocarFora);
    return () => {
      document.removeEventListener("pointerdown", aoTocarFora);
      nova.destruir();
      cena.current = null;
      setDica(null);
    };
  }, [reduzido]);

  useEffect(() => {
    if (dados.current.ufs === ufs && dados.current.destino === destino) return;
    dados.current = { ufs, destino };
    cena.current?.atualizar(ufs, destino);
  }, [ufs, destino]);

  useEffect(() => {
    cena.current?.destacar(emFoco ?? null);
  }, [emFoco]);

  if (falhou) return <MapaBrasil ufs={ufs} className={cn("px-3", className)} />;

  const maximo = Math.max(1, ...ufs.map((u) => u.reservas));
  const apontado = dica ? ufs.find((u) => u.uf === dica.uf) : undefined;
  const resumo =
    ufs.length > 0
      ? ufs
          .slice(0, 5)
          .map((u) => `${u.nome} ${u.reservas}`)
          .join(", ")
      : "sem origem informada";

  return (
    <div className={cn("relative select-none", className)}>
      <div ref={caixa} role="img" aria-label={`Mapa do Brasil em 3D com a origem dos hóspedes: ${resumo}`} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0">
        {ufs
          .filter((u) => u.uf !== destino)
          .map((u) => (
            <span
              key={u.uf}
              ref={(el) => {
                rotulos.current[u.uf] = el;
              }}
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-0 text-[9px] font-bold leading-none opacity-0 transition-opacity duration-200",
                // bloco claro (poucas reservas) pede letra escura, como no mapa plano
                0.42 + 0.58 * (u.reservas / maximo) >= 0.75 ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {u.uf}
            </span>
          ))}

        {/* o estado do imóvel leva a casinha no lugar da sigla: é para ele que as rotas correm */}
        {destino && (
          <div
            ref={(el) => {
              rotulos.current[destino] = el;
            }}
            aria-hidden="true"
            className="absolute left-0 top-0 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-secondary text-secondary-foreground opacity-0 shadow-sm ring-2 ring-card/80"
          >
            <Home className="h-2.5 w-2.5" />
          </div>
        )}

        {dica && (
          <div
            ref={dicaRef}
            role="status"
            className="absolute left-0 top-0 z-10 w-max max-w-[150px] rounded-lg border border-border/70 bg-popover px-2 py-1.5 text-[11px] leading-tight text-popover-foreground shadow-md"
            style={{ transform: `translate3d(${dica.x.toFixed(1)}px, ${dica.y.toFixed(1)}px, 0) translate(-50%, -100%)` }}
          >
            <p className="font-medium">{apontado?.nome ?? nomeDaUf(dica.uf)}</p>
            <p className="tabular-nums text-muted-foreground">
              {apontado ? `${apontado.reservas} ${apontado.reservas === 1 ? "reserva" : "reservas"} · ${pct(apontado.parte)}` : "Sem reservas no período"}
            </p>
            {dica.uf === destino && <p className="text-muted-foreground">Seu imóvel fica aqui</p>}
          </div>
        )}
      </div>
    </div>
  );
}
