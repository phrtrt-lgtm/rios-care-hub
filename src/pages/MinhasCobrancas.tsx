import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Calendar, FileText, Image, Video, Paperclip } from "lucide-react";
import { AuthenticatedImage, AuthenticatedVideo } from "@/components/AuthenticatedMedia";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Charge {
  id: string;
  title: string;
  description: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  currency: string;
  due_date: string | null;
  status: string;
  payment_link_url: string | null;
  created_at: string;
  property_id: string | null;
  property?: {
    name: string;
  };
  attachments?: ChargeAttachment[];
  _count?: {
    messages: number;
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

const MinhasCobrancas = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || profile?.role !== 'owner') {
      navigate("/");
      return;
    }
    fetchCharges();
  }, [user, profile, navigate]);

  const fetchCharges = async () => {
    try {
      setLoading(true);
      
      const { data: chargesData, error: chargesError } = await supabase
        .from('charges')
        .select('*')
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false });

      if (chargesError) throw chargesError;

      // Fetch property, attachments and message counts for all charges
      const enrichedCharges = await Promise.all(
        (chargesData || []).map(async (charge) => {
          const [propertyResult, attachmentsResult, messagesResult] = await Promise.all([
            charge.property_id 
              ? supabase.from('properties').select('name').eq('id', charge.property_id).single()
              : Promise.resolve({ data: null }),
            supabase
              .from('charge_attachments')
              .select('id, file_name, file_path, file_size, mime_type, poster_path')
              .eq('charge_id', charge.id),
            supabase
              .from('charge_messages')
              .select('id', { count: 'exact', head: true })
              .eq('charge_id', charge.id)
          ]);

          return {
            ...charge,
            property: propertyResult.data || undefined,
            attachments: attachmentsResult.data || [],
            _count: {
              messages: messagesResult.count || 0
            }
          };
        })
      );

      setCharges(enrichedCharges);
    } catch (error) {
      console.error('Erro ao carregar cobranças:', error);
    } finally {
      setLoading(false);
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

  const isImageFile = (attachment: ChargeAttachment) => {
    return attachment.mime_type?.startsWith('image/') || false;
  };

  const isVideoFile = (attachment: ChargeAttachment) => {
    return attachment.mime_type?.startsWith('video/') || false;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/minha-caixa")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Minhas Cobranças</h1>
          <p className="text-muted-foreground">Visualize todas as suas cobranças</p>
        </div>

        {charges.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">Nenhuma cobrança encontrada</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Você não possui cobranças no momento.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {charges.map((charge) => (
              <Card 
                key={charge.id}
                className="group cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]"
                onClick={() => navigate(`/cobranca/${charge.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <CardTitle className="text-lg line-clamp-2">{charge.title}</CardTitle>
                    {getStatusBadge(charge.status)}
                  </div>
                  {charge.property && (
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 mb-2">
                      📍 {charge.property.name}
                    </Badge>
                  )}
                  {charge.description && (
                    <CardDescription className="line-clamp-2">
                      {charge.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Valor e Data */}
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted-foreground">Valor Total:</span>
                        <span className="text-lg font-semibold text-foreground">
                          {formatCurrency(charge.amount_cents, charge.currency)}
                        </span>
                      </div>
                      {charge.management_contribution_cents > 0 && (
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm text-muted-foreground">Aporte Gestão:</span>
                          <span className="text-lg font-semibold text-green-600">
                            - {formatCurrency(charge.management_contribution_cents, charge.currency)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between border-t pt-1">
                        <span className="text-sm font-medium">Valor Devido:</span>
                        <span className="text-xl font-bold text-foreground">
                          {formatCurrency(charge.amount_cents - (charge.management_contribution_cents || 0), charge.currency)}
                        </span>
                      </div>
                    </div>
                    {charge.due_date && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        Venc: {format(new Date(charge.due_date), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                    )}
                  </div>

                  {/* Preview de Anexos */}
                  {charge.attachments && charge.attachments.length > 0 && (
                    <div className="border-t pt-4">
                      <div className="grid grid-cols-3 gap-2">
                        {charge.attachments.slice(0, 3).map((attachment) => (
                          <div key={attachment.id} className="aspect-square rounded-md overflow-hidden bg-muted">
                            {isImageFile(attachment) ? (
                              <AuthenticatedImage
                                src={getAttachmentUrl(attachment)}
                                alt={attachment.file_name}
                                className="w-full h-full object-cover"
                              />
                            ) : isVideoFile(attachment) ? (
                              <div className="relative w-full h-full bg-muted flex items-center justify-center">
                                {attachment.poster_path ? (
                                  <AuthenticatedImage
                                    src={getPosterUrl(attachment)}
                                    alt={attachment.file_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Video className="h-8 w-8 text-muted-foreground" />
                                )}
                              </div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Paperclip className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {charge.attachments.length > 3 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          +{charge.attachments.length - 3} {charge.attachments.length - 3 === 1 ? 'anexo' : 'anexos'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Contador de Mensagens */}
                  {charge._count && charge._count.messages > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground border-t pt-4">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {charge._count.messages}
                        </AvatarFallback>
                      </Avatar>
                      <span>{charge._count.messages} {charge._count.messages === 1 ? 'mensagem' : 'mensagens'}</span>
                    </div>
                  )}

                  {/* Link de Pagamento */}
                  {charge.payment_link_url && charge.status !== 'paid' && charge.status !== 'cancelled' && (
                    <div className="border-t pt-4">
                      <Badge variant="outline" className="w-full justify-center">
                        Link de pagamento disponível
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MinhasCobrancas;
