import {
  bindStoryboardShotAssets,
  buildChainStoryboardPayload,
  flattenScriptBreakdownShots,
  isScreenplayPackage,
  mergeStoryboardShotFromBreakdown,
  readChainStoryboard,
  screenplayFullText,
  storyboardShotsFromScriptBreakdown,
  type ChainStoryboardPayload,
  type ScreenplayPackage,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
  type StoryboardPreviewPayload,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { applyScriptBreakdownPayload } from './script-breakdown-runner';

export type StoryboardDeskMode = 'breakdown' | 'grid' | 'compose' | 'handoff';

export type ShotListFilter = 'all' | 'uncomposed' | 'unbound';

export function resolveDeskActiveEpisodeId(
  data: Record<string, unknown> | null | undefined,
  payload: ScriptBreakdownPayload | undefined,
): string | null {
  const requested = typeof data?.activeEpisodeId === 'string' ? data.activeEpisodeId : null;
  if (requested && payload?.episodes.some((episode) => episode.id === requested)) return requested;
  return payload?.episodes[0]?.id ?? null;
}

export interface CompositionStats {
  total: number;
  composed: number;
  trial: number;
  coverage: number;
  boundCharacters: number;
  boundScenes: number;
}

export interface StoryboardDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  shotId?: string;
}

export function packageSourceHash(pkg: ScreenplayPackage | undefined): string {
  if (!isScreenplayPackage(pkg)) return '';
  const body = pkg.screenplay.episodes.map((ep) => `${ep.id}:${ep.updatedAt}:${ep.bodyMd.length}`).join('|');
  return `${pkg.confirmedAt ?? ''}|${pkg.updatedAt}|${body}`;
}

/**
 * SB-OL-03/SB-OL-07: 按镜头 id 移除关联的预览帧（删镜、清线稿共用）。
 * 匹配口径与 isShotComposed 对齐：sourceShotId、frame.id 本身，以及
 * 桌面写回使用的 `spf-` / `frame-` / `frame-line-` 前缀 id。
 * 返回 null 表示没有帧需要移除。
 */
/**
 * 分镜台构图只认线稿。导演关键帧 `firstFrameAssetId` 不得计入「已出图」。
 */
export function deskLineArtUrl(
  shot: { lineArtUrl?: string | null } | null | undefined,
): string | undefined {
  const url = shot?.lineArtUrl?.trim();
  return url || undefined;
}

/** 结构变更后被退役的镜头 id（合镜会换新 id，旧帧必须跟着清）。 */
export function retiredShotIds(
  before: ScriptBreakdownPayload,
  after: ScriptBreakdownPayload,
): string[] {
  const afterIds = new Set(flattenScriptBreakdownShots(after).map((shot) => shot.id));
  return flattenScriptBreakdownShots(before)
    .map((shot) => shot.id)
    .filter((id) => !afterIds.has(id));
}

/** 撤销快照：镜表 + 预览帧 + 确认态，重置/改字段也可悔。 */
export interface DeskUndoSnapshot {
  payload: ScriptBreakdownPayload;
  storyboardPreview: StoryboardPreviewPayload | undefined;
  confirmedEpisodeIds: string[];
  contactSheetUrl: unknown;
  gridConfirmed: unknown;
  chainStoryboard: unknown;
}

export function captureDeskUndoSnapshot(
  data: Record<string, unknown> | null | undefined,
  payload: ScriptBreakdownPayload,
): DeskUndoSnapshot {
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const confirmed = Array.isArray(data?.confirmedEpisodeIds)
    ? (data.confirmedEpisodeIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const preview = data?.storyboardPreview as StoryboardPreviewPayload | undefined;
  return {
    payload: clone(payload),
    storyboardPreview: preview && typeof preview === 'object' ? clone(preview) : undefined,
    confirmedEpisodeIds: [...confirmed],
    contactSheetUrl: data?.contactSheetUrl,
    gridConfirmed: data?.gridConfirmed,
    chainStoryboard: data?.chainStoryboard && typeof data.chainStoryboard === 'object'
      ? clone(data.chainStoryboard)
      : undefined,
  };
}

/** 会话草稿：兼容 v1（仅镜表）与 v2（镜表+预览+确认态）。 */
export const DESK_SESSION_DRAFT_VERSION = 2 as const;

export interface DeskSessionDraftV2 {
  version: typeof DESK_SESSION_DRAFT_VERSION;
  savedAt: string;
  snapshot: DeskUndoSnapshot;
}

export function serializeDeskSessionDraft(
  data: Record<string, unknown> | null | undefined,
  payload: ScriptBreakdownPayload,
  savedAt = new Date().toISOString(),
): DeskSessionDraftV2 {
  return {
    version: DESK_SESSION_DRAFT_VERSION,
    savedAt,
    snapshot: captureDeskUndoSnapshot(data, payload),
  };
}

export function parseDeskSessionDraft(raw: string): {
  kind: 'v2';
  draft: DeskSessionDraftV2;
} | {
  kind: 'v1';
  payload: ScriptBreakdownPayload;
} | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.version === DESK_SESSION_DRAFT_VERSION && obj.snapshot && typeof obj.snapshot === 'object') {
      const snapshot = obj.snapshot as DeskUndoSnapshot;
      if (!snapshot.payload || typeof snapshot.payload !== 'object' || !Array.isArray(snapshot.payload.episodes)) {
        return null;
      }
      return {
        kind: 'v2',
        draft: {
          version: DESK_SESSION_DRAFT_VERSION,
          savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : '',
          snapshot: {
            ...snapshot,
            confirmedEpisodeIds: Array.isArray(snapshot.confirmedEpisodeIds)
              ? snapshot.confirmedEpisodeIds.filter((id): id is string => typeof id === 'string')
              : [],
          },
        },
      };
    }
    // v1：裸 ScriptBreakdownPayload
    if (obj.version === 1 && Array.isArray(obj.episodes)) {
      return { kind: 'v1', payload: obj as unknown as ScriptBreakdownPayload };
    }
    return null;
  } catch {
    return null;
  }
}

export function removeFramesForShotIds(
  frames: StoryboardPreviewPayload['frames'],
  shotIds: readonly string[],
): StoryboardPreviewPayload['frames'] | null {
  if (!frames?.length || !shotIds.length) return null;
  const ids = new Set(shotIds);
  const matches = (frame: StoryboardPreviewPayload['frames'][number]): boolean => {
    if (frame.sourceShotId && ids.has(frame.sourceShotId)) return true;
    if (ids.has(frame.id)) return true;
    for (const sid of ids) {
      if (frame.id === `spf-${sid}` || frame.id === `frame-${sid}` || frame.id === `frame-line-${sid}`) {
        return true;
      }
    }
    return false;
  };
  const next = frames.filter((frame) => !matches(frame));
  return next.length === frames.length ? null : next;
}

export function isShotComposed(
  shot: ScriptBreakdownShot,
  preview?: StoryboardPreviewPayload,
  storyboardUrl?: string | null,
): boolean {
  if (storyboardUrl?.trim()) return true;
  if (shot.previewImageUrl?.trim()) return true;
  if ((shot as { sketchUrl?: string }).sketchUrl?.trim()) return true;
  const frame = preview?.frames?.find((f) => f.sourceShotId === shot.id || f.id === shot.id);
  if (frame?.imageUrl?.trim()) return true;
  if (frame && (frame as { lineArtUrl?: string }).lineArtUrl?.trim()) return true;
  return false;
}

export function isShotTrial(
  shot: ScriptBreakdownShot,
  preview?: StoryboardPreviewPayload,
  storyboardUrl?: string | null,
): boolean {
  if (storyboardUrl?.trim()) return true;
  if (shot.previewImageUrl?.trim()) return true;
  const frame = preview?.frames?.find((f) => f.sourceShotId === shot.id || f.id === shot.id);
  return Boolean(frame?.imageUrl?.trim());
}

export function isShotBound(
  shot: ScriptBreakdownShot,
  characterNames: Set<string>,
  sceneNames: Set<string>,
): boolean {
  const charsOk = shot.characters.length === 0
    || shot.characters.every((name) => characterNames.has(name.trim()));
  const sceneOk = !shot.scene?.trim() || sceneNames.has(shot.scene.trim());
  return charsOk && sceneOk;
}

export function computeCompositionStats(
  shots: ScriptBreakdownShot[],
  preview: StoryboardPreviewPayload | undefined,
  storyboardUrlByShotId: Map<string, string | undefined>,
  characterNames: Set<string>,
  sceneNames: Set<string>,
): CompositionStats {
  const total = shots.length;
  let composed = 0;
  let trial = 0;
  let boundCharacters = 0;
  let boundScenes = 0;
  for (const shot of shots) {
    const url = storyboardUrlByShotId.get(shot.id);
    if (isShotComposed(shot, preview, url)) composed += 1;
    if (isShotTrial(shot, preview, url)) trial += 1;
    if (shot.characters.length === 0 || shot.characters.every((n) => characterNames.has(n.trim()))) {
      boundCharacters += 1;
    }
    if (!shot.scene?.trim() || sceneNames.has(shot.scene.trim())) {
      boundScenes += 1;
    }
  }
  return {
    total,
    composed,
    trial,
    coverage: total === 0 ? 0 : composed / total,
    boundCharacters,
    boundScenes,
  };
}

export function buildBreakdownDiagnostics(
  payload: ScriptBreakdownPayload | undefined,
  characterNames: Set<string>,
  sceneNames: Set<string>,
): StoryboardDiagnostic[] {
  if (!payload) return [];
  const out: StoryboardDiagnostic[] = [];
  const shots = flattenScriptBreakdownShots(payload);
  if (shots.length === 0) {
    out.push({ level: 'error', code: 'no-shots', message: '镜表为空，请从成稿拆镜或导入旧表' });
    return out;
  }
  for (const shot of shots) {
    const dialogue = shot.dialogue?.[0]?.text || shot.scriptText || '';
    if (!dialogue.trim() && !shot.action?.trim() && !shot.visual?.trim()) {
      out.push({
        level: 'warning',
        code: 'empty-content',
        message: `镜 ${shot.sceneCode || shot.index} 文案/动作/画面皆空`,
        shotId: shot.id,
      });
    }
    if ((shot.durationSec ?? 0) > 20) {
      out.push({
        level: 'warning',
        code: 'long-shot',
        message: `镜 ${shot.sceneCode || shot.index} 时长 ${shot.durationSec}s 偏长`,
        shotId: shot.id,
      });
    }
    for (const name of shot.characters) {
      if (name.trim() && !characterNames.has(name.trim())) {
        out.push({
          level: 'info',
          code: 'unbound-character',
          message: `镜 ${shot.sceneCode || shot.index} 角色「${name}」未在库`,
          shotId: shot.id,
        });
      }
    }
    if (shot.scene?.trim() && !sceneNames.has(shot.scene.trim())) {
      out.push({
        level: 'info',
        code: 'unbound-scene',
        message: `镜 ${shot.sceneCode || shot.index} 场景「${shot.scene}」未在库`,
        shotId: shot.id,
      });
    }
  }
  return out.slice(0, 40);
}

export function filterShots(
  shots: ScriptBreakdownShot[],
  filter: ShotListFilter,
  preview: StoryboardPreviewPayload | undefined,
  storyboardUrlByShotId: Map<string, string | undefined>,
  characterNames: Set<string>,
  sceneNames: Set<string>,
): ScriptBreakdownShot[] {
  if (filter === 'all') return shots;
  if (filter === 'uncomposed') {
    return shots.filter((s) => !isShotComposed(s, preview, storyboardUrlByShotId.get(s.id)));
  }
  return shots.filter((s) => !isShotBound(s, characterNames, sceneNames));
}

export function projectBreakdownToWorkspace(payload: ScriptBreakdownPayload) {
  const doc = useWorkspaceDocument.getState();
  const previousById = new Map(doc.storyboard.shots.map((shot) => [shot.id, shot]));
  const raw = storyboardShotsFromScriptBreakdown(payload)
    .map((base) => mergeStoryboardShotFromBreakdown(base, previousById.get(base.id)));
  const storyboardShots = bindStoryboardShotAssets(
    raw,
    doc.characters.characters,
    doc.environments?.environments ?? [],
    (doc.backlotWorkspace?.items ?? [])
      .filter((i) => i.kind === 'scene')
      .map((i) => ({ id: i.id, label: i.label })),
  );
  const episodeIds = new Set(storyboardShots.map((s) => s.episodeId).filter(Boolean));
  const nextActive =
    doc.storyboard.activeEpisodeId && episodeIds.has(doc.storyboard.activeEpisodeId)
      ? doc.storyboard.activeEpisodeId
      : storyboardShots.find((s) => s.episodeId)?.episodeId ?? null;
  return storyboardShots;
}

export function applyDeskBreakdown(
  blockId: string,
  payload: ScriptBreakdownPayload,
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  extra: Record<string, unknown> = {},
) {
  applyScriptBreakdownPayload(blockId, payload, { syncAssets: false });
  const flat = flattenScriptBreakdownShots(payload);
  const doc = useWorkspaceDocument.getState();
  const previousChain = (extra.chainStoryboard as ChainStoryboardPayload | undefined)
    ?? undefined;
  // F-003: 构建链镜表；P0 绑定 id+名（勿留下空 characterIds）
  const previousById = new Map(previousChain?.shots.map((shot) => [shot.id, shot]) ?? []);
  const rawShots = storyboardShotsFromScriptBreakdown(payload)
    .map((base) => mergeStoryboardShotFromBreakdown(base, previousById.get(base.id)));
  const sceneAssets = (doc.backlotWorkspace?.items ?? [])
    .filter((i) => i.kind === 'scene')
    .map((i) => ({ id: i.id, label: i.label }));
  const shots = bindStoryboardShotAssets(
    rawShots,
    doc.characters.characters,
    doc.environments?.environments ?? [],
    sceneAssets,
  );
  const chainPayload: ChainStoryboardPayload = buildChainStoryboardPayload(previousChain, {
    title: payload.title,
    episodes: payload.episodes.map((ep) => ({
      id: ep.id,
      index: ep.index,
      title: ep.title,
      status: 'draft' as const,
      logline: ep.logline,
    })),
    shots,
    activeEpisodeId:
      previousChain?.activeEpisodeId
      && payload.episodes.some((ep) => ep.id === previousChain.activeEpisodeId)
        ? previousChain.activeEpisodeId
        : payload.episodes[0]?.id ?? null,
    ...(Array.isArray(extra.confirmedEpisodeIds)
      ? { confirmedEpisodeIds: extra.confirmedEpisodeIds.filter((id): id is string => typeof id === 'string') }
      : {}),
    ...(typeof extra.gridConfirmed === 'boolean'
      ? { gridConfirmed: extra.gridConfirmed }
      : {}),
  });
  const { chainStoryboard: _prevChainIgnored, ...restExtra } = extra;
  updateNodeData(blockId, {
    status: 'success',
    scriptBreakdown: payload,
    content: `${payload.title} · ${payload.episodes.length} 集 · ${flat.length} 镜`,
    output: flat.map((s) => s.imagePrompt).filter(Boolean).join('\n\n'),
    meta: {
      type: 'storyboard-desk',
      episodeCount: payload.episodes.length,
      shotCount: flat.length,
    },
    ...restExtra,
    // 最后写入：禁止 extra 用旧 chain 覆盖刚绑定的 id+名
    chainStoryboard: chainPayload,
  });
}

export function buildEpisodeReadyMeta(input: {
  deskId: string;
  episodeId: string;
  shotCount: number;
  compositionCoverage: number;
}) {
  return {
    type: 'storyboard-episode-ready' as const,
    episodeId: input.episodeId,
    shotCount: input.shotCount,
    compositionCoverage: input.compositionCoverage,
    deskId: input.deskId,
  };
}

// ── SB-P1-03 增镜/合镜/拆镜 ──

function clonePayload(payload: ScriptBreakdownPayload): ScriptBreakdownPayload {
  return JSON.parse(JSON.stringify(payload));
}

function findEpisodeForShot(payload: ScriptBreakdownPayload, shotId: string): { episodeIndex: number; shotIndex: number } | null {
  for (let ei = 0; ei < payload.episodes.length; ei++) {
    const episode = payload.episodes[ei];
    for (let si = 0; si < episode.shots.length; si++) {
      if (episode.shots[si].id === shotId) return { episodeIndex: ei, shotIndex: si };
    }
  }
  return null;
}

export function addShotToBreakdown(
  payload: ScriptBreakdownPayload,
  afterShotId: string,
  template?: Partial<ScriptBreakdownShot>,
): ScriptBreakdownPayload {
  const next = clonePayload(payload);
  const pos = findEpisodeForShot(next, afterShotId);
  if (!pos) return payload;
  const episode = next.episodes[pos.episodeIndex];
  const refShot = episode.shots[pos.shotIndex];
  const episodeId = episode.id;
  const newShot: ScriptBreakdownShot = {
    id: `shot-manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    episodeId,
    episodeIndex: pos.episodeIndex,
    index: refShot.index + 1,
    sceneId: refShot.sceneId,
    sceneCode: refShot.sceneCode,
    scene: refShot.scene,
    title: (template?.title ?? refShot.title) || '新镜',
    durationSec: template?.durationSec ?? refShot.durationSec,
    characters: template?.characters ?? [],
    scriptText: template?.scriptText ?? '',
    imagePrompt: template?.imagePrompt ?? '',
    videoPrompt: template?.videoPrompt ?? '',
    dialogue: template?.dialogue ?? [],
    status: 'draft',
    ...template,
  };
  episode.shots.splice(pos.shotIndex + 1, 0, newShot);
  episode.shots.forEach((s, i) => { s.index = i + 1; });
  return next;
}

export function mergeShotsInBreakdown(
  payload: ScriptBreakdownPayload,
  shotIds: string[],
): ScriptBreakdownPayload {
  if (shotIds.length < 2) return payload;
  const next = clonePayload(payload);
  const sorted = shotIds.map((id) => findEpisodeForShot(next, id)).filter(Boolean) as NonNullable<ReturnType<typeof findEpisodeForShot>>[];
  // all must be in same episode
  const episodeIdx = sorted[0]?.episodeIndex;
  if (!sorted.every((s) => s.episodeIndex === episodeIdx)) return payload;
  const episode = next.episodes[episodeIdx];
  const indices = sorted.map((s) => s.shotIndex).sort((a, b) => a - b);
  const shots = indices.map((i) => episode.shots[i]).filter(Boolean);
  if (shots.length < 2) return payload;
  const merged: ScriptBreakdownShot = {
    id: `shot-merged-${Date.now().toString(36)}`,
    episodeId: shots[0].episodeId,
    episodeIndex: shots[0].episodeIndex,
    index: shots[0].index,
    sceneId: shots[0].sceneId,
    sceneCode: shots[0].sceneCode,
    scene: shots[0].scene,
    title: `${shots[0].title || '镜'} + ${shots[shots.length - 1].title || '镜'}`,
    durationSec: shots.reduce((sum, s) => sum + (s.durationSec ?? 3), 0),
    shotSize: shots[0].shotSize,
    cameraMove: shots[0].cameraMove,
    characters: [...new Set(shots.flatMap((s) => s.characters ?? []))],
    imagePrompt: shots.map((s) => s.imagePrompt).filter(Boolean).join('\n'),
    videoPrompt: shots.map((s) => s.videoPrompt).filter(Boolean).join('\n'),
    scriptText: shots.map((s) => s.scriptText).filter(Boolean).join('\n'),
    dialogue: shots.flatMap((s) => s.dialogue ?? []),
    status: 'draft',
  };
  // remove merged shots and insert merged at first position
  const newShots = episode.shots.filter((_, i) => !indices.includes(i));
  newShots.splice(indices[0], 0, merged);
  newShots.forEach((s, i) => { s.index = i + 1; });
  episode.shots = newShots;
  return next;
}

export function splitShotInBreakdown(
  payload: ScriptBreakdownPayload,
  shotId: string,
  splitAfterLineIndex?: number,
): ScriptBreakdownPayload {
  const next = clonePayload(payload);
  const pos = findEpisodeForShot(next, shotId);
  if (!pos) return payload;
  const episode = next.episodes[pos.episodeIndex];
  const original = episode.shots[pos.shotIndex];
  const halfDialogues = original.dialogue ?? [];
  const splitAt = splitAfterLineIndex ?? Math.floor(halfDialogues.length / 2);
  const leftDialogue = halfDialogues.slice(0, splitAt);
  const rightDialogue = halfDialogues.slice(splitAt);
  const rightShot: ScriptBreakdownShot = {
    ...original,
    id: `shot-split-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    index: original.index + 1,
    title: `${original.title || '镜'} (续)`,
    dialogue: rightDialogue,
    status: 'draft',
  };
  original.dialogue = leftDialogue;
  episode.shots.splice(pos.shotIndex + 1, 0, rightShot);
  episode.shots.forEach((s, i) => { s.index = i + 1; });
  return next;
}

export function removeShotFromBreakdown(
  payload: ScriptBreakdownPayload,
  shotId: string,
): ScriptBreakdownPayload {
  const next = clonePayload(payload);
  const pos = findEpisodeForShot(next, shotId);
  if (!pos) return payload;
  const episode = next.episodes[pos.episodeIndex];
  if (episode.shots.length <= 1) return payload;
  episode.shots.splice(pos.shotIndex, 1);
  episode.shots.forEach((s, i) => { s.index = i + 1; });
  return next;
}

export function reorderShotsInBreakdown(
  payload: ScriptBreakdownPayload,
  episodeId: string,
  orderedShotIds: string[],
): ScriptBreakdownPayload {
  const next = clonePayload(payload);
  const episode = next.episodes.find((ep) => ep.id === episodeId);
  if (!episode || episode.shots.length < 2) return payload;
  const ordered = orderedShotIds
    .map((id) => episode.shots.find((s) => s.id === id))
    .filter(Boolean) as ScriptBreakdownShot[];
  if (ordered.length !== episode.shots.length) return payload;
  episode.shots = ordered;
  episode.shots.forEach((s, i) => { s.index = i + 1; });
  return next;
}

export function suggestedTrialCap(episodeShotCount: number): number {
  return Math.min(6, Math.max(2, Math.ceil(episodeShotCount * 0.2)));
}

export function stripEpisodeConfirmation(
  data: Record<string, unknown> | null | undefined,
  episodeId: string | null,
): {
  gridConfirmed: boolean;
  confirmedEpisodeIds: string[];
  chainStoryboard?: ChainStoryboardPayload;
} {
  const ids = Array.isArray((data as any)?.confirmedEpisodeIds)
    ? ((data as any).confirmedEpisodeIds as string[]).filter((id: string) => id !== episodeId)
    : [];
  const chain = data ? readChainStoryboard(data) : undefined;
  return {
    gridConfirmed: false,
    confirmedEpisodeIds: ids,
    ...(chain
      ? {
          chainStoryboard: {
            ...chain,
            gridConfirmed: false,
            confirmedEpisodeIds: ids,
          },
        }
      : {}),
  };
}

export function assembleScreenplaySourceText(pkg: ScreenplayPackage): string {
  return screenplayFullText(pkg).trim();
}

export async function runBreakdownFromPackage(opts: {
  blockId: string;
  pkg: ScreenplayPackage;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  getLiveBreakdown: () => ScriptBreakdownPayload | undefined;
  signal?: AbortSignal;
}): Promise<ScriptBreakdownPayload> {
  const sourceText = assembleScreenplaySourceText(opts.pkg);
  if (!sourceText) throw new Error('成稿正文为空');
  if (opts.pkg.status !== 'confirmed') throw new Error('请先在编剧台确认成稿');
  if (opts.signal?.aborted) throw new DOMException('拆镜已取消', 'AbortError');

  const hash = packageSourceHash(opts.pkg);
  opts.updateNodeData(opts.blockId, {
    status: 'running',
    breakdownJob: {
      phase: 'running',
      sourcePackageId: opts.pkg.brief.title || 'package',
      sourcePackageHash: hash,
      startedAt: new Date().toISOString(),
    },
  });

  const { runProductionScriptBreakdown } = await import('./script-breakdown-runner');
  try {
    await runProductionScriptBreakdown({
      blockId: opts.blockId,
      sourceText,
      signal: opts.signal,
    });
  } catch (error) {
    const aborted = opts.signal?.aborted
      || (error instanceof DOMException && error.name === 'AbortError')
      || (error instanceof Error && error.name === 'AbortError');
    if (aborted) {
      opts.updateNodeData(opts.blockId, {
        status: 'idle',
        breakdownJob: {
          phase: 'cancelled',
          sourcePackageHash: hash,
          error: '用户取消',
        },
      });
    }
    throw error;
  }

  if (opts.signal?.aborted) throw new DOMException('拆镜已取消', 'AbortError');

  const live = opts.getLiveBreakdown();
  if (!live?.version) {
    opts.updateNodeData(opts.blockId, {
      status: 'error',
      breakdownJob: {
        phase: 'error',
        sourcePackageHash: hash,
        error: '拆镜未返回有效镜表',
      },
    });
    throw new Error('拆镜未返回有效镜表');
  }

  applyDeskBreakdown(opts.blockId, live, opts.updateNodeData, {
    breakdownJob: {
      phase: 'done',
      sourcePackageId: opts.pkg.brief.title || 'package',
      sourcePackageHash: hash,
      startedAt: new Date().toISOString(),
    },
    gridConfirmed: false,
    // 重拆默认清空确认（已确认集保护在 UI 层二次确认）
  });
  return live;
}

/* ── SB-P1-02 增量补拆 ── */
/** Merge incremental breakdown result into existing payload */
export function mergeIncrementalBreakdown(
  existing: ScriptBreakdownPayload,
  incremental: ScriptBreakdownPayload,
): ScriptBreakdownPayload {
  const next = clonePayload(existing);
  for (const incEp of incremental.episodes) {
    const existingEp = next.episodes.find((ep) => ep.id === incEp.id);
    if (existingEp) {
      const existingIds = new Set(existingEp.shots.map((s) => s.id));
      const newShots = incEp.shots.filter((s) => !existingIds.has(s.id));
      if (newShots.length > 0) {
        existingEp.shots.push(...newShots);
        existingEp.shots.forEach((s, i) => { s.index = i + 1; });
      }
    } else {
      next.episodes.push(incEp);
    }
  }
  return next;
}


