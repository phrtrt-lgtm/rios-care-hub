import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Plus, Phone, Pencil, Search, Wrench, Zap, Droplets, Hammer, Snowflake, Building } from "lucide-react";

const SPECIALTIES = [
  { value: "hidraulica", label: "Hidráulica", icon: Droplets },
  { value: "eletrica", label: "Elétrica", icon: Zap },
  { value: "marcenaria", label: "Marcenaria", icon: Hammer },
  { value: "refrigeracao", label: "Refrigeração", icon: Snowflake },
  { value: "estrutural", label: "Estrutural", icon: Building },
  { value: "geral", label: "Geral", icon: Wrench },
];

interface ServiceProvider {
  id: string;
  name: string;
  phone: string | null;
  specialty: string[] | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface ProviderFormData {
  name: string;
  phone: string;
  specialty: string[];
  notes: string;
  is_active: boolean;
}

const AdminProfissionais = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ServiceProvider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>({
    name: "",
    phone: "",
    specialty: [],
    notes: "",
    is_active: true,
  });

  const { data: providers, isLoading } = useQuery({
    queryKey: ["service-providers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_providers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ServiceProvider[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ProviderFormData & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from("service_providers")
          .update({
            name: data.name,
            phone: data.phone || null,
            specialty: data.specialty.length > 0 ? data.specialty : null,
            notes: data.notes || null,
            is_active: data.is_active,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_providers").insert({
          name: data.name,
          phone: data.phone || null,
          specialty: data.specialty.length > 0 ? data.specialty : null,
          notes: data.notes || null,
          is_active: data.is_active,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-providers"] });
      toast.success(editingProvider ? "Profissional atualizado!" : "Profissional cadastrado!");
      closeDialog();
    },
    onError: () => {
      toast.error("Erro ao salvar profissional");
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingProvider(null);
    setFormData({ name: "", phone: "", specialty: [], notes: "", is_active: true });
  };

  const openEdit = (provider: ServiceProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      phone: provider.phone || "",
      specialty: provider.specialty || [],
      notes: provider.notes || "",
      is_active: provider.is_active,
    });
    setDialogOpen(true);
  };

  const toggleSpecialty = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      specialty: prev.specialty.includes(value)
        ? prev.specialty.filter((s) => s !== value)
        : [...prev.specialty, value],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    saveMutation.mutate({ ...formData, id: editingProvider?.id });
  };

  const filteredProviders = providers?.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.phone?.includes(search) ||
      p.specialty?.some((s) => s.toLowerCase().includes(search.toLowerCase()))
  );

  const getSpecialtyInfo = (value: string) => {
    return SPECIALTIES.find((s) => s.value === value) || { label: value, icon: Wrench };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Profissionais</h1>
            <p className="text-muted-foreground text-sm">
              Cadastro de prestadores de serviço para manutenções
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => closeDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingProvider ? "Editar Profissional" : "Novo Profissional"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Nome do profissional"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Especialidades</Label>
                  <div className="flex flex-wrap gap-2">
                    {SPECIALTIES.map((spec) => {
                      const Icon = spec.icon;
                      const isSelected = formData.specialty.includes(spec.value);
                      return (
                        <Badge
                          key={spec.value}
                          variant={isSelected ? "default" : "outline"}
                          className="cursor-pointer transition-colors"
                          onClick={() => toggleSpecialty(spec.value)}
                        >
                          <Icon className="h-3 w-3 mr-1" />
                          {spec.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Informações adicionais..."
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Ativo</Label>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, is_active: checked }))
                    }
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou especialidade..."
            className="pl-10"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-6 bg-muted rounded w-1/2 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProviders?.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {search ? "Nenhum profissional encontrado" : "Nenhum profissional cadastrado"}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredProviders?.map((provider) => (
              <Card
                key={provider.id}
                className={`transition-opacity ${!provider.is_active ? "opacity-60" : ""}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {provider.name}
                        {!provider.is_active && (
                          <Badge variant="secondary" className="text-xs">
                            Inativo
                          </Badge>
                        )}
                      </CardTitle>
                      {provider.phone && (
                        <a
                          href={`tel:${provider.phone}`}
                          className="text-sm text-muted-foreground flex items-center gap-1 hover:text-primary"
                        >
                          <Phone className="h-3 w-3" />
                          {provider.phone}
                        </a>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(provider)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {provider.specialty && provider.specialty.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {provider.specialty.map((s) => {
                        const info = getSpecialtyInfo(s);
                        const Icon = info.icon;
                        return (
                          <Badge key={s} variant="outline" className="text-xs">
                            <Icon className="h-3 w-3 mr-1" />
                            {info.label}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  {provider.notes && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{provider.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminProfissionais;
