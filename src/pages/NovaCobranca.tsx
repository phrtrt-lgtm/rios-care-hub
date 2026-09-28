import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Info, Loader2, Paperclip, X, Sparkles, Trash2 } from "lucide-react";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { useToast } from "@/hooks/use-toast";
import { CHARGE_CATEGORY_OPTIONS } from "@/constants/chargeCategories";
import { parseBRNumber } from "@/lib/parseBRNumber";
import { OwnerScoreCard } from "@/components/OwnerScoreCard";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import { emParaleloOuFalha } from "@/lib/fileUpload";
import { deleteAttachmentRow } from "@/lib/deleteAttachment";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { ResumoValorCobranca } from "@/components/cobrancas/ResumoValorCobranca";

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

const DESTINO_PADRAO = "/gerenciar-cobrancas";

/** Reais digitados ("1.234,56") em centavos. */
const paraCentavos = (valor: string) => (valor ? Math.round(parseBRNumber(valor) * 100) : 0);

export default function NovaCobranca({ editId, onClose, onSaved }: NovaCobrancaProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
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

  // Para onde "voltar" e "salvar" levam: a página de origem, se ela se registrou, senão a lista de cobranças.
  const destino = (location.state as { from?: string } | null)?.from || DESTINO_PADRAO;

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
    title: searchParams.get("title") || (isReposicao ? "Reposição de item" : ""),
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
          else navigate(destino, { replace: true });
          return;
        }
        setFormData({
          owner_id: charge.owner_id || '',
          property_id: charge.property_id || '',
          title: charge.title || '',
          description: charge.description || '',
          category: charge.category || charge.service_type || '',
          amount_cents: charge.amount_cents ? (charge.amount_cents / 100).toFixed(2).replace('.', ',') : '',
          management_contribution_cents: charge.management_contribution_cents ? (charge.management_contribution_cents / 100).toFixed(2).replace('.', ',') : '',
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
      toast({ title: "Digite um comando para gerar a descrição", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      // A function só aceita `action` + `context` (ou `templateKey`) e responde em
      // `generatedText`; não há ação própria para cobrança, então usa a de
      // manutenção com o contexto de cobrança, como NovaManutencao.tsx faz.
      const propertyName = properties.find((p) => p.id === formData.property_id)?.name;
      const propertyContext = [
        propertyName ? `Unidade: ${propertyName}` : null,
        formData.title ? `Título da cobrança: ${formData.title}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: {
          action: 'generate_maintenance',
          context: {
            prompt: aiPrompt,
            propertyContext,
            projectContext:
              'Sistema de gestão de hospedagens RIOS - descrição de uma cobrança enviada ao proprietário por serviço, reparo ou item comprado para o imóvel. Explique o que foi feito, por que foi necessário e o que está sendo cobrado, em tom cordial e objetivo, sem inventar valores.',
          },
        },
      });

      if (error) throw error;

      if (data?.generatedText) {
        setFormData((prev) => ({ ...prev, description: data.generatedText }));
        setAiPrompt("");
        toast({ title: "Descrição gerada", description: "Revise e edite se necessário." });
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

  // Prévia dos valores, atualizada a cada tecla.
  const totalCents = useMemo(() => paraCentavos(formData.amount_cents), [formData.amount_cents]);
  const aporteCents = useMemo(() => paraCentavos(formData.management_contribution_cents), [formData.management_contribution_cents]);
  const aporteExcedeTotal = aporteCents > totalCents;
  const semCusto = totalCents > 0 && aporteCents === totalCents;

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

    if (aporteExcedeTotal) {
      toast({
        title: "Aporte maior que o valor",
        description: "O aporte da gestão não pode ser maior que o valor total da cobrança.",
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
            amount_cents: totalCents,
            management_contribution_cents: aporteCents,
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
            amount_cents: totalCents,
            management_contribution_cents: aporteCents,
            due_date: formData.due_date || null,
            status: asDraft ? 'draft' : 'sent'
          })
          .select()
          .single();

        if (chargeError) throw chargeError;
        chargeId = charge.id;
      }

      // Upload new attachments (if any)
      // Até 3 arquivos ao mesmo tempo.
      await emParaleloOuFalha(attachments, async (file, indiceArquivo) => {
        // Compress video if it's a video file
        const processedFile = await processFileForUpload(file);
        const fileExt = processedFile.name.split('.').pop();
        const filePath = `charges/${chargeId}/${Date.now()}-${indiceArquivo}.${fileExt}`;

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
      });

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
        title: isEditMode ? "Cobrança atualizada" : (asDraft ? "Rascunho salvo" : "Cobrança criada"),
        description: isEditMode
          ? "As alterações foram salvas."
          : (asDraft ? "A cobrança foi salva como rascunho." : "A cobrança foi criada e o proprietário foi notificado."),
      });

      if (isModal) {
        onSaved?.();
        onClose?.();
      } else {
        navigate(destino, { replace: true });
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

  const cancelar = () => (isModal ? onClose?.() : navigate(destino, { replace: true }));

  const titulo = isEditMode ? "Editar cobrança" : isReposicao ? "Reposição de item" : "Nova cobrança";
  const subtitulo = isReposicao
    ? "Registre a compra de itens para o imóvel. O aporte da gestão cobre 100% automaticamente."
    : isEditMode
      ? "Altere os dados e salve."
      : "A cobrança é enviada ao proprietário com aviso por e-mail.";

  const formulario = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isModal && isReposicao && <p className="text-sm text-muted-foreground">{subtitulo}</p>}

      <div className="space-y-2">
        <Label htmlFor="owner_id">Proprietário *</Label>
        <Select
          value={formData.owner_id}
          onValueChange={(value) => {
            setFormData({ ...formData, owner_id: value });
            fetchProperties(value);
          }}
        >
          <SelectTrigger id="owner_id">
            <SelectValue placeholder="Selecione o proprietário" />
          </SelectTrigger>
          <SelectContent className="z-50 bg-popover">
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name} ({owner.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Score do proprietário, quando escolhido */}
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
          <SelectTrigger id="property_id">
            <SelectValue placeholder={formData.owner_id ? "Selecione a unidade (opcional)" : "Primeiro selecione o proprietário"} />
          </SelectTrigger>
          <SelectContent className="z-50 bg-popover">
            {properties.map((property) => (
              <SelectItem key={property.id} value={property.id}>
                {property.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Categoria do serviço *</Label>
        <Select
          value={formData.category}
          onValueChange={(value) => setFormData({ ...formData, category: value })}
        >
          <SelectTrigger id="category">
            <SelectValue placeholder="Selecione a categoria" />
          </SelectTrigger>
          <SelectContent className="z-50 bg-popover">
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
              placeholder="Comando para a IA gerar a descrição"
              aria-label="Comando para a IA gerar a descrição"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  generateDescription();
                }
              }}
              disabled={isGenerating}
            />
            <Button
              type="button"
              onClick={generateDescription}
              disabled={isGenerating || !aiPrompt.trim()}
              variant="secondary"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {isGenerating ? "Gerando…" : "Gerar"}
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
          <Label htmlFor="amount_cents">Valor total (R$) *</Label>
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
          <Label htmlFor="management_contribution_cents">Aporte da gestão (R$)</Label>
          <Input
            id="management_contribution_cents"
            type="text"
            inputMode="decimal"
            value={formData.management_contribution_cents}
            onChange={(e) => setFormData({ ...formData, management_contribution_cents: e.target.value.replace(/[^0-9.,]/g, "") })}
            placeholder="0,00"
            aria-invalid={aporteExcedeTotal}
            aria-describedby={aporteExcedeTotal ? "aporte-erro" : undefined}
            className={aporteExcedeTotal ? "border-destructive focus-visible:ring-destructive" : undefined}
          />
          {aporteExcedeTotal && (
            <p id="aporte-erro" className="text-xs text-destructive" role="alert">
              O aporte não pode ser maior que o valor total.
            </p>
          )}
        </div>
      </div>

      {/* Prévia do que o proprietário vai ver */}
      <ResumoValorCobranca
        cobranca={{ amount_cents: totalCents, management_contribution_cents: Math.min(aporteCents, totalCents) }}
        variante="completo"
      />

      {semCusto && (
        <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <p>
            O aporte cobre o valor inteiro: ao ser enviada, a cobrança sai como <strong>paga</strong>, sem custo para o
            proprietário.
          </p>
        </div>
      )}

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
            <Paperclip className="h-4 w-4" aria-hidden="true" />
            Anexos existentes {existingAttachments.length > 0 && `(${existingAttachments.length})`}
          </Label>
          {loadingAttachments ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-busy="true" aria-label="Carregando anexos">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-lg" />
              ))}
            </div>
          ) : existingAttachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum anexo nesta cobrança.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {existingAttachments.map((att, i) => (
                <div key={att.id} className="relative aspect-square">
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
                    className="absolute right-1 top-1 z-10 h-7 w-7 opacity-90 hover:opacity-100"
                    onClick={() => setAttachmentToDelete(att)}
                    aria-label={`Excluir anexo ${i + 1}`}
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
        <Label htmlFor="attachment-upload">{isEditMode ? 'Adicionar novos anexos' : 'Anexos'}</Label>
        <div className="space-y-2">
          {attachments.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-muted p-2">
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => removeAttachment(index)}
                aria-label={`Remover ${file.name}`}
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
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                  Adicionar arquivo
                </span>
              </Button>
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={cancelar}>
          Cancelar
        </Button>
        {!isEditMode && (
          <Button
            type="button"
            variant="secondary"
            disabled={loading || aporteExcedeTotal}
            onClick={(e) => handleSubmit(e, true)}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvar rascunho
          </Button>
        )}
        <Button type="submit" disabled={loading || loadingCharge || aporteExcedeTotal}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isEditMode ? "Salvar alterações" : "Criar e enviar"}
        </Button>
      </div>
    </form>
  );

  const confirmacaoExclusao = (
    <ConfirmationDialog
      open={!!attachmentToDelete}
      onOpenChange={(o) => !o && setAttachmentToDelete(null)}
      title="Excluir anexo?"
      description="Esta ação é permanente e não pode ser desfeita."
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
  );

  // Dentro do EditMaintenanceDialog: o diálogo já tem o título, então só o formulário.
  if (isModal) {
    return (
      <div className="px-4 pb-2">
        {formulario}
        {confirmacaoExclusao}
      </div>
    );
  }

  return (
    <PaginaInterna
      largura="estreita"
      cabecalho={
        <CabecalhoPagina
          titulo={titulo}
          subtitulo={subtitulo}
          icone={<DollarSign />}
          tom="success"
          voltarPara={destino}
        />
      }
    >
      <Card className="rounded-xl border-border/70">
        <CardContent className="p-4 md:p-6">{formulario}</CardContent>
      </Card>
      {confirmacaoExclusao}
    </PaginaInterna>
  );
}
