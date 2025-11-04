import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MaintenanceCostSplitProps {
  costResponsible: 'owner' | 'management' | 'split';
  splitOwnerPercent?: number | null;
  onChange: (data: {
    costResponsible: 'owner' | 'management' | 'split';
    splitOwnerPercent?: number | null;
  }) => void;
}

export function MaintenanceCostSplit({
  costResponsible,
  splitOwnerPercent,
  onChange,
}: MaintenanceCostSplitProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Responsável pelo custo</Label>
        <Select
          value={costResponsible}
          onValueChange={(v: 'owner' | 'management' | 'split') =>
            onChange({ costResponsible: v, splitOwnerPercent })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Proprietário</SelectItem>
            <SelectItem value="management">Gestão</SelectItem>
            <SelectItem value="split">Dividido (%)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {costResponsible === 'split' && (
        <div className="space-y-2">
          <Label>Percentual do proprietário (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={splitOwnerPercent ?? 50}
            onChange={(e) =>
              onChange({
                costResponsible,
                splitOwnerPercent: Number(e.target.value),
              })
            }
          />
          <p className="text-sm text-muted-foreground">
            Gestão pagará: {100 - (splitOwnerPercent ?? 50)}%
          </p>
        </div>
      )}
    </div>
  );
}
