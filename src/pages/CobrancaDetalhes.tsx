import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Calendar, DollarSign, Paperclip, Download, Eye, FileText, Image as ImageIcon, Trash2, Sparkles, ChevronDown, X, ZoomIn, Play, Video, Loader2, Copy, CreditCard, Check, Pencil } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Label } from "@/components/ui/label";
import { AuthenticatedImage, AuthenticatedVideo, VideoThumbnail } from "@/components/AuthenticatedMedia";
import { MediaGallery } from "@/components/MediaGallery";
import { preloadMediaUrls } from "@/hooks/useMediaCache";
import { AttachmentBubble } from "@/components/AttachmentBubble";
import { ReadReceiptDisplay } from "@/components/ReadReceiptDisplay";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import JSZip from "jszip";
import { CHARGE_CATEGORIES } from "@/constants/chargeCategories";
import { EditChargeDialog } from "@/components/EditChargeDialog";

interface Charge {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  service_type?: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  currency: string;
  due_date: string | null;
  maintenance_date: string | null;
  status: string;
  payment_link_url: string | null;
  payment_link: string | null;
  pix_qr_code?: string | null;
  pix_qr_code_base64?: string | null;
  created_at: string;
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

export default function CobrancaDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [charge, setCharge] = useState<Charge | null>(null);
  const [messages, setMessages] = useState<ChargeMessage[]>([]);
  const [attachments, setAttachments] = useState<ChargeAttachment[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [allMediaItems, setAllMediaItems] = useState<MediaItem[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [generatingPaymentLink, setGeneratingPaymentLink] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';

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

      await Promise.all([
        fetchMessages(),
        fetchAttachments()
      ]);
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
      console.log('Mensagens carregadas:', messagesData);
      
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
      
      console.log('Mensagens com anexos:', messagesWithAttachments);
      setMessages(messagesWithAttachments);
    }
  };

  const fetchAttachments = async () => {
    const { data, error } = await supabase
      .from('charge_attachments')
      .select('id, file_name, file_path, file_size, mime_type, poster_path, width, height, duration_sec')
      .eq('charge_id', id);

    if (!error && data) {
      setAttachments(data);
      
      // Prepare media gallery items
      const mediaItems: MediaItem[] = data
        .filter(att => isImageFile(att) || isVideoFile(att))
        .map(att => ({
          id: att.id,
          file_url: getAttachmentUrl(att),
          file_name: att.file_name,
          file_type: att.mime_type,
          size_bytes: att.file_size
        }));
      
      setAllMediaItems(mediaItems);
      
      // Preload all media URLs for faster gallery experience
      const urlsToPreload = mediaItems.map(item => item.file_url);
      preloadMediaUrls(urlsToPreload);
    }
  };

  const getAttachmentUrl = (attachment: ChargeAttachment) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/serve-attachment/${attachment.id}/file`;
  };

  const getPosterUrl = (attachment: ChargeAttachment) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/serve-attachment/${attachment.id}/poster`;
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
      for (const file of selectedFiles) {
        const filePath = `charges/${id}/messages/${Date.now()}_${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { error: attachmentError } = await supabase
          .from('charge_message_attachments')
          .insert({
            message_id: messageData.id,
            charge_id: id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            mime_type: file.type,
            created_by: user?.id
          });

        if (attachmentError) throw attachmentError;
      }

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
        title: "Mensagem enviada!",
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

  const [aiPrompt, setAiPrompt] = useState("");

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
        title: "Resposta gerada!",
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


  const downloadAttachment = async (attachmentId: string, fileName: string) => {
    try {
      setSending(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Sessão não encontrada");
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const downloadUrl = `${SUPABASE_URL}/functions/v1/serve-attachment/${attachmentId}/file?download=1`;

      // Download the file
      const response = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Falha ao baixar arquivo");
      }

      // Get the content-type to determine file extension
      const contentType = response.headers.get('content-type');
      let finalFileName = fileName;
      
      // Ensure correct file extension for videos
      if (contentType?.startsWith('video/') && !fileName.match(/\.(mp4|mov|avi|webm)$/i)) {
        const ext = contentType.split('/')[1] || 'mp4';
        finalFileName = `${fileName}.${ext}`;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download iniciado!",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao baixar anexo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const downloadAllAttachments = async () => {
    if (downloadingAll) return;
    
    try {
      setDownloadingAll(true);
      
      if (attachments.length === 0) {
        toast({
          title: "Nenhum anexo encontrado",
          variant: "destructive",
        });
        setDownloadingAll(false);
        return;
      }

      console.log(`📦 Iniciando download de ${attachments.length} arquivos`);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Sessão não encontrada");
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const zip = new JSZip();
      let successCount = 0;
      
      for (let i = 0; i < attachments.length; i++) {
        const attachment = attachments[i];
        
        try {
          console.log(`📥 Processando ${i + 1}/${attachments.length}: ${attachment.file_name}`);
          
          const downloadUrl = `${SUPABASE_URL}/functions/v1/serve-attachment/${attachment.id}`;
          
          const response = await fetch(downloadUrl, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
          
          if (response.ok) {
            const blob = await response.blob();
            zip.file(attachment.file_name, blob);
            successCount++;
            console.log(`✅ ${attachment.file_name} adicionado`);
          }
        } catch (error) {
          console.error(`❌ Erro ao processar arquivo ${i + 1}:`, error);
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

      console.log(`🗜️ Compactando ${successCount} arquivos...`);

      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
      
      console.log(`📦 ZIP gerado: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`);
      
      const fileName = `cobranca-${id?.substring(0, 8)}-anexos.zip`;
      
      // Método tradicional de download - otimizado para mobile
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      
      link.style.display = 'none';
      document.body.appendChild(link);
      
      console.log(`⬇️ Iniciando download: ${fileName}`);
      
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
        title: "✅ Download iniciado!",
        description: `${successCount} arquivo(s) compactados`,
      });
      
    } catch (error: any) {
      console.error('❌ Erro geral:', error);
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
            zip.file(attachment.file_name, blob);
            successCount++;
          }
        } catch (error) {
          console.error(`❌ Erro ao processar arquivo ${i + 1}:`, error);
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
        title: "Download concluído!",
        description: `${successCount} arquivo(s) baixado(s)`,
      });
    } catch (error: any) {
      console.error('❌ Erro geral:', error);
      toast({
        title: "Erro ao baixar anexos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="h-8 w-8 text-primary" />;
    }
    if (mimeType.startsWith('video/')) {
      return <FileText className="h-8 w-8 text-primary" />;
    }
    return <Paperclip className="h-8 w-8 text-muted-foreground" />;
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
      
      const { data, error } = await supabase.functions.invoke('create-mercadopago-payment', {
        body: { chargeId: id }
      });

      if (error) throw error;

      // Atualizar charge local
      await fetchChargeData();

      toast({
        title: "Link de pagamento criado!",
        description: "O link foi criado e já está disponível na cobrança",
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

  // Payment status configuration with score impacts
  const PAYMENT_STATUSES = {
    draft: { label: 'Rascunho', scoreChange: 0 },
    sent: { label: 'Enviada', scoreChange: 0 },
    pago_antecipado: { label: 'Pago antecipado (+5)', scoreChange: 5 },
    pago_no_vencimento: { label: 'Pago no vencimento (+1)', scoreChange: 1 },
    pago_com_atraso: { label: 'Pago com atraso (-15)', scoreChange: -15 },
    debited: { label: 'Debitado em reserva (-30)', scoreChange: -30 },
    cancelled: { label: 'Cancelada', scoreChange: 0 },
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!charge || newStatus === charge.status) return;
    
    const statusConfig = PAYMENT_STATUSES[newStatus as keyof typeof PAYMENT_STATUSES];
    const oldStatusConfig = PAYMENT_STATUSES[charge.status as keyof typeof PAYMENT_STATUSES];
    
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
      const newScoreChange = statusConfig?.scoreChange || 0;
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
        title: "Status atualizado!",
        description: newScoreChange !== 0 
          ? `Score do proprietário foi atualizado (${newScoreChange > 0 ? '+' : ''}${newScoreChange} pontos)`
          : "Status da cobrança atualizado com sucesso",
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
        title: "Cobrança excluída!",
        description: "A cobrança foi excluída com sucesso",
      });

      navigate(-1);
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

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
      draft: { label: 'Rascunho', variant: 'secondary' },
      sent: { label: 'Enviada', variant: 'default' },
      paid: { label: 'Paga', variant: 'default' },
      pago_antecipado: { label: 'Pago antecipado', variant: 'default' },
      pago_no_vencimento: { label: 'Pago no vencimento', variant: 'default' },
      pago_com_atraso: { label: 'Pago com atraso', variant: 'destructive' },
      overdue: { label: 'Vencida', variant: 'destructive' },
      cancelled: { label: 'Cancelada', variant: 'outline' },
      debited: { label: 'Debitado em Reserva', variant: 'destructive' }
    };

    const config = statusConfig[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatCurrency = (cents: number, currency: string) => {
    const value = cents / 100;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency
    }).format(value);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return <LoadingScreen message="Carregando cobrança..." />;
  }

  if (!charge) {
    return <div>Cobrança não encontrada</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(isTeamMember ? '/gerenciar-cobrancas' : '/minhas-cobrancas')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="mb-6 overflow-hidden">
          <CardHeader className="space-y-6">
            {/* Título e Status */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-2">{charge.title}</CardTitle>
                {charge.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">{charge.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {isTeamMember ? (
                  <Select 
                    value={charge.status} 
                    onValueChange={handleStatusChange}
                    disabled={updatingStatus}
                  >
                    <SelectTrigger className="w-[220px] h-9">
                      {updatingStatus ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Atualizando...
                        </div>
                      ) : (
                        <SelectValue />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">📝 Rascunho</SelectItem>
                      <SelectItem value="sent">📤 Enviada</SelectItem>
                      <SelectItem value="pago_antecipado">✅ Pago antecipado (+5 pts)</SelectItem>
                      <SelectItem value="pago_no_vencimento">✅ Pago no vencimento (+1 pt)</SelectItem>
                      <SelectItem value="pago_com_atraso">⚠️ Pago com atraso (-15 pts)</SelectItem>
                      <SelectItem value="debited">🔻 Debitado em reserva (-30 pts)</SelectItem>
                      <SelectItem value="cancelled">❌ Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  getStatusBadge(charge.status)
                )}
                {isTeamMember && (
                  <>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => setEditDialogOpen(true)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button 
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Categorização */}
            <div className="flex flex-wrap gap-2">
              {charge.property && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100">
                  📍 {charge.property.name}
                </Badge>
              )}
              {charge.category && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
                  {CHARGE_CATEGORIES[charge.category as keyof typeof CHARGE_CATEGORIES]}
                </Badge>
              )}
              {charge.service_type && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100">
                  🏷️ {charge.service_type}
                </Badge>
              )}
            </div>

            {/* Valores - Grid responsivo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg border">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Valor Total</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatCurrency(charge.amount_cents, charge.currency)}
                </p>
              </div>
              {charge.management_contribution_cents > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Aporte Gestão</p>
                  <p className="text-lg font-semibold text-green-600">
                    - {formatCurrency(charge.management_contribution_cents, charge.currency)}
                  </p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Valor Devido</p>
                <p className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  {formatCurrency(charge.amount_cents - (charge.management_contribution_cents || 0), charge.currency)}
                </p>
              </div>
            </div>

            {/* Datas */}
            {(charge.maintenance_date || charge.due_date) && (
              <div className="flex flex-wrap gap-3">
                {charge.maintenance_date && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-md border border-blue-200">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <div className="flex flex-col">
                      <span className="text-xs text-blue-600 font-medium">Data do Serviço</span>
                      <span className="text-sm font-semibold text-blue-700">
                        {format(new Date(charge.maintenance_date), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                )}
                {charge.due_date && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-md border border-red-200">
                    <Calendar className="h-4 w-4 text-red-600" />
                    <div className="flex flex-col">
                      <span className="text-xs text-red-600 font-medium">Vencimento</span>
                      <span className="text-sm font-semibold text-red-700">
                        {format(new Date(charge.due_date), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>

            {/* Link de Pagamento - Para Admin/Agent */}
            {isTeamMember && charge.status !== 'paid' && charge.status !== 'cancelled' && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                      💳 Link de Pagamento Mercado Pago
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                      {charge.payment_link 
                        ? "Link gerado! O proprietário pode pagar com cartão de crédito, débito ou PIX através do Mercado Pago."
                        : "Gere um link de pagamento para que o proprietário possa pagar online com cartão de crédito ou PIX."}
                    </p>
                    {charge.payment_link ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            window.open(charge.payment_link!, '_blank');
                          }}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          🔗 Abrir Link de Pagamento
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(charge.payment_link!);
                            toast({
                              title: "Link copiado!",
                              description: "O link foi copiado para a área de transferência",
                            });
                          }}
                        >
                          📋 Copiar Link
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={handleGeneratePaymentLink}
                        disabled={generatingPaymentLink}
                        className="bg-green-600 hover:bg-green-700"
                        size="sm"
                      >
                        {generatingPaymentLink ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Gerando link...
                          </>
                        ) : (
                          '🔗 Gerar Link de Pagamento'
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Opções de Pagamento - Para Proprietário */}
            {!isTeamMember && charge.payment_link && charge.status !== 'paid' && charge.status !== 'cancelled' && (
              <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background shadow-lg animate-fade-in overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <CreditCard className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Opções de Pagamento</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Escolha a melhor forma de pagar - PIX instantâneo ou parcele em até 12x
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Grid de opções de pagamento */}
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Opção 1: PIX Instantâneo */}
                    {charge.pix_qr_code_base64 && (
                      <Card className="border-2 border-primary/20 hover:border-primary/40 transition-colors">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-2 rounded-lg bg-green-50">
                              <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z"/>
                              </svg>
                            </div>
                            <div>
                              <CardTitle className="text-lg">PIX Instantâneo</CardTitle>
                              <p className="text-xs text-muted-foreground">À vista - Aprovação imediata</p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex justify-center p-3 bg-white rounded-lg border">
                            <img 
                              src={`data:image/png;base64,${charge.pix_qr_code_base64}`}
                              alt="QR Code PIX" 
                              className="w-48 h-48"
                            />
                          </div>
                          {charge.pix_qr_code && (
                            <Button 
                              className="w-full" 
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(charge.pix_qr_code!);
                                toast({ title: "Código PIX copiado!" });
                              }}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copiar código PIX
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Opção 2: Cartão com Parcelamento */}
                    <Card className="border-2 border-blue-200 hover:border-blue-300 transition-colors bg-gradient-to-br from-blue-50/50 to-background">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-2 rounded-lg bg-blue-50">
                            <CreditCard className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">Cartão de Crédito</CardTitle>
                            <p className="text-xs text-muted-foreground">Parcele em até 12x com juros</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            Todos os cartões
                          </Badge>
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                            Débito e Crédito
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="p-4 bg-white rounded-lg border-2 border-dashed border-blue-200 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Valor devido:</span>
                            <span className="font-bold text-lg">{formatCurrency(charge.amount_cents - (charge.management_contribution_cents || 0), charge.currency)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>• Parcele em até 12x no cartão</p>
                            <p>• Aceita todos os principais cartões</p>
                            <p>• Pagamento seguro pelo Mercado Pago</p>
                          </div>
                        </div>
                        <Button 
                          className="w-full shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
                          size="lg"
                          onClick={() => window.open(charge.payment_link!, '_blank')}
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          Pagar com Mercado Pago
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(charge.payment_link!);
                            toast({ title: "Link copiado!", description: "Você pode acessá-lo depois" });
                          }}
                          className="w-full"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copiar link de pagamento
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            )}

            {attachments.length > 0 && (
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground">Anexos ({attachments.length})</h3>
                  {attachments.length > 1 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={downloadAllAttachments}
                      disabled={downloadingAll}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Baixar Todos
                    </Button>
                  )}
                </div>

                {/* Galeria de Imagens */}
                {attachments.some(a => isImageFile(a)) && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Imagens</h4>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {attachments
                        .filter(a => isImageFile(a))
                        .map((attachment, idx) => {
                          const previewUrl = getAttachmentUrl(attachment);
                          const mediaIndex = allMediaItems.findIndex(item => item.file_url === previewUrl);
                          
                          return (
                             <div 
                               key={attachment.id} 
                               className="group relative aspect-square rounded-md overflow-hidden border bg-muted cursor-pointer"
                               onClick={() => {
                                 setGalleryStartIndex(mediaIndex);
                                 setGalleryOpen(true);
                               }}
                             >
                               <AuthenticatedImage 
                                 src={previewUrl}
                                 alt={attachment.file_name}
                                 className="w-full h-full object-cover transition-transform group-hover:scale-105"
                               />
                               <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                 <Button
                                   size="sm"
                                   variant="secondary"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setGalleryStartIndex(mediaIndex);
                                     setGalleryOpen(true);
                                   }}
                                   className="h-7 w-7 p-0"
                                 >
                                   <ZoomIn className="h-3.5 w-3.5" />
                                 </Button>
                                 <Button
                                   size="sm"
                                   variant="secondary"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     downloadAttachment(attachment.id, attachment.file_name);
                                   }}
                                   disabled={sending}
                                   className="h-7 w-7 p-0"
                                 >
                                   <Download className="h-3.5 w-3.5" />
                                 </Button>
                               </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Vídeos */}
                {attachments.some(a => isVideoFile(a)) && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Vídeos</h4>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                      {attachments
                        .filter(a => isVideoFile(a))
                        .map((attachment) => {
                          const previewUrl = getAttachmentUrl(attachment);
                          const posterUrl = attachment.poster_path ? getPosterUrl(attachment) : undefined;
                          const mediaIndex = allMediaItems.findIndex(item => item.file_url === previewUrl);
                          
                          // Format file size
                          const formatFileSize = (bytes: number | null | undefined) => {
                            if (!bytes) return '0 MB';
                            const mb = bytes / (1024 * 1024);
                            if (mb < 1) {
                              const kb = bytes / 1024;
                              return `${kb.toFixed(0)} KB`;
                            }
                            return `${mb.toFixed(1)} MB`;
                          };
                          
                          return (
                            <div 
                              key={attachment.id} 
                              className="group relative rounded-lg overflow-hidden border bg-muted cursor-pointer hover:shadow-lg transition-shadow"
                              onClick={() => {
                                setGalleryStartIndex(mediaIndex);
                                setGalleryOpen(true);
                              }}
                            >
                              <VideoThumbnail
                                src={previewUrl}
                                posterSrc={posterUrl}
                                className="aspect-video"
                              />
                              
                              {/* Video info */}
                              <div className="p-1.5 bg-card">
                                <p className="text-xs font-medium truncate" title={attachment.file_name}>
                                  {attachment.file_name}
                                </p>
                                <div className="flex items-center justify-between mt-0.5">
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatFileSize(attachment.file_size)}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadAttachment(attachment.id, attachment.file_name);
                                    }}
                                    disabled={sending}
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Outros Arquivos */}
                {attachments.some(a => !isImageFile(a) && !isVideoFile(a)) && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Outros Arquivos</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {attachments
                        .filter(a => !isImageFile(a) && !isVideoFile(a))
                        .map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent transition-colors"
                          >
                            {getFileIcon(attachment.mime_type || '')}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">
                                {attachment.file_name}
                              </p>
                              {attachment.file_size && (
                                <p className="text-[10px] text-muted-foreground">
                                  {(attachment.file_size / 1024).toFixed(1)} KB
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => downloadAttachment(attachment.id, attachment.file_name)}
                              disabled={sending}
                              className="h-7 w-7 p-0"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {charge.payment_link_url && (
              <div className="border-t pt-4 mt-4">
                <p className="mb-2 text-sm font-medium text-foreground">Link de Pagamento:</p>
                <Button 
                  onClick={() => window.open(charge.payment_link_url!, '_blank')}
                  className="w-full"
                >
                  Acessar Link de Pagamento
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 mb-6">
          {messages.map((message) => {
            const isOwnMessage = message.author_id === user?.id;
            const messageReceipts = receipts[message.id] || [];
            
            return (
              <Card key={message.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={message.profiles?.photo_url || undefined} />
                      <AvatarFallback>{getInitials(message.profiles?.name || 'Desconhecido')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{message.profiles?.name || 'Desconhecido'}</span>
                        {message.profiles?.role && message.profiles.role !== 'owner' && message.profiles.role !== 'pending_owner' && (
                          <Badge variant="secondary" className="text-xs">Equipe</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(message.created_at), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                  {message.body && message.body !== '(anexos)' && (
                    <p className="text-muted-foreground whitespace-pre-wrap mb-3">{message.body}</p>
                  )}
                  
                   {/* Galeria de anexos da mensagem */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground font-medium">
                          Anexos ({message.attachments.length})
                        </div>
                        {message.attachments.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => downloadMessageAttachments(
                              message.attachments!,
                              `anexos-${format(new Date(message.created_at), "dd-MM-yyyy-HH-mm")}`
                            )}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Baixar todos
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {message.attachments.map((attachment) => {
                          const isImage = attachment.mime_type?.startsWith('image/');
                          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                          const attachmentUrl = `${supabaseUrl}/functions/v1/serve-attachment/${attachment.id}/file`;
                          
                          return (
                            <div key={attachment.id} className="relative aspect-square rounded-lg overflow-hidden border bg-muted group">
                              {isImage ? (
                                <>
                                  <AuthenticatedImage
                                    src={attachmentUrl}
                                    alt={attachment.file_name}
                                    className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                                    onClick={() => setSelectedImage({ url: attachmentUrl, name: attachment.file_name })}
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => setSelectedImage({ url: attachmentUrl, name: attachment.file_name })}
                                      className="h-8 w-8 p-0"
                                    >
                                      <ZoomIn className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <div 
                                  className="w-full h-full flex flex-col items-center justify-center p-2 cursor-pointer hover:bg-accent"
                                  onClick={() => window.open(attachmentUrl, '_blank')}
                                >
                                  <FileText className="h-8 w-8 text-muted-foreground mb-1" />
                                  <span className="text-xs text-center truncate w-full px-1">{attachment.file_name}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* Read receipts */}
                  <div className="mt-3 flex justify-end">
                    <ReadReceiptDisplay receipts={messageReceipts} isOwnMessage={isOwnMessage} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {isTeamMember && (
                <div className="space-y-2">
                  <Label htmlFor="ai-prompt">IA Assistente - Gerar Resposta</Label>
                  <div className="flex gap-2">
                    <Textarea
                      id="ai-prompt"
                      placeholder="Digite ou grave um comando para a IA gerar a resposta (ex: explique o motivo da cobrança de forma cordial)"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), generateAIResponse())}
                      className="min-h-[80px]"
                      disabled={generatingAI}
                    />
                    <div className="flex flex-col gap-2">
                      <VoiceToTextInput
                        onTranscript={(text) => setAiPrompt(text)}
                        disabled={generatingAI}
                      />
                      <Button 
                        type="button" 
                        onClick={generateAIResponse}
                        disabled={generatingAI || !aiPrompt.trim()}
                        variant="secondary"
                        className="whitespace-nowrap"
                      >
                        {generatingAI ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Gerando...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Gerar
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="message">Mensagem</Label>
                <Textarea
                  id="message"
                  placeholder="Digite sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="min-h-[100px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
              </div>
              
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Arquivos selecionados:</p>
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                      <Paperclip className="h-4 w-4" />
                      <span className="text-sm flex-1">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        disabled={uploading || sending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id="attachment-upload"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={uploading || sending}
                  />
                  <label htmlFor="attachment-upload">
                    <Button variant="outline" size="sm" disabled={uploading || sending} asChild>
                      <span className="cursor-pointer">
                        <Paperclip className="mr-2 h-4 w-4" />
                        Anexar arquivo
                      </span>
                    </Button>
                  </label>
                </div>
                <Button 
                  onClick={sendMessage} 
                  disabled={sending || (!newMessage.trim() && selectedFiles.length === 0)}
                >
                  {sending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Enviar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Galeria de Mídia */}
      <MediaGallery
        items={allMediaItems}
        initialIndex={galleryStartIndex}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
      />

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cobrança</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta cobrança? Esta ação não pode ser desfeita.
              Todos os anexos e mensagens associados também serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Edição */}
      <EditChargeDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        charge={charge}
        onSuccess={fetchChargeData}
      />
    </div>
  );
}