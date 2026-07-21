import type { StoryboardPreviewFrame, StoryboardShot } from '@nx9/shared';

export type BoardChipTone = 'cam' | 'light' | 'grade' | 'audio' | 'compose' | 'action' | 'emotion' | 'note';

export type BoardChip = {
  tone: BoardChipTone;
  text: string;
};

export type StoryboardBoardMeta = {
  index: number;
  title: string;
  dialogue: string | null;
  body: string;
  chips: BoardChip[];
};

function shortTitle(raw: string, max = 14): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function pushChip(list: BoardChip[], tone: BoardChipTone, value?: string | null) {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return;
  if (list.some((c) => c.text === text)) return;
  list.push({ tone, text });
}

/** 从镜头 + 预览帧推导「专业故事板格」展示元数据 */
export function resolveStoryboardBoardMeta(
  shot: StoryboardShot | null | undefined,
  frame?: StoryboardPreviewFrame | null,
): StoryboardBoardMeta {
  const index = frame?.order ?? (shot ? shot.index + 1 : 0);
  const body =
    shot?.descriptionZh?.trim()
    || frame?.promptSummary?.trim()
    || shot?.promptEn?.trim()
    || '';

  const title =
    shot?.sceneName?.trim()
    || (shot?.sceneCode ? `场 ${shot.sceneCode}` : '')
    || shortTitle(body, 16)
    || frame?.label
    || `分镜 ${index}`;

  const dialogue =
    shot?.subtitleText?.trim()
    || null;

  const chips: BoardChip[] = [];
  pushChip(chips, 'cam', shot?.cameraMove);
  pushChip(chips, 'light', shot?.lighting);
  pushChip(chips, 'grade', shot?.colorGrade);
  pushChip(chips, 'emotion', shot?.subtitleText);
  pushChip(chips, 'audio', shot?.audioDirection);
  if (shot?.notes?.trim()) {
    for (const part of shot.notes.split(/[/|·•]/).map((s) => s.trim()).filter(Boolean)) {
      const tone: BoardChipTone =
        /虚化|三分|留白|前景|构图|对角线/.test(part)
          ? 'compose'
          : /跑|奔|转|动作|表演/.test(part)
            ? 'action'
            : 'note';
      pushChip(chips, tone, part.slice(0, 24));
      if (chips.length >= 4) break;
    }
  }
  if (chips.length === 0 && shot?.shotType && shot.shotType !== 'custom') {
    const typeLabel: Record<string, string> = {
      close: '近景',
      medium: '中景',
      wide: '全景',
      'extreme-wide': '大远景',
    };
    pushChip(chips, 'cam', typeLabel[shot.shotType] ?? shot.shotType);
  }
  if (chips.length === 0 && body) {
    pushChip(chips, 'note', shortTitle(body, 22));
  }

  return {
    index,
    title,
    dialogue,
    body,
    chips: chips.slice(0, 4),
  };
}
