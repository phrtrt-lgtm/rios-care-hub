import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, XCircle, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function VotacaoDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const isTeam = profile?.role && ['admin', 'maintenance'].includes(profile.role);

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
            profiles!proposal_responses_owner_id_fkey (
              name,
              email
            )
          ),
          proposal_attachments (
            id,
            file_name,
            file_path
          )
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  const myResponse = proposal?.proposal_responses?.find(
    (r: any) => r.owner_id === profile?.id
  );

  const respondMutation = useMutation({
    mutationFn: async ({ approved }: { approved: boolean }) => {
      let attachmentPath = null;

      // Upload file if provided
      if (file) {
        const fileExt = file.name.split('.').pop();
        const filePath = `proposals/${id}/${profile?.id}-${Date.now()}.${fileExt}`;
        
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
            approved,
            note: note || null,
            attachment_path: attachmentPath,
            responded_at: new Date().toISOString(),
          })
          .eq('id', myResponse.id);

        if (error) throw error;
      } else {
        // Create new response (shouldn't happen but just in case)
        const { error } = await supabase
          .from('proposal_responses')
          .insert({
            proposal_id: id,
            owner_id: profile?.id,
            approved,
            note: note || null,
            attachment_path: attachmentPath,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal', id] });
      toast({
        title: "Resposta registrada!",
        description: "Sua resposta foi salva com sucesso.",
      });
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

  if (isLoading) {
    return <div className="p-8 text-center">Carregando...</div>;
  }

  if (!proposal) {
    return <div className="p-8 text-center">Proposta não encontrada</div>;
  }

  const responses = proposal.proposal_responses || [];
  const approved = responses.filter((r: any) => r.approved === true).length;
  const rejected = responses.filter((r: any) => r.approved === false).length;
  const pending = responses.filter((r: any) => r.approved === null).length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/votacoes')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl mb-2">{proposal.title}</CardTitle>
                {proposal.category && (
                  <Badge variant="outline">{proposal.category}</Badge>
                )}
              </div>
              <Badge
                variant={
                  proposal.status === 'approved'
                    ? 'default'
                    : proposal.status === 'rejected'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {proposal.status === 'active' ? 'Ativo' : proposal.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">Descrição</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{proposal.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {proposal.amount_cents && (
                <div>
                  <h3 className="font-semibold mb-1">Valor</h3>
                  <p>R$ {(proposal.amount_cents / 100).toFixed(2)}</p>
                </div>
              )}
              <div>
                <h3 className="font-semibold mb-1">Prazo</h3>
                <p>{new Date(proposal.deadline).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Status das Respostas</h3>
              <div className="flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span>Aprovaram: <strong>{approved}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span>Rejeitaram: <strong>{rejected}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 text-yellow-600">⏱</span>
                  <span>Pendentes: <strong>{pending}</strong></span>
                </div>
              </div>
            </div>

            {isTeam && (
              <div>
                <h3 className="font-semibold mb-3">Respostas Individuais</h3>
                <div className="space-y-2">
                  {responses.map((response: any) => (
                    <div key={response.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <p className="font-medium">{response.profiles?.name}</p>
                        {response.note && (
                          <p className="text-sm text-muted-foreground mt-1">{response.note}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {response.approved === true && (
                          <Badge className="bg-green-600">Aprovou</Badge>
                        )}
                        {response.approved === false && (
                          <Badge variant="destructive">Rejeitou</Badge>
                        )}
                        {response.approved === null && (
                          <Badge variant="secondary">Pendente</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isTeam && myResponse && (
              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">Sua Resposta</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <Label>Observação (opcional)</Label>
                      <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Adicione uma observação..."
                        className="mt-2"
                      />
                    </div>

                    <div>
                      <Label>Anexar Comprovante (opcional)</Label>
                      <Input
                        type="file"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="mt-2"
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={() => respondMutation.mutate({ approved: true })}
                        disabled={respondMutation.isPending}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Aprovar
                      </Button>
                      <Button
                        onClick={() => respondMutation.mutate({ approved: false })}
                        disabled={respondMutation.isPending}
                        variant="destructive"
                        className="flex-1"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}