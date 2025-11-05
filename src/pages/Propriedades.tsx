import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Building2, Plus, Pencil, Trash2, Upload, X, Image } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Property {
  id: string;
  name: string;
  address: string | null;
  owner_id: string;
  cover_photo_url: string | null;
  assigned_cleaner_phone: string | null;
  owner: {
    name: string;
    email: string;
  };
}

interface Owner {
  id: string;
  name: string;
  email: string;
}

const Propriedades = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    owner_id: "",
    assigned_cleaner_phone: ""
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

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
        .select('id, name, email')
        .eq('role', 'owner')
        .eq('status', 'approved')
        .order('name');

      if (ownersError) throw ownersError;
      setOwners(ownersData || []);

      // Fetch properties
      const { data: propertiesData, error: propertiesError } = await supabase
        .from('properties')
        .select('*')
        .order('name');

      if (propertiesError) throw propertiesError;

      // Enrich properties with owner details
      const enrichedProperties = (propertiesData || []).map(property => {
        const owner = ownersData?.find(o => o.id === property.owner_id);
        return {
          ...property,
          owner: owner || { name: 'N/A', email: 'N/A' }
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
      if (editingProperty) {
        // Update existing property
        const { error } = await supabase
          .from('properties')
          .update({
            name: formData.name,
            address: formData.address || null,
            owner_id: formData.owner_id,
            assigned_cleaner_phone: formData.assigned_cleaner_phone || null
          })
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
            assigned_cleaner_phone: formData.assigned_cleaner_phone || null
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

  const handlePhotoUpload = async (propertyId: string, file: File) => {
    setUploadingPhoto(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${propertyId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('property-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('property-photos')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('properties')
        .update({ cover_photo_url: publicUrl })
        .eq('id', propertyId);

      if (updateError) throw updateError;

      toast({
        title: "Foto atualizada!",
        description: "A foto de capa foi atualizada com sucesso."
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao fazer upload",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async (propertyId: string, photoUrl: string | null) => {
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
      assigned_cleaner_phone: property.assigned_cleaner_phone || ""
    });
    setDialogOpen(true);
  };

  const handleDelete = async (propertyId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta unidade?")) return;

    try {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', propertyId);

      if (error) throw error;

      toast({
        title: "Unidade excluída!",
        description: "A unidade foi excluída com sucesso."
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir unidade",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({ name: "", address: "", owner_id: "", assigned_cleaner_phone: "" });
    setEditingProperty(null);
    setPhotoPreview(null);
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
            onClick={() => navigate("/todos-tickets")}
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
                    <Label htmlFor="assigned_cleaner_phone">Telefone da Faxineira</Label>
                    <Input
                      id="assigned_cleaner_phone"
                      value={formData.assigned_cleaner_phone}
                      onChange={(e) => setFormData({ ...formData, assigned_cleaner_phone: e.target.value })}
                      placeholder="Ex: (11) 99999-9999"
                    />
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <Card key={property.id}>
              <CardHeader className="pb-3">
                {/* Foto de capa */}
                <div className="relative w-full h-40 mb-3 bg-muted rounded-lg overflow-hidden group">
                  {property.cover_photo_url ? (
                    <>
                      <img 
                        src={property.cover_photo_url} 
                        alt={property.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handlePhotoUpload(property.id, file);
                            }}
                            disabled={uploadingPhoto}
                          />
                          <Button size="sm" variant="secondary" asChild>
                            <span>
                              <Upload className="h-4 w-4 mr-2" />
                              Alterar
                            </span>
                          </Button>
                        </label>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemovePhoto(property.id, property.cover_photo_url)}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Remover
                        </Button>
                      </div>
                    </>
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoUpload(property.id, file);
                        }}
                        disabled={uploadingPhoto}
                      />
                      <Image className="h-8 w-8 text-muted-foreground mb-2" />
                      <span className="text-xs text-muted-foreground">
                        {uploadingPhoto ? "Enviando..." : "Adicionar foto"}
                      </span>
                    </label>
                  )}
                </div>

                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      {property.name}
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
                  </div>
                  {property.assigned_cleaner_phone && (
                    <div>
                      <p className="text-xs text-muted-foreground">Faxineira</p>
                      <p className="text-sm font-medium text-foreground">{property.assigned_cleaner_phone}</p>
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
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(property.id)}
                      className="flex-1"
                    >
                      <Trash2 className="mr-2 h-3 w-3" />
                      Excluir
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {properties.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">Nenhuma unidade cadastrada</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Crie a primeira unidade clicando no botão "Nova Unidade".
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Propriedades;
