import React, { useState, useEffect } from 'react';
import { Loader2, Trash2, CheckCircle2, XCircle, Camera, Video, Mic, Sparkles, Eye, EyeOff, ClipboardList, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import AudioRecorder from '@/components/AudioRecorder';
import AudioPlayer from '@/components/AudioPlayer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { isVideoFile, FileUploadProgress } from '@/lib/fileUpload';
import { processFileForUpload } from '@/lib/processVideoForUpload';
import { VideoCompressionProgress } from '@/components/VideoCompressionProgress';
import RoutineInspectionChecklist, { ChecklistData, defaultChecklistData } from '@/components/RoutineInspectionChecklist';
import { loadDraft, saveDraft, clearDraft, createPlaceholderFile, useAutoSave, type InspectionDraft } from '@/hooks/useInspectionDraft';

interface TeamInspectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyName: string;
  onSuccess?: () => void;
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

type InspectionType = 'standard' | 'routine';

export default function TeamInspectionDialog({ 
  open, 
  onOpenChange, 
  propertyId, 
  propertyName,
  onSuccess 
}: TeamInspectionDialogProps) {
  const [inspectionType, setInspectionType] = useState<InspectionType>('standard');
  const [inspectionStatus, setInspectionStatus] = useState<'OK' | 'NÃO' | ''>('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [internalOnly, setInternalOnly] = useState(true);
  const [sending, setSending] = useState(false);
  const [checklistData, setChecklistData] = useState<ChecklistData>(defaultChecklistData);
  const draftRestoredRef = React.useRef(false);

  // Restore draft on mount / property change
  useEffect(() => {
    if (!open) return;
    loadDraft(propertyId, 'team').then(draft => {
    if (!draft) {
      draftRestoredRef.current = true;
      return;
    }

    if (draft.inspectionStatus) setInspectionStatus(draft.inspectionStatus);
    if (draft.inspectionType) setInspectionType(draft.inspectionType as InspectionType);
    if (draft.internalOnly !== undefined) setInternalOnly(draft.internalOnly);
    if (draft.checklistData) setChecklistData(draft.checklistData as unknown as ChecklistData);

    if (draft.uploadedFiles?.length) {
      setUploadedFiles(draft.uploadedFiles.map(f => ({
        file: createPlaceholderFile(f),
        url: f.url,
        uploading: false,
        compressing: false,
      })));
    }

    if (draft.audioFiles?.length) {
      setAudioFiles(draft.audioFiles.map(a => ({
        file: createPlaceholderFile(a),
        url: a.url,
        transcript: a.transcript,
        summary: a.summary,
        transcribing: false,
        uploading: false,
      })));
    }

    draftRestoredRef.current = true;
    toast.info('Rascunho restaurado automaticamente');
    });
  }, [open, propertyId]);

  // Auto-save
  const triggerAutoSave = useAutoSave(() => {
    const draftData: Omit<InspectionDraft, 'savedAt'> = {
      inspectionStatus,
      inspectionType,
      internalOnly,
      checklistData: checklistData as unknown as Record<string, unknown>,
      uploadedFiles: uploadedFiles
        .filter(f => f.url && !f.error)
        .map(f => ({ url: f.url, fileName: f.file.name, fileType: f.file.type, sizeBytes: f.file.size })),
      audioFiles: audioFiles
        .filter(a => a.url)
        .map(a => ({ url: a.url, fileName: a.file.name, fileType: a.file.type, sizeBytes: a.file.size, transcript: a.transcript, summary: a.summary })),
    };
    saveDraft(propertyId, 'team', draftData);
  }, 800);

  useEffect(() => {
    if (draftRestoredRef.current) {
      triggerAutoSave();
    }
  }, [inspectionStatus, inspectionType, internalOnly, checklistData, uploadedFiles, audioFiles, triggerAutoSave]);

  const resetForm = () => {
    setInspectionType('standard');
    setInspectionStatus('');
    setUploadedFiles([]);
    setAudioFiles([]);
    setInternalOnly(true);
    setChecklistData(defaultChecklistData);
    clearDraft(propertyId, 'team');
  };

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
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      console.warn('[TeamInspection] No files selected or fileList empty');
      return;
    }
    
    // Samsung Internet fix: copy files immediately before browser clears the reference
    const selectedFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (f && f.size > 0) {
        selectedFiles.push(f);
      }
    }
    
    if (selectedFiles.length === 0) {
      console.warn('[TeamInspection] All files were empty or invalid');
      return;
    }
    
    console.log('[TeamInspection] Files selected:', selectedFiles.length, selectedFiles.map(f => `${f.name} (${f.size}b, ${f.type})`));
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
      const newAudio: AudioFile = { 
        file, 
        url: '', 
        transcript: transcriptText, 
        summary: summaryText,
        transcribing, 
        uploading: true 
      };
      setAudioFiles(prev => [...prev, newAudio]);
      
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
    // Determinar status automaticamente baseado no tipo de vistoria
    let finalStatus: string;

    if (inspectionType === 'routine') {
      // Routine: deriva do checklist
      const hasProblems =
        checklistData.ac_working === 'problema' ||
        checklistData.tv_internet_working === 'problema' ||
        checklistData.outlets_switches_working === 'problema' ||
        checklistData.doors_locks_working === 'problema' ||
        checklistData.curtains_rods_working === 'problema' ||
        checklistData.bathroom_working === 'problema' ||
        checklistData.furniture_working === 'problema' ||
        checklistData.kitchen_working === 'problema';

      finalStatus = hasProblems ? 'NÃO' : 'OK';
    } else {
      // Standard: se tem qualquer arquivo (foto/vídeo/áudio) → NÃO. Sem nada → OK.
      const hasFiles =
        uploadedFiles.filter((f) => f.url && !f.error).length > 0 ||
        audioFiles.filter((a) => a.url).length > 0;
      finalStatus = hasFiles ? 'NÃO' : 'OK';
    }

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

    const filesWithErrors = uploadedFiles.filter(f => f.error);
    if (filesWithErrors.length > 0) {
      toast.error('Remova os arquivos com erro antes de enviar');
      return;
    }

    setSending(true);
    
    try {
      const attachments = uploadedFiles
        .filter(f => f.url && !f.error)
        .map(f => ({
          file_url: f.url,
          file_name: f.file.name,
          file_type: f.file.type,
          size_bytes: f.file.size,
        }));

      const audioData = audioFiles
        .filter(a => a.url)
        .map(a => ({ 
          audio_url: a.url, 
          transcript: a.transcript,
          summary: a.summary,
        }));
      
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

      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', user?.id)
        .single();

      const { data, error } = await supabase.functions.invoke('create-inspection', {
        body: {
          property_id: propertyId,
          cleaner_name: profile?.name,
          cleaner_phone: profile?.phone,
          notes: finalStatus,
          audio_data: audioData,
          attachments,
          internal_only: internalOnly,
          is_routine: inspectionType === 'routine',
          checklist_data: inspectionType === 'routine' ? checklistData : null,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha no envio');

      toast.success('Vistoria criada com sucesso!');
      resetForm();
      onOpenChange(false);
      onSuccess?.();
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
  
  const combinedSummary = audioFiles
    .filter(a => a.summary && !a.transcribing)
    .map(a => a.summary)
    .join('\n\n');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Nova Vistoria – {propertyName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Inspection Type Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Tipo de Vistoria</Label>
            <RadioGroup 
              value={inspectionType} 
              onValueChange={(value) => setInspectionType(value as InspectionType)}
              className="grid grid-cols-2 gap-3"
            >
              <label 
                htmlFor="type-standard"
                className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${
                  inspectionType === 'standard' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <RadioGroupItem value="standard" id="type-standard" className="sr-only" />
                <FileText className={`h-8 w-8 ${inspectionType === 'standard' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-bold ${inspectionType === 'standard' ? 'text-primary' : 'text-muted-foreground'}`}>
                  Vistoria Padrão
                </span>
                <span className="text-xs text-muted-foreground text-center">
                  Verificação geral com fotos e áudio
                </span>
              </label>

              <label 
                htmlFor="type-routine"
                className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${
                  inspectionType === 'routine' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <RadioGroupItem value="routine" id="type-routine" className="sr-only" />
                <ClipboardList className={`h-8 w-8 ${inspectionType === 'routine' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-bold ${inspectionType === 'routine' ? 'text-primary' : 'text-muted-foreground'}`}>
                  Vistoria de Rotina
                </span>
                <span className="text-xs text-muted-foreground text-center">
                  Checklist de manutenção preventiva
                </span>
              </label>
            </RadioGroup>
          </div>

          {/* Internal Only Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg border">
            <div className="flex items-center gap-3">
              {internalOnly ? (
                <EyeOff className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Eye className="h-5 w-5 text-primary" />
              )}
              <div>
                <Label htmlFor="internal-only" className="text-base font-medium">
                  Vistoria Interna
                </Label>
                <p className="text-sm text-muted-foreground">
                  {internalOnly 
                    ? "Visível apenas para a equipe" 
                    : "Visível para o proprietário"}
                </p>
              </div>
            </div>
            <Switch
              id="internal-only"
              checked={internalOnly}
              onCheckedChange={setInternalOnly}
            />
          </div>

          {/* Routine Checklist - Only for routine inspections */}
          {inspectionType === 'routine' && (
            <div className="border rounded-xl p-4 bg-card">
              <RoutineInspectionChecklist 
                data={checklistData} 
                onChange={setChecklistData} 
              />
            </div>
          )}

          {/* Status Indicator - automatic for standard inspections */}
          {inspectionType === 'standard' && (() => {
            const hasFiles =
              uploadedFiles.filter((f) => f.url && !f.error).length > 0 ||
              audioFiles.filter((a) => a.url).length > 0;
            return (
              <div
                className={`rounded-lg border p-3 text-sm text-center transition-colors ${
                  hasFiles
                    ? 'border-destructive/30 bg-destructive/10'
                    : 'border-success/30 bg-success/10'
                }`}
              >
                <p className="font-medium text-foreground mb-1">
                  Status determinado automaticamente
                </p>
                <p className={hasFiles ? 'text-destructive' : 'text-success'}>
                  {hasFiles
                    ? '⚠️ Arquivos detectados — vistoria será marcada como NÃO'
                    : '✓ Sem arquivos — vistoria será marcada como OK'}
                </p>
              </div>
            );
          })()}

          {/* Audio Recording */}
          <div className="space-y-3 bg-card border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-full">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-bold">Gravar áudio</h3>
                <p className="text-sm text-muted-foreground">Opcional - Observações</p>
              </div>
            </div>
            <AudioRecorder onAudioReady={handleAudioReady} />
            
            {audioFiles.length > 0 && (
              <div className="space-y-2 mt-3">
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
                          <CheckCircle2 className="h-4 w-4 text-success ml-auto" />
                        )}
                      </div>
                      <AudioPlayer file={audio.file} />
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
            
            {combinedSummary && (
              <div className="mt-4 p-4 bg-gradient-to-br from-primary/10 to-info/10 border border-primary/30/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-primary dark:text-purple-300">Análise da IA</span>
                </div>
                <div className="text-sm whitespace-pre-wrap">
                  {combinedSummary}
                </div>
              </div>
            )}
          </div>

          {/* File Upload */}
          <div className="space-y-3 bg-card border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-primary/10 p-2 rounded-full">
                <Camera className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-bold">Adicionar fotos e vídeos</h3>
                <p className="text-sm text-muted-foreground">Opcional</p>
              </div>
            </div>
            
            <label 
              htmlFor="team-files" 
              className="cursor-pointer border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary transition-colors bg-muted/30"
            >
              <div className="flex gap-4">
                <Camera className="h-8 w-8 text-primary" />
                <Video className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm font-medium">Clique para adicionar</p>
            </label>
            
            <input
              id="team-files"
              type="file"
              accept="image/*,video/*,video/mp4,video/quicktime,video/x-msvideo"
              multiple
              onChange={handleFileChange}
              className="sr-only"
            />
            
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  {isCompressing ? (
                    <>
                      <Video className="h-4 w-4 animate-pulse text-warning" />
                      Comprimindo vídeo(s)...
                    </>
                  ) : isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Enviando {uploadedCount}/{totalFilesCount}...
                    </>
                  ) : hasErrors ? (
                    <>
                      <XCircle className="h-4 w-4 text-destructive" />
                      {uploadedCount} de {totalFilesCount} enviado(s)
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      {uploadedFiles.length} arquivo(s) prontos
                    </>
                  )}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {uploadedFiles.map((uploadedFile, index) => (
                    <div 
                      key={index} 
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                        uploadedFile.error 
                          ? 'border-destructive/30' 
                          : uploadedFile.compressing
                            ? 'border-warning/30'
                            : uploadedFile.uploading 
                              ? 'border-primary/50' 
                              : 'border-success/30'
                      }`}
                    >
                      {uploadedFile.file.type.startsWith('image/') ? (
                        <img 
                          src={uploadedFile.url || URL.createObjectURL(uploadedFile.file)} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <Video className="h-6 w-6 text-muted-foreground" />
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
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        </div>
                      )}
                      
                      {!uploadedFile.uploading && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(uploadedFile.file)}
                          className="absolute top-1 right-1 bg-destructive text-white rounded-full p-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={sending || isUploading || isTranscribing || hasErrors || (inspectionType === 'standard' && !inspectionStatus)}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Criar Vistoria'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}