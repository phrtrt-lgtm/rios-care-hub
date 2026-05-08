import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PlanoPerformanceSection } from "@/components/bemvindo/PlanoPerformanceSection";
import riosLogo from "@/assets/rios-logo.png";

type Curation = {
  id: string;
  categories: any[];
  observations: any[];
  paid_at: string | null;
  published_at: string | null;
  title: string | null;
};

export default function MinhaCuradoria() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [curation, setCuration] = useState<Curation | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("owner_curations")
      .select("id, categories, observations, paid_at, published_at, title")
      .eq("owner_id", profile.id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setCuration(data as any);
        setLoading(false);
      });
  }, [profile?.id]);

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
          <img src={riosLogo} alt="RIOS" className="h-8 brightness-0 invert md:h-10" />
        </div>

        <div className="mb-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Sua curadoria RIOS
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Plano de performance do seu imóvel
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-secondary-foreground/70">
            Acesso permanente à curadoria que preparamos para o seu imóvel — itens, observações e
            status do pagamento.
          </p>
        </div>

        {loading ? (
          <SectionSkeleton />
        ) : !curation ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title="Nenhuma curadoria publicada ainda"
            description="Assim que sua curadoria estiver pronta, ela aparecerá aqui para acesso permanente."
          />
        ) : (
          <PlanoPerformanceSection
            customCategories={curation.categories as any}
            customObservations={curation.observations as any}
            curationId={curation.id}
            initialPaid={!!curation.paid_at}
          />
        )}
      </div>
    </div>
  );
}
