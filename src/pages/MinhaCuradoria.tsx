import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, LogOut, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { tabelaCuradorias } from "@/lib/curadoriaHtml";
import { Button } from "@/components/ui/button";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PlanoPerformanceSection } from "@/components/bemvindo/PlanoPerformanceSection";
import riosLogo from "@/assets/rios-logo.png";

type Curation = {
  id: string;
  categories: any[];
  observations: any[];
  selected_items: any[] | null;
  paid_at: string | null;
  published_at: string | null;
  title: string | null;
  status: string;
  owner_purchase_choice: string | null;
  cart_url: string | null;
  total_amount_cents: number | null;
  html_path: string | null;
  link_token: string | null;
  pecas: number | null;
};

export default function MinhaCuradoria() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<Curation[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    tabelaCuradorias()
      .select(
        "id, categories, observations, selected_items, paid_at, published_at, title, status, owner_purchase_choice, cart_url, total_amount_cents, html_path, link_token, pecas",
      )
      .eq("owner_id", profile.id)
      .in("status", ["published", "paid"])
      .order("published_at", { ascending: false })
      .then(({ data }: { data: Curation[] | null }) => {
        setLinhas(data ?? []);
        setLoading(false);
      });
  }, [profile?.id]);

  // Propostas em HTML (uma por imóvel, em geral) e a curadoria antiga, com PIX, mais recente
  const propostas = linhas.filter((l) => l.html_path && l.link_token);
  const curation = linhas.find((l) => !l.html_path) ?? null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-secondary text-secondary-foreground">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-primary/30 blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[520px] w-[520px] rounded-full bg-info/25 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-6 md:px-8 md:py-10">
        <div className="mb-8 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/minha-caixa")}
            className="text-secondary-foreground/80 hover:bg-white/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-3">
            <img src={riosLogo} alt="RIOS" className="h-8 brightness-0 invert md:h-10" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="text-secondary-foreground/80 hover:bg-white/10"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>

        <div className="mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Sua curadoria RIOS
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {curation || propostas.length === 0 ? "Plano de performance do seu imóvel" : "Sua proposta de decoração"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-secondary-foreground/70">
            Acesso permanente à curadoria que preparamos para o seu imóvel — itens, observações e
            status do pagamento.
          </p>
        </div>

        {loading ? (
          <SectionSkeleton />
        ) : !curation && propostas.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title="Nenhuma curadoria publicada ainda"
            description="Assim que sua curadoria estiver pronta, ela aparecerá aqui para acesso permanente."
          />
        ) : (
          <>
            {propostas.length > 0 && (
              <div className={`grid gap-4 md:grid-cols-2 ${curation ? "mb-10" : ""}`}>
                {propostas.map((p) => (
                  <Link
                    key={p.id}
                    to={`/curadoria/${p.link_token}`}
                    className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:bg-white/[0.08] md:p-6"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Proposta de decoração</span>
                    <span className="mt-2 text-xl font-bold leading-snug">{p.title}</span>
                    <span className="mt-1 text-sm text-secondary-foreground/70">
                      {p.pecas ? `${p.pecas} peças` : "Peça por peça"}
                      {p.total_amount_cents
                        ? ` · ${(p.total_amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} no Pix`
                        : ""}
                    </span>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                      Abrir a proposta
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {curation && (
              <PlanoPerformanceSection
                customCategories={curation.categories as any}
                customObservations={curation.observations as any}
                curationId={curation.id}
                initialPaid={!!curation.paid_at}
                initialSelectedItems={curation.selected_items ?? undefined}
                initialPurchaseChoice={curation.owner_purchase_choice as any}
                cartUrl={curation.cart_url}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
