/**
 * Detects the actual media type of a file using mime_type and file_name as fallback.
 * Many legacy attachments have null/octet-stream mime types but valid extensions.
 */

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp', 'qt'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'];
const PDF_EXTENSIONS = ['pdf'];

const EXTENSION_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  m4v: 'video/mp4',
  '3gp': 'video/3gpp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/opus',
  pdf: 'application/pdf',
};

function getExtension(name?: string | null, url?: string | null): string {
  const candidate = name || url || '';
  // Strip query string
  const clean = candidate.split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  if (dot === -1) return '';
  return clean.slice(dot + 1).toLowerCase();
}

export type MediaKind = 'video' | 'image' | 'audio' | 'pdf' | 'other';

/**
 * Returns the resolved media kind, falling back to extension when mime is missing/generic.
 */
export function detectMediaKind(
  mimeType?: string | null,
  fileName?: string | null,
  fileUrl?: string | null,
): MediaKind {
  const mime = (mimeType || '').toLowerCase();

  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';

  // Fallback to extension when mime is missing or generic (octet-stream, binary/octet, etc.)
  const ext = getExtension(fileName, fileUrl);
  if (!ext) return 'other';

  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (PDF_EXTENSIONS.includes(ext)) return 'pdf';

  return 'other';
}

/**
 * Returns a usable mime type, inferring from extension when missing/generic.
 */
export function resolveMimeType(
  mimeType?: string | null,
  fileName?: string | null,
  fileUrl?: string | null,
): string {
  const mime = (mimeType || '').toLowerCase();
  if (mime && mime !== 'application/octet-stream' && mime !== 'binary/octet-stream') {
    return mime;
  }
  const ext = getExtension(fileName, fileUrl);
  return EXTENSION_TO_MIME[ext] || mime || 'application/octet-stream';
}
