import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialogo from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, Loader2, Pause, Play, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { calcularReserva, capaGrande, hojeDia, nomeDoMes, paraDia, type ResultadoImovel } from "@/lib/resultadosImovel";
import { marcarResumoVisto, mesesComResumo, montarResumo, type MesRef, type ResumoMes } from "@/lib/resumoDoMes";
import { baixarImagem, gerarCartaoDoResumo, nomeDoArquivo, podeCompartilharArquivo } from "./compartilhar";
import { SlideAdiante, SlideCapa, SlideComparacao, SlideDiarias, SlideFecho, SlideHospedes, SlideNoites, temAdiante, temComparacao } from "./slides";

/**
 * "Resumo do mês": a história do mês fechado de um imóvel, em telas que passam
 * sozinhas (como um status do WhatsApp). Toque à direita avança, à esquerda
 * volta, segurar pausa. No computador vira um cartão no formato de celular, com
 * setas ao lado e as setas do teclado.
 *
 * Tudo é calculado no navegador a partir do que a página de resultados já
 * carregou (`montarResumo`); abrir a história não faz consulta nova. Os fundos
 * em vídeo e o Mini Paulo ficam em /public/resumo e só baixam aqui.
 */

type Tela = "capa" | "noites" | "diarias" | "hospedes" | "comparacao" | "adiante" | "fecho";

/** Quanto cada tela fica no ar, em ms. O fecho não passa sozinho. */
const DURACAO: Record<Tela, number> = {
  capa: 5000,
  noites: 7000,
  diarias: 7500,
  hospedes: 8000,
  comparacao: 7000,
  adiante: 7500,
  fecho: 9000,
};

const FUNDO_VIDEO: Partial<Record<Tela, string>> = {
  noites: "noite",
  diarias: "dourado",
  adiante: "mar",
};

interface Props {
  dados: ResultadoImovel;
  onFechar: () => void;
  /** Mês que abre. Sem ele, o último mês fechado com reservas. */
  mesInicial?: MesRef;
  /** Nome de quem vê, para o balão da capa */
  nomePessoa?: string | null;
  /** No fecho: "Ver resultados completos". Sem ele, o botão só fecha a história. */
  onVerCompleto?: () => void;
}

export default function ResumoDoMes({ dados, onFechar, mesInicial, nomePessoa, onVerCompleto }: Props) {
  const reduzido = useReducedMotion();
  const hoje = hojeDia();
  const reservas = useMemo(() => dados.reservas.map(calcularReserva), [dados]);
  const primeira = dados.primeira_reserva ? paraDia(dados.primeira_reserva) : null;
  const meses = useMemo(() => mesesComResumo(reservas, hoje, primeira), [reservas, hoje, primeira]);

  const [mes, setMes] = useState<MesRef | undefined>(mesInicial ?? meses[0]);
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);

  const resumo = useMemo(() => (mes ? montarResumo(dados, reservas, mes, hoje, primeira) : null), [dados, reservas, mes, hoje, primeira]);

  const telas = useMemo<Tela[]>(() => {
    if (!resumo) return [];
    const lista: Tela[] = ["capa", "noites", "diarias", "hospedes"];
    if (temComparacao(resumo)) lista.push("comparacao");
    if (temAdiante(resumo)) lista.push("adiante");
    lista.push("fecho");
    return lista;
  }, [resumo]);

  const tela = telas[Math.min(indice, telas.length - 1)];
  const ultima = indice >= telas.length - 1;

  // O anel da miniatura apaga quando a pessoa abre o resumo mais recente.
  useEffect(() => {
    if (mes && meses[0] && mes.chave === meses[0].chave) marcarResumoVisto(dados.imovel.id, mes.chave);
  }, [mes, meses, dados.imovel.id]);

  /* ---------- passagem das telas ---------- */

  const progresso = useRef(0);
  const barras = useRef<(HTMLSpanElement | null)[]>([]);
  const pintar = useCallback(() => {
    barras.current.forEach((el, i) => {
      if (!el) return;
      const p = i < indice ? 1 : i === indice ? progresso.current : 0;
      el.style.transform = `scaleX(${p})`;
    });
  }, [indice]);

  const avancar = useCallback(() => {
    progresso.current = 0;
    setIndice((i) => Math.min(i + 1, telas.length - 1));
  }, [telas.length]);

  const voltar = useCallback(() => {
    progresso.current = 0;
    setIndice((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    pintar();
  }, [pintar, mes]);

  const parado = pausado || compartilhando;
  useEffect(() => {
    if (!tela || parado) return;
    // Sem movimento: a pessoa passa as telas no toque; a barra já nasce cheia.
    if (reduzido) {
      progresso.current = 1;
      pintar();
      return;
    }
    let quadro = 0;
    let antes = performance.now();
    const passo = (agora: number) => {
      // aba em segundo plano congela o relógio; o salto na volta não conta
      const dt = Math.min(agora - antes, 120);
      antes = agora;
      progresso.current = Math.min(1, progresso.current + dt / DURACAO[tela]);
      pintar();
      if (progresso.current >= 1) {
        if (!ultima) avancar();
        return;
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tela, parado, reduzido, ultima, avancar, pintar]);

  // Teclado: setas passam, espaço pausa. (Esc é do diálogo.)
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (compartilhando) return;
      if (e.key === "ArrowRight") avancar();
      else if (e.key === "ArrowLeft") voltar();
      else if (e.key === " " || e.code === "Space") {
        // espaço em cima de um botão é do botão
        if ((e.target as HTMLElement | null)?.closest("button, a, input, [role=switch]")) return;
        e.preventDefault();
        setPausado((p) => !p);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [avancar, voltar, compartilhando]);

  // Toque: soltar rápido passa a tela; segurar só pausa.
  const toque = useRef(0);
  const aoApertar = () => {
    toque.current = performance.now();
    setPausado(true);
  };
  const aoSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    const segurou = performance.now() - toque.current > 260;
    setPausado(false);
    if (segurou) return;
    const caixa = e.currentTarget.getBoundingClientRect();
    if (e.clientX - caixa.left < caixa.width * 0.3) voltar();
    else avancar();
  };

  const trocarMes = (m: MesRef) => {
    progresso.current = 0;
    setIndice(0);
    setMes(m);
  };

  if (!resumo || !mes || !tela) return null;

  const imovel = dados.imovel;
  const capa = capaGrande(imovel.capa, 960);
  const outrosMeses = meses
    .filter((m) => m.chave !== mes.chave)
    .slice(0, 5)
    .map((m) => ({ ...m, rotulo: nomeDoMes(m.ano, m.mes0, false).slice(0, 3) + (m.ano !== mes.ano ? ` ${String(m.ano).slice(2)}` : "") }));

  const chaveTela = `${mes.chave}-${tela}`;

  return (
    <Dialogo.Root open onOpenChange={(aberto) => !aberto && onFechar()}>
      <Dialogo.Portal>
        <Dialogo.Overlay className="fixed inset-0 z-[60] animate-fade-in backdrop-blur-sm" style={{ background: "hsl(var(--rios-blue-deep) / 0.86)" }} />
        <Dialogo.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onClick={(e) => e.target === e.currentTarget && onFechar()}
          className="fixed inset-0 z-[61] flex items-center justify-center gap-4 outline-none"
        >
          <Dialogo.Title className="sr-only">
            Resumo de {resumo.mes.nomeComAno} de {imovel.nome}
          </Dialogo.Title>

          <BotaoLateral lado="esquerda" onClick={voltar} desligado={indice === 0} />

          <div
            // overflow-clip impede até a rolagem feita pelo navegador ao focar um botão; onde não existe
            // (Safari antigo) vale o overflow-hidden, e o onScroll devolve a moldura ao lugar.
            onScroll={(e) => {
              e.currentTarget.scrollTop = 0;
              e.currentTarget.scrollLeft = 0;
            }}
            className="relative h-full w-full overflow-hidden overflow-clip bg-secondary text-secondary-foreground sm:aspect-[9/16] sm:h-[min(92dvh,840px)] sm:w-auto sm:rounded-[28px] sm:shadow-2xl sm:ring-1 sm:ring-secondary-foreground/15"
          >
            {/* fundo */}
            <AnimatePresence initial={false}>
              <motion.div
                key={chaveTela}
                // a foto é ampliada (aproximação lenta, desfoque no fecho): o que passa da moldura é cortado aqui
                className="absolute inset-0 overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduzido ? 0 : 0.45 }}
              >
                <Fundo tela={tela} capa={capa} parado={parado || !!reduzido} />
              </motion.div>
            </AnimatePresence>

            {/* toque: esquerda volta, direita avança, segurar pausa */}
            <div
              className="absolute inset-0 z-10 cursor-pointer touch-manipulation select-none"
              onPointerDown={aoApertar}
              onPointerUp={aoSoltar}
              onPointerCancel={() => setPausado(false)}
              onPointerLeave={() => setPausado(false)}
              onContextMenu={(e) => e.preventDefault()}
              aria-hidden="true"
            />

            {/* conteúdo da tela */}
            {/* com o painel de compartilhar por cima, os botões da tela saem do foco e da leitura de tela */}
            <div key={chaveTela} className={cn("pointer-events-none absolute inset-0 z-20", compartilhando && "invisible")}>
              {tela === "capa" && <SlideCapa resumo={resumo} imovel={imovel.nome} nomePessoa={nomePessoa} />}
              {tela === "noites" && <SlideNoites resumo={resumo} />}
              {tela === "diarias" && <SlideDiarias resumo={resumo} />}
              {tela === "hospedes" && <SlideHospedes resumo={resumo} />}
              {tela === "comparacao" && <SlideComparacao resumo={resumo} />}
              {tela === "adiante" && <SlideAdiante resumo={resumo} hoje={hoje} />}
              {tela === "fecho" && (
                <SlideFecho
                  resumo={resumo}
                  outrosMeses={outrosMeses}
                  onCompartilhar={() => setCompartilhando(true)}
                  onVerCompleto={onVerCompleto ?? onFechar}
                  onRever={() => trocarMes(mes)}
                  onTrocarMes={trocarMes}
                />
              )}
            </div>

            {/* topo: barras de progresso, de qual imóvel é, pausa e fechar */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-secondary/70 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="flex gap-1" role="progressbar" aria-label="Telas do resumo" aria-valuemin={1} aria-valuemax={telas.length} aria-valuenow={indice + 1}>
                {telas.map((t, i) => (
                  <span key={t} className="h-[3px] flex-1 overflow-hidden rounded-full bg-secondary-foreground/30">
                    <span
                      ref={(el) => (barras.current[i] = el)}
                      className="block h-full w-full origin-left rounded-full bg-secondary-foreground"
                      style={{ transform: `scaleX(${i < indice ? 1 : 0})` }}
                    />
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                {/* a logo é azul: o fundo dela é claro nos dois temas */}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary-foreground p-1.5 ring-2 ring-primary">
                  <img src="/logo.png" alt="" className="h-full w-full object-contain" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">{imovel.nome}</p>
                  <p className="truncate text-xs text-secondary-foreground/75 first-letter:uppercase">{resumo.mes.nomeComAno}</p>
                </div>
                {!reduzido && (
                  <button
                    type="button"
                    onClick={() => setPausado((p) => !p)}
                    aria-label={pausado ? "Continuar" : "Pausar"}
                    className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full text-secondary-foreground/90 transition-colors hover:bg-secondary-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground"
                  >
                    {pausado ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
                  </button>
                )}
                <Dialogo.Close asChild>
                  <button
                    type="button"
                    aria-label="Fechar o resumo"
                    className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full text-secondary-foreground/90 transition-colors hover:bg-secondary-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </Dialogo.Close>
              </div>
            </div>

            {/* dica de como passar, só na capa */}
            {tela === "capa" && !reduzido && (
              <p className="pointer-events-none absolute inset-x-0 bottom-3 z-20 text-center text-[11px] font-medium text-secondary-foreground/75 sm:hidden">
                Toque para avançar
              </p>
            )}

            {compartilhando && <PainelCompartilhar resumo={resumo} imovel={imovel} onVoltar={() => setCompartilhando(false)} />}

            {/* a próxima tela já vai baixando o fundo dela */}
            <PreCarga telas={telas} indice={indice} />
          </div>

          <BotaoLateral lado="direita" onClick={avancar} desligado={ultima} />
        </Dialogo.Content>
      </Dialogo.Portal>
    </Dialogo.Root>
  );
}

/* ------------------------------------------------------------------------ */
/* Fundo de cada tela                                                        */
/* ------------------------------------------------------------------------ */

function Fundo({ tela, capa, parado }: { tela: Tela; capa: string | null; parado: boolean }) {
  const [semFoto, setSemFoto] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (parado) el.pause();
    else void el.play().catch(() => undefined);
  }, [parado, tela]);

  const usaFoto = (tela === "capa" || tela === "fecho") && capa && !semFoto;
  const arquivo = FUNDO_VIDEO[tela] ?? (tela === "capa" || tela === "fecho" ? "mar" : null);

  return (
    <>
      {usaFoto ? (
        <img
          src={capa}
          alt=""
          onError={() => setSemFoto(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            tela === "capa" ? "motion-safe:animate-aproximar-foto" : "scale-110 blur-md",
          )}
        />
      ) : arquivo ? (
        <video
          ref={video}
          key={arquivo}
          muted
          loop
          playsInline
          autoPlay={!parado}
          preload="auto"
          poster={`/resumo/fundo-${arquivo}.jpg`}
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={`/resumo/fundo-${arquivo}.mp4`} type="video/mp4" />
        </video>
      ) : (
        // hóspedes e comparação: o fluxo da marca, o mesmo do topo da página de resultados
        <video
          ref={video}
          key="fluxo"
          muted
          loop
          playsInline
          autoPlay={!parado}
          preload="auto"
          poster="/animacoes/rios-fluxo-poster.jpg"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/animacoes/rios-fluxo.webm" type="video/webm" />
          <source src="/animacoes/rios-fluxo.mp4" type="video/mp4" />
        </video>
      )}
      {/* véu azul: a leitura não pode depender do quadro do vídeo */}
      <div
        className={cn(
          "absolute inset-0",
          tela === "capa" && "bg-gradient-to-b from-secondary/80 via-secondary/35 to-secondary/85",
          tela === "noites" && "bg-gradient-to-b from-secondary/55 via-secondary/20 to-secondary/60",
          tela === "diarias" && "bg-gradient-to-b from-secondary/75 via-secondary/35 to-secondary/65",
          tela === "adiante" && "bg-gradient-to-b from-secondary/90 via-secondary/60 to-secondary/45",
          tela === "fecho" && "bg-gradient-to-b from-secondary/85 via-secondary/65 to-secondary/80",
          (tela === "hospedes" || tela === "comparacao") && "bg-gradient-to-b from-secondary/55 via-secondary/25 to-secondary/50",
        )}
        aria-hidden="true"
      />
    </>
  );
}

/** Baixa o fundo da tela seguinte enquanto a atual está no ar. */
function PreCarga({ telas, indice }: { telas: Tela[]; indice: number }) {
  const proxima = telas[indice + 1];
  const arquivo = proxima ? FUNDO_VIDEO[proxima] : null;
  if (!arquivo) return null;
  return <video key={arquivo} muted playsInline preload="auto" aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute h-px w-px opacity-0" src={`/resumo/fundo-${arquivo}.mp4`} />;
}

function BotaoLateral({ lado, onClick, desligado }: { lado: "esquerda" | "direita"; onClick: () => void; desligado: boolean }) {
  const Icone = lado === "esquerda" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desligado}
      aria-label={lado === "esquerda" ? "Tela anterior" : "Próxima tela"}
      className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-foreground/15 text-secondary-foreground transition hover:bg-secondary-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground disabled:opacity-0 sm:flex"
    >
      <Icone className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/* ------------------------------------------------------------------------ */
/* Compartilhar                                                              */
/* ------------------------------------------------------------------------ */

function PainelCompartilhar({ resumo, imovel, onVoltar }: { resumo: ResumoMes; imovel: ResultadoImovel["imovel"]; onVoltar: () => void }) {
  const [comValores, setComValores] = useState(false);
  const [imagem, setImagem] = useState<{ blob: Blob; url: string } | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    let url: string | null = null;
    setErro(false);
    gerarCartaoDoResumo({ resumo, imovel: { nome: imovel.nome, capa: imovel.capa }, comValores })
      .then((blob) => {
        if (!vivo) return;
        url = URL.createObjectURL(blob);
        setImagem({ blob, url });
      })
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [resumo, imovel.nome, imovel.capa, comValores]);

  const nome = nomeDoArquivo(resumo, imovel);
  const arquivo = imagem ? new File([imagem.blob], nome, { type: "image/png" }) : null;
  const compartilha = !!arquivo && podeCompartilharArquivo(arquivo);

  const compartilhar = async () => {
    if (!arquivo) return;
    try {
      await navigator.share({ files: [arquivo], title: `Resumo de ${resumo.mes.nomeComAno}`, text: `${imovel.nome}: resumo de ${resumo.mes.nomeComAno}` });
    } catch (e) {
      // fechar a folha de compartilhar não é erro
      if ((e as { name?: string })?.name !== "AbortError") toast.error("Não foi possível compartilhar. Baixe a imagem e envie por onde preferir.");
    }
  };

  const baixar = () => {
    if (!imagem) return;
    baixarImagem(imagem.blob, nome);
    toast.success("Imagem baixada");
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-secondary/95 px-5 pb-6 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md" role="group" aria-label="Compartilhar o resumo">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Compartilhar o resumo</h3>
        <button
          type="button"
          onClick={onVoltar}
          aria-label="Voltar para o resumo"
          className="flex h-9 w-9 items-center justify-center rounded-full text-secondary-foreground/90 transition-colors hover:bg-secondary-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 items-center justify-center">
        {erro ? (
          <p className="max-w-[240px] text-center text-sm text-secondary-foreground/80">Não foi possível montar a imagem neste aparelho.</p>
        ) : imagem ? (
          <img src={imagem.url} alt={`Cartão com o resumo de ${resumo.mes.nomeComAno}`} className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-secondary-foreground/15" />
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-secondary-foreground/70" aria-label="Montando a imagem" />
        )}
      </div>

      <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-secondary-foreground/10 px-3.5 py-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium">Mostrar o valor das diárias</span>
          <span className="block text-xs text-secondary-foreground/70">
            {comValores ? "A imagem mostra quanto o imóvel rendeu em diárias no mês." : "Desligado, a imagem mostra só noites, ocupação e hóspedes."}
          </span>
        </span>
        <Switch checked={comValores} onCheckedChange={setComValores} aria-label="Mostrar o valor das diárias na imagem" />
      </label>

      <div className="mt-3 flex gap-2">
        {compartilha && (
          <Button onClick={compartilhar} disabled={!imagem} className="h-11 flex-1 gap-2 font-semibold">
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Compartilhar
          </Button>
        )}
        <Button
          onClick={baixar}
          disabled={!imagem}
          variant={compartilha ? "secondary" : "default"}
          className={cn("h-11 flex-1 gap-2 font-semibold", compartilha && "bg-background text-foreground hover:bg-background/90")}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Baixar imagem
        </Button>
      </div>
    </div>
  );
}
