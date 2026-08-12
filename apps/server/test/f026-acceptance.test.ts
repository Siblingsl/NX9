/**
 * F-026 acceptance test — 分镜线稿 vs 导演关键帧职责边界
 *
 * G1 验收清单:
 * - [x] 分镜不直接出关键帧成品
 * - [x] 导演为关键帧唯一批出主入口
 *
 * G2 主流程: 分镜台 UI → 线稿/试出（无"关键帧"标签）→ 导演台唯一"关键帧批出"
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

const SHOT_STORY_CELL = 'blocks/craft/storyboard-desk/shot-story-cell.tsx';
const USE_STORYBOARD_DESK = 'blocks/craft/storyboard-desk/use-storyboard-desk.tsx';
const DIRECTOR_MAIN_PANEL = 'blocks/core/director-desk/director-main-panel.tsx';
const DIRECTOR_RUNNER = 'engine/director-desk-runner.ts';
const DIRECTOR_DELIVER_TAB = 'blocks/core/director-desk/director-deliver-tab.tsx';
const HOME_NAV = 'pages/HomeNavPage.tsx';

describe('F-026 acceptance', () => {
  // ═══════════ source files ═══════════
  describe('source files exist', () => {
    const files = [
      SHOT_STORY_CELL,
      USE_STORYBOARD_DESK,
      DIRECTOR_MAIN_PANEL,
      DIRECTOR_RUNNER,
      DIRECTOR_DELIVER_TAB,
      HOME_NAV,
    ];
    for (const f of files) {
      it(f, () => {
        expect(fileExists(f)).toBe(true);
      });
    }
  });

  // ═══════════ shot-story-cell.tsx: no 试出, keep 线稿+编辑 ═══════════
  describe('shot-story-cell button labels', () => {
    const src = readWeb(SHOT_STORY_CELL);

    it('NO 试出 button', () => {
      expect(src).not.toContain('试出');
    });

    it('has 线稿 button', () => {
      expect(src).toContain('线稿');
    });

    it('has 编辑 button', () => {
      expect(src).toContain('编辑');
    });

    it('NO 关键帧 button text', () => {
      const buttonTexts = [...src.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)];
      const hasKeyframeLabel = buttonTexts.some((m) =>
        m[1].includes('关键帧'),
      );
      expect(hasKeyframeLabel).toBe(false);
    });

    it('NO 试出画面 tooltip', () => {
      expect(src).not.toContain('生成试出画面');
    });

    it('NO 关键帧成图 tooltip', () => {
      expect(src).not.toContain('生成关键帧成图');
    });
  });

  // ═══════════ use-storyboard-desk.tsx: no trial batchMode ═══════════
  describe('use-storyboard-desk batch mode', () => {
    const src = readWeb(USE_STORYBOARD_DESK);

    it("batchMode type is 'line-art' | 'grid-line-art' | null (no trial)", () => {
      expect(src).toContain("'line-art' | 'grid-line-art' | null");
    });

    it("batchMode type does NOT contain 'trial'", () => {
      expect(src).not.toMatch(/batchMode.*trial/);
    });

    it('NO 试出互斥 comment', () => {
      expect(src).not.toContain('试出互斥');
    });

    it('NO generateBatchTrials function', () => {
      expect(src).not.toContain('const generateBatchTrials = useCallback(');
    });

    it('NO setBatchMode trial', () => {
      expect(src).not.toContain("setBatchMode('trial')");
    });

    it('NO batchMode trial in compose', () => {
      expect(src).not.toContain("batchMode === 'trial'");
    });

    it('NO 批量试出 logs', () => {
      expect(src).not.toContain('批量试出');
    });

    it('NO 开始批量试出 log', () => {
      expect(src).not.toContain('开始批量试出');
    });
  });

  // ═══════════ use-storyboard-desk: hint text updated ═══════════
  describe('use-storyboard-desk hint and boundary text', () => {
    const src = readWeb(USE_STORYBOARD_DESK);
    const grid = readWeb('blocks/craft/storyboard-desk/grid-panel.tsx');
    const compose = readWeb('blocks/craft/storyboard-desk/compose-panel.tsx');
    const handoff = readWeb('blocks/craft/storyboard-desk/handoff-panel.tsx');

    it('says 彩色关键帧请到导演台批出 (updated from old text)', () => {
      expect(grid).toContain('彩色关键帧请到导演台批出');
    });

    it('NO old hint 整集关键帧请交导演台', () => {
      expect(src).not.toContain('整集关键帧请交导演台');
    });

    it('整集工业级关键帧在导演台批出', () => {
      expect(compose).toContain('整集工业级关键帧在导演台批出');
    });

    it('确认后导演台可按本集批出关键帧', () => {
      expect(handoff).toContain('确认后导演台可按本集批出关键帧');
    });

    it('已聚焦导演台 · 请开台批出关键帧', () => {
      expect(src).toContain('已聚焦导演台 · 交接数据已同步');
    });

    it('foot actions 无批量线稿按钮', () => {
      // 底栏改为时长提示；确认本集在交接页 / 顶栏，不与批量线稿并列
      const footStart = src.indexOf('sg3-foot');
      const footSection = src.slice(footStart, footStart + 1200);
      expect(footSection).not.toContain('批量线稿');
      expect(footSection).not.toContain('宫格线稿');
      expect(footSection).not.toContain('故事板大图');
      expect(footSection).not.toContain('去导演台批出');
      expect(handoff).toContain('确认本集');
      expect(src).toContain('确认本集');
    });
  });

  // ═══════════ DirectorDesk: confirmed as primary keyframe entry ═══════════
  describe('DirectorDesk is the primary keyframe batch entry', () => {
    const panel = readWeb(DIRECTOR_MAIN_PANEL);
    const runner = readWeb(DIRECTOR_RUNNER);
    const deliver = readWeb(DIRECTOR_DELIVER_TAB);

    it('director-main-panel has 关键帧 tab button', () => {
      expect(panel).toContain('关键帧');
    });

    it('director-main-panel has previewMode keyframe', () => {
      expect(panel).toContain("'keyframe'");
    });

    it('director-main-panel has 批出按钮', () => {
      expect(panel).toContain('批出设置');
    });

    it('director-desk-runner has runDirectorDeskBatch', () => {
      expect(runner).toContain('runDirectorDeskBatch');
    });

    it('director-desk-runner comment says 关键帧批生产', () => {
      expect(runner).toContain('关键帧批生产');
    });

    it('director-deliver-tab has keyframeGatePassed', () => {
      expect(deliver).toContain('keyframeGatePassed');
    });

    it('director-deliver-tab says 批审关键帧', () => {
      expect(deliver).toContain('批审关键帧');
    });

    it('director-deliver-tab says 推送关键帧', () => {
      expect(deliver).toContain('推送关键帧');
    });
  });

  // ═══════════ HomeNavPage: branding correct ═══════════
  describe('HomeNavPage branding', () => {
    const src = readWeb(HOME_NAV);

    it('says 分镜台线稿 + 导演台关键帧', () => {
      expect(src).toContain('分镜台线稿 + 导演台关键帧');
    });
  });
});
