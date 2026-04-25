import { useEffect, useMemo, useState } from "react";
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
  ChefHat,
  Building2,
  PartyPopper,
  Loader2,
  Wifi,
  Car,
  Users,
  Mail,
  Phone,
  MapPin,
  User,
  Tv,
  Wind,
  Snowflake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import logoRios from "@/assets/rios-logo-wordmark.png";
import {
  BED_TYPES,
  KITCHEN_ITEMS,
  SPECIAL_AMENITIES,
  CONDO_AMENITIES,
  type IntakeFormData,
  type RoomEntry,
  type BedType,
} from "@/constants/intakeOptions";

const STEPS = [
  { id: 1, title: "Sobre você", icon: User, description: "Identificação e ficha técnica" },
  { id: 2, title: "Cômodos", icon: BedDouble, description: "Camas e equipamentos" },
  { id: 3, title: "Cozinha & especiais", icon: ChefHat, description: "O que torna seu imóvel único" },
  { id: 4, title: "Condomínio", icon: Building2, description: "Comodidades do prédio" },
  { id: 5, title: "Revisão", icon: PartyPopper, description: "Confira e envie" },
];

const initialForm: IntakeFormData = {
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  property_nickname: "",
  property_address: "",
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
  rooms_data: [],
  kitchen_items: [],
  special_amenities: [],
  condo_amenities: [],
  notes: "",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function buildRooms(form: IntakeFormData, existing: RoomEntry[]): RoomEntry[] {
  const next: RoomEntry[] = [];
  const usedExisting = new Set<string>();

  const findExisting = (type: "bedroom" | "living_room", name: string, floor: number) => {
    const match = existing.find(
      (r) => !usedExisting.has(r.id) && r.type === type && r.name === name && r.floor === floor
    );
    if (match) usedExisting.add(match.id);
    return match;
  };

  const totalFloors = Math.max(1, form.property_levels || 1);

  for (let i = 0; i < form.bedrooms_count; i++) {
    const isSuite = i < form.suites_count;
    const cleanName = isSuite ? `Suíte ${i + 1}` : `Quarto ${i + 1 - form.suites_count}`;
    const floor = totalFloors > 1 ? (i % totalFloors) + 1 : 1;
    const existingRoom = findExisting("bedroom", cleanName, floor);
    next.push(
      existingRoom || {
        id: uid(),
        type: "bedroom",
        name: cleanName,
        floor,
        beds: [{ type: "casal_queen" as BedType, count: 1 }],
        hasAC: false,
        hasTV: false,
        hasBalcony: false,
        hasOutdoorArea: false,
      }
    );
  }
  for (let i = 0; i < form.living_rooms_count; i++) {
    const name = form.living_rooms_count > 1 ? `Sala ${i + 1}` : "Sala de estar";
    const floor = totalFloors > 1 ? (i % totalFloors) + 1 : 1;
    const existingRoom = findExisting("living_room", name, floor);
    next.push(
      existingRoom || {
        id: uid(),
        type: "living_room",
        name,
        floor,
        beds: [],
        hasAC: false,
        hasTV: true,
        hasBalcony: false,
        hasOutdoorArea: false,
      }
    );
  }

  return next;
}

export default function CadastroImovel() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<IntakeFormData>(initialForm);

  useEffect(() => {
    setForm((prev) => ({ ...prev, rooms_data: buildRooms(prev, prev.rooms_data) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bedrooms_count, form.living_rooms_count, form.suites_count, form.property_levels]);

  const update = <K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
  };

  const updateRoom = (id: string, patch: Partial<RoomEntry>) => {
    setForm((p) => ({
      ...p,
      rooms_data: p.rooms_data.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const toggleArr = <T extends string>(key: keyof IntakeFormData, value: T) => {
    setForm((p) => {
      const arr = (p[key] as unknown as T[]) || [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...p, [key]: next as unknown as IntakeFormData[typeof key] };
    });
  };

  const stepValid = useMemo(() => {
    if (step === 1) {
      return (
        form.owner_name.trim().length > 1 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.owner_email) &&
        form.property_address.trim().length > 4 &&
        form.bedrooms_count > 0 &&
        form.bathrooms_count > 0 &&
        form.max_capacity > 0
      );
    }
    if (step === 2) {
      return form.rooms_data.filter((r) => r.type === "bedroom").every((r) => r.beds.length > 0);
    }
    return true;
  }, [step, form]);

  const next = () => {
    if (!stepValid) {
      toast.error("Preencha os campos obrigatórios para continuar");
      return;
    }
    setStep((s) => Math.min(5, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const prev = () => {
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        rooms_data: form.rooms_data.map((r) => ({
          name: r.name,
          type: r.type,
          floor: r.floor,
          beds: r.beds,
          hasAC: r.hasAC,
          hasTV: r.hasTV,
          hasBalcony: r.hasBalcony,
          hasOutdoorArea: r.hasOutdoorArea,
        })),
      };
      const { data, error } = await supabase.functions.invoke("submit-property-intake", {
        body: payload,
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return <SuccessScreen ownerName={form.owner_name} email={form.owner_email} />;
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "hsl(40 30% 96%)" }}>
      {/* Fontes editoriais */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap"
      />

      {/* Texturas decorativas — círculos sutis, simulando aquarela */}
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full blur-3xl opacity-40"
          style={{ background: "hsl(206 56% 22% / 0.18)" }}
        />
        <div
          className="absolute top-1/3 -left-40 w-[380px] h-[380px] rounded-full blur-3xl opacity-30"
          style={{ background: "hsl(20 63% 48% / 0.18)" }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-[300px] h-[300px] rounded-full blur-3xl opacity-25"
          style={{ background: "hsl(38 50% 55% / 0.2)" }}
        />
      </div>

      <div className="relative" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <BrandHeader />
        <StepProgress current={step} />

        <div className="container max-w-3xl mx-auto px-4 pb-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 1 && <Step1 form={form} update={update} />}
              {step === 2 && <Step2 form={form} updateRoom={updateRoom} />}
              {step === 3 && (
                <Step3
                  form={form}
                  toggleKitchen={(v) => toggleArr("kitchen_items", v)}
                  toggleSpecial={(v) => toggleArr("special_amenities", v)}
                />
              )}
              {step === 4 && (
                <Step4 form={form} toggleCondo={(v) => toggleArr("condo_amenities", v)} />
              )}
              {step === 5 && <Step5 form={form} update={update} />}
            </motion.div>
          </AnimatePresence>

          {/* Navegação */}
          <div className="flex items-center justify-between gap-3 mt-10">
            <button
              onClick={prev}
              disabled={step === 1 || submitting}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium tracking-wide transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:gap-3"
              style={{ color: "hsl(206 56% 22%)" }}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>

            {step < 5 ? (
              <button
                onClick={next}
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-medium tracking-wide text-white shadow-lg transition-all hover:gap-3 hover:shadow-xl active:scale-[0.98]"
                style={{
                  background: "hsl(20 63% 48%)",
                  boxShadow: "0 10px 30px -8px hsl(20 63% 48% / 0.5)",
                }}
              >
                Continuar
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={submitting}
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-medium tracking-wide text-white shadow-lg transition-all hover:gap-3 hover:shadow-xl active:scale-[0.98] disabled:opacity-60"
                style={{
                  background: "hsl(20 63% 48%)",
                  boxShadow: "0 10px 30px -8px hsl(20 63% 48% / 0.5)",
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Enviar minha ficha
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- BRAND HEADER ----------------------------- */
function BrandHeader() {
  return (
    <header className="container max-w-5xl mx-auto px-4 pt-10 md:pt-14 pb-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <img
          src={logoRios}
          alt="RIOS Hospedagens"
          className="h-8 md:h-10 w-auto object-contain"
        />
        <div
          className="hidden md:flex items-center gap-2 text-xs tracking-[0.25em] uppercase"
          style={{ color: "hsl(206 56% 22% / 0.6)" }}
        >
          <span className="h-px w-8" style={{ background: "hsl(38 50% 55%)" }} />
          Cadastro de Parceiros
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.6 }}
        className="mt-12 md:mt-16 max-w-2xl"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px w-10" style={{ background: "hsl(20 63% 48%)" }} />
          <span
            className="text-[11px] tracking-[0.3em] uppercase font-medium"
            style={{ color: "hsl(20 63% 48%)" }}
          >
            Bem-vindo
          </span>
        </div>
        <h2
          className="text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tight"
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontWeight: 400,
            color: "hsl(206 56% 22%)",
          }}
        >
          Vamos conhecer o<br />
          <span style={{ fontStyle: "italic", fontWeight: 300 }}>seu imóvel.</span>
        </h2>
        <p
          className="mt-6 text-base md:text-lg leading-relaxed max-w-xl"
          style={{ color: "hsl(206 30% 35%)" }}
        >
          Preencha os detalhes abaixo e nossa equipe entrará em contato para uma
          conversa exclusiva sobre como transformar seu imóvel em uma hospedagem
          de excelência.
        </p>
      </motion.div>
    </header>
  );
}

/* ----------------------------- PROGRESS BAR ----------------------------- */
function StepProgress({ current }: { current: number }) {
  return (
    <div className="container max-w-5xl mx-auto px-4 pb-10">
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[11px] tracking-[0.3em] uppercase font-medium"
          style={{ color: "hsl(206 56% 22% / 0.5)" }}
        >
          Etapa
        </span>
        <span
          className="text-sm tracking-wider"
          style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "hsl(206 56% 22%)" }}
        >
          {String(current).padStart(2, "0")} <span style={{ color: "hsl(38 50% 55%)" }}>—</span>{" "}
          {String(STEPS.length).padStart(2, "0")}
        </span>
      </div>

      <div
        className="h-[3px] w-full rounded-full overflow-hidden"
        style={{ background: "hsl(206 20% 88%)" }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(current / STEPS.length) * 100}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, hsl(20 63% 48%), hsl(38 50% 55%))",
          }}
        />
      </div>

      <div className="hidden md:grid grid-cols-5 gap-2 mt-4">
        {STEPS.map((s) => {
          const isActive = current === s.id;
          const isDone = current > s.id;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium transition-all duration-300 shrink-0"
                style={{
                  background: isDone
                    ? "hsl(20 63% 48%)"
                    : isActive
                    ? "hsl(206 56% 22%)"
                    : "hsl(206 20% 88%)",
                  color: isDone || isActive ? "white" : "hsl(206 30% 50%)",
                }}
              >
                {isDone ? <Check className="h-3 w-3" /> : s.id}
              </div>
              <span
                className="text-xs font-medium truncate"
                style={{
                  color: isActive
                    ? "hsl(206 56% 22%)"
                    : isDone
                    ? "hsl(20 63% 48%)"
                    : "hsl(206 30% 55%)",
                }}
              >
                {s.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- CARD WRAPPER --------------------------- */
function EditorialCard({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  number?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="relative rounded-2xl bg-white/90 backdrop-blur-sm border p-6 md:p-8 shadow-[0_10px_40px_-20px_hsl(206_56%_22%/0.2)]"
      style={{ borderColor: "hsl(206 20% 90%)" }}
    >
      <h3
        className="text-xl md:text-2xl font-semibold tracking-tight"
        style={{ color: "hsl(206 56% 22%)" }}
      >
        {title}
      </h3>
      {subtitle && (
        <p
          className="text-sm mt-1.5 mb-6 max-w-xl"
          style={{ color: "hsl(206 30% 45%)" }}
        >
          {subtitle}
        </p>
      )}
      {!subtitle && <div className="mb-6" />}
      {children}
    </div>
  );
}

/* --------------------------------- STEP 1 -------------------------------- */
function Step1({
  form,
  update,
}: {
  form: IntakeFormData;
  update: <K extends keyof IntakeFormData>(k: K, v: IntakeFormData[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <EditorialCard title="Sobre você" subtitle="Como podemos te chamar?">
        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Nome completo" required icon={User}>
            <Input
              value={form.owner_name}
              onChange={(e) => update("owner_name", e.target.value)}
              placeholder="Seu nome"
              maxLength={200}
              className="h-11 bg-transparent border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-b-2 transition-colors"
              style={{ borderColor: "hsl(206 30% 75%)" }}
            />
          </Field>
          <Field label="E-mail" required icon={Mail}>
            <Input
              type="email"
              value={form.owner_email}
              onChange={(e) => update("owner_email", e.target.value)}
              placeholder="voce@email.com"
              className="h-11 bg-transparent border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-b-2"
              style={{ borderColor: "hsl(206 30% 75%)" }}
            />
          </Field>
          <Field label="Telefone (WhatsApp)" icon={Phone}>
            <Input
              value={form.owner_phone}
              onChange={(e) => update("owner_phone", e.target.value)}
              placeholder="(11) 99999-9999"
              className="h-11 bg-transparent border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-b-2"
              style={{ borderColor: "hsl(206 30% 75%)" }}
            />
          </Field>
          <Field label="Apelido do imóvel">
            <Input
              value={form.property_nickname}
              onChange={(e) => update("property_nickname", e.target.value)}
              placeholder="Ex.: Cobertura Vista Mar"
              className="h-11 bg-transparent border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-b-2"
              style={{ borderColor: "hsl(206 30% 75%)" }}
            />
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Endereço completo" required icon={MapPin}>
            <Input
              value={form.property_address}
              onChange={(e) => update("property_address", e.target.value)}
              placeholder="Rua, número, bairro, cidade"
              maxLength={500}
              className="h-11 bg-transparent border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-b-2"
              style={{ borderColor: "hsl(206 30% 75%)" }}
            />
          </Field>
        </div>
      </EditorialCard>

      <EditorialCard
       
        title="Ficha técnica"
        subtitle="Os números essenciais do seu imóvel."
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <NumberField label="Quartos" required value={form.bedrooms_count} onChange={(v) => update("bedrooms_count", v)} min={1} max={20} />
          <NumberField label="Suítes" value={form.suites_count} onChange={(v) => update("suites_count", Math.min(v, form.bedrooms_count))} min={0} max={form.bedrooms_count} />
          <NumberField label="Salas" value={form.living_rooms_count} onChange={(v) => update("living_rooms_count", v)} min={0} max={10} />
          <NumberField label="Banheiros" required value={form.bathrooms_count} onChange={(v) => update("bathrooms_count", v)} min={1} max={20} />
          <NumberField label="Capacidade máxima" required value={form.max_capacity} onChange={(v) => update("max_capacity", v)} min={1} max={30} icon={Users} />
          <NumberField label="Vagas garagem" value={form.parking_spots} onChange={(v) => update("parking_spots", v)} min={0} max={20} icon={Car} />
          <NumberField label="Pavimentos do imóvel" value={form.property_levels} onChange={(v) => update("property_levels", v)} min={1} max={5} hint="Duplex/triplex contam aqui" />
          <NumberField label="Andares do prédio" value={form.building_floors ?? 0} onChange={(v) => update("building_floors", v || null)} min={0} max={100} hint="0 se não souber" />
          <NumberField label="Andar do apartamento" value={form.apartment_floor ?? 0} onChange={(v) => update("apartment_floor", v || null)} min={0} max={100} hint="0 = térreo / casa" />
        </div>

        <div className="mt-7 grid md:grid-cols-2 gap-3">
          <ToggleRow icon={Building2} label="Possui elevador" value={form.has_elevator} onChange={(v) => update("has_elevator", v)} />
          <ToggleRow icon={Wifi} label="Wi-Fi disponível" value={form.has_wifi} onChange={(v) => update("has_wifi", v)} />
        </div>
      </EditorialCard>
    </div>
  );
}

/* --------------------------------- STEP 2 -------------------------------- */
function Step2({
  form,
  updateRoom,
}: {
  form: IntakeFormData;
  updateRoom: (id: string, patch: Partial<RoomEntry>) => void;
}) {
  const totalFloors = Math.max(1, form.property_levels);
  const floorsArray = Array.from({ length: totalFloors }, (_, i) => i + 1);

  return (
    <EditorialCard
     
      title="Cômodos & camas"
      subtitle={`Configure cada cômodo gerado a partir da ficha técnica.${
        totalFloors > 1 ? " Selecione em qual pavimento cada um se encontra." : ""
      }`}
    >
      {floorsArray.map((floor) => {
        const roomsOnFloor = form.rooms_data.filter((r) => r.floor === floor);
        if (totalFloors === 1) {
          return (
            <div key={floor} className="space-y-4">
              {roomsOnFloor.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  floors={floorsArray}
                  showFloorPicker={false}
                  updateRoom={updateRoom}
                />
              ))}
            </div>
          );
        }
        return (
          <div key={floor} className="mb-8 last:mb-0">
            <div
              className="flex items-center gap-3 mb-4"
              style={{ color: "hsl(206 56% 22%)" }}
            >
              <span
                className="text-xs tracking-[0.3em] uppercase font-medium"
                style={{ color: "hsl(20 63% 48%)" }}
              >
                Pavimento {floor}
              </span>
              <span className="h-px flex-1" style={{ background: "hsl(38 50% 55% / 0.4)" }} />
            </div>
            <div className="space-y-3">
              {roomsOnFloor.length === 0 && (
                <p
                  className="text-xs italic pl-2"
                  style={{ color: "hsl(206 30% 55%)" }}
                >
                  Nenhum cômodo neste pavimento. Use o seletor "Pavimento" em qualquer cômodo abaixo para realocar.
                </p>
              )}
              {roomsOnFloor.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  floors={floorsArray}
                  showFloorPicker={true}
                  updateRoom={updateRoom}
                />
              ))}
            </div>
          </div>
        );
      })}
    </EditorialCard>
  );
}

function RoomCard({
  room,
  floors,
  showFloorPicker,
  updateRoom,
}: {
  room: RoomEntry;
  floors: number[];
  showFloorPicker: boolean;
  updateRoom: (id: string, patch: Partial<RoomEntry>) => void;
}) {
  const isBedroom = room.type === "bedroom";
  const Icon = isBedroom ? BedDouble : Sofa;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl border p-5 transition-all hover:shadow-md"
      style={{
        background: "hsl(40 30% 98%)",
        borderColor: "hsl(206 20% 88%)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div
            className="h-11 w-11 rounded-full flex items-center justify-center"
            style={{
              background: isBedroom ? "hsl(206 56% 22% / 0.08)" : "hsl(20 63% 48% / 0.1)",
              color: isBedroom ? "hsl(206 56% 22%)" : "hsl(20 63% 48%)",
            }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h4
              className="text-lg tracking-tight"
              style={{
                fontFamily: "'Fraunces', serif",
                fontWeight: 500,
                color: "hsl(206 56% 22%)",
              }}
            >
              {room.name}
            </h4>
            <p
              className="text-[11px] tracking-[0.2em] uppercase mt-0.5"
              style={{ color: "hsl(206 30% 55%)" }}
            >
              {isBedroom ? "Quarto" : "Sala"}
            </p>
          </div>
        </div>
        {showFloorPicker && (
          <Select
            value={String(room.floor)}
            onValueChange={(v) => updateRoom(room.id, { floor: Number(v) })}
          >
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {floors.map((f) => (
                <SelectItem key={f} value={String(f)}>
                  Pavimento {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Camas */}
      <div className="space-y-2 mb-4">
        {room.beds.map((bed, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Select
              value={bed.type}
              onValueChange={(v) => {
                const newBeds = [...room.beds];
                newBeds[idx] = { ...bed, type: v as BedType };
                updateRoom(room.id, { beds: newBeds });
              }}
            >
              <SelectTrigger className="flex-1 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BED_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div
              className="flex items-center gap-1 rounded-md bg-white border"
              style={{ borderColor: "hsl(206 20% 88%)" }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  const newBeds = [...room.beds];
                  newBeds[idx] = { ...bed, count: Math.max(1, bed.count - 1) };
                  updateRoom(room.id, { beds: newBeds });
                }}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span
                className="w-6 text-center text-sm"
                style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}
              >
                {bed.count}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  const newBeds = [...room.beds];
                  newBeds[idx] = { ...bed, count: Math.min(10, bed.count + 1) };
                  updateRoom(room.id, { beds: newBeds });
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              onClick={() => {
                const newBeds = room.beds.filter((_, i) => i !== idx);
                updateRoom(room.id, { beds: newBeds });
              }}
              disabled={isBedroom && room.beds.length === 1}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <button
          type="button"
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-medium border border-dashed transition-all hover:bg-white"
          style={{
            borderColor: "hsl(20 63% 48% / 0.4)",
            color: "hsl(20 63% 48%)",
          }}
          onClick={() =>
            updateRoom(room.id, {
              beds: [...room.beds, { type: isBedroom ? "solteiro" : "sofa_cama", count: 1 }],
            })
          }
        >
          <Plus className="h-3 w-3" />
          Adicionar {isBedroom ? "cama" : "sofá / cama"}
        </button>
      </div>

      {/* Equipamentos */}
      <div className="grid grid-cols-2 gap-2">
        <FeatureChip
          active={room.hasAC}
          icon={Snowflake}
          label="Ar-condicionado"
          onClick={() => updateRoom(room.id, { hasAC: !room.hasAC })}
        />
        <FeatureChip
          active={room.hasTV}
          icon={Tv}
          label="Televisão"
          onClick={() => updateRoom(room.id, { hasTV: !room.hasTV })}
        />
        <FeatureChip
          active={room.hasBalcony}
          icon={Wind}
          label="Conexão à varanda"
          onClick={() => updateRoom(room.id, { hasBalcony: !room.hasBalcony })}
        />
        <FeatureChip
          active={room.hasOutdoorArea}
          icon={Home}
          label="Acesso à área externa"
          onClick={() => updateRoom(room.id, { hasOutdoorArea: !room.hasOutdoorArea })}
        />
      </div>
    </motion.div>
  );
}

/* --------------------------------- STEP 3 -------------------------------- */
function Step3({
  form,
  toggleKitchen,
  toggleSpecial,
}: {
  form: IntakeFormData;
  toggleKitchen: (v: string) => void;
  toggleSpecial: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <EditorialCard
       
        title="Itens da cozinha"
        subtitle="Marque tudo que está disponível."
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {KITCHEN_ITEMS.map((item) => (
            <PickChip
              key={item.value}
              icon={item.icon}
              label={item.label}
              active={(form.kitchen_items as string[]).includes(item.value)}
              onClick={() => toggleKitchen(item.value)}
            />
          ))}
        </div>
      </EditorialCard>

      <EditorialCard
       
        title="Comodidades especiais"
        subtitle="O que torna seu imóvel único?"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {SPECIAL_AMENITIES.map((item) => (
            <PickChip
              key={item.value}
              icon={item.icon}
              label={item.label}
              active={(form.special_amenities as string[]).includes(item.value)}
              onClick={() => toggleSpecial(item.value)}
            />
          ))}
        </div>
      </EditorialCard>
    </div>
  );
}

/* --------------------------------- STEP 4 -------------------------------- */
function Step4({ form, toggleCondo }: { form: IntakeFormData; toggleCondo: (v: string) => void }) {
  return (
    <EditorialCard
     
      title="Comodidades do condomínio"
      subtitle="Estrutura compartilhada disponível aos hóspedes."
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        {CONDO_AMENITIES.map((item) => (
          <PickChip
            key={item.value}
            icon={item.icon}
            label={item.label}
            active={(form.condo_amenities as string[]).includes(item.value)}
            onClick={() => toggleCondo(item.value)}
          />
        ))}
      </div>
    </EditorialCard>
  );
}

/* --------------------------------- STEP 5 -------------------------------- */
function Step5({
  form,
  update,
}: {
  form: IntakeFormData;
  update: <K extends keyof IntakeFormData>(k: K, v: IntakeFormData[K]) => void;
}) {
  const totalBeds = form.rooms_data.reduce(
    (sum, r) => sum + r.beds.reduce((s, b) => s + b.count, 0),
    0
  );

  return (
    <div className="space-y-6">
      <EditorialCard title="Tudo certo?" subtitle="Revise as informações antes de enviar.">
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-1 mb-8">
          <SummaryItem label="Proprietário" value={form.owner_name} />
          <SummaryItem label="E-mail" value={form.owner_email} />
          <SummaryItem label="Telefone" value={form.owner_phone || "—"} />
          <SummaryItem label="Imóvel" value={form.property_nickname || "—"} />
          <SummaryItem label="Endereço" value={form.property_address} className="md:col-span-2" />
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-8">
          <Stat label="Quartos" value={form.bedrooms_count} />
          <Stat label="Suítes" value={form.suites_count} />
          <Stat label="Salas" value={form.living_rooms_count} />
          <Stat label="Banheiros" value={form.bathrooms_count} />
          <Stat label="Camas" value={totalBeds} />
          <Stat label="Capacidade" value={form.max_capacity} />
        </div>

        <div className="space-y-1">
          <SummaryItem
            label="Cozinha"
            value={
              form.kitchen_items.length
                ? `${form.kitchen_items.length} itens marcados`
                : "Nenhum item marcado"
            }
          />
          <SummaryItem
            label="Comodidades especiais"
            value={
              form.special_amenities.length
                ? `${form.special_amenities.length} comodidades`
                : "Nenhuma marcada"
            }
          />
          <SummaryItem
            label="Condomínio"
            value={
              form.condo_amenities.length
                ? `${form.condo_amenities.length} comodidades`
                : "Nenhuma marcada"
            }
          />
        </div>
      </EditorialCard>

      <EditorialCard
       
        title="Algo a mais?"
        subtitle="Conte algo que devemos saber antes da conversa (opcional)."
      >
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={4}
          maxLength={1000}
          className="bg-white/50 resize-none"
          style={{ borderColor: "hsl(206 20% 85%)" }}
          placeholder="Expectativas, melhor horário para conversarmos, particularidades do imóvel..."
        />
      </EditorialCard>
    </div>
  );
}

/* ----------------------------- SUCCESS SCREEN --------------------------- */
function SuccessScreen({ ownerName, email }: { ownerName: string; email: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "hsl(40 30% 96%)" }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap"
      />
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full blur-3xl opacity-30"
          style={{ background: "hsl(20 63% 48% / 0.3)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[450px] h-[450px] rounded-full blur-3xl opacity-25"
          style={{ background: "hsl(206 56% 22% / 0.25)" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-xl w-full relative"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div
          className="relative rounded-2xl bg-white/90 backdrop-blur-sm border p-10 md:p-14 text-center shadow-[0_30px_80px_-30px_hsl(206_56%_22%/0.3)]"
          style={{ borderColor: "hsl(206 20% 90%)" }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 180, damping: 14 }}
            className="h-20 w-20 mx-auto mb-8 rounded-full flex items-center justify-center shadow-xl"
            style={{
              background: "linear-gradient(135deg, hsl(20 63% 48%), hsl(38 50% 55%))",
              boxShadow: "0 20px 40px -10px hsl(20 63% 48% / 0.4)",
            }}
          >
            <Check className="h-10 w-10 text-white" strokeWidth={2.5} />
          </motion.div>

          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="h-px w-8" style={{ background: "hsl(38 50% 55%)" }} />
            <span
              className="text-[11px] tracking-[0.3em] uppercase font-medium"
              style={{ color: "hsl(20 63% 48%)" }}
            >
              Recebido
            </span>
            <div className="h-px w-8" style={{ background: "hsl(38 50% 55%)" }} />
          </div>

          <h2
            className="text-3xl md:text-4xl mb-4 tracking-tight leading-tight"
            style={{
              fontFamily: "'Fraunces', serif",
              fontWeight: 400,
              color: "hsl(206 56% 22%)",
            }}
          >
            Obrigado,{" "}
            <span style={{ fontStyle: "italic", fontWeight: 300 }}>
              {ownerName.split(" ")[0]}.
            </span>
          </h2>
          <p
            className="text-base leading-relaxed mb-2"
            style={{ color: "hsl(206 30% 40%)" }}
          >
            Sua ficha foi recebida com cuidado. Enviamos uma confirmação para{" "}
            <strong style={{ color: "hsl(206 56% 22%)" }}>{email}</strong> com o link para você
            definir sua senha de acesso ao portal.
          </p>

          <div
            className="mt-8 rounded-xl p-6 text-left"
            style={{ background: "hsl(40 30% 97%)", border: "1px solid hsl(206 20% 90%)" }}
          >
            <p
              className="text-xs tracking-[0.25em] uppercase font-medium mb-4"
              style={{ color: "hsl(20 63% 48%)" }}
            >
              Próximos passos
            </p>
            <ol className="space-y-4">
              {[
                "Nossa equipe analisa sua ficha com atenção",
                "Entramos em contato para agendar uma conversa exclusiva",
                "Após aprovação, liberamos seu portal completo de gestão",
              ].map((txt, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <span
                    className="shrink-0 text-2xl leading-none"
                    style={{
                      fontFamily: "'Fraunces', serif",
                      fontStyle: "italic",
                      color: "hsl(20 63% 48%)",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="text-sm leading-relaxed pt-1"
                    style={{ color: "hsl(206 30% 35%)" }}
                  >
                    {txt}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------ COMPONENTS ------------------------------ */
function Field({
  label,
  required,
  children,
  icon: Icon,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="space-y-2">
      <Label
        className="text-[10px] tracking-[0.25em] uppercase font-medium flex items-center gap-1.5"
        style={{ color: "hsl(206 30% 45%)" }}
      >
        {Icon && <Icon className="h-3 w-3" />}
        {label}
        {required && (
          <span style={{ color: "hsl(20 63% 48%)" }} className="ml-0.5">
            ·
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}

function NumberField({
  label,
  required,
  value,
  onChange,
  min,
  max,
  hint,
  icon: Icon,
}: {
  label: string;
  required?: boolean;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const inc = () => onChange(Math.min(max, value + 1));
  const dec = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(Math.max(min, value - 1));
  };
  const isMax = value >= max;
  const isMin = value <= min;
  const isActive = value > 0;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={inc}
        disabled={isMax}
        className="group relative w-full text-left rounded-xl border bg-white px-4 py-3 transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          borderColor: isActive ? "hsl(20 63% 48% / 0.4)" : "hsl(206 20% 88%)",
          background: isActive ? "hsl(20 63% 48% / 0.04)" : "white",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {Icon && (
              <Icon className="h-3.5 w-3.5 shrink-0 text-[hsl(206_56%_22%/0.55)]" />
            )}
            <span
              className="text-[11px] font-medium truncate"
              style={{ color: "hsl(206 30% 40%)" }}
            >
              {label}
              {required && (
                <span style={{ color: "hsl(20 63% 48%)" }}> *</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isMin && (
              <span
                role="button"
                tabIndex={0}
                onClick={dec}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(Math.max(min, value - 1));
                  }
                }}
                className="h-6 w-6 inline-flex items-center justify-center rounded-md border bg-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted cursor-pointer"
                style={{ borderColor: "hsl(206 20% 85%)" }}
                aria-label="Diminuir"
              >
                <Minus className="h-3 w-3" style={{ color: "hsl(206 56% 22%)" }} />
              </span>
            )}
            <span
              className="inline-flex items-center justify-center h-7 min-w-[28px] px-1.5 rounded-md text-sm font-bold tabular-nums"
              style={{
                background: isActive ? "hsl(20 63% 48%)" : "hsl(206 20% 92%)",
                color: isActive ? "white" : "hsl(206 30% 50%)",
              }}
            >
              {value}
            </span>
            <Plus
              className="h-3.5 w-3.5 transition-transform group-hover:scale-110 group-active:scale-95"
              style={{ color: isActive ? "hsl(20 63% 48%)" : "hsl(206 30% 55%)" }}
            />
          </div>
        </div>
      </button>
      {hint && (
        <p className="text-[10px] pl-1" style={{ color: "hsl(206 30% 55%)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-lg border bg-white/60 transition-all hover:bg-white"
      style={{ borderColor: "hsl(206 20% 88%)" }}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-[hsl(206_56%_22%/0.6)]" />
        <span className="text-sm font-medium" style={{ color: "hsl(206 56% 22%)" }}>
          {label}
        </span>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function FeatureChip({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all"
      style={{
        background: active ? "hsl(20 63% 48% / 0.08)" : "white",
        borderColor: active ? "hsl(20 63% 48%)" : "hsl(206 20% 88%)",
        color: active ? "hsl(20 63% 48%)" : "hsl(206 30% 45%)",
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{label}</span>
      {active && <Check className="h-3 w-3 ml-auto shrink-0" />}
    </button>
  );
}

function PickChip({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      type="button"
      whileTap={{ scale: 0.97 }}
      className="flex items-center gap-2.5 px-4 py-3.5 rounded-xl border text-sm font-medium transition-all text-left"
      style={{
        background: active ? "hsl(20 63% 48% / 0.08)" : "white",
        borderColor: active ? "hsl(20 63% 48%)" : "hsl(206 20% 88%)",
        color: active ? "hsl(206 56% 22%)" : "hsl(206 30% 40%)",
        boxShadow: active ? "0 4px 16px -6px hsl(20 63% 48% / 0.3)" : "none",
      }}
    >
      <span className="text-lg shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <Checkbox checked={active} className="pointer-events-none shrink-0" />
    </motion.button>
  );
}

function SummaryItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={`py-3 border-b last:border-0 ${className}`}
      style={{ borderColor: "hsl(206 20% 90%)" }}
    >
      <p
        className="text-[10px] tracking-[0.25em] uppercase"
        style={{ color: "hsl(206 30% 55%)" }}
      >
        {label}
      </p>
      <p
        className="text-base mt-1 break-words"
        style={{
          fontFamily: "'Fraunces', serif",
          fontWeight: 400,
          color: "hsl(206 56% 22%)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-xl p-4 text-center border"
      style={{
        background: "hsl(40 30% 97%)",
        borderColor: "hsl(206 20% 90%)",
      }}
    >
      <p
        className="text-3xl"
        style={{
          fontFamily: "'Fraunces', serif",
          fontWeight: 500,
          color: "hsl(20 63% 48%)",
        }}
      >
        {value}
      </p>
      <p
        className="text-[9px] tracking-[0.25em] uppercase mt-1.5"
        style={{ color: "hsl(206 30% 50%)" }}
      >
        {label}
      </p>
    </div>
  );
}
