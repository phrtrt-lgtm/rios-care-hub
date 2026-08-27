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
import { useQueryClient } from "@tanstack/react-query";
import { AttachmentBubble } from "@/components/AttachmentBubble";
import { MediaGallery } from "@/components/MediaGallery";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { ReadReceiptDisplay } from "@/components/ReadReceiptDisplay";
import OwnerMaintenanceDecision from "@/components/OwnerMaintenanceDecision";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, Loader2, MessageSquare, Building, ExternalLink, Paperclip, X, Sparkles, CheckCircle2, DollarSign } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { useToast } from "@/hooks/use-toast";
import { ResponseTemplatesPicker } from "@/components/ResponseTemplatesPicker";
import { ConversationSummaryButton } from "@/components/ConversationSummaryButton";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import { sanitizeFilename } from "@/lib/storage";
import { NativeMediaPicker } from "@/components/NativeMediaPicker";
import { toast as sonnerToast } from "sonner";
import { MentionInput, MentionableUser, extractMentionedIds } from "@/components/comments/MentionInput";
import { MentionText } from "@/components/comments/MentionText";
import { ChatDialogHeader } from "@/components/chat/ChatDialogHeader";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { ChatDateDivider } from "@/components/chat/ChatDateDivider";
import { ChatTypingIndicator } from "@/components/chat/ChatTypingIndicator";
import { ChatFilePreviewRow } from "@/components/chat/ChatFilePreviewRow";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";


interface MaintenanceChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string | null;
  ticketSubject?: string;
  propertyName?: string;
  onTicketUpdated?: () => void;
}

type OwnerDecisionTicket = {
  id: string;
  kind: string | null;
  essential: boolean | null;
  owner_decision: string | null;
  owner_action_due_at: string | null;
  status: string;
  cost_responsible: string | null;
};

export function MaintenanceChatDialog({
  open,
  onOpenChange,
  ticketId,
  ticketSubject,
  propertyName,
  onTicketUpdated,
}: MaintenanceChatDialogProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { messages, loading, sending, typingUsers, allMediaItems, sendMessage, setTyping, refetch } = useMaintenanceChat(
    open ? ticketId : null
  );
  const [newMessage, setNewMessage] = useState("");
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [aiCommand, setAiCommand] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [generatingAI, setGeneratingAI] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [decisionTicket, setDecisionTicket] = useState<OwnerDecisionTicket | null>(null);
  const [ticketDetails, setTicketDetails] = useState<{ owner_id: string; property_id: string | null; status: string; description: string } | null>(null);
  const [completingTicket, setCompletingTicket] = useState(false);
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
      .select('id, kind, essential, owner_decision, owner_action_due_at, status, cost_responsible')
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

  // Fetch ticket details for action buttons
  useEffect(() => {
    if (!open || !ticketId || !isTeamMember) {
      setTicketDetails(null);
      return;
    }
    const fetchDetails = async () => {
      const { data } = await supabase
        .from('tickets')
        .select('owner_id, property_id, status, description')
        .eq('id', ticketId)
        .maybeSingle();
      if (data) setTicketDetails(data);
    };
    fetchDetails();
  }, [open, ticketId, isTeamMember]);

  const handleCompleteTicket = async () => {
    if (!ticketId) return;
    setCompletingTicket(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'concluido' })
        .eq('id', ticketId);
      if (error) throw error;
      setTicketDetails(prev => prev ? { ...prev, status: 'concluido' } : prev);
      sonnerToast.success('Chamado concluído!');
      // Invalidate all ticket/maintenance queries to update lists in real-time
      queryClient.invalidateQueries({ queryKey: ["maintenance-tickets-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["owner-tickets-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
      queryClient.invalidateQueries({ queryKey: ["completed-maintenances"] });
      queryClient.invalidateQueries({ queryKey: ["all-tickets"] });
      onTicketUpdated?.();
    } catch (error) {
      console.error('Error completing ticket:', error);
      sonnerToast.error('Erro ao concluir chamado');
    } finally {
      setCompletingTicket(false);
    }
  };

  const handleCreateCharge = () => {
    if (!ticketId || !ticketDetails) return;
    onOpenChange(false);
    navigate(`/nova-cobranca?owner_id=${ticketDetails.owner_id}&property_id=${ticketDetails.property_id || ''}&title=${encodeURIComponent((ticketSubject || '').substring(0, 100))}&description=${encodeURIComponent(ticketDetails.description || '')}`);
  };

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

  // Load mentionable users for this ticket
  useEffect(() => {
    if (!open || !ticketId) return;
    (async () => {
      const { data } = await supabase.rpc(
        "get_ticket_mentionable_users" as any,
        { _ticket_id: ticketId }
      );
      if (data) setMentionableUsers(data as MentionableUser[]);
    })();
  }, [open, ticketId]);

  const handleSend = async () => {
    if (!newMessage.trim() && selectedFiles.length === 0) return;
    if (sending) return;

    try {
      // Upload attachments first
      const attachments: Array<{ file_url: string; file_name: string; file_type: string; size_bytes: number; path: string }> = [];

      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          setUploadingFiles(prev => new Set(prev).add(file.name));

          try {
            // Compress video if it's a video file
            const processedFile = await processFileForUpload(file);
            const safeName = sanitizeFilename(processedFile.name);
            const filePath = `tickets/${ticketId}/${Date.now()}_${safeName}`;

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
          } finally {
            // ALWAYS clean up upload state, even on failure
            setUploadingFiles(prev => {
              const next = new Set(prev);
              next.delete(file.name);
              return next;
            });
          }
        }
      }

      const success = await sendMessage(newMessage, attachments);
      if (success) {
        // Fire and forget — notify mentioned users
        if (mentionedIds.length > 0 && ticketId && user) {
          supabase.functions.invoke("notify-mentions", {
            body: {
              entity_type: "ticket",
              entity_id: ticketId,
              mentioned_user_ids: mentionedIds,
              author_id: user.id,
              body: newMessage,
            },
          }).catch((e) => console.warn("notify-mentions failed", e));
        }
        setNewMessage("");
        setMentionedIds([]);
        setSelectedFiles([]);
      }
    } catch (error: any) {
      console.error('[MaintenanceChat] Erro ao enviar:', error);
      toast({
        title: "Erro ao enviar mensagem",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      // Safety net: ensure no file remains stuck in "uploading" state
      setUploadingFiles(new Set());
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

  const renderMessage = (message: ChatMessage, index: number, dayMessages: ChatMessage[]) => {
    const isOwnMessage = message.author?.id === user?.id;
    const messageReceipts = receipts[message.id] || [];
    const prev = dayMessages[index - 1];
    const grouped =
      !!prev &&
      prev.author?.id === message.author?.id &&
      new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;

    return (
      <ChatMessageBubble
        key={message.id}
        authorName={message.author?.name}
        authorPhoto={message.author?.photo_url}
        authorRole={message.author?.role}
        createdAt={message.created_at}
        isOwn={isOwnMessage}
        isInternal={message.is_internal}
        pending={message.id.startsWith("optimistic-")}
        receipts={messageReceipts}
        grouped={grouped}
        body={
          message.body ? (
            <MentionText
              body={message.body}
              className={isOwnMessage ? "text-primary-foreground" : ""}
            />
          ) : undefined
        }
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
                  file_url={att.file_url}
                  file_name={att.file_name}
                  file_type={att.file_type}
                  size_bytes={att.size_bytes}
                  onPreview={handlePreviewMedia}
                />
              ))}
            </div>
          ) : undefined
        }
      />
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
        <DialogContent className="w-[95vw] max-w-lg h-[85vh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
          <ChatDialogHeader
            title={ticketSubject || "Mensagens"}
            propertyName={propertyName}
            live={onlineUsers.length > 0}
            actions={
              <>
                <ConversationSummaryButton
                  ticketId={ticketId || ''}
                  messageCount={messages.length}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-primary"
                  onClick={() => {
                    onOpenChange(false);
                    (saveScrollPosition(pathname), navigate(`/ticket-detalhes/${ticketId}`));
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Detalhes
                </Button>
              </>
            }
            extra={
              <>
                {isTeamMember && ticketDetails && ticketDetails.status !== 'concluido' && ticketDetails.status !== 'cancelado' && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Button
                      variant="success"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={handleCompleteTicket}
                      disabled={completingTicket}
                    >
                      {completingTicket ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      )}
                      Concluir
                    </Button>
                    <Button
                      variant="warning"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={handleCreateCharge}
                    >
                      <DollarSign className="h-3 w-3 mr-1" />
                      Cobrar
                    </Button>
                  </div>
                )}
                {isTeamMember && ticketDetails?.status === 'concluido' && (
                  <Badge variant="secondary" className="mt-2 bg-success/20 text-success text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Concluído
                  </Badge>
                )}
              </>
            }
          />

          {/* Messages area */}
          <ScrollArea className="flex-1 bg-muted/20 px-3" ref={scrollRef}>
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
              <ChatEmptyState />
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

          {/* Selected files preview */}
          <ChatFilePreviewRow
            files={selectedFiles}
            uploading={uploadingFiles}
            onRemove={removeFile}
          />


          {/* Input area */}
          <div className="p-3 border-t flex-shrink-0 space-y-2">
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
              
              <NativeMediaPicker
                onFilesSelected={(files) => setSelectedFiles(prev => [...prev, ...files])}
                disabled={sending}
                buttonSize="icon"
                className="h-9 w-9 flex-shrink-0"
              />
              
              <div className="flex-1">
                <MentionInput
                  value={newMessage}
                  onChange={(v, ids) => {
                    setNewMessage(v);
                    setMentionedIds(ids);
                    setTyping(v.length > 0);
                  }}
                  users={mentionableUsers}
                  placeholder="Mensagem para enviar... use @ para mencionar"
                  rows={1}
                  disabled={sending}
                  onSubmit={handleSend}
                  className="min-h-[40px]"
                />
              </div>
              
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
        onDelete={isTeamMember ? async (item) => {
          const { deleteAttachmentRow } = await import("@/lib/deleteAttachment");
          const ok = await deleteAttachmentRow("ticket_attachments", item.id);
          if (ok) await refetch(true);
        } : undefined}
      />
    </>
  );
}
