import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Loader2, Calendar, DollarSign, Paperclip } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import JSZip from "jszip";

interface Charge {
  id: string;
  title: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  due_date: string | null;
  status: string;
  payment_link_url: string | null;
  created_at: string;
  owner_id: string;
  profiles: {
    name: string;
    photo_url: string | null;
  };
}

interface ChargeMessage {
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

interface ChargeAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
}

export default function CobrancaDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [charge, setCharge] = useState<Charge | null>(null);
  const [messages, setMessages] = useState<ChargeMessage[]>([]);
  const [attachments, setAttachments] = useState<ChargeAttachment[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent';

  useEffect(() => {
    fetchChargeData();
    
    // Realtime subscription for new messages
    const channel = supabase
      .channel(`charge-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'charge_messages',
          filter: `charge_id=eq.${id}`
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

  const fetchChargeData = async () => {
    try {
      const { data: chargeData, error: chargeError } = await supabase
        .from('charges')
        .select(`
          *,
          profiles!charges_owner_id_fkey (name, photo_url)
        `)
        .eq('id', id)
        .single();

      if (chargeError) throw chargeError;
      setCharge(chargeData);

      await Promise.all([
        fetchMessages(),
        fetchAttachments()
      ]);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar cobrança",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    const { data: messagesData, error } = await supabase
      .from('charge_messages')
      .select('*')
      .eq('charge_id', id)
      .order('created_at', { ascending: true });

    if (!error && messagesData) {
      // Buscar perfis dos autores
      const messagesWithProfiles = await Promise.all(
        messagesData.map(async (msg) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, photo_url, role')
            .eq('id', msg.author_id)
            .single();
          
          return {
            ...msg,
            profiles: profile || { name: 'Desconhecido', photo_url: null, role: 'owner' }
          };
        })
      );
      
      setMessages(messagesWithProfiles);
    }
  };

  const fetchAttachments = async () => {
    const { data, error } = await supabase
      .from('charge_attachments')
      .select('id, file_name, file_path, file_size')
      .eq('charge_id', id);

    if (!error && data) {
      setAttachments(data);
      // Load previews for images/videos
      loadPreviews(data);
    }
  };

  const loadPreviews = async (attachments: ChargeAttachment[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const urls: Record<string, string> = {};
    
    for (const attachment of attachments) {
      const extension = attachment.file_name.split('.').pop()?.toLowerCase();
      const previewExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov'];
      
      if (previewExtensions.includes(extension || '')) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-monday-asset?assetId=${attachment.file_path}`,
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            // Use the Monday URL directly
            urls[attachment.id] = data.url;
          }
        } catch (error) {
          console.error('Error loading preview:', error);
        }
      }
    }
    
    setPreviewUrls(urls);
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      setSending(true);
      const { error } = await supabase
        .from('charge_messages')
        .insert({
          charge_id: id,
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

  const downloadAttachment = async (filePath: string, fileName: string) => {
    try {
      setSending(true);
      
      // filePath contains the Monday asset ID
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Não autenticado");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-monday-asset?assetId=${filePath}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao baixar arquivo");
      }

      const data = await response.json();
      
      // Download directly from Monday URL
      const fileResponse = await fetch(data.url);
      const blob = await fileResponse.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download concluído!",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao baixar anexo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const downloadAllAttachments = async () => {
    try {
      setSending(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Não autenticado");
      }

      const zip = new JSZip();
      
      toast({
        title: "Preparando arquivos...",
        description: "Compactando anexos em ZIP",
      });

      // Download all files and add to zip
      for (const attachment of attachments) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-monday-asset?assetId=${attachment.file_path}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          // Download from Monday URL
          const fileResponse = await fetch(data.url);
          const blob = await fileResponse.blob();
          zip.file(attachment.file_name, blob);
        }
      }

      // Generate and download zip
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cobranca-${charge?.title || 'anexos'}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download concluído!",
        description: "Todos os anexos foram baixados em um arquivo ZIP",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao baixar anexos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const getFilePreview = (attachmentId: string, fileName: string, filePath: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const videoExtensions = ['mp4', 'webm', 'mov'];
    const previewUrl = previewUrls[attachmentId];

    if (imageExtensions.includes(extension || '') && previewUrl) {
      return (
        <div 
          className="w-full h-48 bg-muted rounded-md overflow-hidden cursor-pointer"
          onClick={() => downloadAttachment(filePath, fileName)}
        >
          <img 
            src={previewUrl}
            alt={fileName}
            className="w-full h-full object-cover"
          />
        </div>
      );
    }

    if (videoExtensions.includes(extension || '') && previewUrl) {
      return (
        <div className="w-full h-48 bg-muted rounded-md overflow-hidden">
          <video 
            controls 
            className="w-full h-full"
            src={previewUrl}
          >
            Seu navegador não suporta vídeos.
          </video>
        </div>
      );
    }

    return null;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: 'Rascunho', variant: 'secondary' as const },
      sent: { label: 'Enviada', variant: 'default' as const },
      paid: { label: 'Paga', variant: 'default' as const },
      overdue: { label: 'Vencida', variant: 'destructive' as const },
      cancelled: { label: 'Cancelada', variant: 'outline' as const }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatCurrency = (cents: number, currency: string) => {
    const value = cents / 100;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency
    }).format(value);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!charge) {
    return <div>Cobrança não encontrada</div>;
  }

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
                <CardTitle className="text-2xl mb-2">{charge.title}</CardTitle>
                <div className="flex flex-wrap gap-2 mb-4">
                  {getStatusBadge(charge.status)}
                  <Badge variant="outline">
                    <DollarSign className="h-3 w-3 mr-1" />
                    {formatCurrency(charge.amount_cents, charge.currency)}
                  </Badge>
                  {charge.due_date && (
                    <Badge variant="secondary">
                      <Calendar className="h-3 w-3 mr-1" />
                      Venc: {format(new Date(charge.due_date), "dd/MM/yyyy", { locale: ptBR })}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Avatar className="h-8 w-8">
                <AvatarImage src={charge.profiles.photo_url || undefined} />
                <AvatarFallback>{getInitials(charge.profiles.name)}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">{charge.profiles.name}</div>
                <div>{format(new Date(charge.created_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {charge.description && (
              <p className="text-muted-foreground whitespace-pre-wrap mb-4">{charge.description}</p>
            )}

            {attachments.length > 0 && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-foreground">Anexos:</p>
                  {attachments.length > 1 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={downloadAllAttachments}
                      disabled={sending}
                    >
                      Baixar Todos
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="space-y-2">
                      {getFilePreview(attachment.id, attachment.file_name, attachment.file_path)}
                      <button
                        onClick={() => downloadAttachment(attachment.file_path, attachment.file_name)}
                        disabled={sending}
                        className="flex w-full items-center gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-accent disabled:opacity-50"
                      >
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate text-left text-foreground">
                          {attachment.file_name}
                        </span>
                        {attachment.file_size && (
                          <span className="text-xs text-muted-foreground">
                            {(attachment.file_size / 1024).toFixed(1)} KB
                          </span>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {charge.payment_link_url && (
              <div className="border-t pt-4 mt-4">
                <p className="mb-2 text-sm font-medium text-foreground">Link de Pagamento:</p>
                <Button 
                  onClick={() => window.open(charge.payment_link_url!, '_blank')}
                  className="w-full"
                >
                  Acessar Link de Pagamento
                </Button>
              </div>
            )}
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

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Textarea
                placeholder="Digite sua mensagem..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="min-h-[100px]"
              />
              <div className="flex justify-end">
                <Button onClick={sendMessage} disabled={sending || !newMessage.trim()}>
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar Mensagem
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}