import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Upload, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { sanitizeFilename } from "@/lib/storage";

type ReadyAttachment = { 
  file_url: string; 
  file_type: string; 
  size_bytes: number; 
  name: string;
  ticket_id?: string;
};

interface Property {
  id: string;
  name: string;
  address: string;
}

export default function NovoTicket() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [ticketType, setTicketType] = useState<"duvida" | "informacao" | "conversar_hospedes" | "bloqueio_data" | "manutencao" | "melhorias_compras" | "financeiro" | "">("");
  const [priority, setPriority] = useState<"normal" | "urgente">("normal");
  const [propertyId, setPropertyId] = useState<string>("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<ReadyAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch user properties
  useState(() => {
    const fetchProperties = async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name, address')
        .eq('owner_id', user?.id)
        .order('name');
      
      if (!error && data) {
        setProperties(data);
      }
    };
    
    if (user?.id) {
      fetchProperties();
    }
  });

  const uploadOne = async (file: File): Promise<ReadyAttachment> => {
    const session = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    // 1) Get signed key from server
    const signRes = await fetch(`${supabaseUrl}/functions/v1/upload-sign`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.data.session?.access_token}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        scope: 'ticket-draft',
        ownerId: user?.id,
        filename: file.name,
      }),
    });
    
    if (!signRes.ok) throw new Error('Falha ao assinar upload');
    const { key } = await signRes.json();

    // 2) Upload with the sanitized key
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .upload(key, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(key);

      return {
        file_url: publicUrl,
        file_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        name: sanitizeFilename(file.name),
      };
    } catch (err: any) {
      // Fallback: retry with timestamp suffix if invalid key
      if (String(err?.message || err).toLowerCase().includes('invalid key')) {
        const session2 = await supabase.auth.getSession();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        
        const sign2 = await fetch(`${supabaseUrl}/functions/v1/upload-sign`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session2.data.session?.access_token}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({
            scope: 'ticket-draft',
            ownerId: user?.id,
            filename: `${Date.now()}-${file.name}`,
          }),
        });
        
        const { key: key2 } = await sign2.json();
        
        const { data, error: error2 } = await supabase.storage
          .from('attachments')
          .upload(key2, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error2) throw error2;

        const { data: { publicUrl } } = supabase.storage
          .from('attachments')
          .getPublicUrl(key2);

        return {
          file_url: publicUrl,
          file_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          name: sanitizeFilename(file.name),
        };
      }
      throw err;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles?.length) return;

    setUploading(true);
    try {
      const uploaded: ReadyAttachment[] = [];
      for (const file of Array.from(selectedFiles)) {
        const result = await uploadOne(file);
        uploaded.push(result);
      }
      setUploadedFiles((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} arquivo(s) enviado(s) com sucesso!`);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Erro ao fazer upload dos arquivos');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeFile = (fileUrl: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.file_url !== fileUrl));
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
            projectContext: 'Sistema de gestão de hospedagens RIOS - tickets para proprietários sobre manutenção, dúvidas e informações'
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
          ticket_type: ticketType as "duvida" | "informacao" | "conversar_hospedes" | "bloqueio_data" | "manutencao" | "melhorias_compras" | "financeiro",
          subject,
          description,
          priority,
          property_id: propertyId || null,
        }])
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Create initial message with uploaded attachments
      if (uploadedFiles.length > 0 || description) {
        const session = await supabase.auth.getSession();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        
        const messageRes = await fetch(`${supabaseUrl}/functions/v1/create-ticket-message/${ticket.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({
            author_type: 'owner',
            message: description || null,
            attachments: uploadedFiles.map(f => ({
              file_url: f.file_url,
              file_type: f.file_type,
              size_bytes: f.size_bytes,
              name: f.name,
            })),
          }),
        });

        if (!messageRes.ok) {
          console.error('Message creation failed but ticket was created');
        }
      }

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
                    <SelectItem value="duvida">Dúvida/Informação</SelectItem>
                    <SelectItem value="informacao">Informação</SelectItem>
                    <SelectItem value="conversar_hospedes">Conversar com Hóspedes e Sugestões</SelectItem>
                    <SelectItem value="bloqueio_data">Bloqueio de Datas</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="melhorias_compras">Melhorias/Compras pro Imóvel</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="property">Unidade</Label>
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a unidade (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
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
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Digite um comando para a IA gerar a descrição..."
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), generateDescription())}
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
                  <Textarea
                    id="description"
                    placeholder="Descreva detalhadamente sua solicitação"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={6}
                    required
                  />
                </div>
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
                    ref={inputRef}
                    id="files"
                    type="file"
                    multiple
                    accept="image/*,video/*,application/pdf,.pdf"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                    disabled={uploading}
                  />
                  {uploading ? (
                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                  ) : (
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <p className="text-sm text-muted-foreground">
                      {uploadedFiles.length} arquivo(s) pronto(s):
                    </p>
                    <div className="space-y-1">
                      {uploadedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                          <span className="truncate flex-1">{file.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 ml-2"
                            onClick={() => removeFile(file.file_url)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading || uploading}>
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