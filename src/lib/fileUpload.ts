import { supabase } from "@/integrations/supabase/client";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Shared FFmpeg instance
let sharedFFmpeg: FFmpeg | null = null;
let isFFmpegLoading = false;
let ffmpegLoadPromise: Promise<void> | null = null;
let compressionQueue: Promise<void> = Promise.resolve();

function runCompressionExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const nextRun = compressionQueue.then(operation, operation);
  compressionQueue = nextRun.then(() => undefined, () => undefined);
  return nextRun;
}

function createCompressionJobId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface FileUploadProgress {
  stage: 'compressing' | 'uploading' | 'done' | 'error';
  percent: number;
  message: string;
}

export type ProgressCallback = (progress: FileUploadProgress) => void;

export class VideoTooLargeError extends Error {
  readonly code = 'VIDEO_TOO_LARGE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'VideoTooLargeError';
  }
}

// If compression fails (common with some camera-recorded codecs like HEVC,
// or em ambientes sem SharedArrayBuffer onde o FFmpeg.wasm não roda), só
// bloqueamos originais acima do limite real do storage (20MB).
const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
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

      // Keep core version aligned with the installed @ffmpeg/ffmpeg package
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
      
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

// Check if FFmpeg/SharedArrayBuffer is supported
function isCompressionSupported(): boolean {
  try {
    // SharedArrayBuffer is required for FFmpeg.wasm
    if (typeof SharedArrayBuffer === 'undefined') {
      console.log('[VideoCompression] SharedArrayBuffer not available - compression disabled');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Compress video using FFmpeg (WhatsApp-style compression)
export async function compressVideo(
  file: File, 
  onProgress?: ProgressCallback
): Promise<File> {
  // Check if it's a video file (using robust check)
  if (!isVideoFile(file)) {
    return file;
  }

  // Skip compression for very small videos (< 3MB)
  if (file.size < 3 * 1024 * 1024) {
    console.log('[VideoCompression] Video too small to compress, skipping:', file.name);
    return file;
  }

  // Check if compression is supported in this environment
  if (!isCompressionSupported()) {
    console.log('[VideoCompression] Compression not supported in this browser, skipping');
    onProgress?.({ stage: 'done', percent: 100, message: 'Compressão não suportada' });
    return file;
  }

  return runCompressionExclusive(async () => {
    const jobId = createCompressionJobId();
    const inputName = `${jobId}-input${getExtension(file.name, file.type)}`;
    const outputName = `${jobId}-output.mp4`;

    try {
      console.log('[VideoCompression] Starting compression for:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2) + 'MB');

      onProgress?.({ stage: 'compressing', percent: 0, message: 'Carregando compressor...' });

      const ffmpeg = await loadFFmpeg(onProgress);

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

      console.log('[VideoCompression] Reading file into memory...');
      onProgress?.({ stage: 'compressing', percent: 5, message: 'Lendo arquivo...' });

      let fileData: Uint8Array;
      try {
        fileData = await fetchFile(file);
        console.log('[VideoCompression] File read successfully, size:', fileData.length);
      } catch (readError: any) {
        console.error('[VideoCompression] Failed to read file:', readError);
        console.log('[VideoCompression] Returning original file due to read error');
        onProgress?.({ stage: 'done', percent: 100, message: 'Usando vídeo original' });
        return file;
      }

      console.log('[VideoCompression] Writing input file to FFmpeg...');
      onProgress?.({ stage: 'compressing', percent: 8, message: 'Preparando...' });
      await ffmpeg.writeFile(inputName, fileData);

      onProgress?.({ stage: 'compressing', percent: 10, message: 'Comprimindo vídeo...' });

      console.log('[VideoCompression] Running FFmpeg compression...');
      await ffmpeg.exec([
        '-i', inputName,
        '-vf', 'scale=-2:min(480\\,ih)',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '32',
        '-maxrate', '800k',
        '-bufsize', '1200k',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-ar', '44100',
        '-movflags', '+faststart',
        '-y',
        outputName
      ]);

      console.log('[VideoCompression] Reading output file...');
      const data = await ffmpeg.readFile(outputName);

      const byteArray = typeof data === 'string'
        ? Array.from(new TextEncoder().encode(data))
        : Array.from(data);

      const compressedBlob = new Blob([new Uint8Array(byteArray)], { type: 'video/mp4' });
      const outputFileName = normalizeMp4FileName(file.name);
      const compressedFile = new File([compressedBlob], outputFileName, { type: 'video/mp4' });

      const originalSize = (file.size / 1024 / 1024).toFixed(2);
      const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2);
      const reduction = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
      console.log(`[VideoCompression] SUCCESS: ${originalSize}MB → ${compressedSize}MB (${reduction}% reduction)`);

      onProgress?.({ stage: 'done', percent: 100, message: 'Compressão concluída!' });

      return compressedFile;
    } catch (error: any) {
      console.error('[VideoCompression] ERROR:', error);
      console.log('[VideoCompression] Returning original file due to error');
      onProgress?.({ stage: 'done', percent: 100, message: 'Usando vídeo original' });
      return file;
    } finally {
      const ffmpeg = sharedFFmpeg;
      if (ffmpeg) {
        await Promise.allSettled([
          ffmpeg.deleteFile(inputName),
          ffmpeg.deleteFile(outputName),
        ]);
      }
    }
  });
}

function getExtension(filename: string, mimeType?: string): string {
  const cleanName = (filename || '').trim();
  const extFromName = cleanName.includes('.')
    ? cleanName.split('.').pop()?.toLowerCase()
    : undefined;

  const ext = extFromName || mimeType?.toLowerCase();

  // If we got a mimeType, normalize it to an extension-like token
  const normalized = ext?.includes('/') ? ext.split('/').pop() : ext;

  switch (normalized) {
    case 'mp4':
      return '.mp4';
    case 'mov':
    case 'quicktime':
      return '.mov';
    case 'avi':
    case 'x-msvideo':
      return '.avi';
    case 'webm':
      return '.webm';
    case 'mkv':
      return '.mkv';
    default:
      return '.mp4';
  }
}

function normalizeMp4FileName(originalName: string): string {
  const clean = (originalName || '').trim();

  if (!clean) {
    return `video-${Date.now()}.mp4`;
  }

  // If there is no extension, append .mp4
  if (!clean.includes('.')) {
    return `${clean}.mp4`;
  }

  // Replace any extension with .mp4
  return clean.replace(/\.[^.]+$/, '.mp4');
}

// Check if file is a video
export function isVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true;
  // Samsung Internet sometimes returns empty type - check extension
  const ext = (file.name || '').split('.').pop()?.toLowerCase();
  return ['mp4', 'mov', 'avi', 'webm', 'mkv', '3gp', '3gpp'].includes(ext || '');
}

// Process a single file (compress if video, return as-is otherwise)
export async function processFileForUpload(
  file: File,
  onProgress?: ProgressCallback
): Promise<File> {
  if (!isVideoFile(file)) {
    return file;
  }

  const originalBytes = file.size;

  // Try to compress; if it fails/returns original and it's still big, block upload.
  const processed = await compressVideo(file, onProgress);

  const compressionDidNothing =
    processed === file ||
    (processed.size === originalBytes && processed.type === file.type);

  if (compressionDidNothing && originalBytes > MAX_VIDEO_UPLOAD_BYTES) {
    onProgress?.({
      stage: 'error',
      percent: 100,
      message: 'Vídeo muito pesado para envio. Grave em modo “Mais compatível” ou envie um vídeo menor.',
    });

    throw new VideoTooLargeError(
      'Não foi possível comprimir o vídeo gravado. Ele está muito pesado para envio (provável codec não suportado para compressão no navegador).'
    );
  }

  return processed;
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
