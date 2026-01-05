import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useMaintenanceChat, ChatMessage, ChatAttachment } from "@/hooks/useMaintenanceChat";
import { useAuth } from "@/hooks/useAuth";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { AttachmentBubble } from "@/components/AttachmentBubble";
import { MediaGallery } from "@/components/MediaGallery";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { ReadReceiptDisplay } from "@/components/ReadReceiptDisplay";
import OwnerMaintenanceDecision from "@/components/OwnerMaintenanceDecision";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, Loader2, MessageSquare, Building, ExternalLink, Paperclip, X, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { ResponseTemplatesPicker } from "@/components/ResponseTemplatesPicker";
import { ConversationSummaryButton } from "@/components/ConversationSummaryButton";
import { processFileForUpload } from "@/lib/processVideoForUpload";

interface MaintenanceChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string | null;
  ticketSubject?: string;
  propertyName?: string;
}

type OwnerDecisionTicket = {
  id: string;
  kind: string | null;
  essential: boolean | null;
  owner_decision: string | null;
  owner_action_due_at: string | null;
  status: string;
};

export function MaintenanceChatDialog({
  open,
  onOpenChange,
  ticketId,
  ticketSubject,
  propertyName,
}: MaintenanceChatDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { messages, loading, sending, typingUsers, allMediaItems, sendMessage, setTyping } = useMaintenanceChat(
    open ? ticketId : null
  );
  const [newMessage, setNewMessage] = useState("");
  const [aiCommand, setAiCommand] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [generatingAI, setGeneratingAI] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [decisionTicket, setDecisionTicket] = useState<OwnerDecisionTicket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';

  const fetchDecisionTicket = async () => {
    if (!ticketId) {
      setDecisionTicket(null);
      return;
    }

    // Only show decision UI for owners
    if (isTeamMember) {
      setDecisionTicket(null);
      return;
    }

    const { data, error } = await supabase
      .from('tickets')
      .select('id, kind, essential, owner_decision, owner_action_due_at, status')
      .eq('id', ticketId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching ticket decision state:', error);
      return;
    }

    setDecisionTicket((data || null) as OwnerDecisionTicket | null);
  };

  useEffect(() => {
    if (open) fetchDecisionTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticketId, isTeamMember]);

  // Read receipts for messages
  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { receipts, markAsRead } = useReadReceipts(messageIds, "ticket");

  // Mark messages as read when dialog opens or new messages arrive
  useEffect(() => {
    if (open && messages.length > 0 && user) {
      // Mark messages from others as read
      const otherMessages = messages
        .filter(m => m.author?.id !== user.id)
        .map(m => m.id);
      if (otherMessages.length > 0) {
        markAsRead(otherMessages);
      }
    }
  }, [open, messages, user, markAsRead]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = async () => {
    if (!newMessage.trim() && selectedFiles.length === 0) return;
    if (sending) return;

    try {
      // Upload attachments first
      const attachments: Array<{ file_url: string; file_name: string; file_type: string; size_bytes: number; path: string }> = [];
      
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          setUploadingFiles(prev => new Set(prev).add(file.name));
          
          // Compress video if it's a video file
          const processedFile = await processFileForUpload(file);
          const filePath = `${ticketId}/${Date.now()}_${processedFile.name}`;
          
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
          
          setUploadingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
        }
      }

      const success = await sendMessage(newMessage, attachments);
      if (success) {
        setNewMessage("");
        setSelectedFiles([]);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    setTyping(e.target.value.length > 0);
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

  const handleVoiceTranscript = (text: string) => {
    // Put transcription in the AI command box
    setAiCommand(prev => prev ? `${prev} ${text}` : text);
  };

  const generateAIResponse = async () => {
    if (!ticketId || !aiCommand.trim()) return;

    try {
      setGeneratingAI(true);
      toast({
        title: "Gerando resposta...",
        description: "A IA está criando uma resposta baseada no comando.",
      });
      
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: {
          templateKey: 'ticket_response',
          ticketId: ticketId,
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

  const handlePreviewMedia = (url: string, name: string) => {
    const index = allMediaItems.findIndex(item => item.file_url === url);
    if (index >= 0) {
      setGalleryStartIndex(index);
      setGalleryOpen(true);
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

  const renderMessage = (message: ChatMessage) => {
    const isOwnMessage = message.author?.id === user?.id;
    const authorIsTeam = message.author?.role && isTeamMemberRole(message.author.role);
    const messageReceipts = receipts[message.id] || [];

    return (
      <div
        key={message.id}
        className={`flex gap-2 ${isOwnMessage ? "flex-row-reverse" : ""}`}
      >
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={message.author?.photo_url || undefined} />
          <AvatarFallback className={authorIsTeam ? "bg-primary/20" : "bg-muted"}>
            {message.author?.name ? getInitials(message.author.name) : "?"}
          </AvatarFallback>
        </Avatar>
        <div
          className={`flex flex-col max-w-[75%] ${isOwnMessage ? "items-end" : "items-start"}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium">
              {message.author?.name || "Desconhecido"}
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
          
          {/* Message body */}
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
          
          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className={`grid gap-2 mt-2 ${message.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {message.attachments.map((att) => (
                <AttachmentBubble
                  key={att.id}
                  id={att.id}
                  file_url={att.file_url}
                  file_name={att.file_name}
                  file_type={att.file_type}
                  size_bytes={att.size_bytes}
                  onPreview={handlePreviewMedia}
                />
              ))}
            </div>
          )}

          {/* Read receipts */}
          <div className="mt-1">
            <ReadReceiptDisplay receipts={messageReceipts} isOwnMessage={isOwnMessage} />
          </div>
        </div>
      </div>
    );
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = format(new Date(message.created_at), "yyyy-MM-dd");
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {} as Record<string, ChatMessage[]>);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-lg h-[85vh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-4 py-3 pr-12 border-b flex-shrink-0">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-base truncate">
                {ticketSubject || "Mensagens"}
              </DialogTitle>
              <div className="flex items-center justify-between">
                {propertyName && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building className="h-3 w-3" />
                    {propertyName}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <ConversationSummaryButton 
                    ticketId={ticketId || ''} 
                    messageCount={messages.length}
                  />
                  <Button
                    variant="link"
                    size="sm"
                    className="text-xs h-auto p-0 text-primary"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/ticket-detalhes/${ticketId}`);
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Ver detalhes
                  </Button>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Messages area */}
          <ScrollArea className="flex-1 px-4" ref={scrollRef}>
            {/* Owner decision block (if applicable) */}
            {decisionTicket && (
              <div className="py-4">
                <OwnerMaintenanceDecision ticket={decisionTicket as any} onUpdate={fetchDecisionTicket} />
              </div>
            )}

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
                    {/* Date separator */}
                    <div className="flex items-center gap-2 my-4">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] text-muted-foreground px-2 bg-background">
                        {format(new Date(date), "dd 'de' MMMM", { locale: ptBR })}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    {/* Messages */}
                    <div className="space-y-3">
                      {dayMessages.map(renderMessage)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span>
                  {typingUsers.map((u) => u.name).join(", ")} está digitando...
                </span>
              </div>
            )}
          </ScrollArea>

          {/* Selected files preview */}
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

          {/* Input area */}
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
            
            {/* Row 2: Templates + Attachment + Message + Send */}
            <div className="flex gap-2 items-end">
              <ResponseTemplatesPicker
                onSelect={(content) => setNewMessage(prev => prev ? `${prev}\n${content}` : content)}
                disabled={sending}
              />
              
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="Anexar arquivo"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              
              <Textarea
                ref={textareaRef}
                value={newMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Mensagem para enviar..."
                className="min-h-[40px] max-h-[120px] resize-none flex-1"
                rows={1}
              />
              
              <Button
                onClick={handleSend}
                disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending || uploadingFiles.size > 0}
                size="icon"
                className="h-10 w-10 flex-shrink-0"
              >
                {sending || uploadingFiles.size > 0 ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Media Gallery */}
      <MediaGallery
        items={allMediaItems.map(item => ({
          id: item.id,
          file_url: item.file_url,
          file_name: item.file_name,
          file_type: item.file_type
        }))}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        initialIndex={galleryStartIndex}
      />
    </>
  );
}
