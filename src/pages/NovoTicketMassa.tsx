import { useState, useEffect, useRef } from "react";
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
import { ArrowLeft, Send, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/LoadingScreen";
import { sanitizeFilename } from "@/lib/storage";

interface Owner {
  id: string;
  name: string;
  email: string;
}

type ReadyAttachment = {
  file_url: string;
  file_type: string;
  size_bytes: number;
  name: string;
};

const NovoTicketMassa = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<ReadyAttachment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    subject: "",
    description: "",
    ticket_type: "outros" as "duvida" | "manutencao" | "cobranca" | "bloqueio_data" | "financeiro" | "outros",
    priority: "normal" as "normal" | "urgente",
    target_audience: "specific",
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

      const actualOwners = (data || []).filter(p => p.role === 'owner');
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

  const uploadOne = async (file: File): Promise<ReadyAttachment> => {
    const session = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const signRes = await fetch(`${supabaseUrl}/functions/v1/upload-sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.data.session?.access_token}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        scope: 'ticket-draft',
        ownerId: user?.id,
        filename: file.name,
      }),
    });

    if (!signRes.ok) throw new Error('Falha ao assinar upload');
    const { key } = await signRes.json();

    const { error } = await supabase.storage
      .from('attachments')
      .upload(key, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('attachments')
      .getPublicUrl(key);

    return {
      file_url: publicUrl,
      file_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      name: sanitizeFilename(file.name),
    };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles?.length) return;

    setUploading(true);
    try {
      const uploaded: ReadyAttachment[] = [];
      for (const file of Array.from(selectedFiles)) {
        const result = await uploadOne(file);
        uploaded.push(result);
      }
      setUploadedFiles((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} arquivo(s) enviado(s) com sucesso!`);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Erro ao fazer upload dos arquivos');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeFile = (fileUrl: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.file_url !== fileUrl));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.subject.trim() || !formData.description.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (formData.target_audience === 'specific' && selectedOwners.size === 0) {
      toast.error('Selecione pelo menos um proprietário');
      return;
    }

    setSubmitting(true);
    try {
      let recipientIds: string[] = [];

      if (formData.target_audience === 'specific') {
        recipientIds = Array.from(selectedOwners);
      } else if (formData.target_audience === 'all_owners') {
        recipientIds = owners.map(o => o.id);
      }

      // Create tickets for each owner
      let successCount = 0;
      for (const ownerId of recipientIds) {
        try {
          // Create ticket
          const { data: ticket, error: ticketError } = await supabase
            .from("tickets")
            .insert([{
              owner_id: ownerId,
              created_by: user!.id,
              ticket_type: formData.ticket_type,
              subject: formData.subject,
              description: formData.description,
              priority: formData.priority,
            }])
            .select()
            .single();

          if (ticketError) throw ticketError;

          // Create initial message with attachments
          if (uploadedFiles.length > 0 || formData.description) {
            const session = await supabase.auth.getSession();
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

            await fetch(`${supabaseUrl}/functions/v1/create-ticket-message/${ticket.id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.data.session?.access_token}`,
                'apikey': supabaseKey,
              },
              body: JSON.stringify({
                author_type: 'agent',
                message: formData.description,
                attachments: uploadedFiles.map(f => ({
                  file_url: f.file_url,
                  file_type: f.file_type,
                  size_bytes: f.size_bytes,
                  name: f.name,
                })),
              }),
            });
          }

          // Send email notification to owner
          try {
            await supabase.functions.invoke('notify-ticket', {
              body: {
                type: 'ticket_created',
                ticketId: ticket.id,
              },
            });
          } catch (emailError) {
            console.error('Erro ao enviar email de notificação:', emailError);
          }

          successCount++;
        } catch (error) {
          console.error(`Erro ao criar ticket para ${ownerId}:`, error);
        }
      }

      toast.success(`${successCount} ticket(s) criado(s) com sucesso!`);
      navigate('/painel');
    } catch (error) {
      console.error('Erro ao criar tickets:', error);
      toast.error('Erro ao criar tickets');
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
            <h1 className="text-3xl font-bold text-foreground">Criar Tickets em Massa</h1>
            <p className="text-muted-foreground">Crie tickets para múltiplos proprietários</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informações do Ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="ticket_type">Tipo de Chamado *</Label>
                <Select
                  value={formData.ticket_type}
                  onValueChange={(value) => setFormData({ ...formData, ticket_type: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="duvida">Dúvida</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="cobranca">Cobrança</SelectItem>
                    <SelectItem value="bloqueio_data">Bloqueio de Data</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="subject">Assunto *</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Assunto do ticket"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição detalhada do ticket..."
                  rows={6}
                  required
                />
              </div>

              <div>
                <Label htmlFor="priority">Prioridade</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="files">Anexos (opcional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    id="files"
                    type="file"
                    multiple
                    accept="image/*,video/*,application/pdf,.pdf"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                    disabled={uploading}
                  />
                  {uploading ? (
                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                  ) : (
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <p className="text-sm text-muted-foreground">
                      {uploadedFiles.length} arquivo(s) pronto(s):
                    </p>
                    <div className="space-y-1">
                      {uploadedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                          <span className="truncate flex-1">{file.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 ml-2"
                            onClick={() => removeFile(file.file_url)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="target_audience">Destinatários</Label>
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
                <Button type="submit" disabled={submitting || uploading}>
                  <Send className="mr-2 h-4 w-4" />
                  {submitting ? 'Criando...' : 'Criar Tickets'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NovoTicketMassa;
