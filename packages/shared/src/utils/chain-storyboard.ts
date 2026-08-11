import type { StoryboardShot, EpisodeMeta, EpisodeExportRecord } from '../types/storyboard';

/**
 * ChainStoryboardPayload — 按链/按节点隔离的镜表数据。
 * 每个 storyboard-desk 节点的 data.chainStoryboard 持有本链镜头。
 * SSOT 原则：消费范围 = 本节点 data ∪ 上游连入产物。
 */
export interface ChainStoryboardPayload {
  version: 2;
  title?: string;
  activeEpisodeId?: string | null;
  episodes?: EpisodeMeta[];
  shots: StoryboardShot[];
  confirmedEpisodeIds?: string[];
  gridConfirmed?: boolean;
  exportHistory?: EpisodeExportRecord[];
}

function stableSerializeValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerializeValue).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerializeValue(record[key])}`).join(',')}}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function chainStoryboardHash(chain: ChainStoryboardPayload): string {
  return stableHash(stableSerializeValue(chain));
}

export function lineArtVersionHash(
  chain: ChainStoryboardPayload,
  episodeId: string | null | undefined,
): string {
  const shots = chain.shots
    .filter((shot) => !episodeId || shot.episodeId === episodeId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((shot) => ({ shotId: shot.id, lineArtUrl: shot.lineArtUrl ?? null }));
  return stableHash(stableSerializeValue(shots));
}

/**
 * 从 storyboard-desk 节点 data 中安全读取 ChainStoryboardPayload。
 */
export function readChainStoryboard(nodeData: Record<string, unknown>): ChainStoryboardPayload | undefined {
  const raw = nodeData.chainStoryboard as ChainStoryboardPayload | undefined;
  if (!raw || !Array.isArray(raw.shots)) return undefined;
  return raw;
}

/**
 * 构造写入 storyboard-desk data 的 chainStoryboard 负载。
 */
export function buildChainStoryboardPayload(
  existing: ChainStoryboardPayload | undefined,
  overrides: Partial<ChainStoryboardPayload>,
): ChainStoryboardPayload {
  return {
    version: 2,
    title: existing?.title,
    activeEpisodeId: existing?.activeEpisodeId ?? null,
    episodes: existing?.episodes ?? [],
    shots: existing?.shots ?? [],
    confirmedEpisodeIds: existing?.confirmedEpisodeIds ?? [],
    gridConfirmed: existing?.gridConfirmed ?? false,
    exportHistory: existing?.exportHistory ?? [],
    ...overrides,
  };
}

/**
 * 在 chainStoryboard 中按 id 查找并更新单个 shot。
 * 返回新的 shots 数组（immutable）。
 */
export function patchChainShot(
  chain: ChainStoryboardPayload,
  shotId: string,
  patch: Partial<StoryboardShot>,
): StoryboardShot[] {
  return chain.shots.map((shot) =>
    shot.id === shotId ? { ...shot, ...patch } : shot,
  );
}

/**
 * 构造分镜台线稿写回字段，避免复用导演台关键帧字段。
 */
export function buildLineArtShotPatch(
  imageUrl: string,
  sketchPrompt?: string,
): Pick<StoryboardShot, 'lineArtUrl' | 'sketchPrompt'> {
  return {
    lineArtUrl: imageUrl,
    ...(sketchPrompt === undefined ? {} : { sketchPrompt }),
  };
}

/**
 * 从 chainStoryboard 解析当前活动的剧集镜头。
 */
export function activeChainEpisodeShots(chain: ChainStoryboardPayload): StoryboardShot[] {
  const activeEpisodeId = chain.activeEpisodeId;
  if (!activeEpisodeId) return chain.shots;
  const scoped = chain.shots.filter((shot) => shot.episodeId === activeEpisodeId);
  return scoped;
}

/**
 * 判断 chain storyboard 是否有镜头。
 */
export function chainHasShots(chain: ChainStoryboardPayload): boolean {
  return chain.shots.length > 0;
}

/**
 * 把全局 StoryboardPayload 迁移到指定 desk 的 chainStoryboard。
 * 按照 activeEpisodeId 或全量 shots 灌入。
 */
export function migrateGlobalToChainStoryboard(
  globalStoryboard: { title?: string; activeEpisodeId?: string | null; episodes?: EpisodeMeta[]; shots: StoryboardShot[]; exportHistory?: EpisodeExportRecord[] },
): ChainStoryboardPayload {
  return {
    version: 2,
    title: globalStoryboard.title,
    episodes: globalStoryboard.episodes ?? [],
    activeEpisodeId: globalStoryboard.activeEpisodeId ?? null,
    shots: globalStoryboard.shots,
    exportHistory: globalStoryboard.exportHistory ?? [],
    gridConfirmed: false,
    confirmedEpisodeIds: [],
  };
}
