import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Paperclip, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
    const { data, error } = await supabase
      .from('ticket_messages')
      .select(`
        *,
        profiles!ticket_messages_author_id_fkey (name, photo_url, role)
      `)
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      setSending(true);
      const { error } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: id,
          author_id: user?.id,
          body: newMessage,
          is_internal: false
        });

      if (error) throw error;

      setNewMessage("");
      toast({
        title: "Mensagem enviada!",
      });
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

  const uploadAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    try {
      setUploading(true);
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('ticket_attachments')
        .insert({
          ticket_id: id,
          path: filePath,
          mime_type: file.type,
          file_size: file.size
        });

      if (dbError) throw dbError;

      toast({
        title: "Arquivo anexado!",
        description: file.name,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao anexar arquivo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
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
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-2">{ticket.subject}</CardTitle>
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant="outline">{statusLabels[ticket.status as keyof typeof statusLabels]}</Badge>
                  <Badge>{ticket.priority}</Badge>
                  {ticket.properties && (
                    <Badge variant="secondary">Imóvel: {ticket.properties.name}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Avatar className="h-8 w-8">
                <AvatarImage src={ticket.profiles.photo_url || undefined} />
                <AvatarFallback>{getInitials(ticket.profiles.name)}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">{ticket.profiles.name}</div>
                <div>{format(new Date(ticket.created_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{ticket.description}</p>
          </CardContent>
        </Card>

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
                <p className="text-muted-foreground whitespace-pre-wrap">{message.body}</p>
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
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <input
                      type="file"
                      id="attachment-upload"
                      onChange={uploadAttachment}
                      disabled={uploading}
                      className="hidden"
                    />
                    <label htmlFor="attachment-upload">
                      <Button variant="outline" size="sm" disabled={uploading} asChild>
                        <span className="cursor-pointer">
                          {uploading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Paperclip className="mr-2 h-4 w-4" />
                          )}
                          Anexar arquivo
                        </span>
                      </Button>
                    </label>
                    
                    {isTeamMember && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={generateAIResponse}
                        disabled={generatingAI}
                      >
                        {generatingAI ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Gerar com IA
                      </Button>
                    )}
                  </div>
                  <Button onClick={sendMessage} disabled={sending || !newMessage.trim()}>
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
    </div>
  );
}
