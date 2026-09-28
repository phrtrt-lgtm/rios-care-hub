import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Clock,
  Hourglass,
  Loader2,
  Paperclip,
  Siren,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { sanitizeFilename } from "@/lib/storage";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import { emParalelo } from "@/lib/fileUpload";
import { deleteAttachmentRow } from "@/lib/deleteAttachment";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { RESPONSAVEL_CUSTO } from "@/constants/chargeCategories";
import { detectMediaKind, type MediaKind } from "@/lib/mediaType";

type ExistingAttachment = {
  id: string;
  file_url: string;
  file_name?: string | null;
  file_type?: string | null;
};

type ReadyAttachment = {
  file_url: string;
  file_type: string;
  size_bytes: number;
  name: string;
  ticket_id?: string;
};

interface Property {
  id: string;
  name: string;
  address: string;
  owner_id: string;
  profiles?: { name: string };
}

interface NovaManutencaoProps {
  editId?: string;
  onClose?: () => void;
  onSaved?: () => void;
}

type CostResponsibleForm = "owner" | "management" | "guest" | "pending";

/** O formulário guarda `management`; no banco é `pm` (ver RESPONSAVEL_CUSTO). */
const OPCOES_RESPONSAVEL: Array<{ value: CostResponsibleForm; rotulo: string; icone?: ReactNode }> = [
  { value: "pending", rotulo: RESPONSAVEL_CUSTO.pending, icone: <Hourglass className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> },
  { value: "owner", rotulo: RESPONSAVEL_CUSTO.owner },
  { value: "management", rotulo: RESPONSAVEL_CUSTO.pm },
  { value: "guest", rotulo: RESPONSAVEL_CUSTO.guest },
];

/** O nome real do arquivo nunca aparece: só o tipo. */
const ROTULO_ANEXO: Record<MediaKind, string> = {
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  pdf: "PDF",
  other: "Documento",
};

export default function NovaManutencao({ editId, onClose, onSaved }: NovaManutencaoProps = {}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgente">("normal");
  const [propertyId, setPropertyId] = useState<string>("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<ReadyAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [costResponsible, setCostResponsible] = useState<CostResponsibleForm>('pending');
  const [guestCheckoutDate, setGuestCheckoutDate] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [ownerActionMode, setOwnerActionMode] = useState<'pending_decision' | 'essential' | 'pm_immediate'>('pending_decision');
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const editTicketId = editId ?? searchParams.get('edit');
  const isEditMode = !!editTicketId;
  const isModal = !!onClose;
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<ExistingAttachment | null>(null);
  const [deletingAttachment, setDeletingAttachment] = useState(false);

  // Load existing attachments for edit mode
  const loadExistingAttachments = async () => {
    if (!editTicketId) return;
    setLoadingAttachments(true);
    try {
      const { data, error } = await supabase
        .from('ticket_attachments')
        .select('id, file_url, file_name, file_type')
        .eq('ticket_id', editTicketId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setExistingAttachments(data || []);
    } catch (err: any) {
      console.error('Error loading attachments:', err);
    } finally {
      setLoadingAttachments(false);
    }
  };

  useEffect(() => {
    if (isEditMode) loadExistingAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, editTicketId]);
  const [loadingTicket, setLoadingTicket] = useState(isEditMode);

  useEffect(() => {
    // Only admins, agents, and maintenance can access this page
    if (profile && !['admin', 'agent', 'maintenance'].includes(profile.role)) {
      navigate('/minha-caixa');
      return;
    }
    fetchProperties();
  }, [profile, navigate]);

  // Load existing ticket for edit mode
  useEffect(() => {
    if (!isEditMode || !editTicketId) return;
    (async () => {
      try {
        const { data: ticket, error } = await supabase
          .from('tickets')
          .select('*')
          .eq('id', editTicketId)
          .maybeSingle();
        if (error) throw error;
        if (!ticket) {
          toast.error('Manutenção não encontrada');
          if (isModal) onClose?.();
          else navigate('/admin/manutencoes-lista');
          return;
        }
        setSubject(ticket.subject || '');
        setDescription(ticket.description || '');
        setPriority((ticket.priority as any) || 'normal');
        setPropertyId(ticket.property_id || '');
        const cr = ticket.cost_responsible;
        setCostResponsible(
          cr === 'pm' ? 'management' : (cr as any) || 'pending'
        );
        setGuestCheckoutDate(ticket.guest_checkout_date || '');
        if (ticket.essential) setOwnerActionMode('essential');
        else if (ticket.owner_decision === 'pm_will_fix') setOwnerActionMode('pm_immediate');
        else setOwnerActionMode('pending_decision');
      } catch (err: any) {
        toast.error('Erro ao carregar manutenção: ' + err.message);
      } finally {
        setLoadingTicket(false);
      }
    })();
  }, [isEditMode, editTicketId, navigate]);

  // Pre-select property from URL parameter
  useEffect(() => {
    const propertyParam = searchParams.get('property');
    if (propertyParam && properties.length > 0) {
      const propertyExists = properties.some(p => p.id === propertyParam);
      if (propertyExists) {
        setPropertyId(propertyParam);
      }
    }
  }, [properties, searchParams]);

  const fetchProperties = async () => {
    setLoadingProperties(true);
    const { data, error } = await supabase
      .from('properties')
      .select('id, name, address, owner_id, profiles!properties_owner_id_fkey(name)')
      .order('name');

    if (!error && data) {
      setProperties(data as any);
    }
    setLoadingProperties(false);
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

  const generateTitle = async (descriptionText?: string) => {
    const textToUse = descriptionText || description;
    if (!textToUse.trim()) {
      toast.error("Preencha a descrição primeiro");
      return;
    }
    setIsGeneratingTitle(true);
    try {
      const selectedProperty = properties.find(p => p.id === propertyId);
      const propertyContext = selectedProperty ? `Imóvel: ${selectedProperty.name}` : '';

      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: {
          action: 'generate_title',
          context: {
            description: textToUse,
            propertyContext,
            projectContext: 'Sistema de gestão de hospedagens RIOS - gere um título curto (máximo 60 caracteres) e objetivo para um chamado de manutenção. O título deve resumir o problema principal de forma clara e direta, sem usar palavras como "Manutenção" ou "Reparo" no início.'
          }
        }
      });

      if (error) throw error;
      if (data?.generatedText) {
        const cleanTitle = data.generatedText.replace(/^["']|["']$/g, '').trim();
        setSubject(cleanTitle);
        toast.success("Título gerado!");
      }
    } catch (error: any) {
      toast.error("Erro ao gerar título: " + error.message);
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  const generateDescription = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const selectedProperty = properties.find(p => p.id === propertyId);
      const propertyContext = selectedProperty ? `Imóvel: ${selectedProperty.name}` : '';

      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: {
          action: 'generate_maintenance',
          context: {
            prompt: aiPrompt,
            propertyContext,
            projectContext: 'Sistema de gestão de hospedagens RIOS - registro de manutenção preventiva ou corretiva em imóveis de aluguel por temporada. Descreva o problema de forma clara e objetiva, incluindo localização exata, sintomas observados e urgência se aplicável.'
          }
        }
      });

      if (error) throw error;
      if (data?.generatedText) {
        setDescription(data.generatedText);
        setAiPrompt("");
        toast.success("Descrição gerada! Revise e edite se necessário.");

        // Auto-generate title if subject is empty
        if (!subject.trim()) {
          generateTitle(data.generatedText);
        }
      }
    } catch (error: any) {
      toast.error("Erro ao gerar descrição: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!propertyId) {
      toast.error("Selecione o imóvel");
      return;
    }

    if (!subject.trim() || !description.trim()) {
      toast.error("Preencha assunto e descrição");
      return;
    }

    setLoading(true);

    try {
      // Get owner_id from property
      const selectedProperty = properties.find(p => p.id === propertyId);
      if (!selectedProperty) {
        throw new Error("Imóvel não encontrado");
      }

      // Map 'management' to 'pm' for database; keep 'pending' and 'guest' as-is
      const dbCostResponsible =
        costResponsible === 'management' ? 'pm' : costResponsible;

      // Determine if this is essential (immediate action) or needs owner decision
      const isEssential = ownerActionMode === 'essential';
      const ownerDecision = ownerActionMode === 'pm_immediate' ? 'pm_will_fix' : null;

      // Só define prazo de decisão quando a equipe marcou EXPLICITAMENTE
      // "Aguardar decisão do proprietário" E o custo está atribuído ao proprietário.
      const ownerActionDueAt =
        ownerActionMode === 'pending_decision' && costResponsible === 'owner'
          ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
          : null;

      let ticketId: string;

      if (isEditMode && editTicketId) {
        // UPDATE existing ticket
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            owner_id: selectedProperty.owner_id,
            subject,
            description,
            priority,
            property_id: propertyId,
            cost_responsible: dbCostResponsible,
            guest_checkout_date: costResponsible === 'guest' && guestCheckoutDate ? guestCheckoutDate : null,
            essential: isEssential,
            owner_decision: ownerDecision,
            owner_action_due_at: ownerActionDueAt,
          })
          .eq('id', editTicketId);
        if (updateError) throw updateError;
        ticketId = editTicketId;
      } else {
        // INSERT new ticket
        const { data: ticket, error: ticketError } = await supabase
          .from("tickets")
          .insert([{
            owner_id: selectedProperty.owner_id,
            created_by: user!.id,
            ticket_type: "manutencao" as const,
            kind: "maintenance",
            subject,
            description,
            priority,
            property_id: propertyId,
            cost_responsible: dbCostResponsible,
            guest_checkout_date: costResponsible === 'guest' && guestCheckoutDate ? guestCheckoutDate : null,
            essential: isEssential,
            owner_decision: ownerDecision,
            owner_action_due_at: ownerActionDueAt,
          }])
          .select()
          .single();

        if (ticketError) throw ticketError;
        ticketId = ticket.id;
      }

      // Append message with new attachments (only when there are uploads, or for new ticket initial message)
      const shouldCreateMessage = !isEditMode
        ? (uploadedFiles.length > 0 || description)
        : uploadedFiles.length > 0;

      if (shouldCreateMessage) {
        const session = await supabase.auth.getSession();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        await fetch(`${supabaseUrl}/functions/v1/create-ticket-message/${ticketId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({
            author_type: 'agent',
            message: isEditMode ? null : (description || null),
            attachments: uploadedFiles.map(f => ({
              file_url: f.file_url,
              file_type: f.file_type,
              size_bytes: f.size_bytes,
              name: f.name,
            })),
          }),
        });
      }

      if (!isEditMode) {
        const property = selectedProperty;
        const askingDecision =
          ownerActionMode === 'pending_decision' && costResponsible === 'owner';

        if (askingDecision) {
          // Equipe marcou explicitamente "Aguardar decisão" — dispara o fluxo completo.
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          fetch(`${supabaseUrl}/functions/v1/notify-owner-decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey },
            body: JSON.stringify({ type: 'decision_pending', ticketId }),
          }).catch(err => console.error('Failed to send decision notification:', err));
        } else {
          // Notificação apenas informativa — sem pressionar decisão.
          try {
            await supabase.from('notifications').insert({
              owner_id: property.owner_id,
              type: 'maintenance',
              title: 'Nova manutenção iniciada no seu imóvel',
              message: `${property.name || 'Imóvel'}: ${subject}. O responsável pelo custo ainda será definido pela equipe conforme a natureza do serviço.`,
              reference_id: ticketId,
              reference_url: `/ticket-detalhes/${ticketId}`,
              entity_type: 'ticket',
              entity_id: ticketId,
            });
          } catch (err) {
            console.error('Falha ao criar notificação informativa:', err);
          }
        }
      }

      toast.success(isEditMode ? "Manutenção atualizada!" : "Manutenção criada com sucesso!");
      if (isModal) {
        onSaved?.();
        onClose?.();
      } else {
        navigate(`/admin/manutencoes-lista`);
      }
    } catch (error: any) {
      console.error("Error saving maintenance:", error);
      toast.error(error.message || "Erro ao salvar manutenção");
    } finally {
      setLoading(false);
    }
  };

  const titulo = isEditMode ? "Editar manutenção" : "Nova manutenção";
  const carregando = isEditMode && (loadingTicket || loadingProperties);

  const formulario = carregando ? (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando manutenção">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="property">Imóvel *</Label>
        <Select value={propertyId} onValueChange={setPropertyId} required>
          <SelectTrigger id="property" aria-label="Imóvel">
            <SelectValue placeholder="Selecione o imóvel" />
          </SelectTrigger>
          <SelectContent className="z-50 bg-popover">
            {properties.map((property) => (
              <SelectItem key={property.id} value={property.id}>
                {property.name}
                {property.profiles?.name && ` - ${property.profiles.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Assunto *</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="subject"
              placeholder={isGeneratingTitle ? "Gerando título..." : "Ex: Torneira do banheiro vazando"}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isGeneratingTitle}
              required
            />
            {isGeneratingTitle && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => generateTitle()}
            disabled={isGeneratingTitle || !description.trim()}
            title="Gerar título com IA"
            aria-label="Gerar título com IA"
          >
            {isGeneratingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* A IA preenche a Descrição logo abaixo: por isso fica antes dela. */}
      <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
        <Label htmlFor="aiPrompt" className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Gerar descrição com IA (opcional)
        </Label>
        <div className="flex gap-2">
          <Input
            id="aiPrompt"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Ex: torneira vazando no banheiro da suíte"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                generateDescription();
              }
            }}
          />
          <VoiceToTextInput onTranscript={(text) => setAiPrompt(prev => prev ? `${prev} ${text}` : text)} />
          <Button
            type="button"
            onClick={generateDescription}
            disabled={isGenerating || !aiPrompt.trim()}
            variant="secondary"
            size="icon"
            title="Gerar descrição"
            aria-label="Gerar descrição"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Descreva brevemente o problema, por texto ou voz, e a IA escreve a descrição detalhada.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição *</Label>
        <Textarea
          id="description"
          placeholder="Descreva o problema encontrado..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          required
        />
      </div>

      <div className="space-y-3">
        <Label>Responsável pelo custo *</Label>
        <RadioGroup
          value={costResponsible}
          onValueChange={(v) => setCostResponsible(v as CostResponsibleForm)}
          className="grid grid-cols-2 gap-3"
        >
          {OPCOES_RESPONSAVEL.map((opcao) => (
            <div
              key={opcao.value}
              className={
                opcao.value === "pending"
                  ? "flex items-center space-x-2 rounded-lg border border-muted-foreground/30 bg-muted/40 p-3"
                  : "flex items-center space-x-2 rounded-lg border p-3"
              }
            >
              <RadioGroupItem value={opcao.value} id={`cost-${opcao.value}`} />
              <Label htmlFor={`cost-${opcao.value}`} className="flex flex-1 cursor-pointer items-center gap-1.5 font-normal">
                {opcao.icone}
                {opcao.rotulo}
              </Label>
            </div>
          ))}
        </RadioGroup>

        {costResponsible === 'pending' && (
          <Alert className="border-muted-foreground/30 bg-muted/30">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              O responsável pelo custo ainda <strong>não foi definido</strong>. A manutenção <strong>não será visível</strong> para o proprietário e <strong>nenhuma notificação</strong> será enviada até que a equipe selecione um responsável na lista.
            </AlertDescription>
          </Alert>
        )}

        {costResponsible === 'management' && (
          <Alert className="border-info/30 bg-info/10">
            <AlertTriangle className="h-4 w-4 text-info" />
            <AlertDescription className="text-info">
              Esta manutenção <strong>não será visível</strong> para o proprietário. Use para manutenções internas ou de responsabilidade da gestão.
            </AlertDescription>
          </Alert>
        )}

        {costResponsible === 'guest' && (
          <div className="space-y-3">
            <Alert className="border-warning/30 bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                Esta manutenção <strong>não será visível</strong> para o proprietário. Use para problemas causados por hóspedes ou substituições internas.
              </AlertDescription>
            </Alert>
            <div className="space-y-2 border-l-2 border-warning/30 pl-4">
              <Label htmlFor="guestCheckoutDate">Data de checkout do hóspede *</Label>
              <Input
                id="guestCheckoutDate"
                type="date"
                value={guestCheckoutDate}
                onChange={(e) => setGuestCheckoutDate(e.target.value)}
                required={costResponsible === 'guest'}
              />
              <p className="text-xs text-muted-foreground">
                O lembrete de cobrança aparecerá 14 dias após esta data (regra Airbnb)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modo de decisão: só quando o custo é do proprietário */}
      {costResponsible === 'owner' && (
        <div className="space-y-3">
          <Label>Modo de decisão do proprietário</Label>
          <RadioGroup
            value={ownerActionMode}
            onValueChange={(v) => setOwnerActionMode(v as typeof ownerActionMode)}
            className="space-y-2"
          >
            <div className="flex items-start space-x-2 rounded-lg border p-3">
              <RadioGroupItem value="pending_decision" id="mode-pending" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="mode-pending" className="flex cursor-pointer items-center gap-1.5 font-medium">
                  <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Aguardar decisão (72h)
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  O proprietário terá 72h para decidir se assume a execução ou delega à gestão.
                  Ele será notificado por email e push, com lembrete 24h antes do prazo.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <RadioGroupItem value="essential" id="mode-essential" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="mode-essential" className="flex cursor-pointer items-center gap-1.5 font-medium text-warning">
                  <Siren className="h-4 w-4" aria-hidden="true" />
                  Essencial / Urgente
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Manutenção crítica que precisa ser executada imediatamente (vazamentos,
                  problemas elétricos graves, etc). Não aguarda decisão do proprietário.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-2 rounded-lg border border-info/30 bg-info/10 p-3">
              <RadioGroupItem value="pm_immediate" id="mode-pm" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="mode-pm" className="flex cursor-pointer items-center gap-1.5 font-medium text-info">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  Gestão assume imediatamente
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  A gestão assumirá a execução sem consultar o proprietário.
                  Útil para manutenções pequenas ou já acordadas.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>
      )}

      <div className="space-y-2">
        <Label>Prioridade</Label>
        <RadioGroup value={priority} onValueChange={(v) => setPriority(v as "normal" | "urgente")}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="normal" id="normal" />
            <Label htmlFor="normal" className="cursor-pointer font-normal">
              Normal
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="urgente" id="urgente" />
            <Label htmlFor="urgente" className="cursor-pointer font-normal">
              Urgente
            </Label>
          </div>
        </RadioGroup>
      </div>

      {isEditMode && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" aria-hidden="true" />
            Anexos existentes {existingAttachments.length > 0 && `(${existingAttachments.length})`}
          </Label>
          {loadingAttachments ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-busy="true" aria-label="Carregando anexos">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-md" />
              ))}
            </div>
          ) : existingAttachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum anexo nesta manutenção.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {existingAttachments.map((att) => (
                <div key={att.id} className="group relative aspect-square">
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
                    className="absolute right-1 top-1 z-10 h-7 w-7 p-0 opacity-90 hover:opacity-100"
                    onClick={() => setAttachmentToDelete(att)}
                    title="Excluir anexo"
                    aria-label="Excluir anexo"
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
        <Label htmlFor="files">{isEditMode ? 'Adicionar novos anexos' : 'Anexos (opcional)'}</Label>
        <input
          ref={inputRef}
          id="files"
          type="file"
          multiple
          accept="image/*,video/*,application/pdf,.pdf"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Enviando…" : "Escolher arquivos"}
        </Button>
        <p className="text-xs text-muted-foreground">Fotos, vídeos ou PDF. Vídeos grandes são reduzidos antes do envio.</p>
        {uploadedFiles.length > 0 && (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-muted-foreground">
              {uploadedFiles.length} arquivo(s) pronto(s):
            </p>
            <div className="space-y-1">
              {uploadedFiles.map((file, idx) => (
                <div key={file.file_url} className="flex items-center justify-between rounded-md border border-border/70 px-2.5 py-1.5 text-xs">
                  <span className="truncate">
                    {ROTULO_ANEXO[detectMediaKind(file.file_type, file.name, file.file_url)]} {idx + 1}
                    <span className="text-muted-foreground"> · {(file.size_bytes / 1024).toFixed(0)} KB</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-2 h-6 w-6"
                    onClick={() => removeFile(file.file_url)}
                    aria-label="Remover arquivo"
                    title="Remover arquivo"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={loading || uploading || loadingTicket}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isEditMode ? 'Salvando...' : 'Criando...'}
          </>
        ) : (
          isEditMode ? 'Salvar alterações' : 'Criar manutenção'
        )}
      </Button>
    </form>
  );

  const dialogoExcluirAnexo = (
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
          const ok = await deleteAttachmentRow('ticket_attachments', attachmentToDelete.id);
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

  // Dentro do diálogo de edição só vai o formulário: o título é do diálogo.
  if (isModal) {
    return (
      <div className="px-4 pb-2">
        {formulario}
        {dialogoExcluirAnexo}
      </div>
    );
  }

  return (
    <PaginaInterna
      largura="estreita"
      cabecalho={
        <CabecalhoPagina
          titulo={titulo}
          subtitulo={isEditMode ? "Atualize as informações desta manutenção" : "Registre uma manutenção para um imóvel"}
          icone={<Wrench />}
          tom="primary"
          voltarPara="/admin/manutencoes-lista"
        />
      }
    >
      <Card className="rounded-xl border-border/70 p-4 md:p-6">{formulario}</Card>
      {dialogoExcluirAnexo}
    </PaginaInterna>
  );
}
