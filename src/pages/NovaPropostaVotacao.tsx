import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { FileText, Image as ImageIcon, Loader2, Plus, Sparkles, Upload, Video, Vote, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import { emParaleloOuFalha } from "@/lib/fileUpload";
import { formatarBRL } from "@/lib/cobrancaMeta";

const formSchema = z.object({
  title: z.string().min(5, "Título deve ter no mínimo 5 caracteres"),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres"),
  category: z.string().optional(),
  deadline: z.string().min(1, "Prazo é obrigatório"),
  target_audience: z.enum(['owners', 'team'], { required_error: "Selecione o público-alvo" }),
  team_ids: z.array(z.string()),
  // Sem `.min(1)` aqui: proposta para a equipe não tem imóvel. A exigência
  // por público fica nos `refine` abaixo.
  property_ids: z.array(z.string()),
  options: z.array(z.object({
    text: z.string().min(1),
    requiresPayment: z.boolean(),
  })).min(2, "Adicione pelo menos 2 opções"),
  payment_type: z.enum(['none', 'fixed', 'quantity', 'items']),
  amount_cents: z.number().optional(),
  unit_price_cents: z.number().optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    unitPriceCents: z.number().min(1),
  })).optional(),
}).refine((data) => data.target_audience !== 'owners' || data.property_ids.length > 0, {
  message: "Selecione pelo menos um imóvel",
  path: ["property_ids"],
}).refine((data) => data.target_audience !== 'team' || data.team_ids.length > 0, {
  message: "Selecione pelo menos um membro da equipe",
  path: ["team_ids"],
}).refine((data) => {
  // Pagamento só existe para proprietários.
  if (data.target_audience !== 'owners') return true;
  if (data.payment_type === 'fixed') {
    return !!data.amount_cents && data.amount_cents > 0;
  }
  if (data.payment_type === 'quantity') {
    return !!data.unit_price_cents && data.unit_price_cents > 0;
  }
  if (data.payment_type === 'items') {
    return !!data.items && data.items.length > 0;
  }
  return true;
}, {
  message: "Informe o valor do pagamento",
  path: ["amount_cents"],
});

type FormValues = z.infer<typeof formSchema>;

const TIPOS_PAGAMENTO: Array<{ valor: FormValues["payment_type"]; rotulo: string }> = [
  { valor: "none", rotulo: "Sem pagamento" },
  { valor: "fixed", rotulo: "Valor fixo (o mesmo para todos)" },
  { valor: "quantity", rotulo: "Por quantidade (item único × quantidade)" },
  { valor: "items", rotulo: "Vários itens (cada um com o seu preço)" },
];

/** Bloco do formulário: rótulo pequeno em caixa alta e conteúdo. */
function Bloco({ titulo, descricao, acao, children }: { titulo: string; descricao?: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Esqueleto das listas de seleção (imóveis, equipe) enquanto carregam. */
function ListaCarregando({ rotulo }: { rotulo: string }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label={rotulo}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

const iconeArquivo = (tipo: string) => {
  if (tipo.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (tipo.startsWith("video/")) return <Video className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
};

export default function NovaPropostaVotacao() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      deadline: "",
      target_audience: 'owners' as const,
      team_ids: [],
      property_ids: [],
      options: [],
      payment_type: 'none' as const,
      amount_cents: undefined,
      unit_price_cents: undefined,
      items: [],
    },
  });

  // Fetch properties
  const { data: properties, isLoading: carregandoImoveis } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name')
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  // Fetch team members
  const { data: teamMembers, isLoading: carregandoEquipe } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('role', ['admin', 'maintenance', 'agent'])
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  const generateDescription = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: {
          action: 'generate_proposal',
          context: {
            prompt: aiPrompt,
            projectContext: 'Sistema de gestão de hospedagens RIOS - propostas para melhorias e decisões relacionadas aos imóveis'
          }
        }
      });

      if (error) throw error;
      if (data?.generatedText) {
        form.setValue('description', data.generatedText);
        setAiPrompt("");
        toast({ title: "Descrição gerada!", description: "Revise e edite se necessário." });
      }
    } catch (error) {
      toast({
        title: "Erro ao gerar descrição",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Get owner IDs from selected properties
      let participantIds: string[] = [];

      if (values.target_audience === 'owners') {
        const { data: properties, error: propertiesError } = await supabase
          .from('properties')
          .select('owner_id')
          .in('id', values.property_ids || []);

        if (propertiesError) throw propertiesError;

        // Get unique owner IDs
        participantIds = [...new Set(properties?.map(p => p.owner_id) || [])];
      } else {
        participantIds = values.team_ids || [];
      }

      // Pagamento é coisa de proprietário: se o público mudou para equipe
      // depois de configurar, o que ficou no formulário não vale.
      const paymentType = values.target_audience === 'owners' ? values.payment_type : 'none';

      // Create proposal
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .insert({
          title: values.title,
          description: values.description,
          category: values.category || null,
          deadline: values.deadline,
          target_audience: values.target_audience,
          created_by: user.id,
          required_approvals: participantIds.length,
          has_attachments: attachments.length > 0,
          payment_type: paymentType,
          amount_cents: paymentType === 'fixed' ? values.amount_cents : null,
          unit_price_cents: paymentType === 'quantity' ? values.unit_price_cents : null,
        })
        .select()
        .single();

      if (proposalError) throw proposalError;

      // Upload attachments
      if (attachments.length > 0) {
        // Até 3 arquivos ao mesmo tempo.
        await emParaleloOuFalha(attachments, async (file, indiceArquivo) => {
          // Compress video if it's a video file
          const processedFile = await processFileForUpload(file);
          const filePath = `proposals/${proposal.id}/${Date.now()}-${indiceArquivo}-${processedFile.name}`;
          const { error: uploadError } = await supabase.storage
            .from('proposals')
            .upload(filePath, processedFile);

          if (uploadError) throw uploadError;

          const { error: attachmentError } = await supabase
            .from('proposal_attachments')
            .insert({
              proposal_id: proposal.id,
              file_path: filePath,
              file_name: processedFile.name,
              file_type: processedFile.type,
              file_size: processedFile.size,
              created_by: user.id,
            });

          if (attachmentError) throw attachmentError;
        });
      }

      // Create options
      const optionsData = values.options.map((opt, index) => ({
        proposal_id: proposal.id,
        option_text: opt.text,
        order_index: index,
        requires_payment: paymentType !== 'none' && opt.requiresPayment,
      }));

      const { error: optionsError } = await supabase
        .from('proposal_options')
        .insert(optionsData);

      if (optionsError) throw optionsError;

      // Create proposal items if payment_type is 'items'
      if (paymentType === 'items' && values.items && values.items.length > 0) {
        const itemsData = values.items.map((item, index) => ({
          proposal_id: proposal.id,
          name: item.name,
          unit_price_cents: item.unitPriceCents,
          order_index: index,
        }));

        const { error: itemsError } = await supabase
          .from('proposal_items')
          .insert(itemsData);

        if (itemsError) throw itemsError;
      }

      // Create responses for each participant
      const responses = participantIds.map(userId => ({
        proposal_id: proposal.id,
        owner_id: userId,
        approved: false, // Default to false, user will vote later
        is_visible_to_owner: values.target_audience === 'owners',
        responded_at: new Date().toISOString(),
      }));

      const { error: responsesError } = await supabase
        .from('proposal_responses')
        .insert(responses);

      if (responsesError) throw responsesError;

      // Send notifications
      await supabase.functions.invoke('notify-proposal-created', {
        body: { proposalId: proposal.id },
      });

      toast({
        title: "Proposta criada!",
        description: `${values.target_audience === 'owners' ? 'Os proprietários' : 'A equipe'} foi notificada.`,
      });

      navigate('/votacoes', { replace: true });
    } catch (error) {
      console.error('Error creating proposal:', error);
      toast({
        title: "Erro ao criar proposta",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTeamMember = (memberId: string) => {
    const current = form.getValues('team_ids') || [];
    const updated = current.includes(memberId)
      ? current.filter(id => id !== memberId)
      : [...current, memberId];
    form.setValue('team_ids', updated, { shouldValidate: form.formState.isSubmitted });
  };

  const toggleProperty = (propertyId: string) => {
    const current = form.getValues('property_ids') || [];
    const updated = current.includes(propertyId)
      ? current.filter(id => id !== propertyId)
      : [...current, propertyId];
    form.setValue('property_ids', updated, { shouldValidate: form.formState.isSubmitted });
  };

  const selectAllProperties = () => {
    const allIds = properties?.map(p => p.id) || [];
    form.setValue('property_ids', allIds, { shouldValidate: form.formState.isSubmitted });
  };

  const deselectAllProperties = () => {
    form.setValue('property_ids', [], { shouldValidate: form.formState.isSubmitted });
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    const current = form.getValues('options') || [];
    form.setValue('options', [...current, { text: newOption.trim(), requiresPayment: false }], {
      shouldValidate: form.formState.isSubmitted,
    });
    setNewOption("");
  };

  const removeOption = (index: number) => {
    const current = form.getValues('options') || [];
    form.setValue('options', current.filter((_, i) => i !== index), { shouldValidate: form.formState.isSubmitted });
  };

  const toggleOptionPayment = (index: number) => {
    const current = form.getValues('options') || [];
    const updated = current.map((opt, i) =>
      i === index ? { ...opt, requiresPayment: !opt.requiresPayment } : opt
    );
    form.setValue('options', updated);
  };

  const addItem = () => {
    if (!newItemName.trim() || !newItemPrice) return;
    const current = form.getValues('items') || [];
    const priceCents = Math.round(parseFloat(newItemPrice) * 100);
    if (priceCents <= 0) return;
    form.setValue('items', [...current, { name: newItemName.trim(), unitPriceCents: priceCents }]);
    setNewItemName("");
    setNewItemPrice("");
  };

  const removeItem = (index: number) => {
    const current = form.getValues('items') || [];
    form.setValue('items', current.filter((_, i) => i !== index));
  };

  const publico = form.watch('target_audience');
  const paraProprietarios = publico === 'owners';
  const paymentType = paraProprietarios ? form.watch('payment_type') : 'none';
  const imoveisSelecionados = form.watch('property_ids') ?? [];
  const equipeSelecionada = form.watch('team_ids') ?? [];
  const opcoes = form.watch('options') ?? [];
  const itens = form.watch('items') ?? [];

  const voltar = () => navigate('/votacoes', { replace: true });

  return (
    <PaginaInterna
      largura="media"
      cabecalho={
        <CabecalhoPagina
          titulo="Nova proposta"
          subtitulo="Votação para proprietários ou para a equipe"
          icone={<Vote />}
          tom="secondary"
          voltarPara="/votacoes"
        />
      }
    >
      <Card className="rounded-xl border-border/70 p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* 1. Público-alvo */}
            <Bloco titulo="Público-alvo">
              <FormField
                control={form.control}
                name="target_audience"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-wrap gap-4"
                        aria-label="Público-alvo"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="owners" id="publico-owners" />
                          <label htmlFor="publico-owners" className="cursor-pointer text-sm">Proprietários</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="team" id="publico-team" />
                          <label htmlFor="publico-team" className="cursor-pointer text-sm">Equipe</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {publico === 'team' && (
                <FormField
                  control={form.control}
                  name="team_ids"
                  render={() => (
                    <FormItem>
                      <FormLabel>Membros da equipe *</FormLabel>
                      <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-border/70 p-3">
                        {carregandoEquipe ? (
                          <ListaCarregando rotulo="Carregando equipe" />
                        ) : (
                          teamMembers?.map((member) => (
                            <div key={member.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`membro-${member.id}`}
                                checked={equipeSelecionada.includes(member.id)}
                                onCheckedChange={() => toggleTeamMember(member.id)}
                              />
                              <label htmlFor={`membro-${member.id}`} className="flex-1 cursor-pointer text-sm">
                                {member.name} <span className="text-muted-foreground">({member.email})</span>
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </Bloco>

            {/* 2. Proposta */}
            <Bloco titulo="Proposta">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Compra de fechaduras eletrônicas" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição *</FormLabel>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Digite ou grave um comando para a IA gerar a descrição…"
                          aria-label="Comando para a IA gerar a descrição"
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              generateDescription();
                            }
                          }}
                        />
                        <VoiceToTextInput
                          onTranscript={(text) => setAiPrompt(text)}
                          disabled={isGenerating}
                        />
                        <Button
                          type="button"
                          onClick={generateDescription}
                          disabled={isGenerating || !aiPrompt.trim()}
                          variant="secondary"
                        >
                          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          {isGenerating ? "Gerando…" : "Gerar"}
                        </Button>
                      </div>
                      <FormControl>
                        <Textarea
                          placeholder="Descreva os detalhes da proposta…"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex.: Melhorias" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prazo *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Bloco>

            {/* 3. Imóveis (só proprietários) */}
            {paraProprietarios && (
              <Bloco
                titulo="Imóveis"
                descricao="Os proprietários dos imóveis marcados recebem a proposta."
                acao={
                  <div className="flex gap-1.5">
                    <Button type="button" variant="outline" size="sm" onClick={selectAllProperties} disabled={carregandoImoveis}>
                      Todos
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={deselectAllProperties} disabled={carregandoImoveis}>
                      Nenhum
                    </Button>
                  </div>
                }
              >
                <FormField
                  control={form.control}
                  name="property_ids"
                  render={() => (
                    <FormItem>
                      <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-border/70 p-3">
                        {carregandoImoveis ? (
                          <ListaCarregando rotulo="Carregando imóveis" />
                        ) : (
                          properties?.map((property) => (
                            <div key={property.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`imovel-${property.id}`}
                                checked={imoveisSelecionados.includes(property.id)}
                                onCheckedChange={() => toggleProperty(property.id)}
                              />
                              <label htmlFor={`imovel-${property.id}`} className="flex-1 cursor-pointer text-sm">
                                {property.name}
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                      {!carregandoImoveis && (
                        <p className="text-xs text-muted-foreground">
                          {imoveisSelecionados.length} de {properties?.length ?? 0} imóveis selecionados
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Bloco>
            )}

            {/* 4. Pagamento (só proprietários) */}
            {paraProprietarios && (
              <Bloco titulo="Pagamento" descricao="Cobrado do proprietário quando ele escolhe uma opção paga.">
                <div className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4">
                  <FormField
                    control={form.control}
                    name="payment_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="space-y-2"
                            aria-label="Tipo de pagamento"
                          >
                            {TIPOS_PAGAMENTO.map((t) => (
                              <div key={t.valor} className="flex items-center gap-2">
                                <RadioGroupItem value={t.valor} id={`pagamento-${t.valor}`} />
                                <label htmlFor={`pagamento-${t.valor}`} className="cursor-pointer text-sm">
                                  {t.rotulo}
                                </label>
                              </div>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {paymentType === 'fixed' && (
                    <FormField
                      control={form.control}
                      name="amount_cents"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor total (R$) *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Ex.: 150,00"
                              value={field.value ? (field.value / 100).toFixed(2) : ''}
                              onChange={(e) => field.onChange(Math.round(parseFloat(e.target.value || '0') * 100))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {paymentType === 'quantity' && (
                    <FormField
                      control={form.control}
                      name="unit_price_cents"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preço unitário (R$) *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Ex.: 89,90"
                              value={field.value ? (field.value / 100).toFixed(2) : ''}
                              onChange={(e) => field.onChange(Math.round(parseFloat(e.target.value || '0') * 100))}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            O proprietário informa a quantidade desejada.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {paymentType === 'items' && (
                    <div className="space-y-3">
                      <FormLabel>Itens disponíveis *</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Adicione os itens com os preços. O proprietário informa a quantidade de cada um.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Nome do item (ex.: capa queen)"
                          aria-label="Nome do item"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Preço (R$)"
                          aria-label="Preço do item"
                          value={newItemPrice}
                          onChange={(e) => setNewItemPrice(e.target.value)}
                          className="w-28"
                        />
                        <Button type="button" onClick={addItem} size="icon" aria-label="Adicionar item">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="min-h-[80px] space-y-2 rounded-lg border border-border/70 p-3">
                        {itens.map((item, index) => (
                          <div key={index} className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                            <Etiqueta tom="neutral">{formatarBRL(item.unitPriceCents)}</Etiqueta>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              onClick={() => removeItem(index)}
                              aria-label={`Remover item ${item.name}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        {itens.length === 0 && (
                          <p className="py-2 text-center text-sm text-muted-foreground">
                            Adicione pelo menos 1 item
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Bloco>
            )}

            {/* 5. Opções de resposta */}
            <Bloco
              titulo="Opções de resposta"
              descricao={paymentType !== 'none' ? 'Marque quais opções exigem pagamento (ex.: "Sim").' : undefined}
            >
              <FormField
                control={form.control}
                name="options"
                render={() => (
                  <FormItem>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Digite uma opção…"
                          aria-label="Nova opção de resposta"
                          value={newOption}
                          onChange={(e) => setNewOption(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addOption();
                            }
                          }}
                        />
                        <Button type="button" onClick={addOption} size="icon" aria-label="Adicionar opção">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="min-h-[100px] space-y-2 rounded-lg border border-border/70 p-3">
                        {opcoes.map((option, index) => (
                          <div key={index} className="flex items-center gap-3 rounded-lg bg-muted/60 px-2.5 py-1.5">
                            {paymentType !== 'none' && (
                              <Checkbox
                                checked={option.requiresPayment}
                                onCheckedChange={() => toggleOptionPayment(index)}
                                aria-label={`Opção "${option.text}" exige pagamento`}
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate text-sm">{option.text}</span>
                            {option.requiresPayment && paymentType !== 'none' && (
                              <Etiqueta tom="warning">Paga</Etiqueta>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              onClick={() => removeOption(index)}
                              aria-label={`Remover opção ${option.text}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        {opcoes.length === 0 && (
                          <p className="py-4 text-center text-sm text-muted-foreground">
                            Adicione pelo menos 2 opções
                          </p>
                        )}
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Bloco>

            {/* 6. Anexos */}
            <Bloco titulo="Anexos" descricao="Fotos, vídeos ou PDFs que ajudam a decidir.">
              <div className="flex gap-2">
                <Input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setAttachments(prev => [...prev, ...files]);
                    e.target.value = '';
                  }}
                  className="hidden"
                  id="file-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Adicionar arquivos
                </Button>
              </div>
              {attachments.length > 0 && (
                <ul className="space-y-1.5 rounded-lg border border-border/70 p-2" aria-label="Arquivos selecionados">
                  {attachments.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
                      <span className="text-muted-foreground" aria-hidden="true">{iconeArquivo(file.type)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                        aria-label="Remover arquivo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={voltar} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Criando…" : "Criar proposta"}
              </Button>
            </div>
          </form>
        </Form>
      </Card>
    </PaginaInterna>
  );
}
