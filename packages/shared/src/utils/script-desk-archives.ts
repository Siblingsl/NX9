/**
 * 编剧台草稿箱 / 回收站快照（项目级）。
 * 每个独立剧本对应一个「文件夹」快照。
 */

import type { ScreenplayPackage, ScriptDeskAgentSession } from '../types/screenplay-package';
import { screenplayWordCount } from '../types/screenplay-package';

export interface ScriptDeskFolderSnapshot {
  id: string;
  title: string;
  episodeCount: number;
  wordCount: number;
  savedAt: number;
  package: ScreenplayPackage;
  agentSession: ScriptDeskAgentSession;
  entryMode?: 'agent' | 'ingest';
  sourceBlockId?: string;
  kind?: 'manual' | 'autosave';
  workingKey?: string;
  /** 进回收站时写入；草稿箱中应为 undefined */
  deletedAt?: number | null;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function scriptDeskFolderTitle(pkg: ScreenplayPackage): string {
  return (
    pkg.brief.title?.trim()
    || pkg.screenplay.episodes[0]?.title?.trim()
    || '未命名剧本'
  );
}

export function createScriptDeskFolderSnapshot(input: {
  package: ScreenplayPackage;
  agentSession?: ScriptDeskAgentSession;
  entryMode?: 'agent' | 'ingest';
  sourceBlockId?: string;
  kind?: 'manual' | 'autosave';
  workingKey?: string;
  now?: number;
}): ScriptDeskFolderSnapshot {
  const now = input.now ?? Date.now();
  const pkg = cloneJson(input.package);
  return {
    id: `sd-folder-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: scriptDeskFolderTitle(pkg),
    episodeCount: pkg.screenplay.episodes.length,
    wordCount: screenplayWordCount(pkg),
    savedAt: now,
    package: pkg,
    agentSession: cloneJson(
      input.agentSession ?? { messages: [], updatedAt: new Date(now).toISOString() },
    ),
    entryMode: input.entryMode ?? 'agent',
    sourceBlockId: input.sourceBlockId,
    kind: input.kind,
    workingKey: input.workingKey,
  };
}

export function isScriptDeskFolderEmpty(pkg: ScreenplayPackage): boolean {
  return (
    pkg.screenplay.episodes.length === 0
    && pkg.bible.characters.length === 0
    && pkg.bible.scenes.length === 0
    && !pkg.brief.title?.trim()
    && !pkg.brief.logline?.trim()
  );
}

export function trashScriptDeskFolder(
  folder: ScriptDeskFolderSnapshot,
  now = Date.now(),
): ScriptDeskFolderSnapshot {
  return { ...folder, deletedAt: now };
}

export function restoreScriptDeskFolderFromTrash(
  folder: ScriptDeskFolderSnapshot,
): ScriptDeskFolderSnapshot {
  const next = { ...folder };
  delete next.deletedAt;
  next.savedAt = Date.now();
  return next;
}

/**
 * 在 drafts 数组中按 workingKey + kind==='autosave' 查找匹配项。
 * 返回 index 和 folder；未找到返回 -1 和 null。
 */
export function findMatchingWorkingDraft(
  drafts: ScriptDeskFolderSnapshot[],
  workingKey: string,
): { index: number; folder: ScriptDeskFolderSnapshot | null } {
  const idx = drafts.findIndex(
    (d) => d.kind === 'autosave' && d.workingKey === workingKey && !d.deletedAt,
  );
  return idx >= 0 ? { index: idx, folder: drafts[idx] } : { index: -1, folder: null };
}

/**
 * 原地更新或新增一条 autosave 工作草稿。
 * 若已有同 workingKey 的 autosave，更新其内容；否则新建并插入列表头部。
 * 返回 { folder, isNew }。
 */
export function upsertScriptDeskWorkingDraft(
  drafts: ScriptDeskFolderSnapshot[],
  input: {
    package: ScreenplayPackage;
    agentSession?: ScriptDeskAgentSession;
    entryMode?: 'agent' | 'ingest';
    sourceBlockId?: string;
    now?: number;
  },
): { drafts: ScriptDeskFolderSnapshot[]; folder: ScriptDeskFolderSnapshot; isNew: boolean } {
  const workingKey = input.sourceBlockId ?? '';
  const { index } = findMatchingWorkingDraft(drafts, workingKey);
  const now = input.now ?? Date.now();
  const pkg = cloneJson(input.package);
  const session = cloneJson(
    input.agentSession ?? { messages: [], updatedAt: new Date(now).toISOString() },
  );

  if (index >= 0) {
    const updated: ScriptDeskFolderSnapshot = {
      ...drafts[index],
      title: scriptDeskFolderTitle(pkg),
      episodeCount: pkg.screenplay.episodes.length,
      wordCount: screenplayWordCount(pkg),
      savedAt: now,
      package: pkg,
      agentSession: session,
      entryMode: input.entryMode ?? drafts[index].entryMode ?? 'agent',
    };
    const next = [...drafts];
    next[index] = updated;
    return { drafts: next, folder: updated, isNew: false };
  }

  const folder = createScriptDeskFolderSnapshot({
    ...input,
    kind: 'autosave',
    workingKey,
    now,
  });
  return { drafts: [folder, ...drafts], folder, isNew: true };
}

/** S-03: 重命名草稿文件夹（同步更新 title 和 package.brief.title） */
export function renameScriptDeskDraft(
  folder: ScriptDeskFolderSnapshot,
  newTitle: string,
): ScriptDeskFolderSnapshot {
  const pkg = cloneJson(folder.package);
  pkg.brief.title = newTitle.trim();
  pkg.updatedAt = new Date().toISOString();
  return {
    ...folder,
    title: newTitle.trim(),
    package: pkg,
    savedAt: Date.now(),
  };
}
