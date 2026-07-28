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
 * 从 chainStoryboard 解析当前活动的剧集镜头。
 */
export function activeChainEpisodeShots(chain: ChainStoryboardPayload): StoryboardShot[] {
  const activeEpisodeId = chain.activeEpisodeId;
  if (!activeEpisodeId) return chain.shots;
  const scoped = chain.shots.filter((shot) => shot.episodeId === activeEpisodeId);
  return scoped.length > 0 ? scoped : chain.shots;
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
