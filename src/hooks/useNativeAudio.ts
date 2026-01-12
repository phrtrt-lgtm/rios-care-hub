import { VoiceRecorder, RecordingData, GenericResponse } from 'capacitor-voice-recorder';
import { Capacitor } from '@capacitor/core';
import { useState, useRef, useCallback } from 'react';

export interface NativeAudioResult {
  blob: Blob;
  file: File;
  mimeType: string;
  duration?: number;
}

/**
 * Hook to handle native audio recording with Capacitor
 * Uses capacitor-voice-recorder for native and MediaRecorder for web
 */
export function useNativeAudio() {
  const isNative = Capacitor.isNativePlatform();
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  // Web-only refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  /**
   * Request microphone permissions
   */
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (isNative) {
      try {
        const result: GenericResponse = await VoiceRecorder.requestAudioRecordingPermission();
        const granted = result.value === true;
        setHasPermission(granted);
        console.log('Native microphone permission:', granted);
        return granted;
      } catch (error) {
        console.error('Error requesting native microphone permission:', error);
        setHasPermission(false);
        return false;
      }
    } else {
      // Web: try to get microphone access
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        setHasPermission(true);
        return true;
      } catch (error) {
        console.error('Error requesting web microphone permission:', error);
        setHasPermission(false);
        return false;
      }
    }
  }, [isNative]);

  /**
   * Check if microphone permission is granted
   */
  const checkPermissions = useCallback(async (): Promise<boolean> => {
    if (isNative) {
      try {
        const result: GenericResponse = await VoiceRecorder.hasAudioRecordingPermission();
        const granted = result.value === true;
        setHasPermission(granted);
        return granted;
      } catch (error) {
        console.error('Error checking native microphone permission:', error);
        return false;
      }
    } else {
      // Web: check permission via Permissions API if available
      try {
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          const granted = result.state === 'granted';
          setHasPermission(granted);
          return granted;
        }
        // If Permissions API not available, assume we need to request
        return true;
      } catch (error) {
        return true; // Assume permission needs to be requested
      }
    }
  }, [isNative]);

  /**
   * Start recording audio
   */
  const startRecording = useCallback(async (): Promise<boolean> => {
    // First check/request permissions
    let permission = await checkPermissions();
    if (!permission) {
      permission = await requestPermissions();
      if (!permission) {
        return false;
      }
    }

    if (isNative) {
      try {
        await VoiceRecorder.startRecording();
        setIsRecording(true);
        console.log('Native recording started');
        return true;
      } catch (error) {
        console.error('Error starting native recording:', error);
        return false;
      }
    } else {
      // Web fallback
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

        mediaRecorder.start();
        setIsRecording(true);
        console.log('Web recording started');
        return true;
      } catch (error) {
        console.error('Error starting web recording:', error);
        return false;
      }
    }
  }, [isNative, checkPermissions, requestPermissions]);

  /**
   * Stop recording and return the audio data
   */
  const stopRecording = useCallback(async (): Promise<NativeAudioResult | null> => {
    if (isNative) {
      try {
        const result: RecordingData = await VoiceRecorder.stopRecording();
        setIsRecording(false);
        console.log('Native recording stopped, duration:', result.value.msDuration);

        if (result.value.recordDataBase64) {
          // Convert base64 to blob
          const mimeType = result.value.mimeType || 'audio/aac';
          const base64 = result.value.recordDataBase64;
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: mimeType });
          
          // Determine extension based on mime type
          let extension = 'aac';
          if (mimeType.includes('mp4')) extension = 'm4a';
          else if (mimeType.includes('wav')) extension = 'wav';
          else if (mimeType.includes('webm')) extension = 'webm';
          else if (mimeType.includes('aac')) extension = 'aac';

          const file = new File([blob], `audio_${Date.now()}.${extension}`, { type: mimeType });

          return {
            blob,
            file,
            mimeType,
            duration: result.value.msDuration,
          };
        }
        return null;
      } catch (error) {
        console.error('Error stopping native recording:', error);
        setIsRecording(false);
        return null;
      }
    } else {
      // Web fallback
      return new Promise((resolve) => {
        if (!mediaRecorderRef.current) {
          setIsRecording(false);
          resolve(null);
          return;
        }

        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/mp4' });
          const file = new File([blob], `audio_${Date.now()}.m4a`, { type: 'audio/mp4' });
          
          // Stop all tracks
          const stream = mediaRecorderRef.current?.stream;
          stream?.getTracks().forEach(track => track.stop());
          
          setIsRecording(false);
          resolve({
            blob,
            file,
            mimeType: 'audio/mp4',
          });
        };

        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        } else {
          setIsRecording(false);
          resolve(null);
        }
      });
    }
  }, [isNative]);

  /**
   * Cancel recording without saving
   */
  const cancelRecording = useCallback(async () => {
    if (isNative) {
      try {
        await VoiceRecorder.stopRecording();
      } catch (error) {
        // Ignore errors when canceling
      }
    } else if (mediaRecorderRef.current) {
      const stream = mediaRecorderRef.current.stream;
      stream?.getTracks().forEach(track => track.stop());
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    }
    setIsRecording(false);
  }, [isNative]);

  return {
    isNative,
    isRecording,
    hasPermission,
    requestPermissions,
    checkPermissions,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
