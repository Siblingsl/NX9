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

  // ═══════════ shot-story-cell.tsx: no "关键帧" button ═══════════
  describe('shot-story-cell button labels', () => {
    const src = readWeb(SHOT_STORY_CELL);

    it('has 试出 button', () => {
      expect(src).toContain('试出');
    });

    it('has 线稿 button', () => {
      expect(src).toContain('线稿');
    });

    it('has 编辑 button', () => {
      expect(src).toContain('编辑');
    });

    it('NO 关键帧 button text', () => {
      // The button label should not say "关键帧"
      const buttonTexts = [...src.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)];
      const hasKeyframeLabel = buttonTexts.some((m) =>
        m[1].includes('关键帧'),
      );
      expect(hasKeyframeLabel).toBe(false);
    });

    it('试出 button tooltip says 试出画面', () => {
      expect(src).toContain('生成试出画面');
    });

    it('NO 关键帧成图 tooltip', () => {
      expect(src).not.toContain('生成关键帧成图');
    });
  });

  // ═══════════ use-storyboard-desk.tsx: batchMode → trial ═══════════
  describe('use-storyboard-desk batch mode', () => {
    const src = readWeb(USE_STORYBOARD_DESK);

    it("batchMode type is 'line-art' | 'trial'", () => {
      expect(src).toContain("'line-art' | 'trial'");
    });

    it("batchMode type does NOT contain 'keyframe'", () => {
      expect(src).not.toMatch(/'line-art'\s*\|\s*'keyframe'/);
    });

    it('comment says 试出互斥', () => {
      expect(src).toContain('试出互斥');
    });

    it('function renamed generateBatchTrials', () => {
      expect(src).toContain('const generateBatchTrials = useCallback(');
    });

    it('function NOT named generateBatchKeyframes', () => {
      expect(src).not.toContain('generateBatchKeyframes');
    });

    it("setBatchMode('trial') exists", () => {
      expect(src).toContain("setBatchMode('trial')");
    });

    it("setBatchMode('keyframe') removed", () => {
      expect(src).not.toContain("setBatchMode('keyframe')");
    });

    it("batchMode === 'trial' used in compose tab", () => {
      expect(src).toContain("batchMode === 'trial'");
    });

    it('log says 批量试出 (not 批量关键帧)', () => {
      expect(src).not.toContain('批量关键帧');
    });

    it('log says 批量试出前请先连接', () => {
      expect(src).toContain('批量试出前请先连接');
    });

    it('log says 开始批量试出', () => {
      expect(src).toContain('开始批量试出');
    });

    it('log says 批量试出跳过', () => {
      expect(src).toContain('批量试出跳过');
    });

    it('log says 批量试出失败', () => {
      expect(src).toContain('批量试出失败');
    });

    it('log says 批量试出完成', () => {
      expect(src).toContain('批量试出完成');
    });

    it('toast says 批量试出完成', () => {
      expect(src).toMatch(/toastSuccess\(`批量试出完成/);
    });

    it('placeholder says 画面: instead of 关键帧:', () => {
      expect(src).toContain('画面：环境、人物位置、光线、情绪、构图');
    });
  });

  // ═══════════ use-storyboard-desk: remaining 关键帧 correctly attributed ═══════════
  describe('remaining 关键帧 references are DirectorDesk-bound', () => {
    const src = readWeb(USE_STORYBOARD_DESK);

    it('整集关键帧请交导演台', () => {
      expect(src).toContain('整集关键帧请交导演台');
    });

    it('整集工业级关键帧在导演台批出', () => {
      expect(src).toContain('整集工业级关键帧在导演台批出');
    });

    it('确认后导演台可按本集批出关键帧', () => {
      expect(src).toContain('确认后导演台可按本集批出关键帧');
    });

    it('已聚焦导演台 · 请开台批出关键帧', () => {
      expect(src).toContain('已聚焦导演台 · 请开台批出关键帧');
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
