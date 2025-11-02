import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Loader2, Calendar, DollarSign, Paperclip, Download, Eye, FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { AuthenticatedImage, AuthenticatedVideo } from "@/components/AuthenticatedMedia";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  mime_type: string | null;
  poster_path: string | null;
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
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      .select('id, file_name, file_path, file_size, mime_type, poster_path')
      .eq('charge_id', id);

    if (!error && data) {
      setAttachments(data);
    }
  };

  const getAttachmentUrl = (attachment: ChargeAttachment) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/serve-attachment/${attachment.id}/file`;
  };

  const getPosterUrl = (attachment: ChargeAttachment) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/serve-attachment/${attachment.id}/poster`;
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

  const downloadAttachment = async (attachmentId: string, fileName: string) => {
    try {
      setSending(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Sessão não encontrada");
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const downloadUrl = `${SUPABASE_URL}/functions/v1/serve-attachment/${attachmentId}?download=1`;

      // Download the file
      const response = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Falha ao baixar arquivo");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download iniciado!",
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
        throw new Error("Sessão não encontrada");
      }

      toast({
        title: "Preparando download...",
        description: "Compactando arquivos...",
      });

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

      // Create ZIP file
      const zip = new JSZip();
      
      for (const attachment of attachments) {
        try {
          const downloadUrl = `${SUPABASE_URL}/functions/v1/serve-attachment/${attachment.id}`;
          
          const response = await fetch(downloadUrl, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
          
          if (response.ok) {
            const blob = await response.blob();
            zip.file(attachment.file_name, blob);
          }
        } catch (error) {
          console.error('Error downloading:', attachment.file_name, error);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anexos-cobranca-${id}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download concluído!",
        description: "Todos os anexos foram baixados",
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

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="h-8 w-8 text-primary" />;
    }
    if (mimeType.startsWith('video/')) {
      return <FileText className="h-8 w-8 text-primary" />;
    }
    return <Paperclip className="h-8 w-8 text-muted-foreground" />;
  };

  const isImageFile = (attachment: ChargeAttachment) => {
    return attachment.mime_type?.startsWith('image/') || false;
  };

  const isVideoFile = (attachment: ChargeAttachment) => {
    return attachment.mime_type?.startsWith('video/') || false;
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      
      // Delete charge (cascade will delete messages and attachments)
      const { error } = await supabase
        .from('charges')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Cobrança excluída!",
        description: "A cobrança foi excluída com sucesso",
      });

      navigate(-1);
    } catch (error: any) {
      toast({
        title: "Erro ao excluir cobrança",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
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
                <div className="flex flex-wrap gap-2">
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
              {isTeamMember && (
                <Button 
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="ml-4"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>

            {attachments.length > 0 && (
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground">Anexos ({attachments.length})</h3>
                  {attachments.length > 1 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={downloadAllAttachments}
                      disabled={sending}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Baixar Todos
                    </Button>
                  )}
                </div>

                {/* Galeria de Imagens */}
                {attachments.some(a => isImageFile(a)) && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Imagens</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {attachments
                        .filter(a => isImageFile(a))
                        .map((attachment) => {
                          const previewUrl = getAttachmentUrl(attachment);
                          return (
                             <div key={attachment.id} className="group relative aspect-square rounded-lg overflow-hidden border bg-muted">
                               <AuthenticatedImage 
                                 src={previewUrl}
                                 alt={attachment.file_name}
                                 className="w-full h-full object-cover transition-transform group-hover:scale-105"
                               />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setSelectedImage({ url: previewUrl, name: attachment.file_name })}
                                  className="h-8 w-8 p-0"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => downloadAttachment(attachment.id, attachment.file_name)}
                                  disabled={sending}
                                  className="h-8 w-8 p-0"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Vídeos */}
                {attachments.some(a => isVideoFile(a)) && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Vídeos</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {attachments
                        .filter(a => isVideoFile(a))
                        .map((attachment) => (
                          <div key={attachment.id} className="space-y-2">
                            <div className="aspect-video rounded-lg overflow-hidden border bg-muted">
                              <AuthenticatedVideo
                                src={getAttachmentUrl(attachment)}
                                posterSrc={attachment.poster_path ? getPosterUrl(attachment) : undefined}
                                controls 
                                preload="metadata"
                                playsInline
                                className="w-full h-full"
                                style={{ maxHeight: "480px" }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-foreground truncate">{attachment.file_name}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => downloadAttachment(attachment.id, attachment.file_name)}
                                disabled={sending}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Outros Arquivos */}
                {attachments.some(a => !isImageFile(a) && !isVideoFile(a)) && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Outros Arquivos</h4>
                    <div className="space-y-2">
                      {attachments
                        .filter(a => !isImageFile(a) && !isVideoFile(a))
                        .map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                          >
                            {getFileIcon(attachment.mime_type || '')}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {attachment.file_name}
                              </p>
                              {attachment.file_size && (
                                <p className="text-xs text-muted-foreground">
                                  {(attachment.file_size / 1024).toFixed(1)} KB
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => downloadAttachment(attachment.id, attachment.file_name)}
                              disabled={sending}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
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

      {/* Lightbox para visualizar imagens */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedImage?.name}</DialogTitle>
          </DialogHeader>
          <div className="relative w-full max-h-[70vh] flex items-center justify-center bg-muted rounded-lg overflow-hidden">
            {selectedImage && (
              <AuthenticatedImage 
                src={selectedImage.url}
                alt={selectedImage.name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cobrança</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta cobrança? Esta ação não pode ser desfeita.
              Todos os anexos e mensagens associados também serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}