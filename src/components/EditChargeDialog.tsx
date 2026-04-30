import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { CHARGE_CATEGORY_OPTIONS } from "@/constants/chargeCategories";
import { parseBRNumber } from "@/lib/parseBRNumber";

interface EditChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charge: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    service_type?: string | null;
    amount_cents: number;
    management_contribution_cents: number;
    due_date: string | null;
    maintenance_date?: string | null;
    property_id: string | null;
    owner_id: string;
  } | null;
  onSuccess?: () => void;
}

interface Property {
  id: string;
  name: string;
}

export function EditChargeDialog({ open, onOpenChange, charge, onSuccess }: EditChargeDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    service_type: "",
    amount: "",
    management_contribution: "",
    due_date: "",
    maintenance_date: "",
    property_id: "",
  });

  useEffect(() => {
    if (charge && open) {
      setFormData({
        title: charge.title || "",
        description: charge.description || "",
        category: charge.category || "",
        service_type: charge.service_type || "",
        amount: (charge.amount_cents / 100).toFixed(2),
        management_contribution: charge.management_contribution_cents ? (charge.management_contribution_cents / 100).toFixed(2) : "",
        due_date: charge.due_date || "",
        maintenance_date: charge.maintenance_date || "",
        property_id: charge.property_id || "",
      });
      fetchProperties(charge.owner_id);
    }
  }, [charge, open]);

  const fetchProperties = async (ownerId: string) => {
    const { data, error } = await supabase
      .from('properties')
      .select('id, name')
      .eq('owner_id', ownerId)
      .order('name');

    if (!error && data) {
      setProperties(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!charge) return;

    if (!formData.title.trim()) {
      toast({
        title: "Título obrigatório",
        description: "Informe o título da cobrança",
        variant: "destructive",
      });
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor válido para a cobrança",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const updateData = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        category: formData.category || null,
        service_type: formData.service_type.trim() || null,
        amount_cents: Math.round(parseFloat(formData.amount) * 100),
        management_contribution_cents: formData.management_contribution 
          ? Math.round(parseFloat(formData.management_contribution) * 100) 
          : 0,
        due_date: formData.due_date || null,
        maintenance_date: formData.maintenance_date || null,
        property_id: formData.property_id || null,
      };

      const { error } = await supabase
        .from('charges')
        .update(updateData)
        .eq('id', charge.id);

      if (error) throw error;

      toast({
        title: "Cobrança atualizada!",
        description: "As alterações foram salvas com sucesso.",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cobrança</DialogTitle>
          <DialogDescription>
            Altere os dados da cobrança conforme necessário.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Título *</Label>
            <Input
              id="edit-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Ex: Troca de torneira"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Descrição</Label>
            <Textarea
              id="edit-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detalhes da cobrança..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-category">Categoria</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {CHARGE_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-property">Unidade</Label>
              <Select 
                value={formData.property_id || "none"} 
                onValueChange={(value) => setFormData({ ...formData, property_id: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {properties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-service_type">Tipo de Serviço</Label>
            <Input
              id="edit-service_type"
              value={formData.service_type}
              onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
              placeholder="Ex: Elétrica, Hidráulica..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Valor Total (R$) *</Label>
              <Input
                id="edit-amount"
                type="text"
                inputMode="decimal"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value.replace(/[^0-9.,]/g, "") })}
                placeholder="0,00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-contribution">Aporte da Gestão (R$)</Label>
              <Input
                id="edit-contribution"
                type="text"
                inputMode="decimal"
                value={formData.management_contribution}
                onChange={(e) => setFormData({ ...formData, management_contribution: e.target.value.replace(/[^0-9.,]/g, "") })}
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Preview do valor devido */}
          {formData.amount && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Valor devido pelo proprietário:</p>
              <p className="text-lg font-bold text-primary">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  (parseFloat(formData.amount) || 0) - (parseFloat(formData.management_contribution) || 0)
                )}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-due_date">Vencimento</Label>
              <Input
                id="edit-due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-maintenance_date">Data do Serviço</Label>
              <Input
                id="edit-maintenance_date"
                type="date"
                value={formData.maintenance_date}
                onChange={(e) => setFormData({ ...formData, maintenance_date: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
