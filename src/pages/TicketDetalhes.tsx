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
import { ArrowLeft, Send, Paperclip, Loader2, Sparkles, FileText, ChevronDown, X, Download, ZoomIn } from "lucide-react";
import { AttachmentBubble } from "@/components/AttachmentBubble";
import { AttachmentInspector } from "@/components/AttachmentInspector";
import { MediaGallery } from "@/components/MediaGallery";
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
  const [showDocDialog, setShowDocDialog] = useState(false);
  const [documentType, setDocumentType] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [allMediaItems, setAllMediaItems] = useState<Attachment[]>([]);

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent';
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
        body: { ticketId: id },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;
      setMessages(data || []);
      
      // Coletar todos os anexos de mídia para a galeria
      const mediaItems: Attachment[] = [];
      (data || []).forEach((msg: Message) => {
        msg.attachments?.forEach((att) => {
          if (att.file_type?.startsWith('image/') || att.file_type?.startsWith('video/')) {
            mediaItems.push(att);
          }
        });
      });
      setAllMediaItems(mediaItems);
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

      const { data, error } = await supabase.functions.invoke(`create-ticket-message/${id}/messages`, {
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

  const downloadAllAttachments = async () => {
    try {
      setDownloadingAll(true);
      
      // Coleta todos os anexos de todas as mensagens
      const allAttachments = messages.flatMap(m => m.attachments || []);
      
      if (allAttachments.length === 0) {
        toast({
          title: "Nenhum anexo encontrado",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Preparando download...",
        description: `Processando ${allAttachments.length} arquivo(s)...`,
      });

      const zip = new JSZip();
      let successCount = 0;
      
      for (let i = 0; i < allAttachments.length; i++) {
        const attachment = allAttachments[i];
        try {
          console.log(`📥 Baixando ${i + 1}/${allAttachments.length}: ${attachment.file_name}`);
          
          // Extrai o path do storage da URL
          const urlParts = attachment.file_url.split('/object/public/');
          if (urlParts.length !== 2) {
            throw new Error('URL inválida');
          }
          
          const [bucket, ...pathParts] = urlParts[1].split('/');
          const filePath = pathParts.join('/');
          
          console.log(`📂 Bucket: ${bucket}, Path: ${filePath}`);
          
          // Baixa usando a API do Supabase
          const { data, error } = await supabase.storage
            .from(bucket)
            .download(filePath);
          
          if (error) {
            console.error(`❌ Erro Supabase:`, error);
            throw error;
          }
          
          if (!data) {
            throw new Error('Arquivo vazio');
          }
          
          const fileName = attachment.file_name || `arquivo_${i + 1}`;
          zip.file(fileName, data);
          successCount++;
          
          console.log(`✅ Arquivo ${fileName} adicionado ao ZIP`);
          
          // Atualiza progresso
          if ((i + 1) % 3 === 0 || i === allAttachments.length - 1) {
            toast({
              title: "Baixando...",
              description: `${i + 1}/${allAttachments.length} arquivos processados`,
            });
          }
        } catch (error) {
          console.error(`❌ Erro ao processar ${attachment.file_name}:`, error);
          // Continua com os próximos arquivos
        }
      }

      if (successCount === 0) {
        toast({
          title: "Erro",
          description: "Não foi possível baixar nenhum arquivo",
          variant: "destructive",
        });
        return;
      }

      console.log(`🗜️ Compactando ${successCount} arquivos...`);
      
      toast({
        title: "Compactando...",
        description: `Gerando arquivo ZIP com ${successCount} arquivo(s)`,
      });

      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
      
      console.log(`📦 ZIP gerado: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`);
      
      // Força o download
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `anexos-ticket-${ticket?.subject?.substring(0, 30) || id}.zip`;
      
      document.body.appendChild(a);
      a.click();
      
      console.log(`⬇️ Download iniciado`);
      
      // Limpa recursos após um delay
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);

      toast({
        title: "✅ Download concluído!",
        description: `${successCount} arquivo(s) compactados`,
      });
    } catch (error: any) {
      console.error('❌ Erro geral ao baixar anexos:', error);
      toast({
        title: "Erro ao baixar anexos",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setDownloadingAll(false);
    }
  };

  const generateAIResponse = async () => {
    try {
      setGeneratingAI(true);
      
      // Prepara o contexto do ticket e mensagens
      const messagesContext = messages
        .map(m => `${m.profiles.name}: ${m.body}`)
        .join('\n');

      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'generate_response',
          context: {
            subject: ticket?.subject,
            description: ticket?.description,
            messages: messagesContext
          }
        }
      });

      if (error) throw error;

      setNewMessage(data.result);
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

  const generateDocument = async () => {
    if (!documentType) {
      toast({
        title: "Selecione um tipo de documento",
        variant: "destructive",
      });
      return;
    }

    try {
      setGeneratingAI(true);
      setShowDocDialog(false);
      
      const messagesContext = messages
        .map(m => `${m.profiles.name}: ${m.body}`)
        .join('\n');

      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'generate_document',
          context: {
            documentType,
            subject: ticket?.subject,
            description: ticket?.description,
            messages: messagesContext,
            propertyName: ticket?.properties?.name,
            ownerName: ticket?.profiles.name
          }
        }
      });

      if (error) throw error;

      // Criar arquivo e fazer download
      const blob = new Blob([data.result], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentType.toLowerCase().replace(/ /g, '_')}_ticket_${id}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Documento gerado!",
        description: "O download iniciou automaticamente.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao gerar documento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingAI(false);
      setDocumentType("");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <AttachmentInspector ticketId={id!} />
        
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
                  <p className="text-muted-foreground whitespace-pre-wrap">{message.body}</p>
                )}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-muted-foreground font-medium">
                      Anexos ({message.attachments.length})
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
                    
                    {isTeamMember && (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              disabled={generatingAI}
                            >
                              {generatingAI ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="mr-2 h-4 w-4" />
                              )}
                              IA Assistente
                              <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={generateAIResponse}>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Gerar Resposta
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowDocDialog(true)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Gerar Documento
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Dialog open={showDocDialog} onOpenChange={setShowDocDialog}>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Gerar Documento com IA</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="doc-type">Tipo de Documento</Label>
                                <Select value={documentType} onValueChange={setDocumentType}>
                                  <SelectTrigger id="doc-type">
                                    <SelectValue placeholder="Selecione o tipo de documento" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Relatório de Atendimento">Relatório de Atendimento</SelectItem>
                                    <SelectItem value="Termo de Conclusão">Termo de Conclusão</SelectItem>
                                    <SelectItem value="Protocolo de Serviço">Protocolo de Serviço</SelectItem>
                                    <SelectItem value="Carta de Comunicação">Carta de Comunicação</SelectItem>
                                    <SelectItem value="Resumo Executivo">Resumo Executivo</SelectItem>
                                    <SelectItem value="Proposta de Solução">Proposta de Solução</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button onClick={generateDocument} className="w-full">
                                <FileText className="mr-2 h-4 w-4" />
                                Gerar e Baixar
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}
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
