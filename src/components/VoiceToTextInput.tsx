import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNativeAudio } from "@/hooks/useNativeAudio";

interface VoiceToTextInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceToTextInput({ onTranscript, disabled }: VoiceToTextInputProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const {
    isRecording,
    startRecording: nativeStartRecording,
    stopRecording: nativeStopRecording,
  } = useNativeAudio();

  const handleStartRecording = async () => {
    const success = await nativeStartRecording();
    if (!success) {
      toast.error("Erro ao acessar microfone. Verifique as permissões do aplicativo.");
      return;
    }
    toast.info("Gravando áudio... Clique para parar");
  };

  const handleStopRecording = async () => {
    const result = await nativeStopRecording();
    if (!result) {
      toast.error("Erro ao gravar áudio");
      return;
    }

    await transcribeAudio(result.blob, result.mimeType);
  };

  const transcribeAudio = async (audioBlob: Blob, mimeType: string) => {
    setIsTranscribing(true);
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      const base64Audio = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });

      // Send to transcription edge function
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: base64Audio,
          mimeType: mimeType
        }
      });

      if (error) throw error;

      if (data?.text) {
        onTranscript(data.text);
        toast.success("Áudio transcrito com sucesso!");
      } else {
        throw new Error('Nenhum texto transcrito');
      }
    } catch (error: any) {
      console.error('Error transcribing audio:', error);
      toast.error("Erro ao transcrever áudio: " + error.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={isRecording ? handleStopRecording : handleStartRecording}
      disabled={disabled || isTranscribing}
      className={isRecording ? "bg-red-500 hover:bg-red-600 text-white" : ""}
      title={isRecording ? "Parar gravação" : "Gravar áudio"}
    >
      {isTranscribing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isRecording ? (
        <Square className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
