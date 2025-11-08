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
import { ArrowLeft, Send, Upload, X, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/LoadingScreen";
import { sanitizeFilename } from "@/lib/storage";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";

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

const NovoAlerta = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<ReadyAttachment[]>([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
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

  const generateMessage = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: { 
          action: 'generate_alert',
          context: {
            prompt: aiPrompt,
            projectContext: 'Sistema de gestão de hospedagens RIOS - alertas e comunicações com proprietários e equipe'
          }
        }
      });
      
      if (error) throw error;
      if (data?.generatedText) {
        setFormData({ ...formData, message: data.generatedText });
        setAiPrompt("");
        toast.success("Mensagem gerada! Revise e edite se necessário.");
      }
    } catch (error: any) {
      toast.error("Erro ao gerar mensagem: " + error.message);
    } finally {
      setIsGenerating(false);
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

      // Upload attachments if any
      if (uploadedFiles.length > 0) {
        const attachmentInserts = uploadedFiles.map(f => ({
          alert_id: alert.id,
          file_path: new URL(f.file_url).pathname.split('/attachments/')[1],
          file_name: f.name,
          file_type: f.file_type,
          file_size: f.size_bytes,
        }));

        const { error: attachError } = await supabase
          .from('alert_attachments')
          .insert(attachmentInserts);

        if (attachError) {
          console.error('Erro ao salvar anexos:', attachError);
        }

        // Update alert to mark it has attachments
        await supabase
          .from('alerts')
          .update({ has_attachments: true })
          .eq('id', alert.id);
      }

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
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Digite ou grave um comando para a IA gerar a mensagem..."
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), generateMessage())}
                    />
                    <VoiceToTextInput
                      onTranscript={(text) => setAiPrompt(text)}
                      disabled={isGenerating}
                    />
                    <Button 
                      type="button" 
                      onClick={generateMessage}
                      disabled={isGenerating || !aiPrompt.trim()}
                      variant="secondary"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {isGenerating ? "Gerando..." : "Gerar"}
                    </Button>
                  </div>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Escreva a mensagem do alerta..."
                    rows={6}
                    required
                  />
                </div>
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