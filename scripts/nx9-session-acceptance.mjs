#!/usr/bin/env node
/**
 * NX9 会话验收脚本（一键分阶段验收）
 *
 * 目的：把本会话（22 批产物）的「能不能用」一次性问清楚并留下可复现证据：
 * 前置体检 → shared 构建 → 类型检查 → 新增能力测试 → 全量测试 → 能力自检 → 汇总。
 *
 * 设计约束（刻意为之，勿破坏）：
 * 1. **核心逻辑全是纯函数**（无 fs / 无进程 / 无时间 / 无随机）：解析、期望 vs 实测判定、
 *    阻塞传播、汇总裁决、JSON 组装、文本渲染都可被单测直接调用；本文件底部才是 IO 壳。
 * 2. **不假装通过**：拿不到数据 → `fail` 并写明「拿不到什么」，不是 pass；已知阻塞条件
 *    （barrel 缺失模块）→ `blocked` / `skip-blocked`，绝不静默跳过。
 * 3. **不重复造轮子**：前置体检直接复用 `scripts/nx9-missing-modules-doctor.mjs` 的
 *    `runDoctor()`（同目录，进程内调用，拿到结构化报告而非解析文本）。
 * 4. **不硬编码会过期的事实**：缺失模块清单、失败文件清单、用例数全部运行时取；
 *    新增测试文件清单优先用 git（未跟踪 / 新增），脚本内置清单只作 git 不可用时的兜底，
 *    且兜底清单里「磁盘上不存在」的条目会被点名报错（不允许静默缩小范围）。
 * 5. **不改仓库状态**：只写日志与 JSON 到系统临时目录，不删除任何文件。
 *
 * 用法：
 *   node scripts/nx9-session-acceptance.mjs                    # 人类可读分阶段结论
 *   node scripts/nx9-session-acceptance.mjs --json              # 机器可读（结构稳定）
 *   node scripts/nx9-session-acceptance.mjs --json --stable     # 去掉耗时/时间戳，可逐字节 diff
 *   node scripts/nx9-session-acceptance.mjs --stage=3           # 只跑到第 3 阶段
 *   node scripts/nx9-session-acceptance.mjs --baseline=<json>   # 与上次 --json 报告做失败集对照
 *   node scripts/nx9-session-acceptance.mjs --test=<相对路径>   # 覆盖「新增测试清单」（可重复）
 *   node scripts/nx9-session-acceptance.mjs --out-dir=<目录>    # 日志/中间产物目录
 *
 * 退出码：PASS → 0；FAIL → 1；BLOCKED → 2（用法错误也是 2）。
 *
 * 阶段与依赖（`dependsOnBarrel` = 该阶段结论依赖 `@nx9/shared` 能解析）：
 *   1 doctor              前置体检          false
 *   2 shared-build        shared 构建       true
 *   3 typecheck           类型检查          true
 *   4 new-capability-tests 新增能力测试     false（新增测试走相对路径直取源码，不依赖 barrel）
 *   5 full-tests          全量测试          true
 *   6 capability-selfcheck 能力自检         false（只读源码文本，不 import 模块本体）
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  REPO_ROOT as DOCTOR_REPO_ROOT,
  INDEX_REL_PATH,
  runDoctor,
  toPosix,
} from './nx9-missing-modules-doctor.mjs';

/** 报告结构版本；结构变化时必须递增，单测钉住该值。 */
export const ACCEPTANCE_SCHEMA_VERSION = 1;

/** 仓库根（与体检工具同一口径：本文件位于 <root>/scripts/ 下）。 */
export const REPO_ROOT = DOCTOR_REPO_ROOT;

/** 工具自身相对路径（报告里自述用）。 */
export const TOOL_REL_PATH = 'scripts/nx9-session-acceptance.mjs';

/** 相关文档（下一步指引指向它们，不重复全文）。 */
export const RESTORE_DOC_PATH = 'docs/NX9-MISSING-MODULES-RESTORE.md';
export const ACCEPTANCE_DOC_PATH = 'docs/NX9-SESSION-ACCEPTANCE.md';
export const DOCTOR_TOOL_REL_PATH = 'scripts/nx9-missing-modules-doctor.mjs';

/** web 应用目录（vitest 的 cwd）。 */
export const WEB_APP_DIR = 'apps/web';

/** 能力自检探针测试（验收脚本靠它拿到自检报告）。 */
export const SELFCHECK_PROBE_TEST_REL = 'apps/web/src/engine/__tests__/nx9-acceptance-selfcheck-probe.test.ts';

/** 探针把自检报告写出的环境变量名（未设置时探针零副作用）。 */
export const SELFCHECK_OUT_ENV = 'NX9_SELFCHECK_OUT';

/** 阶段结论。 */
export const STAGE_STATUS = Object.freeze({
  /** 达到期望。 */
  PASS: 'pass',
  /** 未达期望（真实失败，非前置阻塞）。 */
  FAIL: 'fail',
  /** 本阶段自己就是「已知阻塞条件」的举证点（如 barrel 缺模块）。 */
  BLOCKED: 'blocked',
  /** 因上游 blocked 而未运行。 */
  SKIP_BLOCKED: 'skip-blocked',
  /** 因 --stage 截断而未运行。 */
  SKIPPED: 'skipped',
});

/** 总裁决。 */
export const VERDICT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
});

/** 裁决 → 进程退出码。 */
export const VERDICT_EXIT_CODES = Object.freeze({
  [VERDICT.PASS]: 0,
  [VERDICT.FAIL]: 1,
  [VERDICT.BLOCKED]: 2,
});

/** 用法错误退出码（与 BLOCKED 同为 2，但会在 stderr 写明用法）。 */
export const USAGE_EXIT_CODE = 2;

/** 阶段状态 → 中文标签（文本报告用）。 */
export const STAGE_STATUS_LABELS = Object.freeze({
  [STAGE_STATUS.PASS]: '通过',
  [STAGE_STATUS.FAIL]: '未通过',
  [STAGE_STATUS.BLOCKED]: '阻塞',
  [STAGE_STATUS.SKIP_BLOCKED]: '跳过（前置阻塞）',
  [STAGE_STATUS.SKIPPED]: '未运行（截断）',
});

/**
 * vitest include 规则（**快照**：来自 `apps/web/vitest.config.ts` 的 `test.include`）。
 *
 * 只用于「候选测试文件是否会被 vitest 收集」的预筛；匹配基准是 **apps/web 相对路径**。
 * 若 vitest.config.ts 的 include 变了，这里会漏掉新目录的测试文件 —— 表现为阶段 4 清单变短，
 * 属于需要人工同步的事实（脚本不解析 vitest.config.ts，避免引入对配置文件的解析依赖）。
 */
export const VITEST_INCLUDE_PATTERNS = Object.freeze([
  'src/blocks/craft/__tests__/**/*.test.tsx',
  'src/blocks/core/__tests__/**/*.test.tsx',
  'src/blocks/utility/__tests__/**/*.test.{ts,tsx}',
  'src/blocks/nx9/__tests__/**/*.test.{ts,tsx}',
  'src/blocks/shared/__tests__/**/*.test.{ts,tsx}',
  'src/components/**/__tests__/**/*.test.{ts,tsx}',
  'src/engine/__tests__/**/*.test.ts',
  'src/engine/__tests__/**/*.test.tsx',
]);

/**
 * 「本会话新增测试」兜底清单（**只在 git 取不到时使用**）。
 *
 * 来源：交付时点执行 `git status --porcelain` 得到的未跟踪（`??`）测试文件，共 39 个，
 * 外加本次验收工具自带、同样只能在会话内运行的 2 个（验收单测 + 能力自检探针），合计 41 个。
 *
 * 这是**快照**，会过期。首选路径永远是从 git 现取（新仓库/已提交后 git 为空才回退到这里），
 * 且回退时会：① 在报告里标注 `inventorySource: "manifest-fallback"`；
 * ② 逐条校验文件是否存在，缺的条目列进 `missingFromDisk` 并让阶段 4 判 `fail`。
 */
export const SESSION_TEST_MANIFEST = Object.freeze([
  'apps/web/src/blocks/craft/__tests__/CameraMoveTimelineEditor.test.tsx',
  'apps/web/src/engine/__tests__/beat-grid.test.ts',
  'apps/web/src/engine/__tests__/builtin-llm-audio-models.test.ts',
  'apps/web/src/engine/__tests__/builtin-video-models.test.ts',
  'apps/web/src/engine/__tests__/camera-move-library.test.ts',
  'apps/web/src/engine/__tests__/camera-move-parse.test.ts',
  'apps/web/src/engine/__tests__/camera-move-timeline.test.ts',
  'apps/web/src/engine/__tests__/capability-selfcheck-shell.test.tsx',
  'apps/web/src/engine/__tests__/capability-selfcheck.test.ts',
  'apps/web/src/engine/__tests__/character-sheet-block-map.test.ts',
  'apps/web/src/engine/__tests__/character-sheet-closure.test.ts',
  'apps/web/src/engine/__tests__/character-sheet-plan.test.ts',
  'apps/web/src/engine/__tests__/consistency-check.test.ts',
  'apps/web/src/engine/__tests__/consistency-report.test.ts',
  'apps/web/src/engine/__tests__/consistency-wiring.test.ts',
  'apps/web/src/engine/__tests__/digital-human-closure.test.ts',
  'apps/web/src/engine/__tests__/director3d-builtin-assets.test.ts',
  'apps/web/src/engine/__tests__/director3d-camera-move-library-panel.test.tsx',
  'apps/web/src/engine/__tests__/director3d-camera-move-motion.test.ts',
  'apps/web/src/engine/__tests__/director3d-lighting.test.ts',
  'apps/web/src/engine/__tests__/director3d-move-timeline-keys.test.ts',
  'apps/web/src/engine/__tests__/director3d-multi-camera-persist.test.ts',
  'apps/web/src/engine/__tests__/frame-study-block-map.test.ts',
  'apps/web/src/engine/__tests__/frame-study-plan.test.ts',
  'apps/web/src/engine/__tests__/missing-modules-doctor.test.ts',
  'apps/web/src/engine/__tests__/multi-grid-block-map.test.ts',
  'apps/web/src/engine/__tests__/multi-grid-closure.test.ts',
  'apps/web/src/engine/__tests__/multi-grid-concurrency.test.ts',
  'apps/web/src/engine/__tests__/multi-grid-plan.test.ts',
  'apps/web/src/engine/__tests__/multi-grid-to-shots.test.ts',
  'apps/web/src/engine/__tests__/nx9-acceptance-selfcheck-probe.test.ts',
  'apps/web/src/engine/__tests__/nx9-session-acceptance.test.ts',
  'apps/web/src/engine/__tests__/preset-entrypoints.test.ts',
  'apps/web/src/engine/__tests__/r2-dormant-wiring-guards.test.ts',
  'apps/web/src/engine/__tests__/r2-shot-blocking-hint.test.ts',
  'apps/web/src/engine/__tests__/recipe-picker-overlay.test.tsx',
  'apps/web/src/engine/__tests__/run-with-concurrency.test.ts',
  'apps/web/src/engine/__tests__/session-review-probe.test.ts',
  'apps/web/src/engine/__tests__/session-review-probe2.test.ts',
  'apps/web/src/engine/__tests__/workflow-templates-links.test.ts',
  'apps/web/src/engine/__tests__/workflow-templates-new.test.ts',
]);

/** 默认日志/中间产物目录（系统临时目录，脚本不删除）。 */
export const DEFAULT_OUT_DIR = path.join(os.tmpdir(), 'nx9-acceptance');

// ────────────────────────────── 纯函数区：通用 ──────────────────────────────

/** 去掉 ANSI 颜色控制码（vitest / tsc 输出都带）。 */
export function stripAnsi(text) {
  return String(text ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

/** shell 参数转义：含空白或引号时加双引号。 */
export function quoteArgIfNeeded(arg) {
  const s = String(arg ?? '');
  if (s === '') return '""';
  if (!/[\s"']/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

/** 拼命令行（报告展示用；纯字符串，不执行）。 */
export function buildCommandLine(command, args = []) {
  return [command, ...args].map(quoteArgIfNeeded).join(' ');
}

/** 正则元字符转义。 */
function escapeRegExpChar(ch) {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * 迷你 glob → RegExp（只覆盖本仓库 include 里实际出现的写法：
 * 双星层级、单星、以及 `{ts,tsx}` 这种分组）。纯字符串运算，不碰文件系统。
 */
export function globToRegExp(pattern) {
  const src = toPosix(pattern);
  let out = '';
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '*') {
      if (src[i + 1] === '*' && src[i + 2] === '/') {
        out += '(?:[^/]+/)*';
        i += 2;
        continue;
      }
      if (src[i + 1] === '*') {
        out += '.*';
        i += 1;
        continue;
      }
      out += '[^/]*';
      continue;
    }
    if (c === '{') {
      const end = src.indexOf('}', i);
      if (end > i) {
        const alts = src
          .slice(i + 1, end)
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
          .map((a) => a.split('').map(escapeRegExpChar).join(''));
        if (alts.length > 0) {
          out += `(?:${alts.join('|')})`;
          i = end;
          continue;
        }
      }
    }
    out += escapeRegExpChar(c);
  }
  return new RegExp(`^${out}$`);
}

const INCLUDE_REGEXPS = VITEST_INCLUDE_PATTERNS.map(globToRegExp);

/** 该 apps/web 相对路径是否会被 vitest 收集（按 include 快照）。 */
export function matchVitestInclude(webRelPath) {
  const rel = toPosix(webRelPath);
  return INCLUDE_REGEXPS.some((re) => re.test(rel));
}

/** 该仓库相对路径是否是「apps/web 下的可收集测试文件」。 */
export function isSessionTestPath(repoRelPath) {
  const rel = toPosix(repoRelPath);
  const prefix = `${WEB_APP_DIR}/`;
  if (!rel.startsWith(prefix)) return false;
  const webRel = rel.slice(prefix.length);
  if (!/\.test\.(ts|tsx)$/.test(webRel)) return false;
  return matchVitestInclude(webRel);
}

/** 去重 + 归一化 + 排序（清单类入参的统一入口）。 */
export function normalizePathList(list) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const rel = toPosix(item ?? '').trim();
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
  }
  out.sort();
  return out;
}

/**
 * 解析「本会话新增测试清单」（纯函数）。
 *
 * 优先级：`--test=` 显式指定 > git（未跟踪 ∩ 新增）> 内置快照兜底。
 * 返回 `missingFromDisk`（清单里有、磁盘上没有）供阶段 4 判失败 —— **不允许静默缩小范围**。
 */
export function resolveSessionTestInventory(input = {}) {
  const {
    untracked = [],
    added = [],
    manifest = SESSION_TEST_MANIFEST,
    explicit = null,
    fileExists = null,
  } = input ?? {};

  // 没有可用的存在性回调时**不猜**：按声明采信并显式记一条「未校验」备注。
  const existsFn = typeof fileExists === 'function' ? fileExists : null;

  const notes = [];
  const explicitList = normalizePathList(explicit);
  const gitCandidates = normalizePathList([...(Array.isArray(untracked) ? untracked : []), ...(Array.isArray(added) ? added : [])]).filter(
    isSessionTestPath,
  );

  let declared;
  let source;
  if (explicitList.length > 0) {
    declared = explicitList;
    source = 'explicit';
  } else if (gitCandidates.length > 0) {
    declared = gitCandidates;
    source = 'git';
  } else {
    declared = normalizePathList(manifest).filter(isSessionTestPath);
    source = 'manifest-fallback';
    notes.push(
      'git 未给出任何未跟踪/新增测试文件（已提交，或不在 git 工作树里）→ 退回脚本内置快照清单；' +
        '该清单会过期，请用 `--test=<相对路径>` 显式指定以校核。',
    );
  }

  const files = [];
  const missingFromDisk = [];
  for (const rel of declared) {
    if (existsFn === null) {
      files.push(rel);
      continue;
    }
    if (existsFn(rel)) files.push(rel);
    else missingFromDisk.push(rel);
  }
  if (existsFn === null && declared.length > 0) {
    notes.push('未提供 fileExists 回调 → 未校验清单文件是否存在于磁盘（按声明采信），存在性由 vitest 的收集结果兜底。');
  }
  if (missingFromDisk.length > 0) {
    notes.push(`清单里有 ${missingFromDisk.length} 个文件在磁盘上不存在：${missingFromDisk.join(', ')}`);
  }

  return { files, declared, missingFromDisk, source, notes };
}

// ────────────────────────────── 纯函数区：输出解析 ──────────────────────────────

/** 从一行 `N failed | M passed (total)` 里取计数。 */
function parseCountLine(line) {
  const num = (re) => {
    const m = re.exec(line);
    return m ? Number(m[1]) : 0;
  };
  return {
    failed: num(/(\d+)\s+failed/),
    passed: num(/(\d+)\s+passed/),
    skipped: num(/(\d+)\s+skipped/),
    todo: num(/(\d+)\s+todo/),
    total: num(/\((\d+)\)/),
  };
}

/**
 * 解析 vitest 默认 reporter 的文本摘要（`Test Files …` / `Tests …` 两行）。
 * 拿不到 → `found: false`（调用方按「拿不到」处理，不当作 0 失败）。
 */
export function parseVitestSummary(text) {
  const lines = stripAnsi(text).split(/\r?\n/);
  let files = null;
  let tests = null;
  for (const line of lines) {
    if (!files && /^\s*Test Files\s/.test(line)) files = parseCountLine(line);
    else if (!tests && /^\s*Tests\s/.test(line)) tests = parseCountLine(line);
  }
  const empty = { failed: 0, passed: 0, skipped: 0, todo: 0, total: 0 };
  return { files: files ?? empty, tests: tests ?? empty, found: Boolean(files || tests) };
}

/** 解析 tsc / vite 输出里的 `error TSxxxx` 诊断。 */
export function parseTscDiagnostics(text) {
  const clean = stripAnsi(text);
  const codes = {};
  const first = [];
  let errorCount = 0;
  for (const rawLine of clean.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = /\berror (TS\d+)\b/.exec(line);
    if (!m) continue;
    errorCount += 1;
    codes[m[1]] = (codes[m[1]] ?? 0) + 1;
    if (first.length < 5) first.push(line);
  }
  const found = /Found (\d+) error/.exec(clean);
  return {
    errorCount,
    codes,
    first,
    reportedTotal: found ? Number(found[1]) : null,
  };
}

/** 解析 vitest `--reporter=json` 的报告对象 → 结构化计数（拿不到 → null）。 */
export function parseVitestJsonReport(report) {
  if (!report || typeof report !== 'object') return null;
  const testResults = Array.isArray(report.testResults) ? report.testResults : null;
  if (!testResults) return null;

  const files = testResults.map((item) => {
    const assertions = Array.isArray(item?.assertionResults) ? item.assertionResults : [];
    const failedAsserts = assertions.filter((a) => a?.status === 'failed');
    const passedAsserts = assertions.filter((a) => a?.status === 'passed');
    const skippedAsserts = assertions.filter(
      (a) => a?.status === 'skipped' || a?.status === 'pending' || a?.status === 'todo',
    );
    const status = failedAsserts.length > 0 || item?.status === 'failed' ? 'failed' : 'passed';
    return {
      name: toPosix(item?.name ?? ''),
      status,
      assertionCount: assertions.length,
      failedAssertionCount: failedAsserts.length,
      passedAssertionCount: passedAsserts.length,
      skippedAssertionCount: skippedAsserts.length,
      message: stripAnsi(item?.message ?? ''),
      messages: failedAsserts
        .map((a) => stripAnsi((a?.failureMessages ?? []).join('\n')))
        .filter(Boolean),
      titles: failedAsserts.map((a) => [...(a?.ancestorTitles ?? []), a?.title ?? ''].join(' > ')),
    };
  });

  const sum = (key) => files.reduce((acc, f) => acc + f[key], 0);
  const failedFiles = files.filter((f) => f.status === 'failed');
  return {
    fileCount: files.length,
    failedFileCount: failedFiles.length,
    passedFileCount: files.filter((f) => f.status === 'passed').length,
    testCount: sum('assertionCount'),
    failedTestCount: sum('failedAssertionCount'),
    passedTestCount: sum('passedAssertionCount'),
    skippedTestCount: sum('skippedAssertionCount'),
    files,
    failedFiles,
    numTotalTestSuites: typeof report.numTotalTestSuites === 'number' ? report.numTotalTestSuites : null,
  };
}

/** 把一段错误文本收敛成可比较的签名（不含路径/耗时等易变内容）。 */
export function normalizeErrorSignature(text) {
  const clean = stripAnsi(text).trim();
  if (!clean) return 'unknown';
  const resolve = /Failed to resolve import "([^"]+)"/.exec(clean);
  if (resolve) return `Failed to resolve import "${resolve[1]}"`;
  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^(Error|TypeError|ReferenceError|RangeError|SyntaxError|AssertionError|Caused by)\b/.test(line)) {
      return line.length > 160 ? `${line.slice(0, 157)}...` : line;
    }
  }
  const first = lines[0] ?? 'unknown';
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

/**
 * 从 vitest JSON 报告抽取「失败文件 → 错误签名」清单（按路径排序，稳定可 diff）。
 * 用于「恢复前 vs 恢复后」的失败集对照。
 */
export function extractErrorSignatures(report, { repoRoot = '' } = {}) {
  const parsed = parseVitestJsonReport(report);
  if (!parsed) return [];
  const rootPrefix = repoRoot ? `${toPosix(repoRoot).replace(/\/$/, '')}/` : '';
  return parsed.failedFiles
    .map((file) => {
      const rel = rootPrefix && file.name.startsWith(rootPrefix) ? file.name.slice(rootPrefix.length) : file.name;
      const source = file.message || file.messages[0] || '';
      return { file: rel, signature: normalizeErrorSignature(source) };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * 失败集对照（纯函数）：`added` = 新出现的失败，`removed` = 转绿的失败，`changed` = 同文件签名变了。
 * `identical === true` 即「零回归」（新增失败为空）。
 */
export function compareFailureSets(baseline = [], current = []) {
  const toMap = (list) => {
    const map = new Map();
    for (const item of Array.isArray(list) ? list : []) {
      const file = toPosix(item?.file ?? '');
      if (!file) continue;
      map.set(file, String(item?.signature ?? 'unknown'));
    }
    return map;
  };
  const base = toMap(baseline);
  const cur = toMap(current);
  const added = [];
  const changed = [];
  const removed = [];
  for (const [file, signature] of cur) {
    if (!base.has(file)) added.push({ file, signature });
    else if (base.get(file) !== signature) changed.push({ file, from: base.get(file), to: signature });
  }
  for (const [file, signature] of base) {
    if (!cur.has(file)) removed.push({ file, signature });
  }
  const byFile = (a, b) => a.file.localeCompare(b.file);
  added.sort(byFile);
  changed.sort(byFile);
  removed.sort(byFile);
  return {
    identical: added.length === 0 && changed.length === 0 && removed.length === 0,
    zeroNewFailures: added.length === 0 && changed.length === 0,
    baselineCount: base.size,
    currentCount: cur.size,
    added,
    changed,
    removed,
  };
}

/** 解析能力自检报告 JSON 文本（拿不到 → null）。 */
export function parseSelfcheckReport(text) {
  try {
    const parsed = JSON.parse(String(text ?? ''));
    if (parsed && typeof parsed === 'object' && parsed.counts && typeof parsed.counts === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

// ────────────────────────────── 纯函数区：各阶段判定 ──────────────────────────────

/** 取第 1 个 run（单命令阶段）。 */
function firstRun(observation) {
  const runs = Array.isArray(observation?.runs) ? observation.runs : [];
  return runs[0] ?? null;
}

/** 进程结果缺位时的统一失败结论（拿不到 ≠ 通过）。 */
function missingRunResult(runLabel) {
  return {
    status: STAGE_STATUS.FAIL,
    actualZh: `未取到进程结果（${runLabel || '命令'} 没有产生 stdout/exit code）`,
    metrics: { runCount: 0 },
    notes: ['IO 壳未返回任何 run：请检查命令是否可执行、是否被沙箱拦截。'],
  };
}

/**
 * 阶段 1：前置体检。
 * 期望：barrel 引用的相对模块全部存在（`missingModuleCount === 0`）。
 * 实测有缺失 → `blocked`（已知阻塞条件，不是「脚本坏了」），并点名缺哪几个。
 */
export function evaluateDoctorStage(observation) {
  const doctor = observation?.doctor ?? null;
  const totals = doctor?.totals;
  if (!totals || !Number.isFinite(totals.missingModuleCount) || !Array.isArray(doctor?.modules)) {
    return {
      status: STAGE_STATUS.FAIL,
      actualZh: doctor
        ? '体检报告结构不符合预期（缺 totals.missingModuleCount 或 modules 不是数组）→ 拿不到结论'
        : '体检工具未产出报告（读 barrel 失败或工具抛错）',
      metrics: { doctorOk: false },
      notes: observation?.doctorError ? [`体检工具错误：${observation.doctorError}`] : [],
    };
  }
  const modules = Array.isArray(doctor.modules) ? doctor.modules : [];
  const slugs = modules.map((m) => m.slug).sort();
  const paths = modules.map((m) => m.modulePath).filter(Boolean).sort();
  const notes = [];
  if (totals.untrackedExistingCount > 0) {
    notes.push(
      `旁支（非阻塞）：${totals.untrackedExistingCount} 个 barrel 依赖已在磁盘但未被 git 登记 → 新克隆会缺；` +
        `见 ${RESTORE_DOC_PATH} §4。`,
    );
  }
  const actualZh =
    `缺失模块 ${totals.missingModuleCount} / ${totals.moduleCount}` +
    (slugs.length > 0 ? `：${slugs.join(', ')}` : '') +
    `；barrel 相对引用 ${doctor.index?.relativeSpecifierCount ?? 0} 个；` +
    `必需导出 ${totals.exportCount} 个（value ${totals.valueExportCount} / type ${totals.typeExportCount}）；` +
    `消费方 ${totals.consumerCount} 处 / ${totals.consumerFileCount} 个文件`;
  return {
    status: totals.missingModuleCount === 0 ? STAGE_STATUS.PASS : STAGE_STATUS.BLOCKED,
    actualZh,
    metrics: {
      missingModuleCount: totals.missingModuleCount,
      missingModules: slugs,
      missingModulePaths: paths,
      moduleCount: totals.moduleCount,
      exportCount: totals.exportCount,
      consumerCount: totals.consumerCount,
      consumerFileCount: totals.consumerFileCount,
      untrackedExistingCount: totals.untrackedExistingCount,
      /** 等价 `--strict` 退出码（进程内调用，没有真实子进程退出码）。 */
      equivalentStrictExitCode: totals.missingModuleCount > 0 ? 1 : 0,
    },
    notes,
  };
}

/** 聚合若干「期望 exit 0」的命令结果。 */
function evaluateExitZeroRuns(observation, { labelZh }) {
  const runs = Array.isArray(observation?.runs) ? observation.runs : [];
  if (runs.length === 0) return missingRunResult(labelZh);
  const unspawned = runs.filter((r) => r.spawned === false);
  if (unspawned.length > 0) {
    return {
      status: STAGE_STATUS.FAIL,
      actualZh: `命令没能启动：${unspawned.map((r) => `${r.label}（${r.error ?? '未知原因'}）`).join('；')}`,
      metrics: { runCount: runs.length },
      notes: ['spawn 失败通常是命令名不可用 / shell 不可用；请确认 pnpm 在 PATH 中。'],
    };
  }

  const parts = runs.map((run) => {
    const diag = parseTscDiagnostics(`${run.stdout ?? ''}\n${run.stderr ?? ''}`);
    return { run, diag };
  });
  const totalTscErrors = parts.reduce((acc, p) => acc + p.diag.errorCount, 0);
  const codes = {};
  for (const { diag } of parts) {
    for (const [code, count] of Object.entries(diag.codes)) codes[code] = (codes[code] ?? 0) + count;
  }
  const allZero = runs.every((r) => r.exitCode === 0);

  const actualZh = runs
    .map((run) => {
      const diag = parts.find((p) => p.run === run)?.diag;
      const diagZh = diag && diag.errorCount > 0 ? `，tsc 诊断 ${diag.errorCount} 条（${Object.entries(diag.codes).map(([c, n]) => `${c}×${n}`).join(', ')}）` : '';
      return `${run.label}: exit ${run.exitCode === null ? 'null' : run.exitCode}${diagZh}`;
    })
    .join('；');

  const notes = [];
  const firstDiag = parts.map((p) => p.diag.first).find((list) => list.length > 0);
  if (firstDiag) notes.push(`首个诊断：${firstDiag[0]}`);

  return {
    status: allZero ? STAGE_STATUS.PASS : STAGE_STATUS.FAIL,
    actualZh,
    metrics: {
      runCount: runs.length,
      exitCodes: runs.map((r) => r.exitCode),
      tscErrorCount: totalTscErrors,
      tscErrorCodes: codes,
      firstDiagnostics: firstDiag ?? [],
    },
    notes,
  };
}

/** 阶段 2：`pnpm --filter @nx9/shared build`（期望 exit 0）。 */
export function evaluateSharedBuildStage(observation) {
  return evaluateExitZeroRuns(observation, { labelZh: 'shared build' });
}

/** 阶段 3：shared / web 两个 typecheck（期望都 exit 0）。 */
export function evaluateTypecheckStage(observation) {
  return evaluateExitZeroRuns(observation, { labelZh: 'typecheck' });
}

/**
 * 阶段 4 是否值得真跑一次 vitest（纯函数）。
 *
 * 清单为空时**必须拦住**：不传文件路径给 `vitest run` 等于跑全量，既慢又会把
 * 「清单有问题」伪装成「全量测试的结果」。此时直接判 fail 并说明原因。
 */
export function planNewTestsRun(inventory) {
  const files = inventory?.files;
  if (!Array.isArray(files) || files.length === 0) {
    const declared = Array.isArray(inventory?.declared) ? inventory.declared.length : 0;
    const missing = Array.isArray(inventory?.missingFromDisk) ? inventory.missingFromDisk.length : 0;
    return {
      run: false,
      reasonZh: `新增测试清单为空（声明 ${declared} 个 / 磁盘上可运行 0 个 / 缺失 ${missing} 个）→ 不启动 vitest（否则会退化成「跑全量」）`,
    };
  }
  return { run: true, reasonZh: '' };
}

/**
 * 阶段 4：新增能力测试。
 * 期望：清单内文件**全部**被收集（收集数 = 清单长度）且 0 失败用例 / 0 失败文件。
 * 清单来自 git 现取（见 `resolveSessionTestInventory`），不是写死的过期清单。
 */
export function evaluateNewTestsStage(observation) {
  const inventory = observation?.inventory ?? null;
  const plan = planNewTestsRun(inventory);
  if (!plan.run) {
    return {
      status: STAGE_STATUS.FAIL,
      actualZh: plan.reasonZh,
      metrics: {
        inventorySource: inventory?.source ?? null,
        expectedFileCount: Array.isArray(inventory?.files) ? inventory.files.length : null,
        missingFromDisk: inventory?.missingFromDisk ?? [],
        ran: false,
      },
      notes: [...(inventory?.notes ?? []), plan.reasonZh],
    };
  }

  const run = firstRun(observation);
  if (!run) return missingRunResult('vitest（新增能力测试）');
  if (run.spawned === false) {
    return {
      status: STAGE_STATUS.FAIL,
      actualZh: `命令没能启动：${run.error ?? '未知原因'}`,
      metrics: { spawned: false },
      notes: [],
    };
  }
  const expectedFiles = Array.isArray(inventory?.files) ? inventory.files.length : null;
  const parsed = parseVitestJsonReport(run.jsonReport);
  const summary = parseVitestSummary(`${run.stdout ?? ''}\n${run.stderr ?? ''}`);

  if (!parsed && !summary.found) {
    return {
      status: STAGE_STATUS.FAIL,
      actualZh: `exit ${run.exitCode}，但既没有 vitest JSON 报告也没有文本摘要 → 拿不到失败数`,
      metrics: { exitCode: run.exitCode, inventorySource: inventory?.source ?? null },
      notes: ['请检查 vitest 是否真的执行（日志见 logPath）。'],
    };
  }

  const failedFiles = parsed ? parsed.failedFileCount : summary.files.failed;
  const failedTests = parsed ? parsed.failedTestCount : summary.tests.failed;
  const collectedFiles = parsed ? parsed.fileCount : summary.files.total;
  const testCount = parsed ? parsed.testCount : summary.tests.total;

  const notes = [];
  if (inventory?.notes?.length) notes.push(...inventory.notes);
  const checks = [];
  checks.push({ ok: run.exitCode === 0, zh: `exit code = 0（实测 ${run.exitCode}）` });
  checks.push({ ok: failedFiles === 0, zh: `失败文件数 = 0（实测 ${failedFiles}）` });
  checks.push({ ok: failedTests === 0, zh: `失败用例数 = 0（实测 ${failedTests}）` });
  if (expectedFiles !== null) {
    checks.push({
      ok: collectedFiles === expectedFiles,
      zh: `收集到的文件数 = 清单长度 ${expectedFiles}（实测 ${collectedFiles}）`,
    });
  }
  const missingFromDisk = inventory?.missingFromDisk ?? [];
  if (missingFromDisk.length > 0) {
    checks.push({ ok: false, zh: `清单里 ${missingFromDisk.length} 个文件在磁盘上不存在` });
    notes.push(`磁盘缺失：${missingFromDisk.join(', ')}`);
  }
  if (parsed && run.exitCode !== 0 && failedFiles === 0) {
    notes.push(
      'JSON 报告的失败文件数为 0，但进程 exit code ≠ 0：可能有「收集期失败」没进 testResults（例如 root 级错误）。' +
        '请核对日志，不要据 JSON 认定通过。',
    );
    checks.push({ ok: false, zh: 'JSON 报告与 exit code 不一致（见 logPath）' });
  }

  const allOk = checks.every((c) => c.ok);
  return {
    status: allOk ? STAGE_STATUS.PASS : STAGE_STATUS.FAIL,
    actualZh:
      `文件 ${collectedFiles}（清单 ${expectedFiles ?? 'n/a'}，来源 ${inventory?.source ?? 'n/a'}）；` +
      `用例 ${testCount}（失败 ${failedTests}）；失败文件 ${failedFiles}；exit ${run.exitCode}`,
    metrics: {
      inventorySource: inventory?.source ?? null,
      expectedFileCount: expectedFiles,
      collectedFileCount: collectedFiles,
      testCount,
      failedTestCount: failedTests,
      failedFileCount: failedFiles,
      skippedTestCount: parsed ? parsed.skippedTestCount : summary.tests.skipped,
      exitCode: run.exitCode,
      failedFiles: parsed ? parsed.failedFiles.map((f) => f.name) : [],
      textSummary: summary.found ? { files: summary.files, tests: summary.tests } : null,
      checks,
    },
    notes,
  };
}

/**
 * 阶段 5：全量测试（`pnpm --filter @nx9/web exec vitest run`）。
 * 期望：失败文件数 = 0 且失败用例数 = 0（恢复前基线见 `docs/NX9-SESSION-ACCEPTANCE.md`）。
 */
export function evaluateFullTestsStage(observation) {
  const run = firstRun(observation);
  if (!run) return missingRunResult('vitest（全量）');
  if (run.spawned === false) {
    return {
      status: STAGE_STATUS.FAIL,
      actualZh: `命令没能启动：${run.error ?? '未知原因'}`,
      metrics: { spawned: false },
      notes: [],
    };
  }
  const parsed = parseVitestJsonReport(run.jsonReport);
  const summary = parseVitestSummary(`${run.stdout ?? ''}\n${run.stderr ?? ''}`);
  if (!parsed && !summary.found) {
    return {
      status: STAGE_STATUS.FAIL,
      actualZh: `exit ${run.exitCode}，但既没有 vitest JSON 报告也没有文本摘要 → 拿不到失败数`,
      metrics: { exitCode: run.exitCode },
      notes: ['请检查 vitest 是否真的执行（日志见 logPath）。'],
    };
  }
  const failedFiles = parsed ? parsed.failedFileCount : summary.files.failed;
  const failedTests = parsed ? parsed.failedTestCount : summary.tests.failed;
  const testCount = parsed ? parsed.testCount : summary.tests.total;
  const fileCount = parsed ? parsed.fileCount : summary.files.total;
  const signatures = parsed ? extractErrorSignatures(run.jsonReport, { repoRoot: observation?.repoRoot ?? '' }) : [];

  const notes = [];
  if (parsed && run.exitCode !== 0 && failedFiles === 0) {
    notes.push('JSON 报告的失败文件数为 0，但 exit code ≠ 0：可能有没进 testResults 的收集期失败，请核对日志。');
  }
  if (signatures.length > 0) {
    const bySignature = {};
    for (const item of signatures) bySignature[item.signature] = (bySignature[item.signature] ?? 0) + 1;
    const top = Object.entries(bySignature).sort((a, b) => b[1] - a[1])[0];
    if (top) notes.push(`最常见的失败签名（${top[1]} 个文件）：${top[0]}`);
  }

  const ok = run.exitCode === 0 && failedFiles === 0 && failedTests === 0;
  return {
    status: ok ? STAGE_STATUS.PASS : STAGE_STATUS.FAIL,
    actualZh: `文件 ${fileCount}（失败 ${failedFiles}）；用例 ${testCount}（失败 ${failedTests}）；exit ${run.exitCode}`,
    metrics: {
      fileCount,
      failedFileCount: failedFiles,
      passedFileCount: parsed ? parsed.passedFileCount : summary.files.passed,
      testCount,
      failedTestCount: failedTests,
      passedTestCount: parsed ? parsed.passedTestCount : summary.tests.passed,
      skippedTestCount: parsed ? parsed.skippedTestCount : summary.tests.skipped,
      exitCode: run.exitCode,
      failedFileSignatures: signatures,
      textSummary: summary.found ? { files: summary.files, tests: summary.tests } : null,
      checks: [
        { ok: run.exitCode === 0, zh: `exit code = 0（实测 ${run.exitCode}）` },
        { ok: failedFiles === 0, zh: `失败文件数 = 0（实测 ${failedFiles}）` },
        { ok: failedTests === 0, zh: `失败用例数 = 0（实测 ${failedTests}）` },
      ],
    },
    notes,
  };
}

/**
 * 阶段 6：能力自检（`apps/web/src/engine/capability-selfcheck.ts` 的取数壳层）。
 * 期望：`counts.error === 0` 且 `complete === true`；同时报出 warn 计数。
 *
 * 为什么走 vitest 探针：壳层顶部有 `import.meta.glob`（Vite 专有），node 里直接 import 会炸；
 * 探针测试在 Vite 环境下调用**同一份**壳层/纯函数，并通过 `NX9_SELFCHECK_OUT` 把报告写出来。
 */
export function evaluateSelfcheckStage(observation) {
  const run = firstRun(observation);
  const report = observation?.selfcheck ?? null;
  const exitCode = run ? run.exitCode : null;
  if (!report) {
    return {
      status: STAGE_STATUS.FAIL,
      actualZh: `未取到能力自检报告（探针未写出文件；exit ${exitCode}）`,
      metrics: { exitCode, reportFound: false },
      notes: [
        `探针：${SELFCHECK_PROBE_TEST_REL}；期望它把报告写到 $${SELFCHECK_OUT_ENV} 指向的路径。`,
        '报告缺失说明探针没跑起来或被跳过，**不能**据此认为自检通过。',
      ],
    };
  }
  const counts = report.counts;
  const ok = counts.error === 0 && report.complete === true;
  const notes = [];
  if (counts.warn > 0) {
    notes.push(`warn ${counts.warn} 项：属于「已知边界」而非失败，逐项见报告 checks（severity=warn）。`);
  }
  if (report.complete !== true) notes.push('`complete !== true`：本次自检未取得完整结论（缺数据源或事实为空）。');
  return {
    status: ok ? STAGE_STATUS.PASS : STAGE_STATUS.FAIL,
    actualZh:
      `error ${counts.error} / warn ${counts.warn} / ok ${counts.ok}（检查项 ${counts.checks}）；` +
      `kinds ${counts.kinds}（目录 ${counts.catalogKinds}）/ 模板 ${counts.templates}；complete=${report.complete}；exit ${exitCode}`,
    metrics: {
      errorCount: counts.error,
      warnCount: counts.warn,
      okCount: counts.ok,
      checkCount: counts.checks,
      kindCount: counts.kinds,
      catalogKindCount: counts.catalogKinds,
      templateCount: counts.templates,
      complete: report.complete === true,
      exitCode,
      reportFound: true,
      errorChecks: (report.checks ?? []).filter((c) => c?.severity === 'error').map((c) => c.id),
      warnChecks: (report.checks ?? []).filter((c) => c?.severity === 'warn').map((c) => c.id),
    },
    notes,
  };
}

/**
 * 阶段清单（顺序即执行顺序；`index` 从 1 开始，与 `--stage=<n>` 对应）。
 *
 * `dependsOnBarrel: true` 的阶段在上游 blocked 时**不运行**，结论为 `skip-blocked`。
 */
export const STAGE_SPECS = Object.freeze([
  {
    index: 1,
    id: 'doctor',
    title: '前置体检：@nx9/shared barrel 缺失模块',
    dependsOnBarrel: false,
    runner: 'doctor',
    commands: [],
    expectationZh: `barrel（${INDEX_REL_PATH}）引用的相对模块全部存在，缺失模块数 = 0`,
    evaluate: evaluateDoctorStage,
  },
  {
    index: 2,
    id: 'shared-build',
    title: 'shared 构建',
    dependsOnBarrel: true,
    runner: 'spawn',
    commands: [{ label: '@nx9/shared build', command: 'pnpm', args: ['--filter', '@nx9/shared', 'build'], cwd: 'root' }],
    expectationZh: 'pnpm --filter @nx9/shared build → exit code = 0',
    evaluate: evaluateSharedBuildStage,
  },
  {
    index: 3,
    id: 'typecheck',
    title: '类型检查',
    dependsOnBarrel: true,
    runner: 'spawn',
    commands: [
      { label: '@nx9/shared typecheck', command: 'pnpm', args: ['--filter', '@nx9/shared', 'typecheck'], cwd: 'root' },
      { label: '@nx9/web typecheck', command: 'pnpm', args: ['--filter', '@nx9/web', 'typecheck'], cwd: 'root' },
    ],
    expectationZh: 'shared / web 两个 typecheck 都 exit code = 0',
    evaluate: evaluateTypecheckStage,
  },
  {
    index: 4,
    id: 'new-capability-tests',
    title: '新增能力测试',
    dependsOnBarrel: false,
    runner: 'spawn',
    commands: [
      {
        label: 'vitest run（新增能力测试清单）',
        command: 'pnpm',
        args: ['--filter', '@nx9/web', 'exec', 'vitest', 'run', '<inventory>'],
        cwd: 'root',
        dynamic: 'inventory',
      },
    ],
    expectationZh: '清单内新增测试文件全部被收集（收集数 = 清单长度）且失败文件数 = 0、失败用例数 = 0',
    evaluate: evaluateNewTestsStage,
  },
  {
    index: 5,
    id: 'full-tests',
    title: '全量测试',
    dependsOnBarrel: true,
    runner: 'spawn',
    commands: [
      {
        label: 'vitest run（全量）',
        command: 'pnpm',
        args: ['--filter', '@nx9/web', 'exec', 'vitest', 'run'],
        cwd: 'root',
      },
    ],
    expectationZh: 'pnpm --filter @nx9/web exec vitest run → 失败文件数 = 0 且失败用例数 = 0',
    evaluate: evaluateFullTestsStage,
  },
  {
    index: 6,
    id: 'capability-selfcheck',
    title: '能力自检（接线事实）',
    dependsOnBarrel: false,
    runner: 'spawn',
    commands: [
      {
        label: 'vitest run（能力自检探针）',
        command: 'pnpm',
        args: ['--filter', '@nx9/web', 'exec', 'vitest', 'run', `<probe:${SELFCHECK_PROBE_TEST_REL}>`],
        cwd: 'root',
        dynamic: 'probe',
      },
    ],
    expectationZh: '能力自检 counts.error = 0 且 complete = true（warn 计数如实报出，不算失败）',
    evaluate: evaluateSelfcheckStage,
  },
]);

/** 按 index 取阶段。 */
export function stageByIndex(index) {
  return STAGE_SPECS.find((s) => s.index === index) ?? null;
}

/**
 * 单个阶段的判定（纯函数）：先看前置阻塞，再看阶段自己的判定。
 *
 * @param {object} spec 阶段定义（STAGE_SPECS 的条目）
 * @param {object} observation 观测（runs / doctor / inventory / selfcheck）
 * @param {{ blocked?: ({stageId:string, detailZh:string}|null) }} [options]
 */
export function evaluateStage(spec, observation, options = {}) {
  const blocked = options.blocked ?? null;
  if (blocked && spec.dependsOnBarrel) {
    return {
      status: STAGE_STATUS.SKIP_BLOCKED,
      actualZh: `未运行：前置阻塞（${blocked.stageId}）→ ${blocked.detailZh}`,
      metrics: { skippedBecause: blocked.stageId },
      notes: ['该阶段结论依赖 @nx9/shared 可解析；阻塞解除后会实际执行。'],
    };
  }
  const result = spec.evaluate(observation ?? {});
  return {
    status: result.status,
    actualZh: result.actualZh,
    metrics: result.metrics ?? {},
    notes: result.notes ?? [],
  };
}

/** 因 `--stage` 截断而未运行。 */
export function skipStageResult(spec, reason = '本次为 --stage 截断运行') {
  return {
    status: STAGE_STATUS.SKIPPED,
    actualZh: `未运行：${reason}`,
    metrics: {},
    notes: [],
  };
}

/**
 * `--run-blocked` 的归类规则（纯函数）。
 *
 * 强制执行一个「依赖 barrel 且已知被阻塞」的阶段时，它几乎必然失败 —— 但那不是新问题，
 * 所以把「失败」重新归类为 `blocked`（实测数据原样保留在 metrics / actualZh 里，不掩盖）。
 * 若它竟然通过了，则保持 pass（那是有价值的新信息）。
 */
export function reclassifyForcedRun(evaluation, blocked) {
  if (!blocked || evaluation?.status !== STAGE_STATUS.FAIL) return evaluation;
  return {
    ...evaluation,
    status: STAGE_STATUS.BLOCKED,
    notes: [
      ...(evaluation.notes ?? []),
      `本次以 --run-blocked 强制执行；失败与已知阻塞（${blocked.stageId}）同因，故仍归类为 blocked —— 实测数据未被掩盖。`,
    ],
  };
}

// ────────────────────────────── 纯函数区：汇总与渲染 ──────────────────────────────

/** 汇总裁决（纯函数）：FAIL > BLOCKED > PASS。 */
export function decideVerdict(stageResults) {
  const list = Array.isArray(stageResults) ? stageResults : [];
  if (list.some((s) => s?.status === STAGE_STATUS.FAIL)) return VERDICT.FAIL;
  if (list.some((s) => s?.status === STAGE_STATUS.BLOCKED || s?.status === STAGE_STATUS.SKIP_BLOCKED)) {
    return VERDICT.BLOCKED;
  }
  return VERDICT.PASS;
}

/** 计数各状态。 */
export function countStageStatuses(stageResults) {
  const counts = { pass: 0, fail: 0, blocked: 0, 'skip-blocked': 0, skipped: 0, total: 0 };
  for (const stage of Array.isArray(stageResults) ? stageResults : []) {
    const status = stage?.status;
    if (typeof status === 'string' && Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
    counts.total += 1;
  }
  return counts;
}

/** 从 blocked 阶段抽出阻塞项（点名缺哪些模块）。 */
export function collectBlockers(stageResults) {
  const blockers = [];
  for (const stage of Array.isArray(stageResults) ? stageResults : []) {
    if (stage?.status !== STAGE_STATUS.BLOCKED) continue;
    const metrics = stage.metrics ?? {};
    blockers.push({
      stageId: stage.id,
      kind: Array.isArray(metrics.missingModules) ? 'missing-modules' : 'stage-precondition',
      title: stage.title ?? stage.id,
      detailZh: stage.actualZh ?? '',
      missingModuleCount: metrics.missingModuleCount ?? null,
      missingModules: metrics.missingModules ?? [],
      missingModulePaths: metrics.missingModulePaths ?? [],
    });
  }
  return blockers;
}

/** 下一步指引（纯函数）。 */
export function buildNextSteps({ verdict, verdictCounts, blockers, stageResults }) {
  const list = Array.isArray(stageResults) ? stageResults : [];
  if (verdict === VERDICT.FAIL) {
    const failed = list.filter((s) => s?.status === STAGE_STATUS.FAIL);
    const steps = failed.map((s) => `阶段 ${s.index}「${s.title}」未达标：${s.actualZh}（日志：${s.logPath ?? 'n/a'}）`);
    steps.push(`先修上述阶段，再重跑：node ${TOOL_REL_PATH}`);
    return steps;
  }
  if (verdict === VERDICT.BLOCKED) {
    const missing = blockers.flatMap((b) => b.missingModules ?? []);
    const steps = [];
    if (missing.length > 0) {
      steps.push(
        `取回 ${missing.length} 个缺失模块（**不要现写内容**）：${missing.join(', ')} —— 见 ${RESTORE_DOC_PATH} §2 的照单清单与 §3 第 1 步`,
      );
      steps.push(
        `放进 packages/shared/src/data/<同名>.ts（文件名必须与 barrel specifier 一致；不要改 barrel 里既有 import），见 ${RESTORE_DOC_PATH} §3 第 2 步`,
      );
    } else {
      steps.push(`解除阻塞条件后重跑（见 ${RESTORE_DOC_PATH}）`);
    }
    steps.push(
      `验证恢复效果：node ${DOCTOR_TOOL_REL_PATH} --strict（期望 exit 0）→ node ${TOOL_REL_PATH}（期望 PASS / exit 0），完整流程见 ${ACCEPTANCE_DOC_PATH}`,
    );
    return steps;
  }
  if (verdictCounts.skipped > 0) {
    return [
      `本次为 --stage 截断运行，未覆盖 ${verdictCounts.skipped} 个阶段；全量验收请省略 --stage 再跑一次：node ${TOOL_REL_PATH}`,
    ];
  }
  return ['无需操作：全部阶段达到期望。'];
}

/** 生成一句话摘要。 */
export function buildSummaryZh({ verdict, counts, blockers }) {
  const parts = [`通过 ${counts.pass}`];
  if (counts.fail > 0) parts.push(`失败 ${counts.fail}`);
  if (counts.blocked > 0) parts.push(`阻塞 ${counts.blocked}`);
  if (counts['skip-blocked'] > 0) parts.push(`跳过（前置阻塞）${counts['skip-blocked']}`);
  if (counts.skipped > 0) parts.push(`未运行（截断）${counts.skipped}`);
  const head = `${verdict}：共 ${counts.total} 个阶段 —— ${parts.join('、')}`;
  if (blockers.length === 0) return head;
  const detail = blockers
    .map((b) => (b.missingModules?.length ? `${b.missingModules.length} 个缺失模块（${b.missingModules.join(', ')}）` : b.detailZh))
    .join('；');
  return `${head}；阻塞点：${detail}`;
}

/**
 * 汇总裁决 + 组装报告（纯函数，JSON 键顺序固定）。
 *
 * @param {Array} stageResults 阶段结果（已含 index/id/title/status/…）
 * @param {object} [options] { repoRoot, generatedAt, includeTiming, truncatedAt, totalStageCount, baseline, baselinePath, outDir }
 */
export function evaluateAcceptance(stageResults, options = {}) {
  const {
    repoRoot = '',
    generatedAt = null,
    includeTiming = true,
    truncatedAt = null,
    totalStageCount = STAGE_SPECS.length,
    baseline = null,
    baselinePath = null,
    outDir = null,
  } = options ?? {};

  const stages = (Array.isArray(stageResults) ? stageResults : []).map((stage) => ({
    index: stage?.index ?? 0,
    id: stage?.id ?? '',
    title: stage?.title ?? '',
    status: stage?.status ?? STAGE_STATUS.SKIPPED,
    expectationZh: stage?.expectationZh ?? '',
    actualZh: stage?.actualZh ?? '',
    exitCode: stage?.exitCode ?? null,
    command: stage?.command ?? null,
    logPath: stage?.logPath ?? null,
    metrics: stage?.metrics ?? {},
    notes: stage?.notes ?? [],
    ...(includeTiming ? { durationMs: typeof stage?.durationMs === 'number' ? stage.durationMs : null } : {}),
  }));

  const counts = countStageStatuses(stages);
  const verdict = decideVerdict(stages);
  const blockers = collectBlockers(stages);
  const complete = counts.skipped === 0 && truncatedAt === null;
  const nextSteps = buildNextSteps({ verdict, verdictCounts: counts, blockers, stageResults: stages });

  const fullTests = stages.find((s) => s.id === 'full-tests');
  // 只有第 5 阶段**真的跑过**（拿到了失败集）才做对照：否则 `[]` 会被误读成「84 个失败全部转绿」。
  const currentSignatures = Array.isArray(fullTests?.metrics?.failedFileSignatures)
    ? fullTests.metrics.failedFileSignatures
    : null;
  let regression = null;
  let regressionNoteZh = null;
  if (baseline) {
    if (currentSignatures === null) {
      regressionNoteZh =
        '本次第 5 阶段没有产生失败集（未运行 / 被 --stage 截断 / 拿不到 vitest 报告）→ 跳过失败集对照，**不做**「零回归」结论。' +
        '要对照请加 --run-blocked 或先解除阻塞。';
    } else {
      regression = { baselinePath, ...compareFailureSets(baseline, currentSignatures) };
    }
  }

  const report = {
    schemaVersion: ACCEPTANCE_SCHEMA_VERSION,
    tool: TOOL_REL_PATH,
    repoRoot: toPosix(repoRoot),
    verdict,
    exitCode: VERDICT_EXIT_CODES[verdict] ?? 1,
    complete,
    truncatedAt,
    stageCount: counts.total,
    expectedStageCount: totalStageCount,
    counts,
    summaryZh: buildSummaryZh({ verdict, counts, blockers }),
    blockers,
    nextSteps,
    stages,
    ...(includeTiming ? { generatedAt } : {}),
    ...(outDir ? { outDir: toPosix(outDir) } : {}),
    ...(regression ? { regression } : {}),
    ...(regressionNoteZh ? { regressionNoteZh } : {}),
  };
  return report;
}

/** `--stable`：去掉耗时/时间戳，让同一工作树的输出可逐字节 diff。 */
export function toStableReport(report) {
  const clone = JSON.parse(JSON.stringify(report ?? {}));
  delete clone.generatedAt;
  if (Array.isArray(clone.stages)) {
    for (const stage of clone.stages) delete stage.durationMs;
  }
  clone.stable = true;
  return clone;
}

/** 渲染人类可读报告（纯函数：输入报告，输出字符串）。 */
export function formatAcceptanceReport(report) {
  const lines = [];
  const r = report ?? {};
  lines.push('NX9 会话验收报告');
  lines.push(`工具: ${r.tool ?? TOOL_REL_PATH}（schema v${r.schemaVersion ?? ACCEPTANCE_SCHEMA_VERSION}）`);
  lines.push(`仓库: ${r.repoRoot ?? ''}`);
  lines.push(`结论: ${r.verdict}（exit code ${r.exitCode}）${r.complete === false ? '  [截断运行，结论仅对已跑阶段成立]' : ''}`);
  lines.push(`摘要: ${r.summaryZh ?? ''}`);
  lines.push('');
  for (const stage of Array.isArray(r.stages) ? r.stages : []) {
    if (!stage || typeof stage !== 'object') continue;
    const label = STAGE_STATUS_LABELS[stage.status] ?? stage.status;
    lines.push(`── 阶段 ${stage.index}/${r.expectedStageCount ?? '?'} [${label}] ${stage.title} ──`);
    lines.push(`   期望: ${stage.expectationZh}`);
    lines.push(`   实测: ${stage.actualZh}`);
    if (stage.command) lines.push(`   命令: ${stage.command}`);
    if (stage.exitCode !== null && stage.exitCode !== undefined) lines.push(`   进程 exit code: ${stage.exitCode}`);
    if (stage.logPath) lines.push(`   日志: ${stage.logPath}`);
    for (const note of Array.isArray(stage.notes) ? stage.notes : []) lines.push(`   注: ${note}`);
    lines.push('');
  }
  if (Array.isArray(r.blockers) && r.blockers.length > 0) {
    lines.push('── 阻塞项 ──');
    for (const blocker of r.blockers) {
      if (!blocker || typeof blocker !== 'object') continue;
      lines.push(`- [${blocker.stageId}] ${blocker.title}`);
      if (blocker.missingModules?.length) lines.push(`  缺失模块（${blocker.missingModules.length}）: ${blocker.missingModules.join(', ')}`);
      if (blocker.missingModulePaths?.length) {
        for (const p of blocker.missingModulePaths) lines.push(`    - ${p}`);
      }
    }
    lines.push('');
  }
  if (r.regression) {
    lines.push('── 失败集对照（--baseline）──');
    lines.push(
      `基线 ${r.regression.baselinePath ?? ''}: 失败文件 ${r.regression.baselineCount} → 本次 ${r.regression.currentCount}` +
        `；新增失败 ${r.regression.added.length}、签名变化 ${r.regression.changed.length}、转绿 ${r.regression.removed.length}` +
        `；零回归 = ${r.regression.zeroNewFailures ? '是' : '否'}`,
    );
    for (const item of r.regression.added ?? []) lines.push(`   + ${item?.file}  ← ${item?.signature}`);
    for (const item of r.regression.changed ?? []) lines.push(`   ~ ${item?.file}  ← ${item?.from}  ⇒  ${item?.to}`);
    lines.push('');
  }
  if (r.regressionNoteZh) {
    lines.push('── 失败集对照 ──');
    lines.push(`- ${r.regressionNoteZh}`);
    lines.push('');
  }
  lines.push('── 下一步 ──');
  for (const step of Array.isArray(r.nextSteps) ? r.nextSteps : []) lines.push(`- ${step}`);
  return lines.join('\n');
}

// ────────────────────────────── 纯函数区：CLI ──────────────────────────────

/** 本工具的用法文本。 */
export const USAGE_TEXT = [
  `用法: node ${TOOL_REL_PATH} [选项]`,
  '',
  '选项:',
  '  --json                以 JSON 输出（结构稳定；键顺序固定）',
  '  --stable              配合 --json：去掉 generatedAt / durationMs，可逐字节 diff',
  `  --stage=<n>           只跑到第 n 阶段（1..${STAGE_SPECS.length}）；其余阶段标记为未运行`,
  '  --baseline=<文件>     读取上次 --json 报告，与本次「全量测试失败集」对照',
  '  --test=<相对路径>     覆盖「新增测试清单」（可重复；路径相对仓库根）',
  '  --run-blocked         前置阻塞时也强制跑依赖 barrel 的阶段（用于留「恢复前基线」；失败仍归类为 blocked）',
  `  --out-dir=<目录>      日志/中间产物目录（默认 ${DEFAULT_OUT_DIR}）`,
  '  --help                打印本用法',
  '',
  `退出码: PASS → 0；FAIL → 1；BLOCKED → ${VERDICT_EXIT_CODES[VERDICT.BLOCKED]}（用法错误同样 ${USAGE_EXIT_CODE}）`,
].join('\n');

/**
 * 解析命令行（纯函数）。返回 `errors` 非空时调用方应打印用法并以 2 退出。
 */
export function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2).filter((a) => typeof a === 'string') : [];
  const out = {
    json: false,
    stable: false,
    help: false,
    stage: null,
    baselinePath: null,
    tests: [],
    outDir: null,
    runBlocked: false,
    errors: [],
    unknown: [],
  };

  const takeValue = (i, flag) => {
    const inline = args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : null;
    if (inline !== null && inline !== '') return { value: inline, next: i };
    const next = args[i + 1];
    if (typeof next === 'string' && !next.startsWith('--')) return { value: next, next: i + 1 };
    out.errors.push(`${flag} 需要一个取值`);
    return { value: null, next: i };
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--stable') out.stable = true;
    else if (arg === '--run-blocked') out.runBlocked = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--stage' || arg.startsWith('--stage=')) {
      const { value, next } = takeValue(i, '--stage');
      i = next;
      if (value !== null) {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > STAGE_SPECS.length) {
          out.errors.push(`--stage 取值必须是 1..${STAGE_SPECS.length} 的整数（收到 "${value}"）`);
        } else out.stage = n;
      }
    } else if (arg === '--baseline' || arg.startsWith('--baseline=')) {
      const { value, next } = takeValue(i, '--baseline');
      i = next;
      if (value !== null) out.baselinePath = value;
    } else if (arg === '--test' || arg.startsWith('--test=')) {
      const { value, next } = takeValue(i, '--test');
      i = next;
      if (value !== null) out.tests.push(value);
    } else if (arg === '--out-dir' || arg.startsWith('--out-dir=')) {
      const { value, next } = takeValue(i, '--out-dir');
      i = next;
      if (value !== null) out.outDir = value;
    } else if (typeof arg === 'string' && arg.startsWith('--')) {
      out.unknown.push(arg);
    }
  }

  if (out.unknown.length > 0) out.errors.push(`未知选项：${out.unknown.join(', ')}`);
  if (out.stable && !out.json) out.errors.push('--stable 只能与 --json 一起使用');
  return out;
}

// ────────────────────────────── IO 壳 ──────────────────────────────

/** 执行一个命令，收集 stdout/stderr/exit code（不删除任何文件）。 */
export function spawnCapture(command, args, { cwd, env, timeoutMs = 900_000 } = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    env: env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: timeoutMs,
    // Windows 上 pnpm 是 .cmd，必须过 shell；参数用 quoteArgIfNeeded 自行转义。
    shell: true,
    windowsHide: true,
  });
  return {
    spawned: !result.error,
    exitCode: typeof result.status === 'number' ? result.status : null,
    signal: result.signal ?? null,
    error: result.error ? String(result.error.message ?? result.error) : null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs: Date.now() - startedAt,
  };
}

/** git 取「未跟踪 / 新增」文件（拿不到 → 空数组，由清单兜底）。 */
export function collectGitTestCandidates(root = REPO_ROOT) {
  const run = (args) => {
    try {
      const res = spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        shell: false,
        windowsHide: true,
      });
      if (res.error || res.status !== 0) return [];
      return String(res.stdout ?? '')
        .split('\0')
        .filter(Boolean)
        .map(toPosix);
    } catch {
      return [];
    }
  };
  return {
    untracked: run(['ls-files', '--others', '--exclude-standard', '-z']),
    added: run(['diff', '--name-only', '--diff-filter=A', '-z', 'HEAD']),
  };
}

/** 读取能力自检报告（探针写出的 JSON）。 */
export function readSelfcheckReport(filePath) {
  try {
    return parseSelfcheckReport(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** 读上次的 `--json` 报告，抽出失败集签名（拿不到 → null，并在 stderr 说明）。 */
export function readBaselineSignatures(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const stage = (parsed?.stages ?? []).find((s) => s?.id === 'full-tests');
    const list = stage?.metrics?.failedFileSignatures;
    return Array.isArray(list) ? list : [];
  } catch (error) {
    process.stderr.write(`--baseline：读不到 ${filePath}（${error?.message ?? error}）→ 本次跳过失败集对照\n`);
    return null;
  }
}

/** 把一段文本写成日志文件（不删除任何东西）。 */
export function writeLog(outDir, stageId, text) {
  const filePath = path.join(outDir, `${stageId}.log`);
  fs.writeFileSync(filePath, text, 'utf8');
  return toPosix(filePath);
}

/**
 * 组装一次 vitest 运行。
 *
 * 同时挂两个 reporter：
 * - `default` → stdout 留人类可读摘要（进日志文件，也用于与 JSON 计数交叉校验）；
 * - `json`    → `--outputFile.json=<path>` 落结构化结果，供纯函数解析。
 *
 * 实测（vitest 4.1.10）：`--outputFile.<reporter>=<path>` 的 dot 写法有效；
 * 失败时 pnpm 会补一句 `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`（措辞误导，但 exit code 就是 vitest 的）。
 */
function buildVitestRun(stage, ctx, label, targetArgs) {
  const jsonPath = path.join(ctx.outDir, `${stage.id}.vitest.json`);
  const args = [...targetArgs, '--reporter=default', '--reporter=json', `--outputFile.json=${jsonPath}`];
  return { label, args, jsonPath };
}

/** 把纯函数判定结果包装成阶段结果（IO 元数据由调用方给）。 */
function toStageResult(spec, evaluation, { exitCode = null, command = null, logPath = null, durationMs = 0 } = {}) {
  return {
    index: spec.index,
    id: spec.id,
    title: spec.title,
    status: evaluation.status,
    expectationZh: spec.expectationZh,
    actualZh: evaluation.actualZh,
    exitCode,
    command,
    logPath,
    metrics: evaluation.metrics ?? {},
    notes: evaluation.notes ?? [],
    durationMs,
  };
}

/** 运行单个阶段：跑命令（或进程内体检）→ 调用纯函数判定 → 补上 IO 元数据。 */
function runStage(spec, ctx) {
  // 前置阻塞：默认**不执行**依赖 barrel 的阶段（跑也只会红），结论由纯函数给出。
  // `--run-blocked` 时照跑（用于留「恢复前基线」），失败归类仍由 reclassifyForcedRun 收敛为 blocked。
  if (ctx.blocked && spec.dependsOnBarrel && ctx.runBlocked !== true) {
    const planned = spec.commands[0];
    return toStageResult(spec, evaluateStage(spec, {}, { blocked: ctx.blocked }), {
      command: planned ? buildCommandLine(planned.command, planned.args ?? []) : null,
    });
  }

  const observation = { runs: [], repoRoot: ctx.repoRoot };

  // 清单为空时不要启动 vitest：不传文件路径等于跑全量，既慢又会掩盖「清单有问题」。
  if (spec.id === 'new-capability-tests' && !planNewTestsRun(ctx.inventory).run) {
    observation.inventory = ctx.inventory;
    const evaluation = evaluateStage(spec, observation, { blocked: null });
    const logPath = writeLog(ctx.outDir, spec.id, `[验收] 未启动 vitest：${evaluation.actualZh}\n`);
    return toStageResult(spec, evaluation, { logPath });
  }

  const startedAt = Date.now();
  let logChunks = [];
  let exitCode = null;
  let command = null;

  if (spec.runner === 'doctor') {
    try {
      observation.doctor = runDoctor({});
      exitCode = observation.doctor.totals.missingModuleCount > 0 ? 1 : 0;
    } catch (error) {
      observation.doctorError = String(error?.message ?? error);
      exitCode = null;
    }
    command = `node ${DOCTOR_TOOL_REL_PATH}（进程内复用它导出的 runDoctor 纯逻辑）`;
    logChunks.push(
      `[验收] 进程内调用 ${DOCTOR_TOOL_REL_PATH} 的 runDoctor()\n` +
        JSON.stringify(
          {
            missingModuleCount: observation.doctor?.totals?.missingModuleCount ?? null,
            missingModules: (observation.doctor?.modules ?? []).map((m) => m.slug),
            doctorError: observation.doctorError ?? null,
          },
          null,
          2,
        ),
    );
  } else {
    for (const specCommand of spec.commands) {
      let targetArgs = specCommand.args ?? [];
      let label = specCommand.label;
      let jsonPath = null;
      let extraEnv = {};
      let resolved = targetArgs;

      if (specCommand.dynamic === 'inventory') {
        resolved = targetArgs.flatMap((a) => (a === '<inventory>' ? ctx.inventory.files.map((rel) => rel.slice(`${WEB_APP_DIR}/`.length)) : [a]));
        label = `${label}（${ctx.inventory.files.length} 个文件，来源 ${ctx.inventory.source}）`;
      } else if (specCommand.dynamic === 'probe') {
        const probe = targetArgs.find((a) => a.startsWith('<probe:'));
        const rel = probe.slice('<probe:'.length, -1);
        resolved = targetArgs.map((a) => (a === probe ? rel.slice(`${WEB_APP_DIR}/`.length) : a));
      }

      if (resolved.includes('vitest')) {
        const withJson = buildVitestRun(spec, ctx, label, resolved);
        jsonPath = withJson.jsonPath;
        resolved = withJson.args;
        label = withJson.label;
      }

      if (spec.id === 'capability-selfcheck') {
        extraEnv = { [SELFCHECK_OUT_ENV]: path.join(ctx.outDir, 'capability-selfcheck.json') };
      }

      const cwd = specCommand.cwd === 'web' ? path.join(ctx.repoRoot, WEB_APP_DIR) : ctx.repoRoot;
      const result = spawnCapture(specCommand.command, resolved, {
        cwd,
        env: { ...process.env, ...extraEnv },
      });
      const runRecord = {
        label,
        command: buildCommandLine(specCommand.command, resolved),
        spawned: result.spawned,
        exitCode: result.exitCode,
        error: result.error,
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        jsonReport: null,
      };
      if (jsonPath) runRecord.jsonReport = readJsonMaybe(jsonPath);
      observation.runs.push(runRecord);
      if (exitCode === null || (result.exitCode ?? 0) !== 0) exitCode = result.exitCode;
      if (!command) command = runRecord.command;
      logChunks.push(`$ ${runRecord.command}\n${result.stdout}${result.stderr}`);
    }
  }

  if (ctx.inventory) observation.inventory = ctx.inventory;
  if (spec.id === 'capability-selfcheck') {
    observation.selfcheck = readSelfcheckReport(path.join(ctx.outDir, 'capability-selfcheck.json'));
  }

  const evaluation =
    ctx.runBlocked === true
      ? reclassifyForcedRun(evaluateStage(spec, observation, {}), ctx.blocked)
      : evaluateStage(spec, observation, { blocked: ctx.blocked });
  const logPath = writeLog(ctx.outDir, spec.id, `${logChunks.join('\n\n')}\n`);
  return toStageResult(spec, evaluation, { exitCode, command, logPath, durationMs: Date.now() - startedAt });
}

/** 读 JSON 文件（拿不到 → null）。 */
function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** 主流程（IO）：按 CLI 选项跑阶段并汇总。 */
export function runAcceptance(cli, { repoRoot = REPO_ROOT } = {}) {
  const outDir = path.resolve(cli.outDir ?? DEFAULT_OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const git = collectGitTestCandidates(repoRoot);
  const inventory = resolveSessionTestInventory({
    untracked: git.untracked,
    added: git.added,
    explicit: cli.tests.length > 0 ? cli.tests : null,
    fileExists: (rel) => {
      try {
        return fs.statSync(path.join(repoRoot, toPosix(rel).split('/').join(path.sep))).isFile();
      } catch {
        return false;
      }
    },
  });

  const ctx = { repoRoot, outDir, inventory, blocked: null, runBlocked: cli.runBlocked === true };
  const stageResults = [];
  const lastStage = cli.stage ?? STAGE_SPECS.length;

  for (const spec of STAGE_SPECS) {
    if (spec.index > lastStage) {
      stageResults.push({
        index: spec.index,
        id: spec.id,
        title: spec.title,
        expectationZh: spec.expectationZh,
        command: null,
        logPath: null,
        exitCode: null,
        durationMs: 0,
        ...skipStageResult(spec),
      });
      continue;
    }
    const result = runStage(spec, ctx);
    stageResults.push(result);
    if (result.status === STAGE_STATUS.BLOCKED && ctx.blocked === null) {
      ctx.blocked = { stageId: result.id, detailZh: result.actualZh };
    }
  }

  const baselineList = cli.baselinePath ? readBaselineSignatures(path.resolve(cli.baselinePath)) : null;
  return evaluateAcceptance(stageResults, {
    repoRoot,
    generatedAt: new Date().toISOString(),
    includeTiming: true,
    truncatedAt: lastStage < STAGE_SPECS.length ? lastStage : null,
    totalStageCount: STAGE_SPECS.length,
    baseline: baselineList,
    baselinePath: cli.baselinePath ?? null,
    outDir,
  });
}

/** 判断本文件是否是主入口。 */
export function isMainModule(metaUrl, argv1 = process.argv?.[1]) {
  if (!argv1) return false;
  try {
    return metaUrl === pathToFileURL(argv1).href;
  } catch {
    return false;
  }
}

function main(argv) {
  const cli = parseCliArgs(argv);
  if (cli.errors.length > 0) {
    process.stderr.write(`${cli.errors.join('\n')}\n\n${USAGE_TEXT}\n`);
    return USAGE_EXIT_CODE;
  }
  if (cli.help) {
    process.stdout.write(`${USAGE_TEXT}\n`);
    return 0;
  }
  const report = runAcceptance(cli);
  const payload = cli.json && cli.stable ? toStableReport(report) : report;
  if (cli.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else process.stdout.write(`${formatAcceptanceReport(report)}\n`);
  return report.exitCode;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv);
}
