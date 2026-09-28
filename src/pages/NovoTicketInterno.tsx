import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Property {
  id: string;
  name: string;
  address: string;
  owner_id?: string;
  profiles?: { name: string };
}

const ROTULO_PAPEL: Record<string, string> = {
  admin: "Admin",
  maintenance: "Manutenção",
  agent: "Atendente",
};

export default function NovoTicketInterno() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgente">("normal");
  const [assignedTo, setAssignedTo] = useState<string>("all");
  const [propertyId, setPropertyId] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (profile?.role !== 'admin') {
      navigate('/painel');
      return;
    }
    fetchTeamMembers();
    fetchProperties();
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

  const fetchProperties = async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('id, name, address, owner_id, profiles!properties_owner_id_fkey(name)')
      .order('name');

    if (!error && data) {
      setProperties(data as any);
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

  /** Cria a mensagem inicial e dispara a notificação de um chamado recém-criado. */
  const iniciarConversa = async (ticketId: string) => {
    const session = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    await fetch(`${supabaseUrl}/functions/v1/create-ticket-message/${ticketId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.data.session?.access_token}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        author_type: 'agent',
        message: description,
        attachments: [],
      }),
    });

    // Enviar notificação para o membro da equipe
    try {
      await supabase.functions.invoke('notify-ticket', {
        body: {
          type: 'ticket_created',
          ticketId,
        },
      });
    } catch (notifyError) {
      console.error('Erro ao enviar notificação:', notifyError);
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
      // Se for "all", criar um chamado para cada membro da equipe
      if (assignedTo === "all") {
        let successCount = 0;
        for (const member of teamMembers) {
          const { data: ticket, error } = await supabase
            .from("tickets")
            .insert([{
              owner_id: member.id,
              created_by: user!.id,
              ticket_type: "duvida",
              subject: subject,
              description: description,
              priority: priority,
              property_id: propertyId || null,
              kind: "internal"
            }])
            .select()
            .single();

          if (!error && ticket) {
            await iniciarConversa(ticket.id);
            successCount++;
          }
        }

        toast.success(`${successCount} chamado(s) criado(s) e equipe notificada!`);
        navigate("/painel", { replace: true });
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
            property_id: propertyId || null,
            kind: "internal"
          }])
          .select()
          .single();

        if (error) throw error;

        await iniciarConversa(ticket.id);

        toast.success("Chamado interno criado e equipe notificada!");
        saveScrollPosition(pathname);
        navigate(`/ticket-detalhes/${ticket.id}`);
      }
    } catch (error: any) {
      console.error("Erro ao criar chamado:", error);
      toast.error(error.message || "Erro ao criar chamado");
    } finally {
      setLoading(false);
    }
  };

  const paraTodaEquipe = assignedTo === "all";
  const totalChamados = paraTodaEquipe ? teamMembers.length : 1;

  return (
    <PaginaInterna
      largura="estreita"
      cabecalho={
        <CabecalhoPagina
          titulo="Novo chamado interno"
          subtitulo="Tarefa ou solicitação para a equipe"
          icone={<Users />}
          tom="primary"
          voltarPara="/painel"
        />
      }
    >
      <Card className="rounded-xl border-border/70 p-4 md:p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="assignedTo">Atribuir para *</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger id="assignedTo">
                <SelectValue placeholder="Selecione um membro ou toda a equipe" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                <SelectItem value="all">Toda a equipe</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} ({ROTULO_PAPEL[member.role] ?? member.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {paraTodaEquipe && (
              <p className="text-xs text-muted-foreground">
                Será criado um chamado para cada um dos {teamMembers.length} membros da equipe, cada um com a própria
                conversa.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="property">Imóvel (opcional)</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger id="property">
                <SelectValue placeholder="Selecione o imóvel (opcional)" />
              </SelectTrigger>
              <SelectContent className="z-50 max-h-72 bg-popover">
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                    {property.profiles?.name && ` · ${property.profiles.name}`}
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
            {/* A IA preenche a descrição: fica logo acima do campo que ela escreve. */}
            <div className="flex gap-2">
              <Input
                id="aiPrompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Gerar com IA: ex. instrução para revisar o check-in"
                aria-label="Instrução para a IA gerar a descrição"
                disabled={isGenerating}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    generateDescription();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={generateDescription}
                disabled={isGenerating || !aiPrompt.trim()}
                aria-label="Gerar descrição com IA"
                title="Gerar descrição com IA"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
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
            <Label htmlFor="priority">Prioridade *</Label>
            <Select value={priority} onValueChange={(value) => setPriority(value as "normal" | "urgente")}>
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/painel", { replace: true })}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || (paraTodaEquipe && teamMembers.length === 0)} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando…
                </>
              ) : paraTodaEquipe ? (
                `Criar ${totalChamados} chamado${totalChamados === 1 ? "" : "s"}`
              ) : (
                "Criar chamado"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </PaginaInterna>
  );
}
