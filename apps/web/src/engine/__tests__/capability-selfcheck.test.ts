/**
 * 能力自检纯函数回归。
 *
 * import 走**相对路径直取 shared 源码**（不走 `@nx9/shared`）：barrel 当前 re-export 了 8 个
 * 不存在的 `data/*` 模块（既有缺陷），任何经 barrel 的 import 在本机都无法解析。
 * 本文件只依赖 `packages/shared/src/utils/capability-selfcheck.ts`（零 import 的纯函数）。
 */
import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_SELFCHECK_CHECKS,
  buildCapabilitySelfcheckReport,
  formatCapabilitySelfcheckReport,
  type CapabilityKindFact,
  type CapabilityWiringFacts,
} from '../../../../../packages/shared/src/utils/capability-selfcheck';

const kindFact = (kind: string, extra: Partial<CapabilityKindFact> = {}): CapabilityKindFact => ({
  kind,
  inCatalog: true,
  label: kind,
  hasLoader: true,
  hasSocketProfile: true,
  hasAttachedWorkspace: true,
  ...extra,
});

/** 一份「接线完全自洽」的输入。 */
function cleanFacts(): CapabilityWiringFacts {
  return {
    kinds: [
      kindFact('multi-grid', {
        sessionTouched: true,
        testFiles: ['apps/web/src/engine/__tests__/multi-grid-plan.test.ts'],
        templateRefs: ['tpl-a'],
      }),
      kindFact('media-pin', { inCatalog: false }),
    ],
    templates: [{ id: 'tpl-a', label: 'A', status: 'ga', kinds: ['multi-grid', 'media-pin'] }],
    sources: [
      { path: 'packages/shared/src/catalog/block-catalog.ts', ok: true },
      { path: '(声明) 本会话能力 → 测试文件映射', ok: true, declaredOnly: true },
    ],
    internalKinds: ['media-pin'],
    collectedAt: '2026-09-15T00:00:00.000Z',
  };
}

function checkOf(facts: CapabilityWiringFacts | null | undefined, id: string) {
  const report = buildCapabilitySelfcheckReport(facts);
  const found = report.checks.find((c) => c.id === id);
  if (!found) throw new Error(`未找到检查项 ${id}`);
  return { report, check: found };
}

describe('能力自检 · 检查项清单', () => {
  it('固定 8 项，顺序稳定（UI 按此顺序渲染）', () => {
    expect(CAPABILITY_SELFCHECK_CHECKS.map((c) => c.id)).toEqual([
      'facts-integrity',
      'catalog-loader-parity',
      'loader-orphan',
      'socket-definition',
      'attached-workspace-entry',
      'template-kind-exists',
      'node-test-coverage',
      'visibility-self-consistency',
    ]);
    const report = buildCapabilitySelfcheckReport(cleanFacts());
    expect(report.checks.map((c) => c.id)).toEqual(CAPABILITY_SELFCHECK_CHECKS.map((c) => c.id));
    expect(report.checks.every((c) => c.label.length > 0 && c.detailZh.length > 0)).toBe(true);
  });
});

describe('能力自检 · 齐全输入', () => {
  it('全部通过：0 错误 0 警告，complete=true，计数准确', () => {
    const report = buildCapabilitySelfcheckReport(cleanFacts());
    expect(report.counts).toEqual({
      kinds: 2,
      catalogKinds: 1,
      templates: 1,
      checks: 8,
      ok: 8,
      warn: 0,
      error: 0,
    });
    expect(report.complete).toBe(true);
    expect(report.summaryZh).toContain('kind 2 个（目录 1）');
    expect(report.summaryZh).toContain('0 错误 / 0 警告 / 8 通过');
    expect(report.collectedAt).toBe('2026-09-15T00:00:00.000Z');
  });

  it('内部 / 别名节点被模板引用不算孤儿', () => {
    const { check } = checkOf(cleanFacts(), 'loader-orphan');
    expect(check.severity).toBe('ok');
    expect(check.evidence.join('\n')).toContain('media-pin');
  });
});

describe('能力自检 · 缺 loader', () => {
  it('可见目录 kind 没有 loader → error，并指名 kind', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('ghost-node', { hasLoader: false })];
    facts.templates = [];
    const { report, check } = checkOf(facts, 'catalog-loader-parity');
    expect(check.severity).toBe('error');
    expect(check.detailZh).toContain('ghost-node');
    expect(check.evidence.join('\n')).toContain('缺 loader：ghost-node');
    expect(report.counts.error).toBeGreaterThanOrEqual(1);
    expect(report.complete).toBe(false); // 模板清单为空 → 结论不完整
  });

  it('已 concealed + deprecated 的 kind 缺 loader → warn（预期）', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('asset-gate', { hasLoader: false, concealed: true, deprecated: true })];
    facts.templates = [];
    const { report, check } = checkOf(facts, 'catalog-loader-parity');
    expect(check.severity).toBe('warn');
    expect(check.detailZh).toContain('concealed');
    expect(report.counts.error).toBe(0);
  });
});

describe('能力自检 · 缺 socket / 缺工作区', () => {
  it('可见 kind 无 socket 定义 → error', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('no-socket', { hasSocketProfile: false })];
    const { check } = checkOf(facts, 'socket-definition');
    expect(check.severity).toBe('error');
    expect(check.detailZh).toContain('no-socket');
  });

  it('已废弃 kind 无 socket 定义 → warn', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('asset-gate', { hasSocketProfile: false, deprecated: true, concealed: true })];
    const { check } = checkOf(facts, 'socket-definition');
    expect(check.severity).toBe('warn');
  });

  it('本会话能力没有跟随工作区条目 → error（能力没有落地面板）', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('multi-grid', { hasAttachedWorkspace: false, sessionTouched: true })];
    const { check } = checkOf(facts, 'attached-workspace-entry');
    expect(check.severity).toBe('error');
    expect(check.detailZh).toContain('本会话新增能力');
  });

  it('存量 kind 没有跟随工作区条目 → warn（可能是纯节点卡）', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('legacy-node', { hasAttachedWorkspace: false })];
    const { check } = checkOf(facts, 'attached-workspace-entry');
    expect(check.severity).toBe('warn');
    expect(check.detailZh).toContain('设计如此');
  });

  it('非目录 kind 保留工作区条目按设计不判定，只进证据', () => {
    const facts = cleanFacts();
    facts.kinds = [
      kindFact('multi-grid'),
      kindFact('motion-story', { inCatalog: false, hasLoader: true, hasAttachedWorkspace: true }),
    ];
    const { check } = checkOf(facts, 'attached-workspace-entry');
    expect(check.severity).toBe('ok');
    expect(check.evidence.join('\n')).toContain('历史数据兼容');
  });
});

describe('能力自检 · 模板引用的 kind', () => {
  it('引用了完全不存在的 kind → error', () => {
    const facts = cleanFacts();
    facts.templates = [{ id: 'tpl-x', kinds: ['multi-grid', 'not-a-kind'] }];
    const { check } = checkOf(facts, 'template-kind-exists');
    expect(check.severity).toBe('error');
    expect(check.detailZh).toContain('not-a-kind');
    expect(check.detailZh).toContain('tpl-x');
  });

  it('引用非目录、非内部的 kind → warn', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('multi-grid'), kindFact('stray', { inCatalog: false, hasLoader: true })];
    facts.templates = [{ id: 'tpl-y', kinds: ['stray'] }];
    const { check } = checkOf(facts, 'template-kind-exists');
    expect(check.severity).toBe('warn');
    expect(check.detailZh).toContain('非目录 kind');
  });

  it('引用已废弃 kind → warn', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('multi-grid'), kindFact('asset-gate', { deprecated: true, concealed: true })];
    facts.templates = [{ id: 'tpl-z', kinds: ['asset-gate'] }];
    const { check } = checkOf(facts, 'template-kind-exists');
    expect(check.severity).toBe('warn');
    expect(check.detailZh).toContain('已废弃');
  });

  it('同一 kind 被多条模板引用：证据含模板数与引用数', () => {
    const facts = cleanFacts();
    facts.templates = [
      { id: 'tpl-1', kinds: ['multi-grid'] },
      { id: 'tpl-2', kinds: ['multi-grid', 'media-pin'] },
    ];
    const { check } = checkOf(facts, 'template-kind-exists');
    expect(check.severity).toBe('ok');
    expect(check.evidence[0]).toContain('2 条');
    expect(check.evidence[0]).toContain('3 处');
  });
});

describe('能力自检 · 测试覆盖', () => {
  it('本会话能力缺测试文件 → warn', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('multi-grid', { sessionTouched: true, testFiles: [] })];
    const { check } = checkOf(facts, 'node-test-coverage');
    expect(check.severity).toBe('warn');
    expect(check.detailZh).toContain('multi-grid');
    expect(check.detailZh).toContain('接线没有回归网');
  });

  it('完全没有标记本会话能力 → warn（未判定，不假装通过）', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('multi-grid')];
    const { check } = checkOf(facts, 'node-test-coverage');
    expect(check.severity).toBe('warn');
    expect(check.detailZh).toContain('未标记');
  });

  it('有测试时把映射写进证据（可核验清单）', () => {
    const { check } = checkOf(cleanFacts(), 'node-test-coverage');
    expect(check.severity).toBe('ok');
    expect(check.evidence.join('\n')).toContain('multi-grid-plan.test.ts');
  });

  it('声明的「本会话能力」不在节点目录里 → error（声明写错 / 节点已下线）', () => {
    const facts = cleanFacts();
    facts.kinds = [
      kindFact('multi-grid', { sessionTouched: true, testFiles: ['a.test.ts'] }),
      kindFact('typo-node', { inCatalog: false, sessionTouched: true, testFiles: ['b.test.ts'] }),
    ];
    const { check } = checkOf(facts, 'node-test-coverage');
    expect(check.severity).toBe('error');
    expect(check.detailZh).toContain('typo-node');
    expect(check.detailZh).toContain('不在节点目录中');
  });
});

describe('能力自检 · 可见性自洽', () => {
  it('deprecated 但未 concealed → warn', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('asset-gate', { deprecated: true, concealed: false })];
    const { check } = checkOf(facts, 'visibility-self-consistency');
    expect(check.severity).toBe('warn');
    expect(check.detailZh).toContain('仍会出现在 Dock');
  });

  it('deprecated 且被模板引用 → warn', () => {
    const facts = cleanFacts();
    facts.kinds = [
      kindFact('asset-gate', { deprecated: true, concealed: true, templateRefs: ['tpl-a'] }),
    ];
    const { check } = checkOf(facts, 'visibility-self-consistency');
    expect(check.severity).toBe('warn');
    expect(check.detailZh).toContain('tpl-a');
  });

  it('非目录 kind 标记 concealed → error（语义不成立）', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('ghost', { inCatalog: false, concealed: true })];
    const { check } = checkOf(facts, 'visibility-self-consistency');
    expect(check.severity).toBe('error');
    expect(check.detailZh).toContain('只对目录项有意义');
  });

  it('本会话新增能力却被隐藏 → warn（用户找不到入口）', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('multi-grid', { sessionTouched: true, concealed: true })];
    const { check } = checkOf(facts, 'visibility-self-consistency');
    expect(check.severity).toBe('warn');
    expect(check.detailZh).toContain('找不到入口');
  });
});

describe('能力自检 · severity 判定边界', () => {
  it('同一检查内 error 压过 warn', () => {
    const facts = cleanFacts();
    facts.kinds = [
      kindFact('visible-no-loader', { hasLoader: false }),
      kindFact('hidden-no-loader', { hasLoader: false, concealed: true, deprecated: true }),
    ];
    const { check } = checkOf(facts, 'catalog-loader-parity');
    expect(check.severity).toBe('error');
    expect(check.detailZh).toContain('visible-no-loader');
  });

  it('warn 不会把 ok 抬成 error', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('multi-grid'), kindFact('stray', { inCatalog: false, hasLoader: true })];
    facts.templates = [{ id: 'tpl-y', kinds: ['stray'] }];
    const { report } = checkOf(facts, 'template-kind-exists');
    expect(report.counts.error).toBe(0);
    expect(report.counts.warn).toBeGreaterThanOrEqual(1);
  });

  it('反向守卫：无问题不得报 warn/error', () => {
    const report = buildCapabilitySelfcheckReport(cleanFacts());
    expect(report.checks.filter((c) => c.severity !== 'ok')).toEqual([]);
  });
});

describe('能力自检 · 空输入', () => {
  const empties: [string, CapabilityWiringFacts | null | undefined][] = [
    ['undefined', undefined],
    ['null', null],
    ['空对象', {}],
    ['空数组', { kinds: [], templates: [], sources: [] }],
  ];

  it.each(empties)('%s：不抛异常、complete=false、任何检查都不得为 ok', (_name, input) => {
    const report = buildCapabilitySelfcheckReport(input);
    expect(report.checks).toHaveLength(8);
    expect(report.complete).toBe(false);
    expect(report.counts.ok).toBe(0);
    expect(report.counts.error + report.counts.warn).toBe(8);
    expect(report.summaryZh).toContain('结论不完整');
    expect(report.counts.kinds).toBe(0);
    expect(report.counts.templates).toBe(0);
  });

  it('空输入的 取数完整性 = error，且其余项说明「未判定」', () => {
    const report = buildCapabilitySelfcheckReport({});
    const integrity = report.checks[0];
    expect(integrity.id).toBe('facts-integrity');
    expect(integrity.severity).toBe('error');
    expect(integrity.detailZh).toContain('未取到任何 kind');
    const loader = report.checks.find((c) => c.id === 'catalog-loader-parity');
    expect(loader?.severity).toBe('warn');
    expect(loader?.detailZh).toContain('未取到目录 kind');
  });
});

describe('能力自检 · 脏输入（不抛异常、如实报问题）', () => {
  it('非对象条目 / 缺 kind / 重复 kind / 错类型字段全部被安全处理', () => {
    const dirty = {
      kinds: [
        null,
        'not-an-object',
        42,
        { kind: '   ' },
        { kind: 'multi-grid', inCatalog: true, hasLoader: 'yes', testFiles: 'nope', templateRefs: [1, null, 'tpl-a'] },
        { kind: 'multi-grid', hasLoader: false },
        {},
      ],
      templates: [null, { id: '' }, { id: 'tpl-a', kinds: 'not-array' }, { id: 'tpl-a', kinds: ['multi-grid'] }],
      sources: [null, { path: '', ok: true }, { path: 'x.ts', ok: 'no' }],
      internalKinds: 'media-pin',
    } as unknown as CapabilityWiringFacts;

    const report = buildCapabilitySelfcheckReport(dirty);
    expect(report.checks).toHaveLength(8);
    // 重复 kind 只保留首次出现（hasLoader 被强转为 boolean）
    expect(report.counts.kinds).toBe(1);
    expect(report.counts.templates).toBe(1);
    const integrity = report.checks[0];
    expect(integrity.severity).toBe('error');
    expect(integrity.detailZh).toContain('重复 kind');
    expect(integrity.detailZh).toContain('缺少可用 kind');
    expect(integrity.detailZh).toContain('缺少 id');
    expect(integrity.detailZh).toContain('数据源读取失败');
    // 单个条目字段错类型不影响其它检查出结论：
    // hasLoader='yes' 被归一为 true → loader 对齐通过
    expect(report.checks.find((c) => c.id === 'catalog-loader-parity')?.severity).toBe('ok');
    // 模板 kinds 不是数组 + 重复 id 被合并 → 没有可判定引用，如实报「未取到」而不是假通过
    const templateCheck = report.checks.find((c) => c.id === 'template-kind-exists');
    expect(templateCheck?.severity).toBe('warn');
    expect(templateCheck?.detailZh).toContain('未取到模板引用');
  });

  it('脏输入也可序列化（JSON 往返无信息损失）', () => {
    const dirty = { kinds: [null, { kind: 'x' }], templates: 'bad', sources: undefined } as unknown as CapabilityWiringFacts;
    const report = buildCapabilitySelfcheckReport(dirty);
    const round = JSON.parse(JSON.stringify(report));
    expect(round).toEqual(report);
  });
});

describe('能力自检 · 确定性', () => {
  it('同一输入两次调用结果逐字段相同（纯函数）', () => {
    const facts = cleanFacts();
    const a = buildCapabilitySelfcheckReport(facts);
    const b = buildCapabilitySelfcheckReport(facts);
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('不修改入参（避免调用方状态被偷改）', () => {
    const facts = cleanFacts();
    const snapshot = JSON.stringify(facts);
    buildCapabilitySelfcheckReport(facts);
    expect(JSON.stringify(facts)).toBe(snapshot);
  });

  it('结果可序列化：结构里只有字符串 / 数字 / 布尔 / 数组 / 普通对象', () => {
    const report = buildCapabilitySelfcheckReport(cleanFacts());
    const walk = (value: unknown, path: string) => {
      if (value === null) return;
      const type = typeof value;
      if (type === 'string' || type === 'number' || type === 'boolean') return;
      if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      expect(type, `${path} 应为普通对象`).toBe('object');
      expect(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null).toBe(true);
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) walk(item, `${path}.${key}`);
    };
    walk(report, 'report');
  });
});

describe('能力自检 · 报告文本化', () => {
  it('摘要 + 每项徽标 + 证据，逐行可读', () => {
    const facts = cleanFacts();
    facts.kinds = [kindFact('ghost', { hasLoader: false })];
    const text = formatCapabilitySelfcheckReport(buildCapabilitySelfcheckReport(facts));
    const lines = text.split('\n');
    expect(lines[0]).toContain('能力自检');
    expect(text).toContain('[错误] 目录 kind ↔ 前端 loader');
    expect(text).toContain('[通过] 取数完整性');
    expect(text).toContain('· 缺 loader：ghost');
    expect(lines.length).toBeGreaterThan(9);
  });
});
