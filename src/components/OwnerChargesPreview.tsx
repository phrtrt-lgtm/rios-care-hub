import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, differenceInDays, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { 
  MessageSquare, 
  Building2, 
  DollarSign, 
  ExternalLink, 
  QrCode, 
  CreditCard,
  Zap,
  Clock,
  AlertTriangle,
  ChevronRight,
  Paperclip
} from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { ChargeChatDialog } from "@/components/ChargeChatDialog";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";

interface OwnerCharge {
  id: string;
  title: string;
  amount_cents: number;
  management_contribution_cents: number;
  due_date: string | null;
  status: string;
  payment_link_url: string | null;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  property: {
    id: string;
    name: string;
    cover_photo_url: string | null;
  } | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  sent: { label: "Enviada", variant: "default" },
  overdue: { label: "Vencida", variant: "destructive" },
  paid: { label: "Paga", variant: "outline" },
  cancelled: { label: "Cancelada", variant: "outline" },
  debited: { label: "Debitado", variant: "destructive" },
};

export function OwnerChargesPreview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedCharge, setSelectedCharge] = useState<OwnerCharge | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [pixCharge, setPixCharge] = useState<OwnerCharge | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [selectedCharges, setSelectedCharges] = useState<string[]>([]);
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [groupPayment, setGroupPayment] = useState<{
    payment_link: string;
    pix_qr_code: string;
    pix_qr_code_base64: string;
    total_amount: number;
  } | null>(null);
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null);

  const { data: charges, isLoading } = useQuery({
    queryKey: ["owner-charges-preview", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("charges")
        .select(`
          id,
          title,
          amount_cents,
          management_contribution_cents,
          due_date,
          status,
          payment_link_url,
          pix_qr_code,
          pix_qr_code_base64,
          property:properties(id, name, cover_photo_url)
        `)
        .eq("owner_id", user.id)
        .in("status", ["sent", "overdue"])
        .order("due_date", { ascending: true })
        .limit(10);

      if (error) throw error;
      return data as unknown as OwnerCharge[];
    },
    enabled: !!user,
  });

  // Use ticket IDs format for unread messages - charges use charge_messages table
  const chargeIds = charges?.map((c) => c.id) || [];
  const { unreadCounts, markAsRead } = useUnreadMessages(chargeIds);

  const handleOpenChat = (charge: OwnerCharge, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCharge(charge);
    setChatOpen(true);
    markAsRead(charge.id);
  };

  const handleOpenPix = async (charge: OwnerCharge, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If PIX already exists, just open dialog
    if (charge.pix_qr_code && charge.pix_qr_code_base64) {
      setPixCharge(charge);
      setPixDialogOpen(true);
      return;
    }
    
    // Generate payment first
    try {
      setPixLoading(true);
      const { data, error } = await supabase.functions.invoke('create-group-payment', {
        body: { chargeIds: [charge.id] }
      });
      
      if (error) throw error;
      
      setPixCharge({
        ...charge,
        pix_qr_code: data.pix_qr_code,
        pix_qr_code_base64: data.pix_qr_code_base64,
        payment_link_url: data.payment_link
      });
      setPixDialogOpen(true);
    } catch (error) {
      console.error('Erro ao gerar PIX:', error);
      toast.error('Erro ao gerar QR Code PIX');
    } finally {
      setPixLoading(false);
    }
  };

  const handleOpenPaymentLink = async (charge: OwnerCharge, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If payment link already exists, just open it
    if (charge.payment_link_url) {
      window.open(charge.payment_link_url, '_blank');
      return;
    }
    
    // Generate payment first
    try {
      setGeneratingLinkFor(charge.id);
      const { data, error } = await supabase.functions.invoke('create-group-payment', {
        body: { chargeIds: [charge.id] }
      });
      
      if (error) throw error;
      
      window.open(data.payment_link, '_blank');
    } catch (error) {
      console.error('Erro ao gerar link:', error);
      toast.error('Erro ao gerar link de pagamento');
    } finally {
      setGeneratingLinkFor(null);
    }
  };

  const toggleChargeSelection = (chargeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCharges(prev => 
      prev.includes(chargeId) 
        ? prev.filter(id => id !== chargeId)
        : [...prev, chargeId]
    );
    // Reset group payment when selection changes
    setGroupPayment(null);
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

      toast.success('Pagamento agrupado gerado!');
    } catch (error) {
      console.error('Erro ao gerar pagamento:', error);
      toast.error('Erro ao gerar pagamento agrupado');
    } finally {
      setGeneratingPayment(false);
    }
  };

  const getDueDateInfo = (dueDate: string | null) => {
    if (!dueDate) return { text: "Sem vencimento", color: "text-muted-foreground", urgent: false };
    
    const date = new Date(dueDate);
    const today = new Date();
    const days = differenceInDays(date, today);
    
    if (isPast(date) && !isToday(date)) {
      return { text: `Vencida há ${Math.abs(days)} dias`, color: "text-destructive", urgent: true };
    }
    if (isToday(date)) {
      return { text: "Vence hoje!", color: "text-orange-500", urgent: true };
    }
    if (days <= 3) {
      return { text: `Vence em ${days} dias`, color: "text-orange-500", urgent: true };
    }
    return { text: `Vence em ${days} dias`, color: "text-muted-foreground", urgent: false };
  };

  const selectedChargesData = charges?.filter(c => selectedCharges.includes(c.id)) || [];
  const totalDue = selectedChargesData.reduce((sum, charge) => 
    sum + (charge.amount_cents - (charge.management_contribution_cents || 0)), 0
  );

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!charges || charges.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="overflow-hidden border-green-500/20">
        <CardHeader className="pb-3 bg-gradient-to-r from-green-500/5 to-transparent">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Cobranças em Aberto
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-medium">
                {charges.length}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/minhas-cobrancas")}
                className="w-full sm:w-auto"
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Ver todas
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Bulk payment panel */}
          {selectedCharges.length > 0 && (
            <div className="mb-4 p-3 rounded-lg border-2 border-primary/20 bg-primary/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {selectedCharges.length} {selectedCharges.length === 1 ? 'cobrança' : 'cobranças'}
                  </p>
                  <p className="text-lg font-bold text-primary">
                    {formatBRL(totalDue)}
                  </p>
                </div>
                <Button 
                  onClick={handleGenerateGroupPayment}
                  disabled={generatingPayment}
                  size="sm"
                >
                  {generatingPayment ? "Gerando..." : "Gerar Pagamento"}
                </Button>
              </div>
              
              {groupPayment && (
                <div className="flex gap-2 pt-2 border-t">
                  {groupPayment.pix_qr_code && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setPixCharge({
                          id: 'group',
                          title: 'Pagamento Agrupado',
                          amount_cents: groupPayment.total_amount,
                          management_contribution_cents: 0,
                          due_date: null,
                          status: 'sent',
                          payment_link_url: groupPayment.payment_link,
                          pix_qr_code: groupPayment.pix_qr_code,
                          pix_qr_code_base64: groupPayment.pix_qr_code_base64,
                          property: null
                        });
                        setPixDialogOpen(true);
                      }}
                    >
                      <QrCode className="h-3 w-3 mr-1" />
                      PIX
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(groupPayment.payment_link, '_blank')}
                  >
                    <CreditCard className="h-3 w-3 mr-1" />
                    Até 12x
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {charges.map((charge) => {
              const statusConfig = STATUS_CONFIG[charge.status] || STATUS_CONFIG.sent;
              const unreadCount = unreadCounts[charge.id] || 0;
              const dueDateInfo = getDueDateInfo(charge.due_date);
              const dueAmount = charge.amount_cents - (charge.management_contribution_cents || 0);
              const isSelected = selectedCharges.includes(charge.id);

              return (
                <div
                  key={charge.id}
                  className={`p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors group ${
                    isSelected ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => navigate(`/cobranca-detalhes/${charge.id}`)}
                >
                  <div className="flex items-start gap-2">
                    {/* Checkbox */}
                    <div className="flex items-center pt-1" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleChargeSelection(charge.id, { stopPropagation: () => {} } as React.MouseEvent)}
                      />
                    </div>

                    {/* Property photo */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {charge.property?.cover_photo_url ? (
                        <img
                          src={charge.property.cover_photo_url}
                          alt={charge.property.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={statusConfig.variant} className="text-[10px] px-1.5 py-0">
                          {statusConfig.label}
                        </Badge>
                        <span className={`text-[10px] flex items-center gap-0.5 ${dueDateInfo.color}`}>
                          {dueDateInfo.urgent && <AlertTriangle className="h-3 w-3" />}
                          {dueDateInfo.text}
                        </span>
                      </div>
                      <h4 className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                        {charge.title}
                      </h4>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground line-through">
                          {formatBRL(charge.amount_cents)}
                        </span>
                        <span className="text-green-600 font-medium">
                          -{formatBRL(charge.management_contribution_cents)}
                        </span>
                        <span className="font-bold text-primary">
                          {formatBRL(dueAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={(e) => handleOpenPix(charge, e)}
                          disabled={pixLoading}
                        >
                          <QrCode className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={(e) => handleOpenPaymentLink(charge, e)}
                          disabled={generatingLinkFor === charge.id}
                        >
                          {generatingLinkFor === charge.id ? (
                            <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                          ) : (
                            <>
                              <CreditCard className="h-3 w-3 mr-0.5" />
                              12x
                            </>
                          )}
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] relative gap-1"
                        onClick={(e) => handleOpenChat(charge, e)}
                      >
                        <MessageSquare className="h-3 w-3" />
                        <span>Msgs</span>
                        {unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* PIX Dialog */}
      <Dialog open={pixDialogOpen} onOpenChange={setPixDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-green-600" />
              Pagar com PIX
            </DialogTitle>
          </DialogHeader>
          {pixCharge && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">{pixCharge.title}</p>
                <p className="text-2xl font-bold text-primary">
                  {formatBRL(pixCharge.amount_cents - (pixCharge.management_contribution_cents || 0))}
                </p>
              </div>
              
              {pixCharge.pix_qr_code_base64 && (
                <div className="flex justify-center p-4 bg-white rounded-lg border">
                  <img 
                    src={pixCharge.pix_qr_code_base64} 
                    alt="QR Code PIX" 
                    className="w-48 h-48"
                  />
                </div>
              )}
              
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => {
                  if (pixCharge.pix_qr_code) {
                    navigator.clipboard.writeText(pixCharge.pix_qr_code);
                    toast.success('Código PIX copiado!');
                  }
                }}
              >
                <Paperclip className="h-4 w-4 mr-2" />
                Copiar código PIX
              </Button>
              
              <p className="text-xs text-center text-muted-foreground">
                Escaneie o QR Code ou copie o código para pagar via PIX
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Chat Dialog */}
      <ChargeChatDialog
        open={chatOpen}
        onOpenChange={(open) => {
          setChatOpen(open);
          if (!open) setSelectedCharge(null);
        }}
        chargeId={selectedCharge?.id || null}
        chargeTitle={selectedCharge?.title || ""}
        propertyName={selectedCharge?.property?.name || ""}
      />
    </>
  );
}
