import { supabase } from "@/integrations/supabase/client";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Shared FFmpeg instance
let sharedFFmpeg: FFmpeg | null = null;
let isFFmpegLoading = false;
let ffmpegLoadPromise: Promise<void> | null = null;

export interface FileUploadProgress {
  stage: 'compressing' | 'uploading' | 'done' | 'error';
  percent: number;
  message: string;
}

export type ProgressCallback = (progress: FileUploadProgress) => void;

// Load FFmpeg (shared instance)
async function loadFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
  if (sharedFFmpeg) {
    return sharedFFmpeg;
  }

  if (isFFmpegLoading && ffmpegLoadPromise) {
    await ffmpegLoadPromise;
    return sharedFFmpeg!;
  }

  isFFmpegLoading = true;
  onProgress?.({ stage: 'compressing', percent: 0, message: 'Carregando compressor...' });

  ffmpegLoadPromise = (async () => {
    try {
      const ffmpeg = new FFmpeg();
      
      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      console.log('[FFmpeg] Loading core...');
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      console.log('[FFmpeg] Core loaded successfully');

      sharedFFmpeg = ffmpeg;
    } catch (err) {
      console.error('[FFmpeg] Failed to load:', err);
      throw err;
    }
  })();

  try {
    await ffmpegLoadPromise;
    return sharedFFmpeg!;
  } catch (err) {
    ffmpegLoadPromise = null;
    throw err;
  } finally {
    isFFmpegLoading = false;
  }
}

// Compress video using FFmpeg (WhatsApp-style compression)
export async function compressVideo(
  file: File, 
  onProgress?: ProgressCallback
): Promise<File> {
  // Check if it's a video file
  if (!file.type.startsWith('video/')) {
    return file;
  }

  // Skip compression for very small videos (< 3MB)
  if (file.size < 3 * 1024 * 1024) {
    console.log('Video too small to compress, skipping:', file.name);
    return file;
  }

  try {
    console.log('[VideoCompression] Starting compression for:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2) + 'MB');
    
    const ffmpeg = await loadFFmpeg(onProgress);

    // Set up progress tracking
    let lastProgress = 0;
    ffmpeg.on('progress', ({ progress: p }) => {
      const percent = Math.min(Math.round(p * 100), 99);
      if (percent > lastProgress) {
        lastProgress = percent;
        console.log('[VideoCompression] Progress:', percent + '%');
        onProgress?.({ 
          stage: 'compressing', 
          percent, 
          message: `Comprimindo vídeo... ${percent}%` 
        });
      }
    });

    onProgress?.({ stage: 'compressing', percent: 5, message: 'Preparando vídeo...' });

    const inputName = 'input' + getExtension(file.name);
    const outputName = 'output.mp4';

    // Write input file with timeout for large files
    console.log('[VideoCompression] Reading file into memory...');
    onProgress?.({ stage: 'compressing', percent: 5, message: 'Lendo arquivo...' });
    
    let fileData: Uint8Array;
    try {
      fileData = await fetchFile(file);
      console.log('[VideoCompression] File read successfully, size:', fileData.length);
    } catch (readError: any) {
      console.error('[VideoCompression] Failed to read file:', readError);
      throw new Error(`Falha ao ler arquivo: ${readError.message || 'Memória insuficiente'}`);
    }

    console.log('[VideoCompression] Writing input file to FFmpeg...');
    onProgress?.({ stage: 'compressing', percent: 8, message: 'Preparando...' });
    await ffmpeg.writeFile(inputName, fileData);

    onProgress?.({ stage: 'compressing', percent: 10, message: 'Comprimindo vídeo...' });

    // WhatsApp-style compression settings:
    // - Lower resolution (max 480p height)
    // - Lower bitrate (~800kbps video, 64kbps audio)
    // - H.264 codec for maximum compatibility
    console.log('[VideoCompression] Running FFmpeg compression...');
    await ffmpeg.exec([
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
    console.log('[VideoCompression] Reading output file...');
    const data = await ffmpeg.readFile(outputName);
    
    // Convert to proper array
    const byteArray = typeof data === 'string' 
      ? Array.from(new TextEncoder().encode(data))
      : Array.from(data);
    
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
    console.log(`[VideoCompression] SUCCESS: ${originalSize}MB → ${compressedSize}MB (${reduction}% reduction)`);

    // Cleanup
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    onProgress?.({ stage: 'done', percent: 100, message: 'Compressão concluída!' });

    return compressedFile;
  } catch (error: any) {
    console.error('[VideoCompression] ERROR:', error);
    onProgress?.({ stage: 'error', percent: 0, message: `Erro: ${error.message || 'Falha na compressão'}` });
    // Re-throw error so caller can handle it
    throw error;
  }
}

function getExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4': return '.mp4';
    case 'mov':
    case 'quicktime': return '.mov';
    case 'avi': return '.avi';
    case 'webm': return '.webm';
    case 'mkv': return '.mkv';
    default: return '.mp4';
  }
}

// Check if file is a video
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

// Process a single file (compress if video, return as-is otherwise)
export async function processFileForUpload(
  file: File,
  onProgress?: ProgressCallback
): Promise<File> {
  if (isVideoFile(file)) {
    return await compressVideo(file, onProgress);
  }
  return file;
}

// Process multiple files with compression
export async function processFilesForUpload(
  files: File[],
  onProgress?: (fileIndex: number, total: number, fileProgress: FileUploadProgress) => void
): Promise<File[]> {
  const processedFiles: File[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    if (isVideoFile(file)) {
      const compressed = await compressVideo(file, (progress) => {
        onProgress?.(i, files.length, progress);
      });
      processedFiles.push(compressed);
    } else {
      processedFiles.push(file);
    }
  }
  
  return processedFiles;
}

// Upload file to Supabase storage with optional compression
export async function uploadFileWithCompression(
  file: File,
  bucket: string,
  path: string,
  onProgress?: ProgressCallback
): Promise<{ url: string; file: File }> {
  // Process file (compress if video)
  const processedFile = await processFileForUpload(file, onProgress);
  
  // Update progress for upload
  onProgress?.({ stage: 'uploading', percent: 0, message: 'Enviando...' });
  
  // Generate file path
  const fileExt = processedFile.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `${path}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, processedFile);

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  onProgress?.({ stage: 'done', percent: 100, message: 'Concluído!' });

  return { url: publicUrl, file: processedFile };
}
