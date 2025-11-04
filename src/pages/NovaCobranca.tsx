import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Paperclip, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Owner {
  id: string;
  name: string;
  email: string;
}

interface Property {
  id: string;
  name: string;
  address: string;
  owner_id: string;
}

export default function NovaCobranca() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    owner_id: "",
    property_id: "",
    title: "",
    description: "",
    amount_cents: "",
    management_contribution_cents: "",
    due_date: "",
  });

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent';

  useEffect(() => {
    if (!isTeamMember) {
      navigate('/');
      return;
    }
    fetchOwners();
  }, [isTeamMember]);

  const fetchOwners = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('role', 'owner')
      .eq('status', 'approved')
      .order('name');

    if (!error && data) {
      setOwners(data);
    }
  };

  const fetchProperties = async (ownerId: string) => {
    if (!ownerId) {
      setProperties([]);
      setFormData({ ...formData, property_id: "" });
      return;
    }

    const { data, error } = await supabase
      .from('properties')
      .select('id, name, address, owner_id')
      .eq('owner_id', ownerId)
      .order('name');

    if (!error && data) {
      setProperties(data);
    } else {
      setProperties([]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments([...attachments, ...Array.from(e.target.files)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.owner_id || !formData.title || !formData.amount_cents) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Create charge
      const { data: charge, error: chargeError } = await supabase
        .from('charges')
        .insert({
          owner_id: formData.owner_id,
          property_id: formData.property_id || null,
          title: formData.title,
          description: formData.description,
          amount_cents: parseInt(formData.amount_cents) * 100, // Convert to cents
          management_contribution_cents: formData.management_contribution_cents ? parseInt(formData.management_contribution_cents) * 100 : 0,
          due_date: formData.due_date || null,
          status: 'draft'
        })
        .select()
        .single();

      if (chargeError) throw chargeError;

      // Upload attachments
      for (const file of attachments) {
        const fileExt = file.name.split('.').pop();
        const filePath = `charges/${charge.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase
          .from('charge_attachments')
          .insert({
            charge_id: charge.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            mime_type: file.type,
            created_by: profile?.id
          });

        if (dbError) throw dbError;
      }

      toast({
        title: "Cobrança criada!",
        description: "A cobrança foi criada com sucesso.",
      });

      navigate('/painel');
    } catch (error: any) {
      toast({
        title: "Erro ao criar cobrança",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/painel')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Nova Cobrança</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="owner_id">Proprietário *</Label>
                <Select 
                  value={formData.owner_id} 
                  onValueChange={(value) => {
                    setFormData({ ...formData, owner_id: value });
                    fetchProperties(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o proprietário" />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.name} ({owner.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="property_id">Unidade</Label>
                <Select 
                  value={formData.property_id} 
                  onValueChange={(value) => setFormData({ ...formData, property_id: value })}
                  disabled={!formData.owner_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={formData.owner_id ? "Selecione a unidade (opcional)" : "Primeiro selecione o proprietário"} />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Aluguel Janeiro 2024"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detalhes da cobrança"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount_cents">Valor Total (R$) *</Label>
                  <Input
                    id="amount_cents"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount_cents}
                    onChange={(e) => setFormData({ ...formData, amount_cents: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="management_contribution_cents">Aporte da Gestão (R$)</Label>
                  <Input
                    id="management_contribution_cents"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.management_contribution_cents}
                    onChange={(e) => setFormData({ ...formData, management_contribution_cents: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="due_date">Vencimento</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Anexos</Label>
                <div className="space-y-2">
                  {attachments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-md">
                      <span className="text-sm truncate flex-1">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttachment(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div>
                    <input
                      type="file"
                      id="attachment-upload"
                      onChange={handleFileChange}
                      className="hidden"
                      multiple
                    />
                    <label htmlFor="attachment-upload">
                      <Button type="button" variant="outline" size="sm" asChild>
                        <span className="cursor-pointer">
                          <Paperclip className="mr-2 h-4 w-4" />
                          Adicionar arquivo
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => navigate('/painel')}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Cobrança
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
