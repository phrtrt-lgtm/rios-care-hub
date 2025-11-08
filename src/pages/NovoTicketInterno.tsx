import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function NovoTicketInterno() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgente">("normal");
  const [assignedTo, setAssignedTo] = useState<string>("all");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (profile?.role !== 'admin') {
      navigate('/painel');
      return;
    }
    fetchTeamMembers();
  }, [profile, navigate]);

  const fetchTeamMembers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .in('role', ['admin', 'agent', 'maintenance'])
      .order('name');
    
    if (!error && data) {
      setTeamMembers(data);
    }
  };

  const generateDescription = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: { 
          action: 'generate_ticket',
          context: {
            prompt: aiPrompt,
            projectContext: 'Sistema interno de gestão - ticket para membros da equipe sobre tarefas, procedimentos e solicitações internas'
          }
        }
      });
      
      if (error) throw error;
      if (data?.generatedText) {
        setDescription(data.generatedText);
        setAiPrompt("");
        toast.success("Descrição gerada! Revise e edite se necessário.");
      }
    } catch (error: any) {
      toast.error("Erro ao gerar descrição: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!subject.trim() || !description.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);
    
    try {
      // Se for "all", criar ticket para cada membro da equipe
      if (assignedTo === "all") {
        let successCount = 0;
        for (const member of teamMembers) {
          const { error } = await supabase
            .from("tickets")
            .insert([{
              owner_id: member.id,
              created_by: user!.id,
              ticket_type: "duvida",
              subject: subject,
              description: description,
              priority: priority,
              kind: "internal"
            }]);

          if (!error) successCount++;
        }
        
        toast.success(`${successCount} ticket(s) criado(s) para a equipe!`);
        navigate("/painel");
      } else {
        const { data: ticket, error } = await supabase
          .from("tickets")
          .insert([{
            owner_id: assignedTo,
            created_by: user!.id,
            ticket_type: "duvida",
            subject: subject,
            description: description,
            priority: priority,
            kind: "internal"
          }])
          .select()
          .single();

        if (error) throw error;

        toast.success("Ticket interno criado com sucesso!");
        navigate(`/ticket-detalhes/${ticket.id}`);
      }
    } catch (error: any) {
      console.error("Erro ao criar ticket:", error);
      toast.error(error.message || "Erro ao criar ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/painel")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Novo Ticket Interno</CardTitle>
            <CardDescription>
              Crie uma tarefa ou ticket para um membro da equipe
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="assignedTo">Atribuir para *</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um membro ou toda equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toda a Equipe</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} ({member.role === 'admin' ? 'Admin' : member.role === 'maintenance' ? 'Manutenção' : 'Atendente'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Assunto *</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Revisar procedimento de limpeza"
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description">Descrição *</Label>
                  <VoiceToTextInput onTranscript={setDescription} />
                </div>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva a tarefa ou solicitação..."
                  rows={6}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="aiPrompt">Gerar com IA (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="aiPrompt"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Ex: criar instrução para revisar procedimento de check-in"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        generateDescription();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={generateDescription}
                    disabled={isGenerating || !aiPrompt.trim()}
                    variant="secondary"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Prioridade *</Label>
                <Select value={priority} onValueChange={(value: any) => setPriority(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/painel")}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    "Criar Ticket"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
