import { useEffect, useState, type ReactNode } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, CalendarCheck, Share2, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MapaBrasil } from "@/components/resultados/MapaBrasil";
import { formatarDia, pct, reais } from "@/lib/resultadosImovel";
import type { MesRef, ResumoMes } from "@/lib/resumoDoMes";

/**
 * As telas da história "Resumo do mês". Cada uma recebe o resumo já calculado
 * (`montarResumo`) e só desenha; quem controla a passagem é `ResumoDoMes`.
 *
 * O texto fica sempre sobre vídeo ou foto, então usa o par secondary /
 * secondary-foreground (azul da marca e branco nos dois temas) e uma sombra
 * leve nos números grandes.
 */

const SOMBRA = { textShadow: "0 2px 18px hsl(var(--rios-blue-deep) / 0.6)" };
const CURVA = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------------ */
/* Peças                                                                     */
/* ------------------------------------------------------------------------ */

/** Entrada de baixo para cima, com atraso. Sem movimento quando o sistema pede. */
export function Entra({ atraso = 0, className, children }: { atraso?: number; className?: string; children: ReactNode }) {
  const reduzido = useReducedMotion();
  if (reduzido) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: atraso, ease: CURVA }}
    >
      {children}
    </motion.div>
  );
}

/** Conta de zero até o valor quando a tela entra. */
function useNumero(valor: number, duracao = 1.1, atraso = 0.15): number {
  const reduzido = useReducedMotion();
  const [exibido, setExibido] = useState(reduzido ? valor : 0);
  useEffect(() => {
    if (reduzido) {
      setExibido(valor);
      return;
    }
    const controle = animate(0, valor, { duration: duracao, delay: atraso, ease: CURVA, onUpdate: setExibido });
    return () => controle.stop();
  }, [valor, duracao, atraso, reduzido]);
  return exibido;
}

function Sobretitulo({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-foreground/80">{children}</p>;
}

function Vidro({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl bg-secondary/55 p-4 ring-1 ring-secondary-foreground/15 backdrop-blur-md", className)}>{children}</div>
  );
}

function Selo({ icone, children, tom = "neutro" }: { icone?: ReactNode; children: ReactNode; tom?: "neutro" | "destaque" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium backdrop-blur-md [&>svg]:h-3.5 [&>svg]:w-3.5",
        tom === "destaque" ? "bg-primary text-primary-foreground" : "bg-secondary/55 text-secondary-foreground ring-1 ring-secondary-foreground/15",
      )}
    >
      {icone}
      {children}
    </span>
  );
}

type Pose = "ola" | "joia" | "encantado";

/**
 * O Mini Paulo de meio corpo, subindo da borda de baixo.
 *
 * A caixa de fora corta o que passa dela (`overflow-hidden`): sem isso a
 * entrada vinda de baixo e o corte na borda criavam área rolável dentro do
 * cartão, e o foco num botão fazia a tela inteira deslizar. A folga à esquerda
 * e em cima é para a sombra não ser cortada.
 */
function Paulo({ pose, className, imagemClassName, atraso = 0.35 }: { pose: Pose; className?: string; imagemClassName?: string; atraso?: number }) {
  const reduzido = useReducedMotion();
  const imagem = (
    <img
      src={`/resumo/paulo-${pose}.webp`}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("h-full w-auto max-w-none select-none object-contain object-bottom drop-shadow-2xl", imagemClassName)}
    />
  );
  return (
    <div className={cn("overflow-hidden pl-5 pt-2", className)}>
      {reduzido ? (
        imagem
      ) : (
        <motion.div
          className="h-full"
          initial={{ y: "45%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 16, delay: atraso }}
        >
          {imagem}
        </motion.div>
      )}
    </div>
  );
}

/** Balão de fala, com a ponta virada para o Paulo (à direita). */
function Balao({ children, className, atraso = 0.75 }: { children: ReactNode; className?: string; atraso?: number }) {
  const reduzido = useReducedMotion();
  const corpo = (
    <div className="relative rounded-2xl rounded-br-md bg-background px-3.5 py-2.5 text-[15px] font-medium leading-snug text-foreground shadow-xl">
      {children}
      <span className="absolute -right-1.5 bottom-3 h-3.5 w-3.5 rotate-45 rounded-[3px] bg-background" aria-hidden="true" />
    </div>
  );
  if (reduzido) return <div className={className}>{corpo}</div>;
  return (
    <motion.div
      className={className}
      style={{ transformOrigin: "100% 100%" }}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18, delay: atraso }}
    >
      {corpo}
    </motion.div>
  );
}

function VariacaoSelo({ valor, emPontos, contra }: { valor: number | null; emPontos?: boolean; contra: string }) {
  if (valor == null || Math.abs(valor) < 0.01) return null;
  const sobe = valor > 0;
  const numero = emPontos ? `${Math.abs(Math.round(valor * 100))} pontos` : pct(Math.abs(valor));
  return (
    <Selo icone={sobe ? <ArrowUpRight aria-hidden="true" /> : <ArrowDownRight aria-hidden="true" />}>
      {numero} {sobe ? "acima" : "abaixo"} de {contra}
    </Selo>
  );
}

const CORPO = "pointer-events-none flex h-full flex-col px-6 pb-9 pt-[104px] [@media(max-height:700px)]:pt-[88px]";

/* ------------------------------------------------------------------------ */
/* 1. Capa                                                                   */
/* ------------------------------------------------------------------------ */

export function SlideCapa({ resumo, imovel, nomePessoa }: { resumo: ResumoMes; imovel: string; nomePessoa?: string | null }) {
  const primeiroNome = nomePessoa?.trim().split(/\s+/)[0];
  return (
    <div className={CORPO}>
      <Entra>
        <Sobretitulo>Resumo do mês</Sobretitulo>
      </Entra>
      <Entra atraso={0.08}>
        <h2 className="mt-2 text-[52px] font-semibold capitalize leading-none tracking-tight" style={SOMBRA}>
          {resumo.mes.nome}
        </h2>
      </Entra>
      <Entra atraso={0.16}>
        <p className="mt-2 text-lg font-medium text-secondary-foreground/90" style={SOMBRA}>
          {imovel} · {resumo.mes.ano}
        </p>
      </Entra>

      <div className="relative mt-auto h-[50%] min-h-[260px]">
        <Balao className="absolute bottom-[40%] left-0 right-[49%]">
          {primeiroNome ? `Oi, ${primeiroNome}! ` : "Oi! "}
          Vem ver como foi {resumo.mes.nome} por aqui.
        </Balao>
        <Paulo pose="ola" className="absolute -bottom-9 -right-3 h-full" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 2. Noites                                                                 */
/* ------------------------------------------------------------------------ */

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

export function SlideNoites({ resumo }: { resumo: ResumoMes }) {
  const noites = useNumero(resumo.noites, 1.2);
  const ocupacao = useNumero(resumo.ocupacao, 1.2, 0.3);
  let ordem = 0;
  return (
    <div className={CORPO}>
      <Entra>
        <Sobretitulo>Noites reservadas</Sobretitulo>
      </Entra>
      <Entra atraso={0.06}>
        <p className="mt-1 flex items-baseline gap-2.5" style={SOMBRA}>
          <span className="text-[88px] font-semibold leading-none tracking-tighter tabular-nums [@media(max-height:700px)]:text-[68px]">
            {Math.round(noites)}
          </span>
          <span className="text-xl font-medium text-secondary-foreground/85">de {resumo.disponiveis} noites</span>
        </p>
      </Entra>
      <Entra atraso={0.14} className="mt-3 flex flex-wrap gap-2">
        <Selo tom="destaque">{pct(ocupacao)} de ocupação</Selo>
        {resumo.recorde && <Selo icone={<Trophy aria-hidden="true" />}>Melhor mês até agora</Selo>}
      </Entra>

      <Entra atraso={0.22} className="mt-auto">
        <Vidro className="mx-auto w-full max-w-[320px] [@media(max-height:700px)]:max-w-[260px]">
          <div className="grid grid-cols-7 gap-1.5" role="img" aria-label={`${resumo.noites} de ${resumo.disponiveis} noites reservadas em ${resumo.mes.nome}`}>
            {SEMANA.map((s, i) => (
              <span key={i} className="pb-0.5 text-center text-[10px] font-medium text-secondary-foreground/60">
                {s}
              </span>
            ))}
            {Array.from({ length: resumo.primeiroDiaDaSemana }, (_, i) => (
              <span key={`v${i}`} />
            ))}
            {resumo.dias.map((d) => {
              const atraso = d.reservada ? 450 + ordem++ * 45 : 0;
              return (
                <span
                  key={d.dia}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-lg text-[11px] tabular-nums",
                    d.reservada
                      ? "animate-pop-in font-semibold text-primary-foreground motion-reduce:animate-none"
                      : "bg-secondary-foreground/10 text-secondary-foreground/55",
                    d.semHistorico && "opacity-30",
                  )}
                  style={d.reservada ? { background: "hsl(var(--grafico-1))", animationDelay: `${atraso}ms`, animationFillMode: "both" } : undefined}
                >
                  {d.numero}
                </span>
              );
            })}
          </div>
        </Vidro>
        <div className="mt-3 flex min-h-[32px] justify-center">
          <VariacaoSelo valor={resumo.variacaoOcupacao} emPontos contra={resumo.anterior?.nome ?? ""} />
        </div>
      </Entra>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 3. Diárias                                                                */
/* ------------------------------------------------------------------------ */

export function SlideDiarias({ resumo }: { resumo: ResumoMes }) {
  const receita = useNumero(resumo.receita, 1.3);
  const maior = Math.max(1, ...resumo.serie.map((m) => m.receita));
  return (
    <div className={CORPO}>
      <Entra>
        <Sobretitulo>Diárias do mês</Sobretitulo>
      </Entra>
      <Entra atraso={0.06}>
        <p className="mt-2 text-[60px] font-semibold leading-none tracking-tighter tabular-nums [@media(max-height:700px)]:text-[48px]" style={SOMBRA}>
          {reais(receita)}
        </p>
      </Entra>
      <Entra atraso={0.14} className="mt-3 flex flex-wrap gap-2">
        <Selo>Diária média {reais(resumo.diariaMedia)}</Selo>
        <Selo>
          {resumo.reservas} {resumo.reservas === 1 ? "reserva" : "reservas"}
        </Selo>
        <VariacaoSelo valor={resumo.variacaoReceita} contra={resumo.anterior?.nome ?? ""} />
      </Entra>

      <div className="mt-auto space-y-3">
        {resumo.serie.length >= 2 && (
          <Entra atraso={0.24}>
            <Vidro>
              <p className="mb-3 text-xs font-medium text-secondary-foreground/75">Mês a mês</p>
              <div className="flex h-24 items-end gap-2.5" role="img" aria-label="Diárias dos últimos meses">
                {resumo.serie.map((m, i) => (
                  <span key={m.chave} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    <span
                      className={cn("mx-auto w-full max-w-[34px] origin-bottom animate-crescer-barra rounded-t-md motion-reduce:animate-none", !m.atual && "bg-secondary-foreground/40")}
                      style={{
                        height: `${Math.max(m.receita > 0 ? 6 : 2, (m.receita / maior) * 100)}%`,
                        animationDelay: `${350 + i * 90}ms`,
                        ...(m.atual ? { background: "hsl(var(--grafico-1))" } : {}),
                      }}
                    />
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex gap-2.5">
                {resumo.serie.map((m) => (
                  <span
                    key={m.chave}
                    className={cn("min-w-0 flex-1 text-center text-[11px]", m.atual ? "font-semibold text-secondary-foreground" : "text-secondary-foreground/60")}
                  >
                    {m.rotulo}
                  </span>
                ))}
              </div>
            </Vidro>
          </Entra>
        )}
        {resumo.liquido != null && (
          <Entra atraso={0.32}>
            <Vidro>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-secondary-foreground/85">Seu líquido estimado</span>
                <span className="text-xl font-semibold tabular-nums">{reais(resumo.liquido)}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-secondary-foreground/65">
                Depois da taxa do canal e da comissão RIOS. O valor oficial é o do relatório financeiro.
              </p>
            </Vidro>
          </Entra>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 4. Hóspedes                                                               */
/* ------------------------------------------------------------------------ */

export function SlideHospedes({ resumo }: { resumo: ResumoMes }) {
  const temHospedes = resumo.hospedes != null;
  const numero = useNumero(temHospedes ? resumo.hospedes! : resumo.reservas, 1.1);
  const { ufs, fora, conhecidas } = resumo.origens;
  const lista = [...ufs.map((u) => ({ nome: u.nome, reservas: u.reservas })), ...fora].sort((a, b) => b.reservas - a.reservas).slice(0, 4);
  const temMapa = ufs.length > 0;
  return (
    <div className={CORPO}>
      <Entra>
        <Sobretitulo>Quem passou por aí</Sobretitulo>
      </Entra>
      <Entra atraso={0.06}>
        <p className="mt-1 flex items-baseline gap-2.5" style={SOMBRA}>
          <span className="text-[80px] font-semibold leading-none tracking-tighter tabular-nums [@media(max-height:700px)]:text-[60px]">{Math.round(numero)}</span>
          <span className="text-xl font-medium text-secondary-foreground/85">
            {temHospedes ? (resumo.hospedes === 1 ? "hóspede" : "hóspedes") : resumo.reservas === 1 ? "reserva" : "reservas"}
          </span>
        </p>
      </Entra>
      <Entra atraso={0.12}>
        <p className="mt-1.5 text-[15px] text-secondary-foreground/85" style={SOMBRA}>
          {temHospedes && `em ${resumo.reservas} ${resumo.reservas === 1 ? "reserva" : "reservas"} · `}
          estadia média de {resumo.estadiaMedia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} noites
        </p>
      </Entra>

      <div className="mt-auto space-y-3">
        {temMapa ? (
          <Entra atraso={0.2}>
            <Vidro>
              <p className="mb-3 text-xs font-medium text-secondary-foreground/75">De onde vieram</p>
              <div className="flex items-center gap-4">
                <MapaBrasil ufs={ufs} variante="escuro" animar className="w-[42%] max-w-[150px] shrink-0 [@media(max-height:700px)]:max-w-[112px]" />
                <ul className="min-w-0 flex-1 space-y-2">
                  {lista.map((o) => (
                    <li key={o.nome} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{o.nome}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{o.reservas}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-3 text-[11px] leading-snug text-secondary-foreground/60">
                Pelo DDD de {conhecidas} {conhecidas === 1 ? "reserva com telefone informado" : "reservas com telefone informado"}.
              </p>
            </Vidro>
          </Entra>
        ) : (
          resumo.curiosidades.length > 0 && (
            <Entra atraso={0.2}>
              <Vidro>
                <ul className="space-y-2.5">
                  {resumo.curiosidades.slice(0, 3).map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary-foreground/70" aria-hidden="true" />
                      {c}
                    </li>
                  ))}
                </ul>
              </Vidro>
            </Entra>
          )
        )}
        {temMapa && resumo.curiosidades.length > 0 && (
          <Entra atraso={0.3} className="flex flex-wrap gap-2">
            {resumo.curiosidades.slice(0, 2).map((c) => (
              <Selo key={c}>{c}</Selo>
            ))}
          </Entra>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 5. Comparação                                                             */
/* ------------------------------------------------------------------------ */

function BarraComparada({ rotulo, valor, destaque, atraso }: { rotulo: string; valor: number; destaque?: boolean; atraso: number }) {
  const reduzido = useReducedMotion();
  const exibido = useNumero(valor, 1, atraso);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("text-sm", destaque ? "font-semibold" : "text-secondary-foreground/85")}>{rotulo}</span>
        <span className={cn("tabular-nums", destaque ? "text-2xl font-semibold" : "text-base font-medium text-secondary-foreground/85")}>{pct(exibido)}</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-secondary-foreground/15">
        <motion.div
          className={cn("h-full rounded-full", !destaque && "bg-secondary-foreground/55")}
          style={destaque ? { background: "hsl(var(--grafico-1))" } : undefined}
          initial={reduzido ? false : { width: 0 }}
          animate={{ width: `${Math.max(2, Math.min(100, valor * 100))}%` }}
          transition={{ duration: 1, delay: atraso, ease: CURVA }}
        />
      </div>
    </div>
  );
}

export function temComparacao(resumo: ResumoMes): boolean {
  return resumo.comparacao.rios != null || resumo.comparacao.mercado != null;
}

export function SlideComparacao({ resumo }: { resumo: ResumoMes }) {
  const { rios, mercado } = resumo.comparacao;
  const acimaRios = rios != null && resumo.ocupacao - rios >= 0.03;
  const acimaMercado = mercado != null && resumo.ocupacao - mercado >= 0.03;
  const comemora = (acimaMercado && (rios == null || acimaRios)) || (acimaRios && mercado == null);

  let titulo: string;
  if (acimaRios && acimaMercado) titulo = "Acima da média RIOS e do mercado";
  else if (acimaMercado) titulo = "Acima do mercado da região";
  else if (acimaRios) titulo = "Acima da média dos imóveis RIOS";
  else titulo = "Sua ocupação ao lado das referências";

  return (
    <div className={CORPO}>
      <Entra>
        <Sobretitulo>Ocupação em {resumo.mes.nome}</Sobretitulo>
      </Entra>
      <Entra atraso={0.06}>
        <h2 className="mt-2 text-[32px] font-semibold leading-[1.08] tracking-tight" style={SOMBRA}>
          {titulo}
        </h2>
      </Entra>

      <Entra atraso={0.16} className="mt-6">
        <Vidro className="space-y-4">
          <BarraComparada rotulo="Seu imóvel" valor={resumo.ocupacao} destaque atraso={0.35} />
          {rios != null && <BarraComparada rotulo="Média dos imóveis RIOS" valor={rios} atraso={0.5} />}
          {mercado != null && <BarraComparada rotulo="Mercado em volta" valor={mercado} atraso={0.65} />}
        </Vidro>
        <p className="mt-2.5 max-w-[78%] text-[11px] leading-snug text-secondary-foreground/65">
          {rios != null && "Média RIOS: imóveis com reserva no mês. "}
          {mercado != null && "Mercado: imóveis vizinhos, pelo PriceLabs."}
        </p>
      </Entra>

      {comemora && (
        <div className="relative mt-auto h-[34%] min-h-[190px]">
          <Paulo pose="encantado" className="absolute -bottom-9 -right-6 h-full" atraso={0.9} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 6. Daqui para frente                                                      */
/* ------------------------------------------------------------------------ */

export function temAdiante(resumo: ResumoMes): boolean {
  return resumo.adiante.receitaReservada > 0 || resumo.adiante.emCasa != null;
}

export function SlideAdiante({ resumo, hoje }: { resumo: ResumoMes; hoje: number }) {
  const { adiante } = resumo;
  const reservado = useNumero(adiante.receitaReservada, 1.3);

  let agora: string | null = null;
  if (adiante.emCasa) agora = `Hóspedes no imóvel até ${formatarDia(adiante.emCasa.co)}`;
  else if (adiante.proxima) {
    const dias = adiante.proxima.ci - hoje;
    agora = dias <= 0 ? "Check-in hoje" : `Próximo check-in ${dias === 1 ? "amanhã" : `em ${dias} dias`} (${formatarDia(adiante.proxima.ci)})`;
  }

  return (
    <div className={CORPO}>
      <Entra>
        <Sobretitulo>Daqui para frente</Sobretitulo>
      </Entra>
      <Entra atraso={0.06}>
        <p className="mt-2 text-[56px] font-semibold leading-none tracking-tighter tabular-nums [@media(max-height:700px)]:text-[44px]" style={SOMBRA}>
          {reais(reservado)}
        </p>
      </Entra>
      <Entra atraso={0.12}>
        <p className="mt-2 text-[17px] font-medium text-secondary-foreground/90" style={SOMBRA}>
          já reservados
          {adiante.reservasFuturas > 0 && ` em ${adiante.reservasFuturas} ${adiante.reservasFuturas === 1 ? "reserva futura" : "reservas futuras"}`}
        </p>
      </Entra>
      {agora && (
        <Entra atraso={0.18} className="mt-3">
          <Selo icone={<CalendarCheck aria-hidden="true" />}>{agora}</Selo>
        </Entra>
      )}

      <div className="mt-auto space-y-2.5">
        {resumo.proximosMeses.map((m, i) => (
          <Entra key={m.chave} atraso={0.26 + i * 0.1}>
            <Vidro className="py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-semibold capitalize">{m.nome}</span>
                <span className="text-lg font-semibold tabular-nums">{reais(m.receita)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary-foreground/15">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (m.noites / m.dias) * 100)}%`, background: "hsl(var(--grafico-1))" }} />
              </div>
              <p className="mt-1.5 text-xs text-secondary-foreground/70">
                {m.noites} de {m.dias} noites{m.atual ? " · inclui o que já passou" : " já reservadas"}
              </p>
            </Vidro>
          </Entra>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 7. Fecho                                                                  */
/* ------------------------------------------------------------------------ */

interface FechoProps {
  resumo: ResumoMes;
  outrosMeses: (MesRef & { rotulo: string })[];
  onCompartilhar: () => void;
  onVerCompleto: () => void;
  onRever: () => void;
  onTrocarMes: (mes: MesRef) => void;
}

export function SlideFecho({ resumo, outrosMeses, onCompartilhar, onVerCompleto, onRever, onTrocarMes }: FechoProps) {
  return (
    <div className={CORPO}>
      <Entra>
        <Sobretitulo>Resumo de {resumo.mes.nome}</Sobretitulo>
      </Entra>
      <Entra atraso={0.06}>
        <h2 className="mt-2 text-[38px] font-semibold leading-[1.05] tracking-tight" style={SOMBRA}>
          É isso por {resumo.mes.nome}.
        </h2>
      </Entra>
      <Entra atraso={0.14}>
        <p className="mt-2.5 max-w-[88%] text-[17px] leading-snug text-secondary-foreground/90" style={SOMBRA}>
          A gente segue cuidando de tudo por aí.
        </p>
      </Entra>

      <Entra atraso={0.24} className="pointer-events-auto mt-6 flex w-[62%] min-w-[200px] flex-col gap-2">
        <Button onClick={onCompartilhar} className="h-11 justify-start gap-2 text-sm font-semibold">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Compartilhar
        </Button>
        <Button onClick={onVerCompleto} variant="secondary" className="h-11 justify-start bg-background text-sm font-semibold text-foreground hover:bg-background/90">
          Ver resultados completos
        </Button>
        <Button onClick={onRever} variant="ghost" className="h-9 justify-start px-3 text-sm text-secondary-foreground hover:bg-secondary-foreground/10 hover:text-secondary-foreground">
          Ver de novo
        </Button>
      </Entra>

      {outrosMeses.length > 0 && (
        <Entra atraso={0.34} className="pointer-events-auto mt-4 w-[62%] min-w-[200px]">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-secondary-foreground/65">Outros meses</p>
          <div className="flex flex-wrap gap-1.5">
            {outrosMeses.map((m) => (
              <button
                key={m.chave}
                type="button"
                onClick={() => onTrocarMes(m)}
                className="rounded-full bg-secondary/55 px-2.5 py-1 text-xs font-medium capitalize text-secondary-foreground ring-1 ring-secondary-foreground/20 backdrop-blur-md transition-colors hover:bg-secondary-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground"
              >
                {m.rotulo}
              </button>
            ))}
          </div>
        </Entra>
      )}

      {/* preso ao canto do cartão; o corte no pé e na lateral é feito dentro da caixa dele */}
      <Paulo pose="joia" className="absolute bottom-0 right-0 h-[46%] min-h-[260px]" imagemClassName="translate-x-5 translate-y-9" atraso={0.5} />
    </div>
  );
}
