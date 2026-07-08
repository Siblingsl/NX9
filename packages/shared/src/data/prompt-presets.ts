export interface PromptPreset {
  id: string;
  label: string;
  text: string;
  group: string;
}

export const CINEMA_PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'cine-golden-hour',
    group: '光线',
    label: '黄金时刻',
    text: 'golden hour lighting, warm rim light, soft atmospheric haze, cinematic color grading',
  },
  {
    id: 'cine-noir',
    group: '光线',
    label: '黑色电影',
    text: 'film noir contrast, hard shadows, venetian blind light patterns, moody low-key lighting',
  },
  {
    id: 'cine-anamorphic',
    group: '镜头',
    label: '变形宽银幕',
    text: 'anamorphic lens flare, shallow depth of field, oval bokeh, widescreen cinematic framing',
  },
  {
    id: 'cine-handheld',
    group: '镜头',
    label: '手持纪实',
    text: 'subtle handheld camera movement, documentary realism, naturalistic blocking',
  },
  {
    id: 'cine-slowmo',
    group: '节奏',
    label: '慢动作张力',
    text: 'slow motion emphasis, suspended particles, dramatic pause, high frame rate clarity',
  },
  {
    id: 'cine-montage',
    group: '节奏',
    label: '快切蒙太奇',
    text: 'rhythmic montage editing, dynamic cuts on action beats, energetic pacing',
  },
  {
    id: 'cine-teal-orange',
    group: '调色',
    label: '青橙对比',
    text: 'teal and orange color contrast, blockbuster grading, rich skin tones against cool shadows',
  },
  {
    id: 'cine-desaturated',
    group: '调色',
    label: '低饱和史诗',
    text: 'desaturated palette with selective color accents, epic scale, restrained contrast',
  },
];

export const CAMERA_PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'cam-dolly-in',
    group: '推拉',
    label: '推镜',
    text: 'slow dolly in toward subject, increasing intimacy, steady cinematic push',
  },
  {
    id: 'cam-dolly-out',
    group: '推拉',
    label: '拉镜',
    text: 'dolly out reveal, widening context, subject shrinks in frame',
  },
  {
    id: 'cam-orbit',
    group: '环绕',
    label: '环绕',
    text: 'smooth 180-degree orbit around subject, parallax depth, consistent eye line',
  },
  {
    id: 'cam-crane-up',
    group: '升降',
    label: '升镜',
    text: 'crane up establishing shot, rising perspective, landscape reveal',
  },
  {
    id: 'cam-tracking',
    group: '横移',
    label: '横移跟拍',
    text: 'lateral tracking shot following subject, background motion blur, stable horizon',
  },
  {
    id: 'cam-whip-pan',
    group: '转场',
    label: '甩镜',
    text: 'whip pan transition, motion blur streak, energetic direction change',
  },
  {
    id: 'cam-fpv',
    group: '特殊',
    label: 'FPV 穿越',
    text: 'FPV drone fly-through, immersive first-person motion, agile banking turns',
  },
  {
    id: 'cam-static',
    group: '固定',
    label: '固定长镜头',
    text: 'locked-off static camera, tableau composition, action unfolds within frame',
  },
];
