import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/LoadingScreen";

interface Owner {
  id: string;
  name: string;
  email: string;
}

const NovoAlerta = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());
  
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    type: "info",
    target_audience: "specific",
    expires_at: "",
  });

  useEffect(() => {
    if (!user || !['admin', 'agent'].includes(profile?.role || '')) {
      navigate("/");
      return;
    }
    fetchOwners();
  }, [user, profile, navigate]);

  const fetchOwners = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, role, status')
        .in('status', ['active', 'approved'])
        .order('name');

      if (error) throw error;
      
      console.log('Perfis carregados:', data);
      
      // Filter only actual owners (not agent or admin)
      const actualOwners = (data || []).filter(p => 
        p.role === 'owner'
      );
      
      console.log('Proprietários filtrados:', actualOwners);
      setOwners(actualOwners);
    } catch (error) {
      console.error('Erro ao carregar proprietários:', error);
      toast.error('Erro ao carregar proprietários');
    } finally {
      setLoading(false);
    }
  };

  const toggleOwner = (ownerId: string) => {
    const newSelected = new Set(selectedOwners);
    if (newSelected.has(ownerId)) {
      newSelected.delete(ownerId);
    } else {
      newSelected.add(ownerId);
    }
    setSelectedOwners(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedOwners.size === owners.length) {
      setSelectedOwners(new Set());
    } else {
      setSelectedOwners(new Set(owners.map(o => o.id)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.message.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (formData.target_audience === 'specific' && selectedOwners.size === 0) {
      toast.error('Selecione pelo menos um proprietário');
      return;
    }

    setSubmitting(true);
    try {
      // Create alert
      const { data: alert, error: alertError } = await supabase
        .from('alerts')
        .insert({
          title: formData.title,
          message: formData.message,
          type: formData.type,
          target_audience: formData.target_audience,
          expires_at: formData.expires_at || null,
          created_by: user!.id,
        })
        .select()
        .single();

      if (alertError) throw alertError;

      // Determine recipients
      let recipientIds: string[] = [];
      
      if (formData.target_audience === 'specific') {
        recipientIds = Array.from(selectedOwners);
      } else if (formData.target_audience === 'all_owners') {
        recipientIds = owners.map(o => o.id);
      } else if (formData.target_audience === 'team') {
        const { data: teamMembers } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['admin', 'agent'])
          .in('status', ['active', 'approved']);
        recipientIds = teamMembers?.map(m => m.id) || [];
      }

      // Ensure the creator receives the alert if they are in the target audience
      if (!recipientIds.includes(user!.id)) {
        if (formData.target_audience === 'team' && ['admin', 'agent'].includes(profile?.role || '')) {
          recipientIds.push(user!.id);
        }
      }

      console.log('Recipients:', recipientIds);

      // Create alert recipients
      const { error: recipientsError } = await supabase
        .from('alert_recipients')
        .insert(
          recipientIds.map(userId => ({
            alert_id: alert.id,
            user_id: userId,
          }))
        );

      if (recipientsError) {
        console.error('Erro ao criar recipients:', recipientsError);
        throw recipientsError;
      }

      // Send emails via edge function
      await supabase.functions.invoke('send-alert-email', {
        body: {
          alert_id: alert.id,
          title: formData.title,
          message: formData.message,
          type: formData.type,
          recipient_ids: recipientIds,
        },
      });

      toast.success('Alerta criado e enviado com sucesso!');
      navigate('/painel');
    } catch (error) {
      console.error('Erro ao criar alerta:', error);
      toast.error('Erro ao criar alerta');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingScreen message="Carregando..." />;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/painel")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Novo Alerta</h1>
            <p className="text-muted-foreground">Crie e envie alertas para proprietários ou equipe</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informações do Alerta</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Título do alerta"
                  required
                />
              </div>

              <div>
                <Label htmlFor="message">Mensagem *</Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Escreva a mensagem do alerta..."
                  rows={6}
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="type">Tipo</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Informação</SelectItem>
                      <SelectItem value="warning">Aviso</SelectItem>
                      <SelectItem value="error">Erro</SelectItem>
                      <SelectItem value="success">Sucesso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="expires_at">Data de Expiração (Opcional)</Label>
                  <Input
                    id="expires_at"
                    type="datetime-local"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="target_audience">Público Alvo</Label>
                <Select
                  value={formData.target_audience}
                  onValueChange={(value) => setFormData({ ...formData, target_audience: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="specific">Proprietários Específicos</SelectItem>
                    <SelectItem value="all_owners">Todos os Proprietários</SelectItem>
                    <SelectItem value="team">Equipe (Admins e Agentes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.target_audience === 'specific' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Selecionar Proprietários</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectAll}
                    >
                      {selectedOwners.size === owners.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                    </Button>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-4">
                    {owners.map((owner) => (
                      <div key={owner.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={owner.id}
                          checked={selectedOwners.has(owner.id)}
                          onCheckedChange={() => toggleOwner(owner.id)}
                        />
                        <label
                          htmlFor={owner.id}
                          className="flex-1 cursor-pointer text-sm"
                        >
                          {owner.name} ({owner.email})
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedOwners.size} proprietário(s) selecionado(s)
                  </p>
                </div>
              )}

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/painel')}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  <Send className="mr-2 h-4 w-4" />
                  {submitting ? 'Enviando...' : 'Criar e Enviar Alerta'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NovoAlerta;