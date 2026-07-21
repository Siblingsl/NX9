export type StudioHub = 'episodes' | 'assets' | 'produce';

export type StudioStepId =
  | 'script'
  | 'storyboard'
  | 'preview' // 分镜预览图（故事板 keyframe）
  | 'review'
  | 'video'
  | 'voice'
  | 'export';

export interface StudioStepDef {
  id: StudioStepId;
  index: number;
  label: string;
  short: string;
  hint: string;
  doneHint: string;
}

/**
 * 本集制作流水线（独立于画布节点隐喻）
 * preview = 分镜预览图 / 故事板静帧，不是成片
 */
export const STUDIO_STEPS: StudioStepDef[] = [
  {
    id: 'script',
    index: 1,
    label: '剧本',
    short: '剧本',
    hint: '粘贴本集剧本，AI/规则拆镜并同步角色场景',
    doneHint: '已有本集文本或镜头',
  },
  {
    id: 'storyboard',
    index: 2,
    label: '分镜表',
    short: '分镜',
    hint: '编辑景别、运镜、色调、声音与专业提示词',
    doneHint: '本集 ≥1 镜',
  },
  {
    id: 'preview',
    index: 3,
    label: '分镜预览',
    short: '预览图',
    hint: '生成分镜预览图（每镜关键帧静帧，标注起止秒；非成片）',
    doneHint: '本集镜头均有预览图',
  },
  {
    id: 'review',
    index: 4,
    label: '批审',
    short: '批审',
    hint: '通过/退回分镜预览图，通过后方可出视频',
    doneHint: '有图镜头均已批准',
  },
  {
    id: 'video',
    index: 5,
    label: '镜头视频',
    short: '视频',
    hint: '按批审预览图与运镜提示词生成镜头视频',
    doneHint: '本集均有视频',
  },
  {
    id: 'voice',
    index: 6,
    label: '声音',
    short: '声音',
    hint: '对白/旁白/SFX 声线与配音方向',
    doneHint: '有声线或对白行',
  },
  {
    id: 'export',
    index: 7,
    label: '导出归档',
    short: '导出',
    hint: '拼接成片，完成本集并进入下一集',
    doneHint: '已导出或已标记完成',
  },
];

export type StepStatus = 'done' | 'current' | 'todo' | 'blocked';

export const CAMERA_MOVE_PRESETS = [
  '固定',
  '推',
  '拉',
  '摇',
  '移',
  '跟',
  '升',
  '降',
  '手持',
  '环绕',
] as const;

export const COLOR_GRADE_PRESETS = [
  '青橙电影感',
  '高对比黑金',
  '低饱和纪实',
  '霓虹赛博',
  '柔光日系',
  '冷调悬疑',
  '暖调治愈',
  '废土黄褐',
] as const;

export const LIGHTING_PRESETS = [
  '自然窗光',
  '侧逆光轮廓',
  '顶光硬影',
  '柔光箱面光',
  '霓虹混合光',
  '烛光暖调',
  '阴天散射',
  '夜景路灯',
] as const;
