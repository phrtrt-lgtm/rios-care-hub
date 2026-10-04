import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight, Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TituloSecao } from "@/components/painel/TituloSecao";
import { cn } from "@/lib/utils";
import { coletaEmDia, useColetaHostex } from "@/lib/coletaHostex";
import {
  calcularReserva,
  consultaResultadosImovel,
  deDia,
  diaDe,
  formatarDia,
  hojeDia,
  metricas,
  nomeDoMes,
  olharAdiante,
  paraDia,
  pct,
  reais,
  serieMensal,
  useImoveisDeResultados,
  type ResultadoImovel,
} from "@/lib/resultadosImovel";

/**
 * Versão mini da dashboard de resultados, no topo do painel do proprietário:
 * um cartão por imóvel com o mês atual, o que já está reservado, os próximos
 * 14 dias e os últimos meses. O botão leva à página completa (/resultados).
 *
 * Usa a mesma consulta da página (mesma chave de cache). Só aparece com a
 * coleta da Hostex em dia — número velho é pior que número nenhum.
 */
export function ResultadosMini() {
  const { user } = useAuth();
  const { data: ultimaColeta } = useColetaHostex();
  const noAr = coletaEmDia(ultimaColeta);
  const { data: imoveis } = useImoveisDeResultados(user?.id, false, noAr);

  const consultas = useQueries({
    queries: (noAr ? imoveis ?? [] : []).map((i) => consultaResultadosImovel(i.id)),
  });

  if (!noAr || !imoveis || imoveis.length === 0) return null;

  const carregando = consultas.some((c) => c.isLoading);
  const prontos = consultas.map((c) => c.data).filter((d): d is ResultadoImovel => !!d && d.reservas.length > 0);
  // Nenhum imóvel com reserva registrada: a seção não tem o que mostrar.
  if (!carregando && prontos.length === 0) return null;

  const unico = imoveis.length === 1;

  return (
    <section aria-labelledby="titulo-resultados-mini" className="flex min-w-0 flex-col gap-4">
      <TituloSecao
        id="titulo-resultados-mini"
        titulo={unico ? "Resultados do seu imóvel" : "Resultados dos seus imóveis"}
        subtitulo="Reservas, ocupação e diárias, atualizadas todo dia"
      />
      <div className={cn("grid min-w-0 gap-4", !unico && "lg:grid-cols-2")}>
        {carregando && prontos.length === 0
          ? imoveis.slice(0, 2).map((i) => <Skeleton key={i.id} className="h-56 w-full rounded-2xl" />)
          : prontos.map((d) => <CartaoMini key={d.imovel.id} dados={d} largo={unico} />)}
      </div>
    </section>
  );
}

const DIAS_ADIANTE = 14;
const MESES_ATRAS = 5;

function CartaoMini({ dados, largo }: { dados: ResultadoImovel; largo: boolean }) {
  const navigate = useNavigate();
  const hoje = hojeDia();

  const calculo = useMemo(() => {
    const reservas = dados.reservas.map(calcularReserva);
    const primeira = dados.primeira_reserva ? paraDia(dados.primeira_reserva) : null;
    const d = deDia(hoje);
    const inicioMes = diaDe(d.getFullYear(), d.getMonth());
    const fimMes = diaDe(d.getFullYear(), d.getMonth() + 1);
    const ocupadas = new Set<number>();
    for (const r of reservas) {
      for (let dia = Math.max(r.ci, hoje); dia < Math.min(r.co, hoje + DIAS_ADIANTE); dia++) ocupadas.add(dia);
    }
    return {
      mes: metricas(reservas, inicioMes, fimMes, primeira),
      nomeMes: nomeDoMes(d.getFullYear(), d.getMonth(), false),
      adiante: olharAdiante(reservas, hoje),
      ocupadas,
      serie: serieMensal(reservas, dados.referencia, hoje, primeira, MESES_ATRAS, 0),
    };
  }, [dados, hoje]);

  const { mes, nomeMes, adiante, ocupadas, serie } = calculo;
  const abrir = () => navigate(`/resultados/${dados.imovel.id}`);

  let agora: { texto: string; ativo: boolean };
  if (adiante.emCasa) {
    agora = { texto: `Hóspedes no imóvel até ${formatarDia(adiante.emCasa.co)}`, ativo: true };
  } else if (adiante.proxima) {
    const dias = adiante.proxima.ci - hoje;
    agora = {
      texto: dias <= 0 ? "Check-in hoje" : `Próximo check-in ${dias === 1 ? "amanhã" : `em ${dias} dias`}`,
      ativo: false,
    };
  } else {
    agora = { texto: "Sem reservas futuras", ativo: false };
  }

  const maiorMes = Math.max(1, ...serie.map((m) => m.realizado + m.reservado));
  const noitesAdiante = ocupadas.size;

  return (
    <article className="relative isolate min-w-0 overflow-hidden rounded-2xl bg-secondary text-secondary-foreground shadow-md">
      {/* mesmo fundo da página completa, parado (quadro inicial da animação) */}
      <img src="/animacoes/rios-fluxo-poster.jpg" alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-secondary/85 via-secondary/60 to-secondary/30" aria-hidden="true" />

      <div className="flex flex-col gap-4 p-4 md:p-5">
        {/* imóvel + o que acontece agora */}
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background/10 ring-1 ring-background/20">
            {dados.imovel.capa ? (
              <img src={dados.imovel.capa} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-5 w-5 text-secondary-foreground/70" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-tight tracking-tight">{dados.imovel.nome}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-secondary-foreground/80">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", agora.ativo ? "bg-success" : "bg-secondary-foreground/50")} aria-hidden="true" />
              <span className="truncate">{agora.texto}</span>
            </p>
          </div>
          <Button
            size="sm"
            onClick={abrir}
            className="h-9 shrink-0 gap-1.5 bg-background/95 px-3 text-xs font-semibold text-foreground hover:bg-background"
            aria-label={`Ver resultados completos de ${dados.imovel.nome}`}
          >
            <span className="hidden sm:inline">Ver completo</span>
            <span className="sm:hidden">Abrir</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>

        <div className={cn("grid gap-4", largo && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-end lg:gap-8")}>
          {/* três números */}
          <dl className="grid grid-cols-3 gap-3">
            <NumeroMini rotulo={`Diárias em ${nomeMes}`} valor={reais(mes.receita)} />
            <NumeroMini rotulo="Ocupação do mês" valor={pct(mes.ocupacao)} detalhe={`${mes.noites} de ${mes.disponiveis} noites`} />
            <NumeroMini
              rotulo="Já reservado"
              valor={reais(adiante.receitaReservada)}
              detalhe={adiante.reservasFuturas > 0 ? `${adiante.reservasFuturas} ${adiante.reservasFuturas === 1 ? "reserva" : "reservas"} à frente` : undefined}
            />
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* próximos 14 dias */}
            <div>
              <p className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] text-secondary-foreground/75">
                <span>Próximos {DIAS_ADIANTE} dias</span>
                <span className="tabular-nums">
                  {noitesAdiante} {noitesAdiante === 1 ? "noite reservada" : "noites reservadas"}
                </span>
              </p>
              <div
                className="flex gap-[3px]"
                role="img"
                aria-label={`Próximos ${DIAS_ADIANTE} dias: ${noitesAdiante} noites reservadas e ${DIAS_ADIANTE - noitesAdiante} livres`}
              >
                {Array.from({ length: DIAS_ADIANTE }, (_, i) => {
                  const dia = hoje + i;
                  const reservada = ocupadas.has(dia);
                  return (
                    <span key={dia} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${formatarDia(dia)}: ${reservada ? "reservada" : "livre"}`}>
                      <span
                        className={cn("h-5 w-full rounded-[4px]", reservada ? "" : "bg-background/15")}
                        style={reservada ? { background: "hsl(var(--grafico-1))" } : undefined}
                      />
                      <span className={cn("text-[9px] tabular-nums leading-none", i === 0 ? "font-semibold text-secondary-foreground" : "text-secondary-foreground/60")}>
                        {deDia(dia).getDate()}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* últimos meses */}
            <div>
              <p className="mb-1.5 text-[11px] text-secondary-foreground/75">Diárias por mês</p>
              <div className="flex h-[34px] items-end gap-1.5" role="img" aria-label={`Diárias dos últimos ${serie.length} meses`}>
                {serie.map((m) => {
                  const total = m.realizado + m.reservado;
                  return (
                    <span
                      key={m.chave}
                      className="flex min-w-0 flex-1 flex-col justify-end"
                      title={`${nomeDoMes(m.ano, m.mes0)}: ${reais(total)}`}
                      style={{ height: "100%" }}
                    >
                      <span
                        className="mx-auto w-full max-w-[20px] rounded-t-[3px]"
                        style={{
                          height: `${Math.max(total > 0 ? 8 : 2, (total / maiorMes) * 100)}%`,
                          background: m.atual ? "hsl(var(--grafico-1))" : "hsl(var(--secondary-foreground) / 0.45)",
                        }}
                      />
                    </span>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-1.5">
                {serie.map((m) => (
                  <span
                    key={m.chave}
                    className={cn("min-w-0 flex-1 text-center text-[9px] leading-none", m.atual ? "font-semibold text-secondary-foreground" : "text-secondary-foreground/60")}
                  >
                    {m.rotulo}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function NumeroMini({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-secondary-foreground/75">{rotulo}</dt>
      <dd className="mt-0.5 truncate text-lg font-semibold leading-tight tracking-tight md:text-2xl">{valor}</dd>
      {detalhe && <dd className="mt-0.5 truncate text-[10px] text-secondary-foreground/65 md:text-[11px]">{detalhe}</dd>}
    </div>
  );
}
