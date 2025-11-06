import React, { useState, useRef } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AudioRecorderProps {
  onAudioReady: (file: File, transcript: string, transcribing: boolean) => void;
}

export default function AudioRecorder({ onAudioReady }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const { toast } = useToast();

  const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
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

      console.log('Sending audio to Whisper API, size:', audioBlob.size);

      // Call edge function for transcription
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: base64Audio,
          mimeType: audioBlob.type
        }
      });

      if (error) {
        console.error('Transcription error:', error);
        throw error;
      }

      console.log('Transcription result:', data);
      return data.text || '';
    } catch (error) {
      console.error('Error transcribing audio:', error);
      return '';
    }
  };


  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/mp4' });
        const file = new File([blob], `audio_${Date.now()}.m4a`, { type: 'audio/mp4' });
        
        // Envia o arquivo imediatamente, transcrição em background
        onAudioReady(file, '', true);
        
        // Inicia transcrição em background
        setTranscribing(true);
        toast({
          title: "Transcrevendo áudio...",
          description: "Continue adicionando fotos ou vídeos enquanto isso",
        });
        
        const transcribedText = await transcribeAudio(blob);
        
        // Atualiza com a transcrição quando pronta
        onAudioReady(file, transcribedText, false);
        setTranscribing(false);
        
        stream.getTracks().forEach(track => track.stop());
      };


      mediaRecorder.start();
      setRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Erro ao acessar microfone",
        description: "Verifique as permissões do navegador",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {!recording ? (
        <Button 
          type="button" 
          onClick={startRecording} 
          variant="outline" 
          className="gap-2"
          disabled={transcribing}
        >
          <Mic className="h-4 w-4" />
          {transcribing ? 'Transcrevendo...' : 'Gravar áudio'}
        </Button>
      ) : (
        <Button type="button" onClick={stopRecording} variant="destructive" className="gap-2">
          <Square className="h-4 w-4" />
          Parar gravação
        </Button>
      )}
    </div>
  );
}
