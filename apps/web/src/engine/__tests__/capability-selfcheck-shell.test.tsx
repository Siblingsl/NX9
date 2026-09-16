/**
 * 能力自检 · 取数壳层 + 报告面板回归。
 *
 * 两个层次：
 * A. **真实数据**：用 node:fs 读仓库里那 5 个真实源文件，走与浏览器完全相同的解析与判定路径
 *    （`collectCapabilitySelfcheckReport`），断言当前工作树的接线事实；
 * B. **浏览器取数路径**：`runCapabilitySelfcheck()`（`import.meta.glob ?raw`）必须能取到同样的源码
 *    文本并给出同样的结论 —— 这是 UI 命令实际走的那条路。
 *
 * import 一律相对路径直取源码：barrel（`packages/shared/src/index.ts`）当前 re-export 了 8 个不存在的
 * `data/*` 模块，任何经 `@nx9/shared` 的 import 在本机都会解析失败（既有缺陷）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  CAPABILITY_SOURCE_PATHS,
  INTERNAL_KINDS,
  SESSION_KIND_TEST_FILES,
  buildCapabilityWiringFacts,
  collectCapabilitySelfcheckReport,
  readAttachedWorkspaceKinds,
  readCatalogEntries,
  readLoaderKinds,
  readSocketKinds,
  readTemplates,
  runCapabilitySelfcheck,
  type CapabilityRawSources,
  type CapabilitySourceId,
} from '../capability-selfcheck';
import { CapabilitySelfcheckPanel } from '../stage-deck/chrome/CapabilitySelfcheckPanel';
import { formatCapabilitySelfcheckReport } from '../../../../../packages/shared/src/utils/capability-selfcheck';

const ROOT = resolve(__dirname, '../../../../..');

function readRealSources(): CapabilityRawSources {
  const sources: CapabilityRawSources = {};
  for (const [id, rel] of Object.entries(CAPABILITY_SOURCE_PATHS) as [CapabilitySourceId, string][]) {
    sources[id] = readFileSync(resolve(ROOT, rel), 'utf8');
  }
  return sources;
}

const REAL_SOURCES = readRealSources();
const REAL_REPORT = collectCapabilitySelfcheckReport(REAL_SOURCES, 'test-run');

function checkOf(id: string) {
  const found = REAL_REPORT.checks.find((c) => c.id === id);
  if (!found) throw new Error(`未找到检查项 ${id}`);
  return found;
}

describe('能力自检取数 · 5 个真实源码都能解析出内容', () => {
  it('目录：22 个 kind，且新节点 multi-grid / character-sheet-desk / frame-study 在列', () => {
    const entries = readCatalogEntries(REAL_SOURCES.catalog);
    expect(entries).toHaveLength(22);
    const kinds = entries.map((e) => e.kind);
    expect(kinds).toContain('multi-grid');
    expect(kinds).toContain('character-sheet-desk');
    expect(kinds).toContain('frame-study');
    expect(kinds).toContain('director-3d');
    const gate = entries.find((e) => e.kind === 'asset-gate');
    expect(gate).toMatchObject({ concealed: true, deprecated: true });
  });

  it('前端 loader：解析出全部注册 kind（含内部 media-pin 与别名 dialogue-sheet）', () => {
    const kinds = readLoaderKinds(REAL_SOURCES.loaders);
    expect(kinds.length).toBeGreaterThanOrEqual(20);
    for (const kind of ['multi-grid', 'character-sheet-desk', 'director-3d', 'media-pin', 'dialogue-sheet']) {
      expect(kinds).toContain(kind);
    }
  });

  it('socket：SOCKET_REGISTRY ∪ VERTICAL_SOCKETS 覆盖目录里的可见节点', () => {
    const kinds = new Set(readSocketKinds(REAL_SOURCES.sockets));
    expect(kinds.size).toBeGreaterThan(100);
    for (const kind of ['multi-grid', 'character-sheet-desk', 'director-3d', 'picture-gen']) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  it('跟随工作区：multi-grid / character-sheet-desk 都有条目', () => {
    const kinds = new Set(readAttachedWorkspaceKinds(REAL_SOURCES.attachedWorkspace));
    expect(kinds.size).toBeGreaterThan(60);
    expect(kinds.has('multi-grid')).toBe(true);
    expect(kinds.has('character-sheet-desk')).toBe(true);
  });

  it('模板：33 条，本会话新增的 5 条模板都在，且引用的 kind 可解析', () => {
    const templates = readTemplates(REAL_SOURCES.templates);
    expect(templates).toHaveLength(33);
    const ids = templates.map((t) => t.id);
    for (const id of [
      'tpl-multigrid-multicam',
      'tpl-multigrid-story',
      'tpl-multigrid-frame',
      'tpl-character-sheet-desk',
      'tpl-bgm-beat-camera',
    ]) {
      expect(ids).toContain(id);
    }
    const multicam = templates.find((t) => t.id === 'tpl-multigrid-multicam');
    expect(multicam?.kinds).toContain('multi-grid');
    for (const tpl of templates) {
      expect(Array.isArray(tpl.kinds)).toBe(true);
      expect((tpl.kinds ?? []).length).toBeGreaterThan(0);
    }
  });
});

describe('能力自检报告 · 真实仓库接线结论', () => {
  it('结论完整、零错误：目录 / loader / socket / 工作区 / 模板引用 / 测试全部有数据', () => {
    expect(REAL_REPORT.complete).toBe(true);
    expect(REAL_REPORT.counts.error).toBe(0);
    expect(REAL_REPORT.counts.catalogKinds).toBe(22);
    expect(REAL_REPORT.counts.templates).toBe(33);
    expect(REAL_REPORT.counts.checks).toBe(8);
    expect(REAL_REPORT.collectedAt).toBe('test-run');
  });

  it('取数完整性 / loader 孤儿 / 模板引用 / 测试覆盖 → 通过', () => {
    expect(checkOf('facts-integrity').severity).toBe('ok');
    expect(checkOf('loader-orphan').severity).toBe('ok');
    expect(checkOf('template-kind-exists').severity).toBe('ok');
    expect(checkOf('node-test-coverage').severity).toBe('ok');
  });

  it('目录 loader 对齐 / socket / 工作区 → 只对已废弃的 asset-gate 报 warn；可见性自洽 → 通过', () => {
    const severity = (id: string) => checkOf(id).severity;
    expect(severity('catalog-loader-parity')).toBe('warn');
    expect(severity('socket-definition')).toBe('warn');
    expect(severity('attached-workspace-entry')).toBe('warn');
    // asset-gate 同时是 concealed + deprecated，因此可见性本身是自洽的
    expect(severity('visibility-self-consistency')).toBe('ok');
    for (const id of ['catalog-loader-parity', 'socket-definition', 'attached-workspace-entry']) {
      expect(checkOf(id).detailZh).toContain('asset-gate');
    }
    expect(REAL_REPORT.counts.warn).toBe(3);
    expect(REAL_REPORT.counts.ok).toBe(5);
  });

  it('模板里的 media-pin（内部钉板）不被误报为孤儿 / 未知 kind', () => {
    expect(INTERNAL_KINDS).toContain('media-pin');
    const text = formatCapabilitySelfcheckReport(REAL_REPORT);
    expect(text).not.toContain('未知 kind「media-pin」');
    expect(checkOf('loader-orphan').evidence.join('\n')).toContain('media-pin');
  });

  it('本会话 8 个能力节点都在报告里，且证据列出对应测试文件', () => {
    const touched = Object.keys(SESSION_KIND_TEST_FILES);
    expect(touched).toHaveLength(8);
    const evidence = checkOf('node-test-coverage').evidence.join('\n');
    for (const kind of touched) expect(evidence).toContain(kind);
    expect(evidence).toContain('multi-grid-plan.test.ts');
  });

  it('报告里 kind 总数 ≥ 目录数（socket / 工作区表里的历史 kind 也纳入了事实表）', () => {
    expect(REAL_REPORT.counts.kinds).toBeGreaterThan(REAL_REPORT.counts.catalogKinds);
    expect(checkOf('attached-workspace-entry').evidence.join('\n')).toContain('历史数据兼容');
  });
});

describe('能力自检取数 · 声明式映射可核验', () => {
  it('声明的每个测试文件都真实存在（人工清单不得指向空气）', () => {
    const missing: string[] = [];
    for (const [kind, files] of Object.entries(SESSION_KIND_TEST_FILES)) {
      expect(files.length, `${kind} 未声明任何测试文件`).toBeGreaterThan(0);
      for (const rel of files) {
        try {
          readFileSync(resolve(ROOT, rel), 'utf8');
        } catch {
          missing.push(`${kind} → ${rel}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('声明的 kind 都是真实存在的目录节点（防止映射写错名字而假绿）', () => {
    const catalogKinds = new Set(readCatalogEntries(REAL_SOURCES.catalog).map((e) => e.kind));
    for (const kind of Object.keys(SESSION_KIND_TEST_FILES)) {
      expect(catalogKinds.has(kind), `${kind} 不在节点目录里`).toBe(true);
    }
  });

  it('内部白名单里的 kind 都确实注册了 loader（否则白名单本身就是错的）', () => {
    const loaderKinds = new Set(readLoaderKinds(REAL_SOURCES.loaders));
    for (const kind of INTERNAL_KINDS) {
      expect(loaderKinds.has(kind), `${kind} 没有 loader，不应出现在内部白名单`).toBe(true);
    }
  });
});

describe('能力自检取数 · 缺源 / 脏源', () => {
  it('缺某个源：不抛异常，报告点名该源为 error 且 complete=false', () => {
    const broken = { ...REAL_SOURCES };
    delete (broken as Record<string, unknown>).templates;
    const report = collectCapabilitySelfcheckReport(broken);
    expect(report.complete).toBe(false);
    expect(report.counts.error).toBeGreaterThanOrEqual(1);
    expect(report.checks[0].detailZh).toContain('workflow-templates.ts');
    expect(report.checks.find((c) => c.id === 'template-kind-exists')?.severity).toBe('warn');
  });

  it('源文本损坏（被截断）：不抛异常，把「解析不出条目」当成源失败报出来', () => {
    const report = collectCapabilitySelfcheckReport({ ...REAL_SOURCES, catalog: 'export const X = {' });
    expect(report.counts.catalogKinds).toBe(0);
    expect(report.counts.error).toBeGreaterThanOrEqual(1);
    expect(report.checks[0].detailZh).toContain('未解析出任何条目');
    expect(report.complete).toBe(false);
    expect(report.checks.filter((c) => c.id === 'catalog-loader-parity')[0].severity).toBe('warn');
  });

  it('全空：不抛异常，complete=false，无任何 ok', () => {
    const report = collectCapabilitySelfcheckReport({});
    expect(report.complete).toBe(false);
    expect(report.counts.ok).toBe(0);
    expect(report.counts.error).toBeGreaterThanOrEqual(1);
    // 8 个「本会话能力」声明在没有任何源码时不得自证清白（不在目录中 → error）
    expect(report.checks.filter((c) => c.id === 'node-test-coverage')[0].severity).toBe('error');
  });

  it('buildCapabilityWiringFacts 明确标注「声明式来源」，不冒充读源码', () => {
    const facts = buildCapabilityWiringFacts(REAL_SOURCES, null);
    const declared = (facts.sources ?? []).filter((s) => s.declaredOnly);
    expect(declared).toHaveLength(1);
    expect(declared[0].path).toContain('测试文件映射');
    expect((facts.sources ?? []).filter((s) => !s.declaredOnly && s.ok)).toHaveLength(5);
  });
});

describe('能力自检 · 浏览器取数路径（import.meta.glob ?raw）', () => {
  it('runCapabilitySelfcheck() 取到与 fs 读取一致的结论', async () => {
    const report = await runCapabilitySelfcheck();
    expect(report.counts.error).toBe(0);
    expect(report.complete).toBe(true);
    expect(report.counts.catalogKinds).toBe(REAL_REPORT.counts.catalogKinds);
    expect(report.counts.templates).toBe(REAL_REPORT.counts.templates);
    expect(report.checks.map((c) => `${c.id}:${c.severity}`)).toEqual(
      REAL_REPORT.checks.map((c) => `${c.id}:${c.severity}`),
    );
    expect(report.collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('命令面板入口接线（源码守卫）', () => {
  /**
   * 为什么用源码断言而不是渲染 CommandPalette：命令面板在 import 期解析 `@nx9/shared`
   * （getDockBlocks / listWorkflowTemplates / PLAYBOOK_DEFINITIONS），而该 barrel 当前引用了
   * 8 个不存在的 data/* 模块（既有缺陷），渲染测试在本机必然解析失败。
   * 这里沿用仓库既有做法（见 r2-dormant-wiring-guards.test.ts）：按源码文本断言入口在位。
   */
  it('命令面板有「运行能力自检」命令、能跑壳层、并挂上结果面板', () => {
    const palette = readFileSync(
      resolve(ROOT, 'apps/web/src/engine/stage-deck/chrome/CommandPalette.tsx'),
      'utf8',
    );
    expect(palette).toContain("id: 'run-capability-selfcheck'");
    expect(palette).toContain("label: '运行能力自检'");
    expect(palette).toContain('runCapabilitySelfcheck');
    expect(palette).toContain('setSelfcheckReport(report)');
    expect(palette).toContain('<CapabilitySelfcheckPanel');
    // 只在浏览器可用：无 DOM 时直接返回，不在服务端执行
    expect(palette).toContain("typeof document === 'undefined'");
    // 结果面板不得依赖命令面板的开关状态（命令执行后 onClose，报告要留下）
    expect(palette).toContain('if (!open && !selfcheckReport) return null;');
  });
});

describe('能力自检报告面板', () => {
  it('渲染 8 项检查、严重度与证据（真实报告）', () => {
    render(
      <CapabilitySelfcheckPanel report={REAL_REPORT} onClose={() => {}} onRerun={() => {}} busy={false} />,
    );
    const body = screen.getByTestId('capability-selfcheck-body');
    expect(body).toBeTruthy();
    expect(screen.getByText('能力自检')).toBeTruthy();
    const items = screen.getByTestId('capability-selfcheck-checks').querySelectorAll('li[data-check-id]');
    expect(items).toHaveLength(8);
    const severities = Array.from(items).map((el) => el.getAttribute('data-severity'));
    expect(severities).toEqual(REAL_REPORT.checks.map((c) => c.severity));
    // asset-gate 在 loader / socket / 工作区三项里都被点名（detailZh 或证据行）
    expect(screen.getAllByText(/asset-gate/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/重新运行/)).toBeTruthy();
    expect(screen.getByText(/目录 kind ↔ 前端 loader/)).toBeTruthy();
  });

  it('report=null 时什么都不渲染（不占屏）', () => {
    const { container } = render(
      <CapabilitySelfcheckPanel report={null} onClose={() => {}} />,
    );
    expect(container.querySelector('[data-testid="capability-selfcheck-body"]')).toBeNull();
    expect(screen.queryByText('能力自检')).toBeNull();
  });

  it('不完整报告会显式提示「未取得完整结论」', () => {
    render(
      <CapabilitySelfcheckPanel report={collectCapabilitySelfcheckReport({})} onClose={() => {}} />,
    );
    expect(screen.getByText(/未取得完整结论/)).toBeTruthy();
  });
});
