import { useEffect, useRef, useCallback } from 'react';

interface SerializedFile {
  url: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
}

interface SerializedAudio extends SerializedFile {
  transcript: string;
  summary: string;
}

export interface InspectionDraft {
  inspectionStatus: 'OK' | 'NÃO' | '';
  inspectionType?: 'standard' | 'routine';
  internalOnly?: boolean;
  checklistData?: Record<string, unknown>;
  uploadedFiles: SerializedFile[];
  audioFiles: SerializedAudio[];
  savedAt: number;
}

const DRAFT_PREFIX = 'inspection-draft-';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getDraftKey(propertyId: string, formType: 'cleaner' | 'team') {
  return `${DRAFT_PREFIX}${formType}-${propertyId}`;
}

export function loadDraft(propertyId: string, formType: 'cleaner' | 'team'): InspectionDraft | null {
  try {
    const key = getDraftKey(propertyId, formType);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const draft: InspectionDraft = JSON.parse(raw);

    // Expire old drafts
    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

export function saveDraft(propertyId: string, formType: 'cleaner' | 'team', draft: Omit<InspectionDraft, 'savedAt'>) {
  try {
    const key = getDraftKey(propertyId, formType);
    const data: InspectionDraft = { ...draft, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable – silently ignore
  }
}

export function clearDraft(propertyId: string, formType: 'cleaner' | 'team') {
  try {
    localStorage.removeItem(getDraftKey(propertyId, formType));
  } catch {
    // ignore
  }
}

/**
 * Creates a placeholder File object from saved metadata.
 * Used to restore the component state after reloading from a draft.
 */
export function createPlaceholderFile(meta: SerializedFile): File {
  return new File([new Blob([''], { type: meta.fileType })], meta.fileName, {
    type: meta.fileType,
  });
}

/**
 * Hook that debounces a save callback.
 * Returns a function that, when called, will trigger save after `delay` ms of inactivity.
 */
export function useAutoSave(saveCallback: () => void, delay = 1000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(saveCallback);
  callbackRef.current = saveCallback;

  const trigger = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      callbackRef.current();
    }, delay);
  }, [delay]);

  // Save on unmount (if pending)
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        callbackRef.current();
      }
    };
  }, []);

  return trigger;
}
