import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Image as ImageIcon, 
  Calendar, 
  User, 
  FileText, 
  Paperclip,
  CreditCard,
  Check,
  Clock,
  Loader2,
  QrCode
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MediaGallery } from "@/components/MediaGallery";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ProposalBulkPurchasePanel } from "@/components/ProposalBulkPurchasePanel";

export default function VotacaoDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
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

  const isTeam = profile?.role && ['admin', 'maintenance', 'agent'].includes(profile.role);

  // Fetch proposal data
  const { data: proposal, isLoading } = useQuery({
    queryKey: ['proposal', id],
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
        .eq('id', id)
      .maybeSingle();
      
      if (error) throw error;
      if (!data) {
        throw new Error('Proposta não encontrada');
      }
      
      // Extend data type to include creator
      const extendedData = data as typeof data & { creator?: { id: string; name: string; email: string } };
      
      // Fetch creator profile
      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', data.created_by)
        .single();
      
      extendedData.creator = creatorProfile || undefined;
      
      // Fetch owner details separately if team member
      if (extendedData.proposal_responses && isTeam) {
        const ownerIds = extendedData.proposal_responses.map((r: any) => r.owner_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', ownerIds);
        
        if (profiles) {
          (extendedData as any).proposal_responses = extendedData.proposal_responses.map((r: any) => ({
            ...r,
            profiles: profiles.find((p: any) => p.id === r.owner_id)
          }));
        }
      }
      
      return extendedData;
    },
  });

  const myResponse = proposal?.proposal_responses?.find(
    (r: any) => r.owner_id === profile?.id
  );

  const hasResponded = myResponse?.selected_option_id != null;

  // Get signed URLs for attachments
  const { data: attachmentUrls } = useQuery({
    queryKey: ['proposal-attachments', id],
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
    // If the option contains "sim", "aprovar", "concordo", it likely requires payment
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
        // Compress video if it's a video file
        const processedFile = await processFileForUpload(file);
        const fileExt = processedFile.name.split('.').pop();
        const filePath = `proposals/${id}/${profile?.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, processedFile);

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
      } else {
        // Create new response (shouldn't happen but just in case)
        const { error } = await supabase
          .from('proposal_responses')
          .insert([{
            proposal_id: id as string,
            owner_id: profile?.id as string,
            selected_option_id: selectedOption,
            note: note || null,
            attachment_path: attachmentPath,
            approved: null as any,
          }]);

        if (error) throw error;
      }

      // If requires payment, generate payment link
      if (requiresPayment()) {
        setIsGeneratingPayment(true);
        try {
          const { data: paymentResult, error: paymentError } = await supabase.functions.invoke(
            'create-proposal-payment',
            {
              body: { proposalId: id }
            }
          );

          if (paymentError) throw paymentError;
          
          setPaymentData(paymentResult);
          setPixDialogOpen(true);
        } catch (err) {
          console.error('Error generating payment:', err);
          // Don't fail the response, just show a message
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
      queryClient.invalidateQueries({ queryKey: ['proposal', id] });
      if (!requiresPayment()) {
        toast({
          title: "Resposta registrada!",
          description: "Sua resposta foi salva com sucesso.",
        });
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-muted-foreground">Proposta não encontrada</p>
          <Button variant="outline" onClick={() => navigate('/votacoes')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  const responses = proposal.proposal_responses || [];
  const options = proposal.proposal_options || [];
  const optionVotes = options.map((opt: any) => ({
    ...opt,
    votes: responses.filter((r: any) => r.selected_option_id === opt.id).length,
  }));

  const mySelectedOption = options.find((o: any) => o.id === myResponse?.selected_option_id);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary/5 border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/votacoes')} 
            className="mb-4 -ml-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <Badge 
                variant="outline" 
                className="mb-2 bg-primary/10 text-primary border-primary/20"
              >
                {proposal.category || 'Proposta'}
              </Badge>
              <h1 className="text-2xl font-bold text-foreground">
                {proposal.title}
              </h1>
            </div>
            <Badge
              variant={proposal.status === 'active' ? 'secondary' : 'outline'}
              className={proposal.status === 'active' ? 'bg-success/10 text-success' : ''}
            >
              {proposal.status === 'active' ? 'Ativa' : proposal.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Proposal Details Card */}
        <Card className="border-0 shadow-md">
          <CardContent className="p-6 space-y-6">
            {/* Creator & Date */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>Criado por: <strong className="text-foreground">{proposal.creator?.name || 'Equipe'}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Prazo: <strong className="text-foreground">{format(new Date(proposal.deadline), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</strong></span>
              </div>
            </div>

            <Separator />

            {/* Description */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Descrição
              </h3>
              <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                {proposal.description}
              </p>
            </div>

            {/* Amount if exists */}
            {proposal.amount_cents && proposal.amount_cents > 0 && (
              <>
                <Separator />
                <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Valor da proposta</p>
                    <p className="text-2xl font-bold text-primary">
                      R$ {(proposal.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Attachments */}
            {attachmentUrls && attachmentUrls.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-primary" />
                    Anexos
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {attachmentUrls.map((att: any, index: number) => (
                      <button
                        key={att.id}
                        onClick={() => openAttachmentGallery(index)}
                        className="relative aspect-video rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all group"
                      >
                        {att.file_type?.startsWith('image/') ? (
                          <img 
                            src={att.signedUrl} 
                            alt={att.file_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-white" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Team: Payment Tracking */}
        {isTeam && proposal.amount_cents && proposal.amount_cents > 0 && (
          <Card className="border-0 shadow-md border-success/30">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-success" />
                Pagamentos Recebidos
              </h3>
              
              {(() => {
                const paidResponses = responses.filter((r: any) => r.paid_at);
                const totalPaid = paidResponses.reduce((sum: number, r: any) => sum + (r.payment_amount_cents || 0), 0);
                
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 dark:bg-green-950/30">
                      <span className="text-sm text-muted-foreground">Total arrecadado</span>
                      <span className="text-xl font-bold text-success">
                        R$ {(totalPaid / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      {paidResponses.length} de {responses.length} pagaram
                    </div>
                    
                    {paidResponses.length > 0 && (
                      <div className="space-y-2">
                        {paidResponses.map((r: any) => (
                          <div key={r.id} className="flex items-center justify-between p-2 rounded border bg-background">
                            <span className="font-medium">{r.profiles?.name || 'Proprietário'}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                                <Check className="h-3 w-3 mr-1" />
                                Pago
                              </Badge>
                              <span className="text-sm font-medium">
                                R$ {((r.payment_amount_cents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {paidResponses.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum pagamento recebido ainda
                      </p>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Team: Bulk Purchase Panel for item-based proposals */}
        {isTeam && proposal.payment_type === 'items' && (
          <ProposalBulkPurchasePanel proposalId={id as string} />
        )}

        {/* Team: Vote Results */}
        {isTeam && (
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Resultado da Votação</h3>
              <div className="space-y-3">
                {optionVotes.map((option: any) => {
                  const percentage = responses.length > 0 
                    ? Math.round((option.votes / responses.filter((r: any) => r.selected_option_id).length) * 100) || 0
                    : 0;
                  
                  return (
                    <div key={option.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span>{option.option_text}</span>
                        <span className="text-sm font-medium">{option.votes} voto{option.votes !== 1 && 's'}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="text-sm text-muted-foreground mt-4">
                  Total: {responses.filter((r: any) => r.selected_option_id).length} de {responses.length} responderam
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Team: Individual Responses */}
        {isTeam && (
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Respostas Individuais</h3>
              <div className="space-y-3">
                {responses.map((response: any) => {
                  const selectedOpt = options.find((o: any) => o.id === response.selected_option_id);
                  
                  return (
                    <div key={response.id} className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">{response.profiles?.name || 'Proprietário'}</p>
                        {selectedOpt ? (
                          <Badge variant="secondary">{selectedOpt.option_text}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />
                            Pendente
                          </Badge>
                        )}
                      </div>
                      {response.note && (
                        <p className="text-sm text-muted-foreground">{response.note}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Owner: Already Responded */}
        {!isTeam && hasResponded && (
          <Card className="border-0 shadow-md bg-success/10 dark:bg-green-950/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-success/10 dark:bg-green-900 flex items-center justify-center">
                  <Check className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-semibold text-success">Sua resposta foi registrada</p>
                  <p className="text-sm text-muted-foreground">
                    Você respondeu: <strong>{mySelectedOption?.option_text}</strong>
                  </p>
                </div>
              </div>
              {myResponse?.note && (
                <p className="mt-3 text-sm text-muted-foreground border-t pt-3">
                  Observação: {myResponse.note}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Owner: Response Form */}
        {!isTeam && myResponse && myResponse.is_visible_to_owner && !hasResponded && (
          <Card className="border-0 shadow-md border-primary/20">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                Registrar sua Resposta
              </h3>
              
              <div className="space-y-6">
                <div>
                  <Label className="text-base font-medium">Escolha sua opção *</Label>
                  <RadioGroup
                    value={selectedOption}
                    onValueChange={setSelectedOption}
                    className="mt-3 space-y-3"
                  >
                    {options.map((option: any) => (
                      <div 
                        key={option.id} 
                        className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                          selectedOption === option.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-muted-foreground/30'
                        }`}
                        onClick={() => setSelectedOption(option.id)}
                      >
                        <RadioGroupItem value={option.id} id={option.id} />
                        <label htmlFor={option.id} className="cursor-pointer flex-1 font-medium">
                          {option.option_text}
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* Payment warning */}
                {selectedOption && requiresPayment() && (
                  <div className="p-4 rounded-lg bg-warning/10 dark:bg-amber-950/20 border border-warning/30">
                    <div className="flex items-start gap-3">
                      <CreditCard className="h-5 w-5 text-warning mt-0.5" />
                      <div>
                        <p className="font-medium text-warning">
                          Pagamento necessário
                        </p>
                        <p className="text-sm text-warning mt-1">
                          Ao confirmar esta opção, você será direcionado para pagamento de{' '}
                          <strong>R$ {(proposal.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <Label>Observação (opcional)</Label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Adicione uma observação se desejar..."
                    className="mt-2"
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Anexar arquivo (opcional)</Label>
                  <Input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="mt-2"
                  />
                  {file && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Arquivo selecionado: {file.name}
                    </p>
                  )}
                </div>

                <Button
                  onClick={() => respondMutation.mutate()}
                  disabled={respondMutation.isPending || !selectedOption || isGeneratingPayment}
                  className="w-full h-12 text-base"
                  size="lg"
                >
                  {respondMutation.isPending || isGeneratingPayment ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {isGeneratingPayment ? "Gerando pagamento..." : "Enviando..."}
                    </>
                  ) : requiresPayment() ? (
                    <>
                      <CreditCard className="mr-2 h-5 w-5" />
                      Confirmar e Pagar
                    </>
                  ) : (
                    "Enviar Resposta"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
    </div>
  );
}
