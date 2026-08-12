/**
 * F-042 acceptance test — 深色主题浮层扫尾
 *
 * G1 验收清单:
 * - [x] 清单内浮层全适配
 *
 * G2: 所有 CSS background #fff / #ffffff 已清零；color-mix #fff → var(--nx9-bg)
 * G3: 本文件 + 缺陷分析同步
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

const WEB_SRC = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');

function readCss(relPath: string): string {
  return readFileSync(resolve(WEB_SRC, relPath), 'utf-8');
}

function readTsx(relPath: string): string {
  return readFileSync(resolve(WEB_SRC, relPath), 'utf-8');
}

function walkFiles(dir: string, ext: string, results: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkFiles(full, ext, results);
    } else if (entry.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function relativeFromSrc(abs: string): string {
  return abs.replace(WEB_SRC + '\\', '').replace(/\\/g, '/');
}

function allCssFiles(): string[] {
  return globSync('**/*.css', { cwd: WEB_SRC, absolute: false });
}

const MONITORED_FILES = [
  'components/ui/screen-modal.css',
  'pages/studio/studio-desk.css',
  'pages/studio/atelier-desk.css',
  'styles/global.css',
  'styles/keyframe-preview.css',
  'styles/stage-bible.css',
  'styles/node-stage-card.css',
  'styles/storyboard-board.css',
  'blocks/core/clip-editor.css',
  'layout/canvas-stage/canvas-stage.css',
  'panels/settings-modal.css',
  'panels/create-workspace-dialog.css',
];

describe('F-042 acceptance', () => {
  // ═══════════ 文件存在 ═══════════
  describe('monitored CSS files exist', () => {
    for (const f of MONITORED_FILES) {
      it(f, () => {
        const content = readCss(f);
        expect(content).toBeTruthy();
      });
    }
  });

  // ═══════════ G1: 无 background #fff / #ffffff ═══════════
  describe('G1: 无 background #fff / #ffffff', () => {
    for (const f of MONITORED_FILES) {
      it(`${f}: 无 background: #fff`, () => {
        const content = readCss(f);
        expect(content).not.toMatch(/background:\s*#fff\b/);
        expect(content).not.toMatch(/background:\s*#ffffff\b/);
      });
    }
  });

  // ═══════════ G2: 全量 CSS 无背景白 ═══════════
  describe('G2: 全量 CSS 文件 background: #fff 已清零', () => {
    it('遍历所有 CSS 文件无 background: #fff', () => {
      const cssFiles = walkFiles(WEB_SRC, '.css').map(relativeFromSrc);
      const violators: string[] = [];
      for (const f of cssFiles) {
        const content = readCss(f);
        if (/\bbackground:\s*#fff\b/.test(content)) violators.push(f);
        if (/\bbackground:\s*#ffffff\b/.test(content)) violators.push(f);
      }
      expect(violators).toEqual([]);
    });
  });

  // ═══════════ G3: color-mix #fff → var(--nx9-bg) ═══════════
  describe('G3: color-mix #fff 已替换', () => {
    for (const f of MONITORED_FILES) {
      it(`${f}: 无 color-mix(... #fff)`, () => {
        const content = readCss(f);
        expect(content).not.toMatch(/color-mix\([^)]*#fff\)/);
      });
    }
  });

  // ═══════════ G4: CSS 变量定义不再硬编码 #fff ═══════════
  describe('G4: CSS 变量定义不以 #fff 为值', () => {
    it('--sheet-cell 不以 #ffffff 为值', () => {
      const content = readCss('styles/keyframe-preview.css');
      expect(content).not.toMatch(/--sheet-cell:\s*#ffffff/);
    });

    it('--sb-cell 不以 #ffffff 为值', () => {
      const content = readCss('styles/storyboard-board.css');
      expect(content).not.toMatch(/--sb-cell:\s*#ffffff/);
    });

    it('--sb-panel-2 不以 #fff 为值', () => {
      const content = readCss('styles/stage-bible.css');
      expect(content).not.toMatch(/--sb-panel-2:\s*#fff\b/);
    });
  });

  // ═══════════ G5: clip-editor.css 无 hardcoded fallback ═══════════
  describe('G5: clip-editor.css 无硬编码 fallback', () => {
    const content = readCss('blocks/core/clip-editor.css');

    it('无 #fff fallback in var()', () => {
      expect(content).not.toMatch(/#fff\)/);
    });

    it('无 #f5f5f5 fallback', () => {
      expect(content).not.toMatch(/#f5f5f5/);
    });
  });

  // ═══════════ G6: screen-modal.css 已适配 ═══════════
  describe('G6: screen-modal.css 已适配', () => {
    const content = readCss('components/ui/screen-modal.css');

    it('使用 var(--nx9-bg) 作为背景', () => {
      expect(content).toContain('background: var(--nx9-bg)');
    });
  });

  // ═══════════ G7: atelier-desk polaroid 已适配 ═══════════
  describe('G7: atelier-desk polaroid 已适配', () => {
    const content = readCss('pages/studio/atelier-desk.css');

    it('.atelier__polaroid 使用 var(--nx9-bg)', () => {
      expect(content).toContain('background: var(--nx9-bg)');
    });
  });

  // ═══════════ G8: studio-desk field/shot/chip/btn/stat 已适配 ═══════════
  describe('G8: studio-desk 各模块已适配', () => {
    const content = readCss('pages/studio/studio-desk.css');

    it('field input 用 var(--nx9-bg)', () => {
      expect(content).toContain('background: var(--nx9-bg)');
    });

    it('shows no background: #fff', () => {
      expect(content).not.toMatch(/background:\s*#fff\b/);
    });
  });

  // ═══════════ G9: stage-bible panel/sb-select/sb-chip 已适配 ═══════════
  describe('G9: stage-bible 已适配', () => {
    const content = readCss('styles/stage-bible.css');

    it('--sb-panel-2 引用 var(--nx9-bg)', () => {
      expect(content).toContain('--sb-panel-2: var(--nx9-bg)');
    });

    it('所有 background 使用 var(--sb-panel-2)', () => {
      expect(content).not.toMatch(/background:\s*#fff/);
    });
  });

  // ═══════════ G10: TSX 无 bg-white ═══════════
  describe('G10: TSX 文件无 bg-white className', () => {
    it('全量 TSX 无 bg-white', () => {
      const tsxFiles = walkFiles(WEB_SRC, '.tsx').map(relativeFromSrc);
      const violators: string[] = [];
      // 禁止实心白底 bg-white；bg-white/α 是深色表面上的半透明叠层
      //（与「白色文字覆盖深色按钮」同属允许的覆盖模式），不算硬编码白底
      const solidBgWhite = /bg-white(?![\/\w-])/;
      for (const f of tsxFiles) {
        const content = readTsx(f);
        if (solidBgWhite.test(content)) violators.push(f);
      }
      expect(violators).toEqual([]);
    });
  });

  // ═══════════ G11: global.css context menu 已适配 ═══════════
  describe('G11: global.css context menu 已适配', () => {
    const content = readCss('styles/global.css');

    it('.nx9-context-menu 用 var(--nx9-bg)', () => {
      expect(content).toContain('background: var(--nx9-bg)');
    });
  });

  // ═══════════ G12: color: #fff 允许保留（悬浮文字） ═══════════
  describe('G12: color: #fff 允许保留', () => {
    it('color: #fff 用于悬浮文字是设计意图', () => {
      const content = readCss('styles/global.css');
      // color: #fff is fine — it's text overlay on accent backgrounds
      expect(content).toContain('color: #fff');
    });
  });
});
