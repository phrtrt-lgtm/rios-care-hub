import { useEffect, useMemo, useState } from "react";
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
  Wallet,
  Wrench,
  ExternalLink,
  QrCode,
  Copy,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Mapeia item da IA para assets bundled (mesmo padrão visual do bem-vindo).
// Importações dinâmicas dos assets já feitas no topo do arquivo.
function matchBundledAsset(name: string, catTitle?: string): string | null {
  const n = (name + " " + (catTitle || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  // ordem importa: do mais específico ao mais genérico
  const rules: Array<[RegExp, string]> = [
    [/almofad/, almofadas],
    [/(vaso|pampa|planta|flor)/, vaso],
    [/(luminari|abajur|arandela|pendente|lustre)/, luminaria],
    [/(quadro|poster|moldur|arte|gravur)/, quadro],
    [/(roupa de cama|jogo de cama|len[cç]ol|fronha|edredom|duvet|percal)/, roupaCama],
    [/(toalh)/, toalhas],
    [/(manta|xale|throw)/, manta],
    [/(organizador|cesto|cesta|caixa organiz|bandeja)/, organizador],
    [/(panela|frigideira|caçarola|wok|cooktop pan)/, panelas],
    [/(lou[cç]a|prato|tigela|sopeira|porcelana)/, loucas],
    [/(talher|garfo|faca|colher)/, talheres],
    [/(copo|ta[cç]a|jarra|whisky|vinho)/, copos],
    [/(air ?fryer|fritadeira)/, airfryer],
    [/(cafeteira|c[aá]psula|nespresso|expresso|moka)/, cafeteira],
    [/(tv|televis|smart tv|tela)/, tv],
    [/(roteador|wi[- ]?fi|mesh|repetidor)/, roteador],
    [/(ar[- ]condicionado|split|inverter|climatiza)/, ar],
    [/(fechadura|smart lock|trava digital)/, fechadura],
    [/(tapete|passadeira|carpete)/, tapete],
    [/(cortina|persiana|blackout)/, cortinas],
    [/(mesa lateral|mesa de canto|mesinha|side table)/, mesaLateral],
    [/(livro|book)/, livros],
  ];
  for (const [rx, asset] of rules) {
    if (rx.test(n)) return asset;
  }
  return null;
}

function categoryFallbackAsset(catTitle?: string): string {
  const c = (catTitle || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/(decor|alma|estilo|ambiencia)/.test(c)) return almofadas;
  if (/(quarto|suite|su[ií]te|rouparia|banheiro|banho)/.test(c)) return roupaCama;
  if (/(cozinha|gourmet|refeic|jantar|cafe)/.test(c)) return panelas;
  if (/(eletro|eletron|tecnologia|wifi|conectividade|climatiza)/.test(c)) return tv;
  if (/(sala|estar|social|living|varanda|externa|area externa|ambiente)/.test(c)) return tapete;

  return quadro;
}

function thumbFor(item: { name: string; img?: string }, catTitle?: string) {
  if (item.img && item.img.trim()) return item.img;
  const bundled = matchBundledAsset(item.name, catTitle);
  if (bundled) return bundled;
  return categoryFallbackAsset(catTitle);
}
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";


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
  link?: string;
  priority?: "essencial" | "recomendado";
  /** Item opcional: aparece com checkbox (default marcado). Pode ser desmarcado. */
  optional?: boolean;
  /** Itens com o mesmo alternativeGroup são alternativas mutuamente exclusivas.
   *  O primeiro item da lista é a "Opção 1" (recomendada · melhor ROI). */
  alternativeGroup?: string;
  /** Quantidade extraída da planilha (ex: 2, 4) — proprietário precisa saber pra não comprar errado. */
  quantity?: number | null;
  /** Unidade do quantity (ex: "un", "par", "kit", "jogo"). */
  unit?: string | null;
  /** Tamanho/medidas (ex: "King 193x203", "2x2,5m", "5L", "50\""). */
  dimensions?: string | null;
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
      // Alternativas: par de quadros (Opção 1 = curadoria nossa, Opção 2 = econômica)
      { name: "Quadro emoldurado curadoria RIOS (par)", why: "Arte selecionada pela nossa estilista — eleva instantaneamente o nível visual e fotografa melhor.", price: "R$ 380", img: quadro, alternativeGroup: "decor-quadro", priority: "recomendado" },
      { name: "Quadro emoldurado linha econômica (par)", why: "Versão mais simples — funciona, mas com menor impacto editorial nas fotos.", price: "R$ 190", img: quadro, alternativeGroup: "decor-quadro" },
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
      { name: "Organizador rattan", why: "Bandeja de cabeceira para controle, água, lembretes — útil + lindo.", price: "R$ 140", img: organizador, optional: true },
    ],
  },
  {
    key: "cozinha",
    title: "Cozinha equipada",
    emoji: "🍳",
    desc: "Hóspede que cozinha avalia melhor. Equipar bem aumenta diária aceita e tempo de estadia.",
    items: [
      // Alternativas: panelas (Opção 1 = melhor ROI)
      { name: "Set panelas antiaderente premium (kit completo)", why: "Conjunto completo evita reclamação de 'faltava panela'. Durabilidade 3x maior — melhor ROI no longo prazo.", price: "R$ 690", img: panelas, alternativeGroup: "cozinha-panelas", priority: "essencial" },
      { name: "Set panelas básico (kit reduzido)", why: "Versão econômica — atende, mas reposição mais frequente e nota menor de hóspedes que cozinham.", price: "R$ 390", img: panelas, alternativeGroup: "cozinha-panelas" },
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
      { name: "Air fryer 5L", why: "Item mais buscado em cozinhas equipadas em 2024-25.", price: "R$ 490", img: airfryer, priority: "recomendado", optional: true },
      { name: "Cafeteira de cápsula", why: "Detalhe premium da chegada. Apareça nas fotos.", price: "R$ 590", img: cafeteira, optional: true },
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

type Observation = { icon: any; tag: string; title: string; body: string };

const ICON_MAP: Record<string, any> = { Wand2, Lightbulb, AlertTriangle, Sparkles };

function priceToCents(price: string): number {
  if (!price) return 0;
  // Aceita "R$ 1.234,56" (BR), "R$ 1,234.56" (US) e "R$ 480.00".
  // Mantém dígitos, vírgulas e pontos; decide qual é decimal pelo último separador.
  let s = String(price).replace(/[^\d.,]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = s;
  } else if (lastComma > lastDot) {
    // vírgula é decimal, pontos são milhar
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    // ponto é decimal (ou único separador) — só trata como decimal se tiver 1-2 casas após
    const after = s.length - lastDot - 1;
    if (after === 1 || after === 2) {
      normalized = s.replace(/,/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
    } else {
      // ponto é separador de milhar (ex: "2.490")
      normalized = s.replace(/[.,]/g, "");
    }
  }
  const n = parseFloat(normalized);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

function ComoFuncionaBlock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Como funciona o pagamento e a instalação
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-primary/20 p-2 text-primary">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <h5 className="mb-1 text-sm font-semibold text-white">
              Você paga a curadoria pra RIOS via PIX
            </h5>
            <p className="text-xs leading-relaxed text-white/70">
              O orçamento total dos itens é enviado direto pra nós pelo botão verde — pagamento confirmado libera automaticamente seu acesso completo ao portal RIOS (etapa 04).
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-primary/20 p-2 text-primary">
            <Wrench className="h-4 w-4" />
          </div>
          <div>
            <h5 className="mb-1 text-sm font-semibold text-white">
              Cuidamos de tudo: compras, frete, montagem e instalação
            </h5>
            <p className="text-xs leading-relaxed text-white/70">
              Você não cota, não compra, não recebe em casa. Custos extras de execução são consolidados e cobrados de forma transparente na sua plataforma RIOS.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PixDialogProps {
  open: boolean;
  onClose: () => void;
  totalCents: number;
  qrBase64?: string;
  qrCode?: string;
  loading?: boolean;
  paid?: boolean;
}

function PixDialog({ open, onClose, totalCents, qrBase64, qrCode, loading, paid }: PixDialogProps) {
  const totalBRL = (totalCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  function copyPix() {
    if (!qrCode) return;
    navigator.clipboard.writeText(qrCode);
    toast.success("Código PIX copiado");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden border-white/10 bg-secondary p-0 text-secondary-foreground">
        <DialogTitle className="sr-only">Pagar curadoria via PIX</DialogTitle>
        <div className="bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent p-6 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
            <QrCode className="h-6 w-6" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Pagamento da curadoria
          </p>
          <p className="mt-2 text-3xl font-bold text-white">{totalBRL}</p>
        </div>
        <div className="space-y-4 p-6">
          {paid ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-14 w-14 text-emerald-400" />
              <div>
                <p className="text-base font-semibold text-white">Pagamento confirmado</p>
                <p className="mt-1 text-xs text-white/60">
                  Seu acesso completo ao portal foi liberado.
                </p>
              </div>
            </div>
          ) : loading || !qrBase64 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="text-sm text-white/70">Gerando QR Code seguro…</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center rounded-xl bg-white p-4">
                <img src={qrBase64} alt="QR Code PIX" className="h-56 w-56" />
              </div>
              <Button
                onClick={copyPix}
                className="w-full bg-emerald-500 text-white hover:bg-emerald-600"
                size="lg"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar PIX copia e cola
              </Button>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-[11px] leading-relaxed text-white/65">
                Escaneie o QR Code no app do seu banco ou cole o código no PIX copia e cola.
                Assim que o pagamento for confirmado, seu acesso ao portal RIOS é liberado automaticamente.
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PlanoPerformanceSection({
  customCategories,
  customObservations,
  curationId,
  initialPaid,
  initialSelectedItems,
}: {
  customCategories?: Category[];
  customObservations?: { icon: string; tag: string; title: string; body: string }[];
  curationId?: string;
  initialPaid?: boolean;
  initialSelectedItems?: Array<{ category?: string; name?: string }>;
} = {}) {
  const [open, setOpen] = useState(false);
  const [pixOpen, setPixOpen] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{ qr_code?: string; qr_code_base64?: string }>({});
  const [paid, setPaid] = useState(!!initialPaid);

  const categories = customCategories?.length ? customCategories : CATEGORIES;
  const observations: Observation[] = customObservations?.length
    ? customObservations.map((o) => ({ ...o, icon: ICON_MAP[o.icon] || Sparkles }))
    : OBSERVATIONS;
  const [activeCat, setActiveCat] = useState<string>(categories[0].key);

  // Chave única por item
  const itemKey = (catKey: string, idx: number) => `${catKey}::${idx}`;

  // Estado de seleção:
  // - Se houver `initialSelectedItems` (curadoria já paga/salva), reproduz a escolha do proprietário.
  // - Caso contrário: opcionais começam marcados; alternativos => primeira opção do grupo marcada.
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const sel: Record<string, boolean> = {};

    // Normalizador para casar nomes (ignora acento, caixa e espaços extras)
    const norm = (s?: string) =>
      (s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (initialSelectedItems && initialSelectedItems.length > 0) {
      const chosen = new Set(
        initialSelectedItems.map((it) => `${norm(it.category)}|${norm(it.name)}`),
      );
      for (const cat of categories) {
        cat.items.forEach((it, idx) => {
          const key = `${norm((cat as any).title || cat.key)}|${norm(it.name)}`;
          sel[itemKey(cat.key, idx)] = chosen.has(key);
        });
      }
      return sel;
    }

    for (const cat of categories) {
      const seenGroups = new Set<string>();
      cat.items.forEach((it, idx) => {
        const k = itemKey(cat.key, idx);
        if (it.alternativeGroup) {
          if (!seenGroups.has(it.alternativeGroup)) {
            sel[k] = true; // Opção 1 (primeira do grupo) marcada por padrão
            seenGroups.add(it.alternativeGroup);
          } else {
            sel[k] = false;
          }
        } else {
          sel[k] = true; // obrigatórios e opcionais começam marcados
        }
      });
    }
    return sel;
  });

  function toggleOptional(k: string) {
    setSelected((s) => ({ ...s, [k]: !s[k] }));
  }
  function chooseAlternative(catKey: string, group: string, chosenIdx: number) {
    setSelected((s) => {
      const next = { ...s };
      const cat = categories.find((c) => c.key === catKey)!;
      cat.items.forEach((it, idx) => {
        if (it.alternativeGroup === group) {
          next[itemKey(catKey, idx)] = idx === chosenIdx;
        }
      });
      return next;
    });
  }

  const totalItems = categories.reduce((acc, c) => acc + c.items.length, 0);
  const totalEssenciais = categories.reduce(
    (acc, c) => acc + c.items.filter((i) => i.priority === "essencial").length,
    0,
  );
  const orcamentoCents = useMemo(
    () =>
      categories.reduce(
        (acc, c) =>
          acc +
          c.items.reduce(
            (s, i, idx) => (selected[itemKey(c.key, idx)] ? s + priceToCents(i.price) : s),
            0,
          ),
        0,
      ),
    [categories, selected],
  );
  const orcamento = Math.round(orcamentoCents / 100);

  // Auto-save da seleção do proprietário (debounced) — assim a equipe sabe o que ele escolheu
  // mesmo que ele não chegue a pagar via PIX.
  useEffect(() => {
    if (!curationId || paid) return;
    const handle = setTimeout(() => {
      const selectedItems = categories.flatMap((c) =>
        c.items
          .map((it, idx) => ({ it, idx }))
          .filter(({ idx }) => selected[itemKey(c.key, idx)])
          .map(({ it }) => ({
            category: c.title,
            name: it.name,
            price: it.price,
            price_cents: priceToCents(it.price),
            why: it.why,
            link: (it as any).link ?? null,
            priority: it.priority ?? null,
            alternativeGroup: it.alternativeGroup ?? null,
          })),
      );
      supabase.functions
        .invoke("save-curation-selection", {
          body: {
            curation_id: curationId,
            selected_items: selectedItems,
            total_amount_cents: orcamentoCents,
          },
        })
        .catch((e) => console.warn("save-curation-selection failed", e));
    }, 1200);
    return () => clearTimeout(handle);
  }, [curationId, paid, selected, categories, orcamentoCents]);

  const active = categories.find((c) => c.key === activeCat) || categories[0];

  // Polling do status de pagamento depois que o PIX é gerado
  useEffect(() => {
    if (!curationId || paid || !pixData.qr_code) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("owner_curations")
        .select("paid_at")
        .eq("id", curationId)
        .maybeSingle();
      if (data?.paid_at) {
        setPaid(true);
        clearInterval(interval);
        toast.success("Pagamento confirmado! Acesso liberado.");
        setTimeout(() => window.location.reload(), 2500);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [curationId, pixData.qr_code, paid]);

  async function handleGeneratePix() {
    if (!curationId) {
      toast.error("Curadoria ainda não publicada");
      return;
    }
    if (orcamentoCents < 100) {
      toast.error("Valor inválido");
      return;
    }
    setPixOpen(true);
    setPixLoading(true);
    try {
      // Monta lista detalhada de tudo que o proprietário marcou
      const selectedItems = categories.flatMap((c) =>
        c.items
          .map((it, idx) => ({ it, idx }))
          .filter(({ idx }) => selected[itemKey(c.key, idx)])
          .map(({ it }) => ({
            category: c.title,
            name: it.name,
            price: it.price,
            price_cents: priceToCents(it.price),
            why: it.why,
            link: (it as any).link ?? null,
            priority: it.priority ?? null,
            alternativeGroup: it.alternativeGroup ?? null,
          })),
      );

      const { data, error } = await supabase.functions.invoke("create-curation-pix", {
        body: {
          curation_id: curationId,
          total_amount_cents: orcamentoCents,
          selected_items: selectedItems,
        },
      });
      if (error) throw error;
      setPixData({
        qr_code: data.pix_qr_code,
        qr_code_base64: data.pix_qr_code_base64,
      });
    } catch (e: any) {
      toast.error(e.message || "Falha ao gerar PIX");
      setPixOpen(false);
    } finally {
      setPixLoading(false);
    }
  }

  // Botão PIX reutilizável (verde)
  const PixCTA = ({ size = "default" as "default" | "lg" }) =>
    paid ? (
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-5 py-2.5 text-sm font-semibold text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        Curadoria paga · acesso liberado
      </div>
    ) : (
      <Button
        onClick={handleGeneratePix}
        size={size}
        className="bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600"
      >
        <QrCode className="mr-2 h-4 w-4" />
        Pagar curadoria via PIX · R$ {orcamento.toLocaleString("pt-BR")}
      </Button>
    );

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

      {/* Hero PIX no topo (só se publicada) */}
      {curationId && (
        <div className="mb-6 overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-6 backdrop-blur-md md:p-7">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Pagamento direto · libera etapa 04
              </p>
              <h3 className="text-lg font-bold tracking-tight text-white md:text-xl">
                {paid
                  ? "Pagamento confirmado · acesso completo liberado"
                  : `Pague a curadoria e destrave a operação completa RIOS`}
              </h3>
              <p className="mt-1 max-w-xl text-sm text-white/65">
                {paid
                  ? "Sua curadoria já está em execução pela equipe."
                  : "PIX seguro pelo Mercado Pago. Acesso ao portal liberado automaticamente assim que o pagamento for confirmado."}
              </p>
            </div>
            <PixCTA size="lg" />
          </div>
        </div>
      )}

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
        <DialogContent className="flex h-[92vh] max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden border-white/10 bg-secondary p-0 text-secondary-foreground">
          <DialogTitle className="sr-only">
            Plano de Performance · Diagnóstico & Curadoria
          </DialogTitle>

          {/* Background blobs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/30 blur-[120px]" />
            <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-primary/20 blur-[120px]" />
          </div>

          {/* Header */}
          <div className="relative flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-5 md:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/20 p-2.5 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-primary">
                  Etapa 03 · Pré-visualização
                </p>
                <h3 className="text-lg font-bold tracking-tight text-white md:text-xl">
                  Plano de Performance RIOS
                </h3>
                <p className="mt-0.5 text-xs text-white/60">
                  {totalItems} itens · {totalEssenciais} essenciais · investimento
                  estimado{" "}
                  <span className="font-semibold text-white">
                    R$ {orcamento.toLocaleString("pt-BR")}
                  </span>
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Shortcuts (sticky) */}
          <div className="relative shrink-0 border-b border-white/10 bg-secondary/90 p-3 backdrop-blur-md md:px-6">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <a
                  key={c.key}
                  href={`#cat-${c.key}`}
                  onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById(`cat-${c.key}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/85 transition hover:border-primary/60 hover:bg-primary/15 hover:text-white"
                >
                  <span>{c.emoji}</span>
                  <span>{c.title}</span>
                  <span className="rounded-full bg-white/10 px-1.5 text-[9px] text-white/70">
                    {c.items.length}
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Scrollable body */}
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            {/* Como funciona — agora no TOPO da curadoria */}
            <div className="border-b border-white/10 px-5 pt-6 md:px-6 md:pt-7">
              <ComoFuncionaBlock />

              {/* CTA PIX dentro do dialog (topo) */}
              {curationId && (
                <div className="mt-5 flex flex-col items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                      Pagar agora · libera etapa 04
                    </p>
                    <p className="mt-1 text-sm text-white/80">
                      {paid ? "Pagamento confirmado." : `Total da curadoria · R$ ${orcamento.toLocaleString("pt-BR")}`}
                    </p>
                  </div>
                  <PixCTA />
                </div>
              )}
            </div>

            <div className="px-5 py-6 md:px-6 md:py-7">
              <div className="mb-5 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Lista de compras curada
                </p>
              </div>

              {/* Banner: importância dos itens + regra Opção 1 */}
              <div className="mb-6 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="inline-flex h-5 items-center rounded-full bg-emerald-500/25 px-2 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                      Recomendação RIOS
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    Sempre que houver Opção 1 e Opção 2, escolha a Opção 1.
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-white/70">
                    A Opção 1 é a curadoria recomendada pela nossa equipe — entrega o melhor ROI,
                    durabilidade e impacto visual. A Opção 2 existe só para quem precisa
                    reduzir investimento inicial, mas tende a custar mais caro no longo prazo.
                  </p>
                </div>
                <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="inline-flex h-5 items-center rounded-full bg-primary/25 px-2 text-[9px] font-semibold uppercase tracking-wider text-primary">
                      Importante
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    Cada item conta na otimização inicial.
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-white/70">
                    Todos os itens podem ser desmarcados — basta clicar na caixinha ao lado para
                    remover do carrinho. Recomendamos manter os marcados como{" "}
                    <span className="font-semibold text-white">Essencial</span> para o melhor
                    desempenho do seu imóvel desde o primeiro hóspede.
                  </p>
                </div>
              </div>

              <div className="space-y-10">
                {categories.map((cat) => (
                  <div
                    key={cat.key}
                    id={`cat-${cat.key}`}
                    className="scroll-mt-4"
                  >
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <h4 className="flex items-center gap-2 text-base font-semibold text-white">
                        <span className="text-lg">{cat.emoji}</span>
                        {cat.title}
                      </h4>
                      <span className="text-[10px] uppercase tracking-wider text-white/50">
                        {cat.items.length} itens
                      </span>
                    </div>
                    <p className="mb-3 max-w-2xl text-xs text-white/65">
                      {cat.desc}
                    </p>

                    <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg">
                      {cat.items.map((it, idx) => {
                        const k = itemKey(cat.key, idx);
                        const isSelected = !!selected[k];
                        const altGroupItems = it.alternativeGroup
                          ? cat.items
                              .map((x, i) => ({ x, i }))
                              .filter((p) => p.x.alternativeGroup === it.alternativeGroup)
                          : null;
                        const altIndex = altGroupItems
                          ? altGroupItems.findIndex((p) => p.i === idx)
                          : -1;
                        const isOpcao1 = altIndex === 0;
                        return (
                          <li
                            key={`${cat.key}-${idx}`}
                            className={`flex items-center gap-3 p-3.5 transition ${isSelected ? "hover:bg-primary/5" : "opacity-55"}`}
                          >
                            <div className="flex w-8 shrink-0 items-center justify-center">
                              {it.alternativeGroup ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    chooseAlternative(cat.key, it.alternativeGroup!, idx)
                                  }
                                  aria-label={`Escolher ${it.name}`}
                                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
                                    isSelected
                                      ? "border-emerald-500 bg-emerald-500"
                                      : "border-white/30 bg-transparent hover:border-white/60"
                                  }`}
                                >
                                  {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                </button>
                              ) : (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleOptional(k)}
                                  aria-label={`Incluir ${it.name}`}
                                  className="h-5 w-5 border-white/30 data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white"
                                />
                              )}
                            </div>
                            <div
                              aria-hidden
                              className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-white/5 text-xl ring-1 ring-white/10 ${isSelected ? "" : "grayscale opacity-60"}`}
                            >
                              <span className="leading-none">{cat.emoji}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                {it.link ? (
                                  <a
                                    href={it.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group inline-flex items-center gap-1 text-sm font-semibold leading-tight text-white hover:text-primary"
                                  >
                                    {it.name}
                                    <ExternalLink className="h-3 w-3 opacity-60 transition group-hover:opacity-100" />
                                  </a>
                                ) : (
                                  <h5 className="text-sm font-semibold leading-tight text-white">
                                    {it.name}
                                  </h5>
                                )}
                                {it.alternativeGroup && (
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                                      isOpcao1
                                        ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                                        : "border border-white/15 bg-white/5 text-white/60"
                                    }`}
                                  >
                                    {isOpcao1 ? "Opção 1 · melhor ROI" : `Opção ${altIndex + 1}`}
                                  </span>
                                )}
                                {it.optional && (
                                  <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/60">
                                    Opcional
                                  </span>
                                )}
                                {it.priority === "essencial" && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
                                    <Check className="h-2.5 w-2.5" /> Essencial
                                  </span>
                                )}
                                {it.priority === "recomendado" && (
                                  <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                                    Recomendado
                                  </span>
                                )}
                              </div>
                              {(it.quantity || it.dimensions) && (
                                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
                                  {it.quantity ? (
                                    <span className="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-amber-300 ring-1 ring-amber-500/30">
                                      {it.quantity}{it.unit ? ` ${it.unit}` : " un"}
                                    </span>
                                  ) : null}
                                  {it.dimensions ? (
                                    <span className="inline-flex items-center rounded-md bg-sky-500/15 px-1.5 py-0.5 text-sky-300 ring-1 ring-sky-500/30">
                                      {it.dimensions}
                                    </span>
                                  ) : null}
                                </div>
                              )}
                              <p className="line-clamp-2 text-xs text-white/65">
                                {it.why}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-white/40 line-through"}`}>
                                {it.price}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Observations */}
            <div id="cat-observacoes" className="border-t border-white/10 bg-primary/5 px-5 py-6 md:px-6 md:py-7">
              <div className="mb-4 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Observações & ajustes do espaço
                </p>
              </div>

              <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg">
                {observations.map((o) => {
                  const Icon = o.icon;
                  return (
                    <li key={o.title} className="flex items-start gap-3 p-4">
                      <div className="shrink-0 rounded-lg bg-primary/20 p-2 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                            {o.tag}
                          </span>
                          <h5 className="text-sm font-semibold text-white">{o.title}</h5>
                        </div>
                        <p className="text-xs leading-relaxed text-white/70">
                          {o.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* CTA PIX final (rodapé do dialog) */}
              {curationId && (
                <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-transparent p-6 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                    Pronta para começar?
                  </p>
                  <h4 className="text-lg font-bold text-white">
                    {paid
                      ? "Pagamento confirmado · acesso liberado"
                      : `Pagar curadoria · R$ ${orcamento.toLocaleString("pt-BR")}`}
                  </h4>
                  <p className="max-w-md text-xs text-white/65">
                    {paid
                      ? "Sua curadoria já está em execução."
                      : "Assim que o PIX for confirmado, você ganha acesso ao portal RIOS completo (etapa 04)."}
                  </p>
                  <PixCTA size="lg" />
                </div>
              )}

              <p className="mt-5 text-[11px] italic text-white/50">
                * Pré-visualização ilustrativa. Seu plano final será personalizado após
                a reunião de alinhamento, com curadoria, orçamento e cronograma
                específicos para o seu imóvel.
              </p>
            </div>

          </div>
        </DialogContent>
      </Dialog>

      <PixDialog
        open={pixOpen}
        onClose={() => setPixOpen(false)}
        totalCents={orcamentoCents}
        qrBase64={pixData.qr_code_base64}
        qrCode={pixData.qr_code}
        loading={pixLoading}
        paid={paid}
      />
    </section>
  );
}
