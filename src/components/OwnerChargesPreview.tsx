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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format, differenceInDays, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
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
  ChevronDown,
  Paperclip,
  Gift
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
  pendente: { label: "Pendente", variant: "default" },
  sent: { label: "Enviada", variant: "default" },
  overdue: { label: "Vencida", variant: "destructive" },
  paid: { label: "Paga", variant: "outline" },
  cancelled: { label: "Cancelada", variant: "outline" },
  debited: { label: "Debitado", variant: "destructive" },
};

export function OwnerChargesPreview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [selectedCharge, setSelectedCharge] = useState<OwnerCharge | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [pixCharge, setPixCharge] = useState<OwnerCharge | null>(null);
  const [generatingPixFor, setGeneratingPixFor] = useState<string | null>(null);
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
        .in("status", ["pendente", "sent", "overdue"])
        .is("archived_at", null)
        .order("due_date", { ascending: true })
        .limit(10);

      if (error) throw error;
      return data as unknown as OwnerCharge[];
    },
    enabled: !!user,
  });

  // Fetch free maintenances (100% covered by management) from last 7 days
  const { data: freeMaintenances } = useQuery({
    queryKey: ["owner-free-maintenances", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from("charges")
        .select(`
          id,
          title,
          amount_cents,
          management_contribution_cents,
          due_date,
          status,
          created_at,
          description,
          category,
          property:properties(id, name, cover_photo_url)
        `)
        .eq("owner_id", user.id)
        .in("status", ["pago_no_vencimento", "paid"])
        .is("archived_at", null)
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      // Filter only those where management covers 100%
      return (data || []).filter(
        (c: any) => c.management_contribution_cents >= c.amount_cents
      ) as unknown as (OwnerCharge & { created_at: string; description: string | null; category: string | null })[];
    },
    enabled: !!user,
  });

  // Fetch ALL-TIME total management investment for this owner
  const { data: allTimeInvestmentCents } = useQuery({
    queryKey: ["owner-alltime-investment", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { data, error } = await supabase
        .from("charges")
        .select("amount_cents, management_contribution_cents")
        .eq("owner_id", user.id)
        .is("archived_at", null);

      if (error) throw error;
      // Sum ALL management contributions (partial + full)
      return (data || [])
        .reduce((sum: number, c: any) => sum + (c.management_contribution_cents || 0), 0);
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
      setGeneratingPixFor(charge.id);
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
      setGeneratingPixFor(null);
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
      return { text: "Vence hoje!", color: "text-warning", urgent: true };
    }
    if (days <= 3) {
      return { text: `Vence em ${days} dias`, color: "text-warning", urgent: true };
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
      <Card className="overflow-hidden border-success/30/20">
        <CardHeader className="pb-2 bg-gradient-to-r from-success/5 to-transparent">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-success" />
              Cobranças em Aberto
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-medium text-xs">
                {charges.length}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/minhas-cobrancas")}
                className="h-7 text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Ver todas
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">
              💡 Selecione várias cobranças para gerar um pagamento único
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                if (selectedCharges.length === charges.length) {
                  setSelectedCharges([]);
                } else {
                  setSelectedCharges(charges.map(c => c.id));
                }
              }}
            >
              {selectedCharges.length === charges.length ? "Desmarcar todas" : "Selecionar todas"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-3 px-3">
          {/* Bulk payment panel */}
          {selectedCharges.length > 0 && (
            <div className="mb-3 p-2.5 rounded-lg border-2 border-primary/20 bg-primary/5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {selectedCharges.length} {selectedCharges.length === 1 ? 'cobrança' : 'cobranças'}
                  </p>
                  <p className="text-base font-bold text-primary">
                    {formatBRL(totalDue)}
                  </p>
                </div>
                <Button 
                  onClick={handleGenerateGroupPayment}
                  disabled={generatingPayment}
                  size="sm"
                  className="h-7 text-xs"
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
                      className="flex-1 h-7 text-xs"
                      onClick={() => {
                        setPixCharge({
                          id: 'group',
                          title: 'Pagamento Agrupado',
                          amount_cents: groupPayment.total_amount,
                          management_contribution_cents: 0,
                          due_date: null,
                          status: 'pendente',
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
                    className="flex-1 h-7 text-xs"
                    onClick={() => window.open(groupPayment.payment_link, '_blank')}
                  >
                    <CreditCard className="h-3 w-3 mr-1" />
                    Até 12x
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Scrollable charge list - max 2 visible */}
          <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-1">
            {charges.map((charge) => {
              const statusConfig = STATUS_CONFIG[charge.status] || STATUS_CONFIG.pendente;
              const unreadCount = unreadCounts[charge.id] || 0;
              const dueDateInfo = getDueDateInfo(charge.due_date);
              const dueAmount = charge.amount_cents - (charge.management_contribution_cents || 0);
              const isSelected = selectedCharges.includes(charge.id);

              return (
                <div
                  key={charge.id}
                  className={`rounded-lg border bg-card overflow-hidden ${
                    isSelected ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div
                    className="p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => (saveScrollPosition(pathname), navigate(`/cobranca/${charge.id}`))}
                  >
                    {/* Top row: checkbox + photo + info */}
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleChargeSelection(charge.id, { stopPropagation: () => {} } as React.MouseEvent)}
                        />
                      </div>

                      <div className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0">
                        {charge.property?.cover_photo_url ? (
                          <img
                            src={charge.property.cover_photo_url}
                            alt={charge.property.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs line-clamp-1">{charge.title}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {charge.management_contribution_cents > 0 ? (
                            <>
                              <span className="text-[10px] text-muted-foreground line-through">
                                {formatBRL(charge.amount_cents)}
                              </span>
                              <span className="text-xs font-bold text-primary">
                                {formatBRL(dueAmount)}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs font-bold text-primary">{formatBRL(dueAmount)}</span>
                          )}
                          <span className={`text-[10px] ${dueDateInfo.color}`}>
                            • {dueDateInfo.text}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom row: action buttons */}
                    <div className="flex items-center justify-end gap-1 mt-1.5 pl-10" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={(e) => handleOpenPix(charge, e)}
                        disabled={generatingPixFor === charge.id}
                      >
                        {generatingPixFor === charge.id ? (
                          <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                        ) : (
                          <QrCode className="h-3 w-3" />
                        )}
                        PIX
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={(e) => handleOpenPaymentLink(charge, e)}
                        disabled={generatingLinkFor === charge.id}
                      >
                        {generatingLinkFor === charge.id ? (
                          <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                        ) : (
                          <CreditCard className="h-3 w-3" />
                        )}
                        12x
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1 relative"
                        onClick={(e) => handleOpenChat(charge, e)}
                      >
                        <MessageSquare className="h-3 w-3" />
                        Chat
                        {unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
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

      {/* Free Maintenances Section */}
      {freeMaintenances && freeMaintenances.length > 0 && (() => {
        const totalFreeCents = freeMaintenances.reduce((sum, c) => sum + (c.amount_cents || 0), 0);
        return (
        <Card className="overflow-hidden border-success/30/20 mt-4">
          <CardHeader className="pb-2 bg-gradient-to-r from-success/5 to-transparent">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-5 w-5 text-success" />
              Manutenções Gratuitas
              <Badge variant="secondary" className="font-medium text-xs ml-auto">
                {freeMaintenances.length}
              </Badge>
            </CardTitle>

            {/* All-time total */}
            {(allTimeInvestmentCents ?? 0) > 0 && (
              <div className="mt-2 rounded-xl bg-gradient-to-r from-success/15 to-success/5 border border-success/30/25 px-4 py-3 text-center">
                <p className="text-[11px] text-success font-medium tracking-wide uppercase">
                  A RIOS já aportou no seu imóvel
                </p>
                <p className="text-2xl font-extrabold text-success mt-0.5">
                  {formatBRL(allTimeInvestmentCents ?? 0)}
                </p>
              </div>
            )}

          </CardHeader>
          <CardContent className="pt-3 px-3">
            <div className="space-y-1.5">
              {freeMaintenances.map((charge) => (
                <div
                  key={charge.id}
                  className="rounded-lg border bg-card overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => (saveScrollPosition(pathname), navigate(`/cobranca/${charge.id}`))}
                >
                  <div className="p-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0">
                        {charge.property?.cover_photo_url ? (
                          <img
                            src={charge.property.cover_photo_url}
                            alt={charge.property?.name || ''}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs line-clamp-1">{charge.title}</p>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] h-4 border-success/30/30 text-success">
                            Aporte integral
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatBRL(charge.amount_cents)}
                          </span>
                          {charge.property?.name && (
                            <span className="text-[10px] text-muted-foreground">
                              • {charge.property.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* 7-day integral total below list */}
            <div className="mt-3 flex items-center justify-between rounded-lg bg-success/10 border border-success/30/20 px-3 py-2">
              <span className="text-xs text-success font-medium">Aportes integrais dos últimos 7 dias:</span>
              <span className="text-sm font-bold text-success">{formatBRL(totalFreeCents)}</span>
            </div>
          </CardContent>
        </Card>
        );
      })()}

      {/* PIX Dialog */}
      <Dialog open={pixDialogOpen} onOpenChange={setPixDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-success" />
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
                    src={pixCharge.pix_qr_code_base64.startsWith('data:') ? pixCharge.pix_qr_code_base64 : `data:image/png;base64,${pixCharge.pix_qr_code_base64}`} 
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
