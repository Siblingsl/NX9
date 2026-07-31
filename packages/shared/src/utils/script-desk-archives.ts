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
