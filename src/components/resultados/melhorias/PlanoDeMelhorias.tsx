import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import {
  AirVent, Armchair, Blinds, Check, ChevronDown, Coffee, Copy, Droplets, Flame, KeyRound, Laptop, Maximize2, Palette, PawPrint, Play, Plus, Send,
  Share2, Shirt, ShowerHead, Sofa, Sun, Tv, Utensils, WashingMachine, Waves, Wind, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { nomeDoMes, pct, reais } from "@/lib/resultadosImovel";
import {
  ESTUDO_BANXICO,
  GRUPOS,
  MELHORIA_POR_ID,
  MODELOS,
  alternarNaSimulacao,
  baseDaConta,
  comentarioDe,
  contaDoPlano,
  evidencias,
  faixaDeCusto,
  faixaDeRetorno,
  faixaEmPct,
  faixaEmReais,
  ganhoDe,
  ganhoDoItem,
  melhoriasDoImovel,
  mensagemDoPedido,
  planoSugerido,
  retornoDoItem,
  situacaoDe,
  textoParaCompartilhar,
  useMelhorias,
  type BaseDaConta,
  type Faixa,
  type Melhoria,
  type MelhoriaId,
  type MelhoriasImovel,
  type ModeloMaquete,
} from "@/lib/melhorias";
import { useContagem } from "../blocos";
import { PauloDeFilme, type ControlePaulo } from "../paulo/PauloDeFilme";
import { Maquete, type PontoDaMaquete } from "./Maquete";
import type { ManifestoMaquete } from "./maqueteCena";

const ICONE: Record<Melhoria["icone"], ComponentType<{ className?: string }>> = {
  ar: AirVent, tv: Tv, cortina: Blinds, mesa: Laptop, secador: Wind, lavadora: WashingMachine, ferro: Shirt, loucas: Utensils, agua: Droplets,
  cafe: Coffee, sofa: Sofa, pet: PawPrint, chave: KeyRound, decor: Palette, varanda: Armchair, sol: Sun, rede: Waves, ducha: ShowerHead, fogo: Flame,
};

const NOME_DO_MODELO: Record<ModeloMaquete, string> = {
  apto1: "apartamento de 1 quarto",
  apto2: "apartamento de 2 quartos",
  apto3: "apartamento de 3 quartos",
  cobertura: "cobertura duplex",
  casa_terrea: "casa térrea",
  casa_duplex: "casa de dois andares",
};

function useTelaLarga(): boolean {
  const [larga, setLarga] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const ouvir = () => setLarga(mq.matches);
    mq.addEventListener("change", ouvir);
    return () => mq.removeEventListener("change", ouvir);
  }, []);
  return larga;
}

/** O manifesto da maquete de um modelo: onde cada camada entra e o foco de cada cômodo. */
function useManifesto(modelo: ModeloMaquete) {
  return useQuery({
    queryKey: ["maquete", modelo],
    staleTime: Infinity,
    queryFn: async (): Promise<ManifestoMaquete> => {
      const resposta = await fetch(`/melhorias/${modelo}/maquete.json`);
      if (!resposta.ok) throw new Error("maquete");
      return resposta.json();
    },
  });
}

function periodoPorExtenso(dados: MelhoriasImovel): string {
  const [a1, m1] = dados.periodo.de.split("-").map(Number);
  const [a2, m2] = dados.periodo.ate.split("-").map(Number);
  return `${nomeDoMes(a1, m1 - 1)} a ${nomeDoMes(a2, m2 - 1)}`;
}

/** Faixa em reais com os dois números contando até o valor. */
function FaixaAnimada({ faixa }: { faixa: Faixa }) {
  const min = useContagem(faixa.min, 0.7);
  const max = useContagem(faixa.max, 0.7);
  return <span className="tabular-nums">{faixaEmReais({ min, max })}</span>;
}

interface Props {
  propertyId: string;
  /** Equipe conferindo a página: não envia pedido, copia o plano. */
  equipe: boolean;
}

/**
 * Plano de melhorias: a maquete do tipo do imóvel com as melhorias em camadas, o que o imóvel tem e o que falta em
 * cada cômodo, a conta de quanto cada melhoria pode render e o pedido de orçamento. Os números e as regras estão em
 * `src/lib/melhorias.ts`.
 */
export default function PlanoDeMelhorias({ propertyId, equipe }: Props) {
  const { data: dados, isLoading, error } = useMelhorias(propertyId);
  const modelo: ModeloMaquete = dados?.modelo && MODELOS.includes(dados.modelo) ? dados.modelo : "apto2";
  const { data: manifesto, isLoading: carregandoMaquete, error: erroMaquete } = useManifesto(modelo);
  const reduzido = useReducedMotion();
  const larga = useTelaLarga();
  const navigate = useNavigate();
  const [simulando, setSimulando] = useState<MelhoriaId[]>([]);
  const [escolhido, setEscolhido] = useState<MelhoriaId | null>(null);
  const [revelar, setRevelar] = useState<MelhoriaId | null>(null);
  const [tocando, setTocando] = useState(false);
  const [fala, setFala] = useState<string | null>(null);
  const controle = useRef<ControlePaulo | null>(null);
  const fila = useRef<number[]>([]);

  const base = useMemo(() => (dados ? baseDaConta(dados) : null), [dados]);
  const naMaquete = useMemo(() => (manifesto ? manifesto.camadas.map((c) => c.id) : []), [manifesto]);
  const disponiveis = useMemo(() => melhoriasDoImovel(dados, naMaquete), [dados, naMaquete]);
  const jaTem = useMemo(() => disponiveis.filter((m) => situacaoDe(dados, m.id) === "tem").map((m) => m.id), [disponiveis, dados]);
  const faltam = useMemo(() => disponiveis.filter((m) => situacaoDe(dados, m.id) !== "tem"), [disponiveis, dados]);
  const sugerido = useMemo(() => (dados ? planoSugerido(dados, disponiveis) : []), [dados, disponiveis]);
  const conta = useMemo(() => (base ? contaDoPlano(simulando, base, dados) : null), [simulando, base, dados]);
  const potencial = useMemo(() => (base ? contaDoPlano(sugerido, base, dados) : null), [sugerido, base, dados]);
  // na maquete: o que o imóvel tem e o que está na simulação; a lava e seca fica no lugar da máquina comum
  const ativos = useMemo(() => {
    const lista = [...jaTem, ...simulando];
    return lista.includes("lava_seca") ? lista.filter((id) => id !== "lavadora") : lista;
  }, [jaTem, simulando]);
  const meu = equipe ? "Este imóvel" : "Seu imóvel";

  const pararPlano = useCallback(() => {
    fila.current.forEach((t) => window.clearTimeout(t));
    fila.current = [];
    setTocando(false);
  }, []);
  useEffect(() => pararPlano, [pararPlano]);

  const dizer = useCallback((texto: string, gesto: Parameters<ControlePaulo["gesto"]>[0] = "fala") => {
    setFala(texto);
    controle.current?.gesto(gesto);
  }, []);

  const alternar = useCallback(
    (id: MelhoriaId) => {
      pararPlano();
      const entra = !simulando.includes(id);
      setRevelar(id);
      setEscolhido(id);
      setSimulando(alternarNaSimulacao(simulando, id));
      if (entra && dados) dizer(comentarioDe(id, dados), ganhoDe(MELHORIA_POR_ID[id], dados) ? "cheer" : "point");
      else dizer("Tirei da simulação. A conta voltou.");
    },
    [simulando, dados, pararPlano, dizer],
  );

  const escolher = useCallback(
    (id: MelhoriaId) => {
      pararPlano();
      setEscolhido((atual) => (atual === id ? null : id));
      document.getElementById(`melhoria-${id}`)?.scrollIntoView({ block: "nearest", behavior: reduzido ? "auto" : "smooth" });
    },
    [pararPlano, reduzido],
  );

  /** Aplica o plano sugerido uma melhoria por vez, com a câmera passando por cada cômodo. */
  const tocarPlano = useCallback(() => {
    pararPlano();
    const fila_ = sugerido.filter((id) => !simulando.includes(id));
    if (fila_.length === 0 || !base || !dados) return;
    setTocando(true);
    let quando = 0;
    let lista = simulando;
    for (const id of fila_) {
      fila.current.push(window.setTimeout(() => setEscolhido(id), quando));
      quando += reduzido ? 60 : 800;
      const proxima = alternarNaSimulacao(lista, id);
      lista = proxima;
      fila.current.push(
        window.setTimeout(() => {
          setRevelar(id);
          setSimulando(proxima);
          dizer(comentarioDe(id, dados), "cheer");
        }, quando),
      );
      quando += reduzido ? 200 : 1700;
    }
    const todas = contaDoPlano(lista, base, dados);
    fila.current.push(
      window.setTimeout(() => {
        setEscolhido(null);
        setTocando(false);
        dizer(
          todas.ganhoAno
            ? `Com o plano todo, a estimativa é de ${faixaEmReais(todas.ganhoAno)} a mais por ano. ${equipe ? "" : "Quer que a equipe faça o orçamento?"}`.trim()
            : "Este é o plano todo. A equipe faz o orçamento se você quiser.",
          "dance",
        );
      }, quando + 200),
    );
  }, [sugerido, simulando, base, dados, reduzido, equipe, pararPlano, dizer]);

  // primeira fala: o retrato do imóvel
  const primeira = useMemo(() => {
    if (!dados) return null;
    if (!dados.tem) return "Esta é uma maquete de exemplo. Toque numa melhoria para ver na maquete e na conta.";
    if (faltam.length === 0) return `${meu} já tem tudo o que a gente acompanha. É o padrão dos que mais rendem.`;
    return `${meu} já tem ${jaTem.length} dos ${disponiveis.length} itens que a gente acompanha. ${faltam.length === 1 ? "Falta um" : `Faltam ${faltam.length}`}: toque para simular.`;
  }, [dados, faltam, jaTem, disponiveis, meu]);

  if (isLoading || carregandoMaquete) {
    return (
      <div className="grid gap-4 lg:grid-cols-12" aria-busy="true" aria-label="Carregando o plano de melhorias">
        <Skeleton className="aspect-[4/3] w-full rounded-2xl lg:col-span-7" />
        <div className="space-y-3 lg:col-span-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (error || erroMaquete || !dados || !base || !manifesto) {
    return <EmptyState ilustracao="busca" title="Não foi possível montar o plano de melhorias" description="Tente de novo em instantes." />;
  }

  const pontos: PontoDaMaquete[] = disponiveis.map((m) => ({
    id: m.id,
    rotulo: m.curto,
    estado: jaTem.includes(m.id) ? "tem" : simulando.includes(m.id) ? "simulando" : "falta",
  }));
  const camadaDe = (id: MelhoriaId) => manifesto.camadas.find((c) => c.id === id);
  const foco = escolhido ? (camadaDe(escolhido)?.comodo ?? null) : null;
  const pedido = conta && simulando.length > 0 ? mensagemDoPedido(dados, conta) : null;
  const completo = sugerido.length > 0 && sugerido.every((id) => simulando.includes(id));
  const limpar = () => {
    pararPlano();
    setRevelar(null);
    setEscolhido(null);
    setSimulando([]);
    setFala(null);
  };
  const textoDaFala = fala ?? primeira;

  const copiar = (texto: string) => {
    if (!navigator.clipboard) {
      toast.error("Não foi possível copiar");
      return;
    }
    navigator.clipboard
      .writeText(texto)
      .then(() => toast.success("Plano copiado"))
      .catch(() => toast.error("Não foi possível copiar"));
  };
  /** Manda o plano a outra pessoa: a folha de compartilhar do aparelho, ou a área de transferência. */
  const compartilhar = () => {
    if (!conta) return;
    const texto = textoParaCompartilhar(dados, conta);
    if (typeof navigator.share === "function") {
      navigator.share({ title: "Plano de melhorias", text: texto }).catch(() => undefined);
      return;
    }
    copiar(texto);
  };
  const pedir = () => {
    if (!pedido || !conta) return;
    if (equipe) {
      copiar(textoParaCompartilhar(dados, conta));
      return;
    }
    navigate(`/novo-ticket?property=${dados.imovel.id}`, { state: { tipo: "melhorias_compras", assunto: pedido.assunto, mensagem: pedido.mensagem } });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Plano de melhorias</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">O que faria {equipe ? dados.imovel.nome : "o seu imóvel"} render mais</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            O que o imóvel tem e o que falta em cada cômodo, na maquete e na conta. Os valores são estimativas, feitas com os dados dos{" "}
            {dados.carteira.imoveis} imóveis que a RIOS acompanha.
          </p>
        </div>
        {sugerido.length > 0 && (
          <Button variant={completo && !tocando ? "outline" : "default"} onClick={tocando ? pararPlano : completo ? limpar : tocarPlano}>
            {tocando || completo ? <X className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            {tocando ? "Parar" : completo ? "Limpar a simulação" : "Ver o plano sugerido"}
          </Button>
        )}
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        {/* palco: fica à vista enquanto a lista rola */}
        <div className="sticky top-[98px] z-20 -mx-1 bg-background px-1 pb-2 pt-1.5 lg:col-span-7 lg:mx-0 lg:px-0 lg:pb-0 lg:pt-3">
          <Maquete
            key={manifesto.modelo}
            manifesto={manifesto}
            ativos={ativos}
            revelar={revelar}
            foco={foco}
            pontos={pontos}
            escolhido={escolhido}
            aoEscolher={escolher}
            margemBase={larga ? 92 : 74}
            className="h-[70vw] max-h-[340px] min-h-[240px] w-full rounded-2xl shadow-lg sm:max-h-[440px] lg:h-auto lg:max-h-none lg:aspect-[4/3]"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2.5 md:p-3">
              <span className="rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-secondary-foreground backdrop-blur">
                Maquete de exemplo: {NOME_DO_MODELO[modelo]}
                <span className="hidden sm:inline"> · arraste para girar</span>
              </span>
              {escolhido && (
                <button
                  type="button"
                  onClick={() => {
                    pararPlano();
                    setEscolhido(null);
                  }}
                  className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-secondary-foreground backdrop-blur transition-colors hover:bg-secondary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Maximize2 className="h-3 w-3" aria-hidden="true" />
                  Ver tudo
                </button>
              )}
            </div>

            {/* o Paulo apresenta: em tela larga, o dos vídeos no canto da maquete */}
            {larga && (
              <div className="pointer-events-none absolute bottom-0 right-1 z-20 hidden h-[44%] max-h-[240px] items-end lg:flex" aria-hidden="true">
                <div className="relative aspect-[4/5] h-full [mask-image:linear-gradient(to_bottom,black_82%,transparent)]">
                  <PauloDeFilme controle={controle} parado={!!reduzido} aoChegar={() => undefined} className="absolute inset-0" />
                </div>
              </div>
            )}

            {/* a conta, sempre junto da maquete */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-2.5 md:p-3 lg:pr-[150px] xl:pr-[176px]">
              <div className="rounded-xl bg-secondary/80 px-3 py-2 text-secondary-foreground shadow-lg backdrop-blur-md" role="status" aria-live="polite">
                {conta && simulando.length > 0 ? (
                  <>
                    <p className="text-[10px] font-medium uppercase tracking-wide opacity-75">A mais por ano, na estimativa</p>
                    <p className="text-lg font-semibold leading-tight md:text-xl">
                      {conta.ganhoAno ? <FaixaAnimada faixa={conta.ganhoAno} /> : conta.fracao ? `+${faixaEmPct(conta.fracao)} nas diárias` : "sem estimativa de receita"}
                    </p>
                    <p className="mt-0.5 text-[11px] opacity-90 md:text-xs">
                      Investimento de <FaixaAnimada faixa={conta.investimento} />
                      {conta.retornoMeses ? ` · se paga ${faixaDeRetorno(conta.retornoMeses)}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-xs md:text-sm">{textoDaFala}</p>
                )}
              </div>
            </div>
          </Maquete>
          {/* a fala do Paulo, quando a conta ocupa a faixa da maquete */}
          {conta && simulando.length > 0 && textoDaFala && (
            <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground md:text-sm">
              <img src="/paulo/descanso.webp" alt="" aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full bg-secondary object-cover object-top lg:hidden" />
              <span className="min-w-0 pt-1 lg:pt-0">
                <span className="font-medium text-foreground">Paulo:</span> {textoDaFala}
              </span>
            </p>
          )}
        </div>

        {/* o que tem e o que falta, cômodo a cômodo */}
        <div className="min-w-0 space-y-3 lg:col-span-5">
          {!dados.tem && (
            <p className="rounded-xl border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
              A ficha deste imóvel ainda não foi lida, então a maquete começa sem nada marcado. Os valores e a conta são os mesmos.
            </p>
          )}
          {GRUPOS.map((grupo) => {
            const itens = disponiveis.filter((m) => m.grupo === grupo.id);
            if (itens.length === 0) return null;
            const tem = itens.filter((m) => jaTem.includes(m.id)).length;
            return (
              <section key={grupo.id} className="rounded-xl border border-border/70 bg-card shadow-sm">
                <h3 className="flex items-baseline justify-between gap-2 px-4 pb-1 pt-3 text-sm font-semibold tracking-tight">
                  {grupo.nome}
                  <span className="text-xs font-normal text-muted-foreground">{dados.tem ? `tem ${tem} de ${itens.length}` : `${itens.length} ${itens.length === 1 ? "item" : "itens"}`}</span>
                </h3>
                <ul className="divide-y divide-border/60">
                  {itens.map((m) => (
                    <LinhaMelhoria
                      key={m.id}
                      m={m}
                      dados={dados}
                      base={base}
                      tem={jaTem.includes(m.id)}
                      naSimulacao={simulando.includes(m.id)}
                      aberta={escolhido === m.id}
                      aoAlternar={() => alternar(m.id)}
                      aoEscolher={() => escolher(m.id)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {/* o plano e o pedido */}
      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm md:p-5">
        {conta && simulando.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight md:text-[15px]">
                {equipe ? "Plano simulado" : "Seu plano"}: {simulando.length} {simulando.length === 1 ? "melhoria" : "melhorias"}
              </h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {simulando.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => alternar(id)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-1 pl-2.5 pr-1.5 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Tirar ${MELHORIA_POR_ID[id].nome} da simulação`}
                    >
                      {MELHORIA_POR_ID[id].curto}
                      <X className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Investimento estimado</dt>
                  <dd className="text-base font-semibold tabular-nums">{faixaEmReais(conta.investimento)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">A mais por ano{base.comComissao ? (equipe ? ", para o proprietário" : ", para você") : ""}</dt>
                  <dd className="text-base font-semibold tabular-nums text-success">
                    {conta.ganhoAno ? faixaEmReais(conta.ganhoAno) : conta.fracao ? `+${faixaEmPct(conta.fracao)} nas diárias` : "sem estimativa de receita"}
                  </dd>
                </div>
                {conta.retornoMeses && (
                  <div>
                    <dt className="text-xs text-muted-foreground">O investimento volta</dt>
                    <dd className="text-base font-semibold">{faixaDeRetorno(conta.retornoMeses)}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                Estimativa, não garantia de receita. {conta.ganhoAno ? `Conta feita sobre ${reais(base.diarias)} em diárias nos últimos 12 meses.` : ""}
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <Button size="lg" onClick={pedir}>
                {equipe ? <Copy className="mr-2 h-4 w-4" aria-hidden="true" /> : <Send className="mr-2 h-4 w-4" aria-hidden="true" />}
                {equipe ? "Copiar o plano" : "Pedir orçamento à RIOS"}
              </Button>
              {!equipe && (
                <Button variant="outline" onClick={compartilhar}>
                  <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Compartilhar o plano
                </Button>
              )}
              <p className="max-w-[240px] text-xs text-muted-foreground md:text-right">
                {equipe
                  ? "Só o proprietário envia o pedido. Você pode copiar o plano e mandar para ele."
                  : "O pedido abre um chamado com o plano já escrito. Você revisa antes de enviar, e nada é comprado sem o seu sim."}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight md:text-[15px]">
                {sugerido.length === 0 ? "Nada a sugerir por enquanto" : `${sugerido.length === 1 ? "Uma melhoria" : `${sugerido.length} melhorias`} no plano sugerido`}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {potencial?.ganhoAno
                  ? `São as que têm estimativa de receita. Com todas, a estimativa é de ${faixaEmReais(potencial.ganhoAno)} a mais por ano, para um investimento de ${faixaEmReais(potencial.investimento)}.`
                  : sugerido.length === 0
                    ? "O imóvel já tem tudo o que tem estimativa de receita. Os outros itens ficam na lista, pelo conforto do hóspede."
                    : !base.temHistorico
                      ? "Este imóvel ainda não tem histórico suficiente para a conta em reais: os ganhos aparecem em porcentagem."
                      : "Toque em Simular nas melhorias para montar o plano."}
              </p>
            </div>
            {sugerido.length > 0 && (
              <Button variant="outline" onClick={tocarPlano}>
                <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Ver na maquete
              </Button>
            )}
          </div>
        )}
      </section>

      <details className="group rounded-xl border border-border/70 bg-card p-4 text-sm shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          Como esta conta é feita
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground md:text-sm">
          <li>
            A base são as diárias {equipe ? "do imóvel" : "do seu imóvel"} de {periodoPorExtenso(dados)}: {reais(base.diarias)}, com {pct(base.ocupacao)} das noites ocupadas.
          </li>
          <li>
            O ganho de cada melhoria é uma faixa conservadora: uma parte da diferença entre os imóveis da RIOS que têm o item e os que não têm, e do que um
            estudo com anúncios de praia mediu. Imóveis diferem em tamanho e localização, então a diferença inteira não é efeito do item.
          </li>
          <li>Vários itens não têm estimativa de receita: não achamos número confiável. Eles entram no investimento, não no ganho.</li>
          <li>
            "A mais por ano" já desconta a taxa do canal de reserva{base.comComissao ? " e a comissão da RIOS" : ""}. Ganhos de várias melhorias não se somam por
            inteiro.
          </li>
          <li>O investimento é uma faixa de mercado para compra e instalação. O valor real vem no orçamento da equipe.</li>
          <li>O que o imóvel já tem vem da ficha do imóvel, cômodo a cômodo. Se algo estiver desatualizado, avise a equipe.</li>
          <li>A maquete é um imóvel de exemplo do mesmo tipo, não a planta {equipe ? "do imóvel" : "do seu imóvel"}. Ela mostra até três quartos.</li>
          <li>
            Estudo citado: {ESTUDO_BANXICO.autores},{" "}
            <a href={ESTUDO_BANXICO.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
              {ESTUDO_BANXICO.onde}
            </a>
            .
          </li>
        </ul>
      </details>
    </div>
  );
}

interface LinhaProps {
  m: Melhoria;
  dados: MelhoriasImovel;
  base: BaseDaConta;
  tem: boolean;
  naSimulacao: boolean;
  aberta: boolean;
  aoAlternar: () => void;
  aoEscolher: () => void;
}

/** Uma melhoria na lista do cômodo: o que é, se o imóvel tem, quanto custa e quanto pode render. Abre ao tocar. */
function LinhaMelhoria({ m, dados, base, tem, naSimulacao, aberta, aoAlternar, aoEscolher }: LinhaProps) {
  const Icone = ICONE[m.icone];
  const g = ganhoDe(m, dados);
  const ganho = ganhoDoItem(m, base, dados);
  const retorno = retornoDoItem(m, base, dados);
  return (
    <li id={`melhoria-${m.id}`} className={cn("scroll-mt-[460px] px-3 py-2.5 transition-colors lg:scroll-mt-32", naSimulacao && "bg-primary/5", aberta && !naSimulacao && "bg-muted/40")}>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={aoEscolher}
          aria-expanded={aberta}
          aria-label={`${m.nome}: ver na maquete e abrir os detalhes`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              tem ? "bg-success/15 text-success" : naSimulacao ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
            )}
          >
            <Icone className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium leading-snug">{m.nome}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {tem ? (
                "Já tem"
              ) : (
                <>
                  {g && (
                    <span className="font-medium text-success">
                      {ganho ? `+${faixaEmReais(ganho)}/ano` : `+${faixaEmPct(g)} nas diárias`}
                      {" · "}
                    </span>
                  )}
                  {faixaDeCusto(m)}
                </>
              )}
            </span>
          </span>
        </button>
        {tem ? (
          <Check className="mr-1 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <Button size="sm" variant={naSimulacao ? "default" : "outline"} onClick={aoAlternar} aria-pressed={naSimulacao} className="h-8 shrink-0 px-2.5 text-xs">
            {naSimulacao ? <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
            {naSimulacao ? "Simulando" : "Simular"}
          </Button>
        )}
      </div>
      {aberta && (
        <div className="ml-[42px] mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <p>{m.oQueE}</p>
          {!tem && (
            <p>
              Investimento: {faixaDeCusto(m)} ({m.custoNota}).{retorno ? ` Se paga ${faixaDeRetorno(retorno)}.` : ""}
            </p>
          )}
          <ul className="space-y-1 border-l-2 border-primary/30 pl-2.5">
            {evidencias(m.id, dados).map((p, i) => (
              <li key={i}>{p.texto}</li>
            ))}
            {!tem && dados.tem && <li>Está na lista porque não consta na ficha do imóvel. Se o imóvel já tiver, avise a equipe.</li>}
          </ul>
        </div>
      )}
    </li>
  );
}
