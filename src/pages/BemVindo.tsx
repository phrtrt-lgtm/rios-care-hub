import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CheckCircle2,
  CalendarCheck,
  Sparkles,
  Rocket,
  LogOut,
  MapPin,
  BedDouble,
  Bath,
  Users,
  Wifi,
  Car,
  Home,
  ArrowRight,
  MessageCircle,
} from "lucide-react";
import riosLogo from "@/assets/rios-logo.png";

interface IntakeSubmission {
  id: string;
  property_nickname: string | null;
  property_address: string | null;
  bedrooms_count: number | null;
  bathrooms_count: number | null;
  suites_count: number | null;
  max_capacity: number | null;
  parking_spots: number | null;
  has_wifi: boolean | null;
  has_elevator: boolean | null;
  special_amenities: any;
  condo_amenities: any;
  status: string;
  created_at: string;
}

const STAGES = [
  {
    key: "welcome",
    title: "Pré-cadastro recebido",
    description: "Suas respostas iniciais já estão com a nossa equipe.",
    icon: CheckCircle2,
  },
  {
    key: "meeting_scheduled",
    title: "Reunião de alinhamento",
    description: "Vamos marcar uma conversa para entender você e o imóvel a fundo.",
    icon: CalendarCheck,
  },
  {
    key: "curation",
    title: "Curadoria & diagnóstico",
    description: "Geramos um documento interativo com nossas recomendações para maximizar seu rendimento.",
    icon: Sparkles,
  },
  {
    key: "active",
    title: "Imóvel no ar",
    description: "Anúncios otimizados, operação rodando e portal liberado para acompanhar tudo.",
    icon: Rocket,
  },
];

export default function BemVindo() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [intake, setIntake] = useState<IntakeSubmission | null>(null);
  const [loading, setLoading] = useState(true);

  const currentStage = profile?.onboarding_stage || "welcome";
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage);

  useEffect(() => {
    if (profile && profile.role === "owner" && profile.status === "approved") {
      navigate("/minha-caixa", { replace: true });
    }
  }, [profile, navigate]);

  useEffect(() => {
    const loadIntake = async () => {
      if (!profile?.id) return;
      const { data } = await supabase
        .from("property_intake_submissions")
        .select("*")
        .eq("owner_profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setIntake(data as any);
      setLoading(false);
    };
    loadIntake();
  }, [profile?.id]);

  const specialAmenities = Array.isArray(intake?.special_amenities)
    ? (intake!.special_amenities as string[])
    : [];
  const condoAmenities = Array.isArray(intake?.condo_amenities)
    ? (intake!.condo_amenities as string[])
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/10">
      <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <img src={riosLogo} alt="RIOS" className="h-10 md:h-12" />
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <Badge variant="secondary" className="mb-4">
            <Sparkles className="mr-1 h-3 w-3" />
            Bem-vindo à família RIOS
          </Badge>
          <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-5xl">
            Olá, {profile?.name?.split(" ")[0] || "proprietário"} 👋
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            Recebemos seu pré-cadastro. A partir de agora, você entra em uma jornada feita
            para extrair o máximo do seu imóvel — com curadoria, dados e operação cuidada de ponta a ponta.
          </p>
        </motion.div>

        {/* Timeline */}
        <Card className="mb-8 overflow-hidden border-2">
          <CardContent className="p-6 md:p-8">
            <h2 className="mb-6 text-lg font-semibold">Sua jornada</h2>
            <div className="space-y-5">
              {STAGES.map((stage, idx) => {
                const Icon = stage.icon;
                const isDone = idx < currentIndex || (idx === 0 && currentIndex >= 0);
                const isCurrent = idx === currentIndex;
                const isFuture = idx > currentIndex;
                return (
                  <motion.div
                    key={stage.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + idx * 0.08 }}
                    className="relative flex gap-4"
                  >
                    {idx < STAGES.length - 1 && (
                      <div
                        className={`absolute left-[19px] top-10 h-full w-0.5 ${
                          isDone ? "bg-primary" : "bg-border"
                        }`}
                      />
                    )}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isDone
                          ? "border-primary bg-primary text-primary-foreground"
                          : isCurrent
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className={`font-semibold ${
                            isFuture ? "text-muted-foreground" : ""
                          }`}
                        >
                          {stage.title}
                        </h3>
                        {isDone && (
                          <Badge variant="secondary" className="text-xs">
                            Concluído
                          </Badge>
                        )}
                        {isCurrent && (
                          <Badge className="text-xs">Em andamento</Badge>
                        )}
                      </div>
                      <p
                        className={`mt-1 text-sm ${
                          isFuture ? "text-muted-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {stage.description}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Resumo do pré-cadastro */}
        <Card className="mb-8">
          <CardContent className="p-6 md:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Resumo do seu imóvel</h2>
              <Badge variant="outline" className="text-xs">
                Pré-cadastro
              </Badge>
            </div>

            {loading ? (
              <SectionSkeleton lines={4} />
            ) : !intake ? (
              <EmptyState
                icon={Home}
                title="Pré-cadastro não encontrado"
                description="Não localizamos seu pré-cadastro. Fale com a equipe para conferirmos."
              />
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xl font-bold">
                    {intake.property_nickname || "Imóvel sem nome"}
                  </h3>
                  {intake.property_address && (
                    <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{intake.property_address}</span>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat icon={BedDouble} label="Quartos" value={intake.bedrooms_count} />
                  <Stat icon={Bath} label="Banheiros" value={intake.bathrooms_count} />
                  <Stat icon={Users} label="Capacidade" value={intake.max_capacity} />
                  <Stat icon={Car} label="Vagas" value={intake.parking_spots ?? 0} />
                </div>

                {(intake.has_wifi || intake.has_elevator) && (
                  <div className="flex flex-wrap gap-2">
                    {intake.has_wifi && (
                      <Badge variant="secondary" className="gap-1">
                        <Wifi className="h-3 w-3" />
                        Wi-Fi
                      </Badge>
                    )}
                    {intake.has_elevator && (
                      <Badge variant="secondary" className="gap-1">
                        <Home className="h-3 w-3" />
                        Elevador
                      </Badge>
                    )}
                  </div>
                )}

                {specialAmenities.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Diferenciais
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {specialAmenities.map((a) => (
                        <Badge key={a} variant="outline" className="text-xs">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {condoAmenities.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Condomínio
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {condoAmenities.map((a) => (
                        <Badge key={a} variant="outline" className="text-xs">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Próximo passo */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col items-start gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2.5">
                <CalendarCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Próximo passo: agendar reunião</h3>
                <p className="text-sm text-muted-foreground">
                  Nossa equipe entrará em contato para marcar uma conversa de alinhamento.
                </p>
              </div>
            </div>
            <Button
              onClick={() =>
                window.open(
                  "https://wa.me/5521999999999?text=" +
                    encodeURIComponent(
                      `Olá! Sou ${profile?.name || ""} e gostaria de agendar a reunião de alinhamento.`
                    ),
                  "_blank"
                )
              }
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Falar com a equipe
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Acompanhamos cada etapa do seu lado. Em breve, este painel vai abrir o portal completo.
        </p>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-xl font-semibold">{value ?? "—"}</div>
    </div>
  );
}
