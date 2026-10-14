import { useEffect, useState } from "react";
import { ArrowRight, Sparkles, Loader2, Minus, Plus, User, Building2, MessageSquare, ShieldCheck, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { MetaPixel } from "@/components/MetaPixel";
import { CONDO_AMENITIES, type IntakeFormData } from "@/constants/intakeOptions";
import {
  BarraCtaMovel,
  CabecalhoCaptacao,
  ComoFunciona,
  HeroCaptacao,
  ID_FORMULARIO,
  InclusosNaComissao,
  NumerosRios,
  OndeAtuamos,
  PerguntasCaptacao,
  ResultadosReais,
  RodapeCaptacao,
} from "@/components/captacao/LandingCaptacao";

const ID_ABERTURA = "abertura";
const TITULO_PAGINA = "Cadastre seu imóvel · RIOS Hospedagens";

const initialForm: IntakeFormData = {
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  property_nickname: "",
  property_address: "",
  previously_listed_airbnb: null,
  notes_step1: "",
  bedrooms_count: 1,
  living_rooms_count: 1,
  bathrooms_count: 1,
  suites_count: 0,
  building_floors: null,
  apartment_floor: null,
  property_levels: 1,
  has_elevator: false,
  has_wifi: true,
  max_capacity: 2,
  parking_spots: 0,
  notes_step2: "",
  rooms_data: [],
  notes_step3: "",
  kitchen_items: [],
  special_amenities: [],
  notes_step4: "",
  condo_amenities: [],
  notes_step5: "",
  notes: "",
};

/**
 * Página pública de captação: é para onde os anúncios mandam o proprietário.
 * Mini landing (conteúdo espelha o site) com o formulário de pré-cadastro no
 * fim. O envio continua o mesmo: submit-property-intake + login automático.
 */
export default function CadastroImovel() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<IntakeFormData>(initialForm);

  useEffect(() => {
    const anterior = document.title;
    document.title = TITULO_PAGINA;
    return () => {
      document.title = anterior;
    };
  }, []);

  const update = <K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
  };

  const toggleCondo = (value: string) => {
    setForm((p) => {
      const arr = (p.condo_amenities as string[]) || [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...p, condo_amenities: next as IntakeFormData["condo_amenities"] };
    });
  };

  const valid =
    form.owner_name.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.owner_email) &&
    form.owner_phone.trim().length > 7 &&
    form.property_address.trim().length > 4 &&
    form.bedrooms_count > 0 &&
    form.bathrooms_count > 0;

  const submit = async () => {
    if (!valid) {
      toast.error("Preencha nome, e-mail, telefone e endereço para enviar");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-property-intake", {
        body: { ...form, notes: form.notes, rooms_data: [] },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);

      const autoLogin = (data as { auto_login?: { email: string; password: string } | null })?.auto_login;
      if (autoLogin?.email && autoLogin?.password) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: autoLogin.email,
          password: autoLogin.password,
        });
        if (!signInErr) {
          toast.success("Cadastro recebido! Bem-vindo à RIOS.");
          navigate("/cadastro-imovel/obrigado", { replace: true });
          return;
        }
        console.error("Auto-login falhou:", signInErr);
      }

      navigate("/cadastro-imovel/obrigado", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <MetaPixel />
      <div className="min-h-screen bg-background">
        <CabecalhoCaptacao />

        <main>
          <div id={ID_ABERTURA}>
            <HeroCaptacao />
          </div>
          <NumerosRios />
          <ComoFunciona />
          <InclusosNaComissao />
          <ResultadosReais />
          <OndeAtuamos />

          {/* Formulário */}
          <section id={ID_FORMULARIO} className="relative isolate scroll-mt-20 overflow-hidden py-16 sm:py-20">
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
              <div className="absolute -right-40 top-0 h-[480px] w-[480px] rounded-full bg-[hsl(var(--rios-terra))]/15 blur-3xl" />
              <div className="absolute -left-40 bottom-0 h-[380px] w-[380px] rounded-full bg-[hsl(var(--rios-blue))]/10 blur-3xl" />
            </div>

            <div className="container mx-auto max-w-2xl px-4">
              <div className="text-center">
                <p className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--rios-blue))]/10 px-3 py-1 text-xs font-medium text-[hsl(var(--rios-blue))] ring-1 ring-[hsl(var(--rios-blue))]/20">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Cadastre seu imóvel
                </p>
                <h2 className="mt-4 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                  Um formulário rápido e o diagnóstico gratuito começa
                </h2>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  Preencha o essencial. O restante dos detalhes do imóvel nós levantamos juntos na conversa com a equipe.
                </p>
                <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  <li className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5 text-[hsl(var(--rios-blue))]" aria-hidden="true" />
                    Menos de 2 minutos
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--rios-blue))]" aria-hidden="true" />
                    Sem compromisso e sem custo
                  </li>
                </ul>
              </div>

              <div className="mt-8 space-y-5">
                {/* Sobre você */}
                <SectionCard icon={User} title="Seus dados" subtitle="Para entrarmos em contato">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Seu nome completo" required>
                      <Input
                        value={form.owner_name}
                        onChange={(e) => update("owner_name", e.target.value)}
                        placeholder="Ex.: Maria Silva"
                        autoComplete="name"
                      />
                    </Field>
                    <Field label="WhatsApp" required>
                      <Input
                        value={form.owner_phone}
                        onChange={(e) => update("owner_phone", e.target.value)}
                        placeholder="(22) 99999-9999"
                        inputMode="tel"
                        autoComplete="tel"
                      />
                    </Field>
                    <Field label="E-mail" required className="sm:col-span-2">
                      <Input
                        type="email"
                        value={form.owner_email}
                        onChange={(e) => update("owner_email", e.target.value)}
                        placeholder="voce@email.com"
                        autoComplete="email"
                      />
                    </Field>
                    <Field label="Endereço do imóvel" required className="sm:col-span-2">
                      <Input
                        value={form.property_address}
                        onChange={(e) => update("property_address", e.target.value)}
                        placeholder="Rua, número, bairro, cidade"
                        autoComplete="street-address"
                      />
                    </Field>
                  </div>
                </SectionCard>

                {/* Imóvel */}
                <SectionCard icon={Building2} title="Sobre o imóvel" subtitle="Só os números principais">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Counter label="Quartos" value={form.bedrooms_count} onChange={(v) => update("bedrooms_count", v)} min={1} />
                    <Counter label="Banheiros" value={form.bathrooms_count} onChange={(v) => update("bathrooms_count", v)} min={1} />
                    <Counter
                      label="Pavimentos (andares do imóvel)"
                      value={form.property_levels}
                      onChange={(v) => update("property_levels", v)}
                      min={1}
                    />
                    <Counter label="Vagas de garagem" value={form.parking_spots} onChange={(v) => update("parking_spots", v)} min={0} />
                  </div>
                </SectionCard>

                {/* Condomínio */}
                <SectionCard icon={Building2} title="O que tem no condomínio" subtitle="Marque tudo que existir (opcional)">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {CONDO_AMENITIES.map((a) => {
                      const active = (form.condo_amenities as string[]).includes(a.value);
                      return (
                        <button
                          key={a.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleCondo(a.value)}
                          className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs transition sm:text-sm ${
                            active
                              ? "border-primary bg-primary/10 text-foreground shadow-sm"
                              : "border-border bg-background/60 text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          <span className="text-base leading-none">{a.icon}</span>
                          <span className="leading-tight">{a.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </SectionCard>

                {/* Observações */}
                <SectionCard icon={MessageSquare} title="Observações" subtitle="Algo que a gente precisa saber? (opcional)">
                  <Textarea
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="Ex.: piscina privativa, vista para o mar, já anunciei no Airbnb, disponibilidade a partir de..."
                  />
                </SectionCard>

                <Button onClick={submit} size="lg" disabled={submitting} className="h-14 w-full gap-2 text-base shadow-lg">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      Enviar meu cadastro
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Depois do envio nossa equipe entra em contato pelo WhatsApp com o diagnóstico do seu imóvel.
                </p>
              </div>
            </div>
          </section>

          <PerguntasCaptacao />
        </main>

        <RodapeCaptacao />
        {/* espaço para a barra fixa do celular não cobrir o rodapé */}
        <div className="h-20 md:hidden" aria-hidden="true" />
        <BarraCtaMovel idAbertura={ID_ABERTURA} />
      </div>
    </>
  );
}

/* ----------------------------- UI HELPERS ----------------------------- */

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 shadow-md md:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Counter({
  label,
  value,
  onChange,
  min = 0,
  max = 30,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 p-3">
      <span className="text-sm leading-tight">{label}</span>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Menos ${label.toLowerCase()}`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`Mais ${label.toLowerCase()}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
