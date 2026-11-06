import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, ShoppingCart, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { tabelaCuradorias } from "@/lib/curadoriaHtml";

type CurationSummary = {
  id: string;
  title: string | null;
  total_amount_cents: number | null;
  paid_at: string | null;
  owner_purchase_choice: string | null;
  cart_url: string | null;
  html_path: string | null;
  link_token: string | null;
  pecas: number | null;
};

/**
 * Aviso destacado no topo do painel do proprietário quando existe uma curadoria
 * publicada — vende a curadoria e leva direto para a página dela.
 */
export function OwnerCuradoriaBanner() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [curation, setCuration] = useState<CurationSummary | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    tabelaCuradorias()
      .select("id, title, total_amount_cents, paid_at, owner_purchase_choice, cart_url, html_path, link_token, pecas")
      .eq("owner_id", profile.id)
      .in("status", ["published", "paid"])
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: CurationSummary | null }) => setCuration(data ?? null));
  }, [profile?.id]);

  if (!curation) return null;

  const isPaid = !!curation.paid_at;
  // Proposta em HTML hospedada no portal: abre em tela cheia e a escolha segue pelo WhatsApp, sem PIX aqui
  const propostaHtml = curation.html_path && curation.link_token ? `/curadoria/${curation.link_token}` : null;
  const total = ((curation.total_amount_cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-card p-5 shadow-md md:p-6"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/40">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              {propostaHtml ? "Novo · Proposta de decoração pronta pra você" : isPaid ? "Curadoria em execução" : "Novo · Curadoria RIOS pronta pra você"}
            </p>
            <h3 className="text-base font-bold leading-snug md:text-lg">
              {propostaHtml
                ? "Veja o seu imóvel ambiente por ambiente, com cada peça no lugar"
                : isPaid
                ? "Acompanhe sua curadoria e a lista de itens aprovados"
                : "Seu plano de performance está pronto — veja o que vai destravar mais reservas"}
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground md:text-sm">
              {propostaHtml
                ? `${curation.pecas ? `${curation.pecas} peças escolhidas para o seu imóvel` : "Peças escolhidas para o seu imóvel"}${
                    curation.total_amount_cents ? ` · investimento estimado ${total} no Pix` : ""
                  }. Você escolhe o que quer, peça por peça.`
                : isPaid
                ? "Itens, observações e status da execução ficam sempre disponíveis aqui no seu portal."
                : `Curadoria completa de decoração e equipamentos escolhida item por item pra elevar a diária e a avaliação do seu imóvel${
                    curation.total_amount_cents ? ` · investimento estimado ${total}` : ""
                  }. Pague via PIX e a RIOS compra tudo, ou deixe que a gente monte o carrinho pronto pro seu cartão.`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
          <Button onClick={() => navigate(propostaHtml ?? "/minha-curadoria")} className="whitespace-nowrap">
            {propostaHtml ? (
              <>
                Ver a proposta
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            ) : isPaid ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Ver minha curadoria
              </>
            ) : (
              <>
                Ver minha curadoria
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          {!propostaHtml && !isPaid && curation.cart_url && (
            <Button variant="outline" asChild className="whitespace-nowrap">
              <a href={curation.cart_url} target="_blank" rel="noreferrer">
                <ShoppingCart className="mr-2 h-4 w-4" />
                Abrir carrinho
              </a>
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
