import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  ShoppingBag,
  Lightbulb,
  AlertTriangle,
  Wand2,
  Check,
  ArrowRight,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CuradoriaChat } from "./CuradoriaChat";

import almofadas from "@/assets/plano/decor-almofadas.jpg";
import vaso from "@/assets/plano/decor-vaso.jpg";
import luminaria from "@/assets/plano/decor-luminaria.jpg";
import quadro from "@/assets/plano/decor-quadro.jpg";
import roupaCama from "@/assets/plano/quarto-roupa-cama.jpg";
import toalhas from "@/assets/plano/quarto-toalhas.jpg";
import manta from "@/assets/plano/quarto-manta.jpg";
import organizador from "@/assets/plano/quarto-organizador.jpg";
import panelas from "@/assets/plano/cozinha-panelas.jpg";
import loucas from "@/assets/plano/cozinha-loucas.jpg";
import talheres from "@/assets/plano/cozinha-talheres.jpg";
import copos from "@/assets/plano/cozinha-copos.jpg";
import airfryer from "@/assets/plano/eletro-airfryer.jpg";
import cafeteira from "@/assets/plano/eletro-cafeteira.jpg";
import tv from "@/assets/plano/eletronico-tv.jpg";
import roteador from "@/assets/plano/eletronico-roteador.jpg";
import ar from "@/assets/plano/eletronico-ar.jpg";
import fechadura from "@/assets/plano/eletronico-fechadura.jpg";
import tapete from "@/assets/plano/sala-tapete.jpg";
import cortinas from "@/assets/plano/sala-cortinas.jpg";
import mesaLateral from "@/assets/plano/sala-mesa-lateral.jpg";
import livros from "@/assets/plano/sala-livros.jpg";

type Item = {
  name: string;
  why: string;
  price: string;
  img: string;
  priority?: "essencial" | "recomendado";
};

type Category = {
  key: string;
  title: string;
  emoji: string;
  desc: string;
  items: Item[];
};

const CATEGORIES: Category[] = [
  {
    key: "sala",
    title: "Sala & ambientes sociais",
    emoji: "🛋️",
    desc: "Onde o hóspede decide se vai recomendar você. Cada peça aqui multiplica a percepção de valor.",
    items: [
      { name: "Tapete neutro 2x2,5m", why: "Aquece o ambiente nas fotos e absorve som — sala parece maior.", price: "R$ 480", img: tapete, priority: "essencial" },
      { name: "Cortinas blackout linho", why: "Privacidade + estética. Bloqueia luz e melhora dormida no quarto.", price: "R$ 690", img: cortinas, priority: "essencial" },
      { name: "Mesa lateral redonda", why: "Funcional para o sofá e ótima para foto do anúncio.", price: "R$ 320", img: mesaLateral },
      { name: "Livros decorativos (kit 3)", why: "Detalhe editorial barato que valoriza fotos e instagrama bem.", price: "R$ 180", img: livros },
    ],
  },
  {
    key: "decor",
    title: "Decoração & alma do espaço",
    emoji: "🌿",
    desc: "Os 4% de investimento que viram 30% do impacto visual. Curadoria da nossa estilista.",
    items: [
      { name: "Kit 4 almofadas linho", why: "Texturas em camadas — visual que fideliza no Airbnb.", price: "R$ 360", img: almofadas, priority: "essencial" },
      { name: "Vaso terracota + pampas", why: "Toque artesanal que combina com a paleta moderna brasileira.", price: "R$ 220", img: vaso },
      { name: "Luminária de chão minimalista", why: "Ilumina noturno e cria foto com vibe aconchegante.", price: "R$ 540", img: luminaria, priority: "recomendado" },
      { name: "Quadro emoldurado (par)", why: "Parede vazia perde estrelas. Arte certa eleva instantaneamente.", price: "R$ 380", img: quadro },
    ],
  },
  {
    key: "quarto",
    title: "Quarto & rouparia",
    emoji: "🛏️",
    desc: "A nota do quesito 'limpeza' nasce aqui. Roupa de cama é a coisa mais reclamada da plataforma.",
    items: [
      { name: "Jogo de cama percal 400 fios", why: "Conforto hoteleiro real. Hóspede sente na pele e comenta.", price: "R$ 520", img: roupaCama, priority: "essencial" },
      { name: "Kit toalhas brancas spa", why: "Branco impecável vira padrão visual. Compre 2x mais que precisa.", price: "R$ 480", img: toalhas, priority: "essencial" },
      { name: "Manta bouclé pé da cama", why: "Detalhe que aparece em toda foto principal de quartos premium.", price: "R$ 290", img: manta },
      { name: "Organizador rattan", why: "Bandeja de cabeceira para controle, água, lembretes — útil + lindo.", price: "R$ 140", img: organizador },
    ],
  },
  {
    key: "cozinha",
    title: "Cozinha equipada",
    emoji: "🍳",
    desc: "Hóspede que cozinha avalia melhor. Equipar bem aumenta diária aceita e tempo de estadia.",
    items: [
      { name: "Set panelas antiaderente", why: "Conjunto completo evita reclamação de 'faltava panela'.", price: "R$ 690", img: panelas, priority: "essencial" },
      { name: "Louças porcelana branca (6p)", why: "Branco fotografa bem e nunca sai de moda.", price: "R$ 340", img: loucas, priority: "essencial" },
      { name: "Talheres preto fosco", why: "Toque designer barato. Diferencia das diárias econômicas.", price: "R$ 220", img: talheres },
      { name: "Copos & taças mistos (12p)", why: "Cobre tudo: água, vinho, drinks. Padronização visual.", price: "R$ 180", img: copos },
    ],
  },
  {
    key: "eletro",
    title: "Eletrônicos & eletrodomésticos",
    emoji: "⚡",
    desc: "O que destrava filtros de busca no Airbnb e Booking. Cada item aqui = mais visualizações.",
    items: [
      { name: "Smart TV 50\" 4K", why: "Filtro 'TV' no Booking elimina 60% dos imóveis. Você fica.", price: "R$ 2.490", img: tv, priority: "essencial" },
      { name: "Roteador Wi-Fi mesh", why: "Wi-Fi forte = nota 5 em estadias longas / nômades digitais.", price: "R$ 690", img: roteador, priority: "essencial" },
      { name: "Ar-condicionado split", why: "Filtro decisivo no verão carioca. Sem ar = invisível.", price: "R$ 2.890", img: ar, priority: "essencial" },
      { name: "Air fryer 5L", why: "Item mais buscado em cozinhas equipadas em 2024-25.", price: "R$ 490", img: airfryer, priority: "recomendado" },
      { name: "Cafeteira de cápsula", why: "Detalhe premium da chegada. Apareça nas fotos.", price: "R$ 590", img: cafeteira },
      { name: "Fechadura digital", why: "Self check-in 24h. Mais reservas last-minute e menos atrito.", price: "R$ 890", img: fechadura, priority: "recomendado" },
    ],
  },
];

const OBSERVATIONS = [
  {
    icon: Wand2,
    tag: "Reposicionamento",
    title: "Quarto principal vira a 'foto de capa'",
    body: "Sugerimos mover a cama para a parede da janela e centralizar — luz natural lateral cria a foto que vende. Hoje a foto principal está no ângulo errado e queima 30% do potencial de cliques.",
  },
  {
    icon: Lightbulb,
    tag: "Iluminação",
    title: "Trocar lâmpadas frias por 3000K âmbar",
    body: "Toda iluminação amarelada (3000K) — luz fria espanta hóspede em fotos noturnas e cria sensação clínica. Custo baixo, impacto enorme nas fotos profissionais que faremos.",
  },
  {
    icon: AlertTriangle,
    tag: "Manutenção crítica",
    title: "Vedação do banheiro & rejunte",
    body: "Identificamos pontos de rejunte escurecido na ficha. Antes da sessão de fotos, recomendamos refazer rejunte e silicone — é o detalhe que a câmera amplifica e que mais gera comentário negativo.",
  },
  {
    icon: Sparkles,
    tag: "Mobília existente",
    title: "Aproveitar buffet da sala como cabeceira",
    body: "O móvel atual da sala tem o tom certo para virar cabeceira do quarto principal — economia de R$ 800 e padrão visual coeso. Substituiríamos por estante mais leve na sala.",
  },
];

export function PlanoPerformanceSection() {
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string>(CATEGORIES[0].key);

  const totalItems = CATEGORIES.reduce((acc, c) => acc + c.items.length, 0);
  const totalEssenciais = CATEGORIES.reduce(
    (acc, c) => acc + c.items.filter((i) => i.priority === "essencial").length,
    0,
  );
  const orcamento = CATEGORIES.reduce(
    (acc, c) =>
      acc +
      c.items.reduce((s, i) => s + Number(i.price.replace(/[^\d]/g, "")), 0),
    0,
  );

  const active = CATEGORIES.find((c) => c.key === activeCat)!;

  return (
    <section className="mb-24 md:mb-32">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Etapa 03 · Pré-visualização
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            Seu plano de performance,<br />curadoria RIOS.
          </h2>
        </div>
      </div>

      {/* Trigger card */}
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ y: -2 }}
        className="group relative w-full overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-white/[0.03] to-transparent p-6 text-left backdrop-blur-md transition hover:border-primary/60 md:p-8"
      >
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl transition group-hover:bg-primary/30" />
        <div className="relative flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/20 p-3 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="mb-1 text-lg font-semibold md:text-xl">
                Documento interativo · Diagnóstico & Curadoria
              </h3>
              <p className="text-sm text-secondary-foreground/70">
                {totalItems} itens curados · {totalEssenciais} essenciais ·
                investimento estimado{" "}
                <span className="text-secondary-foreground">
                  R$ {orcamento.toLocaleString("pt-BR")}
                </span>
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-medium text-secondary-foreground transition group-hover:bg-primary/25">
            Abrir documento
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </div>
      </motion.button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden border-border bg-background p-0 text-foreground">
          <DialogTitle className="sr-only">
            Plano de Performance · Diagnóstico & Curadoria
          </DialogTitle>

          {/* Background blobs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-[120px]" />
            <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-info/15 blur-[120px]" />
          </div>

          {/* Header */}
          <div className="relative flex shrink-0 items-start justify-between gap-4 border-b border-border/60 p-5 md:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/15 p-2.5 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-primary">
                  Etapa 03 · Pré-visualização
                </p>
                <h3 className="text-lg font-bold tracking-tight md:text-xl">
                  Plano de Performance RIOS
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {totalItems} itens · {totalEssenciais} essenciais · investimento
                  estimado{" "}
                  <span className="font-semibold text-foreground">
                    R$ {orcamento.toLocaleString("pt-BR")}
                  </span>
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Shortcuts (sticky) */}
          <div className="relative shrink-0 border-b border-border/60 bg-background/95 p-3 backdrop-blur-md md:px-6">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <a
                  key={c.key}
                  href={`#cat-${c.key}`}
                  onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById(`cat-${c.key}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground/80 transition hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
                >
                  <span>{c.emoji}</span>
                  <span>{c.title}</span>
                  <span className="rounded-full bg-muted px-1.5 text-[9px] text-muted-foreground">
                    {c.items.length}
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Scrollable body */}
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="px-5 py-6 md:px-6 md:py-7">
              <div className="mb-5 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Lista de compras curada
                </p>
              </div>

              <div className="space-y-8">
                {CATEGORIES.map((cat) => (
                  <div
                    key={cat.key}
                    id={`cat-${cat.key}`}
                    className="scroll-mt-4"
                  >
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <h4 className="flex items-center gap-2 text-base font-semibold text-foreground">
                        <span className="text-lg">{cat.emoji}</span>
                        {cat.title}
                      </h4>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {cat.items.length} itens
                      </span>
                    </div>
                    <p className="mb-3 max-w-2xl text-xs text-muted-foreground">
                      {cat.desc}
                    </p>

                    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                      {cat.items.map((it) => (
                        <li
                          key={it.name}
                          className="flex items-center gap-3 p-2.5 transition hover:bg-muted/50"
                        >
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                            <img
                              src={it.img}
                              alt={it.name}
                              loading="lazy"
                              width={512}
                              height={512}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                              <h5 className="text-[13px] font-semibold leading-tight text-foreground">
                                {it.name}
                              </h5>
                              {it.priority === "essencial" && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
                                  <Check className="h-2.5 w-2.5" /> Essencial
                                </span>
                              )}
                              {it.priority === "recomendado" && (
                                <span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Recomendado
                                </span>
                              )}
                            </div>
                            <p className="line-clamp-2 text-[11px] text-muted-foreground">
                              {it.why}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[13px] font-semibold text-primary">
                              {it.price}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Observations */}
            <div id="cat-observacoes" className="border-t border-border/60 bg-muted/30 px-5 py-6 md:px-6 md:py-7">
              <div className="mb-4 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Observações & ajustes do espaço
                </p>
              </div>

              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                {OBSERVATIONS.map((o) => {
                  const Icon = o.icon;
                  return (
                    <li key={o.title} className="flex items-start gap-3 p-3.5 md:p-4">
                      <div className="shrink-0 rounded-lg bg-primary/15 p-1.5 text-primary">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                            {o.tag}
                          </span>
                          <h5 className="text-[13px] font-semibold text-foreground">{o.title}</h5>
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {o.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-5 text-[11px] italic text-muted-foreground">
                * Pré-visualização ilustrativa. Seu plano final será personalizado após
                a reunião de alinhamento, com curadoria, orçamento e cronograma
                específicos para o seu imóvel.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
