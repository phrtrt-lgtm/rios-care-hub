import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import riosLogo from "@/assets/rios-logo.png";
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
import { Card } from "@/components/ui/card";
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
  { id: 1, title: "Sobre você", icon: User, description: "Identificação do proprietário" },
  { id: 2, title: "Ficha técnica", icon: Building2, description: "Números essenciais do imóvel" },
  { id: 3, title: "Cômodos", icon: BedDouble, description: "Camas e equipamentos" },
  { id: 4, title: "Cozinha & especiais", icon: ChefHat, description: "O que torna seu imóvel único" },
  { id: 5, title: "Condomínio", icon: Building2, description: "Comodidades do prédio" },
  { id: 6, title: "Revisão", icon: PartyPopper, description: "Confira e envie" },
];

const TOTAL_STEPS = STEPS.length;

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

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function StepNotes({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Card className="p-5 md:p-6 shadow-md border-dashed border-primary/20 bg-primary/[0.02]">
      <Label className="text-sm font-semibold flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        Observações desta etapa (opcional)
      </Label>
      <p className="text-xs text-muted-foreground mt-1 mb-3">
        Adicione qualquer nuance, detalhe ou contexto sobre as informações desta etapa.
      </p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder={placeholder ?? "Ex.: alguma particularidade que devemos saber..."}
      />
    </Card>
  );
}

function buildRooms(form: IntakeFormData, existing: RoomEntry[]): RoomEntry[] {
  // Mantém edições já feitas: tenta preservar pelo nome+type+floor
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

  // Quartos
  for (let i = 0; i < form.bedrooms_count; i++) {
    const isSuite = i < form.suites_count;
    const name = isSuite ? `Suíte ${i + 1}` : `Quarto ${i + 1 - form.suites_count}`;
    // distribui igualmente entre pavimentos (se >1)
    const floor = totalFloors > 1 ? (i % totalFloors) + 1 : 1;
    const cleanName = isSuite ? `Suíte ${i + 1}` : `Quarto ${i + 1 - form.suites_count}`;
    const existingRoom = findExisting("bedroom", cleanName, floor) || findExisting("bedroom", name, floor);
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
  // Salas
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

  // Re-build rooms quando contagens mudam
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
        form.previously_listed_airbnb !== null
      );
    }
    if (step === 2) {
      return (
        form.bedrooms_count > 0 &&
        form.bathrooms_count > 0 &&
        form.max_capacity > 0
      );
    }
    if (step === 3) {
      return form.rooms_data.filter((r) => r.type === "bedroom").every((r) => r.beds.length > 0);
    }
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

  const submit = async () => {
    setSubmitting(true);
    try {
      // Consolida observações por etapa dentro do campo `notes`
      const stepNotesParts = [
        form.notes_step1 && `[Sobre você] ${form.notes_step1}`,
        form.notes_step2 && `[Ficha técnica] ${form.notes_step2}`,
        form.notes_step3 && `[Cômodos] ${form.notes_step3}`,
        form.notes_step4 && `[Cozinha & especiais] ${form.notes_step4}`,
        form.notes_step5 && `[Condomínio] ${form.notes_step5}`,
        form.notes && `[Observações finais] ${form.notes}`,
      ].filter(Boolean);
      const consolidatedNotes = stepNotesParts.join("\n\n");

      const payload = {
        ...form,
        notes: consolidatedNotes,
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
              {step === 1 && <Step1 form={form} update={update} />}
              {step === 2 && <Step2Tech form={form} update={update} />}
              {step === 3 && <Step3Rooms form={form} updateRoom={updateRoom} />}
              {step === 4 && (
                <Step4KitchenSpecial
                  form={form}
                  toggleKitchen={(v) => toggleArr("kitchen_items", v)}
                  toggleSpecial={(v) => toggleArr("special_amenities", v)}
                />
              )}
              {step === 5 && (
                <Step5Condo form={form} toggleCondo={(v) => toggleArr("condo_amenities", v)} />
              )}
              {step === 6 && <Step6Review form={form} update={update} />}
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
                    Enviar minha ficha
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

/* ----------------------------- BRAND HEADER ----------------------------- */
function BrandHeader() {
  return (
    <header className="relative">
      {/* Faixa decorativa superior em azul da logo */}
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
            <p className="text-xs sm:text-base uppercase tracking-[0.22em] text-[hsl(var(--rios-blue))] font-bold leading-tight">Hospedagens</p>
            <p className="text-[11px] sm:text-sm text-muted-foreground mt-1 tracking-wide">Operação & Gestão</p>
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
            Cadastro exclusivo de novos parceiros
          </div>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed">
            Preencha as informações abaixo e já realizamos seu <strong className="text-foreground">pré-cadastro na plataforma RIOS</strong>. Em seguida, nossa equipe entra em contato para uma reunião exclusiva e os próximos passos da parceria.
          </p>
        </motion.div>
      </div>
    </header>
  );
}

/* ----------------------------- PROGRESS BAR ----------------------------- */
function StepProgress({ current }: { current: number }) {
  return (
    <div className="container max-w-5xl mx-auto px-4 pb-8">
      <div className="grid grid-cols-6 gap-2">
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
      <Card className="p-6 md:p-8 shadow-xl border-primary/10">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          Sobre você
        </h3>
        <p className="text-sm text-muted-foreground mb-6">Como podemos te chamar?</p>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Nome completo *" icon={User}>
            <Input
              value={form.owner_name}
              onChange={(e) => update("owner_name", e.target.value)}
              placeholder="Seu nome"
              maxLength={200}
            />
          </Field>
          <Field label="E-mail *" icon={Mail}>
            <Input
              type="email"
              value={form.owner_email}
              onChange={(e) => update("owner_email", e.target.value)}
              placeholder="voce@email.com"
            />
          </Field>
          <Field label="Telefone (WhatsApp)" icon={Phone}>
            <Input
              value={form.owner_phone}
              onChange={(e) => update("owner_phone", e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </Field>
          <Field label="Apelido do imóvel">
            <Input
              value={form.property_nickname}
              onChange={(e) => update("property_nickname", e.target.value)}
              placeholder="Ex.: Cobertura Vista Mar"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Endereço completo *" icon={MapPin}>
            <Input
              value={form.property_address}
              onChange={(e) => update("property_address", e.target.value)}
              placeholder="Rua, número, bairro, cidade"
              maxLength={500}
            />
          </Field>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium mb-3">
            Já alugou pelo Airbnb (ou outra plataforma) antes? *
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: true, label: "Sim, já anunciei", emoji: "✅" },
              { value: false, label: "Não, será a primeira vez", emoji: "🌱" },
            ].map((opt) => {
              const isActive = form.previously_listed_airbnb === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => update("previously_listed_airbnb", opt.value)}
                  className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                    isActive
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border hover:border-primary/40 bg-card"
                  }`}
                >
                  <div className="text-2xl mb-1">{opt.emoji}</div>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  {isActive && (
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------- STEP 2 TECH ------------------------------ */
function Step2Tech({
  form,
  update,
}: {
  form: IntakeFormData;
  update: <K extends keyof IntakeFormData>(k: K, v: IntakeFormData[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <Card className="p-6 md:p-8 shadow-xl border-primary/10">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Ficha técnica
        </h3>
        <p className="text-sm text-muted-foreground mb-6">Os números essenciais do seu imóvel.</p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <NumberField label="Quartos *" value={form.bedrooms_count} onChange={(v) => update("bedrooms_count", v)} min={1} max={20} />
          <NumberField label="Suítes" value={form.suites_count} onChange={(v) => update("suites_count", Math.min(v, form.bedrooms_count))} min={0} max={form.bedrooms_count} />
          <NumberField label="Salas" value={form.living_rooms_count} onChange={(v) => update("living_rooms_count", v)} min={0} max={10} />
          <NumberField label="Banheiros *" value={form.bathrooms_count} onChange={(v) => update("bathrooms_count", v)} min={1} max={20} />
          <NumberField label="Capacidade máxima *" value={form.max_capacity} onChange={(v) => update("max_capacity", v)} min={1} max={30} icon={Users} />
          <NumberField label="Vagas garagem" value={form.parking_spots} onChange={(v) => update("parking_spots", v)} min={0} max={20} icon={Car} />
          <NumberField label="Pavimentos do imóvel" value={form.property_levels} onChange={(v) => update("property_levels", v)} min={1} max={5} hint="Imóveis duplex/triplex contam aqui" />
          <NumberField label="Andares do prédio" value={form.building_floors ?? 0} onChange={(v) => update("building_floors", v || null)} min={0} max={100} hint="0 se não souber" />
          <NumberField label="Andar do apartamento" value={form.apartment_floor ?? 0} onChange={(v) => update("apartment_floor", v || null)} min={0} max={100} hint="0 = térreo / casa" />
        </div>

        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <ToggleRow icon={Building2} label="Possui elevador" value={form.has_elevator} onChange={(v) => update("has_elevator", v)} />
          <ToggleRow icon={Wifi} label="Wi-Fi disponível" value={form.has_wifi} onChange={(v) => update("has_wifi", v)} />
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------- STEP 2 -------------------------------- */
function Step3Rooms({
  form,
  updateRoom,
}: {
  form: IntakeFormData;
  updateRoom: (id: string, patch: Partial<RoomEntry>) => void;
}) {
  const totalFloors = Math.max(1, form.property_levels);
  const floorsArray = Array.from({ length: totalFloors }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <Card className="p-6 md:p-8 shadow-xl border-primary/10">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <BedDouble className="h-5 w-5 text-primary" />
          Cômodos & camas
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Configure cada cômodo gerado a partir da ficha técnica.
          {totalFloors > 1 && " Selecione em qual pavimento cada um se encontra."}
        </p>

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
            <div key={floor} className="mb-6">
              <div className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">
                  {floor}
                </div>
                Pavimento {floor}
              </div>
              <div className="space-y-3">
                {roomsOnFloor.length === 0 && (
                  <p className="text-xs text-muted-foreground italic pl-8">
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
      </Card>
    </div>
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
      className="rounded-xl border-2 border-border bg-card p-4 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isBedroom ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent-foreground"}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-semibold">{room.name}</h4>
            <p className="text-xs text-muted-foreground">{isBedroom ? "Quarto" : "Sala"}</p>
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
              <SelectTrigger className="flex-1">
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
            <div className="flex items-center gap-1 border rounded-md">
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
              <span className="w-6 text-center text-sm font-semibold">{bed.count}</span>
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
        <Button
          variant="outline"
          size="sm"
          className="gap-2 w-full border-dashed"
          onClick={() =>
            updateRoom(room.id, {
              beds: [...room.beds, { type: isBedroom ? "solteiro" : "sofa_cama", count: 1 }],
            })
          }
        >
          <Plus className="h-3 w-3" />
          Adicionar {isBedroom ? "cama" : "sofá / cama"}
        </Button>
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
function Step4KitchenSpecial({
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
      <Card className="p-6 md:p-8 shadow-xl border-primary/10">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-primary" />
          Itens da cozinha
        </h3>
        <p className="text-sm text-muted-foreground mb-6">Marque tudo que está disponível.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
      </Card>

      <Card className="p-6 md:p-8 shadow-xl border-primary/10">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Comodidades especiais
        </h3>
        <p className="text-sm text-muted-foreground mb-6">O que torna seu imóvel único?</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
      </Card>
    </div>
  );
}

/* --------------------------------- STEP 4 -------------------------------- */
function Step5Condo({ form, toggleCondo }: { form: IntakeFormData; toggleCondo: (v: string) => void }) {
  return (
    <Card className="p-6 md:p-8 shadow-xl border-primary/10">
      <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        Comodidades do condomínio
      </h3>
      <p className="text-sm text-muted-foreground mb-6">Estrutura compartilhada disponível aos hóspedes.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
    </Card>
  );
}

/* --------------------------------- STEP 5 -------------------------------- */
function Step6Review({
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
      <Card className="p-6 md:p-8 shadow-xl border-primary/10">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <PartyPopper className="h-5 w-5 text-primary" />
          Tudo certo?
        </h3>
        <p className="text-sm text-muted-foreground mb-6">Revise as informações antes de enviar.</p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <SummaryItem label="Proprietário" value={form.owner_name} />
          <SummaryItem label="E-mail" value={form.owner_email} />
          <SummaryItem label="Telefone" value={form.owner_phone || "—"} />
          <SummaryItem label="Imóvel" value={form.property_nickname || "—"} />
          <SummaryItem label="Endereço" value={form.property_address} className="md:col-span-2" />
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          <Stat label="Quartos" value={form.bedrooms_count} />
          <Stat label="Suítes" value={form.suites_count} />
          <Stat label="Salas" value={form.living_rooms_count} />
          <Stat label="Banheiros" value={form.bathrooms_count} />
          <Stat label="Camas" value={totalBeds} />
          <Stat label="Capacidade" value={form.max_capacity} />
        </div>

        <SummaryItem label="Cozinha" value={form.kitchen_items.length ? `${form.kitchen_items.length} itens marcados` : "Nenhum item marcado"} />
        <SummaryItem label="Comodidades especiais" value={form.special_amenities.length ? `${form.special_amenities.length} comodidades` : "Nenhuma marcada"} />
        <SummaryItem label="Condomínio" value={form.condo_amenities.length ? `${form.condo_amenities.length} comodidades` : "Nenhuma marcada"} />
      </Card>

      <Card className="p-6 md:p-8 shadow-xl border-primary/10">
        <Label htmlFor="notes" className="text-sm font-semibold">
          Algo a mais que devemos saber? (opcional)
        </Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={4}
          maxLength={1000}
          className="mt-2"
          placeholder="Conte sobre seu imóvel, expectativas, melhor horário para conversarmos..."
        />
      </Card>
    </div>
  );
}

/* ----------------------------- SUCCESS SCREEN --------------------------- */
function SuccessScreen({ ownerName, email }: { ownerName: string; email: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg w-full"
      >
        <Card className="p-8 md:p-12 text-center shadow-2xl border-primary/20">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="h-20 w-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[hsl(var(--rios-terra))] to-[hsl(var(--rios-terra-light))] flex items-center justify-center shadow-xl"
          >
            <Check className="h-10 w-10 text-primary-foreground" strokeWidth={3} />
          </motion.div>
          <h2 className="text-3xl font-bold mb-3">Recebemos sua ficha! 🎉</h2>
          <p className="text-muted-foreground mb-2">
            Obrigado, <strong className="text-foreground">{ownerName.split(" ")[0]}</strong>.
          </p>
          <p className="text-muted-foreground mb-4">
            Já realizamos seu <strong className="text-[hsl(var(--rios-terra))]">pré-cadastro na plataforma RIOS</strong> e enviamos um e-mail para <strong className="text-foreground">{email}</strong> com a confirmação e o link para você definir sua senha de acesso ao portal.
          </p>
          <div className="rounded-lg bg-[hsl(var(--rios-terra))]/8 border border-[hsl(var(--rios-terra))]/20 p-4 text-sm text-left mb-4">
            <p className="font-semibold mb-1 text-[hsl(var(--rios-terra))]">✨ Acesso antecipado ao portal</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Sua conta já está criada como <strong>proprietário em pré-cadastro</strong>. Após a reunião e aprovação da parceria, liberamos automaticamente todos os recursos: cobranças, manutenções, vistorias, relatórios financeiros e mais.
            </p>
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-4 text-sm text-left">
            <p className="font-semibold mb-2">Próximos passos:</p>
            <ol className="space-y-2 text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary font-semibold">1.</span>
                Nossa equipe analisa sua ficha
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-semibold">2.</span>
                Entramos em contato para agendar uma reunião
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-semibold">3.</span>
                Após aprovação, liberamos seu portal completo
              </li>
            </ol>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

/* ------------------------------ COMPONENTS ------------------------------ */
function Field({
  label,
  children,
  icon: Icon,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
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
  min,
  max,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const canIncrement = value < max;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </Label>
        <button
          type="button"
          onClick={() => canIncrement && onChange(value + 1)}
          disabled={!canIncrement}
          aria-label={`Adicionar ${label}`}
          className="h-6 w-6 rounded-full bg-primary/10 hover:bg-primary/20 active:scale-95 text-primary flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
      <div className="flex items-center gap-1 border rounded-md bg-background h-10">
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          onClick={() => onChange(Math.max(min, value - 1))}
          type="button"
        >
          <Minus className="h-3 w-3" />
        </Button>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
          }}
          className="flex-1 h-full bg-transparent text-center text-sm font-semibold outline-none"
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          onClick={() => onChange(Math.min(max, value + 1))}
          type="button"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
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
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
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
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition ${
        active
          ? "bg-primary/10 border-primary text-primary"
          : "bg-card border-border text-muted-foreground hover:border-primary/50"
      }`}
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
    <button
      onClick={onClick}
      type="button"
      className={`flex items-center gap-2 px-3 py-3 rounded-lg border-2 text-sm font-medium transition text-left ${
        active
          ? "bg-primary/10 border-primary text-foreground shadow-sm"
          : "bg-card border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <Checkbox checked={active} className="pointer-events-none" />
    </button>
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
    <div className={`py-2 border-b border-border/50 last:border-0 ${className}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5 break-words">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-center">
      <p className="text-2xl font-bold text-primary">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
