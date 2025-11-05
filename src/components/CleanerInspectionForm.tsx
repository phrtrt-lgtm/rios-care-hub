import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import AudioRecorder from '@/components/AudioRecorder';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CleanerInspectionFormProps {
  propertyId: string;
  propertyName: string;
  onBack: () => void;
}

export default function CleanerInspectionForm({ propertyId, propertyName, onBack }: CleanerInspectionFormProps) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState('');
  const [sending, setSending] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleAudioReady = (file: File, transcriptText: string) => {
    setAudioFile(file);
    if (transcriptText) {
      setTranscript(prev => (prev ? prev + '\n' : '') + transcriptText);
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `inspections/${propertyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async () => {
    if (!notes && !audioFile && files.length === 0) {
      toast.error('Adicione pelo menos uma observação, áudio ou anexo');
      return;
    }

    setSending(true);
    try {
      const attachments: Array<{
        file_url: string;
        file_name: string;
        file_type: string;
        size_bytes: number;
      }> = [];

      // Upload attachments
      for (const file of files) {
        const url = await uploadFile(file);
        attachments.push({
          file_url: url,
          file_name: file.name,
          file_type: file.type,
          size_bytes: file.size,
        });
      }

      // Upload audio
      let audioUrl: string | undefined;
      if (audioFile) {
        audioUrl = await uploadFile(audioFile);
      }

      // Call edge function to create inspection
      const { data, error } = await supabase.functions.invoke('create-inspection', {
        body: {
          property_id: propertyId,
          notes,
          transcript,
          audio_url: audioUrl,
          attachments,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha no envio');

      toast.success('Vistoria enviada com sucesso!');
      setNotes('');
      setFiles([]);
      setAudioFile(null);
      setTranscript('');
      onBack();
    } catch (error: any) {
      console.error('Error submitting inspection:', error);
      toast.error('Erro ao enviar vistoria: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Vistoria – {propertyName}</h3>
        <Button variant="ghost" onClick={onBack}>Voltar</Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Observações (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: Vazamento na pia / lâmpada queimada..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Áudio (opcional)</Label>
        <AudioRecorder onAudioReady={handleAudioReady} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="files">Anexos (fotos/vídeos)</Label>
        <input
          id="files"
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileChange}
          className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
        />
        {files.length > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            {files.length} arquivo(s) selecionado(s)
          </p>
        )}
      </div>

      <Button 
        onClick={handleSubmit} 
        disabled={sending} 
        className="w-full"
      >
        {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {sending ? 'Enviando...' : 'Enviar vistoria'}
      </Button>
    </div>
  );
}
