import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { SeloContagem } from '@/components/painel/CaixaOperacao';
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';
import { ChatDateDivider } from '@/components/chat/ChatDateDivider';
import { ChatEmptyState } from '@/components/chat/ChatEmptyState';
import { MessageCircle, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { renderizarCorpo } from "@/components/chat/CorpoMensagem";

interface TeamMessage {
  id: string;
  body: string;
  created_at: string;
  author: {
    id: string;
    name: string;
    photo_url: string | null;
  };
  /** Ainda não confirmada pelo banco (otimista). */
  pending?: boolean;
}

const LAST_READ_KEY = 'team_chat_last_read';
const LIMITE = 100;
const ALTURA_MAXIMA_CAMPO = 128;
const PAPEIS_EQUIPE = ['admin', 'agent', 'maintenance'];

const SELECT_MENSAGEM = `
  id,
  body,
  created_at,
  author:profiles!team_chat_messages_author_id_fkey (
    id,
    name,
    photo_url
  )
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paraMensagem = (msg: any): TeamMessage => ({
  id: msg.id,
  body: msg.body,
  created_at: msg.created_at,
  author: {
    id: msg.author?.id || '',
    name: msg.author?.name || 'Usuário',
    photo_url: msg.author?.photo_url ?? null,
  },
});

/** Dia local da mensagem, chave do divisor "Hoje / Ontem / 12 de maio". */
const diaLocal = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

export function TeamChatWidget() {
  const { user, profile, loading: authLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // O realtime lê daqui se o chat está aberto, sem reinscrever a cada abrir/fechar.
  const abertoRef = useRef(isOpen);

  useEffect(() => {
    abertoRef.current = isOpen;
  }, [isOpen]);

  const isTeamMember = !authLoading && PAPEIS_EQUIPE.includes(profile?.role ?? '');
  const userId = user?.id;

  const getLastReadTime = () => {
    const stored = localStorage.getItem(LAST_READ_KEY);
    return stored ? new Date(stored) : new Date(0);
  };

  const updateLastReadTime = () => {
    localStorage.setItem(LAST_READ_KEY, new Date().toISOString());
    setUnreadCount(0);
  };

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      // As 100 mais recentes: com ordem crescente e limit, vinham as 100 mais antigas.
      const { data, error } = await supabase
        .from('team_chat_messages')
        .select(SELECT_MENSAGEM)
        .order('created_at', { ascending: false })
        .limit(LIMITE);

      if (error) throw error;

      const recentes = (data || []).map(paraMensagem).reverse();
      setMessages(recentes);

      const lastRead = getLastReadTime();
      setUnreadCount(
        recentes.filter((msg) => new Date(msg.created_at) > lastRead && msg.author.id !== userId).length,
      );
    } catch (error) {
      console.error('Erro ao carregar o chat da equipe:', error);
      toast.error('Não foi possível carregar o chat da equipe.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const ajustarAltura = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAXIMA_CAMPO)}px`;
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || sending) return;

    const messageBody = newMessage.trim();
    setNewMessage('');
    setSending(true);
    requestAnimationFrame(ajustarAltura);

    const optimisticMessage: TeamMessage = {
      id: `temp-${Date.now()}`,
      body: messageBody,
      created_at: new Date().toISOString(),
      author: {
        id: user.id,
        name: profile?.name || 'Você',
        photo_url: profile?.photo_url || null,
      },
      pending: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { error } = await supabase
        .from('team_chat_messages')
        .insert({ author_id: user.id, body: messageBody });

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
      setNewMessage(messageBody);
      toast.error('Não foi possível enviar a mensagem. Tente de novo.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia; Shift+Enter quebra a linha.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    if (isTeamMember) fetchMessages();
  }, [isTeamMember, fetchMessages]);

  // Uma inscrição só por usuário: abrir e fechar o chat não reinscreve.
  useEffect(() => {
    if (!isTeamMember) return;

    const channel = supabase
      .channel('team-chat-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_chat_messages' },
        async (payload) => {
          const { data } = await supabase
            .from('team_chat_messages')
            .select(SELECT_MENSAGEM)
            .eq('id', payload.new.id)
            .single();

          if (!data) return;
          const newMsg = paraMensagem(data);

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Troca só a mensagem otimista correspondente (mesmo autor e texto);
            // as outras pendentes continuam esperando a confirmação delas.
            const indice = prev.findIndex(
              (m) => m.pending && m.author.id === newMsg.author.id && m.body === newMsg.body,
            );
            if (indice >= 0) {
              const proximo = [...prev];
              proximo[indice] = newMsg;
              return proximo;
            }
            return [...prev, newMsg];
          });

          if (newMsg.author.id !== userId && !abertoRef.current) {
            setUnreadCount((prev) => prev + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isTeamMember, userId]);

  // Vai até a última mensagem ao abrir, ao carregar e quando chega mensagem.
  // O ref do ScrollArea fica no Root, não no viewport que rola — por isso a
  // âncora no fim da lista.
  useEffect(() => {
    if (isOpen && !loading) {
      fimRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [messages, isOpen, loading]);

  useEffect(() => {
    if (isOpen) {
      updateLastReadTime();
      inputRef.current?.focus();
    }
  }, [isOpen]);

  if (authLoading || !isTeamMember) return null;

  return (
    <div className="w-full border-b border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="chat-equipe-conteudo"
        className="flex w-full items-center justify-between px-4 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium">Chat da equipe</span>
          {unreadCount > 0 && (
            <SeloContagem tom="destructive" title={`${unreadCount} não lida(s)`}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </SeloContagem>
          )}
        </span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div id="chat-equipe-conteudo" className="border-t border-border/60">
          <ScrollArea className="h-64 px-4">
            {loading ? (
              <div className="space-y-3 py-3" aria-busy="true" aria-label="Carregando mensagens">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={`flex gap-2 ${i % 2 ? 'flex-row-reverse' : ''}`}>
                    <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                    <Skeleton className="h-10 w-2/3 rounded-2xl" />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <ChatEmptyState
                title="Nenhuma mensagem ainda"
                description="Escreva para a equipe — a conversa acontece em tempo real."
              />
            ) : (
              <div className="pb-3">
                {messages.map((msg, i) => {
                  const anterior = messages[i - 1];
                  const dia = diaLocal(msg.created_at);
                  const novoDia = !anterior || diaLocal(anterior.created_at) !== dia;
                  const agrupada = !novoDia && anterior.author.id === msg.author.id;
                  const minha = msg.author.id === userId;
                  return (
                    <div key={msg.id}>
                      {novoDia && <ChatDateDivider date={dia} />}
                      <ChatMessageBubble
                        authorName={msg.author.name}
                        authorPhoto={msg.author.photo_url}
                        createdAt={msg.created_at}
                        isOwn={minha}
                        pending={msg.pending}
                        grouped={agrupada}
                        body={
                          renderizarCorpo(msg.body)
                        }
                      />
                    </div>
                  );
                })}
                <div ref={fimRef} aria-hidden="true" />
              </div>
            )}
          </ScrollArea>

          <div className="flex items-end gap-2 border-t border-border/60 px-3 py-2">
            <Textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                ajustarAltura();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Escreva uma mensagem…"
              aria-label="Mensagem para a equipe"
              rows={1}
              className="min-h-[36px] flex-1 resize-none py-2 text-sm"
              style={{ maxHeight: ALTURA_MAXIMA_CAMPO }}
              disabled={sending}
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              className="h-9 w-9 shrink-0"
              aria-label="Enviar mensagem"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
