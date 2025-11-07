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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const formSchema = z.object({
  title: z.string().min(5, "Título deve ter no mínimo 5 caracteres"),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres"),
  amount_cents: z.string().optional(),
  category: z.string().optional(),
  deadline: z.string().min(1, "Prazo é obrigatório"),
  property_id: z.string().optional(),
  owner_ids: z.array(z.string()).min(1, "Selecione pelo menos um proprietário"),
});

export default function NovaPropostaVotacao() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      amount_cents: "",
      category: "",
      deadline: "",
      property_id: "",
      owner_ids: [],
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

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Create proposal
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .insert({
          title: values.title,
          description: values.description,
          amount_cents: values.amount_cents ? parseInt(values.amount_cents) * 100 : null,
          category: values.category || null,
          deadline: values.deadline,
          property_id: values.property_id || null,
          created_by: user.id,
          required_approvals: values.owner_ids.length,
        })
        .select()
        .single();

      if (proposalError) throw proposalError;

      // Create responses for each owner
      const responses = values.owner_ids.map(owner_id => ({
        proposal_id: proposal.id,
        owner_id,
        approved: null,
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
        description: "Os proprietários foram notificados.",
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

  const toggleOwner = (ownerId: string) => {
    const current = form.getValues('owner_ids');
    const updated = current.includes(ownerId)
      ? current.filter(id => id !== ownerId)
      : [...current, ownerId];
    form.setValue('owner_ids', updated);
  };

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
            <CardTitle>Nova Proposta para Votação</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <FormControl>
                        <Textarea
                          placeholder="Descreva os detalhes da proposta..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="amount_cents"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor (R$)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                  <FormField
                    control={form.control}
                    name="property_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Imóvel (opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um imóvel" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">Todos os imóveis</SelectItem>
                            {properties?.map((property) => (
                              <SelectItem key={property.id} value={property.id}>
                                {property.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="owner_ids"
                  render={() => (
                    <FormItem>
                      <FormLabel>Proprietários *</FormLabel>
                      <div className="border rounded-md p-4 max-h-60 overflow-y-auto space-y-2">
                        {owners?.map((owner) => (
                          <div key={owner.id} className="flex items-center space-x-2">
                            <Checkbox
                              checked={form.watch('owner_ids').includes(owner.id)}
                              onCheckedChange={() => toggleOwner(owner.id)}
                            />
                            <label className="text-sm cursor-pointer" onClick={() => toggleOwner(owner.id)}>
                              {owner.name} ({owner.email})
                            </label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                    {isSubmitting ? (
                      "Criando..."
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Criar Proposta
                      </>
                    )}
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