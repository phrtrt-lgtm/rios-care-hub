import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { FileText, Image as ImageIcon, Loader2, Megaphone, Send, Sparkles, Upload, Users, Video, X } from "lucide-react";
import { toast } from "sonner";
import { sanitizeFilename } from "@/lib/storage";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import { emParalelo } from "@/lib/fileUpload";

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

/** Rótulos na interface; os valores gravados em `alerts.type` não mudam. */
const TIPOS_AVISO: Array<{ valor: string; rotulo: string }> = [
  { valor: "info", rotulo: "Informação" },
  { valor: "warning", rotulo: "Aviso" },
  { valor: "error", rotulo: "Importante" },
  { valor: "success", rotulo: "Boa notícia" },
];

const PUBLICOS: Array<{ valor: string; rotulo: string }> = [
  { valor: "specific", rotulo: "Proprietários específicos" },
  { valor: "all_owners", rotulo: "Todos os proprietários" },
  { valor: "team", rotulo: "Equipe (administração e atendimento)" },
];

const iconeAnexo = (tipo: string) => {
  if (tipo.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (tipo.startsWith("video/")) return <Video className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
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

      // Só proprietários de fato (não agente nem admin).
      setOwners((data || []).filter((p) => p.role === 'owner'));
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
      // Até 3 arquivos ao mesmo tempo; os que subirem ficam, mesmo se outro falhar.
      const resultados = await emParalelo(Array.from(selectedFiles), async (file) =>
        uploadOne(await processFileForUpload(file)),
      );
      const uploaded = resultados.flatMap((r) => (r.ok ? [r.valor] : []));
      const falhas = resultados.flatMap((r) => (r.ok ? [] : [r.erro]));
      setUploadedFiles((prev) => [...prev, ...uploaded]);
      if (falhas.length > 0) throw falhas[0];
      toast.success(`${uploaded.length} arquivo(s) enviado(s) com sucesso!`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error((error instanceof Error && error.message) || 'Erro ao fazer upload dos arquivos');
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
    } catch (error) {
      toast.error("Erro ao gerar mensagem: " + (error instanceof Error ? error.message : String(error)));
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
          alertId: alert.id,
          recipientIds: recipientIds,
        },
      });

      toast.success('Aviso criado e enviado.');
      navigate('/painel', { replace: true });
    } catch (error) {
      console.error('Erro ao criar aviso:', error);
      toast.error('Erro ao criar o aviso');
    } finally {
      setSubmitting(false);
    }
  };

  const todosSelecionados = owners.length > 0 && selectedOwners.size === owners.length;

  return (
    <PaginaInterna
      largura="estreita"
      cabecalho={
        <CabecalhoPagina
          titulo="Novo aviso"
          subtitulo="Para proprietários ou para a equipe"
          icone={<Megaphone />}
          tom="warning"
          voltarPara="/painel"
        />
      }
    >
      <Card className="rounded-xl border-border/70 p-4 md:p-5">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Título do aviso"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message">Mensagem *</Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Digite ou grave um comando para a IA gerar a mensagem…"
                  aria-label="Comando para a IA gerar a mensagem"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      generateMessage();
                    }
                  }}
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
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isGenerating ? "Gerando…" : "Gerar"}
                </Button>
              </div>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Escreva a mensagem do aviso…"
                rows={6}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="type">Tipo</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger id="type" aria-label="Tipo do aviso">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  {TIPOS_AVISO.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expires_at">Expira em (opcional)</Label>
              <Input
                id="expires_at"
                type="datetime-local"
                value={formData.expires_at}
                onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target_audience">Público</Label>
            <Select
              value={formData.target_audience}
              onValueChange={(value) => setFormData({ ...formData, target_audience: value })}
            >
              <SelectTrigger id="target_audience" aria-label="Público do aviso">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                {PUBLICOS.map((p) => (
                  <SelectItem key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.target_audience === 'specific' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Destinatários</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  disabled={loading || owners.length === 0}
                >
                  {todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
                </Button>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border/70 p-3">
                {loading ? (
                  <div className="space-y-2.5" aria-busy="true" aria-label="Carregando proprietários">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-4 w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : owners.length === 0 ? (
                  <EmptyState
                    icon={<Users className="h-5 w-5" />}
                    title="Nenhum proprietário ativo"
                    className="py-6 [&>div:first-child]:h-10 [&>div:first-child]:w-10 [&>h3]:text-sm"
                  />
                ) : (
                  <div className="space-y-2">
                    {owners.map((owner) => (
                      <div key={owner.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`owner-${owner.id}`}
                          checked={selectedOwners.has(owner.id)}
                          onCheckedChange={() => toggleOwner(owner.id)}
                        />
                        <label htmlFor={`owner-${owner.id}`} className="flex-1 cursor-pointer text-sm">
                          {owner.name} <span className="text-muted-foreground">({owner.email})</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!loading && (
                <p className="text-xs text-muted-foreground">
                  {selectedOwners.size} proprietário(s) selecionado(s)
                </p>
              )}
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
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Enviando anexos" />
              ) : (
                <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
            {uploadedFiles.length > 0 && (
              <ul className="space-y-1" aria-label="Anexos prontos">
                {uploadedFiles.map((file) => (
                  <li
                    key={file.file_url}
                    className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-muted-foreground" aria-hidden="true">
                      {iconeAnexo(file.file_type)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground"
                      onClick={() => removeFile(file.file_url)}
                      aria-label="Remover anexo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/painel', { replace: true })}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || uploading || loading}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Enviando…' : 'Criar e enviar aviso'}
            </Button>
          </div>
        </form>
      </Card>
    </PaginaInterna>
  );
};

export default NovoAlerta;
