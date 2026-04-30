import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Paperclip, X, Sparkles, Trash2 } from "lucide-react";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { useToast } from "@/hooks/use-toast";
import { CHARGE_CATEGORY_OPTIONS } from "@/constants/chargeCategories";
import { parseBRNumber } from "@/lib/parseBRNumber";
import { OwnerScoreCard } from "@/components/OwnerScoreCard";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import { deleteAttachmentRow } from "@/lib/deleteAttachment";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { MediaThumbnail } from "@/components/MediaThumbnail";

type ExistingChargeAttachment = {
  id: string;
  file_url: string;
  file_name?: string | null;
  file_type?: string | null;
};

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

interface NovaCobrancaProps {
  editId?: string;
  onClose?: () => void;
  onSaved?: () => void;
}

export default function NovaCobranca({ editId, onClose, onSaved }: NovaCobrancaProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const isReposicao = searchParams.get("reposicao") === "true";
  const editChargeId = editId ?? searchParams.get("edit");
  const isEditMode = !!editChargeId;
  const isModal = !!onClose;
  const [loadingCharge, setLoadingCharge] = useState(isEditMode);
  const [existingAttachments, setExistingAttachments] = useState<ExistingChargeAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<ExistingChargeAttachment | null>(null);
  const [deletingAttachment, setDeletingAttachment] = useState(false);

  const loadExistingAttachments = async () => {
    if (!editChargeId) return;
    setLoadingAttachments(true);
    try {
      const { data, error } = await supabase
        .from('charge_attachments')
        .select('id, file_path, file_name, mime_type')
        .eq('charge_id', editChargeId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const items: ExistingChargeAttachment[] = (data || []).map((a: any) => {
        const url = a.file_path?.startsWith('http')
          ? a.file_path
          : supabase.storage.from('attachments').getPublicUrl(a.file_path).data.publicUrl;
        return {
          id: a.id,
          file_url: url,
          file_name: a.file_name,
          file_type: a.mime_type,
        };
      });
      setExistingAttachments(items);
    } catch (err: any) {
      console.error('Error loading charge attachments:', err);
    } finally {
      setLoadingAttachments(false);
    }
  };

  useEffect(() => {
    if (isEditMode) loadExistingAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, editChargeId]);

  const [formData, setFormData] = useState({
    owner_id: searchParams.get("owner_id") || "",
    property_id: searchParams.get("property_id") || "",
    title: searchParams.get("title") || (isReposicao ? "Reposição de Item" : ""),
    description: searchParams.get("description") || "",
    category: isReposicao ? "itens" : "",
    amount_cents: "",
    management_contribution_cents: "",
    due_date: "",
  });

  // Auto-sync management contribution = amount when reposicao mode
  const handleAmountChange = (value: string) => {
    if (isReposicao) {
      setFormData({ ...formData, amount_cents: value, management_contribution_cents: value });
    } else {
      setFormData({ ...formData, amount_cents: value });
    }
  };

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';

  useEffect(() => {
    if (!isTeamMember) {
      navigate('/');
      return;
    }
    fetchOwners();
  }, [isTeamMember]);

  // If owner_id comes from query params, load their properties
  useEffect(() => {
    if (formData.owner_id) {
      fetchProperties(formData.owner_id);
    }
  }, []);

  // Load existing charge for edit mode
  useEffect(() => {
    if (!isEditMode || !editChargeId) return;
    (async () => {
      try {
        const { data: charge, error } = await supabase
          .from('charges')
          .select('*')
          .eq('id', editChargeId)
          .maybeSingle();
        if (error) throw error;
        if (!charge) {
          toast({ title: 'Cobrança não encontrada', variant: 'destructive' });
          if (isModal) onClose?.();
          else navigate('/admin/manutencoes-lista');
          return;
        }
        setFormData({
          owner_id: charge.owner_id || '',
          property_id: charge.property_id || '',
          title: charge.title || '',
          description: charge.description || '',
          category: charge.category || charge.service_type || '',
          amount_cents: charge.amount_cents ? String(Math.round(charge.amount_cents / 100)) : '',
          management_contribution_cents: charge.management_contribution_cents ? String(Math.round(charge.management_contribution_cents / 100)) : '',
          due_date: charge.due_date || '',
        });
        if (charge.owner_id) await fetchProperties(charge.owner_id);
      } catch (err: any) {
        toast({ title: 'Erro ao carregar cobrança', description: err.message, variant: 'destructive' });
      } finally {
        setLoadingCharge(false);
      }
    })();
  }, [isEditMode, editChargeId]);

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

  const generateDescription = async () => {
    if (!aiPrompt.trim()) {
      toast({ title: "Digite um prompt para gerar a descrição", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: { 
          prompt: aiPrompt,
          context: `Gerar descrição de cobrança. Título: ${formData.title || 'N/A'}`
        }
      });

      if (error) throw error;

      if (data?.response) {
        setFormData({ ...formData, description: data.response });
        setAiPrompt("");
        toast({ title: "Descrição gerada com sucesso!" });
      }
    } catch (error: any) {
      toast({ 
        title: "Erro ao gerar descrição", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent, asDraft: boolean = false) => {
    e.preventDefault();
    
    if (!formData.owner_id || !formData.title || !formData.amount_cents || !formData.category) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos obrigatórios (proprietário, título, categoria e valor)",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      let chargeId: string;

      if (isEditMode && editChargeId) {
        // UPDATE existing charge
        const { error: updateError } = await supabase
          .from('charges')
          .update({
            owner_id: formData.owner_id,
            property_id: formData.property_id || null,
            title: formData.title,
            description: formData.description || null,
            category: formData.category || null,
            amount_cents: Math.round(parseBRNumber(formData.amount_cents) * 100),
            management_contribution_cents: formData.management_contribution_cents ? Math.round(parseBRNumber(formData.management_contribution_cents) * 100) : 0,
            due_date: formData.due_date || null,
          })
          .eq('id', editChargeId);
        if (updateError) throw updateError;
        chargeId = editChargeId;
      } else {
        // INSERT new charge
        const { data: charge, error: chargeError } = await supabase
          .from('charges')
          .insert({
            owner_id: formData.owner_id,
            property_id: formData.property_id || null,
            title: formData.title,
            description: formData.description || null,
            category: formData.category || null,
            amount_cents: parseInt(formData.amount_cents) * 100, // Convert to cents
            management_contribution_cents: formData.management_contribution_cents ? parseInt(formData.management_contribution_cents) * 100 : 0,
            due_date: formData.due_date || null,
            status: asDraft ? 'draft' : 'sent'
          })
          .select()
          .single();

        if (chargeError) throw chargeError;
        chargeId = charge.id;
      }

      // Upload new attachments (if any)
      for (const file of attachments) {
        // Compress video if it's a video file
        const processedFile = await processFileForUpload(file);
        const fileExt = processedFile.name.split('.').pop();
        const filePath = `charges/${chargeId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, processedFile);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase
          .from('charge_attachments')
          .insert({
            charge_id: chargeId,
            file_name: processedFile.name,
            file_path: filePath,
            file_size: processedFile.size,
            mime_type: processedFile.type,
            created_by: profile?.id
          });

        if (dbError) throw dbError;
      }

      // Enviar notificação por email e push apenas para CRIAÇÃO (não rascunho, não edição)
      if (!isEditMode && !asDraft) {
        try {
          await supabase.functions.invoke('send-charge-email', {
            body: {
              type: 'charge_created',
              chargeId,
            },
          });
        } catch (notifyError) {
          console.error('Erro ao enviar notificação:', notifyError);
        }
      }

      toast({
        title: isEditMode ? "Cobrança atualizada!" : (asDraft ? "Rascunho salvo!" : "Cobrança criada!"),
        description: isEditMode
          ? "As alterações foram salvas."
          : (asDraft ? "A cobrança foi salva como rascunho." : "A cobrança foi criada e o proprietário foi notificado."),
      });

      if (isModal) {
        onSaved?.();
        onClose?.();
      } else {
        navigate(isEditMode ? '/admin/manutencoes-lista' : '/painel');
      }
    } catch (error: any) {
      toast({
        title: isEditMode ? "Erro ao atualizar cobrança" : "Erro ao criar cobrança",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={isModal ? "" : "min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5"}>
      {!isModal && (
        <header className="border-b bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto flex h-16 items-center px-4">
            <Button variant="ghost" size="sm" onClick={() => goBack(navigate, "/gerenciar-cobrancas")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </div>
        </header>
      )}

      <main className={isModal ? "" : "container mx-auto px-4 py-8 max-w-2xl"}>
        <Card className={isModal ? "shadow-none border-0" : ""}>
          <CardHeader>
            <CardTitle>{isEditMode ? "Editar Cobrança" : (isReposicao ? "Reposição de Item" : "Nova Cobrança")}</CardTitle>
            {isReposicao && (
              <p className="text-sm text-muted-foreground">
                Registre a compra de itens para o imóvel. O aporte da gestão cobre 100% automaticamente.
              </p>
            )}
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

              {/* Score Card - aparece quando um proprietário é selecionado */}
              {formData.owner_id && (
                <OwnerScoreCard 
                  ownerId={formData.owner_id} 
                  ownerName={owners.find(o => o.id === formData.owner_id)?.name}
                />
              )}

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
                <Label htmlFor="category">Categoria do Serviço *</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
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
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Troca de torneira da pia"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Digite um prompt para gerar a descrição com IA"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), generateDescription())}
                      disabled={isGenerating}
                    />
                    <Button
                      type="button"
                      onClick={generateDescription}
                      disabled={isGenerating || !aiPrompt.trim()}
                      variant="secondary"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {isGenerating ? "Gerando..." : "Gerar"}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Detalhes da cobrança"
                      rows={3}
                      className="flex-1"
                    />
                    <VoiceToTextInput
                      onTranscript={(text) => setFormData({ ...formData, description: formData.description + (formData.description ? ' ' : '') + text })}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount_cents">Valor Total (R$) *</Label>
                  <Input
                    id="amount_cents"
                    type="text"
                    inputMode="decimal"
                    value={formData.amount_cents}
                    onChange={(e) => handleAmountChange(e.target.value.replace(/[^0-9.,]/g, ""))}
                    placeholder="0,00"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="management_contribution_cents">Aporte da Gestão (R$)</Label>
                  <Input
                    id="management_contribution_cents"
                    type="text"
                    inputMode="decimal"
                    value={formData.management_contribution_cents}
                    onChange={(e) => setFormData({ ...formData, management_contribution_cents: e.target.value.replace(/[^0-9.,]/g, "") })}
                    placeholder="0,00"
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

              {isEditMode && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    Anexos existentes {existingAttachments.length > 0 && `(${existingAttachments.length})`}
                  </Label>
                  {loadingAttachments ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando anexos...
                    </div>
                  ) : existingAttachments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum anexo nesta cobrança.</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {existingAttachments.map((att) => (
                        <div key={att.id} className="relative group aspect-square">
                          <MediaThumbnail
                            src={att.file_url}
                            fileType={att.file_type}
                            fileName={att.file_name}
                            size="md"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 h-7 w-7 p-0 z-10 opacity-90 hover:opacity-100"
                            onClick={() => setAttachmentToDelete(att)}
                            title="Excluir anexo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>{isEditMode ? 'Adicionar novos anexos' : 'Anexos'}</Label>
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
                <Button type="button" variant="outline" onClick={() => isModal ? onClose?.() : navigate(isEditMode ? '/admin/manutencoes-lista' : '/painel')}>
                  Cancelar
                </Button>
                {!isEditMode && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading}
                    onClick={(e) => handleSubmit(e, true)}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar Rascunho
                  </Button>
                )}
                <Button type="submit" disabled={loading || loadingCharge}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditMode ? "Salvar Alterações" : "Criar e Enviar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      <ConfirmationDialog
        open={!!attachmentToDelete}
        onOpenChange={(o) => !o && setAttachmentToDelete(null)}
        title="Excluir anexo?"
        description={
          <div className="space-y-2">
            <p>Esta ação é permanente e não pode ser desfeita.</p>
            {attachmentToDelete?.file_name && (
              <p className="text-xs">
                Arquivo: <span className="font-mono">{attachmentToDelete.file_name}</span>
              </p>
            )}
          </div>
        }
        confirmLabel="Excluir"
        variant="destructive"
        loading={deletingAttachment}
        onConfirm={async () => {
          if (!attachmentToDelete) return;
          setDeletingAttachment(true);
          try {
            const ok = await deleteAttachmentRow('charge_attachments', attachmentToDelete.id);
            if (ok) {
              setExistingAttachments((prev) => prev.filter((a) => a.id !== attachmentToDelete.id));
              setAttachmentToDelete(null);
            }
          } finally {
            setDeletingAttachment(false);
          }
        }}
      />
    </div>
  );
}
