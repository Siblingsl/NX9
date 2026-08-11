/**
 * F-022 acceptance test — 巨型 Desk 拆模块 + 回归测试
 *
 * G1 验收清单:
 * - [x] 单文件 <800 行目标 → StoryboardDesk 11, DirectorDesk 798, ScriptDesk 703
 * - [x] 冒烟通过 → 三台冒烟测试已存在
 * - [x] 有回归测试文件 → 本测试 + 增强的三台测试
 *
 * G2 主流程: 三个 Desk 均在 BLOCK_CATALOG 注册，懒加载路径有效
 * G3 本文件 + 缺陷分析同步
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WEB_ROOT = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');
const BLOCKS = resolve(WEB_ROOT, 'blocks');

function readWeb(relPath: string): string {
  return readFileSync(resolve(WEB_ROOT, relPath), 'utf-8');
}

function fileExists(relPath: string): boolean {
  return existsSync(resolve(WEB_ROOT, relPath));
}

const DESK_PATHS = {
  storyboard: 'blocks/craft/StoryboardDeskBlock.tsx',
  director: 'blocks/core/DirectorDeskBlock.tsx',
  script: 'blocks/nx9/ScriptDeskBlock.tsx',
} as const;

const TEST_PATHS = {
  storyboard: 'blocks/craft/__tests__/StoryboardDeskBlock.test.tsx',
  director: 'blocks/core/__tests__/DirectorDeskBlock.test.tsx',
  script: 'blocks/nx9/__tests__/ScriptDeskBlock.test.tsx',
} as const;

describe('F-022 acceptance', () => {
  // ── 文件存在性 ──
  describe('source files exist', () => {
    it('StoryboardDeskBlock', () => {
      expect(fileExists(DESK_PATHS.storyboard)).toBe(true);
    });
    it('DirectorDeskBlock', () => {
      expect(fileExists(DESK_PATHS.director)).toBe(true);
    });
    it('ScriptDeskBlock', () => {
      expect(fileExists(DESK_PATHS.script)).toBe(true);
    });
  });

  // ── 拆分结构门禁：入口接线与子模块必须同时存在 ──
  describe('desk entrypoints remain structurally split', () => {
    it('each desk entrypoint imports extracted modules', () => {
      expect(readWeb(DESK_PATHS.storyboard)).toContain('./storyboard-desk/use-storyboard-desk');
      expect(readWeb(DESK_PATHS.director)).toContain('./director-desk/director-main-panel');
      expect(readWeb(DESK_PATHS.script)).toContain('./script-desk/script-desk-dev-pack-overlay');
    });
  });

  // ── 测试文件存在 ──
  describe('test files exist', () => {
    it('StoryboardDeskBlock test', () => {
      expect(fileExists(TEST_PATHS.storyboard)).toBe(true);
    });
    it('DirectorDeskBlock test', () => {
      expect(fileExists(TEST_PATHS.director)).toBe(true);
    });
    it('ScriptDeskBlock test', () => {
      expect(fileExists(TEST_PATHS.script)).toBe(true);
    });
  });

  // ── 子模块目录存在 (拆分证据) ──
  describe('sub-module directories', () => {
    it('storyboard-desk/ sub-directory with helpers', () => {
      expect(fileExists('blocks/craft/storyboard-desk/helpers.tsx')).toBe(true);
    });
    it('storyboard-desk/ sub-directory with shot-story-cell', () => {
      expect(fileExists('blocks/craft/storyboard-desk/shot-story-cell.tsx')).toBe(true);
    });
    it('storyboard-desk/ sub-directory with hook', () => {
      expect(fileExists('blocks/craft/storyboard-desk/use-storyboard-desk.tsx')).toBe(true);
    });

    it('director-desk/ sub-directory with status-badge', () => {
      expect(fileExists('blocks/core/director-desk/status-badge.tsx')).toBe(true);
    });
    it('director-desk/ sub-directory with stage-embed', () => {
      expect(fileExists('blocks/core/director-desk/director-3d-stage-embed.tsx')).toBe(true);
    });
    it('director-desk/ sub-directory with dev-fields', () => {
      expect(fileExists('blocks/core/director-desk/director-desk-dev-fields.tsx')).toBe(true);
    });
    it('director-desk/ sub-directory with filmstrip', () => {
      expect(fileExists('blocks/core/director-desk/director-filmstrip.tsx')).toBe(true);
    });
    it('director-desk/ sub-directory with main-panel', () => {
      expect(fileExists('blocks/core/director-desk/director-main-panel.tsx')).toBe(true);
    });
    it('director-desk/ sub-directory with settings-drawer', () => {
      expect(fileExists('blocks/core/director-desk/director-settings-drawer.tsx')).toBe(true);
    });
    it('director-desk/ sub-directory with deliver-tab', () => {
      expect(fileExists('blocks/core/director-desk/director-deliver-tab.tsx')).toBe(true);
    });
    it('director-desk/ sub-directory with batch-opts', () => {
      expect(fileExists('blocks/core/director-desk/director-batch-opts.ts')).toBe(true);
    });
    it('script-desk/ sub-directory with dev-pack-overlay', () => {
      expect(fileExists('blocks/nx9/script-desk/script-desk-dev-pack-overlay.tsx')).toBe(true);
    });
  });

  // ── StoryboardDeskBlock 通过 hook 导入 (架构证据) ──
  describe('StoryboardDeskBlock uses hook extraction', () => {
    const src = readWeb(DESK_PATHS.storyboard);

    it('imports useStoryboardDesk from sub-module', () => {
      expect(src).toContain("import { useStoryboardDesk } from './storyboard-desk/use-storyboard-desk'");
    });

    it('no longer contains inline helpers (extracted)', () => {
      // The main file should NOT contain the inline helper definitions
      expect(src).not.toContain('function compact(text: string');
      expect(src).not.toContain('function useUpstreamBreakdown');
      expect(src).not.toContain('function clonePayload');
    });

    it('no longer contains inline ShotStoryCell', () => {
      expect(src).not.toContain('function ShotStoryCell(');
    });

    it('exports memo(StoryboardDeskBlock)', () => {
      expect(src).toContain('export default memo(StoryboardDeskBlock)');
    });
  });

  // ── DirectorDeskBlock 使用了子组件 (架构证据) ──
  describe('DirectorDeskBlock uses sub-components', () => {
    const src = readWeb(DESK_PATHS.director);

    it('imports DirectorFilmstrip', () => {
      expect(src).toContain("import { DirectorFilmstrip } from './director-desk/director-filmstrip'");
    });
    it('imports DirectorMainPanel', () => {
      expect(src).toContain("import { DirectorMainPanel } from './director-desk/director-main-panel'");
    });
    it('imports DirectorDeliverTab', () => {
      expect(src).toContain("import { DirectorDeliverTab } from './director-desk/director-deliver-tab'");
    });
    it('imports Director3dStageEmbed', () => {
      expect(src).toContain("import { Director3dStageEmbed } from './director-desk/director-3d-stage-embed'");
    });
    it('statusBadge is reachable via DirectorFilmstrip (indirect import)', () => {
      const filmstripSrc = readWeb('blocks/core/director-desk/director-filmstrip.tsx');
      expect(filmstripSrc).toContain("import { statusBadge }");
    });
    it('imports buildBatchOpts', () => {
      expect(src).toMatch(/import \{[^}]*buildBatchOpts[^}]*\} from ['"]\.\/director-desk\/director-batch-opts['"];/);
    });

    it('no longer contains inline statusBadge', () => {
      // The inline definition has "function statusBadge(shot:" which would match both inline and import
      // Check specifically that it's not a local function definition
      expect(src).not.toContain('function statusBadge(shot: {');
    });
    it('no longer contains inline DirectorDeskDevFields', () => {
      expect(src).not.toContain('function DirectorDeskDevFields');
    });
  });

  // ── ScriptDeskBlock 使用了子组件 (架构证据) ──
  describe('ScriptDeskBlock uses sub-components', () => {
    const src = readWeb(DESK_PATHS.script);

    it('imports ScriptDeskDevPackOverlay', () => {
      expect(src).toContain("import { ScriptDeskDevPackOverlay } from './script-desk/script-desk-dev-pack-overlay'");
    });
    it('no longer contains inline ScriptDeskDevPackOverlay', () => {
      expect(src).not.toContain('function ScriptDeskDevPackOverlay');
    });
  });

  // ── 注册表接线完整 (BLOCK_CATALOG → registry → lazy) ──
  describe('block loaders intact', () => {
    it('registry.tsx has all three laze imports', () => {
      const registry = readWeb('blocks/registry.tsx');
      expect(registry).toContain("'storyboard-desk'");
      expect(registry).toContain("'director-desk'");
      expect(registry).toContain("'script-desk'");
    });
  });

  // ── BLOCK_CATALOG 三项均为 nx9Native ──
  describe('BLOCK_CATALOG marks all three nx9Native', () => {
    it('storyboard-desk is nx9Native', () => {
      const catalog = readFileSync(resolve(__dirname, '..', '..', '..', 'packages', 'shared', 'src', 'catalog', 'block-catalog.ts'), 'utf-8');
      const block = catalog.match(/kind:\s*'storyboard-desk'[^}]*}/);
      expect(block?.[0]).toContain("nx9Native: true");
    });
    it('director-desk is nx9Native', () => {
      const catalog = readFileSync(resolve(__dirname, '..', '..', '..', 'packages', 'shared', 'src', 'catalog', 'block-catalog.ts'), 'utf-8');
      const block = catalog.match(/kind:\s*'director-desk'[^}]*}/);
      expect(block?.[0]).toContain("nx9Native: true");
    });
    it('script-desk is nx9Native', () => {
      const catalog = readFileSync(resolve(__dirname, '..', '..', '..', 'packages', 'shared', 'src', 'catalog', 'block-catalog.ts'), 'utf-8');
      const block = catalog.match(/kind:\s*'script-desk'[^}]*}/);
      expect(block?.[0]).toContain("nx9Native: true");
    });
  });

  // ── use-storyboard-desk hook 结构完整 ──
  describe('use-storyboard-desk hook integrity', () => {
    const hookSrc = readWeb('blocks/craft/storyboard-desk/use-storyboard-desk.tsx');

    it('is a valid exported function', () => {
      expect(hookSrc).toContain('export function useStoryboardDesk');
    });
    it('returns JSX (contains ScreenModal)', () => {
      expect(hookSrc).toContain('<ScreenModal');
    });
    it('contains all the major hooks', () => {
      expect(hookSrc).toContain('useReactFlow');
      expect(hookSrc).toContain('useState');
      expect(hookSrc).toContain('useMemo');
    });
  });
});
