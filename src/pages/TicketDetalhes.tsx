import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import JSZip from "jszip";
import {
  Activity,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle,
  Download,
  Flag,
  Info,
  Loader2,
  MessagesSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Send,
  Sparkles,
  Tag,
  Ticket as TicketIcon,
  Upload,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { useChatPresence } from "@/hooks/useChatPresence";
import { preloadMediaUrls } from "@/hooks/useMediaCache";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { CaixaCarregando, CaixaOperacao, SeloContagem } from "@/components/painel/CaixaOperacao";
import { Definicao, ListaDefinicoes } from "@/components/painel/Definicoes";
import { EtiquetaPrioridadeTicket, EtiquetaStatusTicket, EtiquetaTipoTicket } from "@/components/tickets/EtiquetasTicket";
import { ORDEM_STATUS_TICKET, STATUS_TICKET, type StatusTicket } from "@/lib/ticketMeta";
import { EditMaintenanceDialog } from "@/components/EditMaintenanceDialog";
import { EditTicketDialog } from "@/components/EditTicketDialog";
import { CompleteMaintenanceDialog } from "@/components/CompleteMaintenanceDialog";
import { SendToChargeButton } from "@/components/SendToChargeButton";
import { ConversationSummaryButton } from "@/components/ConversationSummaryButton";
import { AttachmentBubble } from "@/components/AttachmentBubble";
import { MediaGallery } from "@/components/MediaGallery";
import { TicketBadges } from "@/components/TicketBadges";
import OwnerMaintenanceDecision from "@/components/OwnerMaintenanceDecision";
import { renderizarCorpo } from "@/components/chat/CorpoMensagem";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { ChatDateDivider } from "@/components/chat/ChatDateDivider";
import { ChatTypingIndicator } from "@/components/chat/ChatTypingIndicator";
import { ChatFilePreviewRow } from "@/components/chat/ChatFilePreviewRow";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { deleteAttachmentRow } from "@/lib/deleteAttachment";
import { buildZipEntryNameFromBlob } from "@/lib/zipFileName";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import { emParaleloOuFalha } from "@/lib/fileUpload";
import { cn } from "@/lib/utils";

interface Chamado {
  id: string;
  subject: string;
  description: string | null;
  ticket_type: string;
  status: string;
  priority: string;
  created_at: string;
  owner_id: string;
  property_id: string | null;
  kind?: string | null;
  essential?: boolean | null;
  owner_decision?: string | null;
  owner_action_due_at?: string | null;
  cost_responsible?: string | null;
  charge_draft_amount_cents?: number | null;
  charge_draft_management_contribution_cents?: number | null;
  charge_draft_category?: string | null;
  charge_draft_title?: string | null;
  charge_sent_at?: string | null;
  profiles: {
    name: string;
    photo_url: string | null;
  } | null;
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

/** Anexos ainda não enviados nunca ficam em "subindo": a prévia some ao enviar. */
const SEM_UPLOAD = new Set<string>();

const ehMidia = (att: Attachment) =>
  att.file_type?.startsWith("image/") || att.file_type?.startsWith("video/") || att.file_type === "application/pdf";

/** Mensagem legível de um erro do Supabase, de uma Error ou de qualquer coisa. */
function mensagemErro(erro: unknown, padrao = "Tente novamente."): string {
  if (erro && typeof erro === "object" && "message" in erro && typeof (erro as { message: unknown }).message === "string") {
    return (erro as { message: string }).message;
  }
  return padrao;
}


/* ------------------------------------------------------------------------ */
/* Página                                                                    */
/* ------------------------------------------------------------------------ */

export default function TicketDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [ticket, setTicket] = useState<Chamado | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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
  const [editOpen, setEditOpen] = useState(false);
  const [atualizandoStatus, setAtualizandoStatus] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fimConversaRef = useRef<HTMLDivElement>(null);
  const totalMensagensAnterior = useRef(0);

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';
  const canUpdate = ticket?.status !== 'concluido' && ticket?.status !== 'cancelado';
  const isMaintenance = ticket?.ticket_type === 'manutencao';
  // Regra nº 8: voltar de um detalhe leva à lista de origem, com replace.
  const voltarPara = isTeamMember ? "/todos-tickets" : "/meus-chamados";

  // Read receipts for messages
  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { receipts, markAsRead } = useReadReceipts(messageIds, "ticket");
  const { typingUsers, setTyping } = useChatPresence(id ? `ticket-${id}` : null);

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

  // Mensagem própria recém-enviada: rola até ela, para o autor ver que entrou.
  useEffect(() => {
    const ultima = messages[messages.length - 1];
    const cresceu = messages.length > totalMensagensAnterior.current && totalMensagensAnterior.current > 0;
    if (cresceu && ultima && ultima.author_id === user?.id) {
      fimConversaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    totalMensagensAnterior.current = messages.length;
  }, [messages, user?.id]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      setTicket(ticketData as unknown as Chamado);

      await fetchMessages();
    } catch (error) {
      toast({
        title: "Erro ao carregar o chamado",
        description: mensagemErro(error),
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
      // Sem emoji: a conversa mostra este texto com negrito real.
      let messageBody = "**Manutenção agendada**\n\n";
      if (scheduleData.scheduled_at) {
        messageBody += `**Data/Hora:** ${format(new Date(scheduleData.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}\n`;
      }
      if (provider) {
        messageBody += `**Profissional:** ${provider.name}${provider.phone ? ` (${provider.phone})` : ""}\n`;
      }
      if (scheduleData.observation) messageBody += `\n**Observação:** ${scheduleData.observation}`;

      await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, author_id: user.id, body: messageBody, is_internal: false });
      toast({ title: "Manutenção agendada" });
      setScheduleDialogOpen(false);
      fetchTicketData();
    } catch (error) {
      toast({ title: "Erro ao agendar", description: mensagemErro(error), variant: "destructive" });
    } finally {
      setSavingSchedule(false);
    }
  };

  const alterarStatus = async (novo: StatusTicket) => {
    if (!ticket) return;
    setAtualizandoStatus(true);
    try {
      const { error } = await supabase.from('tickets').update({ status: novo }).eq('id', ticket.id);
      if (error) throw error;
      setTicket({ ...ticket, status: novo });
      toast({ title: "Status atualizado", description: STATUS_TICKET[novo].rotulo });
    } catch (error) {
      toast({ title: "Erro ao atualizar status", description: mensagemErro(error), variant: "destructive" });
    } finally {
      setAtualizandoStatus(false);
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
          if (ehMidia(att)) {
            mediaItems.push(att);
          }
        });
      });
      setAllMediaItems(mediaItems);

      // Preload all media URLs for faster display
      if (allUrls.length > 0) {
        preloadMediaUrls(allUrls);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Erro ao carregar mensagens",
        description: mensagemErro(error),
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
    setTyping(false);

    // Upload and send in background
    (async () => {
      try {
        // Upload de anexos primeiro se houver
        const attachments: Array<{ file_url: string; file_name: string; file_type: string; size_bytes: number; path: string }> = [];
        if (filesToUpload.length > 0) {
          setUploading(true);
          // Até 3 arquivos ao mesmo tempo.
          await emParaleloOuFalha(filesToUpload, async (file, indiceArquivo) => {
            // Compress video if it's a video file
            const processedFile = await processFileForUpload(file);
            const filePath = `${id}/${Date.now()}-${indiceArquivo}_${processedFile.name}`;

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
          });
          setUploading(false);
        }

        // Criar mensagem via edge function
        setSending(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Sessão expirada. Entre novamente para enviar a mensagem.');

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

        if (error) throw error;
        // Realtime subscription will handle replacing the optimistic message
      } catch (error) {
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        toast({
          title: "Erro ao enviar mensagem",
          description: mensagemErro(error),
          variant: "destructive",
        });
      } finally {
        setUploading(false);
        setSending(false);
      }
    })();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const files = Array.from(event.target.files);
    const maxSize = 20 * 1024 * 1024; // 20MB

    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        // Nome local, antes do envio: pode aparecer.
        toast({
          title: "Arquivo muito grande",
          description: `${file.name} excede o limite de 20 MB`,
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

  /**
   * Baixa anexos num ZIP com nomes anônimos ("anexo-01.jpg"). Serve tanto
   * para uma mensagem quanto para o chamado inteiro. No celular, tenta a
   * folha de compartilhar antes do download.
   */
  const baixarAnexosZip = async (anexos: Attachment[], nomeZip: string) => {
    if (anexos.length === 0) {
      toast({ title: "Nenhum anexo para baixar", variant: "destructive" });
      return;
    }

    try {
      const zip = new JSZip();
      let baixados = 0;

      for (let i = 0; i < anexos.length; i++) {
        const anexo = anexos[i];
        try {
          const partes = new URL(anexo.file_url).pathname.split('/object/public/');
          if (partes.length !== 2) continue;
          const [bucket, ...resto] = partes[1].split('/');

          const { data, error } = await supabase.storage.from(bucket).download(resto.join('/'));
          if (error || !data) {
            console.error('Erro ao baixar anexo:', error);
            continue;
          }

          // O nome real só serve de pista para a extensão; a entrada é "anexo-NN.ext".
          zip.file(await buildZipEntryNameFromBlob(i, data, anexo.file_name, anexo.file_type, anexo.file_url), data);
          baixados += 1;
        } catch (error) {
          console.error(`Erro ao processar anexo ${i + 1}:`, error);
        }
      }

      if (baixados === 0) {
        toast({ title: "Erro ao baixar", description: "Nenhum anexo pôde ser baixado.", variant: "destructive" });
        return;
      }

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const arquivo = new File([zipBlob], nomeZip, { type: 'application/zip' });

      if (zipBlob.size < 10 * 1024 * 1024 && typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: 'Anexos do chamado' });
          toast({ title: "Compartilhamento iniciado", description: `${baixados} arquivo(s)` });
          return;
        } catch (shareError) {
          // Cancelou a folha: não força um download por cima.
          if ((shareError as { name?: string })?.name === 'AbortError') return;
        }
      }

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeZip;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      // Revoga depois: no celular o download demora a começar.
      setTimeout(() => {
        URL.revokeObjectURL(url);
        link.remove();
      }, 3000);

      toast({ title: "Download iniciado", description: `${baixados} arquivo(s) compactado(s)` });
    } catch (error) {
      console.error('Erro ao gerar o ZIP:', error);
      toast({ title: "Erro ao baixar anexos", description: mensagemErro(error), variant: "destructive" });
    }
  };

  const downloadAllAttachments = async () => {
    if (downloadingAll) return;
    setDownloadingAll(true);
    try {
      await baixarAnexosZip(messages.flatMap(m => m.attachments || []), `chamado-${id?.substring(0, 8)}-anexos.zip`);
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
        title: "Resposta gerada",
        description: "Revise a sugestão antes de enviar.",
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar resposta",
        description: mensagemErro(error),
        variant: "destructive",
      });
    } finally {
      setGeneratingAI(false);
    }
  };

  const exportToMonday = async () => {
    if (!id) return;

    setExportingToMonday(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Entre novamente para exportar.');

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
        title: "Chamado exportado",
        description: data?.mondayUrl
          ? "Chamado criado no Monday.com."
          : "Chamado exportado para o Monday.",
      });

      // IDs das colunas do quadro, para configurar os secrets do Supabase.
      if (data?.columnsFound) {
        console.log('Colunas disponíveis no Monday:', data.columnsFound);
      }

      if (data?.mondayUrl) {
        window.open(data.mondayUrl, '_blank');
      }
    } catch (error) {
      console.error('Error exporting to Monday:', error);
      toast({
        title: "Erro ao exportar",
        description: mensagemErro(error),
        variant: "destructive",
      });
    } finally {
      setExportingToMonday(false);
    }
  };

  const abrirGaleria = (attachment: Attachment) => {
    if (!ehMidia(attachment)) return;
    const idx = allMediaItems.findIndex((item) => item.id === attachment.id);
    if (idx !== -1) {
      setGalleryStartIndex(idx);
      setGalleryOpen(true);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Estados de carregamento e "não encontrado"                              */
  /* ---------------------------------------------------------------------- */

  if (loading) {
    return (
      <PaginaInterna
        largura="media"
        comNavInferior
        cabecalho={<CabecalhoPagina titulo="Chamado" icone={<TicketIcon />} tom="info" voltarPara={voltarPara} />}
      >
        <CaixaCarregando icone={<Info />} titulo="Dados do chamado" linhas={3} />
        <CaixaCarregando icone={<MessagesSquare />} titulo="Conversa" tom="info" linhas={4} />
      </PaginaInterna>
    );
  }

  if (!ticket) {
    return (
      <PaginaInterna
        largura="media"
        comNavInferior
        cabecalho={<CabecalhoPagina titulo="Chamado" icone={<TicketIcon />} tom="info" voltarPara={voltarPara} />}
      >
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="busca"
            title="Chamado não encontrado"
            description="Ele pode ter sido excluído ou você não tem acesso a ele."
            action={
              <Button variant="outline" onClick={() => navigate(voltarPara, { replace: true })}>
                <ArrowLeft className="h-4 w-4" />
                Voltar para a lista
              </Button>
            }
          />
        </Card>
      </PaginaInterna>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Página                                                                  */
  /* ---------------------------------------------------------------------- */

  const temAnexos = messages.some(m => m.attachments && m.attachments.length > 0);
  const mostrarDecisaoProprietario =
    ticket.kind === 'maintenance' && !ticket.essential && !!ticket.owner_action_due_at && !isTeamMember;
  // Mesma condição do SendToChargeButton, para não sobrar uma linha de ações vazia.
  const podeEnviarCobranca =
    isMaintenance &&
    ticket.status === 'concluido' &&
    !!ticket.charge_draft_amount_cents &&
    !ticket.charge_sent_at &&
    ticket.cost_responsible !== 'guest';
  const mostrarAcoesEquipe = isTeamMember && (canUpdate || podeEnviarCobranca);
  const subtituloCabecalho = `${ticket.properties?.name || "Sem imóvel"}${ticket.profiles?.name ? ` · ${ticket.profiles.name}` : ""}`;

  const acoesCabecalho = isTeamMember ? (
    <>
      <Button variant="outline" size="sm" className="h-9" onClick={() => setEditOpen(true)} aria-label="Editar chamado">
        <Pencil className="h-4 w-4" />
        <span className="hidden sm:inline">Editar</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-50 bg-popover">
          <DropdownMenuItem onClick={exportToMonday} disabled={exportingToMonday}>
            {exportingToMonday ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Exportar para Monday
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  ) : undefined;

  const mensagensPorDia = Object.entries(
    messages.reduce((groups, message) => {
      const date = format(new Date(message.created_at), "yyyy-MM-dd");
      (groups[date] ||= []).push(message);
      return groups;
    }, {} as Record<string, Message[]>),
  );

  return (
    <PaginaInterna
      largura="media"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo={ticket.subject}
          subtitulo={subtituloCabecalho}
          icone={<TicketIcon />}
          tom="info"
          voltarPara={voltarPara}
          acoes={acoesCabecalho}
        />
      }
    >
      {/* Dados do chamado */}
      <CaixaOperacao icone={<Info />} titulo="Dados do chamado" tom="neutral">
        <ListaDefinicoes colunas={2}>
          <Definicao rotulo="Imóvel" valor={ticket.properties?.name || "Sem imóvel"} icone={<Building2 />} />
          <Definicao rotulo="Proprietário" valor={ticket.profiles?.name} icone={<User />} />
          <Definicao rotulo="Tipo" valor={<EtiquetaTipoTicket tipo={ticket.ticket_type} />} icone={<Tag />} />
          <Definicao
            rotulo="Prioridade"
            valor={<EtiquetaPrioridadeTicket prioridade={ticket.priority} mostrarNormal />}
            icone={<Flag />}
          />
          <Definicao
            rotulo="Aberto em"
            valor={format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            icone={<Calendar />}
          />
          <Definicao rotulo="Status" valor={<EtiquetaStatusTicket status={ticket.status} />} icone={<Activity />} />
        </ListaDefinicoes>

        {ticket.description && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Descrição</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{ticket.description}</p>
          </div>
        )}

        {(ticket.kind === 'maintenance' || ticket.essential) && (
          <div className="mt-3">
            <TicketBadges ticket={ticket} />
          </div>
        )}

        {mostrarAcoesEquipe && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
            {isMaintenance && canUpdate && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setScheduleData({ scheduled_at: "", service_provider_id: "", observation: "", cost_responsible: "owner" });
                    setScheduleDialogOpen(true);
                  }}
                >
                  <Calendar className="h-4 w-4" />
                  Agendar
                </Button>
                <Button size="sm" onClick={() => setCompleteDialogOpen(true)}>
                  <CheckCircle className="h-4 w-4" />
                  Concluir manutenção
                </Button>
              </>
            )}
            {podeEnviarCobranca && (
              <SendToChargeButton
                ticket={{
                  id: ticket.id,
                  subject: ticket.subject,
                  owner_id: ticket.owner_id,
                  property_id: ticket.property_id,
                  cost_responsible: (ticket.cost_responsible as "owner" | "pm" | "guest" | null) ?? null,
                  charge_draft_amount_cents: ticket.charge_draft_amount_cents ?? null,
                  charge_draft_management_contribution_cents: ticket.charge_draft_management_contribution_cents ?? null,
                  charge_draft_category: ticket.charge_draft_category ?? null,
                  charge_draft_title: ticket.charge_draft_title ?? null,
                  charge_sent_at: ticket.charge_sent_at ?? null,
                }}
                size="sm"
                onSuccess={(chargeId) => navigate(`/cobranca/${chargeId}`)}
              />
            )}
            {!isMaintenance && canUpdate && (
              <Select value={ticket.status} onValueChange={(v) => alterarStatus(v as StatusTicket)} disabled={atualizandoStatus}>
                <SelectTrigger className="h-9 w-[200px]" aria-label="Alterar status do chamado">
                  <SelectValue placeholder="Mudar status" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  {ORDEM_STATUS_TICKET.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_TICKET[s].rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {mostrarDecisaoProprietario && (
          <div className="mt-3">
            <OwnerMaintenanceDecision
              ticket={{
                id: ticket.id,
                kind: ticket.kind || '',
                essential: ticket.essential || false,
                owner_decision: ticket.owner_decision || null,
                owner_action_due_at: ticket.owner_action_due_at || null,
                status: ticket.status,
                cost_responsible: ticket.cost_responsible ?? null,
              }}
              onUpdate={fetchTicketData}
            />
          </div>
        )}
      </CaixaOperacao>

      {/* Conversa */}
      <CaixaOperacao
        icone={<MessagesSquare />}
        titulo="Conversa"
        tom="info"
        selos={messages.length > 0 ? <SeloContagem>{messages.length}</SeloContagem> : undefined}
        acoes={
          <>
            {isTeamMember && <ConversationSummaryButton ticketId={id!} messageCount={messages.length} />}
            {temAnexos && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={downloadAllAttachments}
                disabled={downloadingAll}
                aria-label="Baixar todos os anexos"
                title="Baixar todos os anexos"
              >
                {downloadingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="hidden sm:inline">Baixar anexos</span>
              </Button>
            )}
          </>
        }
        semPadding
      >
        <div className="bg-muted/20 px-3 pb-4">
          {messages.length === 0 ? (
            <ChatEmptyState />
          ) : (
            mensagensPorDia.map(([date, dayMessages]) => (
              <div key={date}>
                <ChatDateDivider date={date} />
                {dayMessages.map((message, index) => {
                  const isOwnMessage = message.author_id === user?.id;
                  const messageReceipts = receipts[message.id] || [];
                  const prev = dayMessages[index - 1];
                  const grouped =
                    !!prev &&
                    prev.author_id === message.author_id &&
                    new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() <
                      5 * 60 * 1000;
                  // Nota interna tem fundo warning/10: texto de balão primário ficaria ilegível.
                  const corTexto = isOwnMessage && !message.is_internal ? "text-primary-foreground" : undefined;

                  return (
                    <ChatMessageBubble
                      key={message.id}
                      authorName={message.profiles?.name}
                      authorPhoto={message.profiles?.photo_url}
                      authorRole={message.profiles?.role}
                      createdAt={message.created_at}
                      isOwn={isOwnMessage}
                      isInternal={message.is_internal}
                      pending={message.id.startsWith("optimistic-")}
                      receipts={messageReceipts}
                      grouped={grouped}
                      body={message.body ? renderizarCorpo(message.body, corTexto) : undefined}
                      attachments={
                        message.attachments && message.attachments.length > 0 ? (
                          <div className="space-y-1.5">
                            {message.attachments.length > 1 && (
                              <div className="flex justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[11px]"
                                  onClick={() =>
                                    baixarAnexosZip(
                                      message.attachments!,
                                      `anexos-${format(new Date(message.created_at), "dd-MM-yyyy-HH-mm")}.zip`,
                                    )
                                  }
                                >
                                  <Download className="h-3 w-3" />
                                  Baixar todos
                                </Button>
                              </div>
                            )}
                            <div
                              className={`grid gap-1.5 ${
                                message.attachments.length > 1 ? "grid-cols-2" : "grid-cols-1"
                              }`}
                            >
                              {message.attachments.map((attachment) => (
                                <AttachmentBubble
                                  key={attachment.id}
                                  {...attachment}
                                  onDelete={
                                    isTeamMember
                                      ? async () => {
                                          const ok = await deleteAttachmentRow("ticket_attachments", attachment.id);
                                          if (ok) fetchMessages();
                                        }
                                      : undefined
                                  }
                                  onPreview={() => abrirGaleria(attachment)}
                                />
                              ))}
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

          <ChatTypingIndicator names={typingUsers.map((u) => u.name)} />
          <div ref={fimConversaRef} aria-hidden="true" />
        </div>
      </CaixaOperacao>

      {/* Compositor: no celular fica colado acima da barra inferior */}
      {canUpdate ? (
        <Card
          className={cn(
            "rounded-xl border-border/70 p-3 md:p-4",
            "sticky bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-20 shadow-lg md:static md:shadow-sm",
          )}
        >
          <div className="space-y-2.5">
            {isTeamMember && (
              <div className="flex items-center gap-2">
                <Input
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  placeholder="Instruções para a IA: ex. explique o bloqueio de datas e peça os períodos"
                  aria-label="Instruções para a IA"
                  className="h-9 text-sm"
                  disabled={generatingAI}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      generateAIResponse();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={generateAIResponse}
                  disabled={generatingAI || !aiInstructions.trim()}
                  aria-label="Gerar resposta com IA"
                  title="Gerar resposta com IA"
                >
                  {generatingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span className="hidden sm:inline">Gerar</span>
                </Button>
              </div>
            )}

            <Textarea
              placeholder="Escreva sua mensagem…"
              aria-label="Mensagem"
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                setTyping(e.target.value.length > 0);
              }}
              rows={3}
              className="min-h-[72px] resize-y text-sm"
            />

            <ChatFilePreviewRow files={selectedFiles} uploading={SEM_UPLOAD} onRemove={removeFile} />

            <div className="flex items-center justify-between gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading || sending}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || sending}
              >
                <Paperclip className="h-4 w-4" />
                <span className="hidden sm:inline">Anexar arquivo</span>
                <span className="sm:hidden">Anexar</span>
              </Button>
              <Button
                onClick={sendMessage}
                disabled={sending || uploading || (!newMessage.trim() && selectedFiles.length === 0)}
              >
                {sending || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {uploading ? "Enviando anexos…" : sending ? "Enviando…" : "Enviar"}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="rounded-xl border-border/70 bg-muted/40 p-4 text-center text-sm text-muted-foreground">
          Este chamado foi {ticket.status === 'concluido' ? 'concluído' : 'cancelado'} e não recebe mais mensagens.
        </Card>
      )}

      {/* Galeria de Mídia */}
      <MediaGallery
        items={allMediaItems}
        initialIndex={galleryStartIndex}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onDelete={isTeamMember ? async (item) => {
          const ok = await deleteAttachmentRow("ticket_attachments", item.id);
          if (ok) fetchMessages();
        } : undefined}
      />

      {/* Agendar manutenção */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar manutenção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="agendar-data">Data e hora</Label>
              <Input id="agendar-data" type="datetime-local" value={scheduleData.scheduled_at} onChange={(e) => setScheduleData({ ...scheduleData, scheduled_at: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agendar-profissional">Profissional</Label>
              <Select value={scheduleData.service_provider_id} onValueChange={(v) => setScheduleData({ ...scheduleData, service_provider_id: v })}>
                <SelectTrigger id="agendar-profissional"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  {providers.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agendar-custo">Responsável pelo custo</Label>
              <Select value={scheduleData.cost_responsible} onValueChange={(v) => setScheduleData({ ...scheduleData, cost_responsible: v as "owner" | "pm" | "guest" })}>
                <SelectTrigger id="agendar-custo"><SelectValue /></SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  <SelectItem value="owner">Proprietário</SelectItem>
                  <SelectItem value="pm">Gestão</SelectItem>
                  <SelectItem value="guest">Hóspede</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agendar-obs">Observação (opcional)</Label>
              <Textarea id="agendar-obs" value={scheduleData.observation} onChange={(e) => setScheduleData({ ...scheduleData, observation: e.target.value })} placeholder="Adicione uma observação…" rows={2} />
            </div>
            <Button onClick={handleSchedule} disabled={savingSchedule} className="w-full">
              {savingSchedule && <Loader2 className="h-4 w-4 animate-spin" />}
              {savingSchedule ? "Salvando…" : "Confirmar agendamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Concluir e cobrar */}
      <CompleteMaintenanceDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        ticket={{
          id: ticket.id,
          subject: ticket.subject,
          cost_responsible: (ticket.cost_responsible as "owner" | "pm" | "guest" | null) ?? null,
          owner: { id: ticket.owner_id, name: ticket.profiles?.name || "" },
          property: ticket.properties ? { id: ticket.property_id!, name: ticket.properties.name } : null,
        }}
        onSuccess={() => {
          fetchTicketData();
        }}
      />

      {/* Editar (só equipe) */}
      {isTeamMember && ticket && (
        ticket.ticket_type === 'manutencao' ? (
          <EditMaintenanceDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            editId={ticket.id}
            type="maintenance"
            onSaved={() => fetchTicketData()}
          />
        ) : (
          <EditTicketDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            ticketId={ticket.id}
            onSaved={() => fetchTicketData()}
          />
        )
      )}
    </PaginaInterna>
  );
}
