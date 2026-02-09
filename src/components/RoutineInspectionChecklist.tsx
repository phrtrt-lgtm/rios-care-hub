import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Wind, 
  Tv, 
  Plug, 
  DoorOpen, 
  Blinds, 
  ShowerHead, 
  Armchair, 
  UtensilsCrossed,
  Battery,
  Sparkles,
  GlassWater,
  BedDouble,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  Flame,
  Mic,
  Info
} from 'lucide-react';

export interface ChecklistData {
  // Serviços realizados
  ac_filters_cleaned: boolean;
  batteries_replaced: boolean;
  
  // Verificações
  ac_working: 'ok' | 'problema' | 'na' | '';
  ac_notes: string;
  
  tv_internet_working: 'ok' | 'problema' | 'na' | '';
  tv_internet_notes: string;
  
  outlets_switches_working: 'ok' | 'problema' | 'na' | '';
  outlets_switches_notes: string;
  
  doors_locks_working: 'ok' | 'problema' | 'na' | '';
  doors_locks_notes: string;
  
  curtains_rods_working: 'ok' | 'problema' | 'na' | '';
  curtains_rods_notes: string;
  
  bathroom_working: 'ok' | 'problema' | 'na' | '';
  bathroom_notes: string;
  
  furniture_working: 'ok' | 'problema' | 'na' | '';
  furniture_notes: string;
  
  kitchen_working: 'ok' | 'problema' | 'na' | '';
  kitchen_notes: string;
  
  stove_oven_working: 'ok' | 'problema' | 'na' | '';
  stove_oven_notes: string;
  
  cutlery_ok: 'ok' | 'problema' | 'na' | '';
  cutlery_notes: string;
  
  // Contagens
  glasses_count: number | null;
  pillows_count: number | null;
}

export const defaultChecklistData: ChecklistData = {
  ac_filters_cleaned: false,
  batteries_replaced: false,
  ac_working: '',
  ac_notes: '',
  tv_internet_working: '',
  tv_internet_notes: '',
  outlets_switches_working: '',
  outlets_switches_notes: '',
  doors_locks_working: '',
  doors_locks_notes: '',
  curtains_rods_working: '',
  curtains_rods_notes: '',
  bathroom_working: '',
  bathroom_notes: '',
  furniture_working: '',
  furniture_notes: '',
  kitchen_working: '',
  kitchen_notes: '',
  stove_oven_working: '',
  stove_oven_notes: '',
  cutlery_ok: '',
  cutlery_notes: '',
  glasses_count: null,
  pillows_count: null,
};

interface Props {
  data: ChecklistData;
  onChange: (data: ChecklistData) => void;
}

interface CheckItemProps {
  icon: React.ReactNode;
  label: string;
  value: 'ok' | 'problema' | 'na' | '';
  notes: string;
  onValueChange: (value: 'ok' | 'problema' | 'na') => void;
  onNotesChange: (notes: string) => void;
  fieldId: string;
}

function CheckItem({ icon, label, value, notes, onValueChange, onNotesChange, fieldId }: CheckItemProps) {
  return (
    <div className="p-3 border rounded-lg space-y-3 bg-card">
      <div className="flex items-center gap-2">
        <div className="text-primary">{icon}</div>
        <span className="font-medium text-sm">{label}</span>
      </div>
      
      <RadioGroup 
        value={value} 
        onValueChange={(v) => onValueChange(v as 'ok' | 'problema' | 'na')}
        className="flex gap-2"
      >
        <label 
          htmlFor={`${fieldId}-ok`}
          className={`flex-1 cursor-pointer border rounded-lg p-2 flex flex-col items-center gap-1 transition-all text-center ${
            value === 'ok' 
              ? 'border-green-500 bg-green-50 dark:bg-green-950' 
              : 'hover:border-green-300'
          }`}
        >
          <RadioGroupItem value="ok" id={`${fieldId}-ok`} className="sr-only" />
          <CheckCircle2 className={`h-5 w-5 ${value === 'ok' ? 'text-green-600' : 'text-muted-foreground'}`} />
          <span className={`text-xs font-medium ${value === 'ok' ? 'text-green-600' : 'text-muted-foreground'}`}>OK</span>
        </label>
        
        <label 
          htmlFor={`${fieldId}-problema`}
          className={`flex-1 cursor-pointer border rounded-lg p-2 flex flex-col items-center gap-1 transition-all text-center ${
            value === 'problema' 
              ? 'border-red-500 bg-red-50 dark:bg-red-950' 
              : 'hover:border-red-300'
          }`}
        >
          <RadioGroupItem value="problema" id={`${fieldId}-problema`} className="sr-only" />
          <AlertCircle className={`h-5 w-5 ${value === 'problema' ? 'text-red-600' : 'text-muted-foreground'}`} />
          <span className={`text-xs font-medium ${value === 'problema' ? 'text-red-600' : 'text-muted-foreground'}`}>Problema</span>
        </label>
        
        <label 
          htmlFor={`${fieldId}-na`}
          className={`flex-1 cursor-pointer border rounded-lg p-2 flex flex-col items-center gap-1 transition-all text-center ${
            value === 'na' 
              ? 'border-gray-500 bg-gray-50 dark:bg-gray-900' 
              : 'hover:border-gray-300'
          }`}
        >
          <RadioGroupItem value="na" id={`${fieldId}-na`} className="sr-only" />
          <MinusCircle className={`h-5 w-5 ${value === 'na' ? 'text-gray-600' : 'text-muted-foreground'}`} />
          <span className={`text-xs font-medium ${value === 'na' ? 'text-gray-600' : 'text-muted-foreground'}`}>N/A</span>
        </label>
      </RadioGroup>
      
      {(value === 'problema' || value === 'ok' || value === 'na') && (
        <Textarea
          placeholder={
            value === 'problema' 
              ? "Descreva o problema encontrado..." 
              : "Observações (opcional)..."
          }
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="text-sm min-h-[60px]"
        />
      )}
    </div>
  );
}

export default function RoutineInspectionChecklist({ data, onChange }: Props) {
  const updateField = <K extends keyof ChecklistData>(field: K, value: ChecklistData[K]) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* Serviços Realizados */}
      <div className="space-y-3">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Serviços Realizados
        </h3>
        <div className="grid gap-3">
          <label 
            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
              data.ac_filters_cleaned 
                ? 'border-green-500 bg-green-50 dark:bg-green-950' 
                : 'hover:border-primary/50'
            }`}
          >
            <Checkbox 
              checked={data.ac_filters_cleaned}
              onCheckedChange={(checked) => updateField('ac_filters_cleaned', !!checked)}
            />
            <Wind className="h-5 w-5 text-blue-500" />
            <span className="font-medium">Limpeza dos Filtros de Ar-condicionado</span>
          </label>
          
          <label 
            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
              data.batteries_replaced 
                ? 'border-green-500 bg-green-50 dark:bg-green-950' 
                : 'hover:border-primary/50'
            }`}
          >
            <Checkbox 
              checked={data.batteries_replaced}
              onCheckedChange={(checked) => updateField('batteries_replaced', !!checked)}
            />
            <Battery className="h-5 w-5 text-yellow-500" />
            <span className="font-medium">Substituição de Pilhas (controles e fechaduras)</span>
          </label>
        </div>
      </div>

      {/* Verificações de Funcionamento */}
      <div className="space-y-3">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Verificações de Funcionamento
        </h3>
        
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckItem
            icon={<Wind className="h-5 w-5" />}
            label="Ar-condicionado"
            value={data.ac_working}
            notes={data.ac_notes}
            onValueChange={(v) => updateField('ac_working', v)}
            onNotesChange={(v) => updateField('ac_notes', v)}
            fieldId="ac"
          />
          
          <CheckItem
            icon={<Tv className="h-5 w-5" />}
            label="TV / Internet"
            value={data.tv_internet_working}
            notes={data.tv_internet_notes}
            onValueChange={(v) => updateField('tv_internet_working', v)}
            onNotesChange={(v) => updateField('tv_internet_notes', v)}
            fieldId="tv"
          />
          
          <CheckItem
            icon={<Plug className="h-5 w-5" />}
            label="Tomadas, Interruptores e Lâmpadas"
            value={data.outlets_switches_working}
            notes={data.outlets_switches_notes}
            onValueChange={(v) => updateField('outlets_switches_working', v)}
            onNotesChange={(v) => updateField('outlets_switches_notes', v)}
            fieldId="outlets"
          />
          
          <CheckItem
            icon={<DoorOpen className="h-5 w-5" />}
            label="Portas, Fechaduras, Dobradiças"
            value={data.doors_locks_working}
            notes={data.doors_locks_notes}
            onValueChange={(v) => updateField('doors_locks_working', v)}
            onNotesChange={(v) => updateField('doors_locks_notes', v)}
            fieldId="doors"
          />
          
          <CheckItem
            icon={<Blinds className="h-5 w-5" />}
            label="Cortinas e Varões"
            value={data.curtains_rods_working}
            notes={data.curtains_rods_notes}
            onValueChange={(v) => updateField('curtains_rods_working', v)}
            onNotesChange={(v) => updateField('curtains_rods_notes', v)}
            fieldId="curtains"
          />
          
          <CheckItem
            icon={<ShowerHead className="h-5 w-5" />}
            label="Banheiro (chuveiro, assento, sifão)"
            value={data.bathroom_working}
            notes={data.bathroom_notes}
            onValueChange={(v) => updateField('bathroom_working', v)}
            onNotesChange={(v) => updateField('bathroom_notes', v)}
            fieldId="bathroom"
          />
          
          <CheckItem
            icon={<Armchair className="h-5 w-5" />}
            label="Móveis (estabilidade, parafusos)"
            value={data.furniture_working}
            notes={data.furniture_notes}
            onValueChange={(v) => updateField('furniture_working', v)}
            onNotesChange={(v) => updateField('furniture_notes', v)}
            fieldId="furniture"
          />
          
          <CheckItem
            icon={<UtensilsCrossed className="h-5 w-5" />}
            label="Cozinha / Utensílios"
            value={data.kitchen_working}
            notes={data.kitchen_notes}
            onValueChange={(v) => updateField('kitchen_working', v)}
            onNotesChange={(v) => updateField('kitchen_notes', v)}
            fieldId="kitchen"
          />
          
          <CheckItem
            icon={<Flame className="h-5 w-5" />}
            label="Bocas do Fogão e Forno"
            value={data.stove_oven_working}
            notes={data.stove_oven_notes}
            onValueChange={(v) => updateField('stove_oven_working', v)}
            onNotesChange={(v) => updateField('stove_oven_notes', v)}
            fieldId="stove"
          />
          
          <CheckItem
            icon={<UtensilsCrossed className="h-5 w-5" />}
            label="Talheres em quantidade correta"
            value={data.cutlery_ok}
            notes={data.cutlery_notes}
            onValueChange={(v) => updateField('cutlery_ok', v)}
            onNotesChange={(v) => updateField('cutlery_notes', v)}
            fieldId="cutlery"
          />
        </div>
        
        {/* Orientação sobre Áudios */}
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <Mic className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <Info className="h-4 w-4" />
                Importante: Gravação de Áudios
              </h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                <li>Para cada item marcado como <strong>"Problema"</strong>, grave um áudio explicando o que foi encontrado</li>
                <li>Grave também áudios de <strong>outros problemas</strong> encontrados no imóvel que não estão na lista</li>
                <li>Você pode gravar <strong>vários áudios curtos</strong>, um para cada problema — isso facilita organizar a lista de manutenções</li>
                <li>Quanto mais detalhado, melhor será a identificação dos serviços necessários</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Contagens */}
      <div className="space-y-3">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <GlassWater className="h-5 w-5 text-primary" />
          Contagens
        </h3>
        
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-3 border rounded-lg bg-card">
            <Label htmlFor="glasses-count" className="flex items-center gap-2 mb-2">
              <GlassWater className="h-4 w-4 text-primary" />
              Quantidade de Copos
            </Label>
            <Input
              id="glasses-count"
              type="number"
              min="0"
              placeholder="Ex: 8"
              value={data.glasses_count ?? ''}
              onChange={(e) => updateField('glasses_count', e.target.value ? parseInt(e.target.value) : null)}
            />
          </div>
          
          <div className="p-3 border rounded-lg bg-card">
            <Label htmlFor="pillows-count" className="flex items-center gap-2 mb-2">
              <BedDouble className="h-4 w-4 text-primary" />
              Quantidade de Travesseiros
            </Label>
            <Input
              id="pillows-count"
              type="number"
              min="0"
              placeholder="Ex: 4"
              value={data.pillows_count ?? ''}
              onChange={(e) => updateField('pillows_count', e.target.value ? parseInt(e.target.value) : null)}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
