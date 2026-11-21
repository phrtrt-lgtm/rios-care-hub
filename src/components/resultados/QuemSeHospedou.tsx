import { useMemo, useRef, type ReactNode } from "react";
import { Baby, PawPrint, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PerfilDosHospedes } from "@/lib/perfilDosHospedes";
import { pct } from "@/lib/resultadosImovel";
import { Cartao } from "./blocos";
import { COR, useNaTela } from "./graficos";

const COR_ADULTO = COR.serie2;
const COR_CRIANCA = COR.serie1;
const COR_BEBE = "hsl(var(--grafico-3))";
const COR_PET = "hsl(var(--grafico-4))";

/** No máximo isto de figuras no desenho; acima, cada figura passa a valer mais gente. */
const MAX_FIGURAS = 48;

type Tipo = "adulto" | "crianca" | "bebe";

function Contagem({ icone, cor, rotulo, valor }: { icone: ReactNode; cor: string; rotulo: string; valor: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 [&>svg]:h-4 [&>svg]:w-4" style={{ color: cor }} aria-hidden="true">
        {icone}
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold leading-none tabular-nums">{valor.toLocaleString("pt-BR")}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{rotulo}</p>
      </div>
    </div>
  );
}

/**
 * Quem passou pelo imóvel no período: gente grande, criança, bebê e pet. É
 * contagem, sem nome de ninguém. Ajuda a decidir o que a casa precisa ter
 * (berço, cadeirão, espaço para pet).
 */
export function QuemSeHospedou({ id, perfil, className }: { id?: string; perfil: PerfilDosHospedes; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const visivel = useNaTela(caixa);

  const { figuras, unidade } = useMemo(() => {
    const total = perfil.adultos + perfil.criancas + perfil.bebes;
    const u = [1, 2, 5, 10, 20, 50, 100, 200].find((n) => total / n <= MAX_FIGURAS) ?? 500;
    const qtd = (n: number) => (n > 0 ? Math.max(1, Math.round(n / u)) : 0);
    const lista: Tipo[] = [
      ...Array<Tipo>(qtd(perfil.adultos)).fill("adulto"),
      ...Array<Tipo>(qtd(perfil.criancas)).fill("crianca"),
      ...Array<Tipo>(qtd(perfil.bebes)).fill("bebe"),
    ];
    return { figuras: lista, unidade: u };
  }, [perfil.adultos, perfil.criancas, perfil.bebes]);

  const temDetalhe = perfil.comDetalhe > 0;

  return (
    <Cartao id={id} titulo="Quem se hospedou" subtitulo="Pessoas que passaram pelo imóvel, no período" className={className}>
      {perfil.pessoas === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {perfil.reservas > 0 ? "As reservas deste período não informam os hóspedes." : "Sem reservas neste período."}
        </p>
      ) : (
        <div ref={caixa}>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
            <p className="text-[34px] font-semibold leading-none tracking-tight tabular-nums">{perfil.pessoas.toLocaleString("pt-BR")}</p>
            <p className="pb-0.5 text-xs leading-snug text-muted-foreground">
              {perfil.pessoas === 1 ? "pessoa" : "pessoas"}
              {perfil.grupoMedio != null && (
                <>
                  <br />
                  {perfil.grupoMedio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por reserva, em média
                </>
              )}
            </p>
          </div>

          {temDetalhe && figuras.length > 0 && (
            <>
              <div className="mt-4 flex flex-wrap items-end gap-x-0.5 gap-y-1" aria-hidden="true">
                {figuras.map((tipo, i) => {
                  const Icone = tipo === "bebe" ? Baby : User;
                  return (
                    <Icone
                      key={i}
                      strokeWidth={2.4}
                      className={cn(
                        "transition-all duration-500 ease-out motion-reduce:transition-none",
                        tipo === "adulto" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5",
                        visivel ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                      )}
                      style={{
                        color: tipo === "adulto" ? COR_ADULTO : tipo === "crianca" ? COR_CRIANCA : COR_BEBE,
                        transitionDelay: `${Math.min(900, i * 22)}ms`,
                      }}
                    />
                  );
                })}
              </div>
              {unidade > 1 && <p className="mt-1.5 text-[11px] text-muted-foreground">Cada figura vale {unidade} pessoas.</p>}
            </>
          )}

          {temDetalhe && (
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Contagem icone={<User />} cor={COR_ADULTO} rotulo={perfil.adultos === 1 ? "adulto" : "adultos"} valor={perfil.adultos} />
              <Contagem icone={<User />} cor={COR_CRIANCA} rotulo={perfil.criancas === 1 ? "criança" : "crianças"} valor={perfil.criancas} />
              <Contagem icone={<Baby />} cor={COR_BEBE} rotulo={perfil.bebes === 1 ? "bebê" : "bebês"} valor={perfil.bebes} />
              <Contagem icone={<PawPrint />} cor={COR_PET} rotulo={perfil.pets === 1 ? "pet" : "pets"} valor={perfil.pets} />
            </div>
          )}

          {temDetalhe && (
            <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <li className="flex items-baseline justify-between gap-3">
                <span>Reservas com criança ou bebê</span>
                <span className="shrink-0 font-medium tabular-nums text-foreground">{pct(perfil.comCrianca / perfil.comDetalhe)}</span>
              </li>
              <li className="flex items-baseline justify-between gap-3">
                <span>Reservas com pet</span>
                <span className="shrink-0 font-medium tabular-nums text-foreground">{pct(perfil.comPet / perfil.comDetalhe)}</span>
              </li>
              {perfil.maiorGrupo > 0 && (
                <li className="flex items-baseline justify-between gap-3">
                  <span>Maior grupo</span>
                  <span className="shrink-0 font-medium tabular-nums text-foreground">{perfil.maiorGrupo} pessoas</span>
                </li>
              )}
            </ul>
          )}

          {(perfil.semInformacao > 0 || (temDetalhe && perfil.semDivisao > 0)) && (
            <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
              {perfil.semInformacao > 0 &&
                `${perfil.semInformacao} ${perfil.semInformacao === 1 ? "reserva dos relatórios financeiros não informa" : "reservas dos relatórios financeiros não informam"} os hóspedes. `}
              {temDetalhe && perfil.semDivisao > 0 && `${perfil.semDivisao} pessoas entram só no total, sem separar adulto de criança.`}
            </p>
          )}
        </div>
      )}
    </Cartao>
  );
}
