import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useMaintenanceChat, ChatMessage } from "@/hooks/useMaintenanceChat";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, Loader2, MessageSquare, Building, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface MaintenanceChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string | null;
  ticketSubject?: string;
  propertyName?: string;
}

export function MaintenanceChatDialog({
  open,
  onOpenChange,
  ticketId,
  ticketSubject,
  propertyName,
}: MaintenanceChatDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { messages, loading, sending, typingUsers, sendMessage, setTyping } = useMaintenanceChat(
    open ? ticketId : null
  );
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!newMessage.trim() || sending) return;
    
    const success = await sendMessage(newMessage);
    if (success) {
      setNewMessage("");
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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const isTeamMember = (role: string) => {
    return ["admin", "agent", "maintenance"].includes(role);
  };

  const renderMessage = (message: ChatMessage) => {
    const isOwnMessage = message.author?.id === user?.id;
    const authorIsTeam = message.author?.role && isTeamMember(message.author.role);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[80vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base truncate">
                {ticketSubject || "Mensagens"}
              </DialogTitle>
              {propertyName && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <Building className="h-3 w-3" />
                  {propertyName}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                onOpenChange(false);
                navigate(`/ticket-detalhes/${ticketId}`);
              }}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Ver completo
            </Button>
          </div>
        </DialogHeader>

        {/* Messages area */}
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

        {/* Input area */}
        <div className="p-3 border-t flex-shrink-0">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={newMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              className="min-h-[40px] max-h-[120px] resize-none"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              size="icon"
              className="flex-shrink-0"
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
  );
}
