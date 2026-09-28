import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CobrancaWhatsappStatus } from "@/components/CobrancaWhatsappStatus";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Calendar,
  DollarSign,
  Paperclip,
  Download,
  Eye,
  FileText,
  Trash2,
  Sparkles,
  X,
  ZoomIn,
  Play,
  Loader2,
  Copy,
  CreditCard,
  Pencil,
  MoreHorizontal,
  Building2,
  Tag,
  Wrench,
  Clock,
  CheckCircle2,
  ExternalLink,
  Link2,
  MessageSquare,
  Zap,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AuthenticatedImage, VideoThumbnail } from "@/components/AuthenticatedMedia";
import { MediaGallery } from "@/components/MediaGallery";
import { preloadMediaUrls } from "@/hooks/useMediaCache";
import { deleteAttachmentRow } from "@/lib/deleteAttachment";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import JSZip from "jszip";
import { buildZipEntryNameFromBlob } from "@/lib/zipFileName";

import { CHARGE_CATEGORIES } from "@/constants/chargeCategories";
import { EditChargeDialog } from "@/components/EditChargeDialog";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import { emParaleloOuFalha } from "@/lib/fileUpload";
import { MaintenanceServiceLog } from "@/components/MaintenanceServiceLog";
import type { MaintenanceNote } from "@/hooks/useMaintenances";
import { fetchChargeGalleryAttachments, type GalleryAttachment } from "@/lib/chargeAttachments";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { BotaoLinha, CaixaOperacao, SeloContagem } from "@/components/painel/CaixaOperacao";
import { Definicao, ListaDefinicoes } from "@/components/painel/Definicoes";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { EtiquetaStatusCobranca } from "@/components/cobrancas/EtiquetaStatusCobranca";
import { ResumoValorCobranca } from "@/components/cobrancas/ResumoValorCobranca";
import { ChatDateDivider } from "@/components/chat/ChatDateDivider";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { ChatFilePreviewRow } from "@/components/chat/ChatFilePreviewRow";
import {
  STATUS_COBRANCA,
  STATUS_COBRANCA_EDITAVEIS,
  estaResolvida,
  formatarBRL,
  formatarData,
  valorDevido,
  type StatusCobranca,
} from "@/lib/cobrancaMeta";
import { estaVencida } from "@/lib/vencimento";
import { cn } from "@/lib/utils";
import { nomeAnonimoAnexo } from "@/lib/zipFileName";
import { renderizarCorpo } from "@/components/chat/CorpoMensagem";

interface Charge {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  service_type?: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  credit_applied_cents?: number | null;
  currency: string;
  due_date: string | null;
  maintenance_date: string | null;
  status: string;
  payment_link_url: string | null;
  payment_link: string | null;
  pix_qr_code?: string | null;
  pix_qr_code_base64?: string | null;
  created_at: string;
  paid_at?: string | null;
  ticket_id?: string | null;
  owner_id: string;
  property_id: string | null;
  profiles: {
    name: string;
    photo_url: string | null;
  };
  property?: {
    name: string;
  };
}

interface ChargeMessage {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  is_internal: boolean;
  profiles: {
    name: string;
    photo_url: string | null;
    role: string;
  };
  attachments?: ChargeMessageAttachment[];
}

interface ChargeMessageAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
}

interface ChargeAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  poster_path: string | null;
  width?: number;
  height?: number;
  duration_sec?: number;
}

interface MediaItem {
  id: string;
  file_url: string;
  file_name?: string | null;
  file_type?: string | null;
  size_bytes?: number | null;
}

/** Impacto no score do proprietário ao mudar o status à mão (CLAUDE.md §3.2). */
const SCORE_POR_STATUS: Partial<Record<StatusCobranca, number>> = {
  pago_antecipado: 5,
  pago_no_vencimento: 1,
  pago_com_atraso: -15,
  debited: -30,
};

const rotuloScore = (status: StatusCobranca) => {
  const pontos = SCORE_POR_STATUS[status];
  if (!pontos) return "";
  return ` (${pontos > 0 ? "+" : ""}${pontos} pts)`;
};

/** Rótulo genérico do anexo: o nome real nunca aparece na interface (regra nº 4). */
const rotuloAnexo = (mime: string | null | undefined) =>
  mime?.startsWith("image/") ? "Imagem" : mime?.startsWith("video/") ? "Vídeo" : mime === "application/pdf" ? "PDF" : "Documento";

const formatarTamanho = (bytes: number | null | undefined) => {
  if (!bytes) return null;
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const formatarDataHora = (iso: string) => format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

export default function CobrancaDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [charge, setCharge] = useState<Charge | null>(null);
  const [serviceNotes, setServiceNotes] = useState<MaintenanceNote[]>([]);
  const [messages, setMessages] = useState<ChargeMessage[]>([]);
  const [attachments, setAttachments] = useState<ChargeAttachment[]>([]);
  const [inheritedAttachments, setInheritedAttachments] = useState<GalleryAttachment[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [allMediaItems, setAllMediaItems] = useState<MediaItem[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [messageGalleryOpen, setMessageGalleryOpen] = useState(false);
  const [messageGalleryIndex, setMessageGalleryIndex] = useState(0);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [generatingPaymentLink, setGeneratingPaymentLink] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewAsOwner, setPreviewAsOwner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTeamMemberRaw = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';
  // Quando equipe ativa "Ver como proprietário", a UI renderiza igual ao que o proprietário enxerga
  const isTeamMember = isTeamMemberRaw && !previewAsOwner;
  const ehAdmin = profile?.role === 'admin';
  // Voltar leva à lista de quem está logado, mesmo durante a visão do proprietário.
  const voltarPara = isTeamMemberRaw ? "/gerenciar-cobrancas" : "/minhas-cobrancas";

  // Read receipts for messages
  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { receipts, markAsRead } = useReadReceipts(messageIds, "charge");

  // Mark messages as read when viewing the page
  useEffect(() => {
    if (messages.length > 0 && user) {
      const otherMessages = messages
        .filter(m => m.author_id !== user.id)
        .map(m => m.id);
      if (otherMessages.length > 0) {
        markAsRead(otherMessages);
      }
    }
  }, [messages, user, markAsRead]);

  useEffect(() => {
    fetchChargeData();

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`charge-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'charge_messages',
          filter: `charge_id=eq.${id}`
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchChargeData = async () => {
    try {
      const { data: chargeData, error: chargeError } = await supabase
        .from('charges')
        .select(`
          *,
          profiles!charges_owner_id_fkey (name, photo_url),
          properties (name)
        `)
        .eq('id', id)
        .single();

      if (chargeError) throw chargeError;

      // Flatten the property object
      const enrichedCharge = {
        ...chargeData,
        property: chargeData.properties
      };

      setCharge(enrichedCharge);

      // Preserva o registro escrito pela equipe no ticket de origem
      if ((chargeData as any).ticket_id) {
        const { data: notes } = await supabase
          .from('ticket_messages')
          .select('id, body, created_at, is_internal, author:profiles!ticket_messages_author_id_fkey(name, photo_url, role)')
          .eq('ticket_id', (chargeData as any).ticket_id)
          .order('created_at', { ascending: true });
        setServiceNotes(
          ((notes as any[]) || []).map((m) => ({
            id: m.id,
            body: m.body,
            created_at: m.created_at,
            is_internal: !!m.is_internal,
            author: m.author ?? null,
          }))
        );
      } else {
        setServiceNotes([]);
      }

      await Promise.all([
        fetchMessages(),
        fetchAttachments((chargeData as any).ticket_id)
      ]);

      // Auto-regenerar link/PIX se a cobrança está vencida e ainda não foi resolvida.
      // Isso garante que vencidas sempre tenham um link válido pronto pra usar.
      const isUnpaid = !estaResolvida(enrichedCharge.status);
      const isOverdue = estaVencida(enrichedCharge.due_date, enrichedCharge.status);
      const hasExistingLink = !!enrichedCharge.payment_link;

      if (isUnpaid && isOverdue && hasExistingLink) {
        // Fire-and-forget: não bloqueia a UI
        supabase.functions
          .invoke('create-mercadopago-payment', { body: { chargeId: id } })
          .then(({ data, error }) => {
            if (error) {
              console.error('[CobrancaDetalhes] Erro ao auto-regenerar link:', error);
              return;
            }
            if (data?.payment_link && data.payment_link !== enrichedCharge.payment_link) {
              // Recarrega só a charge (não as mensagens) para refletir o novo link
              supabase
                .from('charges')
                .select('*, profiles!charges_owner_id_fkey (name, photo_url), properties (name)')
                .eq('id', id)
                .single()
                .then(({ data: refreshed }) => {
                  if (refreshed) {
                    setCharge({ ...refreshed, property: refreshed.properties } as any);
                  }
                });
            }
          });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar cobrança",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    const { data: messagesData, error } = await supabase
      .from('charge_messages')
      .select(`
        id,
        charge_id,
        author_id,
        body,
        is_internal,
        created_at,
        profiles!charge_messages_author_id_fkey (
          id,
          name,
          photo_url,
          role
        )
      `)
      .eq('charge_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar mensagens:', error);
      toast({
        title: "Erro ao carregar mensagens",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    if (messagesData) {
      // Buscar anexos de cada mensagem
      const messagesWithAttachments = await Promise.all(
        messagesData.map(async (msg) => {
          const { data: attachments } = await supabase
            .from('charge_message_attachments')
            .select('*')
            .eq('message_id', msg.id)
            .order('created_at', { ascending: true });

          return {
            ...msg,
            profiles: msg.profiles || null,
            attachments: attachments || []
          };
        })
      );

      setMessages(messagesWithAttachments);
    }
  };

  const fetchAttachments = async (ticketId?: string | null) => {
    const { data, error } = await supabase
      .from('charge_attachments')
      .select('id, file_name, file_path, file_size, mime_type, poster_path, width, height, duration_sec')
      .eq('charge_id', id);

    if (error) return;

    const rows = data || [];
    setAttachments(rows);

    // Prepare media gallery items
    let mediaItems: MediaItem[] = rows
      .filter(att => isImageFile(att) || isVideoFile(att))
      .map((att, i) => ({
        id: att.id,
        file_url: getAttachmentUrl(att),
        file_name: nomeAnonimoAnexo(att.file_name, att.mime_type, i),
        file_type: att.mime_type,
        size_bytes: att.file_size
      }));

    // Fallback: cobrança sem anexos próprios herda os anexos do ticket de origem
    let inherited: GalleryAttachment[] = [];
    if (rows.length === 0 && ticketId) {
      const grouped = await fetchChargeGalleryAttachments([{ id: id as string, ticket_id: ticketId }]);
      inherited = grouped[id as string] || [];
      mediaItems = inherited
        .filter(a => a.file_type?.startsWith('image/') || a.file_type?.startsWith('video/'))
        .map((a, i) => ({
          id: a.id,
          file_url: a.file_url,
          file_name: nomeAnonimoAnexo(a.file_name, a.file_type, i),
          file_type: a.file_type,
        }));
    }
    setInheritedAttachments(inherited);

    setAllMediaItems(mediaItems);

    // Preload all media URLs for faster gallery experience
    preloadMediaUrls(mediaItems.map(item => item.file_url));
  };

  const getAttachmentUrl = (attachment: ChargeAttachment) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/serve-attachment/${attachment.id}/file`;
  };

  const getPosterUrl = (attachment: ChargeAttachment) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/serve-attachment/${attachment.id}/poster`;
  };

  /** Lista unificada (anexos próprios ou herdados do ticket) para download em lote e arquivos. */
  const allAttachmentFiles = useMemo(() => {
    const base = import.meta.env.VITE_SUPABASE_URL;
    if (attachments.length > 0) {
      return attachments.map((a) => ({
        id: a.id,
        file_name: a.file_name || 'anexo',
        mime: a.mime_type || '',
        size: a.file_size,
        download_url: `${base}/functions/v1/serve-attachment/${a.id}`,
      }));
    }
    return inheritedAttachments.map((a) => ({
      id: a.id,
      file_name: a.file_name || 'anexo',
      mime: a.file_type || '',
      size: null as number | null,
      download_url: a.file_url,
    }));
  }, [attachments, inheritedAttachments]);

  const docFiles = useMemo(
    () => allAttachmentFiles.filter((f) => !f.mime.startsWith('image/') && !f.mime.startsWith('video/')),
    [allAttachmentFiles],
  );

  /** Fotos e vídeos das mensagens, na ordem em que aparecem, para a galeria. */
  const messageMediaItems = useMemo(() => {
    const base = import.meta.env.VITE_SUPABASE_URL;
    const items: MediaItem[] = [];
    messages.forEach((m) =>
      (m.attachments || []).forEach((a) => {
        if (a.mime_type?.startsWith('image/') || a.mime_type?.startsWith('video/')) {
          items.push({
            id: a.id,
            file_url: `${base}/functions/v1/serve-attachment/${a.id}/file`,
            file_name: nomeAnonimoAnexo(a.file_name, a.mime_type, items.length),
            file_type: a.mime_type,
            size_bytes: a.file_size,
          });
        }
      }),
    );
    return items;
  }, [messages]);

  const abrirGaleriaMensagem = (attachmentId: string) => {
    const idx = messageMediaItems.findIndex((item) => item.id === attachmentId);
    if (idx === -1) return;
    setMessageGalleryIndex(idx);
    setMessageGalleryOpen(true);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(file => {
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (file.size > maxSize) {
        toast({
          title: "Arquivo muito grande",
          description: `${file.name} excede o limite de 20MB`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
    event.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && selectedFiles.length === 0) return;

    try {
      setSending(true);
      setUploading(true);

      // Criar mensagem primeiro
      const { data: messageData, error: messageError } = await supabase
        .from('charge_messages')
        .insert({
          charge_id: id,
          author_id: user?.id,
          body: newMessage || '(anexos)',
          is_internal: false
        })
        .select()
        .single();

      if (messageError) throw messageError;

      // Upload de anexos e associação com a mensagem
      // Até 3 arquivos ao mesmo tempo.
      await emParaleloOuFalha(selectedFiles, async (file, indiceArquivo) => {
        // Compress video if it's a video file
        const processedFile = await processFileForUpload(file);
        const filePath = `charges/${id}/messages/${Date.now()}-${indiceArquivo}_${processedFile.name}`;

        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, processedFile);

        if (uploadError) throw uploadError;

        const { error: attachmentError } = await supabase
          .from('charge_message_attachments')
          .insert({
            message_id: messageData.id,
            charge_id: id,
            file_name: processedFile.name,
            file_path: filePath,
            file_size: processedFile.size,
            mime_type: processedFile.type,
            created_by: user?.id
          });

        if (attachmentError) throw attachmentError;
      });

      setNewMessage("");
      setSelectedFiles([]);
      await fetchMessages();

      // Enviar notificação
      try {
        await supabase.functions.invoke('notify-charge-message', {
          body: {
            messageId: messageData.id,
            chargeId: id
          }
        });
      } catch (notifyError) {
        console.error('Erro ao enviar notificação:', notifyError);
      }

      toast({
        title: "Mensagem enviada",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  // Enter envia; Shift+Enter quebra linha (igual ao ChargeChatDialog).
  const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const generateAIResponse = async () => {
    if (!aiPrompt.trim()) {
      toast({
        title: "Digite um comando",
        description: "Digite ou grave um comando para a IA gerar a resposta",
        variant: "destructive",
      });
      return;
    }

    try {
      setGeneratingAI(true);

      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: {
          templateKey: 'charge_response',
          chargeId: id,
          customInstructions: aiPrompt
        }
      });

      if (error) throw error;

      setNewMessage(data.text);
      setAiPrompt("");
      toast({
        title: "Resposta gerada",
        description: "Revise e edite se necessário antes de enviar.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao gerar resposta",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingAI(false);
    }
  };

  const downloadAllAttachments = async () => {
    if (downloadingAll) return;

    try {
      setDownloadingAll(true);

      const files = allAttachmentFiles;
      if (files.length === 0) {
        toast({
          title: "Nenhum anexo encontrado",
          variant: "destructive",
        });
        setDownloadingAll(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const zip = new JSZip();
      let successCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const response = await fetch(file.download_url, {
            headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
          });
          if (response.ok) {
            const blob = await response.blob();
            zip.file(await buildZipEntryNameFromBlob(i, blob, file.file_name, file.mime, file.download_url), blob);
            successCount++;
          }
        } catch (error) {
          console.error(`Erro ao processar arquivo ${i + 1}:`, error);
        }
      }

      if (successCount === 0) {
        toast({
          title: "Erro ao baixar",
          description: "Nenhum arquivo pôde ser processado",
          variant: "destructive",
        });
        setDownloadingAll(false);
        return;
      }

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      const fileName = `cobranca-${id?.substring(0, 8)}-anexos.zip`;

      // Método tradicional de download - otimizado para mobile
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;

      link.style.display = 'none';
      document.body.appendChild(link);

      try {
        link.click();

        const event = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        link.dispatchEvent(event);
      } catch (e) {
        console.error('Erro ao clicar:', e);
      }

      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (link.parentNode) {
          document.body.removeChild(link);
        }
      }, 3000);

      toast({
        title: "Download iniciado",
        description: `${successCount} arquivo(s) compactados`,
      });

    } catch (error: any) {
      console.error('Erro ao baixar anexos:', error);
      toast({
        title: "Erro ao baixar",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setDownloadingAll(false);
    }
  };

  const downloadMessageAttachments = async (messageAttachments: ChargeMessageAttachment[], messageName: string) => {
    try {
      if (messageAttachments.length === 0) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Sessão não encontrada");
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const zip = new JSZip();
      let successCount = 0;

      for (let i = 0; i < messageAttachments.length; i++) {
        const attachment = messageAttachments[i];

        try {
          const downloadUrl = `${SUPABASE_URL}/functions/v1/serve-attachment/${attachment.id}`;

          const response = await fetch(downloadUrl, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });

          if (response.ok) {
            const blob = await response.blob();
            zip.file(await buildZipEntryNameFromBlob(i, blob, attachment.file_name, attachment.mime_type || undefined, downloadUrl), blob);
            successCount++;
          }
        } catch (error) {
          console.error(`Erro ao processar arquivo ${i + 1}:`, error);
        }
      }

      if (successCount === 0) {
        toast({
          title: "Erro ao baixar",
          description: "Nenhum arquivo pôde ser processado",
          variant: "destructive",
        });
        return;
      }

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${messageName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Download concluído",
        description: `${successCount} arquivo(s) baixado(s)`,
      });
    } catch (error: any) {
      console.error('Erro ao baixar anexos da mensagem:', error);
      toast({
        title: "Erro ao baixar anexos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const isImageFile = (attachment: ChargeAttachment) => {
    return attachment.mime_type?.startsWith('image/') || false;
  };

  const isVideoFile = (attachment: ChargeAttachment) => {
    return attachment.mime_type?.startsWith('video/') || false;
  };

  const handleGeneratePaymentLink = async () => {
    try {
      setGeneratingPaymentLink(true);

      const { error } = await supabase.functions.invoke('create-mercadopago-payment', {
        body: { chargeId: id }
      });

      if (error) throw error;

      // Atualizar charge local
      await fetchChargeData();

      toast({
        title: "Link de pagamento criado",
        description: "O link já está disponível na cobrança.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao gerar link",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingPaymentLink(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!charge || newStatus === charge.status) return;

    try {
      setUpdatingStatus(true);

      // Get current profile score
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('payment_score')
        .eq('id', charge.owner_id)
        .single();

      if (profileError) throw profileError;

      let currentScore = profileData?.payment_score ?? 50;

      // Check if there's an existing score record for this charge
      const { data: existingScoreRecord } = await supabase
        .from('owner_payment_scores')
        .select('*')
        .eq('charge_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // If there was a previous score change for this charge, reverse it first
      if (existingScoreRecord) {
        const reversedScore = Math.max(0, Math.min(100, currentScore - existingScoreRecord.points_change));

        // Record the reversal
        await supabase.from('owner_payment_scores').insert({
          owner_id: charge.owner_id,
          charge_id: id,
          score_before: currentScore,
          score_after: reversedScore,
          points_change: -existingScoreRecord.points_change,
          reason: `status_reversal_from_${charge.status}`
        });

        currentScore = reversedScore;

        // Update profile with reversed score
        await supabase
          .from('profiles')
          .update({ payment_score: reversedScore })
          .eq('id', charge.owner_id);
      }

      // Apply new score change if applicable
      const newScoreChange = SCORE_POR_STATUS[newStatus as StatusCobranca] || 0;
      if (newScoreChange !== 0) {
        const newScore = Math.max(0, Math.min(100, currentScore + newScoreChange));

        // Determine reason based on new status
        let reason = 'status_change';
        if (newStatus === 'pago_antecipado') reason = 'early_payment';
        else if (newStatus === 'pago_no_vencimento') reason = 'on_time_payment';
        else if (newStatus === 'pago_com_atraso') reason = 'late_payment';
        else if (newStatus === 'debited') reason = 'reserve_debit';

        // Record the new score change
        await supabase.from('owner_payment_scores').insert({
          owner_id: charge.owner_id,
          charge_id: id,
          score_before: currentScore,
          score_after: newScore,
          points_change: newScoreChange,
          reason
        });

        // Update profile with new score
        await supabase
          .from('profiles')
          .update({ payment_score: newScore })
          .eq('id', charge.owner_id);
      }

      // Update charge status and paid_at/debited_at timestamps
      const updateData: any = { status: newStatus };

      if (['pago_antecipado', 'pago_no_vencimento', 'pago_com_atraso'].includes(newStatus)) {
        updateData.paid_at = new Date().toISOString();
        updateData.debited_at = null;
      } else if (newStatus === 'debited') {
        updateData.debited_at = new Date().toISOString();
        updateData.paid_at = null;
      } else {
        updateData.paid_at = null;
        updateData.debited_at = null;
      }

      const { error: updateError } = await supabase
        .from('charges')
        .update(updateData)
        .eq('id', id);

      if (updateError) throw updateError;

      await fetchChargeData();

      toast({
        title: "Status atualizado",
        description: newScoreChange !== 0
          ? `Score do proprietário atualizado (${newScoreChange > 0 ? '+' : ''}${newScoreChange} pontos)`
          : "Status da cobrança atualizado.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    // Only admins can delete
    if (profile?.role !== 'admin') {
      toast({
        title: "Permissão negada",
        description: "Apenas administradores podem excluir cobranças",
        variant: "destructive",
      });
      return;
    }

    try {
      setDeleting(true);

      // Delete charge (cascade will delete messages and attachments)
      const { error } = await supabase
        .from('charges')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Cobrança excluída",
        description: "A cobrança foi excluída.",
      });

      navigate(voltarPara, { replace: true });
    } catch (error: any) {
      toast({
        title: "Erro ao excluir cobrança",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const copiar = (texto: string, titulo: string) => {
    navigator.clipboard.writeText(texto);
    toast({ title: titulo });
  };

  // Mensagens agrupadas por dia, para o divisor "Hoje / Ontem / 12 de maio".
  const mensagensPorDia = useMemo(() => {
    const grupos: Record<string, ChargeMessage[]> = {};
    messages.forEach((m) => {
      const dia = format(new Date(m.created_at), "yyyy-MM-dd");
      (grupos[dia] ||= []).push(m);
    });
    return Object.entries(grupos);
  }, [messages]);

  if (loading) {
    return <LoadingScreen message="Carregando cobrança..." />;
  }

  if (!charge) {
    return (
      <PaginaInterna
        largura="media"
        comNavInferior
        cabecalho={<CabecalhoPagina titulo="Cobrança" icone={<DollarSign />} tom="success" voltarPara={voltarPara} />}
      >
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="cobrancas"
            title="Cobrança não encontrada"
            description="Ela pode ter sido excluída ou você não tem acesso a ela."
            action={<Button onClick={() => navigate(voltarPara, { replace: true })}>Voltar para as cobranças</Button>}
          />
        </Card>
      </PaginaInterna>
    );
  }

  const resolvida = estaResolvida(charge.status);
  const vencida = !resolvida && estaVencida(charge.due_date, charge.status);
  const devido = valorDevido(charge);
  const categoria = charge.category
    ? CHARGE_CATEGORIES[charge.category as keyof typeof CHARGE_CATEGORIES] || charge.category
    : null;
  // O Select precisa conter o status atual mesmo quando ele não é editável (ex.: "paid" vindo do webhook).
  const opcoesStatus: StatusCobranca[] = STATUS_COBRANCA_EDITAVEIS.includes(charge.status as StatusCobranca)
    ? STATUS_COBRANCA_EDITAVEIS
    : [charge.status as StatusCobranca, ...STATUS_COBRANCA_EDITAVEIS];
  const totalAnexos = allAttachmentFiles.length;
  const arquivosEnviando = uploading ? new Set(selectedFiles.map((f) => f.name)) : new Set<string>();

  const subtituloCabecalho = [charge.property?.name, charge.profiles?.name].filter(Boolean).join(" · ") || undefined;

  const acoesCabecalho = isTeamMember ? (
    <>
      <Button variant="outline" size="sm" className="h-9" onClick={() => setEditDialogOpen(true)} aria-label="Editar cobrança">
        <Pencil className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Editar</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-50 bg-popover">
          <DropdownMenuItem onClick={() => setPreviewAsOwner(true)}>
            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
            Ver como proprietário
          </DropdownMenuItem>
          {ehAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Excluir cobrança
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  ) : undefined;

  return (
    <PaginaInterna
      largura="media"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo={charge.title}
          subtitulo={subtituloCabecalho}
          icone={<DollarSign />}
          tom="success"
          voltarPara={voltarPara}
          acoes={acoesCabecalho}
        />
      }
    >
      {isTeamMemberRaw && previewAsOwner && (
        <div className="-mt-4 flex flex-wrap items-center justify-center gap-2 rounded-b-lg bg-warning px-3 py-1.5 text-center text-xs font-medium text-warning-foreground md:-mt-6">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Visão do proprietário</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewAsOwner(false)}
            className="h-6 border-warning-foreground/40 bg-transparent text-xs text-warning-foreground hover:bg-warning-foreground/10 hover:text-warning-foreground"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Sair
          </Button>
        </div>
      )}

      {/* Bloco principal */}
      <CaixaOperacao
        icone={<DollarSign />}
        titulo="Cobrança"
        tom="success"
        selos={<EtiquetaStatusCobranca status={charge.status} tamanho="md" />}
        acoes={
          isTeamMember ? (
            <Select value={charge.status} onValueChange={handleStatusChange} disabled={updatingStatus}>
              <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Alterar status da cobrança">
                {updatingStatus ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Atualizando…
                  </span>
                ) : (
                  <SelectValue placeholder="Alterar status" />
                )}
              </SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                {opcoesStatus.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_COBRANCA[s]?.rotulo ?? s}
                    {rotuloScore(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {charge.description && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{charge.description}</p>
          )}

          {/* Notificação por WhatsApp — só equipe; reenvio só admin */}
          {isTeamMember && charge.status !== "draft" && (
            <CobrancaWhatsappStatus
              cobrancaId={charge.id}
              status={(charge as any).whatsapp_status as "enviado" | "falhou" | "desativado" | null}
              enviadoEm={(charge as any).whatsapp_enviado_em}
              erro={(charge as any).whatsapp_erro}
              podeReenviar={ehAdmin}
              onAtualizado={fetchChargeData}
            />
          )}

          <ListaDefinicoes colunas={2}>
            <Definicao rotulo="Imóvel" icone={<Building2 />} valor={charge.property?.name} />
            <Definicao rotulo="Categoria" icone={<Tag />} valor={categoria} />
            {charge.service_type && <Definicao rotulo="Tipo de serviço" icone={<Wrench />} valor={charge.service_type} />}
            <Definicao
              rotulo="Vencimento"
              icone={<Calendar />}
              valor={
                charge.due_date ? (
                  <span className={cn("tabular-nums", vencida && "font-semibold text-destructive")}>
                    {formatarData(charge.due_date)}
                    {vencida && " · vencida"}
                  </span>
                ) : undefined
              }
            />
            {charge.maintenance_date && (
              <Definicao rotulo="Data do serviço" icone={<Wrench />} valor={formatarData(charge.maintenance_date)} />
            )}
            <Definicao rotulo="Criada em" icone={<Clock />} valor={formatarDataHora(charge.created_at)} />
            {charge.paid_at && <Definicao rotulo="Paga em" icone={<CheckCircle2 />} valor={formatarDataHora(charge.paid_at)} />}
          </ListaDefinicoes>

          <ResumoValorCobranca cobranca={charge} variante="completo" />

          {/* Link de pagamento — equipe, só enquanto a cobrança não está resolvida */}
          {isTeamMember && !resolvida && (
            <div className="rounded-lg border border-success/30 bg-success/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    Link Mercado Pago
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {charge.payment_link ? "Link gerado: cartão ou PIX." : "Gere o link para pagamento online."}
                  </p>
                </div>
                {charge.payment_link ? (
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => window.open(charge.payment_link!, '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      Abrir
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Copiar link de pagamento"
                      onClick={() => copiar(charge.payment_link!, "Link copiado")}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" className="h-8 text-xs" onClick={handleGeneratePaymentLink} disabled={generatingPaymentLink}>
                    {generatingPaymentLink ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {generatingPaymentLink ? "Gerando…" : "Gerar link"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </CaixaOperacao>

      {/* Opções de pagamento — proprietário, só enquanto a cobrança não está resolvida */}
      {!isTeamMember && charge.payment_link && !resolvida && (
        <CaixaOperacao
          icone={<CreditCard />}
          titulo="Pagamento"
          tom="primary"
          subcabecalho={<p className="text-xs text-muted-foreground">PIX à vista ou cartão em até 12x pelo Mercado Pago.</p>}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {charge.pix_qr_code_base64 && (
              <div className="rounded-xl border border-success/30 bg-success/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success" aria-hidden="true">
                    <Zap className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">PIX</p>
                    <p className="text-xs text-muted-foreground">À vista, aprovação imediata</p>
                  </div>
                </div>
                {/* Fundo branco atrás do QR: única exceção de cor crua, para o leitor conseguir ler o código. */}
                <div className="flex justify-center rounded-lg border bg-white p-3">
                  <img src={`data:image/png;base64,${charge.pix_qr_code_base64}`} alt="QR Code do PIX" className="h-48 w-48" />
                </div>
                <p className="mt-2 text-center text-sm">
                  Valor <span className="font-semibold tabular-nums">{formatarBRL(devido)}</span>
                </p>
                {charge.pix_qr_code && (
                  <Button className="mt-2 w-full" variant="outline" onClick={() => copiar(charge.pix_qr_code!, "Código PIX copiado")}>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copiar código PIX
                  </Button>
                )}
              </div>
            )}

            <div className="rounded-xl border border-info/30 bg-info/10 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info" aria-hidden="true">
                  <CreditCard className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Cartão de crédito</p>
                  <p className="text-xs text-muted-foreground">Parcele em até 12x com juros</p>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-dashed border-info/30 bg-muted p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Valor a pagar</span>
                  <span className="text-lg font-bold tabular-nums">{formatarBRL(devido)}</span>
                </div>
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  <li>Parcele em até 12x no cartão</li>
                  <li>Aceita os principais cartões</li>
                  <li>Pagamento seguro pelo Mercado Pago</li>
                </ul>
              </div>
              <Button className="mt-3 w-full" size="lg" onClick={() => window.open(charge.payment_link!, '_blank')}>
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                Pagar com Mercado Pago
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => copiar(charge.payment_link!, "Link copiado")}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copiar link de pagamento
              </Button>
            </div>
          </div>
        </CaixaOperacao>
      )}

      {/* Anexos da cobrança */}
      {totalAnexos > 0 && (
        <CaixaOperacao
          icone={<Paperclip />}
          titulo="Anexos"
          selos={
            <>
              <SeloContagem>{totalAnexos}</SeloContagem>
              {attachments.length === 0 && inheritedAttachments.length > 0 && <Etiqueta tom="neutral">Do atendimento</Etiqueta>}
            </>
          }
          acoes={
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadAllAttachments} disabled={downloadingAll}>
              {downloadingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {downloadingAll ? "Compactando…" : "Baixar todos (.zip)"}
            </Button>
          }
        >
          {/* Mídia em grade — visível sem precisar arrastar */}
          {allMediaItems.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {allMediaItems.map((item, idx) => {
                const isImg = item.file_type?.startsWith('image/');
                const attachment = attachments.find(a => a.id === item.id);
                const posterUrl = attachment?.poster_path ? getPosterUrl(attachment) : undefined;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Abrir ${isImg ? "imagem" : "vídeo"} ${idx + 1} de ${allMediaItems.length}`}
                    onClick={() => {
                      setGalleryStartIndex(idx);
                      setGalleryOpen(true);
                    }}
                  >
                    {isImg ? (
                      <AuthenticatedImage src={item.file_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <VideoThumbnail src={item.file_url} posterSrc={posterUrl} className="h-full w-full" />
                    )}
                    {/* Indicador sempre visível: não depende de hover (toque no celular). */}
                    <span
                      className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-background/85 text-foreground shadow-sm"
                      aria-hidden="true"
                    >
                      {isImg ? <ZoomIn className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Arquivos (PDF e outros), sem o nome real */}
          {docFiles.length > 0 && (
            <div className={cn("grid gap-2 sm:grid-cols-2", allMediaItems.length > 0 && "mt-3")}>
              {docFiles.map((file, i) => {
                const tamanho = formatarTamanho(file.size);
                return (
                  <div key={file.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <FileText className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {rotuloAnexo(file.mime)} {docFiles.length > 1 ? i + 1 : ""}
                      </p>
                      {tamanho && <p className="text-[11px] text-muted-foreground">{tamanho}</p>}
                    </div>
                    <BotaoLinha rotulo={`Baixar ${rotuloAnexo(file.mime).toLowerCase()} ${i + 1}`} onClick={() => window.open(file.download_url, '_blank')}>
                      <Download />
                    </BotaoLinha>
                  </div>
                );
              })}
            </div>
          )}
        </CaixaOperacao>
      )}

      <MaintenanceServiceLog notes={serviceNotes} isTeam={isTeamMember} />

      {/* Mensagens */}
      <CaixaOperacao
        icone={<MessageSquare />}
        titulo="Mensagens"
        tom="info"
        selos={messages.length > 0 ? <SeloContagem>{messages.length}</SeloContagem> : undefined}
        semPadding
      >
        <div className="bg-muted/20 px-3 pb-3">
          {messages.length === 0 ? (
            <ChatEmptyState description="Envie uma mensagem sobre esta cobrança. A conversa acontece em tempo real." />
          ) : (
            mensagensPorDia.map(([dia, mensagensDoDia]) => (
              <div key={dia}>
                <ChatDateDivider date={dia} />
                {mensagensDoDia.map((message, index) => {
                  const isOwnMessage = message.author_id === user?.id;
                  const messageReceipts = receipts[message.id] || [];
                  const prev = mensagensDoDia[index - 1];
                  const grouped =
                    !!prev &&
                    prev.author_id === message.author_id &&
                    new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
                  const temTexto = !!message.body && message.body !== '(anexos)';
                  const anexos = message.attachments || [];

                  return (
                    <ChatMessageBubble
                      key={message.id}
                      authorName={message.profiles?.name}
                      authorPhoto={message.profiles?.photo_url}
                      authorRole={message.profiles?.role}
                      createdAt={message.created_at}
                      isOwn={isOwnMessage}
                      isInternal={message.is_internal}
                      receipts={messageReceipts}
                      grouped={grouped}
                      body={
                        temTexto ? renderizarCorpo(message.body, "leading-relaxed") : undefined
                      }
                      attachments={
                        anexos.length > 0 ? (
                          <div className="space-y-1.5">
                            {anexos.length > 1 && (
                              <div className={cn("flex", isOwnMessage ? "justify-end" : "justify-start")}>
                                <BotaoLinha
                                  rotulo="Baixar todos os anexos desta mensagem"
                                  texto="Baixar todos"
                                  onClick={() =>
                                    downloadMessageAttachments(
                                      anexos,
                                      `anexos-${format(new Date(message.created_at), "dd-MM-yyyy-HH-mm")}`,
                                    )
                                  }
                                >
                                  <Download />
                                </BotaoLinha>
                              </div>
                            )}
                            <div className={cn("grid gap-1.5", anexos.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                              {anexos.map((attachment, i) => {
                                const isImage = attachment.mime_type?.startsWith('image/');
                                const isVideo = attachment.mime_type?.startsWith('video/');
                                const attachmentUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-attachment/${attachment.id}/file`;

                                if (isImage || isVideo) {
                                  return (
                                    <button
                                      key={attachment.id}
                                      type="button"
                                      className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      aria-label={`Abrir ${isImage ? "imagem" : "vídeo"} ${i + 1}`}
                                      onClick={() => abrirGaleriaMensagem(attachment.id)}
                                    >
                                      {isImage ? (
                                        <AuthenticatedImage src={attachmentUrl} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <VideoThumbnail src={attachmentUrl} className="h-full w-full" />
                                      )}
                                      <span
                                        className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-md bg-background/85 text-foreground shadow-sm"
                                        aria-hidden="true"
                                      >
                                        {isImage ? <ZoomIn className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                      </span>
                                    </button>
                                  );
                                }

                                return (
                                  <a
                                    key={attachment.id}
                                    href={attachmentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted p-2 text-center text-xs text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <FileText className="h-6 w-6" aria-hidden="true" />
                                    <span>{rotuloAnexo(attachment.mime_type)}</span>
                                    {formatarTamanho(attachment.file_size) && (
                                      <span className="text-[10px]">{formatarTamanho(attachment.file_size)}</span>
                                    )}
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Compositor */}
        <div className="space-y-2 border-t border-border/60 p-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            disabled={uploading || sending}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
          />

          {isTeamMember && (
            <div className="flex items-end gap-2">
              <VoiceToTextInput
                onTranscript={(text) => setAiPrompt((prev) => (prev ? `${prev} ${text}` : text))}
                disabled={sending || generatingAI}
              />
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    generateAIResponse();
                  }
                }}
                placeholder="Comando para a IA (ex.: explique o motivo da cobrança)"
                aria-label="Comando para a IA gerar a resposta"
                className="max-h-[80px] min-h-[36px] flex-1 resize-none text-sm"
                rows={1}
                disabled={generatingAI}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5"
                onClick={generateAIResponse}
                disabled={sending || generatingAI || !aiPrompt.trim()}
                aria-label="Gerar resposta com IA"
              >
                {generatingAI ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                <span className="hidden text-xs sm:inline">Gerar</span>
              </Button>
            </div>
          )}

          <ChatFilePreviewRow files={selectedFiles} uploading={arquivosEnviando} onRemove={removeFile} />

          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || sending}
              aria-label="Anexar arquivo"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              id="message"
              placeholder="Escreva uma mensagem… (Enter envia, Shift+Enter quebra linha)"
              aria-label="Mensagem"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleMessageKeyDown}
              className="max-h-[140px] min-h-[40px] flex-1 resize-none rounded-xl"
              disabled={sending}
            />
            <Button
              onClick={sendMessage}
              disabled={sending || (!newMessage.trim() && selectedFiles.length === 0)}
              size="icon"
              className="h-10 w-10 shrink-0"
              aria-label="Enviar mensagem"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CaixaOperacao>

      {/* Galeria dos anexos da cobrança */}
      <MediaGallery
        items={allMediaItems}
        initialIndex={galleryStartIndex}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onDelete={isTeamMemberRaw ? async (item) => {
          const ok = await deleteAttachmentRow("charge_attachments", item.id);
          if (ok) fetchAttachments(charge.ticket_id);
        } : undefined}
      />

      {/* Galeria das fotos e vídeos das mensagens */}
      <MediaGallery
        items={messageMediaItems}
        initialIndex={messageGalleryIndex}
        open={messageGalleryOpen}
        onOpenChange={setMessageGalleryOpen}
        onDelete={isTeamMemberRaw ? async (item) => {
          const ok = await deleteAttachmentRow("charge_message_attachments", item.id);
          if (ok) fetchMessages();
        } : undefined}
      />

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Excluir cobrança?"
        description="A exclusão é definitiva e apaga também as mensagens e os anexos desta cobrança."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />

      <EditChargeDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        charge={charge}
        onSuccess={fetchChargeData}
      />
    </PaginaInterna>
  );
}
