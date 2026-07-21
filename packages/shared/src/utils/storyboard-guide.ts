import type { StoryboardShot } from '../types/storyboard';
import {
  emptyStoryboardGuideOverlay,
  type StoryboardGuideArrow,
  type StoryboardGuideMark,
  type StoryboardGuideOverlay,
} from '../types/storyboard-guide';

function uid(prefix: string, i: number): string {
  return `${prefix}-${i}`;
}

function clipText(text: string, max = 18): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function hasAny(text: string, keys: string[]): boolean {
  return keys.some((k) => text.includes(k));
}

/** 从运镜文案推断蓝色摄像机箭头 */
function cameraArrowsFromMove(move: string, baseId: number): StoryboardGuideArrow[] {
  const m = move.toLowerCase();
  const arrows: StoryboardGuideArrow[] = [];
  const label = clipText(move, 14);

  if (hasAny(m, ['推', 'dolly in', 'push in', 'zoom in', '推进'])) {
    arrows.push({
      id: uid('cam', baseId),
      kind: 'camera',
      x1: 0.22,
      y1: 0.78,
      x2: 0.48,
      y2: 0.48,
      label: label || '推镜',
    });
  } else if (hasAny(m, ['拉', 'dolly out', 'pull out', 'zoom out', '拉远', '后拉'])) {
    arrows.push({
      id: uid('cam', baseId),
      kind: 'camera',
      x1: 0.48,
      y1: 0.48,
      x2: 0.18,
      y2: 0.82,
      label: label || '拉镜',
    });
  } else if (hasAny(m, ['摇', 'pan', '横摇', '环摇'])) {
    arrows.push({
      id: uid('cam', baseId),
      kind: 'camera',
      x1: 0.18,
      y1: 0.72,
      x2: 0.82,
      y2: 0.68,
      curve: -0.18,
      label: label || '横摇',
    });
  } else if (hasAny(m, ['跟', 'follow', 'tracking', '跟拍', '手持'])) {
    arrows.push({
      id: uid('cam', baseId),
      kind: 'camera',
      x1: 0.12,
      y1: 0.8,
      x2: 0.55,
      y2: 0.72,
      curve: 0.08,
      label: label || '跟拍',
    });
  } else if (hasAny(m, ['仰', 'tilt up', '仰拍'])) {
    arrows.push({
      id: uid('cam', baseId),
      kind: 'camera',
      x1: 0.2,
      y1: 0.85,
      x2: 0.28,
      y2: 0.35,
      curve: 0.12,
      label: label || '仰拍',
    });
  } else if (hasAny(m, ['俯', 'tilt down', '俯拍', '俯视'])) {
    arrows.push({
      id: uid('cam', baseId),
      kind: 'camera',
      x1: 0.25,
      y1: 0.28,
      x2: 0.35,
      y2: 0.78,
      label: label || '俯拍',
    });
  } else if (move.trim()) {
    arrows.push({
      id: uid('cam', baseId),
      kind: 'camera',
      x1: 0.15,
      y1: 0.78,
      x2: 0.62,
      y2: 0.7,
      label,
    });
  }
  return arrows;
}

/** 从光影文案推断橙色照明箭头 */
function lightArrowsFromLighting(lighting: string, baseId: number): StoryboardGuideArrow[] {
  const t = lighting.toLowerCase();
  if (!lighting.trim()) return [];
  const label = clipText(lighting, 12);

  if (hasAny(t, ['侧逆', '逆光', 'backlight', 'rim'])) {
    return [
      {
        id: uid('lit', baseId),
        kind: 'light',
        x1: 0.88,
        y1: 0.12,
        x2: 0.55,
        y2: 0.42,
        label: label || '侧逆光',
      },
    ];
  }
  if (hasAny(t, ['顶光', '顶', 'overhead', 'top light'])) {
    return [
      {
        id: uid('lit', baseId),
        kind: 'light',
        x1: 0.5,
        y1: 0.06,
        x2: 0.5,
        y2: 0.38,
        label: label || '顶光',
      },
    ];
  }
  if (hasAny(t, ['侧光', 'side'])) {
    return [
      {
        id: uid('lit', baseId),
        kind: 'light',
        x1: 0.08,
        y1: 0.35,
        x2: 0.4,
        y2: 0.48,
        label: label || '侧光',
      },
    ];
  }
  return [
    {
      id: uid('lit', baseId),
      kind: 'light',
      x1: 0.78,
      y1: 0.18,
      x2: 0.52,
      y2: 0.45,
      label,
    },
  ];
}

/** 从描述推断红色动作箭头 */
function actionArrowsFromText(text: string, baseId: number): StoryboardGuideArrow[] {
  const t = text.toLowerCase();
  if (!text.trim()) return [];
  if (hasAny(t, ['跑', '奔', '冲', '逃', '追', '跑向', '奔向'])) {
    return [
      {
        id: uid('act', baseId),
        kind: 'action',
        x1: 0.35,
        y1: 0.7,
        x2: 0.72,
        y2: 0.42,
        label: clipText(text, 10) || '奔赴',
      },
    ];
  }
  if (hasAny(t, ['转', '回头', '转身', '扭头', '看向'])) {
    return [
      {
        id: uid('act', baseId),
        kind: 'action',
        x1: 0.42,
        y1: 0.48,
        x2: 0.68,
        y2: 0.4,
        curve: 0.15,
        label: clipText(text, 10) || '转向',
      },
    ];
  }
  if (hasAny(t, ['落', '下', '蹲', '跪', '摔', '坠落'])) {
    return [
      {
        id: uid('act', baseId),
        kind: 'action',
        x1: 0.55,
        y1: 0.28,
        x2: 0.58,
        y2: 0.72,
        label: clipText(text, 10) || '下落',
      },
    ];
  }
  if (hasAny(t, ['指', '伸', '抬手', '举手', '递'])) {
    return [
      {
        id: uid('act', baseId),
        kind: 'action',
        x1: 0.4,
        y1: 0.55,
        x2: 0.7,
        y2: 0.38,
        label: clipText(text, 10) || '动作',
      },
    ];
  }
  // 默认轻微动作提示（有描述时）
  if (text.length >= 6) {
    return [
      {
        id: uid('act', baseId),
        kind: 'action',
        x1: 0.38,
        y1: 0.62,
        x2: 0.62,
        y2: 0.45,
        label: clipText(text, 8),
      },
    ];
  }
  return [];
}

/**
 * 由镜头字段自动生成导引标注。
 * 已有 guideOverlay 且非空时优先用用户数据。
 */
export function resolveStoryboardGuideOverlay(
  shot: Pick<
    StoryboardShot,
    | 'guideOverlay'
    | 'cameraMove'
    | 'lighting'
    | 'colorGrade'
    | 'descriptionZh'
    | 'promptEn'
    | 'subtitleText'
    | 'audioDirection'
    | 'notes'
    | 'sceneName'
    | 'shotType'
  >,
): StoryboardGuideOverlay {
  if (
    shot.guideOverlay
    && (shot.guideOverlay.arrows.length > 0 || shot.guideOverlay.marks.length > 0)
  ) {
    return shot.guideOverlay;
  }
  return buildStoryboardGuideOverlayFromShot(shot);
}

export function buildStoryboardGuideOverlayFromShot(
  shot: Pick<
    StoryboardShot,
    | 'cameraMove'
    | 'lighting'
    | 'colorGrade'
    | 'descriptionZh'
    | 'promptEn'
    | 'subtitleText'
    | 'audioDirection'
    | 'notes'
    | 'sceneName'
    | 'shotType'
  >,
): StoryboardGuideOverlay {
  const arrows: StoryboardGuideArrow[] = [];
  const marks: StoryboardGuideMark[] = [];
  let n = 0;

  const body = (shot.descriptionZh || shot.promptEn || '').trim();
  const cam = (shot.cameraMove || '').trim();
  const light = (shot.lighting || '').trim();

  arrows.push(...cameraArrowsFromMove(cam, n++));
  arrows.push(...lightArrowsFromLighting(light, n++));
  arrows.push(...actionArrowsFromText(body, n++));

  // 构图绿标
  const composeBits: string[] = [];
  if (shot.notes?.trim()) {
    for (const part of shot.notes.split(/[/|·•,，]/).map((s) => s.trim()).filter(Boolean)) {
      if (/虚化|三分|留白|前景|对角线|构图|景深|居中|包围/.test(part)) {
        composeBits.push(part);
      }
    }
  }
  if (/虚化|前景|三分|留白|对角线/.test(body)) {
    composeBits.push(clipText(body.match(/.{0,6}(虚化|前景|三分|留白|对角线).{0,6}/)?.[0] || '构图', 14));
  }
  if (composeBits.length === 0 && shot.shotType && shot.shotType !== 'custom') {
    const typeLabel: Record<string, string> = {
      close: '近景',
      medium: '中景',
      wide: '全景',
      'extreme-wide': '大远景',
    };
    composeBits.push(typeLabel[shot.shotType] ?? shot.shotType);
  }
  composeBits.slice(0, 2).forEach((text, i) => {
    marks.push({
      id: uid('cmp', i),
      kind: 'compose',
      x: i === 0 ? 0.78 : 0.18,
      y: i === 0 ? 0.88 : 0.9,
      text: clipText(text, 16),
      align: i === 0 ? 'end' : 'start',
    });
  });

  // 色调橙标（非箭头）
  if (shot.colorGrade?.trim()) {
    marks.push({
      id: uid('grd', 0),
      kind: 'light',
      x: 0.12,
      y: 0.12,
      text: clipText(shot.colorGrade, 14),
      align: 'start',
    });
  }

  // 台词/情绪紫
  const emotion =
    shot.subtitleText?.trim()
    || shot.audioDirection?.trim()
    || '';
  if (emotion) {
    marks.push({
      id: uid('emo', 0),
      kind: 'emotion',
      x: 0.86,
      y: 0.16,
      text: clipText(emotion, 22),
      align: 'end',
    });
  }

  // 黑色镜头说明（无时间戳）— 优先场景名/短描述
  const label =
    shot.sceneName?.trim()
    || clipText(body, 16)
    || '';
  if (label) {
    marks.push({
      id: uid('lbl', 0),
      kind: 'label',
      x: 0.04,
      y: 0.08,
      text: label,
      align: 'start',
    });
  }

  if (arrows.length === 0 && marks.length === 0) {
    return emptyStoryboardGuideOverlay();
  }
  return { version: 1, arrows, marks };
}

/** 写入视频提示：解读导引、禁止画出箭头 */
export function buildVideoGuidePromptSuffix(overlay: StoryboardGuideOverlay): string {
  const parts: string[] = [];
  for (const a of overlay.arrows) {
    const dir =
      a.kind === 'action'
        ? 'character action direction'
        : a.kind === 'camera'
          ? 'camera move'
          : 'light direction';
    parts.push(`${dir}${a.label ? `: ${a.label}` : ''}`);
  }
  for (const m of overlay.marks) {
    if (m.kind === 'label') continue;
    parts.push(`${m.kind}: ${m.text}`);
  }
  const guide = parts.length ? `Motion & staging guides from annotated reference: ${parts.join('; ')}.` : '';
  return [
    guide,
    'The reference still may include colored arrows and annotation marks used only as director guidance.',
    'Do NOT render any arrows, colored guide lines, annotation labels, UI marks, timestamps, or storyboard text in the video frames.',
    'Keep environment photoreal / production-real; arrows strengthen intent only and must stay invisible in output.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** 关键帧出图：禁止把箭头画进像素 */
export function buildKeyframeNoGuidePromptSuffix(): string {
  return [
    'Keep environment realistic and continuous with production bible.',
    'Clean storyboard still only: no arrows, no colored guide lines, no annotation labels, no UI chrome, no timestamps, no multi-panel grid text.',
  ].join(' ');
}
