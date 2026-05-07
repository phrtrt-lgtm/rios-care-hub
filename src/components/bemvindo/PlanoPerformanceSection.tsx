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

      <motion.div
        layout
        className="overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-white/[0.03] to-transparent backdrop-blur-md"
      >
        {/* Header / trigger */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-4 p-6 text-left transition hover:bg-white/[0.03] md:p-8"
        >
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
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }}>
            <ChevronDown className="h-5 w-5 text-primary" />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="overflow-hidden border-t border-white/10"
            >
              {/* Lista de compras */}
              <div className="p-6 md:p-8">
                <div className="mb-6 flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                    Lista de compras curada
                  </p>
                </div>

                {/* Tabs categorias */}
                <div className="mb-6 flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => {
                    const isActive = c.key === activeCat;
                    return (
                      <button
                        key={c.key}
                        onClick={() => setActiveCat(c.key)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition ${
                          isActive
                            ? "border-primary/60 bg-primary/15 text-secondary-foreground"
                            : "border-white/15 bg-white/5 text-secondary-foreground/70 hover:border-white/30"
                        }`}
                      >
                        <span>{c.emoji}</span>
                        <span>{c.title}</span>
                        <span
                          className={`rounded-full px-1.5 text-[10px] ${
                            isActive
                              ? "bg-primary/30 text-primary-foreground"
                              : "bg-white/10 text-secondary-foreground/60"
                          }`}
                        >
                          {c.items.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Descrição da categoria ativa */}
                <motion.div
                  key={active.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="mb-5 max-w-2xl text-sm text-secondary-foreground/75 md:text-base">
                    {active.desc}
                  </p>

                  {/* Grid itens */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {active.items.map((it) => (
                      <motion.div
                        key={it.name}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm transition hover:border-primary/40 hover:bg-white/[0.06]"
                      >
                        <div className="relative aspect-square overflow-hidden bg-white/5">
                          <img
                            src={it.img}
                            alt={it.name}
                            loading="lazy"
                            width={512}
                            height={512}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                          {it.priority === "essencial" && (
                            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground backdrop-blur-md">
                              <Check className="h-3 w-3" /> Essencial
                            </span>
                          )}
                          {it.priority === "recomendado" && (
                            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground backdrop-blur-md">
                              Recomendado
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="mb-1.5 flex items-start justify-between gap-2">
                            <h4 className="text-sm font-semibold leading-tight">{it.name}</h4>
                            <span className="shrink-0 text-xs font-semibold text-primary">
                              {it.price}
                            </span>
                          </div>
                          <p className="text-xs text-secondary-foreground/65">{it.why}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* Observações */}
              <div className="border-t border-white/10 bg-white/[0.02] p-6 md:p-8">
                <div className="mb-6 flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                    Observações & ajustes do espaço
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {OBSERVATIONS.map((o, i) => {
                    const Icon = o.icon;
                    return (
                      <motion.div
                        key={o.title}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: i * 0.05 }}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-primary/30"
                      >
                        <div className="mb-3 flex items-center gap-2">
                          <div className="rounded-lg bg-primary/15 p-1.5 text-primary">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                            {o.tag}
                          </span>
                        </div>
                        <h4 className="mb-1.5 text-sm font-semibold">{o.title}</h4>
                        <p className="text-xs leading-relaxed text-secondary-foreground/70">
                          {o.body}
                        </p>
                      </motion.div>
                    );
                  })}
                </div>

                <p className="mt-6 text-xs italic text-secondary-foreground/50">
                  * Pré-visualização ilustrativa. Seu plano final será personalizado após a
                  reunião de alinhamento, com curadoria, orçamento e cronograma específicos
                  para o seu imóvel.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
