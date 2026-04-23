import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  AirVent, Tv, Zap, Droplets, Flame, DoorOpen, Sofa, Bath,
  UtensilsCrossed, BatteryCharging, Blinds, ClipboardCheck, GlassWater, BedDouble
} from 'lucide-react';

interface ChecklistData {
  ac_working: string | null;
  ac_notes: string | null;
  ac_filters_cleaned: boolean | null;
  tv_internet_working: string | null;
  tv_internet_notes: string | null;
  outlets_switches_working: string | null;
  outlets_switches_notes: string | null;
  kitchen_working: string | null;
  kitchen_notes: string | null;
  bathroom_working: string | null;
  bathroom_notes: string | null;
  doors_locks_working: string | null;
  doors_locks_notes: string | null;
  furniture_working: string | null;
  furniture_notes: string | null;
  curtains_rods_working: string | null;
  curtains_rods_notes: string | null;
  stove_oven_working: string | null;
  stove_oven_notes: string | null;
  cutlery_ok: string | null;
  cutlery_notes: string | null;
  batteries_replaced: boolean | null;
  glasses_count: number | null;
  pillows_count: number | null;
}

interface RoutineChecklistDisplayProps {
  checklist: ChecklistData;
}

function StatusBadge({ value }: { value: string | null }) {
  if (!value) return <Badge variant="outline">N/A</Badge>;
  switch (value) {
    case 'ok':
      return <Badge className="bg-success/20 text-success border-success/30/30">OK</Badge>;
    case 'problem':
      return <Badge variant="destructive">Problema</Badge>;
    case 'na':
      return <Badge variant="outline">N/A</Badge>;
    default:
      return <Badge variant="outline">{value}</Badge>;
  }
}

function CheckRow({ icon, label, value, notes }: { icon: React.ReactNode; label: string; value: string | null; notes: string | null }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-b-0">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          <StatusBadge value={value} />
        </div>
        {notes && (
          <p className="text-sm text-muted-foreground mt-1">{notes}</p>
        )}
      </div>
    </div>
  );
}

export function RoutineChecklistDisplay({ checklist }: RoutineChecklistDisplayProps) {
  const checks = [
    { icon: <AirVent className="h-4 w-4" />, label: 'Ar-condicionado', value: checklist.ac_working, notes: checklist.ac_notes },
    { icon: <Tv className="h-4 w-4" />, label: 'TV e Internet', value: checklist.tv_internet_working, notes: checklist.tv_internet_notes },
    { icon: <Zap className="h-4 w-4" />, label: 'Tomadas e Interruptores', value: checklist.outlets_switches_working, notes: checklist.outlets_switches_notes },
    { icon: <Droplets className="h-4 w-4" />, label: 'Cozinha (Hidráulica)', value: checklist.kitchen_working, notes: checklist.kitchen_notes },
    { icon: <Bath className="h-4 w-4" />, label: 'Banheiros', value: checklist.bathroom_working, notes: checklist.bathroom_notes },
    { icon: <DoorOpen className="h-4 w-4" />, label: 'Portas e Fechaduras', value: checklist.doors_locks_working, notes: checklist.doors_locks_notes },
    { icon: <Sofa className="h-4 w-4" />, label: 'Móveis', value: checklist.furniture_working, notes: checklist.furniture_notes },
    { icon: <Blinds className="h-4 w-4" />, label: 'Cortinas e Varões', value: checklist.curtains_rods_working, notes: checklist.curtains_rods_notes },
    { icon: <Flame className="h-4 w-4" />, label: 'Bocas do Fogão e Forno', value: checklist.stove_oven_working, notes: checklist.stove_oven_notes },
    { icon: <UtensilsCrossed className="h-4 w-4" />, label: 'Talheres em quantidade correta', value: checklist.cutlery_ok, notes: checklist.cutlery_notes },
  ];

  const problemCount = checks.filter(c => c.value === 'problem').length;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Checklist de Rotina</h3>
        </div>
        {problemCount > 0 ? (
          <Badge variant="destructive">{problemCount} problema{problemCount > 1 ? 's' : ''}</Badge>
        ) : (
          <Badge className="bg-success/20 text-success border-success/30/30">Tudo OK</Badge>
        )}
      </div>

      {/* Functional Checks */}
      <div className="space-y-0">
        {checks.map((check, i) => (
          <CheckRow key={i} {...check} />
        ))}
      </div>

      {/* Additional Info */}
      <div className="mt-4 pt-4 border-t grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="flex items-center gap-2">
          <BatteryCharging className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Pilhas trocadas</p>
            <p className="text-sm font-medium">{checklist.batteries_replaced ? 'Sim' : 'Não'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AirVent className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Filtros AC limpos</p>
            <p className="text-sm font-medium">{checklist.ac_filters_cleaned ? 'Sim' : 'Não'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlassWater className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Copos</p>
            <p className="text-sm font-medium">{checklist.glasses_count ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BedDouble className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Travesseiros</p>
            <p className="text-sm font-medium">{checklist.pillows_count ?? '—'}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
