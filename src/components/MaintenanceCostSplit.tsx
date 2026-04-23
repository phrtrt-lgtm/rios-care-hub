import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MaintenanceCostSplitProps {
  costResponsible: 'owner' | 'management';
  onChange: (data: {
    costResponsible: 'owner' | 'management';
  }) => void;
}

export function MaintenanceCostSplit({
  costResponsible,
  onChange,
}: MaintenanceCostSplitProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Responsável pelo custo</Label>
        <Select
          value={costResponsible}
          onValueChange={(v: 'owner' | 'management') =>
            onChange({ costResponsible: v })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Proprietário</SelectItem>
            <SelectItem value="management">Gestão</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Para custos compartilhados, use o "Aporte da gestão" na cobrança.
        </p>
      </div>
    </div>
  );
}
