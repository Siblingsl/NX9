/**
 * consistency-check.ts —— 跨格 / 跨镜一致性校验的**取数壳层**（图像级）。
 *
 * 职责边界：
 * - 本文件只做「拿数据」：把一组格图 URL 交给既有视觉接口 `api.analyzeFaces`
 *   （`POST /api/tools/analyze-faces`），按 `runWithConcurrency` 限流、同 URL 复用缓存，
 *   并把每一格的**原始结论或原始失败原因**如实交回；
 * - **不做任何判定**：比对 / 报告 / 挑最优格都在纯函数模块
 *   `packages/shared/src/utils/consistency-report.ts`（可单测、无网络、无副作用）；
 * - **不伪造**：接口失败 / 网络异常 / 返回体缺字段一律落 `status: 'failed'` + `reasonZh`，
 *   对应的 `CrossCellInput.faces` 为 `null`（= 没有可用分析），**不会**被当成「无人脸」。
 *
 * 为什么对纯函数只用 `import type` 的**相对路径**：`packages/shared/src/index.ts`（barrel）
 * 当前引用了 8 个尚不存在的 `data/*` 模块（既有缺陷），走 barrel 会让本文件的单测无法解析；
 * 类型导入在编译期即被抹除，运行时零依赖，因此既能复用存量类型、又不被该缺陷拖累。
 * 同理，`api` 用**动态 import** 取用，单测注入 `analyze` 后不会再触碰 API 层。
 */

import { runWithConcurrency } from './run-with-concurrency';
import type {
  CrossCellFace,
  CrossCellInput,
} from '../../../../packages/shared/src/utils/consistency-report';

/* ────────────────────────── 类型 ────────────────────────── */

/** 与服务端 `/api/tools/analyze-faces` 返回形状对齐（只声明本模块用到的字段） */
export interface AnalyzeFacesResponse {
  ok: boolean;
  faces?: CrossCellFace[];
  summary?: string;
  analyzedAt?: string;
  /** 部分错误响应带 message（服务端 ok:false 时原因通常写在 summary） */
  message?: string;
}

export type AnalyzeFacesFn = (imageUrl: string) => Promise<AnalyzeFacesResponse>;

export type AnalyzeCellStatus =
  /** 分析成功且检出人脸 */
  | 'analyzed'
  /** 分析成功，确实无人脸（**有效结论**，不等于失败） */
  | 'no-face'
  /** 分析失败（服务不可用 / 网络异常 / 返回体不可用） */
  | 'failed'
  /** 该格没有图，未分析 */
  | 'skipped'
  /** 已取消，未分析 */
  | 'cancelled';

export interface AnalyzeCellFacesEntry {
  /** 去空后的 URL；skipped 为空串 */
  url: string;
  status: AnalyzeCellStatus;
  /** 仅 status 为 analyzed / no-face 时为 true */
  ok: boolean;
  /** 分析成功时的人脸数组（可能为空 = 确实无人脸） */
  faces: CrossCellFace[];
  /** ok 为 false 时的原因（如实展示，禁止被当成「无人脸」） */
  reasonZh?: string;
  /** 本次是否命中会话缓存（命中则未真正请求接口） */
  cached: boolean;
}

export interface AnalyzeCellFacesOptions {
  /** 并发上限；缺省 `CONSISTENCY_DEFAULT_LIMIT`（= 2，与逐格出图缺省同口径） */
  limit?: number;
  /** 取消信号：aborted 后不再启动新的分析（在途分析跑完） */
  signal?: AbortSignal;
  /** 进度：按**去重后**的待分析 URL 数报（done = 已完成数） */
  onProgress?: (done: number, total: number) => void;
  /** 与 `urls` 等长的格标签（角色名 / 机位名），仅用于报告文案 */
  labels?: readonly (string | undefined)[];
  /** 注入分析器（缺省 `api.analyzeFaces`）；单测据此注入 mock */
  analyze?: AnalyzeFacesFn;
  /** 缓存：缺省用模块级会话缓存；传 `false` 关闭；传 Map 用自带缓存 */
  cache?: Map<string, AnalyzeCellFacesEntry> | false;
}

export interface AnalyzeCellFacesResult {
  /** 与入参 `urls` **等长、下标对齐**的逐格结果 */
  entries: AnalyzeCellFacesEntry[];
  /** 只含「有图」的格（未出图的格不纳入校验），index 为原始下标 */
  cells: CrossCellInput[];
  /** ok 为 true 的格数（含「分析成功且无人脸」） */
  analyzedCount: number;
  /** 检出人脸总数 */
  faceCount: number;
  failedCount: number;
  skippedCount: number;
  cancelledCount: number;
  /** 有格因取消而未分析（未跑完） */
  cancelled: boolean;
}

/* ────────────────────────── 会话缓存（只缓存成功结果） ────────────────────────── */

/** 缓存条数上限（会话内存，FIFO 淘汰；不落盘、不写节点 data） */
export const CONSISTENCY_FACE_CACHE_MAX = 200;
/** 未显式指定 limit 时的并发上限 */
export const CONSISTENCY_DEFAULT_LIMIT = 2;

const sessionFaceCache = new Map<string, AnalyzeCellFacesEntry>();

/** 清空会话内人脸分析缓存（换源图 / 怀疑结果过期时由调用方手动调用） */
export function clearConsistencyFaceCache(): void {
  sessionFaceCache.clear();
}

/** 会话缓存条数（面板 / 单测可核对缓存确实在起作用） */
export function consistencyFaceCacheSize(): number {
  return sessionFaceCache.size;
}

function writeCache(
  cache: Map<string, AnalyzeCellFacesEntry>,
  url: string,
  entry: AnalyzeCellFacesEntry,
): void {
  if (!cache.has(url) && cache.size >= CONSISTENCY_FACE_CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(url, entry);
}

/* ────────────────────────── 单格分析 ────────────────────────── */

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  return String(error);
}

function normalizeFace(raw: unknown): CrossCellFace | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const confidence = Number(record.confidence);
  return {
    expression: typeof record.expression === 'string' ? record.expression.trim().toLowerCase() : '',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    description: typeof record.description === 'string' ? record.description : '',
  };
}

/** 缺省分析器：既有视觉接口（动态 import，避免 API 层成为本文件的静态依赖） */
async function defaultAnalyze(imageUrl: string): Promise<AnalyzeFacesResponse> {
  const { api } = await import('../api/client');
  return api.analyzeFaces(imageUrl);
}

/** 单格：**不抛异常**，失败如实落 reasonZh（禁止伪造为空结果 / 无人脸） */
async function analyzeOne(url: string, analyze: AnalyzeFacesFn): Promise<AnalyzeCellFacesEntry> {
  try {
    const res = await analyze(url);
    if (!res || typeof res !== 'object') {
      return {
        url,
        status: 'failed',
        ok: false,
        faces: [],
        reasonZh: '人脸分析返回空结果（禁止空成功）',
        cached: false,
      };
    }
    if (res.ok !== true) {
      const reason =
        String(res.message ?? '').trim() ||
        String(res.summary ?? '').trim() ||
        '人脸分析服务返回失败（未给出原因）';
      return { url, status: 'failed', ok: false, faces: [], reasonZh: reason, cached: false };
    }
    if (!Array.isArray(res.faces)) {
      return {
        url,
        status: 'failed',
        ok: false,
        faces: [],
        reasonZh: '人脸分析结果缺少 faces 数组（不谎称「无人脸」）',
        cached: false,
      };
    }
    const faces = res.faces
      .map(normalizeFace)
      .filter((face): face is CrossCellFace => face !== null);
    return {
      url,
      status: faces.length > 0 ? 'analyzed' : 'no-face',
      ok: true,
      faces,
      cached: false,
    };
  } catch (error) {
    return {
      url,
      status: 'failed',
      ok: false,
      faces: [],
      reasonZh: `人脸分析请求失败：${errorText(error)}`,
      cached: false,
    };
  }
}

/* ────────────────────────── 主入口 ────────────────────────── */

/**
 * 对一组格图 URL 调人脸分析接口。
 *
 * 口径：
 * - **同 URL 只请求一次**：一批内先去重再并发；跨批次命中会话缓存（`opts.cache`）；
 *   缓存**只存成功结果**（失败不入缓存，重试会真的重新请求）；
 * - **限流**：`runWithConcurrency` 有界并发（缺省 2，`limit` 由调用方给，UI 复用「逐格并发」设置）；
 * - **失败透传**：接口 ok:false / 抛错 / 返回体缺字段 → 该格 `status: 'failed'` + `reasonZh`，
 *   `cells` 里对应项的 `faces` 为 `null`（不可分析），绝不静默降级为「无人脸」；
 * - **取消**：`signal.aborted` 后不再启动新分析，未跑的格落 `status: 'cancelled'`；
 * - 空 URL（未出图的格）落 `status: 'skipped'`，不进 `cells`。
 */
export async function analyzeCellFaces(
  urls: readonly string[],
  options: AnalyzeCellFacesOptions = {},
): Promise<AnalyzeCellFacesResult> {
  const list = Array.isArray(urls) ? urls : [];
  const labels = Array.isArray(options.labels) ? options.labels : [];
  const analyze = options.analyze ?? defaultAnalyze;
  const cache =
    options.cache === false
      ? null
      : options.cache instanceof Map
        ? options.cache
        : sessionFaceCache;

  const positions = list.map((raw, at) => {
    const url = typeof raw === 'string' ? raw.trim() : '';
    const label = typeof labels[at] === 'string' ? (labels[at] as string).trim() : '';
    return { at, url, label: label || undefined };
  });

  // 去重（同 URL 只分析一次），保持首次出现顺序
  const uniqueUrls: string[] = [];
  const seen = new Set<string>();
  for (const position of positions) {
    if (!position.url || seen.has(position.url)) continue;
    seen.add(position.url);
    uniqueUrls.push(position.url);
  }

  const byUrl = new Map<string, AnalyzeCellFacesEntry>();
  if (cache) {
    for (const url of uniqueUrls) {
      const hit = cache.get(url);
      // 命中即视为成功结果（失败不入缓存），标记 cached 供 UI / 单测核对
      if (hit) byUrl.set(url, { ...hit, cached: true });
    }
  }

  const pending = uniqueUrls.filter((url) => !byUrl.has(url));
  let cancelled = false;
  if (pending.length > 0) {
    const outcome = await runWithConcurrency(
      pending,
      async (url) => {
        const entry = await analyzeOne(url, analyze);
        if (cache && entry.ok) writeCache(cache, url, entry);
        return entry;
      },
      {
        limit: options.limit ?? CONSISTENCY_DEFAULT_LIMIT,
        signal: options.signal,
        onProgress: options.onProgress,
      },
    );
    cancelled = outcome.cancelled;
    outcome.results.forEach((entry, at) => {
      const url = pending[at];
      if (!url) return;
      // worker 自身不抛异常 ⇒ results 为 undefined 只可能是「取消后未启动」
      byUrl.set(
        url,
        entry ?? {
          url,
          status: 'cancelled',
          ok: false,
          faces: [],
          reasonZh: '已取消：该格未做分析',
          cached: false,
        },
      );
    });
  }

  const entries: AnalyzeCellFacesEntry[] = positions.map((position) => {
    if (!position.url) {
      return {
        url: '',
        status: 'skipped',
        ok: false,
        faces: [],
        reasonZh: '该格没有图：未做分析',
        cached: false,
      };
    }
    const entry = byUrl.get(position.url);
    if (entry) return entry;
    return {
      url: position.url,
      status: 'cancelled',
      ok: false,
      faces: [],
      reasonZh: '已取消：该格未做分析',
      cached: false,
    };
  });

  const cells: CrossCellInput[] = [];
  positions.forEach((position, at) => {
    if (!position.url) return;
    const entry = entries[at] as AnalyzeCellFacesEntry;
    cells.push({
      index: position.at,
      label: position.label,
      url: position.url,
      faces: entry.ok ? entry.faces : null,
      unavailableReasonZh: entry.ok ? undefined : entry.reasonZh,
    });
  });

  return {
    entries,
    cells,
    analyzedCount: entries.filter((entry) => entry.ok).length,
    faceCount: entries.reduce((sum, entry) => sum + (entry.ok ? entry.faces.length : 0), 0),
    failedCount: entries.filter((entry) => entry.status === 'failed').length,
    skippedCount: entries.filter((entry) => entry.status === 'skipped').length,
    cancelledCount: entries.filter((entry) => entry.status === 'cancelled').length,
    cancelled,
  };
}
