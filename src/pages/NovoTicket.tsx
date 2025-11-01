import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function NovoTicket() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [ticketType, setTicketType] = useState<"duvida" | "manutencao" | "cobranca" | "bloqueio_data" | "financeiro" | "outros" | "">("");
  const [priority, setPriority] = useState<"normal" | "urgente">("normal");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!ticketType) {
      toast.error("Selecione o tipo de chamado");
      return;
    }

    setLoading(true);

    try {
      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert([{
          owner_id: user?.id,
          created_by: user?.id,
          ticket_type: ticketType as "duvida" | "manutencao" | "cobranca" | "bloqueio_data" | "financeiro" | "outros",
          subject,
          description,
          priority,
        }])
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Upload files if any
      if (files.length > 0) {
        for (const file of files) {
          const filePath = `${user?.id}/${ticket.id}/${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from("attachments")
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          // Get public URL for the uploaded file
          const { data: { publicUrl } } = supabase.storage
            .from("attachments")
            .getPublicUrl(filePath);

          // Create attachment record (tickets without messages need ticket_id null for now)
          await supabase.from("ticket_attachments").insert({
            message_id: ticket.id, // Using ticket.id as placeholder - will be linked to first message later
            file_url: publicUrl,
            file_name: file.name,
            file_type: file.type,
            size_bytes: file.size,
            path: filePath,
          });
        }
      }

      // TODO: Send notification email (edge function temporarily disabled)
      // await supabase.functions.invoke("notify-ticket", {
      //   body: { type: "ticket_created", ticketId: ticket.id },
      // });

      toast.success("Chamado criado com sucesso!");
      navigate(`/minha-caixa`);
    } catch (error: any) {
      console.error("Error creating ticket:", error);
      toast.error(error.message || "Erro ao criar chamado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/minha-caixa")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Novo Chamado</h1>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-8">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Criar novo chamado</CardTitle>
            <CardDescription>
              Preencha as informações abaixo para abrir um novo ticket de suporte
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo de chamado</Label>
                <Select value={ticketType} onValueChange={(v) => setTicketType(v as any)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="duvida">Dúvida</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="cobranca">Cobrança</SelectItem>
                    <SelectItem value="bloqueio_data">Bloqueio de Data</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Assunto</Label>
                <Input
                  id="subject"
                  placeholder="Descreva brevemente o assunto"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva detalhadamente sua solicitação"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Prioridade</Label>
                <RadioGroup value={priority} onValueChange={(v) => setPriority(v as any)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="normal" id="normal" />
                    <Label htmlFor="normal" className="font-normal cursor-pointer">
                      Normal (resposta em até 24h)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="urgente" id="urgente" />
                    <Label htmlFor="urgente" className="font-normal cursor-pointer">
                      Urgente (resposta em até 6h)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="files">Anexos (opcional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="files"
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </div>
                {files.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {files.length} arquivo(s) selecionado(s)
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando chamado...
                  </>
                ) : (
                  "Criar chamado"
                )}
              </Button>
            </CardContent>
          </form>
        </Card>
      </main>
    </div>
  );
}