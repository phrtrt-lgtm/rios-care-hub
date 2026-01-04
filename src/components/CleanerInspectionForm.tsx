import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trash2, CheckCircle2, XCircle, Camera, Video, Mic, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AudioRecorder from '@/components/AudioRecorder';
import AudioPlayer from '@/components/AudioPlayer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { isVideoFile, FileUploadProgress } from '@/lib/fileUpload';
import { processFileForUpload } from '@/lib/processVideoForUpload';
import { VideoCompressionProgress } from '@/components/VideoCompressionProgress';

interface CleanerInspectionFormProps {
  propertyId: string;
  propertyName: string;
  onBack: () => void;
}

interface UploadedFile {
  file: File;
  url: string;
  uploading: boolean;
  compressing: boolean;
  compressionProgress?: FileUploadProgress;
  error?: string;
}

interface AudioFile {
  file: File;
  url: string;
  transcript: string;
  summary: string;
  transcribing: boolean;
  uploading: boolean;
}

export default function CleanerInspectionForm({ propertyId, propertyName, onBack }: CleanerInspectionFormProps) {
  const navigate = useNavigate();
  const [inspectionStatus, setInspectionStatus] = useState<'OK' | 'NÃO' | ''>('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [sending, setSending] = useState(false);

  const uploadFile = async (file: File): Promise<string> => {
    const ext = (file.name || '').split('.').pop()?.toLowerCase();
    const safeExt = ext && ext !== file.name && ext.length <= 10
      ? ext
      : (file.type.startsWith('video/') ? 'mp4' : file.type.startsWith('image/') ? 'jpg' : 'bin');

    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${safeExt}`;
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    
    const selectedFiles = Array.from(e.target.files);
    const maxSize = 100 * 1024 * 1024; // 100MB (before compression)
    const oversizedFiles = selectedFiles.filter(f => f.size > maxSize);
    
    if (oversizedFiles.length > 0) {
      toast.error(`Arquivos muito grandes (máx 100MB): ${oversizedFiles.map(f => f.name).join(', ')}`);
      e.target.value = '';
      return;
    }

    // Add files with initial state (compressing for videos, uploading for others)
    const newFiles: UploadedFile[] = selectedFiles.map(file => ({
      file,
      url: '',
      uploading: !isVideoFile(file),
      compressing: isVideoFile(file),
    }));
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';

    // Process and upload each file progressively
    for (let i = 0; i < selectedFiles.length; i++) {
      const originalFile = selectedFiles[i];
      try {
        let fileToUpload = originalFile;
        
        // Compress video if needed
        if (isVideoFile(originalFile)) {
          fileToUpload = await processFileForUpload(originalFile, (progress) => {
            setUploadedFiles(prev =>
              prev.map(f =>
                f.file === originalFile ? { ...f, compressionProgress: progress } : f
              )
            );
          });

          // Update state: compression done, now uploading
          setUploadedFiles(prev =>
            prev.map(f =>
              f.file === originalFile ? { ...f, compressing: false, uploading: true, file: fileToUpload } : f
            )
          );
        }
        
        const url = await uploadFile(fileToUpload);
        setUploadedFiles(prev => 
          prev.map(f => 
            (f.file === originalFile || f.file === fileToUpload) 
              ? { ...f, url, uploading: false, compressing: false } 
              : f
          )
        );
      } catch (error: any) {
        console.error('Upload error:', error);
        setUploadedFiles(prev => 
          prev.map(f => 
            f.file === originalFile ? { ...f, uploading: false, compressing: false, error: error.message } : f
          )
        );
        toast.error(`Erro no upload de ${originalFile.name}`);
      }
    }
  };

  const handleRemoveFile = (file: File) => {
    setUploadedFiles(prev => prev.filter(f => f.file !== file));
  };

  const handleAudioReady = async (file: File, transcriptText: string, summaryText: string, transcribing: boolean) => {
    if (transcribing) {
      // Audio is being transcribed, add with uploading state and start upload
      const newAudio: AudioFile = { 
        file, 
        url: '', 
        transcript: transcriptText, 
        summary: summaryText,
        transcribing, 
        uploading: true 
      };
      setAudioFiles(prev => [...prev, newAudio]);
      
      // Start upload immediately
      try {
        const url = await uploadFile(file);
        setAudioFiles(prev => 
          prev.map(a => 
            a.file === file ? { ...a, url, uploading: false } : a
          )
        );
      } catch (error: any) {
        console.error('Audio upload error:', error);
        toast.error(`Erro no upload do áudio`);
        setAudioFiles(prev => 
          prev.map(a => 
            a.file === file ? { ...a, uploading: false } : a
          )
        );
      }
    } else {
      // Transcription finished, update transcript and summary
      setAudioFiles(prev => 
        prev.map(a => 
          a.file.name === file.name && a.file.size === file.size 
            ? { ...a, transcript: transcriptText, summary: summaryText, transcribing: false } 
            : a
        )
      );
    }
  };

  const handleDeleteAudio = (index: number) => {
    setAudioFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!inspectionStatus) {
      toast.error('Selecione o status da vistoria (OK ou NÃO)');
      return;
    }

    // Check for pending operations
    const hasPendingUploads = uploadedFiles.some(f => f.uploading) || audioFiles.some(a => a.uploading);
    const hasPendingTranscriptions = audioFiles.some(a => a.transcribing);
    
    if (hasPendingUploads) {
      toast.error('Aguarde o upload dos arquivos terminar');
      return;
    }
    
    if (hasPendingTranscriptions) {
      toast.error('Aguarde a transcrição dos áudios terminar');
      return;
    }

    // Check for upload errors
    const filesWithErrors = uploadedFiles.filter(f => f.error);
    if (filesWithErrors.length > 0) {
      toast.error('Remova os arquivos com erro antes de enviar');
      return;
    }

    // Validate total size
    const totalSize = [...uploadedFiles.map(f => f.file), ...audioFiles.map(a => a.file)].reduce((sum, f) => sum + f.size, 0);
    const maxTotalSize = 100 * 1024 * 1024; // 100MB total
    
    if (totalSize > maxTotalSize) {
      toast.error('Tamanho total dos arquivos excede 100MB. Remova alguns arquivos.');
      return;
    }

    setSending(true);
    
    try {
      // Build attachments array from already uploaded files
      const attachments = uploadedFiles
        .filter(f => f.url && !f.error)
        .map(f => ({
          file_url: f.url,
          file_name: f.file.name,
          file_type: f.file.type,
          size_bytes: f.file.size,
        }));

      // Build audio data with transcript AND summary
      const audioData = audioFiles
        .filter(a => a.url)
        .map(a => ({ 
          audio_url: a.url, 
          transcript: a.transcript,
          summary: a.summary,
        }));
      
      // Add audio files to attachments
      audioFiles
        .filter(a => a.url)
        .forEach(a => {
          attachments.push({
            file_url: a.url,
            file_name: a.file.name,
            file_type: a.file.type,
            size_bytes: a.file.size,
          });
        });

      // Get user info
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', user?.id)
        .single();

      // Call edge function to create inspection
      const { data, error } = await supabase.functions.invoke('create-inspection', {
        body: {
          property_id: propertyId,
          cleaner_name: profile?.name,
          cleaner_phone: profile?.phone,
          notes: inspectionStatus,
          audio_data: audioData,
          attachments,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha no envio');

      toast.success('Vistoria enviada com sucesso!');
      setInspectionStatus('');
      setUploadedFiles([]);
      setAudioFiles([]);
      onBack();
    } catch (error: any) {
      console.error('Erro ao enviar vistoria:', error);
      toast.error('Erro ao enviar vistoria: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSending(false);
    }
  };

  const isCompressing = uploadedFiles.some(f => f.compressing);
  const isUploading = uploadedFiles.some(f => f.uploading) || audioFiles.some(a => a.uploading);
  const isTranscribing = audioFiles.some(a => a.transcribing);
  const hasErrors = uploadedFiles.some(f => f.error);
  const uploadedCount = uploadedFiles.filter(f => f.url && !f.error).length;
  const totalFilesCount = uploadedFiles.length;
  
  // Get combined summary from all audio files
  const combinedSummary = audioFiles
    .filter(a => a.summary && !a.transcribing)
    .map(a => a.summary)
    .join('\n\n');

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
                    {audio.uploading && (
                      <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Enviando...
                      </span>
                    )}
                    {audio.transcribing && !audio.uploading && (
                      <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                        <Sparkles className="h-3 w-3 animate-pulse" />
                        Analisando IA...
                      </span>
                    )}
                    {!audio.uploading && !audio.transcribing && audio.url && (
                      <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto" />
                    )}
                  </div>
                  <AudioPlayer file={audio.file} />
                  {(audio.uploading || audio.transcribing) && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full bg-muted-foreground/20 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: audio.uploading ? '50%' : '75%' }} />
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteAudio(index)}
                  className="text-destructive hover:text-destructive shrink-0"
                  disabled={audio.uploading || audio.transcribing}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        
        {/* AI Summary Section */}
        {combinedSummary && (
          <div className="mt-4 p-4 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              <span className="font-semibold text-purple-700 dark:text-purple-300">Análise da IA</span>
            </div>
            <div className="text-sm whitespace-pre-wrap">
              {combinedSummary}
            </div>
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
          accept="image/*,video/*,video/mp4,video/quicktime,video/x-msvideo"
          multiple
          onChange={handleFileChange}
          className="sr-only"
        />
        
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-base font-semibold flex items-center gap-2">
              {isCompressing ? (
                <>
                  <Video className="h-4 w-4 animate-pulse text-amber-600" />
                  Comprimindo vídeo(s)...
                </>
              ) : isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Enviando {uploadedCount}/{totalFilesCount} arquivos...
                </>
              ) : hasErrors ? (
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
                  {uploadedCount} de {totalFilesCount} arquivo(s) enviado(s)
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {uploadedFiles.length} arquivo(s) prontos
                </>
              )}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {uploadedFiles.map((uploadedFile, index) => (
                <div 
                  key={index} 
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                    uploadedFile.error 
                      ? 'border-red-500' 
                      : uploadedFile.compressing
                        ? 'border-amber-500'
                        : uploadedFile.uploading 
                          ? 'border-primary/50' 
                          : 'border-green-500'
                  }`}
                >
                  {uploadedFile.file.type.startsWith('image/') ? (
                    <img 
                      src={URL.createObjectURL(uploadedFile.file)} 
                      alt={`Preview ${index + 1}`}
                      className={`w-full h-full object-cover ${uploadedFile.uploading ? 'opacity-50' : ''}`}
                    />
                  ) : (
                    <div className={`w-full h-full bg-muted flex items-center justify-center ${uploadedFile.uploading ? 'opacity-50' : ''}`}>
                      <Video className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  
                  {/* Compression indicator overlay */}
                  {uploadedFile.compressing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 p-1">
                      <Video className="h-5 w-5 text-primary animate-pulse mb-1" />
                      <span className="text-[10px] font-medium text-primary text-center">
                        {uploadedFile.compressionProgress?.percent || 0}%
                      </span>
                    </div>
                  )}
                  
                  {/* Upload indicator overlay */}
                  {uploadedFile.uploading && !uploadedFile.compressing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                  
                  {/* Success indicator */}
                  {!uploadedFile.uploading && !uploadedFile.error && (
                    <div className="absolute top-1 right-1">
                      <CheckCircle2 className="h-5 w-5 text-green-600 bg-background rounded-full" />
                    </div>
                  )}
                  
                  {/* Error indicator */}
                  {uploadedFile.error && (
                    <div className="absolute top-1 right-1">
                      <XCircle className="h-5 w-5 text-red-600 bg-background rounded-full" />
                    </div>
                  )}
                  
                  {/* Remove button */}
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute bottom-1 right-1 h-6 w-6"
                    onClick={() => handleRemoveFile(uploadedFile.file)}
                    disabled={uploadedFile.uploading}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Button 
        onClick={handleSubmit} 
        disabled={sending || isUploading || isTranscribing || hasErrors} 
        size="lg"
        className="w-full text-lg font-bold"
      >
        {sending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
        {isUploading ? 'Enviando arquivos...' : isTranscribing ? 'Analisando com IA...' : sending ? 'Finalizando...' : 'Enviar vistoria'}
      </Button>
      
      {uploadedFiles.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Tamanho total: {(uploadedFiles.reduce((sum, f) => sum + f.file.size, 0) / (1024 * 1024)).toFixed(1)} MB
        </p>
      )}
    </div>
  );
}
