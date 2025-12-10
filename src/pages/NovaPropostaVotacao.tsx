import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, X, Plus, Sparkles, Upload, FileIcon, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { buildStorageKey } from "@/lib/storage";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";

interface OptionConfig {
  text: string;
  requiresPayment: boolean;
}

const formSchema = z.object({
  title: z.string().min(5, "Título deve ter no mínimo 5 caracteres"),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres"),
  category: z.string().optional(),
  deadline: z.string().min(1, "Prazo é obrigatório"),
  target_audience: z.enum(['owners', 'team'], { required_error: "Selecione o público-alvo" }),
  team_ids: z.array(z.string()).optional(),
  property_ids: z.array(z.string()).min(1, "Selecione pelo menos uma unidade"),
  options: z.array(z.object({
    text: z.string().min(1),
    requiresPayment: z.boolean(),
  })).min(2, "Adicione pelo menos 2 opções"),
  payment_type: z.enum(['none', 'fixed', 'quantity']),
  amount_cents: z.number().optional(),
  unit_price_cents: z.number().optional(),
}).refine((data) => {
  if (data.target_audience === 'owners') {
    return (data.property_ids?.length ?? 0) > 0;
  }
  if (data.target_audience === 'team') {
    return (data.team_ids?.length ?? 0) > 0;
  }
  return true;
}, {
  message: "Selecione pelo menos uma unidade ou membro da equipe",
  path: ["property_ids"],
}).refine((data) => {
  if (data.payment_type === 'fixed') {
    return data.amount_cents && data.amount_cents > 0;
  }
  if (data.payment_type === 'quantity') {
    return data.unit_price_cents && data.unit_price_cents > 0;
  }
  return true;
}, {
  message: "Informe o valor do pagamento",
  path: ["amount_cents"],
});

export default function NovaPropostaVotacao() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
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
    },
  });

  // Fetch owners
  const { data: owners } = useQuery({
    queryKey: ['owners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('role', 'owner')
        .eq('status', 'active')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch properties
  const { data: properties } = useQuery({
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
  const { data: teamMembers } = useQuery({
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
    } catch (error: any) {
      toast({
        title: "Erro ao gerar descrição",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
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
          payment_type: values.payment_type,
          amount_cents: values.payment_type === 'fixed' ? values.amount_cents : null,
          unit_price_cents: values.payment_type === 'quantity' ? values.unit_price_cents : null,
        })
        .select()
        .single();

      if (proposalError) throw proposalError;

      // Upload attachments
      if (attachments.length > 0) {
        for (const file of attachments) {
          const filePath = `proposals/${proposal.id}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from('proposals')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { error: attachmentError } = await supabase
            .from('proposal_attachments')
            .insert({
              proposal_id: proposal.id,
              file_path: filePath,
              file_name: file.name,
              file_type: file.type,
              file_size: file.size,
              created_by: user.id,
            });

          if (attachmentError) throw attachmentError;
        }
      }

      // Create options
      const optionsData = values.options.map((opt, index) => ({
        proposal_id: proposal.id,
        option_text: opt.text,
        order_index: index,
        requires_payment: opt.requiresPayment,
      }));

      const { error: optionsError } = await supabase
        .from('proposal_options')
        .insert(optionsData);

      if (optionsError) throw optionsError;

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

      navigate('/votacoes');
    } catch (error: any) {
      console.error('Error creating proposal:', error);
      toast({
        title: "Erro ao criar proposta",
        description: error.message,
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
    form.setValue('team_ids', updated);
  };

  const toggleProperty = (propertyId: string) => {
    const current = form.getValues('property_ids') || [];
    const updated = current.includes(propertyId)
      ? current.filter(id => id !== propertyId)
      : [...current, propertyId];
    form.setValue('property_ids', updated);
  };

  const selectAllProperties = () => {
    const allIds = properties?.map(p => p.id) || [];
    form.setValue('property_ids', allIds);
  };

  const deselectAllProperties = () => {
    form.setValue('property_ids', []);
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    const current = form.getValues('options') || [];
    form.setValue('options', [...current, { text: newOption.trim(), requiresPayment: false }]);
    setNewOption("");
  };

  const removeOption = (index: number) => {
    const current = form.getValues('options') || [];
    form.setValue('options', current.filter((_, i) => i !== index));
  };

  const toggleOptionPayment = (index: number) => {
    const current = form.getValues('options') || [];
    const updated = current.map((opt, i) => 
      i === index ? { ...opt, requiresPayment: !opt.requiresPayment } : opt
    );
    form.setValue('options', updated);
  };

  const paymentType = form.watch('payment_type');

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Nova Proposta</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="target_audience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Público-alvo *</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="owners" id="owners" />
                            <label htmlFor="owners" className="cursor-pointer">Proprietários</label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="team" id="team" />
                            <label htmlFor="team" className="cursor-pointer">Equipe</label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Compra de Fechaduras Eletrônicas" {...field} />
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
                            placeholder="Digite ou grave um comando para a IA gerar a descrição..."
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), generateDescription())}
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
                            <Sparkles className="h-4 w-4 mr-2" />
                            {isGenerating ? "Gerando..." : "Gerar"}
                          </Button>
                        </div>
                        <FormControl>
                          <Textarea
                            placeholder="Descreva os detalhes da proposta..."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Melhorias" {...field} />
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

                <FormField
                  control={form.control}
                  name="property_ids"
                  render={() => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Unidades</FormLabel>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={selectAllProperties}>
                            Selecionar todas
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={deselectAllProperties}>
                            Desselecionar todas
                          </Button>
                        </div>
                      </div>
                      <div className="border rounded-md p-4 max-h-60 overflow-y-auto space-y-2">
                        {properties?.map((property) => (
                          <div key={property.id} className="flex items-center space-x-2">
                            <Checkbox
                              checked={form.watch('property_ids')?.includes(property.id)}
                              onCheckedChange={() => toggleProperty(property.id)}
                            />
                            <label className="text-sm cursor-pointer flex-1" onClick={() => toggleProperty(property.id)}>
                              {property.name}
                            </label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <FormLabel>Anexos</FormLabel>
                  <div className="flex gap-2">
                    <Input
                      type="file"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setAttachments(prev => [...prev, ...files]);
                      }}
                      className="hidden"
                      id="file-upload"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('file-upload')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Adicionar arquivos
                    </Button>
                  </div>
                  {attachments.length > 0 && (
                    <div className="border rounded-md p-3 space-y-2">
                      {attachments.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-muted p-2 rounded">
                          <div className="flex items-center gap-2">
                            <FileIcon className="h-4 w-4" />
                            <span className="text-sm">{file.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payment Configuration */}
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <FormLabel className="text-base font-semibold">Configuração de Pagamento</FormLabel>
                  
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
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="none" id="payment-none" />
                              <label htmlFor="payment-none" className="cursor-pointer text-sm">
                                Sem pagamento
                              </label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="fixed" id="payment-fixed" />
                              <label htmlFor="payment-fixed" className="cursor-pointer text-sm">
                                Valor fixo (mesmo valor para todos)
                              </label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="quantity" id="payment-quantity" />
                              <label htmlFor="payment-quantity" className="cursor-pointer text-sm">
                                Por quantidade (preço unitário × quantidade)
                              </label>
                            </div>
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
                              placeholder="Ex: 150.00"
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
                              placeholder="Ex: 89.90"
                              value={field.value ? (field.value / 100).toFixed(2) : ''}
                              onChange={(e) => field.onChange(Math.round(parseFloat(e.target.value || '0') * 100))}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            O proprietário informará a quantidade desejada e o valor será calculado automaticamente.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="options"
                  render={() => (
                    <FormItem>
                      <FormLabel>Opções de resposta *</FormLabel>
                      {paymentType !== 'none' && (
                        <p className="text-xs text-muted-foreground">
                          Marque quais opções requerem pagamento (ex: "Sim")
                        </p>
                      )}
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Digite uma opção..."
                            value={newOption}
                            onChange={(e) => setNewOption(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                          />
                          <Button type="button" onClick={addOption} size="icon">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="border rounded-md p-3 space-y-2 min-h-[100px]">
                          {form.watch('options')?.map((option, index) => (
                            <div key={index} className="flex items-center justify-between bg-muted p-2 rounded gap-2">
                              <div className="flex items-center gap-3 flex-1">
                                {paymentType !== 'none' && (
                                  <Checkbox
                                    checked={option.requiresPayment}
                                    onCheckedChange={() => toggleOptionPayment(index)}
                                    title="Requer pagamento"
                                  />
                                )}
                                <span className="text-sm flex-1">{option.text}</span>
                                {option.requiresPayment && paymentType !== 'none' && (
                                  <Badge variant="secondary" className="text-xs">
                                    Paga
                                  </Badge>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeOption(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          {!form.watch('options')?.length && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Adicione pelo menos 2 opções
                            </p>
                          )}
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch('target_audience') === 'team' && (
                  <FormField
                    control={form.control}
                    name="team_ids"
                    render={() => (
                      <FormItem>
                        <FormLabel>Membros da equipe *</FormLabel>
                        <div className="border rounded-md p-4 max-h-60 overflow-y-auto space-y-2">
                          {teamMembers?.map((member) => (
                            <div key={member.id} className="flex items-center space-x-2">
                              <Checkbox
                                checked={form.watch('team_ids')?.includes(member.id)}
                                onCheckedChange={() => toggleTeamMember(member.id)}
                              />
                              <label className="text-sm cursor-pointer" onClick={() => toggleTeamMember(member.id)}>
                                {member.name} ({member.email})
                              </label>
                            </div>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(-1)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? "Criando..." : "Criar Proposta"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}