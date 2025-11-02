import { v4 as uuid } from 'uuid';

/** Remove acentos, espaços, caracteres inválidos e garante extensão segura */
export function sanitizeFilename(name: string) {
  const noAccent = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cleaned = noAccent
    .replace(/[^a-zA-Z0-9._-]/g, '-')    // mantém letras, números, ponto, underline e hífen
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')                 // não pode começar com ponto
    .slice(0, 140);                      // evita nomes enormes
  return cleaned || `file-${Date.now()}`;
}

type KeyOpts =
  | { kind: 'ticket-draft'; ownerId: string; filename: string }
  | { kind: 'ticket-message'; ticketId: string; filename: string };

export function buildStorageKey(opts: KeyOpts) {
  const safe = sanitizeFilename(opts.filename);
  const id = uuid();
  if (opts.kind === 'ticket-draft') {
    return `tickets/${opts.ownerId}/drafts/${id}-${safe}`;
  }
  return `tickets/${opts.ticketId}/messages/${id}-${safe}`;
}
