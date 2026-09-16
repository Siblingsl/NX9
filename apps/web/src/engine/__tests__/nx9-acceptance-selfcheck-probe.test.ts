/**
 * 能力自检 · 验收探针（真实工作树快照）。
 *
 * 用途：验收脚本 `scripts/nx9-session-acceptance.mjs` 的第 6 阶段要拿到「能力自检的 error/warn 计数」。
 * 自检取数壳层（`src/engine/capability-selfcheck.ts`）顶部有 `import.meta.glob`（Vite 专有），
 * node 里直接 import 会抛错，所以由本探针在 Vite/vitest 环境下调用**同一份**壳层与纯函数，
 * 并在设置了 `NX9_SELFCHECK_OUT` 时把报告写成 JSON 交给验收脚本读取。
 *
 * 零副作用保证：未设置 `NX9_SELFCHECK_OUT` 时不写任何文件（常规 `vitest run` 就是这样）。
 *
 * import 一律相对路径直取源码：barrel（`packages/shared/src/index.ts`）当前 re-export 了 8 个不存在的
 * `data/*` 模块，经 `@nx9/shared` 的 import 在本机解析失败（既有缺陷，本会话不改）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_SOURCE_PATHS,
  collectCapabilitySelfcheckReport,
  runCapabilitySelfcheck,
  type CapabilityRawSources,
  type CapabilitySourceId,
} from '../capability-selfcheck';

/** 仓库根：`apps/web/src/engine/__tests__` → 上溯 5 层。 */
const ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

/** 用 node:fs 直读那 5 个真实源文件（与浏览器 glob 取的是同一批文件）。 */
function readRealSources(): CapabilityRawSources {
  const sources: CapabilityRawSources = {};
  for (const [id, rel] of Object.entries(CAPABILITY_SOURCE_PATHS) as [CapabilitySourceId, string][]) {
    sources[id] = readFileSync(resolve(ROOT, rel), 'utf8');
  }
  return sources;
}

/** `collectedAt = null` → 报告里不含时间，可逐字节比对。 */
const REAL_REPORT = collectCapabilitySelfcheckReport(readRealSources(), null);

describe('验收探针 · 能力自检（真实工作树）', () => {
  it('结论完整且 error 计数为 0（验收第 6 阶段的期望）', () => {
    expect(REAL_REPORT.complete).toBe(true);
    expect(REAL_REPORT.counts.error).toBe(0);
    expect(REAL_REPORT.counts.checks).toBeGreaterThan(0);
  });

  it('浏览器取数路径（import.meta.glob）与 node:fs 直读路径结论一致', async () => {
    const viaGlob = await runCapabilitySelfcheck();
    expect(viaGlob.complete).toBe(true);
    expect(viaGlob.counts).toEqual(REAL_REPORT.counts);
  });

  it('同一输入必得同一输出（可把 JSON 当基线 diff）', () => {
    const json = JSON.stringify(REAL_REPORT, null, 2);
    const again = JSON.stringify(collectCapabilitySelfcheckReport(readRealSources(), null), null, 2);
    expect(again).toBe(json);
  });

  it('报告可序列化：只含字符串 / 数字 / 布尔 / 数组 / 普通对象', () => {
    const walk = (value: unknown, path: string) => {
      if (value === null) return;
      const type = typeof value;
      if (type === 'string' || type === 'number' || type === 'boolean') return;
      if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      expect(type, `${path} 应为普通对象`).toBe('object');
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) walk(item, `${path}.${key}`);
    };
    walk(REAL_REPORT, 'report');
  });

  it('设置了 NX9_SELFCHECK_OUT 时把报告写出（验收脚本据此取 error/warn 计数）', () => {
    const out = process.env.NX9_SELFCHECK_OUT;
    if (!out) {
      // 常规全量测试不设该变量 → 本用例退化为「不写文件」的形态检查
      expect(JSON.parse(JSON.stringify(REAL_REPORT)).counts.error).toBe(0);
      return;
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(REAL_REPORT, null, 2)}\n`, 'utf8');
    const roundTrip = JSON.parse(readFileSync(out, 'utf8')) as typeof REAL_REPORT;
    expect(roundTrip.counts).toEqual(REAL_REPORT.counts);
    expect(roundTrip.complete).toBe(true);
  });
});
