import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Paperclip, Loader2, Sparkles, FileText, ChevronDown, X, Download, ZoomIn, Upload, Calendar, CheckCircle } from "lucide-react";
import { CompleteMaintenanceDialog } from "@/components/CompleteMaintenanceDialog";
import { ptBR } from "date-fns/locale";
import { ConversationSummaryButton } from "@/components/ConversationSummaryButton";
import { AttachmentBubble } from "@/components/AttachmentBubble";
import { MediaGallery } from "@/components/MediaGallery";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ReadReceiptDisplay } from "@/components/ReadReceiptDisplay";
import { TicketBadges } from "@/components/TicketBadges";
import OwnerMaintenanceDecision from "@/components/OwnerMaintenanceDecision";
import { preloadMediaUrls } from "@/hooks/useMediaCache";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import JSZip from "jszip";
import { processFileForUpload } from "@/lib/processVideoForUpload";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  ticket_type: string;
  status: string;
  priority: string;
  created_at: string;
  owner_id: string;
  property_id: string | null;
  kind?: string;
  essential?: boolean;
  owner_decision?: string | null;
  owner_action_due_at?: string | null;
  profiles: {
    name: string;
    photo_url: string | null;
  };
  properties: {
    name: string;
  } | null;
}

interface Attachment {
  id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
  size_bytes?: number;
}

interface Message {
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
  attachments?: Attachment[];
}

export default function TicketDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [allMediaItems, setAllMediaItems] = useState<Attachment[]>([]);
  const [exportingToMonday, setExportingToMonday] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleData, setScheduleData] = useState({
    scheduled_at: "",
    service_provider_id: "",
    observation: "",
    cost_responsible: "owner" as "owner" | "pm" | "guest",
  });
  const [providers, setProviders] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';
  const canUpdate = ticket?.status !== 'concluido' && ticket?.status !== 'cancelado';
  const isMaintenance = ticket?.ticket_type === 'manutencao';

  // Read receipts for messages
  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { receipts, markAsRead } = useReadReceipts(messageIds, "ticket");

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
    fetchTicketData();
    
    // Realtime subscription for new messages
    const channel = supabase
      .channel(`ticket-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${id}`
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

  const fetchTicketData = async () => {
    try {
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          *,
          profiles!tickets_owner_id_fkey (name, photo_url),
          properties (name)
        `)
        .eq('id', id)
        .single();

      if (ticketError) throw ticketError;

      // Se é manutenção concluída, redireciona para a cobrança vinculada
      if (ticketData.ticket_type === 'manutencao' && ticketData.status === 'concluido') {
        const { data: charges } = await supabase
          .from('charges')
          .select('id, status, archived_at')
          .eq('ticket_id', id)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (charges && charges.length > 0) {
          navigate(`/cobranca/${charges[0].id}`, { replace: true });
          return;
        }
      }

      setTicket(ticketData);

      await fetchMessages();
    } catch (error: any) {
      toast({
        title: "Erro ao carregar ticket",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProviders = async () => {
    try {
      const { data } = await supabase.from("service_providers").select("id, name, phone").eq("is_active", true).order("name");
      setProviders(data || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { if (isMaintenance) fetchProviders(); }, [isMaintenance]);

  const handleSchedule = async () => {
    if (!ticket || !user) return;
    setSavingSchedule(true);
    try {
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({
          scheduled_at: scheduleData.scheduled_at || null,
          service_provider_id: scheduleData.service_provider_id || null,
          cost_responsible: scheduleData.cost_responsible,
        })
        .eq("id", ticket.id);
      if (ticketError) throw ticketError;

      const provider = providers.find(p => p.id === scheduleData.service_provider_id);
      let messageBody = "📅 **Manutenção agendada**\n\n";
      if (scheduleData.scheduled_at) {
        messageBody += `**Data/Hora:** ${format(new Date(scheduleData.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}\n`;
      }
      if (provider) {
        messageBody += `**Profissional:** ${provider.name}${provider.phone ? ` (${provider.phone})` : ""}\n`;
      }
      if (scheduleData.observation) messageBody += `\n**Observação:** ${scheduleData.observation}`;

      await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, author_id: user.id, body: messageBody, is_internal: false });
      toast({ title: "Manutenção agendada!" });
      setScheduleDialogOpen(false);
      fetchTicketData();
    } catch (error: any) {
      toast({ title: "Erro ao agendar", description: error.message, variant: "destructive" });
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleComplete = async () => {
    if (!ticket || !user) return;
    setCompleting(true);
    try {
      const { error: ticketError } = await supabase.from("tickets").update({ status: "concluido" }).eq("id", ticket.id);
      if (ticketError) throw ticketError;

      toast({ title: "Manutenção concluída!" });
      setCompleteDialogOpen(false);
      fetchTicketData();
    } catch (error: any) {
      toast({ title: "Erro ao concluir", description: error.message, variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('get-ticket-messages', {
        body: { ticketId: id }
      });

      if (error) throw error;
      setMessages(data || []);
      
      // Coletar todos os anexos de mídia para a galeria
      const mediaItems: Attachment[] = [];
      const allUrls: string[] = [];
      (data || []).forEach((msg: Message) => {
        msg.attachments?.forEach((att) => {
          allUrls.push(att.file_url);
          if (att.file_type?.startsWith('image/') || att.file_type?.startsWith('video/')) {
            mediaItems.push(att);
          }
        });
      });
      setAllMediaItems(mediaItems);
      
      // Preload all media URLs for faster display
      if (allUrls.length > 0) {
        preloadMediaUrls(allUrls);
      }
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Erro ao carregar mensagens",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && selectedFiles.length === 0) return;
    if (!user || !profile) return;

    const messageText = newMessage.trim();
    const filesToUpload = [...selectedFiles];
    
    // Create optimistic message immediately - user sees it instantly
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      body: messageText,
      created_at: new Date().toISOString(),
      author_id: user.id,
      is_internal: false,
      profiles: {
        name: profile.name,
        photo_url: profile.photo_url,
        role: profile.role,
      },
      attachments: filesToUpload.map((file, i) => ({
        id: `optimistic-att-${i}`,
        file_url: URL.createObjectURL(file),
        file_name: file.name,
        file_type: file.type,
        size_bytes: file.size,
      })),
    };

    // Add optimistic message immediately
    setMessages(prev => [...prev, optimisticMessage]);
    
    // Clear inputs immediately - feels instant
    setNewMessage("");
    setSelectedFiles([]);

    // Upload and send in background
    (async () => {
      try {
        // Upload de anexos primeiro se houver
        const attachments = [];
        if (filesToUpload.length > 0) {
          for (const file of filesToUpload) {
            // Compress video if it's a video file
            const processedFile = await processFileForUpload(file);
            const filePath = `${id}/${Date.now()}_${processedFile.name}`;

            const { error: uploadError } = await supabase.storage
              .from('attachments')
              .upload(filePath, processedFile);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
              .from('attachments')
              .getPublicUrl(filePath);

            attachments.push({
              file_url: publicUrl,
              file_name: processedFile.name,
              file_type: processedFile.type,
              size_bytes: processedFile.size,
              path: filePath
            });
          }
        }

        // Criar mensagem via edge function
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const { error } = await supabase.functions.invoke(`create-ticket-message/${id}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          body: {
            message: messageText || null,
            attachments,
            is_internal: false
          }
        });

        if (error) {
          // Remove optimistic message on error
          setMessages(prev => prev.filter(m => m.id !== optimisticId));
          toast({
            title: "Erro ao enviar mensagem",
            description: error.message,
            variant: "destructive",
          });
        }
        // Realtime subscription will handle replacing the optimistic message
      } catch (error: any) {
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        toast({
          title: "Erro ao enviar mensagem",
          description: error.message,
          variant: "destructive",
        });
      }
    })();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    
    const files = Array.from(event.target.files);
    const maxSize = 20 * 1024 * 1024; // 20MB
    
    const validFiles = files.filter(file => {
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

  const downloadMessageAttachments = async (messageAttachments: Attachment[], messageName: string) => {
    try {
      if (messageAttachments.length === 0) return;
      
      const zip = new JSZip();
      let successCount = 0;
      
      for (let i = 0; i < messageAttachments.length; i++) {
        const attachment = messageAttachments[i];
        
        try {
          const url = new URL(attachment.file_url);
          const pathParts = url.pathname.split('/object/public/');
          
          if (pathParts.length === 2) {
            const [bucket, ...fileParts] = pathParts[1].split('/');
            const filePath = fileParts.join('/');
            
            const { data, error } = await supabase.storage
              .from(bucket)
              .download(filePath);
            
            if (error) {
              console.error(`❌ Erro no arquivo:`, error);
              continue;
            }
            
            if (data) {
              const fileName = attachment.file_name || `arquivo-${i + 1}`;
              zip.file(fileName, data);
              successCount++;
            }
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

      const zipBlob = await zip.generateAsync({ type: 'blob' });
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

  const downloadAllAttachments = async () => {
    if (downloadingAll) return;
    
    try {
      setDownloadingAll(true);
      
      // Coleta todos os anexos de todas as mensagens
      const allAttachments = messages.flatMap(m => m.attachments || []);
      
      if (allAttachments.length === 0) {
        toast({
          title: "Nenhum anexo encontrado",
          variant: "destructive",
        });
        setDownloadingAll(false);
        return;
      }

      console.log(`📦 Iniciando download de ${allAttachments.length} arquivos`);

      const zip = new JSZip();
      let successCount = 0;
      let totalSize = 0;
      
      for (let i = 0; i < allAttachments.length; i++) {
        const attachment = allAttachments[i];
        
        try {
          console.log(`📥 Processando ${i + 1}/${allAttachments.length}: ${attachment.file_name || attachment.file_url}`);
          
          // Extrai o path do URL do Supabase Storage
          const url = new URL(attachment.file_url);
          const pathParts = url.pathname.split('/object/public/');
          
          if (pathParts.length === 2) {
            const [bucket, ...fileParts] = pathParts[1].split('/');
            const filePath = fileParts.join('/');
            
            // Usa a API do Supabase
            const { data, error } = await supabase.storage
              .from(bucket)
              .download(filePath);
            
            if (error) {
              console.error(`❌ Erro no arquivo:`, error);
              continue;
            }
            
            if (data) {
              const fileName = attachment.file_name || `arquivo-${i + 1}`;
              zip.file(fileName, data);
              successCount++;
              totalSize += data.size;
              console.log(`✅ ${fileName} adicionado (${(data.size / 1024).toFixed(1)} KB)`);
            }
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

      console.log(`🗜️ Compactando ${successCount} arquivos (${(totalSize / 1024 / 1024).toFixed(2)} MB)...`);

      // Gera o ZIP
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
      
      console.log(`📦 ZIP gerado: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`);
      
      // Cria o download - método compatível com mobile
      const fileName = `ticket-${id?.substring(0, 8)}-anexos.zip`;
      
      // Tenta usar a API mais moderna se disponível
      if (navigator.share && zipBlob.size < 10 * 1024 * 1024) {
        // Se o arquivo for menor que 10MB, tenta compartilhar (mobile)
        try {
          const file = new File([zipBlob], fileName, { type: 'application/zip' });
          await navigator.share({
            files: [file],
            title: 'Anexos do Ticket',
            text: `${successCount} arquivo(s) compactados`
          });
          
          toast({
            title: "✅ Compartilhamento iniciado",
            description: `${successCount} arquivo(s)`,
          });
          return;
        } catch (shareError) {
          console.log('Share API não disponível, usando download tradicional');
        }
      }
      
      // Método tradicional de download - otimizado para mobile
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      
      // Adiciona atributos importantes para mobile
      link.style.display = 'none';
      document.body.appendChild(link);
      
      // Trigger do download com eventos múltiplos para garantir compatibilidade
      console.log(`⬇️ Iniciando download: ${fileName}`);
      
      // Tenta múltiplos métodos
      try {
        link.click();
        
        // Fallback: dispara evento manualmente
        const event = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        link.dispatchEvent(event);
      } catch (e) {
        console.error('Erro ao clicar:', e);
      }
      
      // Limpa após delay maior para mobile
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

  const generateAIResponse = async () => {
    if (!aiInstructions.trim()) {
      toast({
        title: "Instruções necessárias",
        description: "Digite instruções para a IA gerar a resposta",
        variant: "destructive",
      });
      return;
    }

    try {
      setGeneratingAI(true);
      
      // Prepara o contexto do ticket e mensagens
      const messagesContext = messages
        .map(m => `${m.profiles.name}: ${m.body}`)
        .join('\n');

      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: {
          templateKey: 'ticket_response',
          ticketId: id,
          customInstructions: aiInstructions
        }
      });

      if (error) throw error;

      setNewMessage(data.text);
      setAiInstructions("");
      toast({
        title: "Resposta gerada com sucesso!",
        description: "A IA gerou uma sugestão de resposta para você.",
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


  if (loading) {
    return <LoadingScreen message="Carregando ticket..." />;
  }

  if (!ticket) {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-muted-foreground">Ticket não encontrado.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  const statusLabels = {
    novo: "Novo",
    em_analise: "Em Análise",
    aguardando_info: "Aguardando Informações",
    em_execucao: "Em Execução",
    concluido: "Concluído",
    cancelado: "Cancelado"
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const exportToMonday = async () => {
    if (!id) return;

    setExportingToMonday(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('export-ticket-to-monday', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: { ticketId: id }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Ticket exportado!",
        description: data?.mondayUrl 
          ? "Ticket criado no Monday.com com sucesso!" 
          : "Ticket exportado para o Monday.",
      });

      // Log columns found for user to configure
      if (data?.columnsFound) {
        console.log('Colunas disponíveis no Monday:', data.columnsFound);
        console.log('Configure os IDs das colunas nos secrets do Supabase:');
        data.columnsFound.forEach((col: any) => {
          console.log(`- ${col.title} (${col.type}): MONDAY_COL_${col.title.toUpperCase().replace(/ /g, '_')} = "${col.id}"`);
        });
      }

      if (data?.mondayUrl) {
        window.open(data.mondayUrl, '_blank');
      }
    } catch (error: any) {
      console.error('Error exporting to Monday:', error);
      toast({
        title: "Erro ao exportar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setExportingToMonday(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          
          {isTeamMember && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={exportToMonday}
              disabled={exportingToMonday}
            >
              {exportingToMonday ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exportando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Exportar para Monday
                </>
              )}
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-2">{ticket.subject}</CardTitle>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Badge variant="outline">{statusLabels[ticket.status as keyof typeof statusLabels]}</Badge>
                  <Badge>{ticket.priority}</Badge>
                  {ticket.properties && (
                    <Badge variant="secondary">Imóvel: {ticket.properties.name}</Badge>
                  )}
                </div>
                <TicketBadges ticket={ticket} />
              </div>
              {isTeamMember && isMaintenance && canUpdate && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setScheduleData({ scheduled_at: "", service_provider_id: "", observation: "", cost_responsible: "owner" });
                      setScheduleDialogOpen(true);
                    }}
                  >
                    <Calendar className="h-4 w-4 mr-1" />
                    Agendar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => setCompleteDialogOpen(true)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Concluir e Cobrar
                  </Button>
                </div>
              )}
              {isTeamMember && !isMaintenance && canUpdate && (
                <Select
                  value={ticket.status}
                  onValueChange={async (newStatus: 'novo' | 'em_analise' | 'em_execucao' | 'aguardando_info' | 'concluido' | 'cancelado') => {
                    try {
                      const { error } = await supabase.from('tickets').update({ status: newStatus }).eq('id', id);
                      if (error) throw error;
                      setTicket({ ...ticket, status: newStatus });
                      toast({ title: "Status atualizado" });
                    } catch (error: any) {
                      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Mudar status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="em_analise">Em Análise</SelectItem>
                    <SelectItem value="em_execucao">Em Execução</SelectItem>
                    <SelectItem value="aguardando_info">Aguardando Info</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          
          {/* Owner Decision Section - Show for maintenance tickets that need owner decision */}
          {ticket.kind === 'maintenance' && 
           !ticket.essential && 
           ticket.owner_action_due_at && 
           !isTeamMember && (
            <CardContent className="pt-0">
              <OwnerMaintenanceDecision 
                ticket={{
                  id: ticket.id,
                  kind: ticket.kind || '',
                  essential: ticket.essential || false,
                  owner_decision: ticket.owner_decision || null,
                  owner_action_due_at: ticket.owner_action_due_at || null,
                  status: ticket.status,
                }}
                onUpdate={fetchTicketData}
              />
            </CardContent>
          )}
        </Card>

        <div className="mb-6 flex justify-end gap-2">
          {isTeamMember && (
            <ConversationSummaryButton 
              ticketId={id!} 
              messageCount={messages.length}
            />
          )}
          {messages.some(m => m.attachments && m.attachments.length > 0) && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={downloadAllAttachments}
              disabled={downloadingAll}
            >
              {downloadingAll ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Baixar Todos os Anexos
            </Button>
          )}
        </div>

        <div className="space-y-4 mb-6">
          {messages.map((message) => {
            const isOwnMessage = message.author_id === user?.id;
            const messageReceipts = receipts[message.id] || [];
            
            return (
              <Card key={message.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={message.profiles.photo_url || undefined} />
                      <AvatarFallback>{getInitials(message.profiles.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{message.profiles.name}</span>
                        {message.profiles.role !== 'owner' && message.profiles.role !== 'pending_owner' && (
                          <Badge variant="secondary" className="text-xs">Equipe</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(message.created_at), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                  {message.body && (
                    <p className="text-rios-dark-blue whitespace-pre-wrap">{message.body}</p>
                  )}
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
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {message.attachments.map((attachment) => (
                          <AttachmentBubble
                            key={attachment.id}
                            {...attachment}
                            onPreview={() => {
                              if (attachment.file_type?.startsWith('image/') || attachment.file_type?.startsWith('video/')) {
                                const index = allMediaItems.findIndex(item => item.id === attachment.id);
                                if (index !== -1) {
                                  setGalleryStartIndex(index);
                                  setGalleryOpen(true);
                                }
                              }
                            }}
                          />
                        ))}
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

        {canUpdate && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Textarea
                  placeholder="Digite sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="min-h-[100px]"
                />
                
                {selectedFiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Arquivos selecionados ({selectedFiles.length})
                    </div>
                    <div className="space-y-2">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-sm truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                          {uploadingFiles.has(file.name) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col gap-4">
                  {isTeamMember && (
                    <div className="space-y-2">
                      <Label htmlFor="ai-instructions" className="text-sm font-medium">
                        Instruções para a IA
                      </Label>
                      <div className="flex gap-2">
                        <Textarea
                          id="ai-instructions"
                          placeholder="Ex: Responda de forma cordial explicando o processo de bloqueio de datas e peça os períodos desejados"
                          value={aiInstructions}
                          onChange={(e) => setAiInstructions(e.target.value)}
                          className="min-h-[80px]"
                        />
                        <Button 
                          variant="outline"
                          onClick={generateAIResponse}
                          disabled={generatingAI || !aiInstructions.trim()}
                          className="flex-shrink-0 h-auto"
                          title="Gerar resposta com IA"
                        >
                          {generatingAI ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Sparkles className="h-5 w-5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                  
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <input
                      type="file"
                      id="attachment-upload"
                      onChange={handleFileSelect}
                      disabled={uploading || sending}
                      multiple
                      className="hidden"
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
              </div>
            </CardContent>
          </Card>
        )}

        {!canUpdate && (
          <Card className="bg-muted">
            <CardContent className="pt-6 text-center text-muted-foreground">
              Este ticket foi {ticket.status === 'concluido' ? 'concluído' : 'cancelado'} e não pode mais receber mensagens.
            </CardContent>
          </Card>
        )}
      </main>

      {/* Galeria de Mídia */}
      <MediaGallery
        items={allMediaItems}
        initialIndex={galleryStartIndex}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
      />

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar Manutenção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Data e Hora</Label>
              <Input type="datetime-local" value={scheduleData.scheduled_at} onChange={(e) => setScheduleData({ ...scheduleData, scheduled_at: e.target.value })} />
            </div>
            <div>
              <Label>Profissional</Label>
              <Select value={scheduleData.service_provider_id} onValueChange={(v) => setScheduleData({ ...scheduleData, service_provider_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsável pelo custo</Label>
              <Select value={scheduleData.cost_responsible} onValueChange={(v) => setScheduleData({ ...scheduleData, cost_responsible: v as "owner" | "pm" | "guest" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Proprietário</SelectItem>
                  <SelectItem value="pm">Gestão</SelectItem>
                  <SelectItem value="guest">Hóspede</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Textarea value={scheduleData.observation} onChange={(e) => setScheduleData({ ...scheduleData, observation: e.target.value })} placeholder="Adicione uma observação..." rows={2} />
            </div>
            <Button onClick={handleSchedule} disabled={savingSchedule} className="w-full">
              {savingSchedule ? "Salvando..." : "Confirmar Agendamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Complete & Charge Dialog */}
      <CompleteMaintenanceDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        ticket={ticket ? {
          id: ticket.id,
          subject: ticket.subject,
          cost_responsible: (ticket as any).cost_responsible || null,
          owner: { id: ticket.owner_id, name: ticket.profiles?.name || "" },
          property: ticket.properties ? { id: ticket.property_id!, name: ticket.properties.name } : null,
        } : null}
        onSuccess={(chargeId) => {
          if (chargeId) {
            navigate(`/cobranca/${chargeId}`);
          } else {
            fetchTicketData();
          }
        }}
      />
    </div>
  );
}
