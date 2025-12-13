import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageCircle, ChevronDown, ChevronUp, Send, X } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TeamMessage {
  id: string;
  body: string;
  created_at: string;
  author: {
    id: string;
    name: string;
    photo_url: string | null;
  };
}

const LAST_READ_KEY = 'team_chat_last_read';

export function TeamChatWidget() {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if user is team member
  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';

  const getLastReadTime = () => {
    const stored = localStorage.getItem(LAST_READ_KEY);
    return stored ? new Date(stored) : new Date(0);
  };

  const updateLastReadTime = () => {
    localStorage.setItem(LAST_READ_KEY, new Date().toISOString());
    setUnreadCount(0);
  };

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('team_chat_messages')
        .select(`
          id,
          body,
          created_at,
          author:profiles!team_chat_messages_author_id_fkey (
            id,
            name,
            photo_url
          )
        `)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      const formattedMessages = (data || []).map((msg: any) => ({
        id: msg.id,
        body: msg.body,
        created_at: msg.created_at,
        author: {
          id: msg.author?.id || '',
          name: msg.author?.name || 'Usuário',
          photo_url: msg.author?.photo_url
        }
      }));

      setMessages(formattedMessages);

      // Calculate unread count
      const lastRead = getLastReadTime();
      const unread = formattedMessages.filter(
        msg => new Date(msg.created_at) > lastRead && msg.author.id !== user?.id
      ).length;
      setUnreadCount(unread);

    } catch (error) {
      console.error('Error fetching team messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || sending) return;

    const messageBody = newMessage.trim();
    setNewMessage('');
    setSending(true);

    // Optimistic update
    const optimisticMessage: TeamMessage = {
      id: `temp-${Date.now()}`,
      body: messageBody,
      created_at: new Date().toISOString(),
      author: {
        id: user.id,
        name: profile?.name || 'Você',
        photo_url: profile?.photo_url || null
      }
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const { error } = await supabase
        .from('team_chat_messages')
        .insert({
          author_id: user.id,
          body: messageBody
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      setNewMessage(messageBody);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return format(date, 'HH:mm', { locale: ptBR });
    }
    if (isYesterday(date)) {
      return `Ontem ${format(date, 'HH:mm', { locale: ptBR })}`;
    }
    return format(date, "dd/MM HH:mm", { locale: ptBR });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Fetch messages on mount
  useEffect(() => {
    if (isTeamMember) {
      fetchMessages();
    }
  }, [isTeamMember]);

  // Real-time subscription
  useEffect(() => {
    if (!isTeamMember) return;

    const channel = supabase
      .channel('team-chat-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_chat_messages'
        },
        async (payload) => {
          // Fetch the full message with author info
          const { data } = await supabase
            .from('team_chat_messages')
            .select(`
              id,
              body,
              created_at,
              author:profiles!team_chat_messages_author_id_fkey (
                id,
                name,
                photo_url
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            const newMsg: TeamMessage = {
              id: data.id,
              body: data.body,
              created_at: data.created_at,
              author: {
                id: (data.author as any)?.id || '',
                name: (data.author as any)?.name || 'Usuário',
                photo_url: (data.author as any)?.photo_url
              }
            };

            setMessages(prev => {
              // Avoid duplicates and replace optimistic messages
              const filtered = prev.filter(m => 
                m.id !== data.id && !m.id.startsWith('temp-')
              );
              return [...filtered, newMsg];
            });

            // Increment unread if not from current user and chat is closed
            if (newMsg.author.id !== user?.id && !isOpen) {
              setUnreadCount(prev => prev + 1);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isTeamMember, user?.id, isOpen]);

  // Scroll to bottom when messages change or chat opens
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      updateLastReadTime();
      inputRef.current?.focus();
    }
  }, [isOpen]);

  if (!isTeamMember) return null;

  return (
    <div className="w-full bg-card border-b border-border">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Chat da Equipe</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="h-5 min-w-5 flex items-center justify-center text-xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Chat content - Expandable */}
      {isOpen && (
        <div className="border-t border-border">
          <ScrollArea className="h-48 px-4 py-2" ref={scrollRef as any}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-sm text-muted-foreground">Carregando...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-sm text-muted-foreground">Nenhuma mensagem ainda. Comece a conversa!</span>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => {
                  const isOwn = msg.author.id === user?.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
                    >
                      <Avatar className="h-7 w-7 flex-shrink-0">
                        <AvatarImage src={msg.author.photo_url || undefined} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(msg.author.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`flex flex-col max-w-[75%] ${isOwn ? 'items-end' : ''}`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-medium text-foreground">
                            {isOwn ? 'Você' : msg.author.name.split(' ')[0]}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatMessageTime(msg.created_at)}
                          </span>
                        </div>
                        <div
                          className={`px-3 py-1.5 rounded-lg text-sm ${
                            isOwn
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Input area */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border">
            <Input
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              className="flex-1 h-8 text-sm"
              disabled={sending}
            />
            <Button
              size="sm"
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              className="h-8 w-8 p-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
