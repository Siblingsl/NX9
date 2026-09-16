/**
 * 跨格一致性校验取数壳层回归（apps/web/src/engine/consistency-check.ts）。
 *
 * 注意：本文件 import 走**相对路径直取源码**；被测模块对纯函数只用 `import type`
 * （编译期抹除）、对 API 层只用**动态 import**，因此这里注入 mock `analyze` 后
 * 完全不会触碰 `@nx9/shared` barrel 与 `api/client`（barrel 既有缺陷见
 * docs/NX9-CONSISTENCY-CHECK.md）。
 *
 * 覆盖：并发上限不超限、按下标对齐、同 URL 去重与缓存命中、失败透传（不伪造结论）、
 * 「无人脸」与「分析不可用」严格区分、取消语义、空 URL 跳过、计数账目、进度口径，
 * 以及与 buildConsistencyReport 串联时「全部失败 → 不产生假报告」。
 *
 * 真实人脸分析端到端**未覆盖**（需服务端 + 视觉通道凭据，本机跑不了），这里如实说明。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONSISTENCY_DEFAULT_LIMIT,
  analyzeCellFaces,
  clearConsistencyFaceCache,
  consistencyFaceCacheSize,
  type AnalyzeFacesResponse,
} from '../consistency-check';
import { buildConsistencyReport } from '../../../../../packages/shared/src/utils/consistency-report';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** 成功返回 n 张脸 */
const okFaces = (count: number): AnalyzeFacesResponse => ({
  ok: true,
  faces: Array.from({ length: count }, () => ({
    expression: 'neutral',
    confidence: 0.9,
    description: '黑发少年',
  })),
  summary: '已完成表情分析',
  analyzedAt: '2026-09-15T00:00:00.000Z',
});

beforeEach(() => {
  clearConsistencyFaceCache();
});

describe('analyzeCellFaces：并发与对齐', () => {
  it('同时在跑的分析不超过 limit，结果与入参下标对齐', async () => {
    const urls = Array.from({ length: 7 }, (_, i) => `/media/cell-${i}.png`);
    let inFlight = 0;
    let maxInFlight = 0;
    const calls: string[] = [];

    const result = await analyzeCellFaces(urls, {
      limit: 3,
      cache: false,
      labels: urls.map((_, i) => `格 ${i + 1}`),
      analyze: async (url) => {
        calls.push(url);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await flush();
        inFlight -= 1;
        return okFaces(1);
      },
    });

    expect(maxInFlight).toBe(3);
    expect(calls.length).toBe(7);
    expect(result.entries).toHaveLength(7);
    expect(result.entries.map((entry) => entry.url)).toEqual(urls);
    expect(result.cells.map((cell) => cell.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.cells[2]!.label).toBe('格 3');
    expect(result.analyzedCount).toBe(7);
    expect(result.faceCount).toBe(7);
    expect(result.failedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.cancelled).toBe(false);
  });

  it('缺省并发上限为 CONSISTENCY_DEFAULT_LIMIT（与逐格出图缺省同口径）', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await analyzeCellFaces(['/a.png', '/b.png', '/c.png', '/d.png'], {
      cache: false,
      analyze: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await flush();
        inFlight -= 1;
        return okFaces(1);
      },
    });
    expect(maxInFlight).toBe(CONSISTENCY_DEFAULT_LIMIT);
    expect(CONSISTENCY_DEFAULT_LIMIT).toBe(2);
  });

  it('同 URL 只请求一次；进度按去重后的 URL 数报', async () => {
    const calls: string[] = [];
    const progress: [number, number][] = [];
    const result = await analyzeCellFaces(['/a.png', '/b.png', '/a.png', '/b.png'], {
      cache: false,
      limit: 2,
      onProgress: (done, total) => progress.push([done, total]),
      analyze: async (url) => {
        calls.push(url);
        return okFaces(1);
      },
    });

    expect(calls.sort()).toEqual(['/a.png', '/b.png']);
    expect(result.entries.map((entry) => entry.url)).toEqual([
      '/a.png',
      '/b.png',
      '/a.png',
      '/b.png',
    ]);
    // 四条结果是同一份分析：都 ok
    expect(result.entries.every((entry) => entry.ok)).toBe(true);
    expect(result.analyzedCount).toBe(4);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('空 URL（未出图）跳过：status skipped，不进 cells，下标仍保留原始位次', async () => {
    const calls: string[] = [];
    const result = await analyzeCellFaces(['', '/b.png', '   ', '/d.png'], {
      cache: false,
      labels: ['一', '二', '三', '四'],
      analyze: async (url) => {
        calls.push(url);
        return okFaces(1);
      },
    });

    expect(calls).toEqual(['/b.png', '/d.png']);
    expect(result.entries.map((entry) => entry.status)).toEqual([
      'skipped',
      'analyzed',
      'skipped',
      'analyzed',
    ]);
    expect(result.skippedCount).toBe(2);
    expect(result.cells.map((cell) => cell.index)).toEqual([1, 3]);
    expect(result.cells[0]!.label).toBe('二');
    expect(result.cells[0]!.faces).toEqual([
      { expression: 'neutral', confidence: 0.9, description: '黑发少年' },
    ]);
  });
});

describe('analyzeCellFaces：缓存', () => {
  it('注入的 Map 缓存命中后不再请求接口，且标记 cached', async () => {
    const cache = new Map();
    let calls = 0;
    const analyze = async (): Promise<AnalyzeFacesResponse> => {
      calls += 1;
      return okFaces(2);
    };

    const first = await analyzeCellFaces(['/a.png'], { cache, analyze });
    const second = await analyzeCellFaces(['/a.png'], { cache, analyze });

    expect(calls).toBe(1);
    expect(first.entries[0]!.cached).toBe(false);
    expect(second.entries[0]!.cached).toBe(true);
    expect(second.entries[0]!.faces).toHaveLength(2);
  });

  it('失败结果**不入缓存**：下一次会真的重新请求（服务恢复后能拿到结果）', async () => {
    const cache = new Map();
    let calls = 0;
    const analyze = async (): Promise<AnalyzeFacesResponse> => {
      calls += 1;
      return calls === 1
        ? { ok: false, summary: '人脸分析服务不可用' }
        : okFaces(1);
    };

    const failed = await analyzeCellFaces(['/a.png'], { cache, analyze });
    expect(failed.entries[0]!.status).toBe('failed');
    expect(failed.entries[0]!.cached).toBe(false);

    const retried = await analyzeCellFaces(['/a.png'], { cache, analyze });
    expect(calls).toBe(2);
    expect(retried.entries[0]!.status).toBe('analyzed');
    expect(retried.entries[0]!.cached).toBe(false);
  });

  it('缺省用会话缓存；clearConsistencyFaceCache() 之后重新请求', async () => {
    let calls = 0;
    const analyze = async (): Promise<AnalyzeFacesResponse> => {
      calls += 1;
      return okFaces(1);
    };

    await analyzeCellFaces(['/session.png'], { analyze });
    expect(consistencyFaceCacheSize()).toBe(1);
    const cached = await analyzeCellFaces(['/session.png'], { analyze });
    expect(calls).toBe(1);
    expect(cached.entries[0]!.cached).toBe(true);

    clearConsistencyFaceCache();
    expect(consistencyFaceCacheSize()).toBe(0);
    await analyzeCellFaces(['/session.png'], { analyze });
    expect(calls).toBe(2);
  });

  it('cache: false 时完全绕过缓存（每次都请求）', async () => {
    let calls = 0;
    const analyze = async (): Promise<AnalyzeFacesResponse> => {
      calls += 1;
      return okFaces(1);
    };
    await analyzeCellFaces(['/bypass.png'], { cache: false, analyze });
    await analyzeCellFaces(['/bypass.png'], { cache: false, analyze });
    expect(calls).toBe(2);
    expect(consistencyFaceCacheSize()).toBe(0);
  });
});

describe('analyzeCellFaces：失败透传（禁止伪造分析结果）', () => {
  it('接口 ok:false → failed + 原因；cells 里 faces 为 null（**不是**无人脸）', async () => {
    const result = await analyzeCellFaces(['/a.png', '/b.png'], {
      cache: false,
      analyze: async (url) =>
        url === '/a.png' ? { ok: false, summary: '人脸分析服务不可用' } : okFaces(0),
    });

    expect(result.entries[0]!.status).toBe('failed');
    expect(result.entries[0]!.ok).toBe(false);
    expect(result.entries[0]!.reasonZh).toBe('人脸分析服务不可用');
    expect(result.entries[0]!.faces).toEqual([]);
    // 关键：不可用 ≠ 无人脸
    expect(result.cells[0]!.faces).toBeNull();
    expect(result.cells[0]!.unavailableReasonZh).toBe('人脸分析服务不可用');
    // 分析成功且确实无人脸 → 空数组（有效结论）
    expect(result.entries[1]!.status).toBe('no-face');
    expect(result.cells[1]!.faces).toEqual([]);
    expect(result.analyzedCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it('ok:false 时 message 优先、其次 summary；都没有则给出明确兜底原因', async () => {
    const result = await analyzeCellFaces(['/a.png', '/b.png', '/c.png'], {
      cache: false,
      analyze: async (url) => {
        if (url === '/a.png') return { ok: false, message: '额度不足', summary: '被忽略' };
        if (url === '/b.png') return { ok: false };
        return { ok: false, summary: '   ' };
      },
    });
    expect(result.entries[0]!.reasonZh).toBe('额度不足');
    expect(result.entries[1]!.reasonZh).toBe('人脸分析服务返回失败（未给出原因）');
    expect(result.entries[2]!.reasonZh).toBe('人脸分析服务返回失败（未给出原因）');
    expect(result.failedCount).toBe(3);
  });

  it('网络异常 / 返回体异常 → failed 并带上真实原因，绝不静默降级', async () => {
    const result = await analyzeCellFaces(['/boom.png', '/empty.png', '/nofaces.png'], {
      cache: false,
      analyze: async (url) => {
        if (url === '/boom.png') throw new Error('Failed to fetch');
        if (url === '/empty.png') return undefined as unknown as AnalyzeFacesResponse;
        return { ok: true } as AnalyzeFacesResponse;
      },
    });

    expect(result.entries[0]!.status).toBe('failed');
    expect(result.entries[0]!.reasonZh).toBe('人脸分析请求失败：Failed to fetch');
    expect(result.entries[1]!.reasonZh).toBe('人脸分析返回空结果（禁止空成功）');
    expect(result.entries[2]!.reasonZh).toBe('人脸分析结果缺少 faces 数组（不谎称「无人脸」）');
    expect(result.cells.every((cell) => cell.faces === null)).toBe(true);
    expect(result.failedCount).toBe(3);
  });

  it('人脸字段越界 / 脏值被裁剪，不抛异常', async () => {
    const result = await analyzeCellFaces(['/dirty.png'], {
      cache: false,
      analyze: async () => ({
        ok: true,
        faces: [
          { expression: ' Angry ', confidence: 3, description: 42 } as never,
          null as never,
        ],
      }),
    });
    expect(result.entries[0]!.status).toBe('analyzed');
    expect(result.entries[0]!.faces).toEqual([
      { expression: 'angry', confidence: 1, description: '' },
    ]);
  });

  it('全部失败时 buildConsistencyReport 给出 unavailable，不产生「无问题」假报告', async () => {
    const result = await analyzeCellFaces(['/a.png', '/b.png'], {
      cache: false,
      analyze: async () => ({ ok: false, summary: '人脸分析服务不可用' }),
    });
    const report = buildConsistencyReport(result.cells, { skippedCount: result.skippedCount });
    expect(report.issues).toEqual([]);
    expect(report.checkedCount).toBe(0);
    expect(report.unavailable).toContain('没有可用的人脸分析结果');
    expect(report.summaryZh).not.toContain('错误 0');
  });
});

describe('analyzeCellFaces：取消', () => {
  it('调用前已取消 → 全部落 cancelled，接口一次都不请求', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const result = await analyzeCellFaces(['/a.png', '/b.png'], {
      cache: false,
      signal: controller.signal,
      analyze: async () => {
        calls += 1;
        return okFaces(1);
      },
    });

    expect(calls).toBe(0);
    expect(result.entries.map((entry) => entry.status)).toEqual(['cancelled', 'cancelled']);
    expect(result.entries[0]!.reasonZh).toBe('已取消：该格未做分析');
    expect(result.cancelled).toBe(true);
    expect(result.cancelledCount).toBe(2);
    expect(result.cells.every((cell) => cell.faces === null)).toBe(true);
  });

  it('在途取消：已启动的格跑完并记账，未启动的格不被启动', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const result = await analyzeCellFaces(['/a.png', '/b.png', '/c.png'], {
      cache: false,
      limit: 1,
      signal: controller.signal,
      analyze: async (url) => {
        calls.push(url);
        controller.abort();
        await flush();
        return okFaces(1);
      },
    });

    expect(calls).toEqual(['/a.png']);
    expect(result.entries[0]!.status).toBe('analyzed');
    expect(result.entries[1]!.status).toBe('cancelled');
    expect(result.entries[2]!.status).toBe('cancelled');
    expect(result.cancelled).toBe(true);
    expect(result.cancelledCount).toBe(2);
    expect(result.analyzedCount).toBe(1);
  });
});
