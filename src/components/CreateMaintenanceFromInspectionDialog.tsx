import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Sparkles, ImageIcon, Video, FileAudio } from 'lucide-react';
import { toast } from 'sonner';
import { VoiceToTextInput } from '@/components/VoiceToTextInput';
import { format } from 'date-fns';

interface Attachment {
  id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
}

interface CreateMaintenanceFromInspectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyName: string;
  ownerId: string;
  inspectionId: string;
  attachments: Attachment[];
  transcriptSummary?: string;
}

export function CreateMaintenanceFromInspectionDialog({
  open,
  onOpenChange,
  propertyId,
  propertyName,
  ownerId,
  inspectionId,
  attachments,
  transcriptSummary
}: CreateMaintenanceFromInspectionDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgente'>('normal');
  const [costResponsible, setCostResponsible] = useState<'owner' | 'guest'>('owner');
  const [guestCheckoutDate, setGuestCheckoutDate] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Pre-populate description from transcript summary
  useEffect(() => {
    if (transcriptSummary && open) {
      setDescription(transcriptSummary);
    }
  }, [transcriptSummary, open]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSubject('');
      setPriority('normal');
      setCostResponsible('owner');
      setGuestCheckoutDate('');
      setSelectedAttachments([]);
    }
  }, [open]);

  const mediaAttachments = attachments.filter(a => 
    a.file_type?.startsWith('image/') || a.file_type?.startsWith('video/')
  );

  const toggleAttachment = (id: string) => {
    setSelectedAttachments(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllAttachments = () => {
    setSelectedAttachments(mediaAttachments.map(a => a.id));
  };

  const deselectAllAttachments = () => {
    setSelectedAttachments([]);
  };

  const generateDescription = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate-response', {
        body: { 
          action: 'generate_maintenance',
          context: {
            prompt: aiPrompt,
            propertyContext: `Unidade: ${propertyName}`,
            projectContext: 'Sistema de gestão de hospedagens RIOS - registro de manutenção preventiva ou corretiva em unidades de aluguel por temporada. Descreva o problema de forma clara e objetiva, incluindo localização exata, sintomas observados e urgência se aplicável.'
          }
        }
      });
      
      if (error) throw error;
      if (data?.generatedText) {
        setDescription(data.generatedText);
        setAiPrompt('');
        toast.success('Descrição gerada! Revise e edite se necessário.');
      }
    } catch (error: any) {
      toast.error('Erro ao gerar descrição: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!subject.trim() || !description.trim()) {
      toast.error('Preencha assunto e descrição');
      return;
    }

    if (costResponsible === 'guest' && !guestCheckoutDate) {
      toast.error('Informe a data de check-out do hóspede');
      return;
    }

    setLoading(true);

    try {
      // Create maintenance ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert([{
          owner_id: ownerId,
          created_by: user!.id,
          ticket_type: 'manutencao' as const,
          subject,
          description,
          priority,
          property_id: propertyId,
          cost_responsible: costResponsible,
          guest_checkout_date: costResponsible === 'guest' ? guestCheckoutDate : null,
        }])
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Create initial message with selected attachments
      const selectedFiles = attachments.filter(a => selectedAttachments.includes(a.id));
      
      if (selectedFiles.length > 0 || description) {
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
            attachments: selectedFiles.map(f => ({
              file_url: f.file_url,
              file_type: f.file_type || 'application/octet-stream',
              size_bytes: 0,
              name: f.file_name || 'arquivo',
            })),
          }),
        });
      }

      toast.success('Manutenção criada com sucesso!');
      onOpenChange(false);
      navigate('/admin/manutencoes');
    } catch (error: any) {
      console.error('Error creating maintenance:', error);
      toast.error(error.message || 'Erro ao criar manutenção');
    } finally {
      setLoading(false);
    }
  };

  const getAttachmentIcon = (fileType?: string) => {
    if (fileType?.startsWith('video/')) return <Video className="h-4 w-4" />;
    if (fileType?.startsWith('audio/')) return <FileAudio className="h-4 w-4" />;
    return <ImageIcon className="h-4 w-4" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Manutenção a partir da Vistoria</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Property Info */}
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm font-medium">{propertyName}</p>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Assunto *</Label>
            <Input
              id="subject"
              placeholder="Ex: Torneira do banheiro vazando"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          {/* Description */}
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

          {/* AI Generation */}
          <div className="space-y-2">
            <Label>Gerar com IA (opcional)</Label>
            <div className="flex gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ex: torneira vazando no banheiro"
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
                size="icon"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Cost Responsible */}
          <div className="space-y-3">
            <Label>Responsável pelo custo *</Label>
            <RadioGroup 
              value={costResponsible} 
              onValueChange={(v) => setCostResponsible(v as 'owner' | 'guest')}
              className="grid grid-cols-2 gap-3"
            >
              <div className="flex items-center space-x-2 border rounded-lg p-3">
                <RadioGroupItem value="owner" id="cr-owner" />
                <Label htmlFor="cr-owner" className="font-normal cursor-pointer flex-1">
                  Proprietário
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-lg p-3">
                <RadioGroupItem value="guest" id="cr-guest" />
                <Label htmlFor="cr-guest" className="font-normal cursor-pointer flex-1">
                  Hóspede
                </Label>
              </div>
            </RadioGroup>

            {costResponsible === 'guest' && (
              <>
                <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <AlertDescription className="text-orange-700 dark:text-orange-300">
                    Esta manutenção <strong>não será visível</strong> para o proprietário. O lembrete de cobrança será exibido 14 dias após o check-out.
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-2">
                  <Label htmlFor="checkout-date">Data de Check-out do Hóspede *</Label>
                  <Input
                    id="checkout-date"
                    type="date"
                    value={guestCheckoutDate}
                    onChange={(e) => setGuestCheckoutDate(e.target.value)}
                    required
                  />
                </div>
              </>
            )}
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <RadioGroup value={priority} onValueChange={(v) => setPriority(v as 'normal' | 'urgente')} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="normal" id="p-normal" />
                <Label htmlFor="p-normal" className="font-normal cursor-pointer">Normal</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="urgente" id="p-urgente" />
                <Label htmlFor="p-urgente" className="font-normal cursor-pointer">Urgente</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Attachments Selection */}
          {mediaAttachments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Selecionar Anexos da Vistoria</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={selectAllAttachments}>
                    Todos
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={deselectAllAttachments}>
                    Nenhum
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[200px] overflow-y-auto p-1">
                {mediaAttachments.map((attachment) => {
                  const isSelected = selectedAttachments.includes(attachment.id);
                  return (
                    <div
                      key={attachment.id}
                      className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                        isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-muted-foreground/30'
                      }`}
                      onClick={() => toggleAttachment(attachment.id)}
                    >
                      {attachment.file_type?.startsWith('image/') ? (
                        <img
                          src={attachment.file_url}
                          alt={attachment.file_name || 'Anexo'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          {getAttachmentIcon(attachment.file_type)}
                        </div>
                      )}
                      <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center ${
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-background/80'
                      }`}>
                        <Checkbox checked={isSelected} className="pointer-events-none" />
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedAttachments.length > 0 && (
                <Badge variant="secondary">
                  {selectedAttachments.length} anexo(s) selecionado(s)
                </Badge>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Manutenção'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}