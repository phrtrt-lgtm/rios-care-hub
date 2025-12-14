import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface CompressionProgress {
  stage: 'loading' | 'compressing' | 'done' | 'error';
  percent: number;
  message: string;
}

interface UseVideoCompressionReturn {
  compressVideo: (file: File) => Promise<File>;
  progress: CompressionProgress;
  isCompressing: boolean;
  isLoaded: boolean;
  loadFFmpeg: () => Promise<void>;
}

// Shared FFmpeg instance across the app
let sharedFFmpeg: FFmpeg | null = null;
let isFFmpegLoading = false;
let ffmpegLoadPromise: Promise<void> | null = null;

export function useVideoCompression(): UseVideoCompressionReturn {
  const [progress, setProgress] = useState<CompressionProgress>({
    stage: 'done',
    percent: 0,
    message: '',
  });
  const [isCompressing, setIsCompressing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(!!sharedFFmpeg);

  const loadFFmpeg = useCallback(async () => {
    if (sharedFFmpeg) {
      setIsLoaded(true);
      return;
    }

    if (isFFmpegLoading && ffmpegLoadPromise) {
      await ffmpegLoadPromise;
      setIsLoaded(true);
      return;
    }

    isFFmpegLoading = true;
    setProgress({ stage: 'loading', percent: 0, message: 'Carregando compressor...' });

    ffmpegLoadPromise = (async () => {
      const ffmpeg = new FFmpeg();
      
      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      ffmpeg.on('progress', ({ progress: p }) => {
        const percent = Math.round(p * 100);
        setProgress({ 
          stage: 'compressing', 
          percent, 
          message: `Comprimindo vídeo... ${percent}%` 
        });
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      sharedFFmpeg = ffmpeg;
    })();

    try {
      await ffmpegLoadPromise;
      setIsLoaded(true);
      setProgress({ stage: 'done', percent: 100, message: 'Pronto' });
    } catch (error) {
      console.error('Error loading FFmpeg:', error);
      setProgress({ stage: 'error', percent: 0, message: 'Erro ao carregar compressor' });
      throw error;
    } finally {
      isFFmpegLoading = false;
    }
  }, []);

  const compressVideo = useCallback(async (file: File): Promise<File> => {
    // Check if it's a video file
    if (!file.type.startsWith('video/')) {
      return file;
    }

    // Skip compression for very small videos (< 5MB)
    if (file.size < 5 * 1024 * 1024) {
      console.log('Video too small to compress, skipping:', file.name);
      return file;
    }

    setIsCompressing(true);
    
    try {
      // Load FFmpeg if not loaded
      if (!sharedFFmpeg) {
        await loadFFmpeg();
      }

      if (!sharedFFmpeg) {
        throw new Error('FFmpeg not loaded');
      }

      setProgress({ stage: 'compressing', percent: 0, message: 'Preparando vídeo...' });

      const inputName = 'input' + getExtension(file.name);
      const outputName = 'output.mp4';

      // Write input file
      await sharedFFmpeg.writeFile(inputName, await fetchFile(file));

      setProgress({ stage: 'compressing', percent: 5, message: 'Comprimindo vídeo...' });

      // WhatsApp-style compression settings:
      // - Lower resolution (max 480p height)
      // - Lower bitrate (~800kbps video, 64kbps audio)
      // - H.264 codec for maximum compatibility
      // - Fast preset for quick encoding
      await sharedFFmpeg.exec([
        '-i', inputName,
        // Scale down to max 480p height, maintain aspect ratio
        '-vf', 'scale=-2:min(480\\,ih)',
        // Video codec settings - aggressive compression
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '32', // Higher CRF = more compression (WhatsApp uses ~28-35)
        '-maxrate', '800k',
        '-bufsize', '1200k',
        // Audio codec settings
        '-c:a', 'aac',
        '-b:a', '64k',
        '-ar', '44100',
        // Output settings
        '-movflags', '+faststart',
        '-y',
        outputName
      ]);

      // Read output file
      const data = await sharedFFmpeg.readFile(outputName);
      
      // Create new file with compressed data
      // Use Array.from to create a clean copy and avoid TypeScript ArrayBuffer issues
      let byteArray: number[];
      if (typeof data === 'string') {
        byteArray = Array.from(new TextEncoder().encode(data));
      } else {
        byteArray = Array.from(data);
      }
      
      const compressedBlob = new Blob([new Uint8Array(byteArray)], { type: 'video/mp4' });
      const compressedFile = new File(
        [compressedBlob],
        file.name.replace(/\.[^.]+$/, '.mp4'),
        { type: 'video/mp4' }
      );

      // Log compression results
      const originalSize = (file.size / 1024 / 1024).toFixed(2);
      const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2);
      const reduction = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
      console.log(`Video compressed: ${originalSize}MB → ${compressedSize}MB (${reduction}% reduction)`);

      setProgress({ stage: 'done', percent: 100, message: 'Compressão concluída!' });

      // Cleanup
      await sharedFFmpeg.deleteFile(inputName);
      await sharedFFmpeg.deleteFile(outputName);

      return compressedFile;
    } catch (error) {
      console.error('Video compression error:', error);
      setProgress({ stage: 'error', percent: 0, message: 'Erro na compressão' });
      // Return original file on error
      return file;
    } finally {
      setIsCompressing(false);
    }
  }, [loadFFmpeg]);

  return {
    compressVideo,
    progress,
    isCompressing,
    isLoaded,
    loadFFmpeg,
  };
}

function getExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4':
      return '.mp4';
    case 'mov':
    case 'quicktime':
      return '.mov';
    case 'avi':
      return '.avi';
    case 'webm':
      return '.webm';
    case 'mkv':
      return '.mkv';
    default:
      return '.mp4';
  }
}

// Utility function to check if a file is a video
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

// Utility function to process multiple files with compression
export async function processFilesWithCompression(
  files: File[],
  compressVideo: (file: File) => Promise<File>,
  onProgress?: (current: number, total: number) => void
): Promise<File[]> {
  const processedFiles: File[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length);
    
    if (isVideoFile(file)) {
      const compressed = await compressVideo(file);
      processedFiles.push(compressed);
    } else {
      processedFiles.push(file);
    }
  }
  
  return processedFiles;
}
