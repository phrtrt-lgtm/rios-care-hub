import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Sparkles } from "lucide-react";
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
  status: string;
};

export default function CuradoriaPublica() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [curation, setCuration] = useState<Curation | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("owner_curations")
      .select("id, categories, observations, paid_at, published_at, status")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        setCuration(data as any);
        setLoading(false);
      });
  }, [id]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-secondary text-secondary-foreground">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-primary/30 blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[520px] w-[520px] rounded-full bg-info/25 blur-[140px]" />
      </div>

      <div className="sticky top-0 z-50 border-b border-white/10 bg-secondary/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 md:px-8">
          <div className="flex items-center gap-2 text-xs">
            <Eye className="h-4 w-4 text-primary" />
            <span className="font-medium">Preview público — visualização do proprietário</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-secondary-foreground/80 hover:bg-white/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-6 md:px-8 md:py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">
              Curadoria RIOS
            </p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Plano de performance do imóvel
            </h1>
          </div>
          <img src={riosLogo} alt="RIOS" className="h-8 brightness-0 invert md:h-10" />
        </div>

        {loading ? (
          <SectionSkeleton />
        ) : !curation ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title="Curadoria não encontrada"
            description="O link pode estar errado ou a curadoria foi despublicada."
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
