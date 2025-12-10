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
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<any[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    paymentLink?: string;
    pixQrCode?: string;
    pixQrCodeBase64?: string;
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
    if (!proposal?.amount_cents || proposal.amount_cents <= 0) return false;
    
    const selectedOpt = proposal.proposal_options?.find((o: any) => o.id === selectedOption);
    const optionText = selectedOpt?.option_text?.toLowerCase() || '';
    return optionText.includes('sim') || 
           optionText.includes('aprovar') || 
           optionText.includes('concordo') ||
           optionText.includes('aceito');
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
        const { error } = await supabase
          .from('proposal_responses')
          .update({
            selected_option_id: selectedOption,
            note: note || null,
            attachment_path: attachmentPath || myResponse.attachment_path,
            responded_at: new Date().toISOString(),
          })
          .eq('id', myResponse.id);

        if (error) throw error;
      }

      // If requires payment, generate payment link
      if (requiresPayment()) {
        setIsGeneratingPayment(true);
        try {
          const { data: paymentResult, error: paymentError } = await supabase.functions.invoke(
            'create-proposal-payment',
            {
              body: { proposalId }
            }
          );

          if (paymentError) throw paymentError;
          
          setPaymentData(paymentResult);
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

  // If already responded AND paid (or no payment required), don't show
  if (hasResponded && (hasPaid || !proposal.amount_cents)) {
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

            {/* Amount */}
            {proposal.amount_cents && proposal.amount_cents > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <CreditCard className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="text-xl font-bold text-primary">
                    R$ {(proposal.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
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
            {hasResponded && !hasPaid && proposal.amount_cents && proposal.amount_cents > 0 && (
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
                    <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                      Complete o pagamento de{' '}
                      <strong>R$ {(proposal.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    </p>
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

                {/* Payment warning */}
                {selectedOption && requiresPayment() && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-2">
                      <CreditCard className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                          Pagamento necessário
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                          Valor: R$ {(proposal.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                  disabled={respondMutation.isPending || !selectedOption || isGeneratingPayment}
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
                R$ {(proposal.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
