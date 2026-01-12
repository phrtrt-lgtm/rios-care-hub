import React, { useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNativeAudio } from '@/hooks/useNativeAudio';

interface AudioRecorderProps {
  onAudioReady: (file: File, transcript: string, summary: string, transcribing: boolean) => void;
}

export default function AudioRecorder({ onAudioReady }: AudioRecorderProps) {
  const [transcribing, setTranscribing] = useState(false);
  const { toast } = useToast();
  const { 
    isRecording, 
    hasPermission,
    requestPermissions,
    startRecording: nativeStartRecording, 
    stopRecording: nativeStopRecording 
  } = useNativeAudio();

  const transcribeAudio = async (audioBlob: Blob, mimeType: string): Promise<{ text: string; summary: string }> => {
    try {
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;

      console.log('Sending audio to Whisper API, size:', audioBlob.size, 'mimeType:', mimeType);

      // Call edge function for transcription
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: base64Audio,
          mimeType: mimeType
        }
      });

      if (error) {
        console.error('Transcription error:', error);
        throw error;
      }

      console.log('Transcription result:', data);
      return { 
        text: data.text || '', 
        summary: data.summary || '' 
      };
    } catch (error) {
      console.error('Error transcribing audio:', error);
      return { text: '', summary: '' };
    }
  };

  const handleStartRecording = async () => {
    const success = await nativeStartRecording();
    if (!success) {
      toast({
        title: "Erro ao acessar microfone",
        description: "Verifique as permissões do aplicativo nas configurações do dispositivo",
        variant: "destructive",
      });
    }
  };

  const handleStopRecording = async () => {
    const result = await nativeStopRecording();
    
    if (!result) {
      toast({
        title: "Erro na gravação",
        description: "Não foi possível salvar o áudio",
        variant: "destructive",
      });
      return;
    }

    const { file, blob, mimeType } = result;
    
    // Envia o arquivo imediatamente, transcrição em background
    onAudioReady(file, '', '', true);
    
    // Inicia transcrição em background
    setTranscribing(true);
    const { text, summary } = await transcribeAudio(blob, mimeType);
    
    // Atualiza com a transcrição e resumo quando prontos
    onAudioReady(file, text, summary, false);
    setTranscribing(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {!isRecording ? (
        <Button 
          type="button" 
          onClick={handleStartRecording} 
          variant="outline" 
          className="gap-2"
          disabled={transcribing}
        >
          {transcribing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {transcribing ? 'Processando...' : 'Gravar áudio'}
        </Button>
      ) : (
        <Button type="button" onClick={handleStopRecording} variant="destructive" className="gap-2">
          <Square className="h-4 w-4" />
          Parar gravação
        </Button>
      )}
    </div>
  );
}
