import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  BedDouble,
  Sofa,
  Building2,
  Loader2,
  Users,
  Clock,
  PawPrint,
  DollarSign,
  Bed,
  ListChecks,
  MessageSquare,
  ClipboardList,
} from "lucide-react";
import riosLogo from "@/assets/rios-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BED_TYPES, type BedType } from "@/constants/intakeOptions";

/* =========================================================
 *  Tipos locais
 * ========================================================= */
interface BedItem {
  id: string;
  type: BedType;
  count: number;
}

interface AmenityItem {
  id: string;
  label: string;
}

interface RoomItem {
  id: string;
  name: string;
  beds: BedItem[];
  amenities: AmenityItem[]; // comodidades extras
}

interface ExtraMattress {
  id: string;
  description: string; // ex: "Colchão queen inflável"
  count: number;
}

interface PropertyOption {
  id: string;
  name: string;
  address: string | null;
}

interface UpdateForm {
  property_id: string;
  // Regras
  check_in_time: string;
  check_out_time: string;
  pets_allowed: boolean;
  pets_max: number;
  pets_size: "pequeno" | "medio" | "grande" | "qualquer";
  pet_fee_per_stay: string; // moeda em string p/ não brigar com input
  // Capacidade & taxas
  max_capacity: number;
  extra_guest_fee: string; // por hóspede extra/diária
  cleaning_fee: string;
  // Camas e cômodos
  rooms: RoomItem[];
  extra_mattresses: ExtraMattress[];
  // Observações
  notes: string;
}

const STEPS = [
  { id: 1, title: "Imóvel", icon: Home, description: "Selecione a unidade" },
  { id: 2, title: "Regras & taxas", icon: ClipboardList, description: "Permissões e valores" },
  { id: 3, title: "Cômodos & camas", icon: BedDouble, description: "Atualize a configuração" },
  { id: 4, title: "Colchões extras", icon: Bed, description: "Camas avulsas disponíveis" },
  { id: 5, title: "Observações", icon: MessageSquare, description: "Regras adicionais e revisão" },
];

const TOTAL_STEPS = STEPS.length;

const uid = () => Math.random().toString(36).slice(2, 10);

const initialForm: UpdateForm = {
  property_id: "",
  check_in_time: "15:00",
  check_out_time: "10:00",
  pets_allowed: false,
  pets_max: 0,
  pets_size: "pequeno",
  pet_fee_per_stay: "",
  max_capacity: 2,
  extra_guest_fee: "",
  cleaning_fee: "",
  rooms: [],
  extra_mattresses: [],
  notes: "",
};

/* =========================================================
 *  Parser leve da ficha .md (best-effort)
 * ========================================================= */
function parseMarkdownFicha(md: string) {
  const result: {
    maxCapacity?: number;
    extraGuestFee?: string;
    checkIn?: string;
    checkOut?: string;
    petsAllowed?: boolean;
    cleaningFee?: string;
    rooms: { name: string }[];
  } = { rooms: [] };

  if (!md) return result;
  const text = md.toLowerCase();

  // Capacidade (procura padrão "até X pessoas")
  const capMatch = text.match(/at[éeé]\s+(\d{1,2})\s+pessoas?/);
  if (capMatch) result.maxCapacity = parseInt(capMatch[1], 10);

  // Taxa por hóspede extra ("70 reais por dia a partir de 8")
  const extraMatch = md.match(/(\d{1,4})\s*reais?\s+por\s+dia\s+a\s+partir/i);
  if (extraMatch) result.extraGuestFee = extraMatch[1];

  // Check-in / out
  const ciMatch = md.match(/check[- ]?in[^\n|]*?(\d{1,2}h\d{0,2}|\d{1,2}:\d{2})/i);
  if (ciMatch) result.checkIn = ciMatch[1].replace("h", ":").padEnd(5, "0");
  const coMatch = md.match(/check[- ]?out[^\n|]*?(\d{1,2}h\d{0,2}|\d{1,2}:\d{2})/i);
  if (coMatch) result.checkOut = coMatch[1].replace("h", ":").padEnd(5, "0");

  // Pet
  if (/pode\s+pet\?[^\n|]*?\bsim\b/i.test(md)) result.petsAllowed = true;
  if (/pode\s+pet\?[^\n|]*?\bn[ãa]o\b/i.test(md)) result.petsAllowed = false;

  // Quartos/Suítes — captura nomes via headings tipo "## Suíte 1", "## Quarto 2"
  const roomMatches = md.matchAll(/##+\s*(?:🛏️\s*)?((?:Su[ií]te|Quarto)\s*\d+)/gi);
  for (const m of roomMatches) {
    const name = m[1].trim();
    if (!result.rooms.find((r) => r.name.toLowerCase() === name.toLowerCase())) {
      result.rooms.push({ name });
    }
  }

  return result;
}

/* =========================================================
 *  Página principal
 * ========================================================= */
export default function AtualizacaoAnuncio() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ ticketId: string; propertyName: string } | null>(
    null
  );
  const [form, setForm] = useState<UpdateForm>(initialForm);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [loadingFicha, setLoadingFicha] = useState(false);

  /* ----------- Carrega propriedades do owner logado ----------- */
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoadingProps(true);
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, address")
        .eq("owner_id", user.id)
        .order("name");
      if (!error && data) setProperties(data as PropertyOption[]);
      setLoadingProps(false);
    })();
  }, [user?.id]);

  /* ----------- Quando troca o imóvel, pré-preenche da ficha ----------- */
  useEffect(() => {
    if (!form.property_id) return;
    (async () => {
      setLoadingFicha(true);
      try {
        // 1) Busca ficha .md
        const { data: ficha } = await supabase
          .from("property_files")
          .select("content_md")
          .eq("property_id", form.property_id)
          .maybeSingle();

        // 2) Busca submission de cadastro (rooms_data estruturado)
        const property = properties.find((p) => p.id === form.property_id);
        let intake: any = null;
        if (property) {
          const { data: intakeData } = await supabase
            .from("property_intake_submissions")
            .select("rooms_data, max_capacity, owner_email, owner_profile_id")
            .or(
              `owner_profile_id.eq.${user?.id},owner_email.eq.${user?.email ?? "no-email"}`
            )
            .order("created_at", { ascending: false })
            .limit(20);
          intake = (intakeData ?? []).find(
            (s) =>
              Array.isArray(s.rooms_data) &&
              s.rooms_data.some((r: any) =>
                String(r?.name || "").toLowerCase().includes(property.name.toLowerCase().split(" ")[0])
              )
          ) ?? intakeData?.[0];
        }

        const parsed = parseMarkdownFicha(ficha?.content_md || "");

        // Monta rooms preferindo intake.rooms_data
        let rooms: RoomItem[] = [];
        if (intake?.rooms_data && Array.isArray(intake.rooms_data)) {
          rooms = intake.rooms_data
            .filter((r: any) => r.type === "bedroom")
            .map((r: any) => ({
              id: uid(),
              name: r.name || "Quarto",
              beds: (r.beds || []).map((b: any) => ({
                id: uid(),
                type: (b.type as BedType) || "casal_queen",
                count: Number(b.count || 1),
              })),
              amenities: [],
            }));
        }
        if (rooms.length === 0 && parsed.rooms.length > 0) {
          rooms = parsed.rooms.map((r) => ({
            id: uid(),
            name: r.name,
            beds: [{ id: uid(), type: "casal_queen", count: 1 }],
            amenities: [],
          }));
        }
        if (rooms.length === 0) {
          rooms = [
            {
              id: uid(),
              name: "Quarto 1",
              beds: [{ id: uid(), type: "casal_queen", count: 1 }],
              amenities: [],
            },
          ];
        }

        setForm((prev) => ({
          ...prev,
          rooms,
          max_capacity:
            intake?.max_capacity ?? parsed.maxCapacity ?? prev.max_capacity ?? 2,
          extra_guest_fee: parsed.extraGuestFee ?? prev.extra_guest_fee,
          check_in_time: parsed.checkIn ?? prev.check_in_time,
          check_out_time: parsed.checkOut ?? prev.check_out_time,
          pets_allowed: parsed.petsAllowed ?? prev.pets_allowed,
        }));
      } finally {
        setLoadingFicha(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.property_id]);

  /* ----------- Helpers de update ----------- */
  const update = <K extends keyof UpdateForm>(k: K, v: UpdateForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const updateRoom = (id: string, patch: Partial<RoomItem>) =>
    setForm((p) => ({
      ...p,
      rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  const addRoom = () =>
    setForm((p) => ({
      ...p,
      rooms: [
        ...p.rooms,
        {
          id: uid(),
          name: `Quarto ${p.rooms.length + 1}`,
          beds: [{ id: uid(), type: "solteiro", count: 1 }],
          amenities: [],
        },
      ],
    }));

  const removeRoom = (id: string) =>
    setForm((p) => ({ ...p, rooms: p.rooms.filter((r) => r.id !== id) }));

  /* ----------- Validação por etapa ----------- */
  const stepValid = useMemo(() => {
    if (step === 1) return !!form.property_id;
    if (step === 2)
      return (
        form.check_in_time.length >= 4 &&
        form.check_out_time.length >= 4 &&
        form.max_capacity > 0
      );
    if (step === 3)
      return form.rooms.length > 0 && form.rooms.every((r) => r.beds.length > 0);
    return true;
  }, [step, form]);

  const next = () => {
    if (!stepValid) {
      toast.error("Preencha os campos obrigatórios para continuar");
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const prev = () => {
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ----------- Submit: cria ticket ----------- */
  const submit = async () => {
    if (!user?.id) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    setSubmitting(true);
    try {
      const property = properties.find((p) => p.id === form.property_id);
      const propertyName = property?.name ?? "Imóvel";
      const subject = `[Atualização] ${propertyName}`;

      const description = buildMarkdownSummary(form, propertyName);

      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert([
          {
            owner_id: user.id,
            created_by: user.id,
            ticket_type: "informacao",
            subject,
            description,
            priority: "normal",
            property_id: form.property_id,
          },
        ])
        .select("id")
        .single();

      if (error) throw error;

      // Mensagem inicial com o resumo (apenas se a edge function existir)
      try {
        const session = await supabase.auth.getSession();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        await fetch(`${supabaseUrl}/functions/v1/create-ticket-message/${ticket.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.data.session?.access_token}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            author_type: "owner",
            message: description,
            attachments: [],
          }),
        });
      } catch (e) {
        // Não bloqueia
        console.warn("Falha ao criar mensagem inicial", e);
      }

      // Notificação para a equipe
      try {
        await supabase.functions.invoke("notify-ticket", {
          body: { type: "ticket_created", ticketId: ticket.id },
        });
      } catch (e) {
        console.warn("Falha ao notificar equipe", e);
      }

      setSubmitted({ ticketId: ticket.id, propertyName });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SuccessScreen
        propertyName={submitted.propertyName}
        ticketId={submitted.ticketId}
        onGoTickets={() => navigate("/meus-chamados")}
        onGoHome={() => navigate("/minha-caixa")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--rios-terra))]/8 via-background to-[hsl(var(--rios-terra))]/12 relative overflow-hidden">
      {/* Decorative background blobs */}
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--rios-terra))]/20 blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-[hsl(var(--rios-terra-light))]/18 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] rounded-full bg-[hsl(var(--rios-blue))]/10 blur-3xl" />
      </div>

      <div className="relative">
        <BrandHeader />
        <StepProgress current={step} />

        <div className="container max-w-3xl mx-auto px-4 pb-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {step === 1 && (
                <Step1Property
                  form={form}
                  update={update}
                  properties={properties}
                  loading={loadingProps}
                />
              )}
              {step === 2 && <Step2Rules form={form} update={update} />}
              {step === 3 && (
                <Step3Rooms
                  form={form}
                  updateRoom={updateRoom}
                  addRoom={addRoom}
                  removeRoom={removeRoom}
                  loadingFicha={loadingFicha}
                />
              )}
              {step === 4 && <Step4ExtraMattresses form={form} update={update} />}
              {step === 5 && <Step5Notes form={form} update={update} />}
            </motion.div>
          </AnimatePresence>

          {/* Navegação */}
          <div className="flex items-center justify-between gap-3 mt-8">
            <Button
              variant="ghost"
              onClick={prev}
              disabled={step === 1 || submitting}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>

            {step < TOTAL_STEPS ? (
              <Button onClick={next} size="lg" className="gap-2 shadow-lg">
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} size="lg" disabled={submitting} className="gap-2 shadow-lg">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Enviar solicitação
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
 *  Header & Progress (mesmo padrão do CadastroImovel)
 * ========================================================= */
function BrandHeader() {
  return (
    <header className="relative">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[hsl(var(--rios-blue))] via-[hsl(var(--rios-blue-light))] to-[hsl(var(--rios-terra))]" />

      <div className="container max-w-5xl mx-auto px-4 pt-10 pb-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 sm:gap-5"
        >
          <div className="shrink-0 p-2 sm:p-2.5 rounded-2xl bg-[hsl(var(--rios-blue))]/5 ring-1 ring-[hsl(var(--rios-blue))]/15">
            <img
              src={riosLogo}
              alt="RIOS"
              className="h-10 sm:h-14 md:h-16 w-auto object-contain"
            />
          </div>
          <div className="min-w-0 border-l-2 border-[hsl(var(--rios-blue))]/25 pl-3 sm:pl-5">
            <p className="text-xs sm:text-base uppercase tracking-[0.22em] text-[hsl(var(--rios-blue))] font-bold leading-tight">
              Hospedagens
            </p>
            <p className="text-[11px] sm:text-sm text-muted-foreground mt-1 tracking-wide">
              Operação & Gestão
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
            <ListChecks className="h-3 w-3" />
            Atualização do anúncio
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground leading-tight">
            Solicite atualizações na sua unidade
          </h1>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed">
            Ajuste regras, taxas, camas e comodidades. Ao enviar, geramos um chamado{" "}
            <strong className="text-foreground">[Atualização] Nome do Imóvel</strong> para nossa
            equipe atualizar seu anúncio.
          </p>
        </motion.div>
      </div>
    </header>
  );
}

function StepProgress({ current }: { current: number }) {
  return (
    <div className="container max-w-5xl mx-auto px-4 pb-8">
      <div className="grid grid-cols-5 gap-2">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const isActive = current === s.id;
          const isDone = current > s.id;
          return (
            <div key={s.id} className="flex flex-col items-center gap-2">
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: isActive || isDone ? "100%" : "0%" }}
                  transition={{ duration: 0.4 }}
                  className="h-full bg-gradient-to-r from-[hsl(var(--rios-terra))] via-[hsl(var(--rios-terra-light))] to-[hsl(var(--rios-blue))]"
                />
              </div>
              <div className="flex items-center gap-1.5 text-[10px] md:text-xs">
                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center transition ${
                    isDone
                      ? "bg-primary text-primary-foreground"
                      : isActive
                      ? "bg-primary/20 text-primary ring-2 ring-primary/40"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                </div>
                <span
                  className={`hidden md:inline font-medium truncate ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s.title}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
 *  Step 1 — Imóvel
 * ========================================================= */
function Step1Property({
  form,
  update,
  properties,
  loading,
}: {
  form: UpdateForm;
  update: <K extends keyof UpdateForm>(k: K, v: UpdateForm[K]) => void;
  properties: PropertyOption[];
  loading: boolean;
}) {
  return (
    <Card className="p-6 md:p-8 shadow-xl border-primary/10">
      <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <Home className="h-5 w-5 text-primary" />
        Selecione o imóvel
      </h3>
      <p className="text-sm text-muted-foreground mb-6">
        Escolha qual unidade você quer atualizar. Vamos puxar os dados atuais da sua ficha.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando suas unidades...
        </div>
      ) : properties.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma unidade encontrada na sua conta. Fale com a nossa equipe.
        </div>
      ) : (
        <div className="grid gap-3">
          {properties.map((p) => {
            const active = form.property_id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => update("property_id", p.id)}
                className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                  active
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border hover:border-primary/40 bg-card"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Home className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{p.name}</div>
                    {p.address && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {p.address}
                      </div>
                    )}
                  </div>
                  {active && (
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* =========================================================
 *  Step 2 — Regras & taxas
 * ========================================================= */
function Step2Rules({
  form,
  update,
}: {
  form: UpdateForm;
  update: <K extends keyof UpdateForm>(k: K, v: UpdateForm[K]) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Horários */}
      <Card className="p-6 md:p-8 shadow-xl border-primary/10">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Horários
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Defina os horários permitidos para entrada e saída dos hóspedes.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Check-in a partir de">
            <Input
              type="time"
              value={form.check_in_time}
              onChange={(e) => update("check_in_time", e.target.value)}
            />
          </Field>
          <Field label="Check-out até">
            <Input
              type="time"
              value={form.check_out_time}
              onChange={(e) => update("check_out_time", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {/* Pets */}
      <Card className="p-6 md:p-8 shadow-xl border-primary/10">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <PawPrint className="h-5 w-5 text-primary" />
          Política de pets
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Aceita animais? Quantos? De qual porte?
        </p>

        <div className="flex items-center justify-between rounded-xl border-2 border-border p-4 mb-4">
          <div>
            <div className="font-medium text-sm">Permitir pets</div>
            <div className="text-xs text-muted-foreground">
              Habilita os campos abaixo
            </div>
          </div>
          <Switch
            checked={form.pets_allowed}
            onCheckedChange={(v) => update("pets_allowed", v)}
          />
        </div>

        <div
          className={`grid grid-cols-1 md:grid-cols-3 gap-4 transition-opacity ${
            form.pets_allowed ? "opacity-100" : "opacity-40 pointer-events-none"
          }`}
        >
          <NumberField
            label="Quantidade máxima"
            value={form.pets_max}
            onChange={(v) => update("pets_max", v)}
            min={0}
            max={10}
          />
          <Field label="Porte permitido">
            <Select
              value={form.pets_size}
              onValueChange={(v) => update("pets_size", v as UpdateForm["pets_size"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pequeno">Pequeno (até 10kg)</SelectItem>
                <SelectItem value="medio">Médio (10–25kg)</SelectItem>
                <SelectItem value="grande">Grande (acima de 25kg)</SelectItem>
                <SelectItem value="qualquer">Qualquer porte</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Taxa extra por estadia (R$)" icon={DollarSign}>
            <Input
              inputMode="numeric"
              placeholder="Ex: 150"
              value={form.pet_fee_per_stay}
              onChange={(e) =>
                update(
                  "pet_fee_per_stay",
                  e.target.value.replace(/[^\d.,]/g, "")
                )
              }
            />
          </Field>
        </div>
      </Card>

      {/* Capacidade & taxas */}
      <Card className="p-6 md:p-8 shadow-xl border-primary/10">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Capacidade & valores
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Capacidade puxada da sua ficha. Ajuste se quiser mudar.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumberField
            label="Capacidade máxima atual"
            value={form.max_capacity}
            onChange={(v) => update("max_capacity", v)}
            min={1}
            max={30}
          />
          <Field label="Taxa por hóspede extra/diária (R$)" icon={DollarSign}>
            <Input
              inputMode="numeric"
              placeholder="Ex: 70"
              value={form.extra_guest_fee}
              onChange={(e) =>
                update(
                  "extra_guest_fee",
                  e.target.value.replace(/[^\d.,]/g, "")
                )
              }
            />
          </Field>
          <Field label="Taxa de faxina (R$)" icon={DollarSign}>
            <Input
              inputMode="numeric"
              placeholder="Ex: 250"
              value={form.cleaning_fee}
              onChange={(e) =>
                update("cleaning_fee", e.target.value.replace(/[^\d.,]/g, ""))
              }
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}

/* =========================================================
 *  Step 3 — Cômodos & camas
 * ========================================================= */
function Step3Rooms({
  form,
  updateRoom,
  addRoom,
  removeRoom,
  loadingFicha,
}: {
  form: UpdateForm;
  updateRoom: (id: string, patch: Partial<RoomItem>) => void;
  addRoom: () => void;
  removeRoom: (id: string) => void;
  loadingFicha: boolean;
}) {
  return (
    <Card className="p-6 md:p-8 shadow-xl border-primary/10">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <BedDouble className="h-5 w-5 text-primary" />
            Cômodos & camas
          </h3>
          <p className="text-sm text-muted-foreground">
            Puxamos da sua ficha. Edite, adicione camas ou comodidades novas.
          </p>
        </div>
        <Button onClick={addRoom} variant="outline" size="sm" className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Quarto
        </Button>
      </div>

      {loadingFicha ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados da sua ficha...
        </div>
      ) : (
        <div className="space-y-4">
          {form.rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              update={(patch) => updateRoom(room.id, patch)}
              onRemove={() => removeRoom(room.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function RoomCard({
  room,
  update,
  onRemove,
}: {
  room: RoomItem;
  update: (patch: Partial<RoomItem>) => void;
  onRemove: () => void;
}) {
  const addBed = () =>
    update({
      beds: [...room.beds, { id: uid(), type: "solteiro", count: 1 }],
    });
  const removeBed = (id: string) =>
    update({ beds: room.beds.filter((b) => b.id !== id) });
  const updateBed = (id: string, patch: Partial<BedItem>) =>
    update({
      beds: room.beds.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });

  const addAmenity = () =>
    update({
      amenities: [...room.amenities, { id: uid(), label: "" }],
    });
  const removeAmenity = (id: string) =>
    update({ amenities: room.amenities.filter((a) => a.id !== id) });
  const updateAmenity = (id: string, label: string) =>
    update({
      amenities: room.amenities.map((a) => (a.id === id ? { ...a, label } : a)),
    });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl border-2 border-border bg-card p-4 hover:border-primary/30 transition-colors"
    >
      {/* Header do quarto */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <BedDouble className="h-5 w-5" />
          </div>
          <Input
            value={room.name}
            onChange={(e) => update({ name: e.target.value })}
            className="font-semibold h-9"
            placeholder="Nome do quarto"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Camas */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Camas
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addBed}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3 w-3" /> Cama
          </Button>
        </div>
        {room.beds.map((bed) => (
          <div key={bed.id} className="flex items-center gap-2">
            <Select
              value={bed.type}
              onValueChange={(v) => updateBed(bed.id, { type: v as BedType })}
            >
              <SelectTrigger className="flex-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BED_TYPES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center rounded-md border border-input">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-8"
                onClick={() =>
                  updateBed(bed.id, { count: Math.max(1, bed.count - 1) })
                }
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-8 text-center text-sm font-medium">{bed.count}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-8"
                onClick={() => updateBed(bed.id, { count: bed.count + 1 })}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              onClick={() => removeBed(bed.id)}
              disabled={room.beds.length === 1}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Comodidades extras */}
      <div className="pt-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Comodidades novas neste quarto
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addAmenity}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3 w-3" /> Comodidade
          </Button>
        </div>
        {room.amenities.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Nenhuma comodidade nova adicionada. Use o botão acima se atualizou algo (ex: nova
            TV, ar-condicionado, varanda...).
          </p>
        ) : (
          room.amenities.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <Input
                value={a.label}
                onChange={(e) => updateAmenity(a.id, e.target.value)}
                placeholder="Ex: Ar-condicionado split novo, Smart TV 50''..."
                className="h-9"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => removeAmenity(a.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

/* =========================================================
 *  Step 4 — Colchões extras
 * ========================================================= */
function Step4ExtraMattresses({
  form,
  update,
}: {
  form: UpdateForm;
  update: <K extends keyof UpdateForm>(k: K, v: UpdateForm[K]) => void;
}) {
  const add = () =>
    update("extra_mattresses", [
      ...form.extra_mattresses,
      { id: uid(), description: "", count: 1 },
    ]);
  const remove = (id: string) =>
    update(
      "extra_mattresses",
      form.extra_mattresses.filter((m) => m.id !== id)
    );
  const upd = (id: string, patch: Partial<ExtraMattress>) =>
    update(
      "extra_mattresses",
      form.extra_mattresses.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );

  return (
    <Card className="p-6 md:p-8 shadow-xl border-primary/10">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <Bed className="h-5 w-5 text-primary" />
            Colchões extras
          </h3>
          <p className="text-sm text-muted-foreground">
            Camas/colchões avulsos que ficam disponíveis na unidade (ex: colchão inflável,
            futon, sofá-cama de apoio).
          </p>
        </div>
        <Button onClick={add} variant="outline" size="sm" className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {form.extra_mattresses.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum colchão extra adicionado.
        </div>
      ) : (
        <div className="space-y-3">
          {form.extra_mattresses.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 rounded-xl border-2 border-border bg-card p-3"
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Bed className="h-4 w-4" />
              </div>
              <Input
                value={m.description}
                onChange={(e) => upd(m.id, { description: e.target.value })}
                placeholder="Ex: Colchão queen inflável, futon de solteiro..."
                className="flex-1 h-9"
              />
              <div className="flex items-center rounded-md border border-input shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-8"
                  onClick={() => upd(m.id, { count: Math.max(1, m.count - 1) })}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-8 text-center text-sm font-medium">{m.count}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-8"
                  onClick={() => upd(m.id, { count: m.count + 1 })}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => remove(m.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* =========================================================
 *  Step 5 — Observações
 * ========================================================= */
function Step5Notes({
  form,
  update,
}: {
  form: UpdateForm;
  update: <K extends keyof UpdateForm>(k: K, v: UpdateForm[K]) => void;
}) {
  return (
    <Card className="p-6 md:p-8 shadow-xl border-primary/10">
      <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        Observações finais
      </h3>
      <p className="text-sm text-muted-foreground mb-6">
        Comente qualquer atualização das regras do anúncio ou do condomínio. Se mora em prédio,
        descreva mudanças nas regras coletivas (horário de silêncio, área comum, portaria,
        etc.).
      </p>

      <Textarea
        value={form.notes}
        onChange={(e) => update("notes", e.target.value)}
        placeholder="Ex: Mudamos a regra de festa — agora não é mais permitido após 22h. O condomínio passou a cobrar taxa extra para uso da churrasqueira..."
        rows={10}
        maxLength={3000}
        className="text-base"
      />
      <p className="text-xs text-muted-foreground mt-2 text-right">
        {form.notes.length}/3000
      </p>

      <div className="mt-6 rounded-xl bg-primary/5 border border-primary/10 p-4 text-sm">
        <p className="font-medium mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Pronto para enviar?
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Vamos abrir um chamado <strong>[Atualização] Nome do Imóvel</strong> com tudo que você
          preencheu. Nossa equipe revisa e atualiza seu anúncio nas plataformas.
        </p>
      </div>
    </Card>
  );
}

/* =========================================================
 *  Sucesso
 * ========================================================= */
function SuccessScreen({
  propertyName,
  ticketId,
  onGoTickets,
  onGoHome,
}: {
  propertyName: string;
  ticketId: string;
  onGoTickets: () => void;
  onGoHome: () => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--rios-terra))]/8 via-background to-[hsl(var(--rios-terra))]/12 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg w-full"
      >
        <Card className="p-8 md:p-10 shadow-2xl border-primary/10 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
            <Check className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Solicitação enviada!</h2>
          <p className="text-muted-foreground mb-6">
            Abrimos o chamado{" "}
            <strong className="text-foreground">[Atualização] {propertyName}</strong>. Nossa
            equipe vai revisar e atualizar seu anúncio em breve.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={onGoTickets} className="gap-2">
              Ver meus chamados
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={onGoHome}>
              Voltar à caixa
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-6">
            Protocolo: {ticketId.slice(0, 8)}
          </p>
        </Card>
      </motion.div>
    </div>
  );
}

/* =========================================================
 *  Componentes utilitários
 * ========================================================= */
function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </Label>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
  icon: Icon,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </Label>
      <div className="flex items-center rounded-md border border-input bg-background">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-r-none"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input
          type="number"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
          }}
          className="h-10 border-0 text-center focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-l-none"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* =========================================================
 *  Geração do markdown enviado no chamado
 * ========================================================= */
function buildMarkdownSummary(form: UpdateForm, propertyName: string): string {
  const bedLabel = (t: BedType) =>
    BED_TYPES.find((b) => b.value === t)?.label ?? t;

  const petsBlock = form.pets_allowed
    ? `- ✅ **Permite pets**\n- Quantidade máxima: **${form.pets_max}**\n- Porte: **${form.pets_size}**\n- Taxa por estadia: **${form.pet_fee_per_stay ? `R$ ${form.pet_fee_per_stay}` : "—"}**`
    : `- 🚫 **Não permite pets**`;

  const roomsBlock = form.rooms
    .map((r) => {
      const beds = r.beds
        .map((b) => `  - ${b.count}× ${bedLabel(b.type)}`)
        .join("\n");
      const ams = r.amenities.filter((a) => a.label.trim()).length
        ? `\n  Comodidades novas:\n${r.amenities
            .filter((a) => a.label.trim())
            .map((a) => `    - ${a.label.trim()}`)
            .join("\n")}`
        : "";
      return `- **${r.name}**\n${beds}${ams}`;
    })
    .join("\n");

  const mattressBlock = form.extra_mattresses.filter((m) => m.description.trim())
    .length
    ? form.extra_mattresses
        .filter((m) => m.description.trim())
        .map((m) => `- ${m.count}× ${m.description.trim()}`)
        .join("\n")
    : "_Nenhum colchão extra informado._";

  return `## 📝 Solicitação de atualização do anúncio
**Imóvel:** ${propertyName}

### 🕒 Horários
- Check-in a partir de: **${form.check_in_time}**
- Check-out até: **${form.check_out_time}**

### 🐾 Política de pets
${petsBlock}

### 👥 Capacidade & taxas
- Capacidade máxima: **${form.max_capacity}** hóspedes
- Taxa por hóspede extra/diária: **${form.extra_guest_fee ? `R$ ${form.extra_guest_fee}` : "—"}**
- Taxa de faxina: **${form.cleaning_fee ? `R$ ${form.cleaning_fee}` : "—"}**

### 🛏️ Cômodos & camas
${roomsBlock || "_Nenhum quarto informado._"}

### 🛌 Colchões extras
${mattressBlock}

### 💬 Observações
${form.notes.trim() || "_Sem observações adicionais._"}
`;
}
