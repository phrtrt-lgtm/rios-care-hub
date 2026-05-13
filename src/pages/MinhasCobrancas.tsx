import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { goBack, saveScrollPosition } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Calendar, FileText, Paperclip, QrCode, Building2, DollarSign, Tag, CreditCard, Zap } from "lucide-react";
import { AuthenticatedImage, AuthenticatedVideo } from "@/components/AuthenticatedMedia";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { CHARGE_CATEGORIES } from "@/constants/chargeCategories";
import { ListFilters } from "@/components/list/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

interface Charge {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  service_type?: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  currency: string;
  due_date: string | null;
  maintenance_date: string | null;
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
  useScrollRestoration();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCharges, setSelectedCharges] = useState<string[]>([]);
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [groupPayment, setGroupPayment] = useState<{
    payment_link: string;
    pix_qr_code: string;
    pix_qr_code_base64: string;
    total_amount: number;
  } | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const filtersHook = useListFilters("filters:minhas-cobrancas");
  const { applyTo } = filtersHook;
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
      cancelled: { label: 'Cancelada', variant: 'outline' as const },
      debited: { label: 'Debitado em Reserva', variant: 'destructive' as const }
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

  const toggleChargeSelection = (chargeId: string) => {
    setSelectedCharges(prev => 
      prev.includes(chargeId) 
        ? prev.filter(id => id !== chargeId)
        : [...prev, chargeId]
    );
  };

  const handleGenerateGroupPayment = async () => {
    try {
      setGeneratingPayment(true);
      
      const { data, error } = await supabase.functions.invoke('create-group-payment', {
        body: { chargeIds: selectedCharges }
      });

      if (error) throw error;

      setGroupPayment({
        payment_link: data.payment_link,
        pix_qr_code: data.pix_qr_code,
        pix_qr_code_base64: data.pix_qr_code_base64,
        total_amount: data.total_amount
      });

      toast.success('Pagamento agrupado gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar pagamento:', error);
      toast.error('Erro ao gerar pagamento agrupado');
    } finally {
      setGeneratingPayment(false);
    }
  };

  const selectedChargesData = charges.filter(c => selectedCharges.includes(c.id));
  const totalDue = selectedChargesData.reduce((sum, charge) => 
    sum + (charge.amount_cents - (charge.management_contribution_cents || 0)), 0
  );

  const openChargesCount = charges.filter(c => c.status === 'sent' || c.status === 'overdue' || c.status === 'pendente').length;

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
          <Button variant="ghost" size="sm" onClick={() => goBack(navigate, "/minha-caixa")}>
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

        {/* Painel de Pagamento Agrupado */}
        {openChargesCount > 0 && (
          <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background shadow-lg animate-fade-in">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <QrCode className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Pagamento Agrupado</CardTitle>
                  <CardDescription className="mt-1">
                    Selecione múltiplas cobranças e pague tudo de uma vez com Mercado Pago
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedCharges.length > 0 ? (
                <div className="space-y-4 animate-scale-in">
                  {/* Resumo da seleção */}
                  <div className="flex items-center justify-between p-4 bg-background rounded-xl border-2 border-primary/20 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground font-medium">
                        {selectedCharges.length} {selectedCharges.length === 1 ? 'cobrança selecionada' : 'cobranças selecionadas'}
                      </p>
                      <p className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                        {formatBRL(totalDue)}
                      </p>
                      <p className="text-xs text-muted-foreground">Parcele em até 12x com Mercado Pago</p>
                    </div>
                    <Button 
                      onClick={handleGenerateGroupPayment}
                      disabled={generatingPayment}
                      size="lg"
                      className="shadow-lg hover:shadow-xl transition-shadow"
                    >
                      {generatingPayment ? (
                        <div className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                          Gerando...
                        </div>
                      ) : (
                        'Gerar Pagamento'
                      )}
                    </Button>
                  </div>

                  {/* Loading state com logo */}
                  {generatingPayment && (
                    <div className="p-8 bg-background rounded-xl border flex flex-col items-center justify-center space-y-4 animate-fade-in">
                      <div className="relative">
                        <img 
                          src="/logo.png" 
                          alt="Logo RIOS" 
                          className="h-16 w-16 animate-pulse"
                        />
                        <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                      </div>
                      <p className="text-sm text-muted-foreground animate-pulse">Gerando seu pagamento agrupado...</p>
                    </div>
                  )}

                  {/* Opções de pagamento */}
                  {groupPayment && !generatingPayment && (
                    <div className="space-y-4 animate-scale-in">
                      {/* Indicador de sucesso */}
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-full border border-success/30 mx-auto">
                        <div className="h-2 w-2 bg-success rounded-full animate-pulse" />
                        <span className="text-sm font-medium">Opções de pagamento geradas!</span>
                      </div>

                      {/* Grid de opções de pagamento */}
                      <div className={`grid gap-4 ${groupPayment.pix_qr_code ? 'md:grid-cols-2' : 'md:grid-cols-1 max-w-md mx-auto'}`}>
                        {/* Opção 1: PIX Instantâneo - só mostra se disponível */}
                        {groupPayment.pix_qr_code && (
                          <Card className="border-2 border-primary/20 hover:border-primary/40 transition-colors">
                            <CardHeader className="pb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 rounded-lg bg-success/10">
                                  <Zap className="h-5 w-5 text-success" />
                                </div>
                                <div>
                                  <CardTitle className="text-lg">PIX Instantâneo</CardTitle>
                                  <CardDescription className="text-xs">À vista - Aprovação imediata</CardDescription>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="flex justify-center p-3 bg-white rounded-lg border">
                                <img 
                                  src={groupPayment.pix_qr_code_base64} 
                                  alt="QR Code PIX" 
                                  className="w-48 h-48"
                                />
                              </div>
                              <Button 
                                className="w-full" 
                                variant="outline"
                                onClick={() => {
                                  navigator.clipboard.writeText(groupPayment.pix_qr_code);
                                  toast.success('Código PIX copiado!');
                                }}
                              >
                                <Paperclip className="h-4 w-4 mr-2" />
                                Copiar código PIX
                              </Button>
                            </CardContent>
                          </Card>
                        )}

                        {/* Opção 2: Cartão com Parcelamento */}
                        <Card className="border-2 border-info/30 hover:border-info/30 transition-colors bg-gradient-to-br from-info/10/50 to-background">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="p-2 rounded-lg bg-info/10">
                                <CreditCard className="h-5 w-5 text-info" />
                              </div>
                              <div>
                                <CardTitle className="text-lg">Cartão de Crédito</CardTitle>
                                <CardDescription className="text-xs">Parcele em até 12x com juros</CardDescription>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="bg-info/10 text-info border-info/30">
                                Todos os cartões
                              </Badge>
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                                Débito e Crédito
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="p-4 bg-white rounded-lg border-2 border-dashed border-info/30 space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Valor total:</span>
                                <span className="font-bold text-lg">{formatBRL(totalDue)}</span>
                              </div>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <p>• Parcele em até 12x no cartão</p>
                                <p>• Aceita todos os principais cartões</p>
                                <p>• Pagamento seguro pelo Mercado Pago</p>
                              </div>
                            </div>
                            <Button 
                              className="w-full shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
                              size="lg"
                              onClick={() => window.open(groupPayment.payment_link, '_blank')}
                            >
                              <CreditCard className="h-4 w-4 mr-2" />
                              Pagar com Mercado Pago
                            </Button>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center py-4 px-4 bg-background/50 rounded-xl border-2 border-dashed">
                    <QrCode className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Selecione as cobranças que deseja pagar usando os checkboxes ao lado
                    </p>
                  </div>

                  {/* Preview das opções de pagamento */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    {/* Mini Card PIX */}
                    <div className="p-4 bg-gradient-to-br from-success/10/80 to-background rounded-lg border-2 border-success/30/50 hover:border-success/30/70 transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded bg-success/10">
                          <Zap className="h-4 w-4 text-success" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">PIX Instantâneo</p>
                          <p className="text-xs text-muted-foreground">Aprovação imediata</p>
                        </div>
                      </div>
                    </div>

                    {/* Mini Card Cartão */}
                    <div className="p-4 bg-gradient-to-br from-info/10/80 to-background rounded-lg border-2 border-info/30/50 hover:border-info/30/70 transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded bg-info/10">
                          <CreditCard className="h-4 w-4 text-info" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Cartão de Crédito</p>
                          <p className="text-xs text-muted-foreground">Parcele em até 12x</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(() => {
          const propertyOptions = Array.from(
            new Map(charges.filter(c => c.property?.name && c.property_id).map(c => [c.property_id!, c.property!.name])).entries()
          ).map(([value, label]) => ({ value, label }));
          const filteredCharges = applyTo(charges, {
            searchFields: (c) => [c.title, c.description, c.property?.name],
            status: (c) => c.status,
            propertyId: (c) => c.property_id,
            date: (c) => c.created_at,
          });
          const visibleCharges = filteredCharges.slice(0, visibleCount);
          const hasMore = filteredCharges.length > visibleCount;
          return (
            <>
              <Card className="mb-4">
                <CardContent className="pt-6">
                  <ListFilters
                    {...filtersHook}
                    searchPlaceholder="Buscar por título ou imóvel..."
                    statusOptions={[
                      { value: "draft", label: "Rascunho" },
                      { value: "sent", label: "Enviada" },
                      { value: "paid", label: "Paga" },
                      { value: "overdue", label: "Vencida" },
                      { value: "cancelled", label: "Cancelada" },
                      { value: "debited", label: "Debitada em Reserva" },
                    ]}
                    propertyOptions={propertyOptions}
                    showDateRange
                    totalCount={charges.length}
                    filteredCount={filteredCharges.length}
                  />
                </CardContent>
              </Card>

              {charges.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold text-foreground">
                      Nenhuma cobrança encontrada
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Você não possui cobranças no momento.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {visibleCharges.map((charge) => {
              const isOpen = charge.status === 'sent' || charge.status === 'overdue';
              const isSelected = selectedCharges.includes(charge.id);
              const ownerDue = charge.amount_cents - charge.management_contribution_cents;
              
              return (
                <Card 
                  key={charge.id}
                  className={`transition-all hover:shadow-md hover:border-primary/20 overflow-hidden group ${isSelected ? 'ring-2 ring-primary' : ''}`}
                >
                  <div className="flex">
                    {/* Checkbox lateral (se aplicável) */}
                    {isOpen && (
                      <div className="flex items-center justify-center w-12 bg-muted/30 border-r">
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => toggleChargeSelection(charge.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}

                    {/* Conteúdo principal */}
                    <div 
                      className="flex-1 p-4 cursor-pointer"
                      onClick={() => { saveScrollPosition(pathname); navigate(`/cobranca/${charge.id}`); }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          {/* Título e Status */}
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors flex-1">
                              {charge.title}
                            </h3>
                            {getStatusBadge(charge.status)}
                          </div>

                          {/* Badges de informação */}
                          <div className="flex flex-wrap gap-1.5">
                            {charge.property && (
                              <Badge variant="outline" className="text-xs bg-background">
                                <Building2 className="h-3 w-3 mr-1" />
                                {charge.property.name}
                              </Badge>
                            )}
                            {charge.category && (
                              <Badge variant="outline" className="text-xs bg-info/10 text-info border-info/30">
                                {CHARGE_CATEGORIES[charge.category as keyof typeof CHARGE_CATEGORIES]}
                              </Badge>
                            )}
                            {charge.service_type && (
                              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                                <Tag className="h-3 w-3 mr-1" />
                                {charge.service_type}
                              </Badge>
                            )}
                          </div>

                          {/* Descrição */}
                          {charge.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                              {charge.description}
                            </p>
                          )}

                          {/* Footer com valores e datas */}
                          <div className="flex flex-wrap gap-4 pt-1">
                            <div className="space-y-0.5">
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs text-muted-foreground">Valor Total:</span>
                                <span className="text-sm font-semibold text-foreground">
                                  {formatCurrency(charge.amount_cents, charge.currency)}
                                </span>
                              </div>
                              {charge.management_contribution_cents > 0 && (
                                <div className="flex items-baseline gap-2">
                                  <span className="text-xs text-muted-foreground">Aporte Gestão:</span>
                                  <span className="text-sm font-semibold text-success">
                                    - {formatCurrency(charge.management_contribution_cents, charge.currency)}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs text-muted-foreground">Valor Devido:</span>
                                <span className="text-base font-bold text-primary">
                                  {formatCurrency(ownerDue, charge.currency)}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-0.5 text-xs text-muted-foreground">
                              {charge.due_date && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Venc: {format(new Date(charge.due_date), "dd/MM/yyyy", { locale: ptBR })}
                                </div>
                              )}
                              {charge.maintenance_date && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Data: {format(new Date(charge.maintenance_date), "dd/MM/yyyy", { locale: ptBR })}
                                </div>
                              )}
                              {charge.attachments && charge.attachments.length > 0 && (
                                <div className="flex items-center gap-1 text-info">
                                  <Paperclip className="h-3 w-3" />
                                  +{charge.attachments.length} anexo{charge.attachments.length > 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
                  })}
                </div>
              )}

              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" onClick={() => setVisibleCount((v) => v + 100)}>
                    Carregar mais ({filteredCharges.length - visibleCount} restantes)
                  </Button>
                </div>
              )}
            </>
          );
        })()}
      </main>
    </div>
  );
};

export default MinhasCobrancas;
