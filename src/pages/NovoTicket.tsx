import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FileText, Image as ImageIcon, Loader2, Paperclip, Ticket, Video, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeFilename } from "@/lib/storage";
import { processFileForUpload } from "@/lib/processVideoForUpload";
import { emParalelo } from "@/lib/fileUpload";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { TIPO_TICKET, type TipoTicket } from "@/lib/ticketMeta";

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

/** Tipos que o proprietário pode abrir (os demais são da equipe). */
type TipoProprietario = Extract<TipoTicket, "duvida" | "conversar_hospedes" | "manutencao" | "melhorias_compras" | "financeiro">;
const TIPOS_PROPRIETARIO: TipoProprietario[] = ["duvida", "conversar_hospedes", "manutencao", "melhorias_compras", "financeiro"];

/** Ícone da prévia pelo tipo do arquivo (sem mostrar extensão). */
function IconeArquivo({ tipo }: { tipo: string }) {
  if (tipo.startsWith("image/")) return <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  if (tipo.startsWith("video/")) return <Video className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

export default function NovoTicket() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [ticketType, setTicketType] = useState<TipoProprietario | "">("");
  const [priority, setPriority] = useState<"normal" | "urgente">("normal");
  const [propertyId, setPropertyId] = useState<string>("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<ReadyAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  // A rota /novo-ticket é só do proprietário (App.tsx): lista os imóveis dele.
  useEffect(() => {
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
  }, [user?.id]);

  // Pre-select property from URL parameter after properties are loaded
  useEffect(() => {
    const propertyParam = searchParams.get('property');
    if (propertyParam && properties.length > 0) {
      const propertyExists = properties.some(p => p.id === propertyParam);
      if (propertyExists) {
        setPropertyId(propertyParam);
      }
    }
  }, [properties, searchParams]);

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
    } catch (err: any) {
      // Fallback: retry with timestamp suffix if invalid key
      if (String(err?.message || err).toLowerCase().includes('invalid key')) {
        const session2 = await supabase.auth.getSession();

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

        const { error: error2 } = await supabase.storage
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
      // Até 3 arquivos ao mesmo tempo; os que subirem ficam, mesmo se outro falhar.
      const resultados = await emParalelo(Array.from(selectedFiles), async (file) =>
        uploadOne(await processFileForUpload(file)),
      );
      const uploaded = resultados.flatMap((r) => (r.ok ? [r.valor] : []));
      const falhas = resultados.flatMap((r) => (r.ok ? [] : [r.erro]));
      setUploadedFiles((prev) => [...prev, ...uploaded]);
      if (falhas.length > 0) throw falhas[0];
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
          ticket_type: ticketType,
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

      // Enviar notificação por email e push
      try {
        await supabase.functions.invoke('notify-ticket', {
          body: {
            type: 'ticket_created',
            ticketId: ticket.id,
          },
        });
      } catch (notifyError) {
        console.error('Erro ao enviar notificação:', notifyError);
        // Não bloqueia a criação do chamado se falhar a notificação
      }

      toast.success("Chamado criado com sucesso!");
      navigate("/meus-chamados", { replace: true });
    } catch (error: any) {
      console.error("Error creating ticket:", error);
      toast.error(error.message || "Erro ao criar chamado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PaginaInterna
      largura="estreita"
      cabecalho={
        <CabecalhoPagina
          titulo="Novo chamado"
          subtitulo="Registre uma solicitação ou dúvida para a equipe RIOS"
          icone={<Ticket />}
          tom="info"
          voltarPara="/meus-chamados"
        />
      }
    >
      <Card className="rounded-xl border-border/70 p-4 md:p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="type">Tipo de chamado</Label>
            <Select value={ticketType} onValueChange={(v) => setTicketType(v as TipoProprietario)} required>
              <SelectTrigger id="type">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                {TIPOS_PROPRIETARIO.map((tipo) => (
                  <SelectItem key={tipo} value={tipo}>
                    {TIPO_TICKET[tipo].rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="property">Imóvel</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger id="property">
                <SelectValue placeholder="Selecione o imóvel (opcional)" />
              </SelectTrigger>
              <SelectContent className="z-50 max-h-72 bg-popover">
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
            <Textarea
              id="description"
              placeholder="Descreva detalhadamente sua solicitação"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              required
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium leading-none">Prioridade</legend>
            <RadioGroup
              value={priority}
              onValueChange={(v) => setPriority(v as "normal" | "urgente")}
              className="grid gap-2 sm:grid-cols-2"
            >
              <label
                htmlFor="prioridade-normal"
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <RadioGroupItem value="normal" id="prioridade-normal" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Normal</span>
                  <span className="block text-xs text-muted-foreground">Para a maioria das solicitações.</span>
                </span>
              </label>
              <label
                htmlFor="prioridade-urgente"
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 transition-colors has-[:checked]:border-destructive/60 has-[:checked]:bg-destructive/5"
              >
                <RadioGroupItem value="urgente" id="prioridade-urgente" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Urgente</span>
                  <span className="block text-xs text-muted-foreground">
                    Só quando o problema impede o uso do imóvel ou afeta hóspedes.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="files">Anexos (opcional)</Label>
            <input
              ref={inputRef}
              id="files"
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,.pdf"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading}
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                {uploading ? "Enviando…" : "Anexar arquivos"}
              </Button>
              <p className="text-xs text-muted-foreground">Fotos, vídeos ou PDF.</p>
            </div>
            {uploadedFiles.length > 0 && (
              <ul className="space-y-1" aria-label="Arquivos anexados">
                {uploadedFiles.map((file) => (
                  <li
                    key={file.file_url}
                    className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 text-xs"
                  >
                    <IconeArquivo tipo={file.file_type} />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(file.file_url)}
                      aria-label="Remover anexo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading || uploading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando chamado…
              </>
            ) : (
              "Criar chamado"
            )}
          </Button>
        </form>
      </Card>
    </PaginaInterna>
  );
}
