/**
 * PG-19：出图历史环形缓冲。每次运行覆盖 previewUrls 前，把旧结果归档。
 */

export const MAX_PICTURE_GENERATION_HISTORY = 8;

export interface PictureGenerationHistoryEntry {
  id: string;
  createdAt: string;
  prompt: string;
  urls: string[];
}

export function readPictureGenerationHistory(
  data: Record<string, unknown>,
): PictureGenerationHistoryEntry[] {
  const raw = data.generationHistory;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is PictureGenerationHistoryEntry => {
    if (!item || typeof item !== 'object') return false;
    const entry = item as PictureGenerationHistoryEntry;
    return typeof entry.id === 'string' && Array.isArray(entry.urls) && entry.urls.length > 0;
  });
}

export function archivePictureGeneration(
  previousUrls: string[],
  previousPrompt: string,
  history: PictureGenerationHistoryEntry[] | undefined,
  now = Date.now(),
): PictureGenerationHistoryEntry[] {
  const urls = previousUrls.map((u) => u?.trim()).filter((u): u is string => Boolean(u));
  if (urls.length === 0) return (history ?? []).slice(0, MAX_PICTURE_GENERATION_HISTORY);
  const entry: PictureGenerationHistoryEntry = {
    id: `pgh-${now}`,
    createdAt: new Date(now).toISOString(),
    prompt: (previousPrompt ?? '').trim().slice(0, 200),
    urls,
  };
  return [entry, ...(history ?? []).filter((h) => h.id !== entry.id)].slice(
    0,
    MAX_PICTURE_GENERATION_HISTORY,
  );
}

/** 把某一轮历史恢复为当前结果，并把当前结果重新归档 */
export function restorePictureGeneration(
  entryId: string,
  currentUrls: string[],
  currentPrompt: string,
  history: PictureGenerationHistoryEntry[],
  now = Date.now(),
): { urls: string[]; history: PictureGenerationHistoryEntry[] } | null {
  const entry = history.find((h) => h.id === entryId);
  if (!entry) return null;
  const archived = archivePictureGeneration(currentUrls, currentPrompt, history, now);
  return {
    urls: entry.urls,
    history: [entry, ...archived.filter((h) => h.id !== entryId)].slice(
      0,
      MAX_PICTURE_GENERATION_HISTORY,
    ),
  };
}
