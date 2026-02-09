import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

// ── localStorage helpers (offline fallback) ──

function loadLocalDraft(propertyId: string, formType: 'cleaner' | 'team'): InspectionDraft | null {
  try {
    const key = getDraftKey(propertyId, formType);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const draft: InspectionDraft = JSON.parse(raw);

    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

function saveLocalDraft(propertyId: string, formType: 'cleaner' | 'team', draft: Omit<InspectionDraft, 'savedAt'>) {
  try {
    const key = getDraftKey(propertyId, formType);
    const data: InspectionDraft = { ...draft, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

function clearLocalDraft(propertyId: string, formType: 'cleaner' | 'team') {
  try {
    localStorage.removeItem(getDraftKey(propertyId, formType));
  } catch {
    // ignore
  }
}

// ── DB helpers ──

async function loadDbDraft(propertyId: string, formType: 'cleaner' | 'team'): Promise<InspectionDraft | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('inspection_drafts')
      .select('draft_data, updated_at')
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .eq('form_type', formType)
      .maybeSingle();

    if (error || !data) return null;

    const draft = data.draft_data as unknown as InspectionDraft;

    // Check TTL based on updated_at
    const updatedMs = new Date(data.updated_at).getTime();
    if (Date.now() - updatedMs > DRAFT_TTL_MS) {
      // Expired – clean up
      await supabase
        .from('inspection_drafts')
        .delete()
        .eq('user_id', user.id)
        .eq('property_id', propertyId)
        .eq('form_type', formType);
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

async function saveDbDraft(propertyId: string, formType: 'cleaner' | 'team', draft: Omit<InspectionDraft, 'savedAt'>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const draftData: InspectionDraft = { ...draft, savedAt: Date.now() };

    // Try update first, then insert if not exists
    const { data: existing } = await supabase
      .from('inspection_drafts')
      .select('id')
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .eq('form_type', formType)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('inspection_drafts')
        .update({ draft_data: draftData as any })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('inspection_drafts')
        .insert({
          user_id: user.id,
          property_id: propertyId,
          form_type: formType,
          draft_data: draftData as any,
        } as any);
    }
  } catch {
    // Network error – localStorage still has the data
  }
}

async function clearDbDraft(propertyId: string, formType: 'cleaner' | 'team') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('inspection_drafts')
      .delete()
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .eq('form_type', formType);
  } catch {
    // ignore
  }
}

// ── Public API (hybrid) ──

/**
 * Load draft from DB first, fall back to localStorage.
 * Returns the most recent one if both exist.
 */
export async function loadDraft(propertyId: string, formType: 'cleaner' | 'team'): Promise<InspectionDraft | null> {
  const localDraft = loadLocalDraft(propertyId, formType);
  const dbDraft = await loadDbDraft(propertyId, formType);

  if (!localDraft && !dbDraft) return null;
  if (!dbDraft) return localDraft;
  if (!localDraft) return dbDraft;

  // Return the most recent
  return (localDraft.savedAt >= (dbDraft.savedAt ?? 0)) ? localDraft : dbDraft;
}

/**
 * Synchronous version for backward compatibility – loads from localStorage only.
 * Callers that can be async should prefer loadDraft().
 */
export function loadDraftSync(propertyId: string, formType: 'cleaner' | 'team'): InspectionDraft | null {
  return loadLocalDraft(propertyId, formType);
}

/**
 * Save draft to both localStorage (instant) and DB (async).
 */
export function saveDraft(propertyId: string, formType: 'cleaner' | 'team', draft: Omit<InspectionDraft, 'savedAt'>) {
  saveLocalDraft(propertyId, formType, draft);
  // Fire-and-forget DB save
  saveDbDraft(propertyId, formType, draft);
}

/**
 * Clear draft from both localStorage and DB.
 */
export function clearDraft(propertyId: string, formType: 'cleaner' | 'team') {
  clearLocalDraft(propertyId, formType);
  // Fire-and-forget DB clear
  clearDbDraft(propertyId, formType);
}

/**
 * Creates a placeholder File object from saved metadata.
 */
export function createPlaceholderFile(meta: SerializedFile): File {
  return new File([new Blob([''], { type: meta.fileType })], meta.fileName, {
    type: meta.fileType,
  });
}

/**
 * Hook that debounces a save callback.
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
