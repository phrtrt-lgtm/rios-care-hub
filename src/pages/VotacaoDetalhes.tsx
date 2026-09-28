import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  CreditCard,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  QrCode,
  Tag,
  User,
  Users,
  Vote,
  ChartColumn,
  MessageSquareText,
  Video,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MediaGallery } from "@/components/MediaGallery";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ProposalBulkPurchasePanel } from "@/components/ProposalBulkPurchasePanel";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { BotaoLinha, CaixaCarregando, CaixaOperacao, CaixaVazia, SeloContagem } from "@/components/painel/CaixaOperacao";
import { Definicao, ListaDefinicoes } from "@/components/painel/Definicoes";
import { Etiqueta } from "@/components/painel/Etiqueta";
import type { Tom } from "@/components/painel/tons";
import { formatarBRL, formatarData } from "@/lib/cobrancaMeta";
import { diasParaVencer } from "@/lib/vencimento";
import { MentionText } from "@/components/comments/MentionText";

interface Resposta {
  id: string;
  owner_id: string;
  approved: boolean;
  note: string | null;
  attachment_path: string | null;
  responded_at: string;
  selected_option_id: string | null;
  is_visible_to_owner: boolean;
  paid_at: string | null;
  payment_amount_cents: number | null;
  payment_status: string | null;
  profiles?: { id: string; name: string; email: string };
}

interface Anexo {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  signedUrl?: string;
}

interface Opcao {
  id: string;
  option_text: string;
  order_index: number;
}

interface Proposta {
  id: string;
  title: string;
  description: string;
  category: string | null;
  status: string;
  deadline: string;
  amount_cents: number | null;
  payment_type: string | null;
  target_audience: string;
  created_by: string | null;
  proposal_responses: Resposta[];
  proposal_attachments: Anexo[];
  proposal_options: Opcao[];
  creator?: { id: string; name: string; email: string };
}

interface ItemGaleria {
  id: string;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
}

/** Valores reais de `proposals.status` (check constraint da migration). */
const STATUS_PROPOSTA: Record<string, { rotulo: string; tom: Tom }> = {
  active: { rotulo: "Aberta", tom: "info" },
  approved: { rotulo: "Aprovada", tom: "success" },
  rejected: { rotulo: "Rejeitada", tom: "destructive" },
  expired: { rotulo: "Expirada", tom: "neutral" },
};

const PUBLICO: Record<string, string> = {
  owners: "Proprietários",
  team: "Equipe",
};

const iconeAnexo = (tipo: string | null) => {
  if (tipo?.startsWith("image/")) return <ImageIcon className="h-8 w-8" />;
  if (tipo?.startsWith("video/")) return <Video className="h-8 w-8" />;
  return <FileText className="h-8 w-8" />;
};

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
  const [galleryItems, setGalleryItems] = useState<ItemGaleria[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    paymentLink?: string;
    pixQrCode?: string;
    pixQrCodeBase64?: string;
  } | null>(null);
  const [isGeneratingPayment, setIsGeneratingPayment] = useState(false);
  const [abrindoAnexoResposta, setAbrindoAnexoResposta] = useState<string | null>(null);

  const isTeam = !!profile?.role && ['admin', 'maintenance', 'agent'].includes(profile.role);

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

      const extendedData = data as unknown as Proposta;

      // Fetch creator profile
      if (data.created_by) {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('id, name, email')
          .eq('id', data.created_by)
          .maybeSingle();
        extendedData.creator = creatorProfile || undefined;
      }

      // Fetch owner details separately if team member
      if (extendedData.proposal_responses && isTeam) {
        const ownerIds = extendedData.proposal_responses.map((r) => r.owner_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', ownerIds);

        if (profiles) {
          extendedData.proposal_responses = extendedData.proposal_responses.map((r) => ({
            ...r,
            profiles: profiles.find((p) => p.id === r.owner_id),
          }));
        }
      }

      return extendedData;
    },
  });

  const myResponse = proposal?.proposal_responses?.find((r) => r.owner_id === profile?.id);

  const hasResponded = myResponse?.selected_option_id != null;

  // Get signed URLs for attachments
  const { data: attachmentUrls } = useQuery({
    queryKey: ['proposal-attachments', id],
    queryFn: async () => {
      if (!proposal?.proposal_attachments?.length) return [];

      const urls = await Promise.all(
        proposal.proposal_attachments.map(async (att) => {
          const { data } = await supabase.storage
            .from('proposals')
            .createSignedUrl(att.file_path, 3600);

          return {
            ...att,
            signedUrl: data?.signedUrl,
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

    const selectedOpt = proposal.proposal_options?.find((o) => o.id === selectedOption);
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
            approved: false,
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
    onError: (error: Error) => {
      toast({
        title: "Erro ao registrar resposta",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openAttachmentGallery = (index: number) => {
    if (!attachmentUrls?.length) return;

    // Sem o nome real do arquivo: a galeria mostraria "Arquivo: foto-da-cozinha.jpg".
    setGalleryItems(attachmentUrls.map((att) => ({
      id: att.id,
      file_url: att.signedUrl ?? '',
      file_name: null,
      file_type: att.file_type || 'application/octet-stream',
    })));
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  /** Anexo enviado junto com a resposta (bucket `attachments`), aberto na galeria. */
  const abrirAnexoResposta = async (resposta: Resposta) => {
    if (!resposta.attachment_path) return;
    setAbrindoAnexoResposta(resposta.id);
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .createSignedUrl(resposta.attachment_path, 3600);
      if (error) throw error;
      setGalleryItems([{ id: resposta.id, file_url: data.signedUrl, file_name: null, file_type: null }]);
      setGalleryIndex(0);
      setGalleryOpen(true);
    } catch (error) {
      console.error('Erro ao abrir anexo da resposta:', error);
      toast({ title: "Não foi possível abrir o anexo", variant: "destructive" });
    } finally {
      setAbrindoAnexoResposta(null);
    }
  };

  if (isLoading) {
    return (
      <PaginaInterna
        largura="media"
        comNavInferior
        cabecalho={<CabecalhoPagina titulo="Proposta" icone={<Vote />} tom="secondary" voltarPara="/votacoes" />}
      >
        <CaixaCarregando icone={<FileText />} titulo="Detalhes" tom="secondary" linhas={4} />
        <CaixaCarregando icone={<Vote />} titulo="Resposta" tom="primary" linhas={3} />
      </PaginaInterna>
    );
  }

  if (!proposal) {
    return (
      <PaginaInterna
        largura="media"
        comNavInferior
        cabecalho={<CabecalhoPagina titulo="Proposta" icone={<Vote />} tom="secondary" voltarPara="/votacoes" />}
      >
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="busca"
            title="Proposta não encontrada"
            description="Ela pode ter sido excluída ou o link está incorreto."
            action={
              <Button variant="outline" onClick={() => navigate("/votacoes", { replace: true })}>
                <ArrowLeft className="h-4 w-4" />
                Voltar às propostas
              </Button>
            }
          />
        </Card>
      </PaginaInterna>
    );
  }

  const responses = proposal.proposal_responses || [];
  const options = [...(proposal.proposal_options || [])].sort((a, b) => a.order_index - b.order_index);
  const respondidas = responses.filter((r) => r.selected_option_id).length;
  const optionVotes = options.map((opt) => ({
    ...opt,
    votes: responses.filter((r) => r.selected_option_id === opt.id).length,
  }));

  const mySelectedOption = options.find((o) => o.id === myResponse?.selected_option_id);
  const publico = PUBLICO[proposal.target_audience] ?? proposal.target_audience;
  const dias = diasParaVencer(proposal.deadline);
  const prazoEncerrado = proposal.status === "active" && dias < 0;
  const statusMeta = prazoEncerrado
    ? { rotulo: "Prazo encerrado", tom: "neutral" as Tom }
    : STATUS_PROPOSTA[proposal.status] ?? { rotulo: proposal.status, tom: "neutral" as Tom };
  const temValor = !!proposal.amount_cents && proposal.amount_cents > 0;

  // Quem pode responder: o proprietário quando a resposta está liberada para
  // ele; o membro da equipe quando a proposta é para a equipe (essas nascem
  // com is_visible_to_owner=false, e a checagem antiga barrava a equipe).
  // O prazo não tranca o formulário: a regra de hoje é a mesma de antes.
  const podeResponder =
    !!myResponse &&
    !hasResponded &&
    (isTeam ? proposal.target_audience === "team" : myResponse.is_visible_to_owner);

  const paidResponses = responses.filter((r) => r.paid_at);
  const totalPaid = paidResponses.reduce((sum, r) => sum + (r.payment_amount_cents || 0), 0);

  return (
    <PaginaInterna
      largura="media"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo={proposal.title}
          subtitulo={`${publico} · prazo ${formatarData(proposal.deadline)}`}
          icone={<Vote />}
          tom="secondary"
          voltarPara="/votacoes"
          acoes={<Etiqueta tom={statusMeta.tom} ponto tamanho="md">{statusMeta.rotulo}</Etiqueta>}
        />
      }
    >
      {/* Detalhes */}
      <CaixaOperacao icone={<FileText />} titulo="Detalhes" tom="secondary">
        <ListaDefinicoes colunas={2}>
          <Definicao rotulo="Criado por" icone={<User />} valor={proposal.creator?.name || 'Equipe'} />
          <Definicao
            rotulo="Prazo"
            icone={<Calendar />}
            valor={
              <>
                {formatarData(proposal.deadline)}
                {proposal.status === "active" && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {dias === 0 ? "encerra hoje" : dias > 0 ? `encerra em ${dias} dia${dias === 1 ? "" : "s"}` : `encerrou há ${-dias} dia${dias === -1 ? "" : "s"}`}
                  </span>
                )}
              </>
            }
          />
          <Definicao rotulo="Público" icone={<Users />} valor={publico} />
          <Definicao rotulo="Categoria" icone={<Tag />} valor={proposal.category || undefined} />
          {temValor && (
            <Definicao rotulo="Valor da proposta" icone={<CreditCard />} valor={formatarBRL(proposal.amount_cents!)} destaque />
          )}
        </ListaDefinicoes>

        <Separator className="my-4" />

        <div>
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Descrição</h4>
          <MentionText body={proposal.description} className="mt-1.5 leading-relaxed" />
        </div>

        {attachmentUrls && attachmentUrls.length > 0 && (
          <>
            <Separator className="my-4" />
            <div>
              <h4 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                Anexos
              </h4>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {attachmentUrls.map((att, index) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => openAttachmentGallery(index)}
                    aria-label={`Abrir anexo ${index + 1} de ${attachmentUrls.length}`}
                    className="group relative aspect-video overflow-hidden rounded-lg border border-border/70 bg-muted transition-all hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {att.file_type?.startsWith('image/') && att.signedUrl ? (
                      <img
                        src={att.signedUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        {iconeAnexo(att.file_type)}
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <ImageIcon className="h-6 w-6 text-background" aria-hidden="true" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </CaixaOperacao>

      {/* Equipe: pagamentos */}
      {isTeam && temValor && (
        <CaixaOperacao
          icone={<CreditCard />}
          titulo="Pagamentos recebidos"
          tom="success"
          selos={<SeloContagem tom={paidResponses.length > 0 ? "success" : "neutral"}>{paidResponses.length} de {responses.length}</SeloContagem>}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-success/10 px-3 py-2.5">
              <span className="text-sm text-muted-foreground">Total arrecadado</span>
              <span className="text-lg font-bold tabular-nums text-success">{formatarBRL(totalPaid)}</span>
            </div>

            {paidResponses.length > 0 ? (
              <div className="space-y-1">
                {paidResponses.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                    <span className="truncate text-[13px] font-medium">{r.profiles?.name || 'Proprietário'}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Etiqueta tom="success" icone={<Check />}>Pago</Etiqueta>
                      <span className="text-sm font-medium tabular-nums">{formatarBRL(r.payment_amount_cents || 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <CaixaVazia icone={<CreditCard className="h-5 w-5" />} titulo="Nenhum pagamento recebido ainda" />
            )}
          </div>
        </CaixaOperacao>
      )}

      {/* Equipe: compras por item */}
      {isTeam && proposal.payment_type === 'items' && (
        <ProposalBulkPurchasePanel proposalId={id as string} />
      )}

      {/* Equipe: resultado */}
      {isTeam && (
        <CaixaOperacao
          icone={<ChartColumn />}
          titulo="Resultado da votação"
          tom="info"
          selos={<SeloContagem tom="info">{respondidas} de {responses.length}</SeloContagem>}
        >
          {options.length === 0 ? (
            <CaixaVazia icone={<Vote className="h-5 w-5" />} titulo="Esta proposta não tem opções de resposta" />
          ) : (
            <div className="space-y-3">
              {optionVotes.map((option) => {
                const percentage = respondidas > 0 ? Math.round((option.votes / respondidas) * 100) : 0;
                return (
                  <div key={option.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{option.option_text}</span>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                        {option.votes} voto{option.votes !== 1 && 's'} · {percentage}%
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={percentage}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${option.option_text}: ${percentage}%`}
                    >
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                {respondidas} de {responses.length} responderam
              </p>
            </div>
          )}
        </CaixaOperacao>
      )}

      {/* Equipe: respostas individuais */}
      {isTeam && (
        <CaixaOperacao icone={<MessageSquareText />} titulo="Respostas" tom="primary" selos={<SeloContagem>{responses.length}</SeloContagem>}>
          {responses.length === 0 ? (
            <CaixaVazia icone={<Users className="h-5 w-5" />} titulo="Ninguém foi convidado a responder" />
          ) : (
            <div className="space-y-1.5">
              {responses.map((response) => {
                const selectedOpt = options.find((o) => o.id === response.selected_option_id);
                return (
                  <div key={response.id} className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[13px] font-medium">{response.profiles?.name || 'Proprietário'}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        {selectedOpt ? (
                          <Etiqueta tom="success" ponto>{selectedOpt.option_text}</Etiqueta>
                        ) : (
                          <Etiqueta tom="neutral" icone={<Clock />}>Pendente</Etiqueta>
                        )}
                        {response.attachment_path && (
                          <BotaoLinha
                            rotulo="Ver anexo"
                            texto="Ver anexo"
                            onClick={() => abrirAnexoResposta(response)}
                            disabled={abrindoAnexoResposta === response.id}
                          >
                            {abrindoAnexoResposta === response.id ? <Loader2 className="animate-spin" /> : <Paperclip />}
                          </BotaoLinha>
                        )}
                      </div>
                    </div>
                    {response.note && (
                      <MentionText body={response.note} className="mt-1 text-xs text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CaixaOperacao>
      )}

      {/* Já respondeu (proprietário ou membro da equipe) */}
      {myResponse && hasResponded && (
        <CaixaOperacao icone={<Check />} titulo="Sua resposta" tom="success">
          <div className="flex items-center gap-3 rounded-lg bg-success/10 px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success" aria-hidden="true">
              <Check className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-success">Resposta registrada</p>
              <p className="text-sm text-muted-foreground">
                Você respondeu: <strong className="text-foreground">{mySelectedOption?.option_text}</strong>
              </p>
            </div>
          </div>
          {myResponse.note && (
            <div className="mt-3 border-t border-border/60 pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Observação</p>
              <MentionText body={myResponse.note} className="mt-1 text-muted-foreground" />
            </div>
          )}
        </CaixaOperacao>
      )}

      {/* Formulário de resposta */}
      {podeResponder && (
        <CaixaOperacao icone={<Vote />} titulo="Registrar sua resposta" tom="primary">
          <div className="space-y-5">
            <div>
              <Label className="text-sm font-medium">Escolha sua opção *</Label>
              <RadioGroup
                value={selectedOption}
                onValueChange={setSelectedOption}
                className="mt-2 space-y-2"
              >
                {options.map((option) => (
                  <label
                    key={option.id}
                    htmlFor={`opcao-${option.id}`}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 transition-all ${
                      selectedOption === option.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <RadioGroupItem value={option.id} id={`opcao-${option.id}`} />
                    <span className="flex-1 text-sm font-medium">{option.option_text}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Aviso de pagamento */}
            {selectedOption && requiresPayment() && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                <div className="flex items-start gap-3">
                  <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-warning">Pagamento necessário</p>
                    <p className="mt-1 text-sm text-foreground">
                      Ao confirmar esta opção, você será direcionado ao pagamento de{' '}
                      <strong>{formatarBRL(proposal.amount_cents!)}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="observacao">Observação (opcional)</Label>
              <Textarea
                id="observacao"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Adicione uma observação se desejar…"
                className="mt-2"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="anexo-resposta">Anexar arquivo (opcional)</Label>
              <Input
                id="anexo-resposta"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-2"
              />
              {file && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Arquivo selecionado: {file.name}
                </p>
              )}
            </div>

            <Button
              onClick={() => respondMutation.mutate()}
              disabled={respondMutation.isPending || !selectedOption || isGeneratingPayment}
              className="h-12 w-full text-base"
              size="lg"
            >
              {respondMutation.isPending || isGeneratingPayment ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {isGeneratingPayment ? "Gerando pagamento…" : "Enviando…"}
                </>
              ) : requiresPayment() ? (
                <>
                  <CreditCard className="h-5 w-5" />
                  Confirmar e pagar
                </>
              ) : (
                "Enviar resposta"
              )}
            </Button>
          </div>
        </CaixaOperacao>
      )}

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
              <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
              Pagamento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sua resposta foi registrada. Complete o pagamento para confirmar.
            </p>

            <div className="rounded-lg bg-muted p-4 text-center">
              <p className="text-sm text-muted-foreground">Valor</p>
              <p className="text-2xl font-bold tabular-nums text-primary">
                {formatarBRL(proposal.amount_cents ?? 0)}
              </p>
            </div>

            {paymentData?.pixQrCodeBase64 && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Pague com PIX</p>
                {/* Fundo branco de propósito: o leitor de QR precisa do contraste. */}
                <div className="inline-block rounded-lg bg-white p-4">
                  <img
                    src={`data:image/png;base64,${paymentData.pixQrCodeBase64}`}
                    alt="QR Code PIX"
                    className="h-48 w-48"
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
                  <CreditCard className="h-4 w-4" />
                  Pagar com cartão (até 12x)
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PaginaInterna>
  );
}
