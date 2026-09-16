/**
 * 会话验收脚本单测（`scripts/nx9-session-acceptance.mjs`）。
 *
 * 硬约束（刻意为之）：
 * 1. **不 import `@nx9/shared`（barrel）**：barrel 引用了 8 个不存在的 `data/*` 模块，整体不可解析；
 *    本文件用**相对路径直取脚本源码**，与 barrel 缺陷解耦。
 * 2. 只测**纯函数**：解析、期望 vs 实测判定、阻塞传播、汇总裁决、JSON 组装、文本渲染。
 *    进程/文件系统那层（`runAcceptance` / `spawnCapture`）不在单测范围内（它需要真跑 pnpm/vitest）。
 * 3. 断言「今天恰好 8 个缺失模块」这类**会过期的事实**一律不写在这里 —— 那类钉子归
 *    `missing-modules-doctor.test.ts`；本文件只钉**不随恢复变化的契约**。
 *
 * 说明：脚本是 `.mjs`（无类型声明），此处按运行时契约调用；类型由断言兜底。
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-ignore —— .mjs 脚本无 .d.ts，按运行时契约调用
import * as acceptance from '../../../../../scripts/nx9-session-acceptance.mjs';
// @ts-ignore —— 同上
import * as doctor from '../../../../../scripts/nx9-missing-modules-doctor.mjs';

const {
  ACCEPTANCE_SCHEMA_VERSION,
  STAGE_SPECS,
  STAGE_STATUS,
  VERDICT,
  VERDICT_EXIT_CODES,
  SESSION_TEST_MANIFEST,
  STAGE_STATUS_LABELS,
  buildCommandLine,
  buildNextSteps,
  buildSummaryZh,
  compareFailureSets,
  countStageStatuses,
  decideVerdict,
  evaluateAcceptance,
  evaluateDoctorStage,
  evaluateFullTestsStage,
  evaluateNewTestsStage,
  evaluateSelfcheckStage,
  evaluateSharedBuildStage,
  evaluateStage,
  evaluateTypecheckStage,
  extractErrorSignatures,
  formatAcceptanceReport,
  globToRegExp,
  isSessionTestPath,
  matchVitestInclude,
  normalizeErrorSignature,
  normalizePathList,
  parseCliArgs,
  planNewTestsRun,
  reclassifyForcedRun,
  parseSelfcheckReport,
  parseTscDiagnostics,
  parseVitestJsonReport,
  parseVitestSummary,
  quoteArgIfNeeded,
  resolveSessionTestInventory,
  skipStageResult,
  stageByIndex,
  stripAnsi,
  toStableReport,
  USAGE_TEXT,
} = acceptance;

// ───────────────────────────── 夹具 ─────────────────────────────

const ROOT = 'C:/repo';

/** 一条进程结果。 */
function run(overrides: Record<string, unknown> = {}) {
  return {
    label: 'run',
    command: 'cmd',
    spawned: true,
    exitCode: 0,
    error: null,
    durationMs: 1,
    stdout: '',
    stderr: '',
    jsonReport: null,
    ...overrides,
  };
}

/** 一个 vitest JSON 报告里的测试文件条目。 */
function vitestFile(
  rel: string,
  status: 'passed' | 'failed',
  { failedCount = status === 'failed' ? 1 : 0, message = '' } = {},
) {
  const assertions = [];
  for (let i = 0; i < failedCount; i += 1) {
    assertions.push({ status: 'failed', title: `case ${i}`, ancestorTitles: ['suite'], failureMessages: [message || 'boom'] });
  }
  assertions.push({ status: 'passed', title: 'ok case', ancestorTitles: ['suite'], failureMessages: [] });
  return {
    name: `${ROOT}/${rel}`,
    status,
    assertionResults: assertions,
    message,
  };
}

/** 一个 vitest JSON 报告里「收集期就崩了」的文件条目（0 条断言 + 文件级 message）。 */
function vitestCollectionFailure(rel: string, message: string) {
  return { name: `${ROOT}/${rel}`, status: 'failed', assertionResults: [], message };
}

/** 一个 vitest JSON 报告。 */
function vitestReport(files: unknown[]) {
  return {
    numTotalTestSuites: files.length,
    numTotalTests: files.length,
    success: !files.some((f: any) => f.status === 'failed'),
    startTime: 0,
    testResults: files,
  };
}

/** 一个体检报告（形状照 `analyzeMissingModules` 的返回值）。 */
function doctorReport({ missing = [] as string[], untracked = 0 } = {}) {
  return {
    schemaVersion: 1,
    index: { path: 'packages/shared/src/index.ts', bindingBlockCount: 10, relativeSpecifierCount: 3, missingSpecifiers: [] },
    modules: missing.map((slug: string) => ({
      slug,
      modulePath: `packages/shared/src/data/${slug}.ts`,
      exists: false,
      status: 'missing',
    })),
    untrackedExistingModules: Array.from({ length: untracked }, (_, i) => ({ specifier: `./x${i}`, path: `p/x${i}.ts` })),
    totals: {
      moduleCount: missing.length,
      missingModuleCount: missing.length,
      exportCount: 61,
      valueExportCount: 47,
      typeExportCount: 14,
      consumerCount: 95,
      consumerFileCount: 42,
      untrackedExistingCount: untracked,
    },
    notes: [],
  };
}

/** 一份「全通过」的阶段结果，便于拼装汇总裁决用例。 */
function stageResult(overrides: Record<string, unknown> = {}) {
  return {
    index: 1,
    id: 'doctor',
    title: '前置体检',
    status: STAGE_STATUS.PASS,
    expectationZh: '期望',
    actualZh: '实测',
    exitCode: 0,
    command: 'cmd',
    logPath: '/tmp/log',
    metrics: {},
    notes: [],
    durationMs: 1,
    ...overrides,
  };
}

/** 覆盖全部 6 个阶段的阶段结果（默认全 pass），index 会按 id 对齐 STAGE_SPECS。 */
function allStageResults(statusByIndex: Record<number, string> = {}) {
  return STAGE_SPECS.map((spec: any) =>
    stageResult({
      index: spec.index,
      id: spec.id,
      title: spec.title,
      status: statusByIndex[spec.index] ?? STAGE_STATUS.PASS,
    }),
  );
}

// ───────────────────────────── A. CLI 解析 ─────────────────────────────

describe('验收脚本 · parseCliArgs', () => {
  it('无参数：全部取默认值，无错误', () => {
    const cli = parseCliArgs(['node', 'script']);
    expect(cli).toMatchObject({
      json: false,
      stable: false,
      help: false,
      stage: null,
      baselinePath: null,
      tests: [],
      outDir: null,
      errors: [],
    });
  });

  it('--json / --stable 独立与组合', () => {
    expect(parseCliArgs(['n', 's', '--json']).json).toBe(true);
    expect(parseCliArgs(['n', 's', '--stable', '--json'])).toMatchObject({ json: true, stable: true });
    // --stable 单独使用是错的（它只在去掉 JSON 里的耗时字段时有意义）
    const bad = parseCliArgs(['n', 's', '--stable']);
    expect(bad.errors.length).toBe(1);
    expect(bad.errors[0]).toContain('--stable');
  });

  it('--stage=3 与 --stage 3 都接受；越界 / 非整数 / 缺值报错', () => {
    expect(parseCliArgs(['n', 's', '--stage=3']).stage).toBe(3);
    expect(parseCliArgs(['n', 's', '--stage', '5']).stage).toBe(5);
    expect(parseCliArgs(['n', 's', `--stage=${STAGE_SPECS.length}`]).stage).toBe(STAGE_SPECS.length);
    for (const bad of ['0', '99', 'abc', '2.5']) {
      const cli = parseCliArgs(['n', 's', `--stage=${bad}`]);
      expect(cli.stage, `--stage=${bad} 不应被接受`).toBeNull();
      expect(cli.errors.length).toBeGreaterThan(0);
    }
    const missingValue = parseCliArgs(['n', 's', '--stage']);
    expect(missingValue.errors[0]).toContain('--stage');
  });

  it('--test 可重复；--baseline / --out-dir 取值', () => {
    const cli = parseCliArgs(['n', 's', '--test=a.test.ts', '--test', 'b.test.ts', '--baseline=before.json', '--out-dir', '/tmp/x', '--run-blocked']);
    expect(cli.tests).toEqual(['a.test.ts', 'b.test.ts']);
    expect(cli.baselinePath).toBe('before.json');
    expect(cli.outDir).toBe('/tmp/x');
    expect(cli.runBlocked).toBe(true);
    expect(parseCliArgs(['n', 's']).runBlocked).toBe(false);
  });

  it('--help 与未知选项', () => {
    expect(parseCliArgs(['n', 's', '--help']).help).toBe(true);
    const cli = parseCliArgs(['n', 's', '--nope']);
    expect(cli.unknown).toEqual(['--nope']);
    expect(cli.errors.join()).toContain('--nope');
  });

  it('脏输入不抛异常（null / 非字符串 / 空串）', () => {
    expect(() => parseCliArgs(null)).not.toThrow();
    expect(parseCliArgs(null).errors.length).toBe(0);
    expect(() => parseCliArgs([1, null, '--json', {}])).not.toThrow();
    expect(parseCliArgs([1, null, '--json']).json).toBe(true);
  });

  it('USAGE_TEXT 覆盖全部选项与退出码说明', () => {
    for (const token of ['--json', '--stable', '--stage', '--baseline', '--test', '--out-dir', '--run-blocked', 'BLOCKED']) {
      expect(USAGE_TEXT).toContain(token);
    }
    expect(USAGE_TEXT).toContain(String(VERDICT_EXIT_CODES[VERDICT.PASS]));
  });
});

// ───────────────────────────── B. 路径 / glob 工具 ─────────────────────────────

describe('验收脚本 · 路径与 glob 工具', () => {
  it('globToRegExp 支持双星层级 / 单星 / {a,b} 分组', () => {
    const engine = globToRegExp('src/engine/__tests__/**/*.test.ts');
    expect(engine.test('src/engine/__tests__/a.test.ts')).toBe(true);
    // `**` 在 vitest 语义里是「零到多级目录」，所以嵌套路径同样会被收集
    expect(engine.test('src/engine/__tests__/nested/a.test.ts')).toBe(true);
    expect(engine.test('src/engine/a.test.ts')).toBe(false);
    expect(globToRegExp('src/components/**/__tests__/**/*.test.{ts,tsx}').test('src/components/a/b/__tests__/c.test.tsx')).toBe(true);
    expect(globToRegExp('src/blocks/nx9/__tests__/**/*.test.{ts,tsx}').test('src/blocks/nx9/__tests__/a.test.js')).toBe(false);
    // 点号必须被转义（否则 `a.test.ts` 的正则会放过 `aXtestXts`）
    expect(engine.test('src/engine/__tests__/aXtestXts')).toBe(false);
  });

  it('matchVitestInclude 只认 apps/web 相对路径', () => {
    expect(matchVitestInclude('src/engine/__tests__/x.test.ts')).toBe(true);
    expect(matchVitestInclude('src/engine/__tests__/x.test.tsx')).toBe(true);
    expect(matchVitestInclude('src/engine/x.test.ts')).toBe(false);
    expect(matchVitestInclude('apps/web/src/engine/__tests__/x.test.ts')).toBe(false);
  });

  it('isSessionTestPath 只认 apps/web 下的可收集测试文件（仓库相对路径）', () => {
    expect(isSessionTestPath('apps/web/src/engine/__tests__/a.test.ts')).toBe(true);
    expect(isSessionTestPath('apps/web/src/blocks/craft/__tests__/a.test.tsx')).toBe(true);
    expect(isSessionTestPath('apps\\web\\src\\engine\\__tests__\\a.test.ts')).toBe(true);
    expect(isSessionTestPath('apps/web/src/engine/a.ts')).toBe(false);
    expect(isSessionTestPath('apps/server/test/a.test.ts')).toBe(false);
    // 绝对路径不是「仓库相对路径」，不该被采信（git ls-files 只会给相对路径）
    expect(isSessionTestPath('C:/x/apps/web/src/engine/__tests__/a.test.ts')).toBe(false);
  });

  it('normalizePathList 去重 / 排序 / 过滤空值', () => {
    expect(normalizePathList(['b/x.ts', 'a\\y.ts', 'b/x.ts', '', null, undefined])).toEqual(['a/y.ts', 'b/x.ts']);
    expect(normalizePathList(null)).toEqual([]);
  });

  it('quoteArgIfNeeded / buildCommandLine 只在必要时加引号', () => {
    expect(quoteArgIfNeeded('--json')).toBe('--json');
    expect(quoteArgIfNeeded('C:/a b/c.json')).toBe('"C:/a b/c.json"');
    expect(quoteArgIfNeeded('')).toBe('""');
    expect(buildCommandLine('pnpm', ['--filter', '@nx9/web', 'exec'])).toBe('pnpm --filter @nx9/web exec');
  });

  it('stripAnsi 去掉颜色码，脏输入不抛', () => {
    expect(stripAnsi('\u001b[31mfailed\u001b[0m')).toBe('failed');
    expect(stripAnsi(null)).toBe('');
  });
});

// ───────────────────────────── C. 新增测试清单解析 ─────────────────────────────

describe('验收脚本 · resolveSessionTestInventory', () => {
  const exists = (set: string[]) => (rel: string) => set.includes(rel);

  it('--test 显式指定优先于 git', () => {
    const inv = resolveSessionTestInventory({
      explicit: ['apps/web/src/engine/__tests__/mine.test.ts'],
      untracked: ['apps/web/src/engine/__tests__/from-git.test.ts'],
      fileExists: exists(['apps/web/src/engine/__tests__/mine.test.ts', 'apps/web/src/engine/__tests__/from-git.test.ts']),
    });
    expect(inv.source).toBe('explicit');
    expect(inv.files).toEqual(['apps/web/src/engine/__tests__/mine.test.ts']);
  });

  it('git 结果会过滤掉非测试文件 / 非 apps/web 路径', () => {
    const inv = resolveSessionTestInventory({
      untracked: [
        'apps/web/src/engine/__tests__/a.test.ts',
        'apps/web/src/engine/flow-runner.ts',
        'apps/server/test/b.test.ts',
        'scripts/c.test.mjs',
        'apps/web/src/components/__tests__/d.test.tsx',
      ],
      fileExists: exists(['apps/web/src/engine/__tests__/a.test.ts', 'apps/web/src/components/__tests__/d.test.tsx']),
    });
    expect(inv.source).toBe('git');
    expect(inv.files).toEqual(['apps/web/src/components/__tests__/d.test.tsx', 'apps/web/src/engine/__tests__/a.test.ts']);
  });

  it('git 为空 → 退回内置快照，并显式标注来源与风险', () => {
    const inv = resolveSessionTestInventory({ untracked: [], added: [], fileExists: () => true });
    expect(inv.source).toBe('manifest-fallback');
    expect(inv.files.length).toBeGreaterThan(0);
    expect(inv.files.length).toBeLessThanOrEqual(SESSION_TEST_MANIFEST.length);
    expect(inv.notes.join()).toContain('内置快照');
  });

  it('清单里有、磁盘上没有的文件会被点名（不允许静默缩小范围）', () => {
    const inv = resolveSessionTestInventory({
      untracked: ['apps/web/src/engine/__tests__/gone.test.ts'],
      fileExists: () => false,
    });
    expect(inv.files).toEqual([]);
    expect(inv.missingFromDisk).toEqual(['apps/web/src/engine/__tests__/gone.test.ts']);
    expect(inv.notes.join()).toContain('不存在');
  });

  it('脏输入不抛异常', () => {
    expect(() => resolveSessionTestInventory()).not.toThrow();
    expect(() => resolveSessionTestInventory({ untracked: 'nope', added: 42, fileExists: null } as any)).not.toThrow();
    expect(resolveSessionTestInventory({ untracked: 'nope' } as any).files.length).toBeGreaterThanOrEqual(0);
  });

  it('内置快照本身都是合法的会话测试路径且声明数量与实测一致', () => {
    expect(SESSION_TEST_MANIFEST.length).toBeGreaterThanOrEqual(39);
    expect(new Set(SESSION_TEST_MANIFEST).size).toBe(SESSION_TEST_MANIFEST.length);
    for (const rel of SESSION_TEST_MANIFEST) expect(isSessionTestPath(rel), `${rel} 不是可收集的测试路径`).toBe(true);
  });
});

// ───────────────────────────── D. 输出解析 ─────────────────────────────

describe('验收脚本 · 输出解析', () => {
  it('parseVitestSummary 解析默认 reporter 的摘要两行', () => {
    const text = [
      ' Test Files  84 failed | 81 passed (165)',
      '      Tests  2 failed | 1109 passed | 1 skipped (1112)',
    ].join('\n');
    const summary = parseVitestSummary(text);
    expect(summary.found).toBe(true);
    expect(summary.files).toEqual({ failed: 84, passed: 81, skipped: 0, todo: 0, total: 165 });
    expect(summary.tests).toEqual({ failed: 2, passed: 1109, skipped: 1, todo: 0, total: 1112 });
  });

  it('parseVitestSummary：拿不到摘要时 found=false（不是「0 失败」）', () => {
    expect(parseVitestSummary('nothing here').found).toBe(false);
    expect(parseVitestSummary(null).found).toBe(false);
    expect(parseVitestSummary(undefined).tests).toEqual({ failed: 0, passed: 0, skipped: 0, todo: 0, total: 0 });
  });

  it('parseVitestJsonReport 统计文件 / 用例，并区分「收集期失败」（0 用例）', () => {
    const report = vitestReport([
      vitestFile('apps/web/src/engine/__tests__/a.test.ts', 'passed'),
      vitestCollectionFailure(
        'apps/web/src/engine/__tests__/b.test.ts',
        'Failed to resolve import "./data/emotion-presets" from "../../packages/shared/src/index.ts". Does the file exist?',
      ),
      vitestFile('apps/web/src/engine/__tests__/c.test.ts', 'failed', { failedCount: 2, message: 'AssertionError: expected 1 to be 2' }),
    ]);
    const parsed = parseVitestJsonReport(report);
    expect(parsed.fileCount).toBe(3);
    expect(parsed.failedFileCount).toBe(2);
    expect(parsed.passedFileCount).toBe(1);
    expect(parsed.failedTestCount).toBe(2);
    // 收集期失败的文件有 0 条断言：不能被算成「通过了 0 个用例」
    const collected = parsed.failedFiles.find((f: any) => f.name.endsWith('b.test.ts'));
    expect(collected.assertionCount).toBe(0);
    expect(collected.failedAssertionCount).toBe(0);
    expect(collected.message).toContain('emotion-presets');
  });

  it('parseVitestJsonReport：结构不符 → null（不假装拿到了）', () => {
    expect(parseVitestJsonReport(null)).toBeNull();
    expect(parseVitestJsonReport('x')).toBeNull();
    expect(parseVitestJsonReport({})).toBeNull();
    expect(parseVitestJsonReport({ testResults: 'no' })).toBeNull();
  });

  it('normalizeErrorSignature 收敛成可比较签名', () => {
    expect(
      normalizeErrorSignature(
        'Failed to resolve import "./data/emotion-presets" from "../../packages/shared/src/index.ts". Does the file exist?',
      ),
    ).toBe('Failed to resolve import "./data/emotion-presets"');
    expect(normalizeErrorSignature('AssertionError: expected 1 to be 2\n  at x')).toBe('AssertionError: expected 1 to be 2');
    expect(normalizeErrorSignature('')).toBe('unknown');
    expect(normalizeErrorSignature('x'.repeat(300)).length).toBeLessThanOrEqual(160);
  });

  it('extractErrorSignatures 输出相对仓库根的路径且排序稳定', () => {
    const report = vitestReport([
      vitestFile('apps/web/src/engine/__tests__/z.test.ts', 'failed', { failedCount: 0, message: 'Failed to resolve import "./data/provider-registry"' }),
      vitestFile('apps/web/src/engine/__tests__/a.test.ts', 'failed', { failedCount: 0, message: 'Failed to resolve import "./data/emotion-presets"' }),
      vitestFile('apps/web/src/engine/__tests__/ok.test.ts', 'passed'),
    ]);
    const sigs = extractErrorSignatures(report, { repoRoot: ROOT });
    expect(sigs.map((s: any) => s.file)).toEqual([
      'apps/web/src/engine/__tests__/a.test.ts',
      'apps/web/src/engine/__tests__/z.test.ts',
    ]);
    expect(sigs[0].signature).toBe('Failed to resolve import "./data/emotion-presets"');
    expect(extractErrorSignatures(null)).toEqual([]);
  });

  it('compareFailureSets：同集合 = 零回归；新增 / 变化 / 转绿分别列出', () => {
    const base = [
      { file: 'a.test.ts', signature: 'sig-1' },
      { file: 'b.test.ts', signature: 'sig-2' },
      { file: 'c.test.ts', signature: 'sig-3' },
    ];
    const same = compareFailureSets(base, base);
    expect(same.identical).toBe(true);
    expect(same.zeroNewFailures).toBe(true);

    const diff = compareFailureSets(base, [
      { file: 'a.test.ts', signature: 'sig-1' },
      { file: 'b.test.ts', signature: 'sig-CHANGED' },
      { file: 'd.test.ts', signature: 'sig-4' },
    ]);
    expect(diff.zeroNewFailures).toBe(false);
    expect(diff.added.map((x: any) => x.file)).toEqual(['d.test.ts']);
    expect(diff.changed.map((x: any) => x.file)).toEqual(['b.test.ts']);
    expect(diff.removed.map((x: any) => x.file)).toEqual(['c.test.ts']);
    expect(diff.identical).toBe(false);
  });

  it('compareFailureSets：恢复后「失败全清空」= 转绿，不算新增回归', () => {
    const result = compareFailureSets([{ file: 'a.test.ts', signature: 'sig' }], []);
    expect(result.zeroNewFailures).toBe(true);
    expect(result.identical).toBe(false);
    expect(result.removed.length).toBe(1);
  });

  it('compareFailureSets / parseTscDiagnostics 脏输入不抛', () => {
    expect(() => compareFailureSets(null as any, undefined as any)).not.toThrow();
    expect(compareFailureSets(null as any, null as any).identical).toBe(true);
    const diag = parseTscDiagnostics('\u001b[31msrc/a.ts(1,1): error TS2307: Cannot find module\u001b[0m\nsrc/b.ts(2,2): error TS2307: x');
    expect(diag.errorCount).toBe(2);
    expect(diag.codes).toEqual({ TS2307: 2 });
    expect(parseTscDiagnostics(null).errorCount).toBe(0);
  });

  it('parseTscDiagnostics 记录 tsc 自报总数（用于交叉校验）', () => {
    const diag = parseTscDiagnostics('src/a.ts(1,1): error TS2307: x\n\nFound 1 error in the same file.');
    expect(diag.reportedTotal).toBe(1);
    expect(diag.first).toHaveLength(1);
  });

  it('parseSelfcheckReport：只接受带 counts 的对象', () => {
    expect(parseSelfcheckReport('{"counts":{"error":0}}')?.counts.error).toBe(0);
    expect(parseSelfcheckReport('{}')).toBeNull();
    expect(parseSelfcheckReport('not json')).toBeNull();
    expect(parseSelfcheckReport(null)).toBeNull();
  });
});

// ───────────────────────────── E. 单阶段判定 ─────────────────────────────

describe('验收脚本 · 阶段 1 前置体检', () => {
  it('无缺失 → pass，实测里仍有可核对的事实', () => {
    const result = evaluateDoctorStage({ doctor: doctorReport({ missing: [] }) });
    expect(result.status).toBe(STAGE_STATUS.PASS);
    expect(result.metrics.missingModuleCount).toBe(0);
    expect(result.metrics.missingModules).toEqual([]);
    expect(result.metrics.equivalentStrictExitCode).toBe(0);
  });

  it('有缺失 → blocked（不是 fail），并点名缺哪几个 + 等价 --strict exit 1', () => {
    const result = evaluateDoctorStage({ doctor: doctorReport({ missing: ['emotion-presets', 'provider-registry'], untracked: 3 }) });
    expect(result.status).toBe(STAGE_STATUS.BLOCKED);
    expect(result.metrics.missingModules).toEqual(['emotion-presets', 'provider-registry']);
    expect(result.actualZh).toContain('emotion-presets');
    expect(result.actualZh).toContain('provider-registry');
    expect(result.metrics.equivalentStrictExitCode).toBe(1);
    // 未登记但要 git add 的旁支只是提醒，不升级为阻塞
    expect(result.notes.join()).toContain('旁支');
    expect(result.notes.join()).toContain('未被 git 登记');
  });

  it('报告缺位 / 结构不符 → fail（拿不到 ≠ 通过）', () => {
    expect(evaluateDoctorStage({}).status).toBe(STAGE_STATUS.FAIL);
    expect(evaluateDoctorStage({ doctorError: 'boom' }).status).toBe(STAGE_STATUS.FAIL);
    expect(evaluateDoctorStage({ doctorError: 'boom' }).notes.join()).toContain('boom');
    expect(evaluateDoctorStage({ doctor: { totals: {} } }).status).toBe(STAGE_STATUS.FAIL);
    expect(evaluateDoctorStage({ doctor: { totals: { missingModuleCount: 0 } } }).status).toBe(STAGE_STATUS.FAIL);
    expect(() => evaluateDoctorStage(null)).not.toThrow();
  });
});

describe('验收脚本 · 阶段 2/3 构建与类型检查', () => {
  it('exit 0 → pass', () => {
    expect(evaluateSharedBuildStage({ runs: [run()] }).status).toBe(STAGE_STATUS.PASS);
    expect(
      evaluateTypecheckStage({ runs: [run({ label: 'shared' }), run({ label: 'web' })] }).status,
    ).toBe(STAGE_STATUS.PASS);
  });

  it('任一 run 非 0 → fail，并带出 tsc 诊断与首个错误', () => {
    const result = evaluateTypecheckStage({
      runs: [
        run({ label: '@nx9/shared typecheck', exitCode: 2, stdout: 'src/index.ts(587,7): error TS2307: Cannot find module \'./data/emotion-presets\'.' }),
        run({ label: '@nx9/web typecheck', exitCode: 0 }),
      ],
    });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.tscErrorCount).toBe(1);
    expect(result.metrics.tscErrorCodes).toEqual({ TS2307: 1 });
    expect(result.metrics.exitCodes).toEqual([2, 0]);
    expect(result.actualZh).toContain('@nx9/shared typecheck: exit 2');
    expect(result.notes.join()).toContain('TS2307');
  });

  it('命令没起来 → fail（并说明是 spawn 失败）', () => {
    const result = evaluateSharedBuildStage({ runs: [run({ spawned: false, exitCode: null, error: 'spawn pnpm ENOENT' })] });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.actualZh).toContain('没能启动');
    expect(result.actualZh).toContain('ENOENT');
  });

  it('完全没有 run → fail（拿不到 ≠ 通过）', () => {
    expect(evaluateSharedBuildStage({ runs: [] }).status).toBe(STAGE_STATUS.FAIL);
    expect(evaluateSharedBuildStage({}).status).toBe(STAGE_STATUS.FAIL);
    expect(() => evaluateSharedBuildStage(null)).not.toThrow();
  });
});

describe('验收脚本 · 阶段 4 新增能力测试', () => {
  const inventory = {
    files: ['apps/web/src/engine/__tests__/a.test.ts', 'apps/web/src/engine/__tests__/b.test.ts'],
    declared: ['apps/web/src/engine/__tests__/a.test.ts', 'apps/web/src/engine/__tests__/b.test.ts'],
    missingFromDisk: [],
    source: 'git',
    notes: [],
  };

  it('全部收集且全绿 → pass（期望 = 清单长度，不是写死的数字）', () => {
    const result = evaluateNewTestsStage({
      inventory,
      runs: [run({ jsonReport: vitestReport([vitestFile('apps/web/src/engine/__tests__/a.test.ts', 'passed'), vitestFile('apps/web/src/engine/__tests__/b.test.ts', 'passed')]) })],
    });
    expect(result.status).toBe(STAGE_STATUS.PASS);
    expect(result.metrics.collectedFileCount).toBe(2);
    expect(result.metrics.expectedFileCount).toBe(2);
    expect(result.metrics.inventorySource).toBe('git');
    expect(result.metrics.checks.every((c: any) => c.ok)).toBe(true);
  });

  it('有失败用例 → fail，且 checks 逐条说明实测值', () => {
    const result = evaluateNewTestsStage({
      inventory,
      runs: [run({ exitCode: 1, jsonReport: vitestReport([vitestFile('apps/web/src/engine/__tests__/a.test.ts', 'failed', { failedCount: 1 }), vitestFile('apps/web/src/engine/__tests__/b.test.ts', 'passed')]) })],
    });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.failedTestCount).toBe(1);
    expect(result.metrics.checks.find((c: any) => c.zh.includes('失败用例数')).ok).toBe(false);
  });

  it('收集数 < 清单长度 → fail（有文件被静默漏掉，不能算通过）', () => {
    const result = evaluateNewTestsStage({
      inventory,
      runs: [run({ jsonReport: vitestReport([vitestFile('apps/web/src/engine/__tests__/a.test.ts', 'passed')]) })],
    });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.checks.find((c: any) => c.zh.includes('清单长度')).ok).toBe(false);
  });

  it('清单里有磁盘缺失文件 → fail（清单过期必须暴露）', () => {
    const result = evaluateNewTestsStage({
      // 部分过期：还剩 1 个可跑 + 1 个已消失
      inventory: {
        ...inventory,
        files: ['apps/web/src/engine/__tests__/a.test.ts'],
        missingFromDisk: ['apps/web/src/engine/__tests__/gone.test.ts'],
        notes: ['清单里有 1 个文件在磁盘上不存在'],
      },
      runs: [run({ jsonReport: vitestReport([vitestFile('apps/web/src/engine/__tests__/a.test.ts', 'passed')]) })],
    });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.checks.some((c: any) => !c.ok && c.zh.includes('不存在'))).toBe(true);
    expect(result.notes.join()).toContain('gone.test.ts');
  });

  it('清单为空 → 判 fail 且不启动 vitest（否则不传文件路径会退化成跑全量）', () => {
    const empty = { files: [], declared: ['apps/web/src/engine/__tests__/gone.test.ts'], missingFromDisk: [], source: 'explicit', notes: [] };
    expect(planNewTestsRun(empty)).toMatchObject({ run: false });
    expect(planNewTestsRun(empty).reasonZh).toContain('跑全量');
    const result = evaluateNewTestsStage({ inventory: empty, runs: [] });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.ran).toBe(false);
    expect(result.actualZh).toContain('不启动 vitest');
    // 有文件时才跑；脏输入一律判「不跑」
    expect(planNewTestsRun({ files: ['a.test.ts'] })).toMatchObject({ run: true });
    expect(planNewTestsRun(null)).toMatchObject({ run: false });
    expect(planNewTestsRun({ files: 'nope' })).toMatchObject({ run: false });
    expect(() => planNewTestsRun(undefined)).not.toThrow();
  });

  it('没有 vitest 报告也没有文本摘要 → fail（拿不到 ≠ 通过）', () => {
    expect(evaluateNewTestsStage({ inventory, runs: [run({ exitCode: 1 })] }).status).toBe(STAGE_STATUS.FAIL);
    expect(evaluateNewTestsStage({ inventory, runs: [run({ exitCode: 1 })] }).actualZh).toContain('拿不到失败数');
  });

  it('JSON 说 0 失败但 exit≠0 → fail 并指出不一致（防止收集期失败被漏掉）', () => {
    const report = vitestReport([vitestFile('apps/web/src/engine/__tests__/a.test.ts', 'passed'), vitestFile('apps/web/src/engine/__tests__/b.test.ts', 'passed')]);
    const result = evaluateNewTestsStage({ inventory, runs: [run({ exitCode: 1, jsonReport: report })] });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.checks.some((c: any) => !c.ok && c.zh.includes('不一致'))).toBe(true);
    expect(result.notes.join()).toContain('收集期失败');
  });
});

describe('验收脚本 · 阶段 5 全量测试', () => {
  it('失败文件数 = 0 → pass', () => {
    const result = evaluateFullTestsStage({
      repoRoot: ROOT,
      runs: [run({ jsonReport: vitestReport([vitestFile('apps/web/src/engine/__tests__/a.test.ts', 'passed')]) })],
    });
    expect(result.status).toBe(STAGE_STATUS.PASS);
    expect(result.metrics.failedFileCount).toBe(0);
  });

  it('有失败文件 → fail，并抽出错误签名 + 最常见签名的摘要', () => {
    const barrelError = 'Failed to resolve import "./data/emotion-presets" from "../../packages/shared/src/index.ts". Does the file exist?';
    const result = evaluateFullTestsStage({
      repoRoot: ROOT,
      runs: [
        run({
          exitCode: 1,
          jsonReport: vitestReport([
            vitestFile('apps/web/src/engine/__tests__/a.test.ts', 'failed', { failedCount: 0, message: barrelError }),
            vitestFile('apps/web/src/engine/__tests__/b.test.ts', 'failed', { failedCount: 0, message: barrelError }),
            vitestFile('apps/web/src/engine/__tests__/c.test.ts', 'passed'),
          ]),
        }),
      ],
    });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.failedFileCount).toBe(2);
    expect(result.metrics.failedFileSignatures).toHaveLength(2);
    expect(result.metrics.failedFileSignatures[0].signature).toBe('Failed to resolve import "./data/emotion-presets"');
    expect(result.notes.join()).toContain('最常见的失败签名（2 个文件）');
  });

  it('文本摘要兜底：JSON 缺失时用 stdout 摘要计数', () => {
    const result = evaluateFullTestsStage({
      runs: [run({ exitCode: 1, stdout: ' Test Files  2 failed | 1 passed (3)\n      Tests  1 failed | 9 passed (10)' })],
    });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.failedFileCount).toBe(2);
    expect(result.metrics.textSummary.files.total).toBe(3);
  });

  it('两者都拿不到 → fail', () => {
    const result = evaluateFullTestsStage({ runs: [run({ exitCode: 1 })] });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.failedFileCount).toBeUndefined();
  });
});

describe('验收脚本 · 阶段 6 能力自检', () => {
  const report = { counts: { kinds: 107, catalogKinds: 22, templates: 33, checks: 8, ok: 5, warn: 3, error: 0 }, complete: true, checks: [{ id: 'a', severity: 'warn' }, { id: 'b', severity: 'warn' }, { id: 'c', severity: 'ok' }] };

  it('error 0 且 complete → pass，warn 如实报出但不算失败', () => {
    const result = evaluateSelfcheckStage({ selfcheck: report, runs: [run()] });
    expect(result.status).toBe(STAGE_STATUS.PASS);
    expect(result.metrics.errorCount).toBe(0);
    expect(result.metrics.warnCount).toBe(3);
    expect(result.metrics.warnChecks).toEqual(['a', 'b']);
    expect(result.notes.join()).toContain('warn 3');
  });

  it('error > 0 → fail，并列出 error 检查项', () => {
    const bad = { counts: { ...report.counts, error: 2, ok: 3 }, complete: false, checks: [{ id: 'x', severity: 'error' }, { id: 'y', severity: 'error' }] };
    const result = evaluateSelfcheckStage({ selfcheck: bad, runs: [run({ exitCode: 1 })] });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.errorChecks).toEqual(['x', 'y']);
    expect(result.notes.join()).toContain('complete !== true');
  });

  it('报告缺失 → fail（并说明探针与期望路径），不是 skip', () => {
    const result = evaluateSelfcheckStage({ runs: [run({ exitCode: 0 })] });
    expect(result.status).toBe(STAGE_STATUS.FAIL);
    expect(result.metrics.reportFound).toBe(false);
    expect(result.notes.join()).toContain('NX9_SELFCHECK_OUT');
    expect(() => evaluateSelfcheckStage(null)).not.toThrow();
  });
});

// ───────────────────────────── F. 阻塞传播与阶段编排 ─────────────────────────────

describe('验收脚本 · 阶段编排与阻塞传播', () => {
  it('阶段清单：6 个阶段、index 连续、只有 doctor 不带 barrel 依赖的判定点在 1', () => {
    expect(STAGE_SPECS.map((s: any) => s.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(STAGE_SPECS.map((s: any) => s.id)).toEqual([
      'doctor',
      'shared-build',
      'typecheck',
      'new-capability-tests',
      'full-tests',
      'capability-selfcheck',
    ]);
    expect(STAGE_SPECS[0].dependsOnBarrel).toBe(false);
    const barrelDependent = STAGE_SPECS.filter((s: any) => s.dependsOnBarrel).map((s: any) => s.id);
    // 依赖 barrel 的只有「构建 / 类型检查 / 全量测试」三个
    expect(barrelDependent).toEqual(['shared-build', 'typecheck', 'full-tests']);
    expect(stageByIndex(4)?.id).toBe('new-capability-tests');
    expect(stageByIndex(99)).toBeNull();
    // 每个阶段都写明了期望
    for (const spec of STAGE_SPECS) expect(spec.expectationZh.length).toBeGreaterThan(0);
  });

  it('上游 blocked → 依赖 barrel 的阶段标 skip-blocked，且不调用它的判定函数', () => {
    const blocked = { stageId: 'doctor', detailZh: '缺失模块 8 个' };
    let called = 0;
    const spec = {
      ...stageByIndex(2),
      evaluate: () => {
        called += 1;
        return { status: STAGE_STATUS.PASS, actualZh: '实跑通过', metrics: {}, notes: [] };
      },
    };
    const result = evaluateStage(spec, { runs: [run()] }, { blocked });
    expect(result.status).toBe(STAGE_STATUS.SKIP_BLOCKED);
    expect(called).toBe(0);
    expect(result.actualZh).toContain('前置阻塞（doctor）');
    expect(result.actualZh).toContain('缺失模块 8 个');
  });

  it('不依赖 barrel 的阶段（4 / 6）在阻塞下照样实跑', () => {
    const blocked = { stageId: 'doctor', detailZh: 'x' };
    const result = evaluateStage(
      stageByIndex(4),
      {
        inventory: {
          files: ['apps/web/src/engine/__tests__/a.test.ts'],
          declared: ['apps/web/src/engine/__tests__/a.test.ts'],
          missingFromDisk: [],
          source: 'git',
          notes: [],
        },
        runs: [run({ jsonReport: vitestReport([vitestFile('apps/web/src/engine/__tests__/a.test.ts', 'passed')]) })],
      },
      { blocked },
    );
    expect(result.status).toBe(STAGE_STATUS.PASS);
  });

  it('--stage 截断的阶段标 skipped', () => {
    const result = skipStageResult(stageByIndex(5));
    expect(result.status).toBe(STAGE_STATUS.SKIPPED);
    expect(result.actualZh).toContain('截断');
  });

  it('--run-blocked：被强制执行的阶段即使失败也只归类为 blocked（实测数据不掩盖）', () => {
    const failed = { status: STAGE_STATUS.FAIL, actualZh: '文件 165（失败 84）', metrics: { failedFileCount: 84 }, notes: [] };
    const forced = reclassifyForcedRun(failed, { stageId: 'doctor', detailZh: '缺失模块 8 个' });
    expect(forced.status).toBe(STAGE_STATUS.BLOCKED);
    expect(forced.metrics.failedFileCount).toBe(84);
    expect(forced.actualZh).toBe('文件 165（失败 84）');
    expect(forced.notes.join()).toContain('--run-blocked');
    // 竟然通过了 → 保持 pass（这是有价值的新信息，不该被吞掉）
    expect(reclassifyForcedRun({ status: STAGE_STATUS.PASS, actualZh: 'ok', metrics: {}, notes: [] }, { stageId: 'doctor' }).status).toBe(
      STAGE_STATUS.PASS,
    );
    // 没有阻塞时原样返回
    expect(reclassifyForcedRun(failed, null)).toBe(failed);
    expect(() => reclassifyForcedRun(null, { stageId: 'doctor' })).not.toThrow();
  });

  it('decideVerdict：FAIL > BLOCKED > PASS', () => {
    expect(decideVerdict(allStageResults())).toBe(VERDICT.PASS);
    expect(decideVerdict(allStageResults({ 3: STAGE_STATUS.FAIL }))).toBe(VERDICT.FAIL);
    expect(decideVerdict(allStageResults({ 1: STAGE_STATUS.BLOCKED }))).toBe(VERDICT.BLOCKED);
    expect(decideVerdict(allStageResults({ 1: STAGE_STATUS.BLOCKED, 5: STAGE_STATUS.SKIP_BLOCKED }))).toBe(VERDICT.BLOCKED);
    expect(decideVerdict(allStageResults({ 5: STAGE_STATUS.SKIP_BLOCKED, 4: STAGE_STATUS.FAIL }))).toBe(VERDICT.FAIL);
    expect(decideVerdict(allStageResults({ 6: STAGE_STATUS.SKIPPED }))).toBe(VERDICT.PASS);
    expect(decideVerdict([])).toBe(VERDICT.PASS);
    expect(() => decideVerdict(null as any)).not.toThrow();
  });

  it('countStageStatuses 与 STAGE_STATUS_LABELS 覆盖全部状态', () => {
    const counts = countStageStatuses(allStageResults({ 1: STAGE_STATUS.BLOCKED, 2: STAGE_STATUS.SKIP_BLOCKED, 3: STAGE_STATUS.FAIL, 4: STAGE_STATUS.SKIPPED }));
    expect(counts).toEqual({ pass: 2, fail: 1, blocked: 1, 'skip-blocked': 1, skipped: 1, total: 6 });
    for (const status of Object.values(STAGE_STATUS)) {
      expect(STAGE_STATUS_LABELS[status as string], `${status} 缺中文标签`).toBeTruthy();
    }
  });
});

// ───────────────────────────── G. 汇总裁决与报告 ─────────────────────────────

describe('验收脚本 · evaluateAcceptance 汇总裁决', () => {
  it('全 pass → PASS / exit 0 / complete', () => {
    const report = evaluateAcceptance(allStageResults(), { repoRoot: ROOT, totalStageCount: 6 });
    expect(report.verdict).toBe(VERDICT.PASS);
    expect(report.exitCode).toBe(0);
    expect(report.complete).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.nextSteps.join()).toContain('无需操作');
    expect(report.stageCount).toBe(6);
    expect(report.expectedStageCount).toBe(6);
  });

  it('doctor blocked → BLOCKED / exit 2，阻塞项点名模块，下一步指向恢复文档', () => {
    const stages = allStageResults({ 1: STAGE_STATUS.BLOCKED, 2: STAGE_STATUS.SKIP_BLOCKED, 3: STAGE_STATUS.SKIP_BLOCKED, 5: STAGE_STATUS.SKIP_BLOCKED }).map((s: any) =>
      s.index === 1
        ? { ...s, metrics: { missingModuleCount: 2, missingModules: ['emotion-presets', 'camera-presets'], missingModulePaths: ['packages/shared/src/data/emotion-presets.ts', 'packages/shared/src/data/camera-presets.ts'] }, actualZh: '缺失模块 2 / 2：emotion-presets, camera-presets' }
        : s,
    );
    const report = evaluateAcceptance(stages, { repoRoot: ROOT, totalStageCount: 6 });
    expect(report.verdict).toBe(VERDICT.BLOCKED);
    expect(report.exitCode).toBe(VERDICT_EXIT_CODES[VERDICT.BLOCKED]);
    expect(report.blockers).toHaveLength(1);
    expect(report.blockers[0]).toMatchObject({ stageId: 'doctor', kind: 'missing-modules', missingModuleCount: 2 });
    expect(report.blockers[0].missingModules).toEqual(['emotion-presets', 'camera-presets']);
    expect(report.summaryZh).toContain('BLOCKED');
    expect(report.nextSteps.join()).toContain('docs/NX9-MISSING-MODULES-RESTORE.md');
    expect(report.nextSteps.join()).toContain('emotion-presets');
    expect(report.nextSteps.join()).toContain('--strict');
  });

  it('任一阶段 fail → FAIL / exit 1，下一步点名该阶段与日志路径', () => {
    const stages = allStageResults({ 5: STAGE_STATUS.FAIL }).map((s: any) =>
      s.index === 5 ? { ...s, actualZh: '文件 165（失败 84）；exit 1', logPath: '/tmp/full-tests.log' } : s,
    );
    const report = evaluateAcceptance(stages, { repoRoot: ROOT, totalStageCount: 6 });
    expect(report.verdict).toBe(VERDICT.FAIL);
    expect(report.exitCode).toBe(1);
    expect(report.nextSteps.join()).toContain('阶段 5');
    expect(report.nextSteps.join()).toContain('/tmp/full-tests.log');
  });

  it('--stage 截断：complete=false、truncatedAt 有值，且结论说明「只对已跑阶段成立」', () => {
    const stages = STAGE_SPECS.map((spec: any) =>
      stageResult({
        index: spec.index,
        id: spec.id,
        title: spec.title,
        status: spec.index <= 3 ? STAGE_STATUS.PASS : STAGE_STATUS.SKIPPED,
      }),
    );
    const report = evaluateAcceptance(stages, { repoRoot: ROOT, truncatedAt: 3, totalStageCount: 6 });
    expect(report.complete).toBe(false);
    expect(report.truncatedAt).toBe(3);
    expect(report.verdict).toBe(VERDICT.PASS);
    expect(report.nextSteps.join()).toContain('截断');
    expect(formatAcceptanceReport(report)).toContain('截断运行');
  });

  it('带 --baseline 时附上失败集对照（零回归判定）', () => {
    const sigs = [{ file: 'apps/web/src/engine/__tests__/a.test.ts', signature: 'sig-1' }];
    const stages = allStageResults({ 5: STAGE_STATUS.FAIL }).map((s: any) =>
      s.index === 5 ? { ...s, metrics: { failedFileSignatures: sigs } } : s,
    );
    const report = evaluateAcceptance(stages, { repoRoot: ROOT, baseline: sigs, baselinePath: 'before.json', totalStageCount: 6 });
    expect(report.regression.baselineCount).toBe(1);
    expect(report.regression.currentCount).toBe(1);
    expect(report.regression.identical).toBe(true);
    expect(report.regression.zeroNewFailures).toBe(true);
    expect(formatAcceptanceReport(report)).toContain('失败集对照');
  });

  it('不带 --baseline 时没有 regression 字段（不假装做过对照）', () => {
    const report = evaluateAcceptance(allStageResults(), { repoRoot: ROOT, totalStageCount: 6 });
    expect(report.regression).toBeUndefined();
    expect(report.regressionNoteZh).toBeUndefined();
  });

  it('给了 --baseline 但第 5 阶段没跑 → 不输出对照，改为写明「不做零回归结论」', () => {
    const stages = allStageResults({ 5: STAGE_STATUS.SKIP_BLOCKED });
    const report = evaluateAcceptance(stages, {
      repoRoot: ROOT,
      baseline: [{ file: 'apps/web/src/engine/__tests__/a.test.ts', signature: 'sig' }],
      baselinePath: 'before.json',
      totalStageCount: 6,
    });
    // 关键：不能把「拿不到当前失败集」当成「失败全部转绿」
    expect(report.regression).toBeUndefined();
    expect(report.regressionNoteZh).toContain('跳过失败集对照');
    expect(formatAcceptanceReport(report)).toContain('跳过失败集对照');
  });

  it('JSON 结构稳定：同一输入两次结果逐字节相同；--stable 去掉耗时/时间戳', () => {
    const build = () => evaluateAcceptance(allStageResults({ 4: STAGE_STATUS.FAIL }), { repoRoot: ROOT, generatedAt: '2026-09-16T00:00:00.000Z', totalStageCount: 6, outDir: '/tmp/o' });
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
    const stable = toStableReport(build());
    expect(stable.generatedAt).toBeUndefined();
    expect(stable.stable).toBe(true);
    for (const stage of stable.stages) expect('durationMs' in stage).toBe(false);
    expect(stable.verdict).toBe(VERDICT.FAIL);
  });

  it('JSON 只含可序列化的普通值（除 undefined 外 JSON.stringify 无信息损失）', () => {
    const report = evaluateAcceptance(allStageResults(), { repoRoot: ROOT, totalStageCount: 6 });
    const roundTrip = JSON.parse(JSON.stringify(report));
    expect(Object.keys(roundTrip)).toEqual(Object.keys(report));
    expect(roundTrip.schemaVersion).toBe(ACCEPTANCE_SCHEMA_VERSION);
    expect(roundTrip.tool).toBe('scripts/nx9-session-acceptance.mjs');
  });

  it('脏输入不抛异常（null / 空数组 / 缺字段）', () => {
    expect(() => evaluateAcceptance(null as any)).not.toThrow();
    expect(evaluateAcceptance(null as any).verdict).toBe(VERDICT.PASS);
    expect(evaluateAcceptance([null, undefined, {}, { status: 'weird' }] as any).stageCount).toBe(4);
    expect(() => buildSummaryZh({ verdict: VERDICT.PASS, counts: countStageStatuses(null), blockers: [] })).not.toThrow();
    expect(() => buildNextSteps({ verdict: VERDICT.FAIL, verdictCounts: countStageStatuses([]), blockers: [], stageResults: null })).not.toThrow();
  });
});

describe('验收脚本 · 文本渲染', () => {
  it('逐阶段打印期望 / 实测 / 日志，并含结论与下一步', () => {
    const stages = allStageResults({ 1: STAGE_STATUS.BLOCKED, 2: STAGE_STATUS.SKIP_BLOCKED }).map((s: any) =>
      s.index === 1
        ? { ...s, metrics: { missingModules: ['emotion-presets'], missingModulePaths: ['packages/shared/src/data/emotion-presets.ts'] } }
        : s,
    );
    const text = formatAcceptanceReport(evaluateAcceptance(stages, { repoRoot: ROOT, totalStageCount: 6 }));
    expect(text).toContain('NX9 会话验收报告');
    expect(text).toContain('BLOCKED');
    expect(text).toContain('期望:');
    expect(text).toContain('实测:');
    expect(text).toContain('日志:');
    expect(text).toContain('[阻塞]');
    expect(text).toContain('emotion-presets');
    expect(text).toContain('packages/shared/src/data/emotion-presets.ts');
    expect(text).toContain('── 下一步 ──');
  });

  it('脏输入不抛异常', () => {
    expect(() => formatAcceptanceReport(null)).not.toThrow();
    expect(formatAcceptanceReport({})).toContain('NX9 会话验收报告');
    expect(() => formatAcceptanceReport({ stages: [null, 'x'], blockers: [null], nextSteps: null })).not.toThrow();
  });
});

// ───────────────────────────── H. 真实仓库冒烟（不随恢复变化的契约） ─────────────────────────────

describe('验收脚本 · 真实仓库冒烟', () => {
  const realDoctor = doctor.runDoctor({});

  it('阶段 1 的实测事实与体检工具报告逐项自洽（恢复前 blocked / 恢复后 pass 都成立）', () => {
    const result = evaluateDoctorStage({ doctor: realDoctor });
    const expectedSlugs = (realDoctor.modules ?? []).map((m: any) => m.slug).sort();
    expect(result.metrics.missingModuleCount).toBe(realDoctor.totals.missingModuleCount);
    expect(result.metrics.missingModules).toEqual(expectedSlugs);
    expect(result.metrics.missingModulePaths).toHaveLength(expectedSlugs.length);
    // 恢复前：blocked 且点名；恢复后：pass 且清单为空 —— 两种状态都必须自洽
    if (realDoctor.totals.missingModuleCount > 0) {
      expect(result.status).toBe(STAGE_STATUS.BLOCKED);
      expect(result.metrics.equivalentStrictExitCode).toBe(1);
      for (const slug of expectedSlugs) expect(result.actualZh).toContain(slug);
    } else {
      expect(result.status).toBe(STAGE_STATUS.PASS);
      expect(result.metrics.equivalentStrictExitCode).toBe(0);
    }
  });

  it('缺失模块全部落在 packages/shared/src/data/ 下（恢复动作的位置是明确的）', () => {
    for (const mod of realDoctor.modules ?? []) {
      expect(String(mod.modulePath)).toMatch(/^packages\/shared\/src\/data\/[a-z0-9-]+\.ts$/);
    }
  });

  it('内置清单里的文件在当前工作树上确实存在（防止清单悄悄过期）', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
    const missing = SESSION_TEST_MANIFEST.filter((rel: string) => !fs.existsSync(path.join(root, rel)));
    expect(missing, `内置清单过期，磁盘上不存在：${missing.join(', ')}`).toEqual([]);
  });
});
