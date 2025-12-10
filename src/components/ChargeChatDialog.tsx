import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { AttachmentBubble } from "@/components/AttachmentBubble";
import { MediaGallery } from "@/components/MediaGallery";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, Loader2, MessageSquare, Building, ExternalLink, Paperclip, X, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface ChargeMessage {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  is_internal: boolean;
  profiles: {
    id: string;
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

interface MediaItem {
  id: string;
  file_url: string;
  file_name?: string | null;
  file_type?: string | null;
  size_bytes?: number | null;
}

interface ChargeChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chargeId: string | null;
  chargeTitle?: string;
  propertyName?: string;
}

export function ChargeChatDialog({
  open,
  onOpenChange,
  chargeId,
  chargeTitle,
  propertyName,
}: ChargeChatDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChargeMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [generatingAI, setGeneratingAI] = useState(false);
  const [allMediaItems, setAllMediaItems] = useState<MediaItem[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';

  useEffect(() => {
    if (open && chargeId) {
      fetchMessages();
      
      // Realtime subscription
      const channel = supabase
        .channel(`charge-chat-${chargeId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'charge_messages',
            filter: `charge_id=eq.${chargeId}`
          },
          () => {
            fetchMessages();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [open, chargeId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const fetchMessages = async () => {
    if (!chargeId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("charge_messages")
        .select(`
          id,
          body,
          created_at,
          author_id,
          is_internal,
          profiles:author_id (id, name, photo_url, role)
        `)
        .eq("charge_id", chargeId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Fetch attachments for each message
      const messagesWithAttachments = await Promise.all(
        (data || []).map(async (msg) => {
          const { data: attachments } = await supabase
            .from("charge_message_attachments")
            .select("id, file_name, file_path, file_size, mime_type")
            .eq("message_id", msg.id);

          return {
            ...msg,
            attachments: attachments || [],
          };
        })
      );

      setMessages(messagesWithAttachments as ChargeMessage[]);

      // Build media items for gallery
      const mediaItems: MediaItem[] = [];
      for (const msg of messagesWithAttachments) {
        for (const att of msg.attachments || []) {
          if (att.mime_type?.startsWith('image/') || att.mime_type?.startsWith('video/')) {
            const { data } = await supabase.storage
              .from('charge-attachments')
              .createSignedUrl(att.file_path, 3600);
            if (data?.signedUrl) {
              mediaItems.push({
                id: att.id,
                file_url: data.signedUrl,
                file_name: att.file_name,
                file_type: att.mime_type,
                size_bytes: att.file_size,
              });
            }
          }
        }
      }
      setAllMediaItems(mediaItems);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() && selectedFiles.length === 0) return;
    if (!chargeId || !user) return;
    if (sending) return;

    setSending(true);
    try {
      // Create message
      const { data: messageData, error: messageError } = await supabase
        .from("charge_messages")
        .insert({
          charge_id: chargeId,
          author_id: user.id,
          body: newMessage.trim(),
          is_internal: false,
        })
        .select()
        .single();

      if (messageError) throw messageError;

      // Upload attachments
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          setUploadingFiles(prev => new Set(prev).add(file.name));
          
          const filePath = `${chargeId}/${Date.now()}_${file.name}`;
          
          const { error: uploadError } = await supabase.storage
            .from('charge-attachments')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          await supabase.from("charge_message_attachments").insert({
            message_id: messageData.id,
            charge_id: chargeId,
            created_by: user.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            mime_type: file.type,
          });
          
          setUploadingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
        }
      }

      setNewMessage("");
      setSelectedFiles([]);
      fetchMessages();

      // Notify via edge function
      supabase.functions.invoke('notify-charge-message', {
        body: { chargeId, messageId: messageData.id }
      }).catch(console.error);
    } catch (error: any) {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    
    const files = Array.from(event.target.files);
    const maxSize = 20 * 1024 * 1024;
    
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

  const generateAIResponse = async () => {
    if (!chargeId) return;

    try {
      setGeneratingAI(true);
      
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: {
          templateKey: 'charge_response',
          chargeId: chargeId,
          customInstructions: "Responda de forma profissional e amigável sobre a cobrança"
        }
      });

      if (error) throw error;

      setNewMessage(data.text);
      toast({
        title: "Resposta gerada!",
        description: "A IA gerou uma sugestão de resposta.",
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

  const handleVoiceTranscript = async (text: string) => {
    if (!chargeId) {
      setNewMessage(prev => prev ? `${prev} ${text}` : text);
      return;
    }

    try {
      setGeneratingAI(true);
      toast({
        title: "Gerando resposta...",
        description: "A IA está criando uma resposta baseada no seu áudio.",
      });
      
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: {
          templateKey: 'charge_response',
          chargeId: chargeId,
          customInstructions: `Baseado nas instruções do atendente: "${text}", gere uma resposta profissional e amigável para o proprietário.`
        }
      });

      if (error) throw error;

      setNewMessage(data.text);
      toast({
        title: "Resposta gerada!",
        description: "A IA gerou uma resposta baseada no seu áudio.",
      });
    } catch (error: any) {
      setNewMessage(prev => prev ? `${prev} ${text}` : text);
      toast({
        title: "Erro ao gerar resposta",
        description: "Usando transcrição direta. " + error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingAI(false);
    }
  };

  const handlePreviewMedia = async (filePath: string, fileName: string) => {
    const { data } = await supabase.storage
      .from('charge-attachments')
      .createSignedUrl(filePath, 3600);
    
    if (data?.signedUrl) {
      const index = allMediaItems.findIndex(item => item.file_url === data.signedUrl);
      if (index >= 0) {
        setGalleryStartIndex(index);
        setGalleryOpen(true);
      }
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const isTeamMemberRole = (role: string) => {
    return ["admin", "agent", "maintenance"].includes(role);
  };

  const renderMessage = (message: ChargeMessage) => {
    const isOwnMessage = message.author_id === user?.id;
    const authorIsTeam = message.profiles?.role && isTeamMemberRole(message.profiles.role);

    return (
      <div
        key={message.id}
        className={`flex gap-2 ${isOwnMessage ? "flex-row-reverse" : ""}`}
      >
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={message.profiles?.photo_url || undefined} />
          <AvatarFallback className={authorIsTeam ? "bg-primary/20" : "bg-muted"}>
            {message.profiles?.name ? getInitials(message.profiles.name) : "?"}
          </AvatarFallback>
        </Avatar>
        <div
          className={`flex flex-col max-w-[75%] ${isOwnMessage ? "items-end" : "items-start"}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium">
              {message.profiles?.name || "Desconhecido"}
            </span>
            {authorIsTeam && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                Equipe
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(message.created_at), "HH:mm", { locale: ptBR })}
            </span>
          </div>
          
          {message.body && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                isOwnMessage
                  ? "bg-primary text-primary-foreground"
                  : authorIsTeam
                  ? "bg-blue-500/10 border border-blue-500/20"
                  : "bg-muted"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            </div>
          )}
          
          {message.attachments && message.attachments.length > 0 && (
            <div className={`grid gap-2 mt-2 ${message.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {message.attachments.map((att) => (
                <AttachmentBubble
                  key={att.id}
                  id={att.id}
                  file_url={att.file_path}
                  file_name={att.file_name}
                  file_type={att.mime_type || undefined}
                  size_bytes={att.file_size || undefined}
                  onPreview={() => handlePreviewMedia(att.file_path, att.file_name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const groupedMessages = messages.reduce((groups, message) => {
    const date = format(new Date(message.created_at), "yyyy-MM-dd");
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {} as Record<string, ChargeMessage[]>);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-lg h-[85vh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 pr-12 border-b flex-shrink-0">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-base truncate">
                {chargeTitle || "Mensagens da Cobrança"}
              </DialogTitle>
              <div className="flex items-center justify-between">
                {propertyName && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building className="h-3 w-3" />
                    {propertyName}
                  </div>
                )}
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs h-auto p-0 text-primary"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/cobranca/${chargeId}`);
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Ver detalhes completos
                </Button>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 px-4" ref={scrollRef}>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma mensagem ainda</p>
                <p className="text-xs">Envie uma mensagem para iniciar a conversa</p>
              </div>
            ) : (
              <div className="py-4 space-y-4">
                {Object.entries(groupedMessages).map(([date, dayMessages]) => (
                  <div key={date}>
                    <div className="flex items-center gap-2 my-4">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] text-muted-foreground px-2 bg-background">
                        {format(new Date(date), "dd 'de' MMMM", { locale: ptBR })}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="space-y-3">
                      {dayMessages.map(renderMessage)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {selectedFiles.length > 0 && (
            <div className="px-3 py-2 border-t flex flex-wrap gap-2">
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs"
                >
                  {uploadingFiles.has(file.name) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Paperclip className="h-3 w-3" />
                  )}
                  <span className="truncate max-w-[100px]">{file.name}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={uploadingFiles.has(file.name)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="p-3 border-t flex-shrink-0 space-y-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            />
            
            {/* Row 1: Microphone + AI (team only) */}
            {isTeamMember && (
              <div className="flex gap-2">
                <VoiceToTextInput
                  onTranscript={handleVoiceTranscript}
                  disabled={sending || generatingAI}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={generateAIResponse}
                  disabled={sending || generatingAI}
                  title="Gerar resposta com IA"
                >
                  {generatingAI ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span className="text-xs">Gerar resposta</span>
                </Button>
              </div>
            )}
            
            {/* Row 2: Attachment + Message + Send */}
            <div className="flex gap-2 items-end">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="Anexar arquivo"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              
              <Textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem..."
                className="flex-1 min-h-[40px] max-h-[120px] resize-none"
                disabled={sending}
              />
              
              <Button
                onClick={handleSend}
                disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending}
                size="icon"
                className="h-10 w-10 flex-shrink-0"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MediaGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        items={allMediaItems}
        initialIndex={galleryStartIndex}
      />
    </>
  );
}
