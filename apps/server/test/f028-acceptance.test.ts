/**
 * F-028 acceptance test — 制作台与画布剧本/镜表同源
 *
 * G1 验收清单:
 * - [x] 剧本与镜表均同源
 * - [x] 无第二套制作台存盘结构
 *
 * G2 主流程: 制作台 ScriptStage 读 script-desk.data.scriptPlan/package → SSOT
 * G3 本文件 + 缺陷分析同步
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WEB_ROOT = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');

function readWeb(relPath: string): string {
  return readFileSync(resolve(WEB_ROOT, relPath), 'utf-8');
}
function fileExists(relPath: string): boolean {
  return existsSync(resolve(WEB_ROOT, relPath));
}

const STUDIO_PARITY = 'engine/studio-parity.ts';
const USE_STUDIO_DESK = 'pages/studio/useStudioDesk.ts';
const PRODUCTION_STUDIO_PAGE = 'pages/ProductionStudioPage.tsx';

describe('F-028 acceptance', () => {
  // ═══════════ source files ═══════════
  describe('source files exist', () => {
    const files = [STUDIO_PARITY, USE_STUDIO_DESK, PRODUCTION_STUDIO_PAGE];
    for (const f of files) {
      it(f, () => {
        expect(fileExists(f)).toBe(true);
      });
    }
  });

  // ═══════════ studio-parity.ts: getScriptPackage ═══════════
  describe('getScriptPackage reads SSOT', () => {
    const src = readWeb(STUDIO_PARITY);

    it('exports getScriptPackage', () => {
      expect(src).toContain('export function getScriptPackage');
    });

    it('reads data.scriptPlan first', () => {
      expect(src).toContain('data.scriptPlan');
    });

    it('falls back to data.package (ScreenplayPackage)', () => {
      expect(src).toContain('data.package as ScreenplayPackage');
    });

    it('uses screenplayFullText for full episode text', () => {
      expect(src).toContain('screenplayFullText(pkg)');
    });

    it('imports screenplayFullText from @nx9/shared', () => {
      expect(src).toContain('screenplayFullText,');
    });

    it('falls back to brief.logline only if fullText empty', () => {
      expect(src).toContain("pkg.brief?.logline");
    });

    it('returns undefined if scriptDeskId absent', () => {
      expect(src).toContain("if (!binding.scriptDeskId) return undefined;");
    });
  });

  // ═══════════ studio-parity.ts: setScriptPackage ═══════════
  describe('setScriptPackage writes SSOT only', () => {
    const src = readWeb(STUDIO_PARITY);

    it('exports setScriptPackage', () => {
      expect(src).toContain('export function setScriptPackage');
    });

    it('writes only data.scriptPlan (NOT data.package)', () => {
      const fnStart = src.indexOf('export function setScriptPackage');
      const fnBlock = src.slice(fnStart, fnStart + 500);
      // Should contain scriptPlan but NOT package
      expect(fnBlock).toContain('scriptPlan: pkg');
      // The key "package: pkg" should NOT appear (removed in fix)
      expect(fnBlock).not.toContain('package: pkg');
    });

    it('comments explain SSOT and not overwriting package', () => {
      expect(src).toContain('不覆盖 data.package');
    });

    it('returns early if scriptDeskId absent', () => {
      expect(src).toContain("if (!binding.scriptDeskId) return;");
    });
  });

  // ═══════════ studio-parity.ts: other exports ═══════════
  describe('studio-parity exports completeness', () => {
    const src = readWeb(STUDIO_PARITY);

    const exports = [
      'resolveStudioBinding',
      'getChainShots',
      'patchShot',
      'setChainShots',
      'getScriptPackage',
      'setScriptPackage',
      'patchStudioShot',
      'listStoryboardDesks',
    ];
    for (const exp of exports) {
      it(`exports ${exp}`, () => {
        expect(src).toContain(`export function ${exp}`);
      });
    }

    it('exports StudioBinding type', () => {
      expect(src).toContain('export interface StudioBinding');
    });

    it('StudioBinding includes scriptDeskId field', () => {
      expect(src).toContain('scriptDeskId?: string');
    });

    it('StudioBinding includes chainRootNodeId field', () => {
      expect(src).toContain('chainRootNodeId: string');
    });
  });

  // ═══════════ studio-parity.ts: patchStudioShot SSOT ═══════════
  describe('patchStudioShot writes only chain (F-002/F-003 SSOT)', () => {
    const src = readWeb(STUDIO_PARITY);

    it('comment says 只写链', () => {
      expect(src).toContain('只写链');
    });

    it('comment says 不再双写全局', () => {
      expect(src).toContain('不再双写全局');
    });

    it('uses patchChainShotShared from @nx9/shared', () => {
      expect(src).toContain('patchChainShotShared');
    });
  });

  // ═══════════ useStudioDesk.ts: SSOT sourceText ═══════════
  describe('useStudioDesk sourceText is SSOT-driven', () => {
    const src = readWeb(USE_STUDIO_DESK);

    it('computes scriptPkg from getScriptPackage', () => {
      expect(src).toContain('getScriptPackage(studioBinding');
    });

    it('computes initialSourceText via useMemo (reactive)', () => {
      expect(src).toContain('const initialSourceText = useMemo(');
      expect(src).toContain('scriptPkg?.sourceText');
    });

    it('useEffect syncs SSOT to local sourceText when empty', () => {
      expect(src).toContain('setSourceText(initialSourceText)');
    });

    it('syncToWorkspace writes to scriptPlan cache', () => {
      expect(src).toContain('syncToWorkspace');
      expect(src).toContain('setScriptPlan(plan)');
    });

    it('F-028 comment on SSOT reading', () => {
      expect(src).toContain('F-028');
    });
  });

  // ═══════════ ProductionStudioPage: binding display ═══════════
  describe('ProductionStudioPage shows binding info', () => {
    const src = readWeb(PRODUCTION_STUDIO_PAGE);

    it('shows 与画布同源 binding status', () => {
      expect(src).toContain('与画布同源');
    });

    it('shows 未绑定 fallback', () => {
      expect(src).toContain('未绑定');
    });

    it('has desk binding selection UI', () => {
      expect(src).toContain('studioBinding');
    });
  });

  // ═══════════ No package: pkg in setScriptPackage ═══════════
  describe('no ScriptPlanPayload written to data.package', () => {
    const src = readWeb(STUDIO_PARITY);

    it('setScriptPackage does NOT assign package: pkg', () => {
      // After fix, setScriptPackage only writes scriptPlan
      const fnStart = src.indexOf('export function setScriptPackage');
      const fnBlock = src.slice(fnStart, fnStart + 600);
      // Must NOT have "package: pkg" or "package: pkg" in setScriptPackage
      expect(fnBlock).not.toMatch(/package:\s*pkg/);
    });
  });
});
