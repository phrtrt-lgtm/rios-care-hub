const EXT_FROM_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/bmp': 'bmp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp',
  'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
  'audio/webm': 'webm', 'application/pdf': 'pdf',
};

/**
 * Builds a zip entry name with a valid extension.
 * Attachment names are anonymized ("Anexo"), so the extension is inferred
 * from the file name, the blob/declared mime type, or the URL.
 */
export function buildZipEntryName(
  index: number,
  rawName?: string | null,
  mime?: string | null,
  url?: string | null,
  blobType?: string | null,
): string {
  const name = rawName || 'Anexo';
  const base = name.replace(/\.[^.]+$/, '') || 'Anexo';
  const currentExt = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase();
  const urlExt = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(url || '')?.[1]?.toLowerCase();
  const mimeKey = (blobType || mime || '').split(';')[0].toLowerCase();
  const ext = currentExt || EXT_FROM_MIME[mimeKey] || urlExt || 'bin';
  return `${String(index + 1).padStart(2, '0')}-${base}.${ext}`;
}
