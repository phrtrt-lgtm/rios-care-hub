import { ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Building2, ClipboardCheck, Plus } from 'lucide-react';
import TeamInspectionDialog from '@/components/TeamInspectionDialog';
import { supabase } from '@/integrations/supabase/client';

interface PropertyOption {
  id: string;
  name: string;
}

interface StartInspectionButtonProps {
  properties?: PropertyOption[];
  onCreated?: () => void;
  className?: string;
  variant?: 'header' | 'panel';
  label?: string;
  icon?: ReactNode;
}

export default function StartInspectionButton({ properties, onCreated, className }: StartInspectionButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<PropertyOption | null>(null);

  return (
    <>
      <Button
        size="sm"
        className={className}
        onClick={() => setPickerOpen(true)}
      >
        <Plus className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Nova Vistoria</span>
        <span className="sm:hidden">Nova</span>
      </Button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>Iniciar nova vistoria</DialogTitle>
            <DialogDescription>Escolha o imóvel para começar.</DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Buscar imóvel..." />
            <CommandList className="max-h-80">
              <CommandEmpty>Nenhum imóvel encontrado.</CommandEmpty>
              <CommandGroup>
                {properties.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.name}
                    onSelect={() => {
                      setSelected(p);
                      setPickerOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{p.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {selected && (
        <TeamInspectionDialog
          open={!!selected}
          onOpenChange={(open) => { if (!open) setSelected(null); }}
          propertyId={selected.id}
          propertyName={selected.name}
          onSuccess={() => {
            onCreated?.();
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
