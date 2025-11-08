import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MediaGallery } from "@/components/MediaGallery";


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

  const isTeam = profile?.role && ['admin', 'maintenance'].includes(profile.role);

  const { data: proposal, isLoading } = useQuery({
    queryKey: ['proposal', id],
    queryFn: async () => {
      const { data, error } = await supabaseClient
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
            is_visible_to_owner
          ),
          proposal_attachments (
            id,
            file_name,
            file_path
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
      
      // Fetch owner details separately if team member
      if (data.proposal_responses && isTeam) {
        const ownerIds = data.proposal_responses.map((r: any) => r.owner_id);
        const { data: profiles } = await supabaseClient
          .from('profiles')
          .select('id, name, email')
          .in('id', ownerIds);
        
        if (profiles) {
          data.proposal_responses = data.proposal_responses.map((r: any) => ({
            ...r,
            profiles: profiles.find((p: any) => p.id === r.owner_id)
          }));
        }
      }
      
      if (error) throw error;
      return data;
    },
  });

  const myResponse = proposal?.proposal_responses?.find(
    (r: any) => r.owner_id === profile?.id
  );

  const respondMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOption) {
        throw new Error('Selecione uma opção');
      }

      let attachmentPath = null;

      // Upload file if provided
      if (file) {
        const fileExt = file.name.split('.').pop();
        const filePath = `proposals/${id}/${profile?.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabaseClient.storage
          .from('attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;
        attachmentPath = filePath;
      }

      if (myResponse) {
        // Update existing response
        const { error } = await supabaseClient
          .from('proposal_responses')
          .update({
            selected_option_id: selectedOption,
            note: note || null,
            attachment_path: attachmentPath,
            responded_at: new Date().toISOString(),
          })
          .eq('id', myResponse.id);

        if (error) throw error;
      } else {
        // Create new response (shouldn't happen but just in case)
        const { error } = await supabaseClient
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal', id] });
      toast({
        title: "Resposta registrada!",
        description: "Sua resposta foi salva com sucesso.",
      });
      setNote("");
      setFile(null);
      setSelectedOption("");
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
  const options = proposal.proposal_options || [];
  const optionVotes = options.map((opt: any) => ({
    ...opt,
    votes: responses.filter((r: any) => r.selected_option_id === opt.id).length,
  }));

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
              <h3 className="font-semibold mb-3">Resultado da Proposta</h3>
              <div className="space-y-2">
                {optionVotes.map((option: any) => (
                  <div key={option.id} className="flex items-center justify-between p-3 border rounded-md">
                    <span>{option.option_text}</span>
                    <Badge variant="secondary">{option.votes} resposta{option.votes !== 1 && 's'}</Badge>
                  </div>
                ))}
                <div className="flex gap-2 text-sm text-muted-foreground mt-3">
                  <span>Total de respondentes: {responses.filter((r: any) => r.selected_option_id).length}/{responses.length}</span>
                </div>
              </div>
            </div>

            {isTeam && (
              <div>
                <h3 className="font-semibold mb-3">Respostas Individuais</h3>
                <div className="space-y-2">
                  {responses.filter((r: any) => r.selected_option_id).map((response: any) => {
                    const selectedOpt = options.find((o: any) => o.id === response.selected_option_id);
                    
                    const openGallery = async () => {
                      if (!response.attachment_path) return;
                      
                      const { data } = await supabaseClient.storage
                        .from('attachments')
                        .createSignedUrl(response.attachment_path, 3600);
                      
                      if (data?.signedUrl) {
                        // Detectar tipo do arquivo pelo path
                        const extension = response.attachment_path.split('.').pop()?.toLowerCase();
                        let file_type = 'application/octet-stream';
                        
                        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) {
                          file_type = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
                        } else if (['mp4', 'webm', 'ogg'].includes(extension || '')) {
                          file_type = `video/${extension}`;
                        } else if (extension === 'pdf') {
                          file_type = 'application/pdf';
                        }
                        
                        setGalleryItems([{
                          id: response.id,
                          file_url: data.signedUrl,
                          file_name: response.attachment_path.split('/').pop(),
                          file_type,
                        }]);
                        setGalleryIndex(0);
                        setGalleryOpen(true);
                      }
                    };
                    
                    return (
                      <div key={response.id} className="p-3 border rounded-md space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{response.profiles?.name}</p>
                          <Badge variant="secondary">{selectedOpt?.option_text}</Badge>
                        </div>
                        {response.note && (
                          <p className="text-sm text-muted-foreground">{response.note}</p>
                        )}
                        {response.attachment_path && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={openGallery}
                            className="gap-2"
                          >
                            <ImageIcon className="h-4 w-4" />
                            Ver anexo
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!isTeam && myResponse && myResponse.is_visible_to_owner && (
              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">Sua Resposta</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <Label>Escolha sua opção *</Label>
                      <RadioGroup
                        value={selectedOption}
                        onValueChange={setSelectedOption}
                        className="mt-2 space-y-2"
                      >
                        {options.map((option: any) => (
                          <div key={option.id} className="flex items-center space-x-2">
                            <RadioGroupItem value={option.id} id={option.id} />
                            <label htmlFor={option.id} className="cursor-pointer flex-1">
                              {option.option_text}
                            </label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>

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

                    <Button
                      onClick={() => respondMutation.mutate()}
                      disabled={respondMutation.isPending || !selectedOption}
                      className="w-full"
                    >
                      {respondMutation.isPending ? "Enviando..." : "Enviar Resposta"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>

      <MediaGallery
        items={galleryItems}
        initialIndex={galleryIndex}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
      />
    </div>
  );
}