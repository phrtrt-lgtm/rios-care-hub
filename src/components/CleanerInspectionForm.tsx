import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Loader2, Mic } from 'lucide-react';
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
  const [audioFiles, setAudioFiles] = useState<Array<{ file: File; transcript: string }>>([]);
  const [sending, setSending] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleAudioReady = (file: File, transcriptText: string) => {
    setAudioFiles(prev => [...prev, { file, transcript: transcriptText }]);
  };

  const handleDeleteAudio = (index: number) => {
    setAudioFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handlePlayAudio = (file: File) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.play();
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
    if (!notes && audioFiles.length === 0 && files.length === 0) {
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

      // Upload audio files and add to attachments
      const audioData: Array<{ audio_url: string; transcript: string }> = [];
      for (const { file, transcript } of audioFiles) {
        const url = await uploadFile(file);
        audioData.push({ audio_url: url, transcript });
        
        // Adicionar áudio aos anexos para enviar ao Monday
        attachments.push({
          file_url: url,
          file_name: file.name,
          file_type: file.type,
          size_bytes: file.size,
        });
      }

      // Call edge function to create inspection
      const { data, error } = await supabase.functions.invoke('create-inspection', {
        body: {
          property_id: propertyId,
          notes,
          audio_data: audioData,
          attachments,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha no envio');

      toast.success('Vistoria enviada com sucesso!');
      setNotes('');
      setFiles([]);
      setAudioFiles([]);
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
        
        {audioFiles.length > 0 && (
          <div className="space-y-2 mt-2">
            <p className="text-xs text-muted-foreground">{audioFiles.length} áudio(s) gravado(s)</p>
            {audioFiles.map((audio, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePlayAudio(audio.file)}
                  className="gap-1"
                >
                  <Mic className="h-3 w-3" />
                  Áudio {index + 1}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteAudio(index)}
                  className="text-destructive hover:text-destructive"
                >
                  Deletar
                </Button>
              </div>
            ))}
          </div>
        )}
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
