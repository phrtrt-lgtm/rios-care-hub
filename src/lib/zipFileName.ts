const EXT_FROM_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/bmp': 'bmp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp',
  'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
  'audio/webm': 'webm', 'application/pdf': 'pdf',
};

const GENERIC_MIMES = new Set([
  '', 'application/octet-stream', 'binary/octet-stream', 'application/binary',
  'text/plain', 'application/x-empty',
]);

/** Detects the real file type from the first bytes of the blob (magic numbers). */
export async function sniffExtension(blob: Blob): Promise<string | undefined> {
  try {
    const buf = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
    if (buf.length < 4) return undefined;
    const hex = Array.from(buf.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join('');
    const ascii = (start: number, len: number) =>
      String.fromCharCode(...Array.from(buf.slice(start, start + len)));

    if (hex.startsWith('ffd8ff')) return 'jpg';
    if (hex.startsWith('89504e47')) return 'png';
    if (hex.startsWith('47494638')) return 'gif';
    if (hex.startsWith('25504446')) return 'pdf';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'AVI ') return 'avi';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'wav';
    if (hex.startsWith('1a45dfa3')) return 'webm';
    if (ascii(4, 4) === 'ftyp') {
      const brand = ascii(8, 4).toLowerCase();
      if (brand.startsWith('qt')) return 'mov';
      if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1')) return 'heic';
      if (brand.startsWith('3gp')) return '3gp';
      return 'mp4';
    }
    if (hex.startsWith('494433') || hex.startsWith('fffb') || hex.startsWith('fff3')) return 'mp3';
    if (ascii(0, 4) === 'OggS') return 'ogg';
    if (hex.startsWith('504b0304')) return 'zip';
    if (hex.startsWith('424d')) return 'bmp';
  } catch {
    // ignore
  }
  return undefined;
}

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
  sniffedExt?: string | null,
): string {
  const name = rawName || 'Anexo';
  const base = name.replace(/\.[^.]+$/, '') || 'Anexo';
  const currentExt = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase();
  const urlExt = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(url || '')?.[1]?.toLowerCase();
  const blobKey = (blobType || '').split(';')[0].toLowerCase();
  const declaredKey = (mime || '').split(';')[0].toLowerCase();
  const mimeExt = EXT_FROM_MIME[blobKey] || EXT_FROM_MIME[declaredKey];
  const generic = GENERIC_MIMES.has(blobKey) && GENERIC_MIMES.has(declaredKey);
  // Magic bytes win when the mime type is generic/unknown.
  const ext = (generic ? sniffedExt || undefined : undefined)
    || currentExt || mimeExt || urlExt || sniffedExt || 'bin';
  return `${String(index + 1).padStart(2, '0')}-${base}.${ext}`;
}

/** Convenience wrapper: sniffs the blob and builds the zip entry name. */
export async function buildZipEntryNameFromBlob(
  index: number,
  blob: Blob,
  rawName?: string | null,
  mime?: string | null,
  url?: string | null,
): Promise<string> {
  const sniffed = await sniffExtension(blob);
  return buildZipEntryName(index, rawName, mime, url, blob.type, sniffed);
}
