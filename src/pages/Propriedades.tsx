import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Building2, Plus, Pencil, Archive, ArchiveRestore, X, Eye, EyeOff, MessageCircle, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { PropertyPhotoUpload } from "@/components/PropertyPhotoUpload";
import { PropertyAccessDialog } from "@/components/PropertyAccessDialog";


interface Property {
  id: string;
  name: string;
  address: string | null;
  taxa_limpeza_cents?: number | null;
  owner_id: string;
  cover_photo_url: string | null;
  assigned_cleaner_id: string | null;
  assigned_cleaner_phone: string | null;
  owner_phone: string | null;
  archived_at: string | null;
  notificar_reservas_whatsapp?: boolean;
  owner: {
    name: string;
    email: string;
  };
  cleaner?: {
    name: string;
    phone: string | null;
  };
}

interface Owner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface Cleaner {
  id: string;
  name: string;
  phone: string | null;
}

const Propriedades = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    owner_id: "",
    assigned_cleaner_id: "",
    taxa_limpeza: ""
  });

  const visibleProperties = properties.filter((p) =>
    showArchived ? !!p.archived_at : !p.archived_at
  );

  useEffect(() => {
    if (!user || !['admin', 'agent'].includes(profile?.role || '')) {
      navigate("/");
      return;
    }
    fetchData();
  }, [user, profile, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch owners
      const { data: ownersData, error: ownersError } = await supabase
        .from('profiles')
        .select('id, name, email, phone')
        .eq('role', 'owner')
        .eq('status', 'approved')
        .order('name');

      if (ownersError) throw ownersError;
      setOwners(ownersData || []);

      // Fetch cleaners
      const { data: cleanersData, error: cleanersError } = await supabase
        .from('profiles')
        .select('id, name, phone')
        .eq('role', 'cleaner')
        .order('name');

      if (cleanersError) throw cleanersError;
      setCleaners(cleanersData || []);

      // Fetch properties
      const { data: propertiesData, error: propertiesError } = await supabase
        .from('properties')
        .select('*')
        .order('name');

      if (propertiesError) throw propertiesError;

      // Enrich properties with owner and cleaner details
      const enrichedProperties = (propertiesData || []).map(property => {
        const owner = ownersData?.find(o => o.id === property.owner_id);
        const cleaner = cleanersData?.find(c => c.id === property.assigned_cleaner_id);
        return {
          ...property,
          owner: owner || { name: 'N/A', email: 'N/A' },
          cleaner: cleaner ? { name: cleaner.name, phone: cleaner.phone } : undefined
        };
      });

      setProperties(enrichedProperties);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as propriedades.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.owner_id) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e proprietário são obrigatórios.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Buscar telefone do proprietário selecionado
      const selectedOwner = owners.find(o => o.id === formData.owner_id);
      const ownerPhone = selectedOwner?.phone || null;
      // Taxa de limpeza do bloqueio para uso pessoal (R$ com vírgula) -> centavos; vazio = sem taxa.
      const taxaNumero = Number(formData.taxa_limpeza.replace(/\./g, "").replace(",", "."));
      const taxaCents = formData.taxa_limpeza.trim() && Number.isFinite(taxaNumero) && taxaNumero > 0 ? Math.round(taxaNumero * 100) : null;

      if (editingProperty) {
        // Update existing property
        const updateData = {
          name: formData.name,
          address: formData.address || null,
          owner_id: formData.owner_id,
          assigned_cleaner_id: formData.assigned_cleaner_id || null,
          owner_phone: ownerPhone,
          taxa_limpeza_cents: taxaCents
        };
        
        const { error } = await supabase
          .from('properties')
          .update(updateData)
          .eq('id', editingProperty.id);

        if (error) throw error;

        toast({
          title: "Unidade atualizada!",
          description: "A unidade foi atualizada com sucesso."
        });
      } else {
        // Create new property
        const { error } = await supabase
          .from('properties')
          .insert({
            name: formData.name,
            address: formData.address || null,
            owner_id: formData.owner_id,
            assigned_cleaner_id: formData.assigned_cleaner_id || null,
            owner_phone: ownerPhone,
            taxa_limpeza_cents: taxaCents
          });

        if (error) throw error;

        toast({
          title: "Unidade criada!",
          description: "A nova unidade foi criada com sucesso."
        });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar unidade",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handlePhotoRemove = async (propertyId: string, photoUrl: string | null) => {
    if (!photoUrl) return;

    try {
      // Extract file path from URL
      const urlParts = photoUrl.split('/property-photos/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from('property-photos').remove([filePath]);
      }

      const { error } = await supabase
        .from('properties')
        .update({ cover_photo_url: null })
        .eq('id', propertyId);

      if (error) throw error;

      toast({
        title: "Foto removida!",
        description: "A foto de capa foi removida com sucesso."
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao remover foto",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleEdit = (property: Property) => {
    setEditingProperty(property);
    setFormData({
      name: property.name,
      address: property.address || "",
      owner_id: property.owner_id,
      assigned_cleaner_id: property.assigned_cleaner_id || "",
      taxa_limpeza: property.taxa_limpeza_cents != null ? (property.taxa_limpeza_cents / 100).toFixed(2).replace(".", ",") : ""
    });
    setDialogOpen(true);
  };

  const handleArchiveToggle = async (property: Property) => {
    if (profile?.role !== 'admin') {
      toast({
        title: "Permissão negada",
        description: "Apenas administradores podem arquivar unidades",
        variant: "destructive",
      });
      return;
    }

    const isArchiving = !property.archived_at;
    const confirmMsg = isArchiving
      ? `Arquivar a unidade "${property.name}"? Ela ficará oculta da listagem mas todo o histórico (cobranças, vistorias, chamados) será preservado.`
      : `Restaurar a unidade "${property.name}" para a listagem ativa?`;
    if (!confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('properties')
        .update({ archived_at: isArchiving ? new Date().toISOString() : null })
        .eq('id', property.id);

      if (error) throw error;

      toast({
        title: isArchiving ? "Unidade arquivada!" : "Unidade restaurada!",
        description: isArchiving
          ? "A unidade foi ocultada da listagem ativa."
          : "A unidade voltou para a listagem ativa."
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar unidade",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const telefoneAviso = (p: Property) =>
    (p.owner_phone || owners.find((o) => o.id === p.owner_id)?.phone || "").replace(/\D/g, "");

  const toggleAvisoReservas = async (p: Property, ligado: boolean) => {
    const { error } = await supabase.from("properties").update({ notificar_reservas_whatsapp: ligado }).eq("id", p.id);
    if (error) {
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
      return;
    }
    setProperties((prev) => prev.map((x) => (x.id === p.id ? { ...x, notificar_reservas_whatsapp: ligado } : x)));
    setEditingProperty((e) => (e && e.id === p.id ? { ...e, notificar_reservas_whatsapp: ligado } : e));
    toast({ title: ligado ? "Aviso de reservas ligado" : "Aviso de reservas desligado" });
  };

  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const enviarTesteReserva = async (p: Property) => {
    setEnviandoTeste(true);
    try {
      const { data: r } = await supabase
        .from("hostex_reservations")
        .select("reservation_code")
        .eq("property_id", p.id)
        .eq("status", "accepted")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (!r) {
        toast({ title: "Nenhuma reserva confirmada para este imóvel", variant: "destructive" });
        return;
      }
      const { data, error } = await supabase.functions.invoke("notificar-reserva", {
        body: { reservation_code: r.reservation_code, reenviar: true },
      });
      if (error) throw error;
      const st = (data as any)?.status;
      toast({
        title: st === "enviado" ? "Teste enviado" : `Resultado: ${st}`,
        description: (data as any)?.erro,
        variant: st === "enviado" ? undefined : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Falha no teste", description: e.message, variant: "destructive" });
    } finally {
      setEnviandoTeste(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: "", address: "", owner_id: "", assigned_cleaner_id: "", taxa_limpeza: "" });
    setEditingProperty(null);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goBack(navigate, "/painel")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Gerenciar Unidades</h1>
            <p className="text-muted-foreground">Gerencie as unidades/propriedades dos proprietários</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Unidade
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProperty ? 'Editar Unidade' : 'Nova Unidade'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="name">Nome da Unidade *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Apartamento 101, Casa 5, Sala 203"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="address">Endereço</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Endereço completo (opcional)"
                    />
                  </div>
                  <div>
                    <Label htmlFor="taxa_limpeza">Taxa de limpeza (R$)</Label>
                    <Input
                      id="taxa_limpeza"
                      inputMode="decimal"
                      value={formData.taxa_limpeza}
                      onChange={(e) => setFormData({ ...formData, taxa_limpeza: e.target.value })}
                      placeholder="Ex.: 180,00"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cobrada por PIX quando o proprietário bloqueia datas para uso pessoal. Vazia, o pedido fica travado até cadastrar.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="owner_id">Proprietário *</Label>
                    <Select value={formData.owner_id} onValueChange={(value) => setFormData({ ...formData, owner_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o proprietário" />
                      </SelectTrigger>
                      <SelectContent>
                        {owners.map((owner) => (
                          <SelectItem key={owner.id} value={owner.id}>
                            {owner.name} - {owner.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="assigned_cleaner_id">Faxineira Responsável</Label>
                    <Select 
                      value={formData.assigned_cleaner_id || undefined} 
                      onValueChange={(value) => {
                        setFormData({ ...formData, assigned_cleaner_id: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Nenhuma (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {cleaners.map((cleaner) => (
                          <SelectItem key={cleaner.id} value={cleaner.id}>
                            {cleaner.name} {cleaner.phone ? `- ${cleaner.phone}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.assigned_cleaner_id && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1"
                        onClick={() => setFormData({ ...formData, assigned_cleaner_id: "" })}
                      >
                        Limpar seleção
                      </Button>
                    )}
                  </div>
                  {editingProperty && (() => {
                    const temTel = telefoneAviso(editingProperty).length >= 10;
                    const ligado = !!editingProperty.notificar_reservas_whatsapp;
                    return (
                      <div className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="aviso-reservas" className="text-sm">
                            Avisar proprietário sobre novas reservas (WhatsApp)
                          </Label>
                          <Switch
                            id="aviso-reservas"
                            checked={ligado}
                            disabled={!temTel && !ligado}
                            onCheckedChange={(v) => toggleAvisoReservas(editingProperty, v)}
                          />
                        </div>
                        {!temTel && (
                          <p className="text-xs text-muted-foreground">
                            Sem WhatsApp cadastrado no imóvel nem no perfil do proprietário.
                          </p>
                        )}
                        {profile?.role === "admin" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={enviandoTeste || !temTel || !ligado}
                            onClick={() => enviarTesteReserva(editingProperty)}
                          >
                            <Send className="mr-2 h-3 w-3" />
                            {enviandoTeste ? "Enviando..." : "Enviar teste com a última reserva"}
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingProperty ? 'Atualizar' : 'Criar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-md border bg-card p-3">
          <div className="flex items-center gap-2">
            {showArchived ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            <Label htmlFor="show-archived" className="cursor-pointer text-sm">
              {showArchived ? "Mostrando arquivadas" : "Mostrar arquivadas"}
            </Label>
          </div>
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleProperties.map((property) => (
            <Card key={property.id} className={property.archived_at ? "opacity-70" : ""}>
              <CardHeader className="pb-3">
                <PropertyPhotoUpload
                  propertyId={property.id}
                  currentPhotoUrl={property.cover_photo_url}
                  propertyName={property.name}
                  onUploadComplete={() => fetchData()}
                />
                
                {property.cover_photo_url && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handlePhotoRemove(property.id, property.cover_photo_url)}
                    className="w-full"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remover Foto
                  </Button>
                )}

                <div className="flex items-start justify-between mt-3">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      {property.name}
                      {property.archived_at && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          Arquivada
                        </span>
                      )}
                      {property.notificar_reservas_whatsapp && (
                        <span
                          title="Aviso de reservas por WhatsApp ligado"
                          className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success"
                        >
                          <MessageCircle className="h-3 w-3" /> Reservas
                        </span>
                      )}
                    </CardTitle>
                    {property.address && (
                      <CardDescription className="mt-2">{property.address}</CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Proprietário</p>
                    <p className="text-sm font-medium text-foreground">{property.owner.name}</p>
                    <p className="text-xs text-muted-foreground">{property.owner.email}</p>
                    {property.owner_phone && (
                      <p className="text-xs text-muted-foreground">📞 {property.owner_phone}</p>
                    )}
                  </div>
                  {property.cleaner && (
                    <div>
                      <p className="text-xs text-muted-foreground">Faxineira Responsável</p>
                      <p className="text-sm font-medium text-foreground">{property.cleaner.name}</p>
                      {property.cleaner.phone && (
                        <p className="text-xs text-muted-foreground">📞 {property.cleaner.phone}</p>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(property)}
                      className="flex-1"
                    >
                      <Pencil className="mr-2 h-3 w-3" />
                      Editar
                    </Button>
                    <PropertyAccessDialog propertyId={property.id} propertyName={property.name} />

                    {profile?.role === 'admin' && (
                      <Button
                        size="sm"
                        variant={property.archived_at ? "default" : "destructive"}
                        onClick={() => handleArchiveToggle(property)}
                        className="flex-1"
                      >
                        {property.archived_at ? (
                          <>
                            <ArchiveRestore className="mr-2 h-3 w-3" />
                            Restaurar
                          </>
                        ) : (
                          <>
                            <Archive className="mr-2 h-3 w-3" />
                            Arquivar
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {visibleProperties.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {showArchived ? "Nenhuma unidade arquivada" : "Nenhuma unidade ativa"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {showArchived
                  ? "Quando você arquivar uma unidade, ela aparecerá aqui."
                  : 'Crie a primeira unidade clicando no botão "Nova Unidade".'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Propriedades;
