/**
 * PG-19：出图历史环形缓冲。
 * 追加语义下：每轮只记录「本轮新图 + 发送稿」，不再把整条旧结果快照打进历史
 *（避免旧图误绑最新一轮 prompt）。
 */

export const MAX_PICTURE_GENERATION_HISTORY = 8;

export interface PictureGenerationHistoryEntry {
  id: string;
  createdAt: string;
  prompt: string;
  /** PG-45: 未 enrich 的用户原稿，避免历史只信可能被污染的 prompt */
  userPrompt?: string;
  /** PG-45: 实际发送/归档时的 compiled prompt，供审计 */
  compiledPrompt?: string;
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

/** 记录本轮新产生的结果（追加模式的正确历史写法） */
export function recordPictureGenerationRound(
  roundUrls: string[],
  history: PictureGenerationHistoryEntry[] | undefined,
  now = Date.now(),
  meta?: { userPrompt?: string; compiledPrompt?: string; prompt?: string },
): PictureGenerationHistoryEntry[] {
  const urls = roundUrls.map((u) => u?.trim()).filter((u): u is string => Boolean(u));
  if (urls.length === 0) return (history ?? []).slice(0, MAX_PICTURE_GENERATION_HISTORY);
  const userPrompt = (meta?.userPrompt ?? meta?.prompt ?? '').trim();
  const compiled = (meta?.compiledPrompt ?? userPrompt).trim();
  const entry: PictureGenerationHistoryEntry = {
    id: `pgh-${now}`,
    createdAt: new Date(now).toISOString(),
    prompt: (meta?.prompt ?? userPrompt).trim().slice(0, 200) || compiled.slice(0, 200),
    userPrompt: userPrompt.slice(0, 200) || undefined,
    compiledPrompt: compiled.slice(0, 4000) || undefined,
    urls,
  };
  return [entry, ...(history ?? []).filter((h) => h.id !== entry.id)].slice(
    0,
    MAX_PICTURE_GENERATION_HISTORY,
  );
}

/** @deprecated 覆盖语义下的整表快照；追加模式请用 recordPictureGenerationRound */
export function archivePictureGeneration(
  previousUrls: string[],
  previousPrompt: string,
  history: PictureGenerationHistoryEntry[] | undefined,
  now = Date.now(),
  meta?: { userPrompt?: string; compiledPrompt?: string },
): PictureGenerationHistoryEntry[] {
  return recordPictureGenerationRound(previousUrls, history, now, {
    prompt: previousPrompt,
    userPrompt: meta?.userPrompt ?? previousPrompt,
    compiledPrompt: meta?.compiledPrompt ?? previousPrompt,
  });
}

/** 把某一轮历史恢复为当前结果，并把当前结果重新归档 */
export function restorePictureGeneration(
  entryId: string,
  currentUrls: string[],
  currentPrompt: string,
  history: PictureGenerationHistoryEntry[],
  now = Date.now(),
): {
  urls: string[];
  history: PictureGenerationHistoryEntry[];
  userPrompt?: string;
  compiledPrompt?: string;
} | null {
  const entry = history.find((h) => h.id === entryId);
  if (!entry) return null;
  const archived = archivePictureGeneration(currentUrls, currentPrompt, history, now);
  return {
    urls: entry.urls,
    userPrompt: entry.userPrompt ?? entry.prompt,
    compiledPrompt: entry.compiledPrompt ?? entry.prompt,
    history: [entry, ...archived.filter((h) => h.id !== entryId)].slice(
      0,
      MAX_PICTURE_GENERATION_HISTORY,
    ),
  };
}
