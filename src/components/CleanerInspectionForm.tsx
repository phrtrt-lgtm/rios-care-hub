import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Loader2, Trash2, CheckCircle2, XCircle, Camera, Video, Mic } from 'lucide-react';
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
  const [audioFiles, setAudioFiles] = useState<Array<{ file: File; transcript: string; transcribing: boolean }>>([]);
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

  const handleAudioReady = (file: File, transcriptText: string, transcribing: boolean) => {
    setAudioFiles(prev => {
      // Se está transcrevendo, adiciona novo áudio
      if (transcribing) {
        return [...prev, { file, transcript: transcriptText, transcribing }];
      }
      // Se não está transcrevendo, atualiza o áudio existente com a transcrição
      const index = prev.findIndex(a => a.file.name === file.name && a.file.size === file.size);
      if (index !== -1) {
        const updated = [...prev];
        updated[index] = { ...updated[index], transcript: transcriptText, transcribing: false };
        return updated;
      }
      return prev;
    });
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

    // Verificar se há transcrições pendentes
    const hasTranscribing = audioFiles.some(a => a.transcribing);
    if (hasTranscribing) {
      toast.error('Aguarde a transcrição dos áudios terminar');
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
    <div className="space-y-6 pb-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">Vistoria – {propertyName}</h3>
        <Button variant="ghost" onClick={onBack}>Voltar</Button>
      </div>

      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1">Como está o imóvel?</h2>
          <p className="text-base text-muted-foreground">Toque em uma das opções abaixo</p>
        </div>
        <RadioGroup value={inspectionStatus} onValueChange={(value) => setInspectionStatus(value as 'OK' | 'NÃO')}>
          <div className="grid grid-cols-2 gap-4">
            <label 
              htmlFor="status-ok"
              className={`cursor-pointer border-3 rounded-xl p-6 flex flex-col items-center gap-3 transition-all shadow ${
                inspectionStatus === 'OK' 
                  ? 'border-green-500 bg-green-50 dark:bg-green-950 scale-105' 
                  : 'border-border hover:border-green-300'
              }`}
            >
              <RadioGroupItem value="OK" id="status-ok" className="sr-only" />
              <CheckCircle2 className={`h-20 w-20 ${inspectionStatus === 'OK' ? 'text-green-600' : 'text-muted-foreground'}`} />
              <span className={`text-3xl font-bold ${inspectionStatus === 'OK' ? 'text-green-600' : 'text-muted-foreground'}`}>
                OK
              </span>
              <span className={`text-base ${inspectionStatus === 'OK' ? 'text-green-600' : 'text-muted-foreground'}`}>
                Tudo bem
              </span>
            </label>

            <label 
              htmlFor="status-nao"
              className={`cursor-pointer border-3 rounded-xl p-6 flex flex-col items-center gap-3 transition-all shadow ${
                inspectionStatus === 'NÃO' 
                  ? 'border-red-500 bg-red-50 dark:bg-red-950 scale-105' 
                  : 'border-border hover:border-red-300'
              }`}
            >
              <RadioGroupItem value="NÃO" id="status-nao" className="sr-only" />
              <XCircle className={`h-20 w-20 ${inspectionStatus === 'NÃO' ? 'text-red-600' : 'text-muted-foreground'}`} />
              <span className={`text-3xl font-bold ${inspectionStatus === 'NÃO' ? 'text-red-600' : 'text-muted-foreground'}`}>
                NÃO
              </span>
              <span className={`text-base ${inspectionStatus === 'NÃO' ? 'text-red-600' : 'text-muted-foreground'}`}>
                Tem problema
              </span>
            </label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-3 bg-card border-2 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-full">
            <Mic className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Gravar áudio</h3>
            <p className="text-sm text-muted-foreground">Opcional - Conte o que viu</p>
          </div>
        </div>
        <AudioRecorder onAudioReady={handleAudioReady} />
        
        {audioFiles.length > 0 && (
          <div className="space-y-2 mt-3">
            <p className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              {audioFiles.length} áudio(s) gravado(s)
            </p>
            {audioFiles.map((audio, index) => (
              <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Mic className="h-4 w-4 text-primary" />
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
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 bg-card border-2 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-primary/10 p-2 rounded-full">
            <Camera className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Adicionar fotos e vídeos</h3>
            <p className="text-sm text-muted-foreground">Opcional - Mostre o que viu</p>
          </div>
        </div>
        
        <label 
          htmlFor="files" 
          className="cursor-pointer border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-3 hover:border-primary transition-colors bg-muted/30"
        >
          <div className="flex gap-4">
            <Camera className="h-12 w-12 text-primary" />
            <Video className="h-12 w-12 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold mb-1">Toque aqui para tirar foto ou vídeo</p>
            <p className="text-sm text-muted-foreground">Ou escolha da galeria</p>
          </div>
        </label>
        
        <input
          id="files"
          type="file"
          accept="image/*,video/*"
          multiple
          capture="environment"
          onChange={handleFileChange}
          className="sr-only"
        />
        
        {files.length > 0 && (
          <div className="space-y-2">
            <p className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              {files.length} arquivo(s) selecionado(s)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {files.map((file, index) => (
                <div key={index} className="relative aspect-square rounded-lg overflow-hidden border-2 border-primary">
                  {file.type.startsWith('image/') ? (
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Video className="h-8 w-8 text-primary" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Button 
        onClick={handleSubmit} 
        disabled={sending || audioFiles.some(a => a.transcribing)} 
        size="lg"
        className="w-full text-lg font-bold"
      >
        {sending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
        {audioFiles.some(a => a.transcribing) ? 'Transcrevendo áudios...' : sending ? (uploadProgress || 'Enviando...') : 'Enviar vistoria'}
      </Button>
      
      {files.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Tamanho total: {(files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(1)} MB
        </p>
      )}
    </div>
  );
}
