import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { AttachmentBubble } from "@/components/AttachmentBubble";
import { MediaGallery } from "@/components/MediaGallery";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { ReadReceiptDisplay } from "@/components/ReadReceiptDisplay";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, Loader2, MessageSquare, Building, ExternalLink, Paperclip, X, Sparkles } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { useToast } from "@/hooks/use-toast";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import { sanitizeFilename } from "@/lib/storage";
import { useChatPresence } from "@/hooks/useChatPresence";
import { ChatDialogHeader } from "@/components/chat/ChatDialogHeader";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { ChatDateDivider } from "@/components/chat/ChatDateDivider";
import { ChatTypingIndicator } from "@/components/chat/ChatTypingIndicator";
import { ChatFilePreviewRow } from "@/components/chat/ChatFilePreviewRow";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";


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
  const { pathname } = useLocation();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChargeMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [aiCommand, setAiCommand] = useState("");
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

  // Read receipts for messages
  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { receipts, markAsRead } = useReadReceipts(messageIds, "charge");

  // Realtime presence / typing indicator
  const { typingUsers, onlineUsers, setTyping } = useChatPresence(
    chargeId ? `charge-${chargeId}` : null,
    open,
  );


  // Mark messages as read when dialog opens or new messages arrive
  useEffect(() => {
    if (open && messages.length > 0 && user) {
      // Mark messages from others as read
      const otherMessages = messages
        .filter(m => m.author_id !== user.id)
        .map(m => m.id);
      if (otherMessages.length > 0) {
        markAsRead(otherMessages);
      }
    }
  }, [open, messages, user, markAsRead]);

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
          if (att.mime_type?.startsWith('image/') || att.mime_type?.startsWith('video/') || att.mime_type === 'application/pdf') {
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
    if (!chargeId || !user || !profile) return;
    if (sending) return;

    const messageText = newMessage.trim();
    const filesToUpload = [...selectedFiles];

    // Create optimistic message immediately - user sees it instantly
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: ChargeMessage = {
      id: optimisticId,
      body: messageText,
      created_at: new Date().toISOString(),
      author_id: user.id,
      is_internal: false,
      profiles: {
        id: user.id,
        name: profile.name,
        photo_url: profile.photo_url,
        role: profile.role,
      },
      attachments: filesToUpload.map((file, i) => ({
        id: `optimistic-att-${i}`,
        file_name: file.name,
        file_path: URL.createObjectURL(file),
        file_size: file.size,
        mime_type: file.type,
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
        // Create message
        const { data: messageData, error: messageError } = await supabase
          .from("charge_messages")
          .insert({
            charge_id: chargeId,
            author_id: user.id,
            body: messageText,
            is_internal: false,
          })
          .select()
          .single();

        if (messageError) throw messageError;

        // Upload attachments
        if (filesToUpload.length > 0) {
          for (const file of filesToUpload) {
            // Compress video if it's a video file
            const processedFile = await processFileForUpload(file);
            const safeName = sanitizeFilename(processedFile.name);
            const filePath = `${chargeId}/${Date.now()}_${safeName}`;
            
            const { error: uploadError } = await supabase.storage
              .from('charge-attachments')
              .upload(filePath, processedFile);

            if (uploadError) throw uploadError;

            await supabase.from("charge_message_attachments").insert({
              message_id: messageData.id,
              charge_id: chargeId,
              created_by: user.id,
              file_name: processedFile.name,
              file_path: filePath,
              file_size: processedFile.size,
              mime_type: processedFile.type,
            });
          }
        }

        // Notify via edge function
        supabase.functions.invoke('notify-charge-message', {
          body: { chargeId, messageId: messageData.id }
        }).catch(console.error);
        
        // Refetch to get real message with proper IDs
        fetchMessages();
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
    if (!chargeId || !aiCommand.trim()) return;

    try {
      setGeneratingAI(true);
      toast({
        title: "Gerando resposta...",
        description: "A IA está criando uma resposta baseada no comando.",
      });
      
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: {
          templateKey: 'charge_response',
          chargeId: chargeId,
          customInstructions: `Baseado nas instruções do atendente: "${aiCommand}", gere uma resposta profissional e amigável para o proprietário.`
        }
      });

      if (error) throw error;

      setNewMessage(data.text);
      setAiCommand(""); // Clear the command after generating
      toast({
        title: "Resposta gerada!",
        description: "A IA gerou uma resposta. Revise e envie.",
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

  const handleVoiceTranscript = (text: string) => {
    // Put transcription in the AI command box
    setAiCommand(prev => prev ? `${prev} ${text}` : text);
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

  const renderMessage = (message: ChargeMessage, index: number, dayMessages: ChargeMessage[]) => {
    const isOwnMessage = message.author_id === user?.id;
    const messageReceipts = receipts[message.id] || [];
    const prev = dayMessages[index - 1];
    const grouped =
      !!prev &&
      prev.author_id === message.author_id &&
      new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;

    return (
      <ChatMessageBubble
        key={message.id}
        authorName={message.profiles?.name}
        authorPhoto={message.profiles?.photo_url}
        authorRole={message.profiles?.role}
        createdAt={message.created_at}
        isOwn={isOwnMessage}
        receipts={messageReceipts}
        grouped={grouped}
        body={message.body || undefined}
        attachments={
          message.attachments && message.attachments.length > 0 ? (
            <div
              className={`grid gap-1.5 ${
                message.attachments.length > 1 ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
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
          ) : undefined
        }
      />
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
        <DialogContent className="w-[95vw] max-w-lg h-[85vh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
          <ChatDialogHeader
            title={chargeTitle || "Mensagens da Cobrança"}
            propertyName={propertyName}
            live={onlineUsers.length > 0}
            actions={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-primary"
                onClick={() => {
                  onOpenChange(false);
                  (saveScrollPosition(pathname), navigate(`/cobranca/${chargeId}`));
                }}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Detalhes
              </Button>
            }
          />

          <ScrollArea className="flex-1 bg-muted/20 px-3" ref={scrollRef}>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <ChatEmptyState description="Envie uma mensagem sobre esta cobrança — a conversa é em tempo real." />
            ) : (
              <div className="pb-3">
                {Object.entries(groupedMessages).map(([date, dayMessages]) => (
                  <div key={date}>
                    <ChatDateDivider date={date} />
                    {dayMessages.map((m, i) => renderMessage(m, i, dayMessages))}
                  </div>
                ))}
              </div>
            )}

            <ChatTypingIndicator names={typingUsers.map((u) => u.name)} />
          </ScrollArea>

          <ChatFilePreviewRow
            files={selectedFiles}
            uploading={uploadingFiles}
            onRemove={removeFile}
          />


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
            
            {/* Row 1: Microphone + AI Command + Generate Button (team only) */}
            {isTeamMember && (
              <div className="flex gap-2 items-end">
                <VoiceToTextInput
                  onTranscript={handleVoiceTranscript}
                  disabled={sending || generatingAI}
                />
                <Textarea
                  value={aiCommand}
                  onChange={(e) => setAiCommand(e.target.value)}
                  placeholder="Comando para IA (grave áudio ou digite)..."
                  className="min-h-[36px] max-h-[80px] resize-none flex-1 text-sm"
                  rows={1}
                  disabled={generatingAI}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 flex-shrink-0"
                  onClick={generateAIResponse}
                  disabled={sending || generatingAI || !aiCommand.trim()}
                  title="Gerar resposta com IA"
                >
                  {generatingAI ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span className="text-xs hidden sm:inline">Gerar</span>
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
                placeholder="Mensagem para enviar..."
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
        onDelete={isTeamMember ? async (item) => {
          const { deleteAttachmentRow } = await import("@/lib/deleteAttachment");
          const ok = await deleteAttachmentRow("charge_message_attachments", item.id);
          if (ok) fetchMessages();
        } : undefined}
      />
    </>
  );
}
