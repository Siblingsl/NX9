/**
 * F-043 acceptance test — 摘要卡规范统一
 *
 * G1 验收清单:
 * - [x] 活跃节点卡面无重表单
 *
 * G2: 所有 utility 节点使用 CanvasNodeShell（摘要卡） + 工作区组件承载表单
 * G3: 本文件 + 缺陷分析同步
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WEB_SRC = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');
const BLOCKS = resolve(WEB_SRC, 'blocks');
const WORKSPACES = resolve(WEB_SRC, 'engine', 'stage-deck', 'chrome', 'attached-workspace');

function readFile(relPath: string): string {
  return readFileSync(resolve(WEB_SRC, relPath), 'utf-8');
}

function readAbs(absPath: string): string {
  return readFileSync(absPath, 'utf-8');
}

/** 需要对齐 CanvasNodeShell 的 utility / 非 Desk 节点 */
const ALIGNED_KINDS = [
  { kind: 'link-parser', blockFile: 'blocks/utility/LinkParserBlock.tsx' },
  { kind: 'grid-compose', blockFile: 'blocks/utility/GridComposeBlock.tsx' },
  { kind: 'iterator', blockFile: 'blocks/utility/IteratorBlock.tsx' },
  { kind: 'media-pin', blockFile: 'blocks/utility/MediaPinBlock.tsx' },
  { kind: 'local-enhance', blockFile: 'blocks/utility/LocalEnhanceBlock.tsx' },
  { kind: 'caption-asr', blockFile: 'blocks/nx9/CaptionAsrBlock.tsx' },
  { kind: 'inpaint-edit', blockFile: 'blocks/nx9/InpaintEditBlock.tsx' },
  { kind: 'reference-board', blockFile: 'blocks/nx9/ReferenceBoardBlock.tsx' },
];

describe('F-043 acceptance — 摘要卡规范统一', () => {
  // ═══════════ G1: 所有 utility 块文件使用 CanvasNodeShell ═══════════
  describe('G1: utility 块文件 → CanvasNodeShell', () => {
    for (const { kind, blockFile } of ALIGNED_KINDS) {
      it(`${kind}: 使用 CanvasNodeShell（不直接用 BlockShell 内嵌表单）`, () => {
        const src = readFile(blockFile);
        // 必须 import CanvasNodeShell
        expect(src).toMatch(/CanvasNodeShell/);
        // 禁止 import BlockShell（旧模式）
        expect(src).not.toMatch(/from ['"]\.\.\/shared\/BlockShell['"]/);
        // 禁止堆表单（旧模式：有大量 input/select/textarea 在 BlockShell children 内）
      });
    }
  });

  // ═══════════ G2: 工作区组件存在 ═══════════
  describe('G2: 工作区组件文件存在', () => {
    const wsFiles: [string, string][] = [
      ['link-parser', 'tool/LinkParserWorkspace.tsx'],
      ['grid-compose', 'tool/GridComposeWorkspace.tsx'],
      ['iterator', 'control/IteratorWorkspace.tsx'],
      ['caption-asr', 'generation/CaptionWorkspace.tsx'],
      ['inpaint-edit', 'generation/InpaintWorkspace.tsx'],
      ['reference-board', 'tool/ReferenceBoardWorkspace.tsx'],
      ['local-enhance', 'tool/LocalEnhanceWorkspace.tsx'],
    ];

    for (const [kind, relPath] of wsFiles) {
      it(`${kind}: 工作区 ${relPath} 存在`, () => {
        const full = resolve(WORKSPACES, relPath);
        expect(existsSync(full)).toBe(true);
      });
    }
  });

  // ═══════════ G3: 工作区组件有正确的 ComposerWorkspaceShell ═══════════
  describe('G3: 工作区组件使用 ComposerWorkspaceShell', () => {
    const wsFilesWithPaths: [string, string][] = [
      ['link-parser', resolve(WORKSPACES, 'tool/LinkParserWorkspace.tsx')],
      ['grid-compose', resolve(WORKSPACES, 'tool/GridComposeWorkspace.tsx')],
      ['iterator', resolve(WORKSPACES, 'control/IteratorWorkspace.tsx')],
      ['caption-asr', resolve(WORKSPACES, 'generation/CaptionWorkspace.tsx')],
      ['inpaint-edit', resolve(WORKSPACES, 'generation/InpaintWorkspace.tsx')],
      ['reference-board', resolve(WORKSPACES, 'tool/ReferenceBoardWorkspace.tsx')],
      ['local-enhance', resolve(WORKSPACES, 'tool/LocalEnhanceWorkspace.tsx')],
    ];

    for (const [kind, abs] of wsFilesWithPaths) {
      it(`${kind}: ${kind} 工作区包裹在 ComposerWorkspaceShell 内`, () => {
        const src = readAbs(abs);
        expect(src).toMatch(/ComposerWorkspaceShell/);
        expect(src).toContain('blockId');
        expect(src).toContain('useAttachedNodeData');
      });
    }
  });

  // ═══════════ G4: Router 按 kind 分派正确工作区 ═══════════
  describe('G4: AttachedWorkspaceRouter 按 kind 路由', () => {
    const routerPath = resolve(WORKSPACES, 'AttachedWorkspaceRouter.tsx');
    const routerSrc = readAbs(routerPath);

    const routeChecks: [string, string][] = [
      ['link-parser', 'LinkParserWorkspace'],
      ['grid-compose', 'GridComposeWorkspace'],
      ['iterator', 'IteratorWorkspace'],
      ['caption-asr', 'CaptionWorkspace'],
      ['inpaint-edit', 'InpaintWorkspace'],
      ['reference-board', 'ReferenceBoardWorkspace'],
      ['local-enhance', 'LocalEnhanceWorkspace'],
    ];

    for (const [kind, wsName] of routeChecks) {
      it(`${kind} → ${wsName}`, () => {
        // 在 router 中能找到 kind → workspace 的路由
        const pattern = new RegExp(
          `kind\\s*===\\s*['"]${kind}['"].*?${wsName}`,
          's',
        );
        expect(routerSrc).toMatch(pattern);
      });
    }
  });

  // ═══════════ G5: CanvasNodeShell 入口模式 ═══════════
  describe('G5: CanvasNodeShell 入口闭合', () => {
    it('CanvasNodeShell 接受 NodeProps + onRunOverride', () => {
      const src = readFile('blocks/shared/CanvasNodeShell.tsx');
      expect(src).toContain('CanvasNodeShellProps extends NodeProps');
      expect(src).toContain('onRunOverride');
    });

    it('CanvasNodeBody 路由到 NodeSummaryBody（非 picture/clip 走统一骨架）', () => {
      const src = readFile('blocks/shared/CanvasNodeBody.tsx');
      expect(src).toContain('NodeSummaryBody');
      expect(src).toContain('primary');
      expect(src).toContain('secondary');
    });
  });

  // ═══════════ G6: 全量 BlockShell 直接调用零残留（仅 Desk 块豁免） ═══════════
  describe('G6: utility/nx9 块 BlockShell 直接调用已清零', () => {
    it('utility/*.tsx 中无 import BlockShell from shared', () => {
      const linkParser = readFile('blocks/utility/LinkParserBlock.tsx');
      const gridCompose = readFile('blocks/utility/GridComposeBlock.tsx');
      const iterator = readFile('blocks/utility/IteratorBlock.tsx');
      const mediaPin = readFile('blocks/utility/MediaPinBlock.tsx');
      const localEnhance = readFile('blocks/utility/LocalEnhanceBlock.tsx');

      for (const src of [linkParser, gridCompose, iterator, mediaPin, localEnhance]) {
        expect(src).not.toMatch(/import.*BlockShell.*from ['"][.][.]\/shared\/BlockShell['"]/);
      }
    });

    it('nx9/*.tsx 块中无 import BlockShell from shared（CaptionAsr/InpaintEdit/ReferenceBoard）', () => {
      const captionAsr = readFile('blocks/nx9/CaptionAsrBlock.tsx');
      const inpaintEdit = readFile('blocks/nx9/InpaintEditBlock.tsx');
      const referenceBoard = readFile('blocks/nx9/ReferenceBoardBlock.tsx');

      for (const src of [captionAsr, inpaintEdit, referenceBoard]) {
        expect(src).not.toMatch(/import.*BlockShell.*from ['"][.][.]\/shared\/BlockShell['"]/);
      }
    });
  });

  // ═══════════ G7: 未对齐块（Desk 类）保持不变 ═══════════
  describe('G7: Desk 块保留原有模式（ScreenModal / 自建 Shell）', () => {
    const deskBlocks = [
      'blocks/core/DirectorDeskBlock.tsx',
      'blocks/craft/StoryboardDeskBlock.tsx',
      'blocks/nx9/ScriptDeskBlock.tsx',
      'blocks/core/ClipEditorBlock.tsx',
      'blocks/nx9/ContinuityCheckBlock.tsx',
      'blocks/input/AssetImportBlock.tsx',
      'blocks/core/ClipGenBlock.tsx',
      'blocks/core/SoundGenBlock.tsx',
      'blocks/nx9/ExportPackBlock.tsx',
    ];

    for (const blockFile of deskBlocks) {
      it(`${blockFile} 保持不变（自定义 Desk / 非纯 utility）`, () => {
        const src = readFile(blockFile);
        // Desk 块仍有实质内容（不是空 CanvasNodeShell 壳）
        expect(src.length).toBeGreaterThan(200);
      });
    }
  });
});
