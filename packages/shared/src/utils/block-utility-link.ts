/**
 * block-utility-link.ts — 工具节点与主链 desk 自动衔接（F-036）。
 *
 * 从 desk 选镜 → spawn/focus 工具节点并自动连边 → 报告项可「打回镜头」写 shot 状态。
 */
import type { StoryboardShot } from '../types/storyboard';

export interface UtilityBlockDef {
  kind: string;
  label: string;
  description: string;
  /** 在 desk 工具菜单中的分类 */
  category: 'continuity' | 'caption' | 'inpaint' | 'grid';
}

export const UTILITY_BLOCKS: UtilityBlockDef[] = [
  { kind: 'continuity-check', label: '连贯性检查', description: '检查角色、场景、道具连贯性', category: 'continuity' },
  { kind: 'caption-asr', label: '字幕生成/ASR', description: '自动语音识别与字幕生成', category: 'caption' },
  { kind: 'inpaint-edit', label: '局部重绘', description: '选定区域重新生成画面', category: 'inpaint' },
  { kind: 'grid-compose', label: '宫格合成', description: '多镜头合成宫格图', category: 'grid' },
];

/**
 * 根据工具节点的报告项打回镜头。
 */
export function applyShotReviewFromReport(
  shots: StoryboardShot[],
  targetShotIds: string[],
  note: string,
): StoryboardShot[] {
  return shots.map((shot) =>
    targetShotIds.includes(shot.id)
      ? {
          ...shot,
          keyframeStatus: 'failed' as const,
          keyframeReviewNote: note,
          status: 'failed' as const,
        }
      : shot,
  );
}
