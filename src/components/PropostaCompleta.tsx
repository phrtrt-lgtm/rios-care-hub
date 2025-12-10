import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  User, 
  FileText, 
  Paperclip,
  CreditCard,
  Check,
  Loader2,
  QrCode,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MediaGallery } from "@/components/MediaGallery";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface PropostaCompletaProps {
  proposalId: string;
  onResponded?: () => void;
}

export function PropostaCompleta({ proposalId, onResponded }: PropostaCompletaProps) {
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<any[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    paymentLink?: string;
    pixQrCode?: string;
    pixQrCodeBase64?: string;
    totalAmount?: number;
  } | null>(null);
  const [isGeneratingPayment, setIsGeneratingPayment] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Fetch proposal data
  const { data: proposal, isLoading } = useQuery({
    queryKey: ['proposal-complete', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select(`
          *,
          proposal_responses (
            id,
            owner_id,
            approved,
            note,
            attachment_path,
            responded_at,
            selected_option_id,
            is_visible_to_owner,
            paid_at,
            payment_amount_cents,
            payment_status
          ),
          proposal_attachments (
            id,
            file_name,
            file_path,
            file_type
          ),
          proposal_options (
            id,
            option_text,
            order_index,
            requires_payment
          ),
          proposal_items (
            id,
            name,
            unit_price_cents,
            order_index
          )
        `)
        .eq('id', proposalId)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      // Extend data type to include creator
      const extendedData = data as typeof data & { creator?: { id: string; name: string; email: string } };
      
      // Fetch creator profile
      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', data.created_by)
        .single();
      
      extendedData.creator = creatorProfile || undefined;
      
      return extendedData;
    },
  });

  const myResponse = proposal?.proposal_responses?.find(
    (r: any) => r.owner_id === profile?.id
  );

  const hasResponded = myResponse?.selected_option_id != null;
  const hasPaid = myResponse?.paid_at != null;

  // Get signed URLs for attachments
  const { data: attachmentUrls } = useQuery({
    queryKey: ['proposal-attachments-complete', proposalId],
    queryFn: async () => {
      if (!proposal?.proposal_attachments?.length) return [];
      
      const urls = await Promise.all(
        proposal.proposal_attachments.map(async (att: any) => {
          const { data } = await supabase.storage
            .from('proposals')
            .createSignedUrl(att.file_path, 3600);
          
          return {
            ...att,
            signedUrl: data?.signedUrl
          };
        })
      );
      
      return urls;
    },
    enabled: !!proposal?.proposal_attachments?.length,
  });

  // Check if selected option requires payment
  const requiresPayment = () => {
    const selectedOpt = proposal?.proposal_options?.find((o: any) => o.id === selectedOption) as any;
    // Check if option has requires_payment flag
    if (selectedOpt?.requires_payment) {
      const paymentType = (proposal as any)?.payment_type;
      return paymentType === 'fixed' || paymentType === 'quantity' || paymentType === 'items';
    }
    return false;
  };

  // Calculate payment amount based on type
  const calculatePaymentAmount = () => {
    if (!proposal) return 0;
    const paymentType = (proposal as any)?.payment_type;
    if (paymentType === 'fixed') {
      return proposal.amount_cents || 0;
    }
    if (paymentType === 'quantity') {
      return ((proposal as any).unit_price_cents || 0) * quantity;
    }
    if (paymentType === 'items') {
      const items = (proposal as any).proposal_items || [];
      return items.reduce((total: number, item: any) => {
        const qty = itemQuantities[item.id] || 0;
        return total + (item.unit_price_cents * qty);
      }, 0);
    }
    return 0;
  };

  const hasAnyItemSelected = () => {
    const paymentType = (proposal as any)?.payment_type;
    if (paymentType === 'items') {
      return Object.values(itemQuantities).some(qty => qty > 0);
    }
    return true;
  };

  const respondMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOption) {
        throw new Error('Selecione uma opção');
      }

      let attachmentPath = null;

      // Upload file if provided
      if (file) {
        const fileExt = file.name.split('.').pop();
        const filePath = `proposals/${proposalId}/${profile?.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;
        attachmentPath = filePath;
      }

      if (myResponse) {
        // Update existing response
        const paymentType = (proposal as any)?.payment_type;
        const { error } = await supabase
          .from('proposal_responses')
          .update({
            selected_option_id: selectedOption,
            note: note || null,
            attachment_path: attachmentPath || myResponse.attachment_path,
            responded_at: new Date().toISOString(),
            quantity: paymentType === 'quantity' ? quantity : null,
          })
          .eq('id', myResponse.id);

        if (error) throw error;

        // Save item quantities if payment_type is 'items'
        if (paymentType === 'items' && requiresPayment()) {
          const items = (proposal as any).proposal_items || [];
          const itemsToInsert = items
            .filter((item: any) => (itemQuantities[item.id] || 0) > 0)
            .map((item: any) => ({
              response_id: myResponse.id,
              item_id: item.id,
              quantity: itemQuantities[item.id] || 0,
            }));

          if (itemsToInsert.length > 0) {
            // Delete existing and insert new
            await supabase
              .from('proposal_response_items')
              .delete()
              .eq('response_id', myResponse.id);

            const { error: itemsError } = await supabase
              .from('proposal_response_items')
              .insert(itemsToInsert);

            if (itemsError) throw itemsError;
          }
        }
      }

      // If requires payment, generate payment link
      if (requiresPayment()) {
        const paymentType = (proposal as any)?.payment_type;
        setIsGeneratingPayment(true);
        try {
          const { data: paymentResult, error: paymentError } = await supabase.functions.invoke(
            'create-proposal-payment',
            {
              body: { 
                proposalId,
                quantity: paymentType === 'quantity' ? quantity : undefined,
                itemQuantities: paymentType === 'items' ? itemQuantities : undefined,
              }
            }
          );

          if (paymentError) throw paymentError;
          
          setPaymentData({
            ...paymentResult,
            totalAmount: calculatePaymentAmount()
          });
          setPixDialogOpen(true);
        } catch (err) {
          console.error('Error generating payment:', err);
          toast({
            title: "Resposta registrada",
            description: "Sua resposta foi salva. Entre em contato para realizar o pagamento.",
          });
        } finally {
          setIsGeneratingPayment(false);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-complete', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['pending-proposals-full'] });
      if (!requiresPayment()) {
        toast({
          title: "Resposta registrada!",
          description: "Sua resposta foi salva com sucesso.",
        });
        onResponded?.();
      }
      setNote("");
      setFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao registrar resposta",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openAttachmentGallery = (index: number) => {
    if (!attachmentUrls?.length) return;
    
    setGalleryItems(attachmentUrls.map((att: any) => ({
      id: att.id,
      file_url: att.signedUrl,
      file_name: att.file_name,
      file_type: att.file_type || 'application/octet-stream',
    })));
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  if (isLoading) {
    return (
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!proposal) return null;

  const options = proposal.proposal_options || [];
  const mySelectedOption = options.find((o: any) => o.id === myResponse?.selected_option_id);

  // Check if the selected option requires payment
  const selectedOptionRequiresPayment = mySelectedOption?.requires_payment === true;
  const paymentType = (proposal as any)?.payment_type;
  const hasPaymentConfig = paymentType === 'fixed' || paymentType === 'quantity' || paymentType === 'items';
  const needsPayment = selectedOptionRequiresPayment && hasPaymentConfig;

  // If already responded AND paid (or no payment required for the selected option), don't show
  if (hasResponded && (hasPaid || !needsPayment)) {
    return null;
  }

  return (
    <>
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 shadow-lg overflow-hidden">
        {/* Header */}
        <div 
          className="p-4 bg-primary/10 border-b border-primary/20 cursor-pointer flex items-center justify-between"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <Badge variant="outline" className="mb-1 bg-primary/10 text-primary border-primary/20 text-xs">
                {proposal.category || 'Proposta'}
              </Badge>
              <h3 className="font-bold text-foreground">{proposal.title}</h3>
            </div>
          </div>
          <Button variant="ghost" size="icon">
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>
        </div>

        {isExpanded && (
          <CardContent className="p-4 space-y-4">
            {/* Meta info */}
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span>{proposal.creator?.name || 'Equipe'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Prazo: {format(new Date(proposal.deadline), "dd/MM/yyyy", { locale: ptBR })}</span>
              </div>
            </div>

            {/* Description */}
            <div className="p-3 rounded-lg bg-background/50 border">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {proposal.description}
              </p>
            </div>

            {/* Payment Info Preview - Always visible */}
            {((proposal as any).payment_type === 'fixed' || 
              (proposal as any).payment_type === 'quantity' || 
              (proposal as any).payment_type === 'items') && (
              <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                      💳 Pagamento automático incluso
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Ao aprovar, você será direcionado para pagamento via PIX ou cartão
                    </p>
                  </div>
                </div>

                {/* Fixed amount */}
                {(proposal as any).payment_type === 'fixed' && proposal.amount_cents && proposal.amount_cents > 0 && (
                  <div className="p-3 rounded-lg bg-white/60 dark:bg-black/20 border border-blue-200/50 dark:border-blue-700/50">
                    <p className="text-xs text-muted-foreground">Valor fixo</p>
                    <p className="text-xl font-bold text-primary">
                      R$ {(proposal.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}

                {/* Quantity based */}
                {(proposal as any).payment_type === 'quantity' && (proposal as any).unit_price_cents > 0 && (
                  <div className="p-3 rounded-lg bg-white/60 dark:bg-black/20 border border-blue-200/50 dark:border-blue-700/50">
                    <p className="text-xs text-muted-foreground">Preço por unidade</p>
                    <p className="text-lg font-bold text-primary">
                      R$ {((proposal as any).unit_price_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / unidade
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Você escolherá a quantidade ao aprovar
                    </p>
                  </div>
                )}

                {/* Multiple items preview */}
                {(proposal as any).payment_type === 'items' && ((proposal as any).proposal_items || []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Itens disponíveis:</p>
                    <div className="space-y-1.5">
                      {((proposal as any).proposal_items || []).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded bg-white/60 dark:bg-black/20 border border-blue-200/50 dark:border-blue-700/50">
                          <span className="text-sm font-medium">{item.name}</span>
                          <span className="text-sm text-primary font-semibold">
                            R$ {(item.unit_price_cents / 100).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Você escolherá as quantidades ao aprovar
                    </p>
                  </div>
                )}

                {/* Which options require payment */}
                {options.filter((o: any) => o.requires_payment).length > 0 && (
                  <div className="pt-2 border-t border-blue-200/50 dark:border-blue-700/50">
                    <p className="text-xs text-blue-700 dark:text-blue-400">
                      <strong>Opções que geram pagamento:</strong>{' '}
                      {options.filter((o: any) => o.requires_payment).map((o: any) => `"${o.option_text}"`).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Attachments */}
            {attachmentUrls && attachmentUrls.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Anexos</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {attachmentUrls.map((att: any, index: number) => (
                    <button
                      key={att.id}
                      onClick={() => openAttachmentGallery(index)}
                      className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all group"
                    >
                      {att.file_type?.startsWith('image/') ? (
                        <img 
                          src={att.signedUrl} 
                          alt={att.file_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-white" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Already Responded - Waiting Payment */}
            {hasResponded && !hasPaid && needsPayment && (
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <CreditCard className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-800 dark:text-amber-400">
                      Aguardando pagamento
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                      Você respondeu: <strong>{mySelectedOption?.option_text}</strong>
                    </p>
                    {myResponse?.payment_amount_cents && myResponse.payment_amount_cents > 0 && (
                      <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                        Complete o pagamento de{' '}
                        <strong>R$ {(myResponse.payment_amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                      </p>
                    )}
                    <Button
                      className="mt-3 w-full"
                      onClick={async () => {
                        setIsGeneratingPayment(true);
                        try {
                          const { data: paymentResult, error: paymentError } = await supabase.functions.invoke(
                            'create-proposal-payment',
                            { body: { proposalId } }
                          );
                          if (paymentError) throw paymentError;
                          setPaymentData(paymentResult);
                          setPixDialogOpen(true);
                        } catch (err) {
                          toast({ title: "Erro ao gerar pagamento", variant: "destructive" });
                        } finally {
                          setIsGeneratingPayment(false);
                        }
                      }}
                      disabled={isGeneratingPayment}
                    >
                      {isGeneratingPayment ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</>
                      ) : (
                        <><CreditCard className="mr-2 h-4 w-4" /> Pagar Agora</>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Response Form */}
            {!hasResponded && myResponse && myResponse.is_visible_to_owner && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Escolha sua opção *</Label>
                  <RadioGroup
                    value={selectedOption}
                    onValueChange={setSelectedOption}
                    className="mt-2 space-y-2"
                  >
                    {options.map((option: any) => (
                      <div 
                        key={option.id} 
                        className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                          selectedOption === option.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-muted-foreground/30 bg-background'
                        }`}
                        onClick={() => setSelectedOption(option.id)}
                      >
                        <RadioGroupItem value={option.id} id={`opt-${proposalId}-${option.id}`} />
                        <label 
                          htmlFor={`opt-${proposalId}-${option.id}`} 
                          className="cursor-pointer flex-1 font-medium text-sm"
                        >
                          {option.option_text}
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* Quantity Input - for quantity-based proposals */}
                {selectedOption && requiresPayment() && (proposal as any).payment_type === 'quantity' && (
                  <div className="p-3 rounded-lg bg-muted border space-y-3">
                    <Label className="text-sm font-medium">Quantidade desejada *</Label>
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        disabled={quantity <= 1}
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 text-center"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantity(quantity + 1)}
                      >
                        +
                      </Button>
                    </div>
                    <div className="p-2 rounded bg-primary/10 text-center">
                      <p className="text-xs text-muted-foreground">Total a pagar</p>
                      <p className="text-lg font-bold text-primary">
                        R$ {(calculatePaymentAmount() / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Multiple Items Input */}
                {selectedOption && requiresPayment() && (proposal as any).payment_type === 'items' && (
                  <div className="p-3 rounded-lg bg-muted border space-y-3">
                    <Label className="text-sm font-medium">Selecione as quantidades *</Label>
                    <div className="space-y-2">
                      {((proposal as any).proposal_items || []).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 p-2 bg-background rounded border">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              R$ {(item.unit_price_cents / 100).toFixed(2)} cada
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setItemQuantities(prev => ({
                                ...prev,
                                [item.id]: Math.max(0, (prev[item.id] || 0) - 1)
                              }))}
                              disabled={(itemQuantities[item.id] || 0) <= 0}
                            >
                              -
                            </Button>
                            <span className="w-8 text-center font-medium">
                              {itemQuantities[item.id] || 0}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setItemQuantities(prev => ({
                                ...prev,
                                [item.id]: (prev[item.id] || 0) + 1
                              }))}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {calculatePaymentAmount() > 0 && (
                      <div className="p-2 rounded bg-primary/10 text-center">
                        <p className="text-xs text-muted-foreground">Total a pagar</p>
                        <p className="text-lg font-bold text-primary">
                          R$ {(calculatePaymentAmount() / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Payment warning - fixed amount */}
                {selectedOption && requiresPayment() && (proposal as any).payment_type === 'fixed' && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-2">
                      <CreditCard className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                          Pagamento necessário
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                          Valor: R$ {(proposal.amount_cents! / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-sm">Observação (opcional)</Label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Adicione uma observação..."
                    className="mt-1.5 text-sm"
                    rows={2}
                  />
                </div>

                <div>
                  <Label className="text-sm">Anexar arquivo (opcional)</Label>
                  <Input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="mt-1.5 text-sm"
                  />
                  {file && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {file.name}
                    </p>
                  )}
                </div>

                <Button
                  onClick={() => respondMutation.mutate()}
                  disabled={
                    respondMutation.isPending || 
                    !selectedOption || 
                    isGeneratingPayment ||
                    (requiresPayment() && (proposal as any).payment_type === 'items' && !hasAnyItemSelected())
                  }
                  className="w-full"
                  size="lg"
                >
                  {respondMutation.isPending || isGeneratingPayment ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isGeneratingPayment ? "Gerando pagamento..." : "Enviando..."}
                    </>
                  ) : requiresPayment() ? (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Confirmar e Pagar
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Enviar Resposta
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Media Gallery */}
      <MediaGallery
        items={galleryItems}
        initialIndex={galleryIndex}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
      />

      {/* Payment Dialog */}
      <Dialog open={pixDialogOpen} onOpenChange={setPixDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Pagamento
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sua resposta foi registrada. Complete o pagamento para confirmar.
            </p>

            <div className="p-4 rounded-lg bg-muted text-center">
              <p className="text-sm text-muted-foreground">Valor</p>
              <p className="text-2xl font-bold text-primary">
                R$ {((paymentData?.totalAmount || calculatePaymentAmount()) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>

            {paymentData?.pixQrCodeBase64 && (
              <div className="text-center space-y-3">
                <p className="text-sm font-medium">Pague com PIX</p>
                <div className="inline-block p-4 bg-white rounded-lg">
                  <img 
                    src={`data:image/png;base64,${paymentData.pixQrCodeBase64}`}
                    alt="QR Code PIX"
                    className="w-48 h-48"
                  />
                </div>
                {paymentData.pixQrCode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(paymentData.pixQrCode!);
                      toast({ title: "Código copiado!" });
                    }}
                    className="gap-2"
                  >
                    <QrCode className="h-4 w-4" />
                    Copiar código PIX
                  </Button>
                )}
              </div>
            )}

            {paymentData?.paymentLink && (
              <>
                <Separator />
                <Button
                  className="w-full"
                  onClick={() => window.open(paymentData.paymentLink, '_blank')}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pagar com Cartão (até 12x)
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
