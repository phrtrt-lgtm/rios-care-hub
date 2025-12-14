import React, { useState, useEffect } from 'react';
import { Loader2, Trash2, CheckCircle2, XCircle, Camera, Video, Mic, Sparkles, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AudioRecorder from '@/components/AudioRecorder';
import AudioPlayer from '@/components/AudioPlayer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { compressVideo, isVideoFile, FileUploadProgress } from '@/lib/fileUpload';
import { VideoCompressionProgress } from '@/components/VideoCompressionProgress';

interface EditInspectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspection: {
    id: string;
    property_id: string;
    notes?: string;
    transcript?: string;
    transcript_summary?: string;
    audio_url?: string;
  };
  existingAttachments: Array<{
    id: string;
    file_url: string;
    file_name?: string;
    file_type?: string;
  }>;
  onSuccess?: () => void;
}

interface UploadedFile {
  file: File;
  url: string;
  uploading: boolean;
  compressing: boolean;
  compressionProgress: number;
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

export default function EditInspectionDialog({ 
  open, 
  onOpenChange,
  inspection,
  existingAttachments,
  onSuccess 
}: EditInspectionDialogProps) {
  const [inspectionStatus, setInspectionStatus] = useState<'OK' | 'NÃO' | ''>(inspection.notes as 'OK' | 'NÃO' || '');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setInspectionStatus(inspection.notes as 'OK' | 'NÃO' || '');
      setUploadedFiles([]);
      setAudioFiles([]);
      setAttachmentsToDelete([]);
    }
  }, [open, inspection]);

  const uploadFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `inspections/${inspection.property_id}/${fileName}`;

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
    // No file size limit - compression will reduce video sizes significantly

    const newFiles: UploadedFile[] = selectedFiles.map(file => ({
      file,
      url: '',
      uploading: false,
      compressing: isVideoFile(file),
      compressionProgress: 0,
    }));
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';

    for (let i = 0; i < selectedFiles.length; i++) {
      const originalFile = selectedFiles[i];
      let fileToUpload = originalFile;
      
      try {
        // Compress video if it's a video file
        if (isVideoFile(originalFile)) {
          try {
            fileToUpload = await compressVideo(originalFile, (progress: FileUploadProgress) => {
              setUploadedFiles(prev => 
                prev.map(f => 
                  f.file === originalFile ? { ...f, compressionProgress: progress.percent } : f
                )
              );
            });
            
            // Update state with compressed file
            setUploadedFiles(prev => 
              prev.map(f => 
                f.file === originalFile ? { ...f, file: fileToUpload, compressing: false, uploading: true } : f
              )
            );
          } catch (compressionError: any) {
            console.error('Compression failed, uploading original:', compressionError);
            toast.error(`Erro na compressão, enviando original: ${compressionError.message}`);
            // Continue with original file
            setUploadedFiles(prev => 
              prev.map(f => 
                f.file === originalFile ? { ...f, compressing: false, uploading: true } : f
              )
            );
          }
        } else {
          setUploadedFiles(prev => 
            prev.map(f => 
              f.file === originalFile ? { ...f, uploading: true } : f
            )
          );
        }

        const url = await uploadFile(fileToUpload);
        setUploadedFiles(prev => 
          prev.map(f => 
            (f.file === originalFile || f.file === fileToUpload) ? { ...f, url, uploading: false, compressing: false } : f
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

  const handleRemoveExistingAttachment = (attachmentId: string) => {
    setAttachmentsToDelete(prev => [...prev, attachmentId]);
  };

  const handleRestoreAttachment = (attachmentId: string) => {
    setAttachmentsToDelete(prev => prev.filter(id => id !== attachmentId));
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

  const handleSave = async () => {
    if (!inspectionStatus) {
      toast.error('Selecione o status da vistoria (OK ou NÃO)');
      return;
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

    setSaving(true);
    
    try {
      // Update inspection record
      const updateData: any = {
        notes: inspectionStatus,
      };

      // If we have new audio with transcripts, append to existing
      if (audioFiles.length > 0) {
        const newTranscripts = audioFiles.filter(a => a.transcript).map(a => a.transcript).join('\n\n');
        const newSummaries = audioFiles.filter(a => a.summary).map(a => a.summary).join('\n\n');
        
        if (newTranscripts) {
          updateData.transcript = inspection.transcript 
            ? `${inspection.transcript}\n\n${newTranscripts}` 
            : newTranscripts;
        }
        
        if (newSummaries) {
          updateData.transcript_summary = inspection.transcript_summary 
            ? `${inspection.transcript_summary}\n\n${newSummaries}` 
            : newSummaries;
        }
      }

      const { error: updateError } = await supabase
        .from('cleaning_inspections')
        .update(updateData)
        .eq('id', inspection.id);

      if (updateError) throw updateError;

      // Delete removed attachments
      if (attachmentsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('cleaning_inspection_attachments')
          .delete()
          .in('id', attachmentsToDelete);
        
        if (deleteError) throw deleteError;
      }

      // Add new attachments
      const newAttachments = [
        ...uploadedFiles.filter(f => f.url && !f.error).map(f => ({
          inspection_id: inspection.id,
          file_url: f.url,
          file_name: f.file.name,
          file_type: f.file.type,
          size_bytes: f.file.size,
        })),
        ...audioFiles.filter(a => a.url).map(a => ({
          inspection_id: inspection.id,
          file_url: a.url,
          file_name: a.file.name,
          file_type: a.file.type,
          size_bytes: a.file.size,
        }))
      ];

      if (newAttachments.length > 0) {
        const { error: insertError } = await supabase
          .from('cleaning_inspection_attachments')
          .insert(newAttachments);
        
        if (insertError) throw insertError;
      }

      toast.success('Vistoria atualizada com sucesso!');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Erro ao salvar vistoria:', error);
      toast.error('Erro ao salvar vistoria: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const isCompressing = uploadedFiles.some(f => f.compressing);
  const isUploading = uploadedFiles.some(f => f.uploading) || audioFiles.some(a => a.uploading);
  const isTranscribing = audioFiles.some(a => a.transcribing);
  const hasErrors = uploadedFiles.some(f => f.error);
  
  const remainingAttachments = existingAttachments.filter(a => !attachmentsToDelete.includes(a.id));
  const imageAttachments = remainingAttachments.filter(a => a.file_type?.startsWith('image/'));
  const videoAttachments = remainingAttachments.filter(a => a.file_type?.startsWith('video/'));
  const audioAttachments = remainingAttachments.filter(a => a.file_type?.startsWith('audio/'));
  
  const combinedSummary = audioFiles
    .filter(a => a.summary && !a.transcribing)
    .map(a => a.summary)
    .join('\n\n');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Vistoria</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Selection */}
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-bold mb-1">Status do imóvel</h2>
            </div>
            <RadioGroup value={inspectionStatus} onValueChange={(value) => setInspectionStatus(value as 'OK' | 'NÃO')}>
              <div className="grid grid-cols-2 gap-4">
                <label 
                  htmlFor="edit-status-ok"
                  className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${
                    inspectionStatus === 'OK' 
                      ? 'border-green-500 bg-green-50 dark:bg-green-950' 
                      : 'border-border hover:border-green-300'
                  }`}
                >
                  <RadioGroupItem value="OK" id="edit-status-ok" className="sr-only" />
                  <CheckCircle2 className={`h-10 w-10 ${inspectionStatus === 'OK' ? 'text-green-600' : 'text-muted-foreground'}`} />
                  <span className={`text-lg font-bold ${inspectionStatus === 'OK' ? 'text-green-600' : 'text-muted-foreground'}`}>
                    OK
                  </span>
                </label>

                <label 
                  htmlFor="edit-status-nao"
                  className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${
                    inspectionStatus === 'NÃO' 
                      ? 'border-red-500 bg-red-50 dark:bg-red-950' 
                      : 'border-border hover:border-red-300'
                  }`}
                >
                  <RadioGroupItem value="NÃO" id="edit-status-nao" className="sr-only" />
                  <XCircle className={`h-10 w-10 ${inspectionStatus === 'NÃO' ? 'text-red-600' : 'text-muted-foreground'}`} />
                  <span className={`text-lg font-bold ${inspectionStatus === 'NÃO' ? 'text-red-600' : 'text-muted-foreground'}`}>
                    NÃO
                  </span>
                </label>
              </div>
            </RadioGroup>
          </div>

          {/* Existing Attachments */}
          {existingAttachments.length > 0 && (
            <div className="space-y-3 bg-card border rounded-xl p-4">
              <h3 className="text-base font-bold">Anexos Existentes</h3>
              
              {imageAttachments.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Fotos ({imageAttachments.length})</p>
                  <div className="grid grid-cols-4 gap-2">
                    {imageAttachments.map(att => (
                      <div key={att.id} className="relative aspect-square rounded-lg overflow-hidden border">
                        <img src={att.file_url} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleRemoveExistingAttachment(att.id)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {videoAttachments.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Vídeos ({videoAttachments.length})</p>
                  <div className="grid grid-cols-4 gap-2">
                    {videoAttachments.map(att => (
                      <div key={att.id} className="relative aspect-square rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                        <Video className="h-8 w-8 text-muted-foreground" />
                        <button
                          onClick={() => handleRemoveExistingAttachment(att.id)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {audioAttachments.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Áudios ({audioAttachments.length})</p>
                  <div className="space-y-2">
                    {audioAttachments.map(att => (
                      <div key={att.id} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                        <audio controls src={att.file_url} className="flex-1 h-8" />
                        <button
                          onClick={() => handleRemoveExistingAttachment(att.id)}
                          className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {attachmentsToDelete.length > 0 && (
                <div className="mt-3 p-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {attachmentsToDelete.length} anexo(s) serão removidos ao salvar
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttachmentsToDelete([])}
                    className="text-red-600 hover:text-red-700 mt-1"
                  >
                    Desfazer remoções
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Add New Audio */}
          <div className="space-y-3 bg-card border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-full">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-bold">Adicionar áudio</h3>
                <p className="text-sm text-muted-foreground">Novas observações</p>
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
                        <span className="text-sm font-medium">Novo Áudio {index + 1}</span>
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
              <div className="mt-4 p-4 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  <span className="font-semibold text-purple-700 dark:text-purple-300">Nova Análise da IA</span>
                </div>
                <div className="text-sm whitespace-pre-wrap">
                  {combinedSummary}
                </div>
              </div>
            )}
          </div>

          {/* Add New Files */}
          <div className="space-y-3 bg-card border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-primary/10 p-2 rounded-full">
                <Camera className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-bold">Adicionar fotos e vídeos</h3>
                <p className="text-sm text-muted-foreground">Novos arquivos</p>
              </div>
            </div>
            
            <label 
              htmlFor="edit-files" 
              className="cursor-pointer border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary transition-colors bg-muted/30"
            >
              <div className="flex gap-4">
                <Plus className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm font-medium">Clique para adicionar</p>
            </label>
            
            <input
              id="edit-files"
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
                      <Video className="h-4 w-4 animate-pulse text-primary" />
                      Comprimindo vídeo...
                    </>
                  ) : isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Enviando...
                    </>
                  ) : hasErrors ? (
                    <>
                      <XCircle className="h-4 w-4 text-red-600" />
                      Alguns arquivos com erro
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {uploadedFiles.length} novo(s) arquivo(s) pronto(s)
                    </>
                  )}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {uploadedFiles.map((uploadedFile, index) => (
                    <div 
                      key={index} 
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                        uploadedFile.error 
                          ? 'border-red-500' 
                          : uploadedFile.compressing || uploadedFile.uploading 
                            ? 'border-primary/50' 
                            : 'border-green-500'
                      }`}
                    >
                      {uploadedFile.file.type.startsWith('image/') ? (
                        <img 
                          src={URL.createObjectURL(uploadedFile.file)} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-muted p-1">
                          <Video className="h-6 w-6 text-muted-foreground" />
                          {uploadedFile.compressing && (
                            <div className="w-full mt-1">
                              <div className="h-1 bg-muted-foreground/20 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary transition-all duration-300"
                                  style={{ width: `${uploadedFile.compressionProgress}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-center text-muted-foreground mt-0.5">
                                {uploadedFile.compressionProgress}%
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {(uploadedFile.compressing || uploadedFile.uploading) && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 text-white animate-spin" />
                        </div>
                      )}
                      {!uploadedFile.uploading && !uploadedFile.compressing && (
                        <button
                          onClick={() => handleRemoveFile(uploadedFile.file)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
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

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={saving || isCompressing || isUploading || isTranscribing || !inspectionStatus}
            className="w-full"
            size="lg"
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Alterações'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
