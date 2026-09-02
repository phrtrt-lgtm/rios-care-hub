import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, ShoppingCart, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

type CurationSummary = {
  id: string;
  title: string | null;
  total_amount_cents: number | null;
  paid_at: string | null;
  owner_purchase_choice: string | null;
  cart_url: string | null;
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
    supabase
      .from("owner_curations")
      .select("id, title, total_amount_cents, paid_at, owner_purchase_choice, cart_url")
      .eq("owner_id", profile.id)
      .in("status", ["published", "paid"])
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setCuration((data as CurationSummary) ?? null));
  }, [profile?.id]);

  if (!curation) return null;

  const isPaid = !!curation.paid_at;
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
      className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5 shadow-lg md:p-6"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/40">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              {isPaid ? "Curadoria em execução" : "Novo · Curadoria RIOS pronta pra você"}
            </p>
            <h3 className="text-base font-bold leading-snug md:text-lg">
              {isPaid
                ? "Acompanhe sua curadoria e a lista de itens aprovados"
                : "Seu plano de performance está pronto — veja o que vai destravar mais reservas"}
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground md:text-sm">
              {isPaid
                ? "Itens, observações e status da execução ficam sempre disponíveis aqui no seu portal."
                : `Curadoria completa de decoração e equipamentos escolhida item por item pra elevar a diária e a avaliação do seu imóvel${
                    curation.total_amount_cents ? ` · investimento estimado ${total}` : ""
                  }. Pague via PIX e a RIOS compra tudo, ou deixe que a gente monte o carrinho pronto pro seu cartão.`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
          <Button onClick={() => navigate("/minha-curadoria")} className="whitespace-nowrap">
            {isPaid ? (
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
          {!isPaid && curation.cart_url && (
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
