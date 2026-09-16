/**
 * 跨格一致性校验「接线守卫」（源码级，多格推演 / 角色设定表工作区）。
 *
 * 为什么用源码断言而不是渲染测试：两个工作区在 import 期会解析 `@nx9/shared` barrel，
 * 而该 barrel 当前引用了 8 个不存在的 `data/*` 模块（既有缺陷，见 docs/NX9-CONSISTENCY-CHECK.md），
 * 渲染测试在本机会直接解析失败 —— 与本次新增能力无关。因此这里沿用仓库既有做法
 * （逐格出图并发守卫 / flow-runner 拆分守卫同款）：**按源码文本 + 语法解析**断言接线。
 *
 * 覆盖：
 * 1. 三个新增 / 改动文件语法可解析（transpile 无诊断）；
 * 2. 两个工作区确实渲染了 ConsistencyCheckSection 并传齐 targets / limit / onJump；
 * 3. 报告**只读**：接线里不得出现任何写节点数据的调用（updateNodeData / useReactFlow / patch）；
 * 4. 「跳到该格」的 DOM id 生成与查找同源（否则点击后定位不到格）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ENGINE_DIR = resolve(__dirname, '..');
const TOOL_DIR = resolve(ENGINE_DIR, 'stage-deck/chrome/attached-workspace/tool');
const CONSISTENCY_DIR = resolve(ENGINE_DIR, 'stage-deck/chrome/attached-workspace/consistency');
const SHARED_DIR = resolve(ENGINE_DIR, '../../../../packages/shared/src/utils');

const SECTION_PATH = resolve(CONSISTENCY_DIR, 'ConsistencyCheckSection.tsx');
const MULTI_GRID_PATH = resolve(TOOL_DIR, 'MultiGridWorkspace.tsx');
const CHARACTER_SHEET_PATH = resolve(TOOL_DIR, 'CharacterSheetWorkspace.tsx');
const REPORT_PATH = resolve(SHARED_DIR, 'consistency-report.ts');
const ENGINE_PATH = resolve(ENGINE_DIR, 'consistency-check.ts');

const read = (path: string): string => readFileSync(path, 'utf8');

describe('接线守卫：语法可解析', () => {
  const files: [string, string][] = [
    ['ConsistencyCheckSection.tsx', SECTION_PATH],
    ['MultiGridWorkspace.tsx', MULTI_GRID_PATH],
    ['CharacterSheetWorkspace.tsx', CHARACTER_SHEET_PATH],
    ['consistency-check.ts', ENGINE_PATH],
    ['consistency-report.ts', REPORT_PATH],
  ];

  it.each(files)('%s 无语法诊断', (_name, path) => {
    const result = ts.transpileModule(read(path), {
      fileName: path,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    expect(result.diagnostics ?? []).toEqual([]);
  });
});

describe('接线守卫：两个工作区都挂上了一致性校验', () => {
  it('多格推演：渲染 ConsistencyCheckSection，传 targets / limit / onJump，并有跳到该格的 id 定位', () => {
    const source = read(MULTI_GRID_PATH);
    expect(source).toContain("from '../consistency/ConsistencyCheckSection'");
    expect(source).toContain('<ConsistencyCheckSection');
    expect(source).toContain('targets={consistencyTargets}');
    expect(source).toContain('limit={cellConcurrency}');
    expect(source).toContain('onJump={handleJumpToCell}');
    expect(source).toContain('id={multiGridCellDomId(blockId, i)}');
    expect(source).toContain('getElementById(multiGridCellDomId(blockId, index))');
    // 校验目标取自计划格与逐格出图结果，而不是另造一份
    expect(source).toContain('plan?.cells ?? []');
    expect(source).toContain('url: cellImageUrl(i)');
  });

  it('角色设定表：渲染 ConsistencyCheckSection，并把「三视图正面」作为优先格', () => {
    const source = read(CHARACTER_SHEET_PATH);
    expect(source).toContain("from '../consistency/ConsistencyCheckSection'");
    expect(source).toContain('<ConsistencyCheckSection');
    expect(source).toContain('targets={consistencyTargets}');
    expect(source).toContain('limit={cellConcurrency}');
    expect(source).toContain('preferIndexes={consistencyPreferIndexes}');
    expect(source).toContain('onJump={handleJumpToCell}');
    expect(source).toContain('id={characterSheetCellDomId(blockId, i)}');
    expect(source).toContain('getElementById(characterSheetCellDomId(blockId, index))');
    expect(source).toContain("cell.angleId === 'front'");
  });

  it('两个工作区都复用「逐格并发」设置作为校验并发上限（不新增开关）', () => {
    for (const path of [MULTI_GRID_PATH, CHARACTER_SHEET_PATH]) {
      const source = read(path);
      expect(source).toContain('limit={cellConcurrency}');
      expect(source).not.toContain('consistencyConcurrency');
    }
  });
});

describe('接线守卫：报告只读（不改写既有数据 / 提示词）', () => {
  it('一致性面板不引用任何写节点数据的入口', () => {
    const source = read(SECTION_PATH);
    expect(source).not.toContain('updateNodeData');
    expect(source).not.toContain('useReactFlow');
    expect(source).not.toContain('useAttachedNodeData');
    expect(source).not.toContain('patch(');
    expect(source).not.toContain('api.');
    expect(source).toContain('会话内状态');
  });

  it('取数壳层只调 analyzeFaces 接口，不碰节点数据 / 不写持久化字段', () => {
    const source = read(ENGINE_PATH);
    expect(source).toContain("await import('../api/client')");
    expect(source).toContain('api.analyzeFaces(imageUrl)');
    expect(source).not.toContain('updateNodeData');
    expect(source).not.toContain('localStorage');
  });

  it('面板按「报告 + 引擎」两层调用，纯函数来自 @nx9/shared', () => {
    const source = read(SECTION_PATH);
    expect(source).toContain('analyzeCellFaces(');
    expect(source).toContain('buildConsistencyReport(');
    expect(source).toContain('pickBestCell(');
    expect(source).toContain("} from '@nx9/shared'");
    // 报告不可用时如实展示，不显示「无问题」
    expect(source).toContain('run.report.unavailable');
    expect(source).toContain('本次未出结论');
  });
});

describe('接线守卫：纯函数模块与 barrel 的边界', () => {
  it('纯函数模块零依赖（不 import 任何东西），保证可直测与可序列化', () => {
    const source = read(REPORT_PATH);
    const imports = source.split(/\r?\n/).filter((line) => /^\s*import\s/.test(line));
    expect(imports).toEqual([]);
  });

  it('barrel 追加了本次导出，且未改既有 consistency-repair 导出', () => {
    const barrel = read(resolve(ENGINE_DIR, '../../../../packages/shared/src/index.ts'));
    expect(barrel).toContain("from './utils/consistency-report'");
    expect(barrel).toContain('buildConsistencyReport');
    expect(barrel).toContain('pickBestCell');
    expect(barrel).toContain("export type { ConsistencyIssue, ConsistencyReport } from './utils/consistency-repair';");
  });

  it('引擎壳层对纯函数只用 import type（运行时不依赖 barrel / dist）', () => {
    const source = read(ENGINE_PATH);
    expect(source).toContain('import type {');
    expect(source).toContain("from '../../../../packages/shared/src/utils/consistency-report'");
    expect(source).not.toContain("from '@nx9/shared'");
  });
});
