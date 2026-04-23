import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Upload, X, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { sanitizeFilename } from "@/lib/storage";
import { VoiceToTextInput } from "@/components/VoiceToTextInput";
import { MaintenanceCostSplit } from "@/components/MaintenanceCostSplit";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { processFileForUpload } from "@/lib/processVideoForUpload";

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
  owner_id: string;
  profiles?: { name: string };
}

export default function NovaManutencao() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgente">("normal");
  const [propertyId, setPropertyId] = useState<string>("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<ReadyAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [costResponsible, setCostResponsible] = useState<'owner' | 'management' | 'split' | 'guest'>('owner');
  const [splitOwnerPercent, setSplitOwnerPercent] = useState<number | null>(50);
  const [guestCheckoutDate, setGuestCheckoutDate] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [ownerActionMode, setOwnerActionMode] = useState<'pending_decision' | 'essential' | 'pm_immediate'>('pending_decision');
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only admins, agents, and maintenance can access this page
    if (profile && !['admin', 'agent', 'maintenance'].includes(profile.role)) {
      navigate('/minha-caixa');
      return;
    }
    fetchProperties();
  }, [profile, navigate]);

  // Pre-select property from URL parameter
  useEffect(() => {
    const propertyParam = searchParams.get('property');
    if (propertyParam && properties.length > 0) {
      const propertyExists = properties.some(p => p.id === propertyParam);
      if (propertyExists) {
        setPropertyId(propertyParam);
      }
    }
  }, [properties, searchParams]);

  const fetchProperties = async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('id, name, address, owner_id, profiles!properties_owner_id_fkey(name)')
      .order('name');
    
    if (!error && data) {
      setProperties(data as any);
    }
  };

  const uploadOne = async (file: File): Promise<ReadyAttachment> => {
    const session = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
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

    const { error } = await supabase.storage
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
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles?.length) return;

    setUploading(true);
    try {
      const uploaded: ReadyAttachment[] = [];
      for (const file of Array.from(selectedFiles)) {
        // Compress video if it's a video file
        const processedFile = await processFileForUpload(file);
        const result = await uploadOne(processedFile);
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

  const generateTitle = async (descriptionText?: string) => {
    const textToUse = descriptionText || description;
    if (!textToUse.trim()) {
      toast.error("Preencha a descrição primeiro");
      return;
    }
    setIsGeneratingTitle(true);
    try {
      const selectedProperty = properties.find(p => p.id === propertyId);
      const propertyContext = selectedProperty ? `Unidade: ${selectedProperty.name}` : '';
      
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: { 
          action: 'generate_title',
          context: {
            description: textToUse,
            propertyContext,
            projectContext: 'Sistema de gestão de hospedagens RIOS - gere um título curto (máximo 60 caracteres) e objetivo para um chamado de manutenção. O título deve resumir o problema principal de forma clara e direta, sem usar palavras como "Manutenção" ou "Reparo" no início.'
          }
        }
      });
      
      if (error) throw error;
      if (data?.generatedText) {
        const cleanTitle = data.generatedText.replace(/^["']|["']$/g, '').trim();
        setSubject(cleanTitle);
        toast.success("Título gerado!");
      }
    } catch (error: any) {
      toast.error("Erro ao gerar título: " + error.message);
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  const generateDescription = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const selectedProperty = properties.find(p => p.id === propertyId);
      const propertyContext = selectedProperty ? `Unidade: ${selectedProperty.name}` : '';
      
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: { 
          action: 'generate_maintenance',
          context: {
            prompt: aiPrompt,
            propertyContext,
            projectContext: 'Sistema de gestão de hospedagens RIOS - registro de manutenção preventiva ou corretiva em unidades de aluguel por temporada. Descreva o problema de forma clara e objetiva, incluindo localização exata, sintomas observados e urgência se aplicável.'
          }
        }
      });
      
      if (error) throw error;
      if (data?.generatedText) {
        setDescription(data.generatedText);
        setAiPrompt("");
        toast.success("Descrição gerada! Revise e edite se necessário.");
        
        // Auto-generate title if subject is empty
        if (!subject.trim()) {
          generateTitle(data.generatedText);
        }
      }
    } catch (error: any) {
      toast.error("Erro ao gerar descrição: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!propertyId) {
      toast.error("Selecione a unidade");
      return;
    }

    if (!subject.trim() || !description.trim()) {
      toast.error("Preencha assunto e descrição");
      return;
    }

    setLoading(true);

    try {
      // Get owner_id from property
      const selectedProperty = properties.find(p => p.id === propertyId);
      if (!selectedProperty) {
        throw new Error("Unidade não encontrada");
      }

      // Map 'management' to 'pm' for database
      const dbCostResponsible = costResponsible === 'management' ? 'pm' : costResponsible;

      // Determine if this is essential (immediate action) or needs owner decision
      const isEssential = ownerActionMode === 'essential';
      const ownerDecision = ownerActionMode === 'pm_immediate' ? 'pm_will_fix' : null;
      
      // Set 72h deadline for owner decision if mode is pending_decision
      const ownerActionDueAt = ownerActionMode === 'pending_decision' 
        ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
        : null;

      // Create maintenance ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert([{
          owner_id: selectedProperty.owner_id,
          created_by: user!.id,
          ticket_type: "manutencao" as const,
          kind: "maintenance",
          subject,
          description,
          priority,
          property_id: propertyId,
          cost_responsible: dbCostResponsible,
          guest_checkout_date: costResponsible === 'guest' && guestCheckoutDate ? guestCheckoutDate : null,
          essential: isEssential,
          owner_decision: ownerDecision,
          owner_action_due_at: ownerActionDueAt,
        }])
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Create initial message with uploaded attachments
      if (uploadedFiles.length > 0 || description) {
        const session = await supabase.auth.getSession();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        
        await fetch(`${supabaseUrl}/functions/v1/create-ticket-message/${ticket.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({
            author_type: 'agent',
            message: description || null,
            attachments: uploadedFiles.map(f => ({
              file_url: f.file_url,
              file_type: f.file_type,
              size_bytes: f.size_bytes,
              name: f.name,
            })),
          }),
        });
      }

      // Send notification for owner decision if applicable
      if (ownerActionMode === 'pending_decision') {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        
        fetch(`${supabaseUrl}/functions/v1/notify-owner-decision`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
          },
          body: JSON.stringify({
            type: 'decision_pending',
            ticketId: ticket.id,
          }),
        }).catch(err => console.error('Failed to send decision notification:', err));
      }

      toast.success("Manutenção criada com sucesso!");
      navigate(`/admin/manutencoes`);
    } catch (error: any) {
      console.error("Error creating maintenance:", error);
      toast.error(error.message || "Erro ao criar manutenção");
    } finally {
      setLoading(false);
    }
  };

  const getCostResponsibleLabel = () => {
    switch (costResponsible) {
      case 'owner': return 'Proprietário';
      case 'management': return 'Gestão';
      case 'guest': return 'Hóspede';
      case 'split': return 'Dividido';
      default: return '';
    }
  };

  const handleGoBack = () => {
    navigate("/admin/manutencoes");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" type="button" onClick={handleGoBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Nova Manutenção</h1>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-8">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Criar manutenção</CardTitle>
            <CardDescription>
              Registre um novo chamado de manutenção para uma unidade
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="property">Unidade *</Label>
                <Select value={propertyId} onValueChange={setPropertyId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a unidade" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border z-50">
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                        {property.profiles?.name && ` - ${property.profiles.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Assunto *</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="subject"
                      placeholder={isGeneratingTitle ? "Gerando título..." : "Ex: Torneira do banheiro vazando"}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      disabled={isGeneratingTitle}
                      required
                    />
                    {isGeneratingTitle && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => generateTitle()}
                    disabled={isGeneratingTitle || !description.trim()}
                    title="Gerar título com IA"
                  >
                    {isGeneratingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição *</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva o problema encontrado..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
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
                    placeholder="Ex: torneira vazando no banheiro da suíte"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        generateDescription();
                      }
                    }}
                  />
                  <VoiceToTextInput onTranscript={(text) => setAiPrompt(prev => prev ? `${prev} ${text}` : text)} />
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
                <p className="text-xs text-muted-foreground">
                  Descreva brevemente o problema e a IA gerará uma descrição detalhada
                </p>
              </div>

              <div className="space-y-3">
                <Label>Responsável pelo custo *</Label>
                <RadioGroup 
                  value={costResponsible} 
                  onValueChange={(v) => setCostResponsible(v as any)}
                  className="grid grid-cols-2 gap-3"
                >
                  <div className="flex items-center space-x-2 border rounded-lg p-3">
                    <RadioGroupItem value="owner" id="cost-owner" />
                    <Label htmlFor="cost-owner" className="font-normal cursor-pointer flex-1">
                      Proprietário
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 border rounded-lg p-3">
                    <RadioGroupItem value="management" id="cost-management" />
                    <Label htmlFor="cost-management" className="font-normal cursor-pointer flex-1">
                      Gestão
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 border rounded-lg p-3">
                    <RadioGroupItem value="guest" id="cost-guest" />
                    <Label htmlFor="cost-guest" className="font-normal cursor-pointer flex-1">
                      Hóspede
                    </Label>
                  </div>
                </RadioGroup>

                {costResponsible === 'management' && (
                  <Alert className="border-info/30 bg-info/10 dark:bg-blue-950/30">
                    <AlertTriangle className="h-4 w-4 text-info" />
                    <AlertDescription className="text-info dark:text-blue-300">
                      Esta manutenção <strong>não será visível</strong> para o proprietário. Use para manutenções internas ou de responsabilidade da gestão.
                    </AlertDescription>
                  </Alert>
                )}

                {costResponsible === 'guest' && (
                  <div className="space-y-3">
                    <Alert className="border-warning/30 bg-warning/10 dark:bg-orange-950/30">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <AlertDescription className="text-warning dark:text-orange-300">
                        Esta manutenção <strong>não será visível</strong> para o proprietário. Use para problemas causados por hóspedes ou substituições internas.
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-2 pl-4 border-l-2 border-warning/30">
                      <Label htmlFor="guestCheckoutDate">Data de checkout do hóspede *</Label>
                      <Input
                        id="guestCheckoutDate"
                        type="date"
                        value={guestCheckoutDate}
                        onChange={(e) => setGuestCheckoutDate(e.target.value)}
                        required={costResponsible === 'guest'}
                      />
                      <p className="text-xs text-muted-foreground">
                        O lembrete de cobrança aparecerá 14 dias após esta data (regra Airbnb)
                      </p>
                    </div>
                  </div>
                )}

                {costResponsible === 'split' && (
                  <div className="space-y-2 pl-4 border-l-2 border-muted">
                    <Label>Percentual do proprietário (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={splitOwnerPercent ?? 50}
                      onChange={(e) => setSplitOwnerPercent(Number(e.target.value))}
                    />
                    <p className="text-sm text-muted-foreground">
                      Gestão pagará: {100 - (splitOwnerPercent ?? 50)}%
                    </p>
                  </div>
                )}
              </div>

              {/* Owner Decision Mode - only show for owner-responsible costs */}
              {costResponsible === 'owner' && (
                <div className="space-y-3">
                  <Label>Modo de decisão do proprietário</Label>
                  <RadioGroup 
                    value={ownerActionMode} 
                    onValueChange={(v) => setOwnerActionMode(v as any)}
                    className="space-y-2"
                  >
                    <div className="flex items-start space-x-2 border rounded-lg p-3">
                      <RadioGroupItem value="pending_decision" id="mode-pending" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="mode-pending" className="font-medium cursor-pointer">
                          ⏰ Aguardar decisão (72h)
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          O proprietário terá 72h para decidir se assume a execução ou delega à gestão. 
                          Ele será notificado por email e push, com lembrete 24h antes do prazo.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2 border rounded-lg p-3 border-warning/30 bg-warning/10/50">
                      <RadioGroupItem value="essential" id="mode-essential" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="mode-essential" className="font-medium cursor-pointer text-warning">
                          🚨 Essencial / Urgente
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Manutenção crítica que precisa ser executada imediatamente (vazamentos, 
                          problemas elétricos graves, etc). Não aguarda decisão do proprietário.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2 border rounded-lg p-3 border-info/30 bg-info/10/50">
                      <RadioGroupItem value="pm_immediate" id="mode-pm" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="mode-pm" className="font-medium cursor-pointer text-info">
                          👥 Gestão assume imediatamente
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          A gestão assumirá a execução sem consultar o proprietário. 
                          Útil para manutenções pequenas ou já acordadas.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              )}
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <RadioGroup value={priority} onValueChange={(v) => setPriority(v as any)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="normal" id="normal" />
                    <Label htmlFor="normal" className="font-normal cursor-pointer">
                      Normal
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="urgente" id="urgente" />
                    <Label htmlFor="urgente" className="font-normal cursor-pointer">
                      Urgente
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
                    Criando...
                  </>
                ) : (
                  "Criar Manutenção"
                )}
              </Button>
            </CardContent>
          </form>
        </Card>
      </main>
    </div>
  );
}
