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

export default function StartInspectionButton({
  properties: propertiesProp,
  onCreated,
  className,
  variant = 'header',
  label,
  icon,
}: StartInspectionButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<PropertyOption | null>(null);
  const [fetched, setFetched] = useState<PropertyOption[] | null>(null);

  useEffect(() => {
    if (propertiesProp || !pickerOpen || fetched) return;
    supabase
      .from('properties')
      .select('id, name')
      .is('archived_at', null)
      .order('name', { ascending: true })
      .then(({ data }) => setFetched(data || []));
  }, [pickerOpen, propertiesProp, fetched]);

  const properties = propertiesProp ?? fetched ?? [];

  const trigger =
    variant === 'panel' ? (
      <Button
        size="lg"
        className={
          className ??
          'h-16 text-sm font-semibold justify-start px-4 bg-secondary hover:bg-secondary/90 text-secondary-foreground'
        }
        onClick={() => setPickerOpen(true)}
      >
        {icon ?? <ClipboardCheck className="mr-3 h-5 w-5" />}
        {label ?? 'Nova Vistoria'}
      </Button>
    ) : (
      <Button size="sm" className={className} onClick={() => setPickerOpen(true)}>
        <Plus className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">{label ?? 'Nova Vistoria'}</span>
        <span className="sm:hidden">Nova</span>
      </Button>
    );

  return (
    <>
      {trigger}

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
