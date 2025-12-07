import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Paperclip, Loader2, Sparkles, FileText, ChevronDown, X, Download, ZoomIn, Upload } from "lucide-react";
import { AttachmentBubble } from "@/components/AttachmentBubble";
import { MediaGallery } from "@/components/MediaGallery";
import { LoadingScreen } from "@/components/LoadingScreen";
import { preloadMediaUrls } from "@/hooks/useMediaCache";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import JSZip from "jszip";

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

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';
  const canUpdate = ticket?.status !== 'concluido' && ticket?.status !== 'cancelado';

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

    try {
      setSending(true);
      
      // Upload de anexos primeiro se houver
      const attachments = [];
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          setUploadingFiles(prev => new Set(prev).add(file.name));
          
          const filePath = `${id}/${Date.now()}_${file.name}`;

          const { error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('attachments')
            .getPublicUrl(filePath);

          attachments.push({
            file_url: publicUrl,
            file_name: file.name,
            file_type: file.type,
            size_bytes: file.size,
            path: filePath
          });
          
          setUploadingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
        }
      }

      // Criar mensagem via edge function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke(`create-ticket-message/${id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: {
          message: newMessage.trim() || null,
          attachments,
          is_internal: false
        }
      });

      if (error) throw error;

      setNewMessage("");
      setSelectedFiles([]);
      toast({
        title: "Mensagem enviada!",
      });
      
      // Recarrega as mensagens
      await fetchMessages();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
      setUploadingFiles(new Set());
    }
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
    return <div>Ticket não encontrado</div>;
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
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{statusLabels[ticket.status as keyof typeof statusLabels]}</Badge>
                  <Badge>{ticket.priority}</Badge>
                  {ticket.properties && (
                    <Badge variant="secondary">Imóvel: {ticket.properties.name}</Badge>
                  )}
                </div>
              </div>
              {isTeamMember && (
                <Select
                  value={ticket.status}
                  onValueChange={async (newStatus: 'novo' | 'em_analise' | 'em_execucao' | 'aguardando_info' | 'concluido' | 'cancelado') => {
                    try {
                      const { error } = await supabase
                        .from('tickets')
                        .update({ status: newStatus })
                        .eq('id', id);

                      if (error) throw error;

                      setTicket({ ...ticket, status: newStatus });
                      toast({
                        title: "Status atualizado",
                        description: "O status do ticket foi alterado com sucesso.",
                      });
                    } catch (error: any) {
                      toast({
                        title: "Erro ao atualizar status",
                        description: error.message,
                        variant: "destructive",
                      });
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
        </Card>

        {messages.some(m => m.attachments && m.attachments.length > 0) && (
          <div className="mb-6 flex justify-end">
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
          </div>
        )}

        <div className="space-y-4 mb-6">
          {messages.map((message) => (
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
              </CardContent>
            </Card>
          ))}
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
    </div>
  );
}
