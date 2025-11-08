import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, FileIcon, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VotacaoPendenteProps {
  proposal: any;
  userRole: string;
  onVoteSubmitted: () => void;
}

export const VotacaoPendente = ({ proposal, userRole, onVoteSubmitted }: VotacaoPendenteProps) => {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTeam = ['admin', 'agent', 'maintenance'].includes(userRole);
  const userResponse = proposal.proposal_responses?.find((r: any) => r.owner_id === proposal.currentUserId);
  const hasResponded = userResponse?.selected_option_id !== null;

  const handleSubmit = async () => {
    if (!selectedOption) {
      toast({
        title: "Selecione uma opção",
        description: "Por favor, escolha uma opção de resposta.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let attachmentPath = null;
      if (attachment) {
        const filePath = `proposals/${proposal.id}/responses/${Date.now()}-${attachment.name}`;
        const { error: uploadError } = await supabase.storage
          .from('proposals')
          .upload(filePath, attachment);

        if (uploadError) throw uploadError;
        attachmentPath = filePath;
      }

      const { error } = await supabase
        .from('proposal_responses')
        .update({
          selected_option_id: selectedOption,
          note,
          attachment_path: attachmentPath,
          responded_at: new Date().toISOString(),
        })
        .eq('proposal_id', proposal.id)
        .eq('owner_id', user.id);

      if (error) throw error;

      toast({
        title: "Resposta registrada!",
        description: "Sua resposta foi enviada com sucesso.",
      });

      onVoteSubmitted();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar resposta",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const optionVotes = proposal.proposal_options?.map((option: any) => {
    const votes = proposal.proposal_responses?.filter(
      (r: any) => r.selected_option_id === option.id
    ).length || 0;
    return { ...option, votes };
  });

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-bold">{proposal.title}</h3>
              <Badge variant={hasResponded ? "default" : "destructive"}>
                {hasResponded ? "Respondida" : "Pendente"}
              </Badge>
              {proposal.category && (
                <Badge variant="outline">{proposal.category}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Prazo: {format(new Date(proposal.deadline), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
            <p className="text-foreground">{proposal.description}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>
        </div>

        {expanded && (
          <div className="mt-6 space-y-6 border-t pt-6">
            {/* Resultados da proposta */}
            <div className="space-y-3">
              <h4 className="font-semibold">Resultados:</h4>
              {optionVotes?.map((option: any) => (
                <div key={option.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm">{option.option_text}</span>
                  <Badge variant="secondary">{option.votes} resposta(s)</Badge>
                </div>
              ))}
            </div>

            {/* Respostas individuais (apenas para equipe) */}
            {isTeam && (
              <div className="space-y-3">
                <h4 className="font-semibold">Respostas individuais:</h4>
                {proposal.proposal_responses?.filter((r: any) => r.selected_option_id).map((response: any) => (
                  <div key={response.id} className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{response.profiles?.name}</span>
                      <Badge>
                        {proposal.proposal_options?.find((o: any) => o.id === response.selected_option_id)?.option_text}
                      </Badge>
                    </div>
                    {response.note && (
                      <p className="text-sm text-muted-foreground">{response.note}</p>
                    )}
                    {response.attachment_path && (
                      <div className="flex items-center gap-2 text-sm">
                        <FileIcon className="h-4 w-4" />
                        <span>Anexo enviado</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Formulário de resposta (apenas se não respondeu) */}
            {!hasResponded && !isTeam && (
              <div className="space-y-4 border-t pt-6">
                <h4 className="font-semibold">Sua resposta:</h4>
                
                <RadioGroup value={selectedOption} onValueChange={setSelectedOption}>
                  {proposal.proposal_options?.map((option: any) => (
                    <div key={option.id} className="flex items-center space-x-2">
                      <RadioGroupItem value={option.id} id={option.id} />
                      <label htmlFor={option.id} className="cursor-pointer flex-1">
                        {option.option_text}
                      </label>
                    </div>
                  ))}
                </RadioGroup>

                <Textarea
                  placeholder="Observações (opcional)..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[80px]"
                />

                <div className="space-y-2">
                  <label className="text-sm font-medium">Anexo (opcional)</label>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                      className="hidden"
                      id="attachment-upload"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('attachment-upload')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {attachment ? "Trocar arquivo" : "Adicionar arquivo"}
                    </Button>
                    {attachment && (
                      <div className="flex items-center gap-2 flex-1 bg-muted p-2 rounded">
                        <FileIcon className="h-4 w-4" />
                        <span className="text-sm flex-1 truncate">{attachment.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setAttachment(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
                  {isSubmitting ? "Enviando..." : "Enviar resposta"}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};