import { Suspense, useCallback, useMemo, useState } from "react";
import { BedDouble, CalendarCheck, Percent, Table2, TrendingUp, Wallet, X, BarChart3, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AbaPilula, BarraFiltros } from "@/components/painel/PaginaInterna";
import { TituloSecao } from "@/components/painel/TituloSecao";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { lazyPage } from "@/lib/lazyPage";
import { mesesComResumo, resumoJaVisto } from "@/lib/resumoDoMes";
import { ALVO, falasDoPaulo } from "@/lib/falasDoPaulo";
import { perfilDosHospedes } from "@/lib/perfilDosHospedes";
import { noitesAVenda, ritmoDeVenda } from "@/lib/resultadosAFrente";
import { Cartao, Cifra, Destaques, DivisaoDoValor, HeroResultados, ProximasChegadas, Revelar } from "./blocos";
import { MapaBrasil } from "./MapaBrasil";
import { NoitesAVenda } from "./NoitesAVenda";
import { QuemSeHospedou } from "./QuemSeHospedou";
import { RitmoDeVenda } from "./RitmoDeVenda";
import { PauloNoTopo } from "./paulo/PauloNoTopo";
import { suportaWebGL, ufDoEndereco } from "./cena3d/suporte";
import {
  BarraDeCanais,
  BarrasHorizontais,
  COR,
  GraficoDiasDaSemana,
  GraficoOcupacao,
  GraficoReceitaMensal,
  Legenda,
  Medidor,
} from "./graficos";
import {
  PERIODOS,
  deDia,
  diaDe,
  faixasDeAntecedencia,
  formatarDia,
  gerarDestaques,
  liquidoEstimado,
  mercadoComparavel,
  metricas,
  mixCanais,
  nomeDoMes,
  ocupacaoPorDiaDaSemana,
  olharAdiante,
  origensDosHospedes,
  origensPorEstado,
  pct,
  periodoAnterior,
  periodoDoMes,
  periodoPorId,
  reais,
  serieMensal,
  variacao,
  type Periodo,
  type ReservaCalculada,
  type ResultadoImovel,
} from "@/lib/resultadosImovel";

interface Props {
  dados: ResultadoImovel;
  reservas: ReservaCalculada[];
  hoje: number;
  primeira: number | null;
  /** "Ver todas as reservas", nas próximas chegadas: a página troca para a aba Reservas. */
  onVerReservas?: () => void;
  /** "Ver o calendário", nas noites à venda: a página troca para a aba Calendário. */
  onVerCalendario?: () => void;
}

/** Caixa do mapa de origem em 3D. O mapa plano segura o mesmo lugar enquanto o pacote 3D carrega. */
const CAIXA_DO_MAPA = "h-[250px] w-full lg:h-[330px]";

// A história do mês só baixa quando a pessoa abre (vídeos, Mini Paulo e o cartão de compartilhar).
const ResumoDoMes = lazyPage(() => import("./resumo/ResumoDoMes"));
// As peças em 3D trazem o three.js: ficam num pacote à parte, que só baixa nesta página e em aparelho que desenha WebGL.
const RelevoDoAno = lazyPage(() => import("./cena3d/RelevoDoAno"));
const MapaHospedes3D = lazyPage(() => import("./cena3d/MapaHospedes3D"));

/**
 * Visão geral dos resultados de um imóvel.
 *
 * De cima para baixo: o que acontece agora e o que já está reservado (não
 * depende do filtro) e, a partir de "Desempenho", tudo responde ao período
 * escolhido na linha de filtros — os números, os destaques e os recortes. Os
 * dois gráficos de linha do tempo mostram sempre o ano inteiro e marcam o
 * período com uma faixa; clicar num mês filtra por ele.
 *
 * O botão "Resumo de <mês>" no topo abre a história do último mês fechado.
 */
export function VisaoGeral({ dados, reservas, hoje, primeira, onVerReservas, onVerCalendario }: Props) {
  const { profile } = useAuth();
  // "Este ano" é o retrato mais útil; em janeiro e fevereiro ele ainda é curto.
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPorId(deDia(hoje).getMonth() >= 2 ? "ano" : "12m", hoje));
  const [verTabela, setVerTabela] = useState(false);
  const [ufEmFoco, setUfEmFoco] = useState<string | null>(null);
  const [em3d] = useState(suportaWebGL);
  const ufDoImovel = useMemo(() => ufDoEndereco(dados.imovel.endereco), [dados.imovel.endereco]);

  // Último mês fechado com reserva: é dele o resumo em história.
  const mesDoResumo = useMemo(() => mesesComResumo(reservas, hoje, primeira, 1)[0], [reservas, hoje, primeira]);
  const [resumoAberto, setResumoAberto] = useState(false);
  const [resumoVisto, setResumoVisto] = useState(() => (mesDoResumo ? resumoJaVisto(dados.imovel.id, mesDoResumo.chave) : true));

  const adiante = useMemo(() => olharAdiante(reservas, hoje), [reservas, hoje]);
  // Só o que serve para comparar: mês fechado com dado "futuro" (carga velha) fica de fora.
  const mercado = useMemo(() => mercadoComparavel(dados.mercado ?? [], hoje), [dados.mercado, hoje]);
  const serie = useMemo(
    () => serieMensal(reservas, dados.referencia, hoje, primeira, 11, 3, mercado),
    [reservas, dados.referencia, hoje, primeira, mercado],
  );

  const atual = useMemo(() => metricas(reservas, periodo.inicio, periodo.fim, primeira), [reservas, periodo, primeira]);
  const anterior = useMemo(() => {
    const p = periodoAnterior(periodo);
    // Sem histórico cobrindo o período anterior, não há com o que comparar.
    if (primeira == null || p.inicio < primeira) return null;
    return metricas(reservas, p.inicio, p.fim, primeira);
  }, [reservas, periodo, primeira]);

  const canais = useMemo(() => mixCanais(reservas, periodo.inicio, periodo.fim), [reservas, periodo]);
  const semana = useMemo(() => ocupacaoPorDiaDaSemana(reservas, periodo.inicio, periodo.fim, primeira), [reservas, periodo, primeira]);
  const antecedencia = useMemo(() => faixasDeAntecedencia(reservas, periodo.inicio, periodo.fim), [reservas, periodo]);
  const origens = useMemo(() => origensDosHospedes(reservas, periodo.inicio, periodo.fim), [reservas, periodo]);
  const estados = useMemo(() => origensPorEstado(reservas, periodo.inicio, periodo.fim).ufs, [reservas, periodo]);
  const destaques = useMemo(
    () => gerarDestaques({ reservas, periodo, atual, serie, referencia: dados.referencia, mercado, adiante, primeira }),
    [reservas, periodo, atual, serie, dados.referencia, mercado, adiante, primeira],
  );

  // O que vem pela frente (não depende do filtro) e quem veio (depende).
  const venda = useMemo(() => noitesAVenda(dados.calendario, reservas, hoje), [dados.calendario, reservas, hoje]);
  const ritmo = useMemo(() => ritmoDeVenda(reservas, dados, hoje), [reservas, dados, hoje]);
  const perfil = useMemo(() => perfilDosHospedes(reservas, periodo.inicio, periodo.fim), [reservas, periodo]);

  // O Mini Paulo no topo, contando os destaques (o dos vídeos; o boneco 3D do Tripo saiu em 2026-11-21).
  const abrirResumo = useCallback(() => {
    setResumoAberto(true);
    setResumoVisto(true);
  }, []);
  const nomePessoa = dados.visao_equipe ? null : profile?.name;
  const falas = useMemo(
    () =>
      falasDoPaulo({
        nomePessoa,
        equipe: dados.visao_equipe,
        imovel: dados.imovel.nome,
        hoje,
        adiante,
        serie,
        ritmo,
        venda,
        perfilDoAno: perfilDosHospedes(reservas, diaDe(deDia(hoje).getFullYear(), 0), hoje + 1),
        resumo: mesDoResumo ? { rotulo: `Resumo de ${nomeDoMes(mesDoResumo.ano, mesDoResumo.mes0, false)}`, onAbrir: abrirResumo } : undefined,
      }),
    [nomePessoa, dados.visao_equipe, dados.imovel.nome, hoje, adiante, serie, ritmo, venda, reservas, mesDoResumo, abrirResumo],
  );

  const passados = serie.filter((m) => !m.futuro);
  const liquido = liquidoEstimado(atual.base, dados.comissao_pct);
  const liquidoAnterior = anterior ? liquidoEstimado(anterior.base, dados.comissao_pct) : null;
  const temRios = serie.some((m) => m.ocupacaoRios != null);
  const temMercado = serie.some((m) => m.ocupacaoMercado != null);

  return (
    <div className="space-y-6 md:space-y-8">
      <HeroResultados
        dados={dados}
        adiante={adiante}
        hoje={hoje}
        resumo={
          mesDoResumo
            ? {
                rotulo: `Resumo de ${nomeDoMes(mesDoResumo.ano, mesDoResumo.mes0, false)}`,
                novo: !resumoVisto,
                onAbrir: abrirResumo,
              }
            : undefined
        }
        paulo={<PauloNoTopo falas={falas} />}
      />

      {resumoAberto && (
        <Suspense fallback={null}>
          <ResumoDoMes dados={dados} nomePessoa={dados.visao_equipe ? null : profile?.name} onFechar={() => setResumoAberto(false)} />
        </Suspense>
      )}

      {/* ---------- O que já está reservado ---------- */}
      <section aria-labelledby="titulo-adiante" className="space-y-3">
        <TituloSecao id="titulo-adiante" titulo="A seguir" subtitulo="O que já está reservado de hoje em diante" />
        <ProximasChegadas reservas={reservas} hoje={hoje} onVerTodas={onVerReservas} />
        <div className="grid gap-4 lg:grid-cols-3">
          <Cartao titulo="Ocupação já garantida" subtitulo="Noites reservadas nos próximos dias" className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-3">
              {adiante.janelas.map((j) => (
                <Medidor key={j.dias} fracao={j.ocupacao} rotulo={`Próximos ${j.dias} dias`} detalhe={`${j.noites} de ${j.dias} noites`} />
              ))}
            </div>
          </Cartao>
          <Cifra
            rotulo="Já reservado para a frente"
            valor={adiante.receitaReservada}
            formatar={(n) => reais(n)}
            icone={<CalendarCheck />}
            tom="success"
            detalhe={
              adiante.reservasFuturas > 0
                ? `Diárias de ${adiante.reservasFuturas} ${adiante.reservasFuturas === 1 ? "reserva futura" : "reservas futuras"}`
                : "Nenhuma reserva futura por enquanto"
            }
          />
        </div>
        {(venda || ritmo.length > 0) && (
          <Revelar className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
            {venda && (
              <NoitesAVenda
                id={ALVO.noites}
                venda={venda}
                hoje={hoje}
                imovel={{ id: dados.imovel.id, nome: dados.imovel.nome }}
                podeBloquear={!dados.visao_equipe}
                onVerCalendario={onVerCalendario}
              />
            )}
            <RitmoDeVenda id={ALVO.ritmo} meses={ritmo} />
          </Revelar>
        )}
      </section>

      {/* ---------- Desempenho (responde ao filtro) ---------- */}
      <section aria-labelledby="titulo-desempenho" className="space-y-4">
        <TituloSecao
          id="titulo-desempenho"
          titulo="Desempenho"
          subtitulo={`${formatarDia(periodo.inicio, true)} a ${formatarDia(periodo.fim - 1, true)}`}
        />

        <BarraFiltros role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <AbaPilula key={p.id} ativa={periodo.id === p.id} onClick={() => setPeriodo(periodoPorId(p.id, hoje))}>
              {p.rotulo}
            </AbaPilula>
          ))}
          {periodo.id === "personalizado" && (
            <AbaPilula ativa onClick={() => setPeriodo(periodoPorId("ano", hoje))} aria-label={`Remover filtro: ${periodo.rotulo}`}>
              <span className="first-letter:uppercase">{periodo.rotulo}</span>
              <X className="h-3 w-3" aria-hidden="true" />
            </AbaPilula>
          )}
        </BarraFiltros>

        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-6">
          <Cifra
            principal
            rotulo="em diárias"
            valor={atual.receita}
            formatar={(n) => reais(n)}
            icone={<Wallet />}
            tom="primary"
            variacao={anterior ? variacao(atual.receita, anterior.receita) : null}
            detalhe="Valor das diárias, sem a taxa de limpeza"
            tendencia={passados.map((m) => m.realizado + m.reservado)}
          />
          <Cifra
            rotulo="Ocupação"
            valor={atual.ocupacao}
            formatar={(n) => pct(n)}
            icone={<Percent />}
            tom="info"
            variacao={anterior && anterior.disponiveis > 0 ? atual.ocupacao - anterior.ocupacao : null}
            variacaoEmPontos
            detalhe={`${atual.noites} de ${atual.disponiveis} noites`}
          />
          <Cifra
            rotulo="Diária média"
            valor={atual.diariaMedia}
            formatar={(n) => reais(n)}
            icone={<Moon />}
            tom="warning"
            variacao={anterior ? variacao(atual.diariaMedia, anterior.diariaMedia) : null}
            detalhe={`${reais(atual.revpar)} por noite disponível`}
          />
          <Cifra
            rotulo={atual.reservas === 1 ? "Reserva" : "Reservas"}
            valor={atual.reservas}
            formatar={(n) => Math.round(n).toLocaleString("pt-BR")}
            icone={<BedDouble />}
            tom="neutral"
            variacao={anterior ? variacao(atual.reservas, anterior.reservas) : null}
            detalhe={
              atual.reservas > 0
                ? `Estadia média de ${atual.estadiaMedia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} noites`
                : undefined
            }
          />
          {liquido != null ? (
            <Cifra
              rotulo="Seu líquido estimado"
              valor={liquido}
              formatar={(n) => reais(n)}
              icone={<TrendingUp />}
              tom="success"
              variacao={liquidoAnterior != null ? variacao(liquido, liquidoAnterior) : null}
              detalhe="Depois do canal e da comissão RIOS"
            />
          ) : (
            <Cifra
              rotulo="Hóspedes por reserva"
              valor={atual.hospedesMedios ?? 0}
              formatar={(n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              icone={<TrendingUp />}
              tom="success"
              detalhe={atual.antecedenciaMedia != null ? `Reservam com ${Math.round(atual.antecedenciaMedia)} dias de antecedência` : undefined}
            />
          )}
        </div>

        <Revelar>
          <Destaques itens={destaques} />
        </Revelar>

        {em3d && serie.some((m) => m.noites > 0) && (
          <Revelar>
            <Cartao titulo="O ano em relevo" subtitulo="Cada bloco é uma noite reservada. Quanto mais alto, maior a diária.">
              <Suspense fallback={<div className="h-[290px] animate-pulse rounded-lg bg-muted/50 sm:h-[400px] lg:h-[430px]" aria-hidden="true" />}>
                <RelevoDoAno
                  reservas={reservas}
                  meses={serie}
                  hoje={hoje}
                  primeira={primeira}
                  selecao={periodo}
                  calendario={dados.calendario}
                  onSelecionarMes={(m) => setPeriodo(periodoDoMes(m.ano, m.mes0))}
                />
              </Suspense>
            </Cartao>
          </Revelar>
        )}

        <Revelar className="grid min-w-0 items-start gap-4 lg:grid-cols-3">
          <Cartao
            className="lg:col-span-2"
            titulo="Diárias por mês"
            subtitulo="Toque num mês para filtrar a página por ele"
            acoes={
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => setVerTabela((v) => !v)}>
                {verTabela ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                {verTabela ? "Gráfico" : "Tabela"}
              </Button>
            }
          >
            {verTabela ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Mês</th>
                      <th className="px-3 py-2 text-right font-medium">Realizado</th>
                      <th className="px-3 py-2 text-right font-medium">Já reservado</th>
                      <th className="px-3 py-2 text-right font-medium">Ocupação</th>
                      {temRios && <th className="px-3 py-2 text-right font-medium">Média RIOS</th>}
                      {temMercado && <th className="px-3 py-2 text-right font-medium">Mercado</th>}
                      <th className="py-2 pl-3 text-right font-medium">Diária média</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {serie.map((m) => (
                      <tr key={m.chave} className="border-b border-border/40 last:border-0">
                        <td className="py-2 pr-3 first-letter:uppercase">{nomeDoMes(m.ano, m.mes0)}</td>
                        <td className="px-3 py-2 text-right">{m.futuro ? "—" : reais(m.realizado)}</td>
                        <td className="px-3 py-2 text-right">{m.reservado > 0 ? reais(m.reservado) : "—"}</td>
                        <td className="px-3 py-2 text-right">{m.ocupacao != null ? pct(m.ocupacao) : "—"}</td>
                        {temRios && <td className="px-3 py-2 text-right text-muted-foreground">{m.ocupacaoRios != null ? pct(m.ocupacaoRios) : "—"}</td>}
                        {temMercado && <td className="px-3 py-2 text-right text-muted-foreground">{m.ocupacaoMercado != null ? pct(m.ocupacaoMercado) : "—"}</td>}
                        <td className="py-2 pl-3 text-right">{m.diariaMedia > 0 ? reais(m.diariaMedia) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <GraficoReceitaMensal serie={serie} selecao={periodo} onSelecionarMes={(m) => setPeriodo(periodoDoMes(m.ano, m.mes0))} />
                <Legenda
                  className="mt-3"
                  itens={[
                    { cor: COR.serie1, rotulo: "Realizado" },
                    { cor: COR.serie1Clara, rotulo: "Já reservado (noites à frente)" },
                  ]}
                />
              </>
            )}
          </Cartao>

          <Cartao titulo="Como o valor se divide" subtitulo={<span className="first-letter:uppercase">{periodo.rotulo}</span>}>
            {atual.receita > 0 ? (
              <>
                <DivisaoDoValor diarias={atual.receita} taxaCanal={atual.taxaCanal} limpeza={atual.limpeza} comissaoPct={dados.comissao_pct} />
                <p className="mt-3 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
                  Estimativa a partir das reservas. O valor oficial de cada mês é o do seu relatório financeiro.
                </p>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem diárias neste período.</p>
            )}
          </Cartao>
        </Revelar>

        <Revelar className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
          <Cartao
            titulo="Ocupação mês a mês"
            subtitulo={
              temMercado
                ? "Seu imóvel, a média dos imóveis RIOS e o mercado em volta"
                : temRios
                  ? "Seu imóvel e a média dos imóveis RIOS"
                  : "Noites reservadas sobre noites do mês"
            }
          >
            <GraficoOcupacao serie={serie} selecao={periodo} />
            <Legenda
              className="mt-3"
              itens={[
                { cor: COR.serie1, rotulo: "Seu imóvel", linha: true },
                ...(temRios ? [{ cor: COR.neutro, rotulo: "Média RIOS", linha: true }] : []),
                ...(temMercado ? [{ cor: COR.serie2, rotulo: "Mercado (PriceLabs)", linha: true }] : []),
              ]}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Linha pontilhada: meses à frente, com o que já está reservado até agora.
              {temRios && " Média RIOS: só imóveis com reserva no mês."}
              {temMercado && " Mercado: imóveis vizinhos, pelo PriceLabs."}
            </p>
          </Cartao>

          <Cartao titulo="Dias da semana" subtitulo="Ocupação por noite da semana, no período">
            {atual.noites > 0 ? (
              <>
                <GraficoDiasDaSemana dias={semana} />
                <Legenda
                  className="mt-3"
                  itens={[
                    { cor: COR.serie1, rotulo: "Sexta e sábado" },
                    { cor: COR.neutro, rotulo: "Domingo a quinta" },
                  ]}
                />
              </>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Sem noites reservadas neste período.</p>
            )}
          </Cartao>
        </Revelar>

        <Revelar className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
          <Cartao titulo="Por onde chegam as reservas" subtitulo="Diárias por canal, no período">
            {canais.fatias.length > 0 ? (
              <BarraDeCanais fatias={canais.fatias} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {canais.semCanal.reservas > 0 ? "As reservas deste período vieram dos relatórios, sem o canal informado." : "Sem reservas neste período."}
              </p>
            )}
            {canais.fatias.length > 0 && canais.semCanal.reservas > 0 && (
              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
                Fora da divisão: {canais.semCanal.reservas} {canais.semCanal.reservas === 1 ? "reserva" : "reservas"} dos relatórios financeiros, sem canal informado ({reais(canais.semCanal.receita)}).
              </p>
            )}
          </Cartao>

          <Cartao
            titulo="Antecedência das reservas"
            subtitulo={
              atual.antecedenciaMedia != null
                ? `Em média, ${Math.round(atual.antecedenciaMedia)} dias antes do check-in`
                : "Quanto tempo antes o hóspede reserva"
            }
          >
            {antecedencia.some((f) => f.reservas > 0) ? (
              <BarrasHorizontais
                itens={antecedencia.map((f) => ({ rotulo: f.rotulo, parte: f.parte, valor: f.reservas }))}
                rotuloValor={(i) => `${i.valor} · ${pct(i.parte)}`}
              />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem reservas neste período.</p>
            )}
          </Cartao>
        </Revelar>

        {/* os hóspedes: de onde vêm (o mapa ganha a largura de dois cartões) e quem são */}
        <Revelar className="grid min-w-0 items-start gap-4 lg:grid-cols-3">
          <Cartao
            className="lg:col-span-2"
            titulo="De onde vêm os hóspedes"
            subtitulo={origens.conhecidas > 0 ? `Estado pelo DDD · ${origens.conhecidas} reservas com telefone informado` : "Estado ou país de quem reserva"}
          >
            {origens.lista.length > 0 && estados.length > 0 ? (
              // o mapa em blocos e, com ele, os números. Em 3D o mapa ocupa a largura do cartão e a lista vai embaixo;
              // onde o aparelho não desenha 3D fica o mapa plano à esquerda, como antes.
              <div className={cn(em3d ? "space-y-3 lg:flex lg:items-center lg:gap-6 lg:space-y-0" : "flex items-start gap-4")}>
                {em3d ? (
                  <Suspense fallback={<MapaBrasil ufs={estados} className={cn(CAIXA_DO_MAPA, "py-3 lg:w-[60%] lg:shrink-0")} />}>
                    <MapaHospedes3D ufs={estados} destino={ufDoImovel} emFoco={ufEmFoco} className={cn(CAIXA_DO_MAPA, "lg:w-[60%] lg:shrink-0")} />
                  </Suspense>
                ) : (
                  <MapaBrasil ufs={estados} className="w-[124px] shrink-0" />
                )}
                <ul className={cn("min-w-0", em3d ? "grid grid-cols-2 gap-x-5 gap-y-2 lg:flex-1 lg:grid-cols-1 lg:gap-y-2.5" : "flex-1 space-y-2 pt-0.5")}>
                  {origens.lista.map((o) => (
                    <li
                      key={o.rotulo}
                      className="flex items-baseline justify-between gap-2 text-xs"
                      onMouseEnter={() => setUfEmFoco(estados.find((e) => e.nome === o.rotulo)?.uf ?? null)}
                      onMouseLeave={() => setUfEmFoco(null)}
                    >
                      <span className="truncate text-muted-foreground">{o.rotulo}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {o.reservas} · {pct(o.parte)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : origens.lista.length > 0 ? (
              <BarrasHorizontais
                itens={origens.lista.map((o) => ({ rotulo: o.rotulo, parte: o.parte, valor: o.reservas }))}
                rotuloValor={(i) => `${i.valor} · ${pct(i.parte)}`}
              />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Ainda sem origem informada nas reservas do período.</p>
            )}
          </Cartao>

          <QuemSeHospedou id={ALVO.hospedes} perfil={perfil} />
        </Revelar>
      </section>
    </div>
  );
}
