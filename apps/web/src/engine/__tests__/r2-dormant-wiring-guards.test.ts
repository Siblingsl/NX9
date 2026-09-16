/**
 * R2 休眠能力接线守卫（防退回零入口 / 防误接已判「不接」项）。
 *
 * 三部分：
 * A. 归档入口（`workflow-zip.exportWorkflowZip` + `downloadBlob` + `importWorkflowZip`）
 *    的纯逻辑与源码级接线守卫；
 * B. 与既有 R1 注入层（`preset-entrypoints`）的互不覆盖交叉验证；
 * C. 「未接入」判定守卫：本轮判定为**不接**的零引用导出，必须保持零生产引用，
 *    以免日后被无理由接成第二套真源。
 *
 * import 一律走相对路径直取源码（barrel 含缺失模块的既有缺陷，禁止依赖）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, type Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  WORKFLOW_ARCHIVE_EXTENSION,
  buildWorkflowArchiveFileName,
  workflowArchiveBlockReason,
} from '../workflow-archive';
import { withShotBlockingHint } from '../shot-blocking-hint';
import {
  withCinemaPrompt,
  withLightRigPrompt,
  readPresetSections,
} from '../../../../../packages/shared/src/utils/preset-entrypoints';

const webRoot = resolve(__dirname, '..', '..', '..'); // apps/web
const webSrc = resolve(webRoot, 'src');
const repoRoot = resolve(webRoot, '..', '..');

const suggest = () => ({
  suggestedCamera: '客厅 · 推机位，焦段 1m',
  suggestedAngle: 'overhead',
  suggestedDistance: '1m',
});

describe('R2 · A 工作流归档入口', () => {
  it('文件名稳定可断言，工作区 id 做安全归一', () => {
    const at = new Date(2026, 0, 2, 3, 4, 5);
    expect(buildWorkflowArchiveFileName('ws-1', at)).toBe('nx9-workflow-ws-1-20260102-030405.nx9zip');
    expect(buildWorkflowArchiveFileName('  a/b c  ', at)).toBe('nx9-workflow-a-b-c-20260102-030405.nx9zip');
    expect(buildWorkflowArchiveFileName('', at)).toBe('nx9-workflow-workspace-20260102-030405.nx9zip');
    expect(WORKFLOW_ARCHIVE_EXTENSION).toBe('nx9zip');
    expect(buildWorkflowArchiveFileName('ws-1', at).endsWith(`.${WORKFLOW_ARCHIVE_EXTENSION}`)).toBe(
      true,
    );
  });

  it('可导出性判定：空画布 / 空选区拒绝（禁止空成功）', () => {
    expect(workflowArchiveBlockReason({ nodeCount: 0, edgeCount: 0, selectionCount: 0 }, false)).toBe(
      '当前画布为空，无法导出工作流归档',
    );
    expect(workflowArchiveBlockReason({ nodeCount: 3, edgeCount: 0, selectionCount: 0 }, true)).toBe(
      '未选中任何模块，无法导出选区归档',
    );
    expect(workflowArchiveBlockReason({ nodeCount: 3, edgeCount: 2, selectionCount: 0 }, false)).toBeUndefined();
    expect(workflowArchiveBlockReason({ nodeCount: 3, edgeCount: 2, selectionCount: 2 }, true)).toBeUndefined();
  });

  it('接线守卫：runtime API 暴露 exportWorkflowZip，命令面板提供导入/导出入口', () => {
    const runtimeStore = readFileSync(resolve(webSrc, 'stores/flow-runtime.ts'), 'utf8');
    expect(runtimeStore).toContain('exportWorkflowZip: (selectionOnly?: boolean) => Promise<void>');

    const surface = readFileSync(resolve(webSrc, 'engine/FlowSurface.tsx'), 'utf8');
    expect(surface).toContain('exportWorkflowZip as buildWorkflowZip');
    expect(surface).toContain('downloadBlob');
    expect(surface).toContain('buildWorkflowArchiveFileName');
    expect(surface).toContain('exportWorkflowZipRef.current');
    expect(surface).toContain(
      'exportWorkflowZip: (selectionOnly) => exportWorkflowZipRef.current(selectionOnly)',
    );

    const palette = readFileSync(
      resolve(webSrc, 'engine/stage-deck/chrome/CommandPalette.tsx'),
      'utf8',
    );
    expect(palette).toContain("id: 'export-workflow-zip'");
    expect(palette).toContain("id: 'export-workflow-zip-selection'");
    expect(palette).toContain("id: 'import-workflow-zip'");
    expect(palette).toContain('runtime?.exportWorkflowZip(false)');
    expect(palette).toContain('runtime?.exportWorkflowZip(true)');
    expect(palette).toContain("runtime?.importWorkflowZip(file, 'merge')");
  });

  it('接线守卫：候选设定 Prompt 复制挂在既有「设定就绪」面板，未另建名单来源', () => {
    const panel = readFileSync(resolve(webSrc, 'components/asset/AssetReadinessPanel.tsx'), 'utf8');
    expect(panel).toContain("from './AssetCandidatePromptCopy'");
    expect(panel).toContain('<AssetCandidatePromptCopy');
    expect(panel).toContain('requiredCharacters={report.requiredCharacters}');
    expect(panel).toContain('requiredScenes={report.requiredScenes}');

    const copy = readFileSync(resolve(webSrc, 'components/asset/AssetCandidatePromptCopy.tsx'), 'utf8');
    for (const symbol of [
      'buildCharacterCandidatePrompt',
      'buildSceneCandidatePrompt',
      'scriptCandidateCharacterKeys',
      'copyTextWithLog',
    ]) {
      expect(copy).toContain(symbol);
    }
    // 只读：不得写入任何工作区字段
    expect(copy).not.toContain('upsertCharacter');
    expect(copy).not.toContain('upsertBacklotWorkspace');
    expect(copy).not.toContain('updateNodeData');
  });
});

describe('R2 · B 与 R1 注入层互不覆盖', () => {
  const SHOT = { scene: '客厅', shotSize: 'CU', cameraMove: '推' };

  it('先预设后机位建议：预设行原样保留', () => {
    const presetText = withCinemaPrompt('主体描述', ['cine-golden-hour']);
    const withHint = withShotBlockingHint(presetText, SHOT, suggest);
    const sections = readPresetSections(withHint);
    expect(sections.cinema).toBe(readPresetSections(presetText).cinema);
    expect(withHint.split('\n').filter((l) => l.startsWith('机位建议：'))).toHaveLength(1);
  });

  it('先机位建议后预设：预设注入只重排自有行，机位建议行保留', () => {
    const withHint = withShotBlockingHint('主体描述', SHOT, suggest);
    const after = withCinemaPrompt(withHint, ['cine-golden-hour']);
    expect(after).toContain('机位建议：');
    expect(readPresetSections(after).cinema).toBeTruthy();
  });

  it('预设清除不误删机位建议行，机位清除不误删预设行', () => {
    const both = withLightRigPrompt(
      withShotBlockingHint('主体描述', SHOT, suggest),
      ['three-point-soft'],
    );
    const presetCleared = withLightRigPrompt(both, []);
    expect(presetCleared).toContain('机位建议：');
    expect(readPresetSections(presetCleared).lighting).toBeUndefined();

    const hintCleared = withShotBlockingHint(both, null, suggest);
    expect(hintCleared).not.toContain('机位建议：');
    expect(readPresetSections(hintCleared).lighting).toBeTruthy();
  });
});

describe('R2 · C 未接入项守卫', () => {
  /** 递归收集待扫描源码（排除测试文件与 __tests__ 目录）。 */
  function sourceFiles(): string[] {
    const roots = [
      webSrc,
      join(repoRoot, 'apps/server/src'),
      join(repoRoot, 'packages/shared/src'),
      join(repoRoot, 'packages/director3d/src'),
    ];
    const out: string[] = [];
    const skip = new Set(['node_modules', 'dist', '__tests__', 'build']);
    const walk = (dir: string) => {
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith('.') || skip.has(e.name)) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name)) out.push(p);
      }
    };
    roots.forEach(walk);
    return out;
  }

  const norm = (f: string) => f.replace(/\\/g, '/');
  const files = sourceFiles();
  const readAll = () => files.map((f) => ({ f: norm(f), text: readFileSync(f, 'utf8') }));

  /**
   * 这些零引用导出本轮判定为**不接**（重复真源 / 薄包装 / 无用户价值），
   * 若日后有人接线，必须同时更新本文档与判定理由，故此处设守卫。
   */
  const NOT_WIRED: Array<{ symbol: string; definedIn: string }> = [
    {
      symbol: 'mapStepStatus',
      definedIn: 'packages/shared/src/utils/playbook-step-visual.ts',
    },
    {
      symbol: 'mapStepToStatus',
      definedIn: 'packages/shared/src/utils/playbook-step-visual.ts',
    },
    {
      symbol: 'migrateGlobalTimelineDraft',
      definedIn: 'packages/shared/src/utils/migrate-timeline-draft.ts',
    },
    {
      symbol: 'clipEditorHasTimelineDraft',
      definedIn: 'packages/shared/src/utils/migrate-timeline-draft.ts',
    },
  ];

  it('判定为「不接」的零引用导出仍无生产调用方', () => {
    const loaded = readAll();
    for (const { symbol, definedIn } of NOT_WIRED) {
      const re = new RegExp(`(?<![A-Za-z0-9_$])${symbol}(?![A-Za-z0-9_$])`);
      const owners = loaded.filter(({ f }) => f.endsWith(definedIn));
      expect(owners.length, `${definedIn} 应存在`).toBe(1);
      const others = loaded.filter(({ f, text }) => !f.endsWith(definedIn) && re.test(text));
      expect(
        others.map(({ f }) => f),
        `${symbol} 被重新引用了；如属有意接线，请更新 docs/NX9-DORMANT-CAPABILITY-WIRING-R2.md 的判定理由并移出本守卫`,
      ).toEqual([]);
    }
  });

  it('本轮接入项必须有定义文件之外的调用方（防「接了又断」）', () => {
    const loaded = readAll();
    const expectConsumed = (symbol: string, definedIn: string) => {
      const re = new RegExp(`(?<![A-Za-z0-9_$])${symbol}(?![A-Za-z0-9_$])`);
      const hits = loaded
        .filter(({ f }) => !f.endsWith(definedIn))
        .filter(({ text }) => re.test(text))
        .map(({ f }) => f);
      expect(hits.length, `${symbol} 应有 ${definedIn} 之外的调用方`).toBeGreaterThan(0);
    };
    expectConsumed('suggestCameraPosition', 'apps/web/src/engine/director-desk-runner.ts');
    expectConsumed('exportWorkflowZip', 'apps/web/src/engine/stage-deck/utils/workflow-zip.ts');
    expectConsumed('downloadBlob', 'apps/web/src/engine/stage-deck/utils/workflow-zip.ts');
    expectConsumed('buildCharacterCandidatePrompt', 'apps/web/src/engine/script-asset-candidates.ts');
    expectConsumed('buildSceneCandidatePrompt', 'apps/web/src/engine/script-asset-candidates.ts');
    expectConsumed('scriptCandidateCharacterKeys', 'apps/web/src/engine/script-asset-candidates.ts');
    expectConsumed('copyTextWithLog', 'apps/web/src/engine/script-asset-candidates.ts');
  });
});
