// Formulário de pré-cadastro em três passos curtos, para caber numa parte da
// tela e não assustar: dados, imóvel, detalhes. Os campos e o envio são os
// mesmos de sempre (IntakeFormData → submit-property-intake).
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CONDO_AMENITIES,
  type IntakeFormData,
} from "@/constants/intakeOptions";
import { ID_FORMULARIO } from "./LandingCaptacao";

const FORM_INICIAL: IntakeFormData = {
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

const PASSOS = [
  { titulo: "Seus dados", texto: "Para entrarmos em contato" },
  { titulo: "Seu imóvel", texto: "Só os números principais" },
  { titulo: "Detalhes", texto: "Opcional, mas ajuda no diagnóstico" },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormularioCaptacaoProps {
  onEnviar: (form: IntakeFormData) => Promise<void>;
  enviando: boolean;
  /** No celular: volta para a tela do painel da marca. */
  aoVoltarParaMarca?: () => void;
}

// `autoFocus` só no desktop: no celular o foco puxava o trilho de telas para o
// formulário antes da hora e abria o teclado.
export function FormularioCaptacao({
  onEnviar,
  enviando,
  aoVoltarParaMarca,
}: FormularioCaptacaoProps) {
  const reduzido = useReducedMotion();
  const [form, setForm] = useState<IntakeFormData>(FORM_INICIAL);
  const [passo, setPasso] = useState(0);
  const [direcao, setDirecao] = useState<1 | -1>(1);

  const update = <K extends keyof IntakeFormData>(
    key: K,
    value: IntakeFormData[K],
  ) => setForm((p) => ({ ...p, [key]: value }));

  const toggleCondo = (value: string) =>
    setForm((p) => {
      const arr = (p.condo_amenities as string[]) || [];
      const next = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value];
      return {
        ...p,
        condo_amenities: next as IntakeFormData["condo_amenities"],
      };
    });

  const pendenciasDoPasso = (): string | null => {
    if (passo === 0) {
      if (form.owner_name.trim().length < 2)
        return "Escreva seu nome completo.";
      if (form.owner_phone.trim().length < 8)
        return "Informe um WhatsApp para falarmos com você.";
      if (!EMAIL.test(form.owner_email)) return "Confira o e-mail.";
    }
    if (passo === 1) {
      if (form.property_address.trim().length < 5)
        return "Informe o endereço do imóvel.";
      if (form.bedrooms_count < 1 || form.bathrooms_count < 1)
        return "O imóvel precisa de ao menos um quarto e um banheiro.";
    }
    return null;
  };

  const avancar = async () => {
    const pendencia = pendenciasDoPasso();
    if (pendencia) {
      toast.error(pendencia);
      return;
    }
    if (passo < PASSOS.length - 1) {
      setDirecao(1);
      setPasso((p) => p + 1);
      return;
    }
    await onEnviar({ ...form, rooms_data: [] });
  };

  const voltar = () => {
    setDirecao(-1);
    setPasso((p) => Math.max(0, p - 1));
  };

  const ultimo = passo === PASSOS.length - 1;
  const deslocamento = reduzido ? 0 : 28;

  return (
    <section
      id={ID_FORMULARIO}
      aria-labelledby="titulo-formulario"
      className="scroll-mt-6"
    >
      {aoVoltarParaMarca && (
        <button
          type="button"
          onClick={aoVoltarParaMarca}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Ver o que a RIOS inclui
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void avancar();
        }}
        className="rounded-3xl border border-border/60 bg-background p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--rios-blue))]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--rios-blue))] ring-1 ring-[hsl(var(--rios-blue))]/20">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Diagnóstico gratuito
            </p>
            <h2
              id="titulo-formulario"
              className="mt-2 text-xl font-bold leading-tight tracking-tight sm:text-2xl"
            >
              Cadastre seu imóvel
            </h2>
          </div>
          <p className="shrink-0 pt-1 text-right text-xs text-muted-foreground">
            <span className="block font-semibold text-foreground">
              Passo {passo + 1} de {PASSOS.length}
            </span>
            {PASSOS[passo].titulo}
          </p>
        </div>

        <ol className="mt-4 flex gap-1.5" aria-label="Progresso do cadastro">
          {PASSOS.map((p, i) => (
            <li
              key={p.titulo}
              aria-current={i === passo ? "step" : undefined}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= passo ? "bg-primary" : "bg-muted",
              )}
            >
              <span className="sr-only">{p.titulo}</span>
            </li>
          ))}
        </ol>

        <div className="relative mt-5 overflow-hidden">
          {/* Só animação de entrada: o passo novo monta na hora, sem esperar a
              saída do anterior (em aba de fundo a saída nunca terminaria). */}
          <motion.div
            key={passo}
            initial={{ opacity: 0, x: direcao * deslocamento }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <p className="mb-4 text-sm text-muted-foreground">
              {PASSOS[passo].texto}
            </p>

            {passo === 0 && (
              <div className="grid gap-4">
                <Campo label="Seu nome completo" required>
                  <Input
                    value={form.owner_name}
                    onChange={(e) => update("owner_name", e.target.value)}
                    placeholder="Ex.: Maria Silva"
                    autoComplete="name"
                    autoFocus={!aoVoltarParaMarca}
                  />
                </Campo>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo label="WhatsApp" required>
                    <Input
                      value={form.owner_phone}
                      onChange={(e) => update("owner_phone", e.target.value)}
                      placeholder="(22) 99999-9999"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </Campo>
                  <Campo label="E-mail" required>
                    <Input
                      type="email"
                      value={form.owner_email}
                      onChange={(e) => update("owner_email", e.target.value)}
                      placeholder="voce@email.com"
                      autoComplete="email"
                    />
                  </Campo>
                </div>
              </div>
            )}

            {passo === 1 && (
              <div className="grid gap-4">
                <Campo label="Endereço do imóvel" required>
                  <Input
                    value={form.property_address}
                    onChange={(e) => update("property_address", e.target.value)}
                    placeholder="Rua, número, bairro, cidade"
                    autoComplete="street-address"
                    autoFocus={!aoVoltarParaMarca}
                  />
                </Campo>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Contador
                    label="Quartos"
                    value={form.bedrooms_count}
                    onChange={(v) => update("bedrooms_count", v)}
                    min={1}
                  />
                  <Contador
                    label="Banheiros"
                    value={form.bathrooms_count}
                    onChange={(v) => update("bathrooms_count", v)}
                    min={1}
                  />
                  <Contador
                    label="Pavimentos"
                    value={form.property_levels}
                    onChange={(v) => update("property_levels", v)}
                    min={1}
                  />
                  <Contador
                    label="Vagas de garagem"
                    value={form.parking_spots}
                    onChange={(v) => update("parking_spots", v)}
                    min={0}
                  />
                </div>
              </div>
            )}

            {passo === 2 && (
              <div className="grid gap-4">
                <fieldset>
                  <legend className="text-sm font-medium">
                    O que tem no condomínio
                  </legend>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {CONDO_AMENITIES.map((a) => {
                      const active = (
                        form.condo_amenities as string[]
                      ).includes(a.value);
                      return (
                        <button
                          key={a.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleCondo(a.value)}
                          className={cn(
                            "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition",
                            active
                              ? "border-primary bg-primary/10 text-foreground shadow-sm"
                              : "border-border bg-background/60 text-muted-foreground hover:border-primary/40",
                          )}
                        >
                          <span
                            className="text-base leading-none"
                            aria-hidden="true"
                          >
                            {a.icon}
                          </span>
                          <span className="leading-tight">{a.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <Campo label="Observações">
                  <Textarea
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Ex.: piscina privativa, vista para o mar, já anunciei no Airbnb, disponível a partir de..."
                  />
                </Campo>
              </div>
            )}
          </motion.div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          {passo > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={voltar}
              disabled={enviando}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar
            </Button>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={enviando}
            className="h-12 flex-1 gap-2 text-base shadow-lg"
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Enviando…
              </>
            ) : ultimo ? (
              <>
                Enviar meu cadastro
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </>
            ) : (
              <>
                Continuar
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </form>

      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <Clock3
            className="h-3.5 w-3.5 text-[hsl(var(--rios-blue))]"
            aria-hidden="true"
          />
          Menos de 2 minutos
        </li>
        <li className="inline-flex items-center gap-1.5">
          <ShieldCheck
            className="h-3.5 w-3.5 text-[hsl(var(--rios-blue))]"
            aria-hidden="true"
          />
          Sem compromisso · resposta pelo WhatsApp
        </li>
      </ul>
    </section>
  );
}

/* ----------------------------- peças do formulário ----------------------------- */

function Campo({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Contador({
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3 py-2">
      <span className="text-sm leading-tight">{label}</span>
      <div className="flex shrink-0 items-center gap-1.5">
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
        <span className="w-6 text-center text-sm font-semibold tabular-nums">
          {value}
        </span>
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
