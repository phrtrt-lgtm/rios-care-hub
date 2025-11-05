import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Loader2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import AudioRecorder from '@/components/AudioRecorder';
import AudioPlayer from '@/components/AudioPlayer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface CleanerInspectionFormProps {
  propertyId: string;
  propertyName: string;
  onBack: () => void;
}

export default function CleanerInspectionForm({ propertyId, propertyName, onBack }: CleanerInspectionFormProps) {
  const navigate = useNavigate();
  const [inspectionStatus, setInspectionStatus] = useState<'OK' | 'NÃO' | ''>('');
  const [files, setFiles] = useState<File[]>([]);
  const [audioFiles, setAudioFiles] = useState<Array<{ file: File; transcript: string }>>([]);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      
      // Validar tamanho de cada arquivo (max 50MB)
      const maxSize = 50 * 1024 * 1024; // 50MB
      const oversizedFiles = selectedFiles.filter(f => f.size > maxSize);
      
      if (oversizedFiles.length > 0) {
        toast.error(`Arquivos muito grandes (máx 50MB): ${oversizedFiles.map(f => f.name).join(', ')}`);
        e.target.value = ''; // Limpar input
        return;
      }
      
      setFiles(selectedFiles);
    }
  };

  const handleAudioReady = (file: File, transcriptText: string) => {
    setAudioFiles(prev => [...prev, { file, transcript: transcriptText }]);
  };

  const handleDeleteAudio = (index: number) => {
    setAudioFiles(prev => prev.filter((_, i) => i !== index));
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
    if (!inspectionStatus) {
      toast.error('Selecione o status da vistoria (OK ou NÃO)');
      return;
    }

    // Validar tamanho total
    const totalSize = [...files, ...audioFiles.map(a => a.file)].reduce((sum, f) => sum + f.size, 0);
    const maxTotalSize = 100 * 1024 * 1024; // 100MB total
    
    if (totalSize > maxTotalSize) {
      toast.error('Tamanho total dos arquivos excede 100MB. Remova alguns arquivos.');
      return;
    }

    setSending(true);
    setUploadProgress('Iniciando...');
    
    try {
      console.log('Iniciando upload de arquivos...');
      const attachments: Array<{
        file_url: string;
        file_name: string;
        file_type: string;
        size_bytes: number;
      }> = [];

      // Upload attachments
      let fileIndex = 0;
      for (const file of files) {
        fileIndex++;
        setUploadProgress(`Upload ${fileIndex}/${files.length + audioFiles.length}: ${file.name}`);
        console.log('Fazendo upload de arquivo:', file.name);
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
        fileIndex++;
        setUploadProgress(`Upload ${fileIndex}/${files.length + audioFiles.length}: ${file.name}`);
        console.log('Fazendo upload de áudio:', file.name);
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

      setUploadProgress('Criando vistoria...');
      console.log('Uploads concluídos. Criando vistoria...');
      
      // Get user info
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', user?.id)
        .single();

      // Call edge function to create inspection with timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: A requisição demorou muito')), 30000)
      );

      const inspectionPromise = supabase.functions.invoke('create-inspection', {
        body: {
          property_id: propertyId,
          cleaner_name: profile?.name,
          cleaner_phone: profile?.phone,
          notes: inspectionStatus,
          audio_data: audioData,
          attachments,
        },
      });

      const { data, error } = await Promise.race([
        inspectionPromise,
        timeoutPromise
      ]) as any;

      console.log('Resposta da edge function:', { data, error });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha no envio');

      toast.success('Vistoria enviada com sucesso!');
      setInspectionStatus('');
      setFiles([]);
      setAudioFiles([]);
      setUploadProgress('');
      onBack();
    } catch (error: any) {
      console.error('Erro completo ao enviar vistoria:', error);
      toast.error('Erro ao enviar vistoria: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSending(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Vistoria – {propertyName}</h3>
        <Button variant="ghost" onClick={onBack}>Voltar</Button>
      </div>

      <div className="space-y-4">
        <Label className="text-lg font-medium">Como está o imóvel?</Label>
        <RadioGroup value={inspectionStatus} onValueChange={(value) => setInspectionStatus(value as 'OK' | 'NÃO')}>
          <div className="grid grid-cols-2 gap-4">
            <label 
              htmlFor="status-ok"
              className={`cursor-pointer border-2 rounded-lg p-8 flex flex-col items-center gap-4 transition-all ${
                inspectionStatus === 'OK' 
                  ? 'border-green-500 bg-green-50 dark:bg-green-950' 
                  : 'border-border hover:border-green-300'
              }`}
            >
              <RadioGroupItem value="OK" id="status-ok" className="sr-only" />
              <CheckCircle2 className={`h-20 w-20 ${inspectionStatus === 'OK' ? 'text-green-600' : 'text-muted-foreground'}`} />
              <span className={`text-3xl font-bold ${inspectionStatus === 'OK' ? 'text-green-600' : 'text-muted-foreground'}`}>
                OK
              </span>
            </label>

            <label 
              htmlFor="status-nao"
              className={`cursor-pointer border-2 rounded-lg p-8 flex flex-col items-center gap-4 transition-all ${
                inspectionStatus === 'NÃO' 
                  ? 'border-red-500 bg-red-50 dark:bg-red-950' 
                  : 'border-border hover:border-red-300'
              }`}
            >
              <RadioGroupItem value="NÃO" id="status-nao" className="sr-only" />
              <XCircle className={`h-20 w-20 ${inspectionStatus === 'NÃO' ? 'text-red-600' : 'text-muted-foreground'}`} />
              <span className={`text-3xl font-bold ${inspectionStatus === 'NÃO' ? 'text-red-600' : 'text-muted-foreground'}`}>
                NÃO
              </span>
            </label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>Áudio (opcional)</Label>
        <AudioRecorder onAudioReady={handleAudioReady} />
        
        {audioFiles.length > 0 && (
          <div className="space-y-2 mt-2">
            <p className="text-xs text-muted-foreground">{audioFiles.length} áudio(s) gravado(s)</p>
            {audioFiles.map((audio, index) => (
              <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">Áudio {index + 1}</span>
                  </div>
                  <AudioPlayer file={audio.file} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteAudio(index)}
                  className="text-destructive hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
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
        {sending ? (uploadProgress || 'Enviando...') : 'Enviar vistoria'}
      </Button>
      
      {files.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Tamanho total: {(files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(1)} MB
        </p>
      )}
    </div>
  );
}
