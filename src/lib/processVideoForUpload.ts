import { compressVideo, isVideoFile, FileUploadProgress } from '@/lib/fileUpload';

/**
 * Process a file for upload, compressing videos if supported
 * Returns the processed file (compressed or original)
 */
export async function processFileForUpload(
  file: File,
  onProgress?: (progress: FileUploadProgress) => void
): Promise<File> {
  if (isVideoFile(file)) {
    return await compressVideo(file, onProgress);
  }
  return file;
}

/**
 * Process multiple files for upload, compressing videos
 * Returns array of processed files
 */
export async function processFilesForUpload(
  files: File[],
  onFileProgress?: (fileIndex: number, totalFiles: number, progress: FileUploadProgress) => void
): Promise<File[]> {
  const processedFiles: File[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const processed = await processFileForUpload(file, (progress) => {
      onFileProgress?.(i, files.length, progress);
    });
    processedFiles.push(processed);
  }
  
  return processedFiles;
}
