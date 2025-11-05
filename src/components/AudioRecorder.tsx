import React, { useState, useRef } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioRecorderProps {
  onAudioReady: (file: File, transcript: string) => void;
}

export default function AudioRecorder({ onAudioReady }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const chunksRef = useRef<BlobPart[]>([]);

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

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/mp4' });
        const file = new File([blob], `audio_${Date.now()}.m4a`, { type: 'audio/mp4' });
        onAudioReady(file, transcript.trim());
        stream.getTracks().forEach(track => track.stop());
      };

      // Web Speech API for transcription (if available)
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let transcriptText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcriptText += event.results[i][0].transcript;
          }
          setTranscript(prev => (prev + ' ' + transcriptText).trim());
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      mediaRecorder.start();
      setRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Erro ao iniciar gravação. Verifique as permissões do microfone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setRecording(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {!recording ? (
          <Button type="button" onClick={startRecording} variant="outline" className="gap-2">
            <Mic className="h-4 w-4" />
            Gravar áudio
          </Button>
        ) : (
          <Button type="button" onClick={stopRecording} variant="destructive" className="gap-2">
            <Square className="h-4 w-4" />
            Parar gravação
          </Button>
        )}
      </div>
      {transcript && (
        <p className="text-xs text-muted-foreground line-clamp-3 p-2 bg-muted rounded">
          {transcript}
        </p>
      )}
    </div>
  );
}
