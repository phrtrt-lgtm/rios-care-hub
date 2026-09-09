import { useState } from "react";
import { motion } from "framer-motion";
import riosLogo from "@/assets/rios-logo.png";
import {
  ArrowRight,
  Sparkles,
  Loader2,
  Minus,
  Plus,
  User,
  Building2,
  MessageSquare,
} from "lucide-react";
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

export default function CadastroImovel() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<IntakeFormData>(initialForm);

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
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--rios-terra))]/8 via-background to-[hsl(var(--rios-terra))]/12 relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--rios-terra))]/20 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] rounded-full bg-[hsl(var(--rios-blue))]/10 blur-3xl" />
        </div>

        <div className="relative">
          <BrandHeader />

          <div className="container max-w-2xl mx-auto px-4 pb-24 space-y-5">
            {/* Sobre você */}
            <SectionCard icon={User} title="Seus dados" subtitle="Para entrarmos em contato">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Seu nome completo" required>
                  <Input
                    value={form.owner_name}
                    onChange={(e) => update("owner_name", e.target.value)}
                    placeholder="Ex.: Maria Silva"
                  />
                </Field>
                <Field label="WhatsApp" required>
                  <Input
                    value={form.owner_phone}
                    onChange={(e) => update("owner_phone", e.target.value)}
                    placeholder="(48) 99999-9999"
                  />
                </Field>
                <Field label="E-mail" required className="sm:col-span-2">
                  <Input
                    type="email"
                    value={form.owner_email}
                    onChange={(e) => update("owner_email", e.target.value)}
                    placeholder="voce@email.com"
                  />
                </Field>
                <Field label="Endereço do imóvel" required className="sm:col-span-2">
                  <Input
                    value={form.property_address}
                    onChange={(e) => update("property_address", e.target.value)}
                    placeholder="Rua, número, bairro, cidade"
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Imóvel */}
            <SectionCard icon={Building2} title="Sobre o imóvel" subtitle="Só os números principais">
              <div className="grid gap-3 sm:grid-cols-2">
                <Counter
                  label="Quartos"
                  value={form.bedrooms_count}
                  onChange={(v) => update("bedrooms_count", v)}
                  min={1}
                />
                <Counter
                  label="Banheiros"
                  value={form.bathrooms_count}
                  onChange={(v) => update("bathrooms_count", v)}
                  min={1}
                />
                <Counter
                  label="Pavimentos (andares do imóvel)"
                  value={form.property_levels}
                  onChange={(v) => update("property_levels", v)}
                  min={1}
                />
                <Counter
                  label="Vagas de garagem"
                  value={form.parking_spots}
                  onChange={(v) => update("parking_spots", v)}
                  min={0}
                />
              </div>
            </SectionCard>

            {/* Condomínio */}
            <SectionCard
              icon={Building2}
              title="O que tem no condomínio"
              subtitle="Marque tudo que existir (opcional)"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CONDO_AMENITIES.map((a) => {
                  const active = (form.condo_amenities as string[]).includes(a.value);
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => toggleCondo(a.value)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs sm:text-sm transition ${
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
            <SectionCard
              icon={MessageSquare}
              title="Observações"
              subtitle="Algo que a gente precisa saber? (opcional)"
            >
              <Textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Ex.: piscina privativa, vista para o mar, já anunciei no Airbnb, disponibilidade a partir de..."
              />
            </SectionCard>

            <Button
              onClick={submit}
              size="lg"
              disabled={submitting}
              className="w-full gap-2 shadow-lg h-14 text-base"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Enviar meu cadastro
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Leva menos de 2 minutos. Depois nossa equipe entra em contato com você.
            </p>
          </div>
        </div>
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
    <Card className="p-5 md:p-6 shadow-md">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
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
      <div className="flex items-center gap-2 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
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
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function BrandHeader() {
  return (
    <header className="relative">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[hsl(var(--rios-blue))] via-[hsl(var(--rios-blue-light))] to-[hsl(var(--rios-terra))]" />

      <div className="container max-w-2xl mx-auto px-4 pt-10 pb-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 sm:gap-5"
        >
          <div className="shrink-0 p-2 sm:p-2.5 rounded-2xl bg-[hsl(var(--rios-blue))]/5 ring-1 ring-[hsl(var(--rios-blue))]/15">
            <img src={riosLogo} alt="RIOS" className="h-10 sm:h-14 w-auto object-contain" />
          </div>
          <div className="min-w-0 border-l-2 border-[hsl(var(--rios-blue))]/25 pl-3 sm:pl-5">
            <p className="text-xs sm:text-base uppercase tracking-[0.22em] text-[hsl(var(--rios-blue))] font-bold leading-tight">
              Hospedagens
            </p>
            <p className="text-[11px] sm:text-sm text-muted-foreground mt-1 tracking-wide">
              Operação &amp; Gestão
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-8 space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[hsl(var(--rios-blue))]/10 text-[hsl(var(--rios-blue))] text-xs font-medium ring-1 ring-[hsl(var(--rios-blue))]/20">
            <Sparkles className="h-3 w-3" />
            Cadastre seu imóvel
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
            Um formulário rápido e sua parceria começa
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Preencha o essencial abaixo. O restante dos detalhes do imóvel nós levantamos juntos na
            conversa com nossa equipe.
          </p>
        </motion.div>
      </div>
    </header>
  );
}
