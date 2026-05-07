import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
  TrendingUp,
  Zap,
  Brain,
  LineChart,
} from "lucide-react";
import riosLogo from "@/assets/rios-logo.png";
import { resolveAmenities } from "@/lib/amenityLabels";
import { PlanoPerformanceSection } from "@/components/bemvindo/PlanoPerformanceSection";

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
  owner_email: string | null;
  owner_phone: string | null;
}

const STAGES = [
  {
    key: "welcome",
    n: "01",
    title: "Pré-cadastro",
    description: "Recebemos suas respostas. Já estamos estudando seu imóvel.",
    icon: CheckCircle2,
  },
  {
    key: "meeting_scheduled",
    n: "02",
    title: "Reunião de alinhamento",
    description: "Conversa estratégica para entender você, o imóvel e os objetivos.",
    icon: CalendarCheck,
  },
  {
    key: "curation",
    n: "03",
    title: "Diagnóstico & curadoria",
    description: "Documento interativo com nosso plano de performance e posicionamento.",
    icon: Brain,
  },
  {
    key: "active",
    n: "04",
    title: "No ar com tudo otimizado",
    description: "Anúncios, precificação dinâmica e operação rodando sob medida.",
    icon: Rocket,
  },
];

const PILLARS = [
  { icon: Brain, title: "Curadoria com IA", desc: "Análise de dados das principais OTAs para precificar e posicionar seu imóvel." },
  { icon: LineChart, title: "Performance real", desc: "Painel com receita, ocupação, score e indicadores ao vivo." },
  { icon: Zap, title: "Operação tech", desc: "App nativo, vistorias, manutenções e financeiro em um só lugar." },
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

  const firstName = profile?.name?.split(" ")[0] || "proprietário";

  return (
    <div className="relative min-h-screen overflow-hidden bg-secondary text-secondary-foreground">
      {/* Animated background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-primary/30 blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-40 top-1/3 h-[520px] w-[520px] rounded-full bg-info/25 blur-[140px]"
        />
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, 60, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-primary/20 blur-[120px]"
        />
        {/* grid */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--primary-foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary-foreground)) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-6 md:px-8 md:py-10">
        {/* Top bar */}
        <div className="mb-12 flex items-center justify-between md:mb-20">
          <img src={riosLogo} alt="RIOS" className="h-9 brightness-0 invert md:h-11" />
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-secondary-foreground/70 hover:bg-white/10 hover:text-secondary-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>

        {/* HERO */}
        <section className="mb-24 md:mb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 backdrop-blur-md"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-medium tracking-wide text-secondary-foreground/80">
              Pré-cadastro recebido · Bem-vindo à RIOS
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mb-6 text-5xl font-bold leading-[0.95] tracking-tight md:text-7xl lg:text-8xl"
          >
            Olá, {firstName}.<br />
            <span className="bg-gradient-to-r from-primary via-primary to-[hsl(var(--rios-terra-light))] bg-clip-text text-transparent">
              Vamos transformar
            </span>
            <br />
            seu imóvel em renda.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="max-w-2xl text-lg text-secondary-foreground/70 md:text-xl"
          >
            Você acabou de entrar numa operação que une <span className="text-secondary-foreground">curadoria humana</span>,{" "}
            <span className="text-secondary-foreground">inteligência de dados</span> e tecnologia própria pra extrair o
            máximo da sua propriedade nas plataformas.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="mt-10 flex flex-wrap gap-8 md:gap-14"
          >
            {[
              { n: "+38%", l: "Receita média vs. autogestão" },
              { n: "92%", l: "Ocupação em alta temporada" },
              { n: "24/7", l: "Operação e suporte" },
            ].map((s) => (
              <div key={s.l}>
                <div className="bg-gradient-to-br from-primary to-[hsl(var(--rios-terra-light))] bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                  {s.n}
                </div>
                <div className="mt-1 text-xs uppercase tracking-wider text-secondary-foreground/60">{s.l}</div>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-10"
          >
            <button
              type="button"
              onClick={() => {
                document.getElementById("curadoria")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-primary/40 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent px-5 py-3 backdrop-blur-md transition-all hover:border-primary/70 hover:from-primary/30"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="relative flex flex-col items-start leading-tight">
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-primary/80">
                  Etapa 03 · pronta pra ver
                </span>
                <span className="text-sm font-semibold text-secondary-foreground">
                  Sua curadoria já está preparada
                </span>
              </span>
              <ArrowRight className="relative h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
            </button>
          </motion.div>
        </section>

        {/* PILLARS */}
        <section className="mb-24 grid gap-4 md:grid-cols-3 md:mb-32">
          {PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all hover:border-primary/40 hover:bg-white/10"
              >
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl transition-all group-hover:bg-primary/20" />
                <div className="relative">
                  <div className="mb-4 inline-flex rounded-xl bg-primary/20 p-3 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{p.title}</h3>
                  <p className="text-sm text-secondary-foreground/70">{p.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </section>

        {/* JOURNEY */}
        <section className="mb-24 md:mb-32">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">A jornada</p>
              <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
                Do cadastro ao seu<br />imóvel rendendo.
              </h2>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              const isDone = idx < currentIndex;
              const isCurrent = idx === currentIndex;
              return (
                <motion.div
                  key={stage.key}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.08 }}
                  className={`relative overflow-hidden rounded-2xl border p-6 backdrop-blur-md transition-all ${
                    isCurrent
                      ? "border-primary/60 bg-gradient-to-br from-primary/15 to-transparent"
                      : isDone
                      ? "border-white/15 bg-white/5"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`text-5xl font-bold leading-none tracking-tighter ${
                        isCurrent ? "text-primary" : isDone ? "text-secondary-foreground/40" : "text-secondary-foreground/20"
                      }`}
                    >
                      {stage.n}
                    </div>
                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Icon
                          className={`h-4 w-4 ${
                            isCurrent ? "text-primary" : isDone ? "text-secondary-foreground/60" : "text-secondary-foreground/30"
                          }`}
                        />
                        <h3
                          className={`font-semibold ${
                            isCurrent || isDone ? "" : "text-secondary-foreground/50"
                          }`}
                        >
                          {stage.title}
                        </h3>
                        {isDone && (
                          <Badge variant="outline" className="border-white/20 bg-white/5 text-[10px] text-secondary-foreground/70">
                            ✓ feito
                          </Badge>
                        )}
                        {isCurrent && (
                          <Badge className="bg-primary text-[10px] text-primary-foreground">agora</Badge>
                        )}
                      </div>
                      <p
                        className={`text-sm ${
                          isCurrent || isDone ? "text-secondary-foreground/75" : "text-secondary-foreground/40"
                        }`}
                      >
                        {stage.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* PLANO DE PERFORMANCE (etapa 03 expandível) */}
        <div id="curadoria" className="scroll-mt-24">
          <PlanoPerformanceSection />
        </div>

        {/* PROPERTY SUMMARY */}
        <section className="mb-16">
          <div className="mb-8">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">Seu imóvel</p>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">O que já sabemos sobre ele</h2>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md">
            {loading ? (
              <div className="p-8">
                <SectionSkeleton />
              </div>
            ) : !intake ? (
              <div className="p-8">
                <EmptyState
                  icon={<Home className="h-6 w-6" />}
                  title="Pré-cadastro não encontrado"
                  description="Não localizamos seu pré-cadastro. Fale com a equipe para conferirmos."
                />
              </div>
            ) : (
              <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
                <div className="border-b border-white/10 p-8 md:border-b-0 md:border-r">
                  <h3 className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">
                    {intake.property_nickname || "Imóvel sem nome"}
                  </h3>
                  {intake.property_address && (
                    <p className="mb-6 flex items-start gap-1.5 text-sm text-secondary-foreground/70">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{intake.property_address}</span>
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <DarkStat icon={BedDouble} label="Quartos" value={intake.bedrooms_count} />
                    <DarkStat icon={Bath} label="Banheiros" value={intake.bathrooms_count} />
                    <DarkStat icon={Users} label="Capacidade" value={intake.max_capacity} />
                    <DarkStat icon={Car} label="Vagas" value={intake.parking_spots ?? 0} />
                  </div>

                  {(intake.has_wifi || intake.has_elevator) && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {intake.has_wifi && (
                        <Badge variant="outline" className="gap-1 border-white/20 bg-white/5 text-secondary-foreground/80">
                          <Wifi className="h-3 w-3" /> Wi-Fi
                        </Badge>
                      )}
                      {intake.has_elevator && (
                        <Badge variant="outline" className="gap-1 border-white/20 bg-white/5 text-secondary-foreground/80">
                          <Home className="h-3 w-3" /> Elevador
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-5 p-8">
                  {specialAmenities.length > 0 && (
                    <div>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Diferenciais</p>
                      <div className="flex flex-wrap gap-1.5">
                        {resolveAmenities(specialAmenities).map((a, i) => (
                          <span
                            key={`${a.label}-${i}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-secondary-foreground/85 backdrop-blur-sm transition hover:border-primary/40 hover:bg-white/10"
                          >
                            <span className="text-sm leading-none">{a.icon}</span>
                            <span>{a.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {condoAmenities.length > 0 && (
                    <div>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Condomínio</p>
                      <div className="flex flex-wrap gap-1.5">
                        {resolveAmenities(condoAmenities).map((a, i) => (
                          <span
                            key={`${a.label}-${i}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-secondary-foreground/85 backdrop-blur-sm transition hover:border-primary/40 hover:bg-white/10"
                          >
                            <span className="text-sm leading-none">{a.icon}</span>
                            <span>{a.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!specialAmenities.length && !condoAmenities.length && (
                    <p className="text-sm text-secondary-foreground/60">
                      Detalharemos diferenciais e amenidades na reunião de alinhamento.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* CTA - Aguardando contato */}
        <section className="mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-8 backdrop-blur-md md:p-12"
          >
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
            <div className="relative flex flex-col gap-6">
              <div className="max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <TrendingUp className="h-3 w-3" /> Próximo passo
                </div>
                <h3 className="mb-3 text-2xl font-bold tracking-tight md:text-3xl">
                  Agora é com a gente. Aguarde nosso contato.
                </h3>
                <p className="text-secondary-foreground/70 md:text-lg">
                  Nossa equipe vai entrar em contato pelos canais que você informou no cadastro para agendar a
                  reunião de alinhamento e dar sequência à curadoria do seu imóvel.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {intake?.owner_email && (
                  <ContactInfo icon={MessageCircle} label="E-mail" value={intake.owner_email} />
                )}
                {intake?.owner_phone && (
                  <ContactInfo icon={MessageCircle} label="Telefone / WhatsApp" value={intake.owner_phone} />
                )}
              </div>

              <p className="text-xs text-secondary-foreground/60">
                Costumamos retornar em até 1 dia útil. Confira se os dados acima estão corretos. Caso precise atualizar,
                nos avise pelos mesmos canais.
              </p>
            </div>
          </motion.div>
        </section>

        <p className="pb-6 text-center text-xs text-secondary-foreground/50">
          Em breve, este painel se transforma no seu portal completo · RIOS Hospedagens
        </p>
      </div>
    </div>
  );
}

function DarkStat({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-secondary-foreground/60">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight">{value ?? "—"}</div>
    </div>
  );
}

function ContactInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="rounded-lg bg-primary/20 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-secondary-foreground/60">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}