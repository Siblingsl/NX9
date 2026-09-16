import type { CharacterBodyMetrics, CharacterFaceRig, FaceRigGroupId } from '../types/creative-asset-center';

/** |v| 小于该阈值视为中性，不编译进 Prompt */
export const FACE_RIG_DEADZONE = 20;

/** 参数取值边界 */
export const FACE_RIG_MIN = -100;
export const FACE_RIG_MAX = 100;

export interface FaceRigGroupDef {
  id: FaceRigGroupId;
  /** 分组中文名（UI Tab 与编译段落前缀共用） */
  labelZh: string;
  /** 编译成句时的前缀，如「脸型：」 */
  sentenceLabel: string;
}

export const FACE_RIG_GROUPS: FaceRigGroupDef[] = [
  { id: 'shape', labelZh: '脸型', sentenceLabel: '脸型' },
  { id: 'eyes', labelZh: '眼', sentenceLabel: '眼部' },
  { id: 'brows', labelZh: '眉', sentenceLabel: '眉部' },
  { id: 'nose', labelZh: '鼻', sentenceLabel: '鼻部' },
  { id: 'mouth', labelZh: '嘴', sentenceLabel: '嘴部' },
  { id: 'surface', labelZh: '皮肤', sentenceLabel: '皮肤' },
  { id: 'body', labelZh: '体型', sentenceLabel: '体型' },
];

export type FaceRigDriver = 'morph' | 'bone' | 'material' | 'prompt';

export interface FaceRigParamDef {
  id: string;
  group: FaceRigGroupId;
  labelZh: string;
  /** 负向语义词 */
  low: string;
  /** 正向语义词 */
  high: string;
  /**
   * 与 bodyMetrics 的同维度实测字段。
   * 实测值非空时该项降级不编译，避免「腰围 62cm」与「腰部明显更粗」自相矛盾。
   */
  bodyMetricKey?: keyof CharacterBodyMetrics;
  /** 左栏常用快捷滑块 */
  quick?: boolean;
  /** 拖拽控制点映射（P2 捏模台用；P0 仅登记不消费） */
  handle?: { pointId: string; axis: 'x' | 'y'; invert?: boolean };
  /**
   * 3D 驱动类型。缺省为 `morph`。
   * 运行时缺对应 morph/骨时静默跳过，滑块仍可改（给 Prompt）。
   */
  driver?: FaceRigDriver;
}

export const FACE_RIG_PARAMS: FaceRigParamDef[] = [
  // ─── 脸型轮廓 ───────────────────────────────────────────────
  {
    id: 'faceLength',
    group: 'shape',
    labelZh: '脸长',
    low: '脸型偏短方',
    high: '脸型偏长',
    quick: true,
    handle: { pointId: 'p-hairline', axis: 'y', invert: true },
  },
  {
    id: 'cheekboneWidth',
    group: 'shape',
    labelZh: '颧骨宽',
    low: '颧骨内收平缓',
    high: '颧骨外扩高耸',
    handle: { pointId: 'p-cheek', axis: 'x' },
  },
  {
    id: 'jawWidth',
    group: 'shape',
    labelZh: '下颌宽',
    low: '下颌收窄',
    high: '下颌方阔',
    quick: true,
    handle: { pointId: 'p-jaw', axis: 'x' },
  },
  {
    id: 'jawAngle',
    group: 'shape',
    labelZh: '下颌角',
    low: '下颌角圆钝',
    high: '下颌角锐利',
    handle: { pointId: 'p-jaw', axis: 'y' },
  },
  {
    id: 'chinLength',
    group: 'shape',
    labelZh: '颏部长度',
    low: '下巴短',
    high: '下巴长',
    handle: { pointId: 'p-chin', axis: 'y' },
  },
  { id: 'chinProject', group: 'shape', labelZh: '颏部前突', low: '下巴后缩', high: '下巴前突' },
  { id: 'templeWidth', group: 'shape', labelZh: '太阳穴宽', low: '太阳穴凹陷', high: '太阳穴饱满' },
  {
    id: 'cheekFullness',
    group: 'shape',
    labelZh: '面颊丰满',
    low: '面颊凹陷清瘦',
    high: '面颊饱满有婴儿肥',
    handle: { pointId: 'p-cheek', axis: 'y' },
  },

  // ─── 眼 ─────────────────────────────────────────────────────
  {
    id: 'eyeSize',
    group: 'eyes',
    labelZh: '眼裂大小',
    low: '眼睛细长偏小',
    high: '眼睛大而圆',
    quick: true,
    handle: { pointId: 'p-eye-top', axis: 'y', invert: true },
  },
  {
    id: 'eyeSpacing',
    group: 'eyes',
    labelZh: '眼间距',
    low: '双眼间距近',
    high: '双眼间距宽',
    quick: true,
    handle: { pointId: 'p-eye-outer', axis: 'x' },
  },
  {
    id: 'eyeTilt',
    group: 'eyes',
    labelZh: '眼角倾斜',
    low: '外眼角下垂',
    high: '外眼角上扬',
    handle: { pointId: 'p-eye-outer', axis: 'y', invert: true },
  },
  {
    id: 'eyelidFold',
    group: 'eyes',
    labelZh: '上睑褶皱',
    low: '单眼皮',
    high: '深邃双眼皮',
    handle: { pointId: 'p-lid', axis: 'y', invert: true },
  },
  { id: 'orbitDepth', group: 'eyes', labelZh: '眼窝深度', low: '眼窝平浅', high: '眼窝深陷立体' },
  { id: 'underEyeFold', group: 'eyes', labelZh: '卧蚕', low: '无卧蚕', high: '卧蚕明显' },
  { id: 'irisSize', group: 'eyes', labelZh: '瞳孔占比', low: '瞳孔偏小', high: '瞳孔大', driver: 'material' },
  { id: 'browEyeGap', group: 'eyes', labelZh: '眉眼间距', low: '眉眼紧凑', high: '眉眼距离开阔' },

  // ─── 眉 ─────────────────────────────────────────────────────
  { id: 'browDensity', group: 'brows', labelZh: '眉浓密', low: '眉毛稀疏淡', high: '眉毛浓密', driver: 'material' },
  {
    id: 'browArch',
    group: 'brows',
    labelZh: '眉峰',
    low: '平眉',
    high: '高眉峰',
    handle: { pointId: 'p-brow-peak', axis: 'y', invert: true },
  },
  { id: 'browAngle', group: 'brows', labelZh: '眉形走向', low: '眉尾下垂', high: '眉尾上挑' },
  {
    id: 'browLength',
    group: 'brows',
    labelZh: '眉长',
    low: '眉短',
    high: '眉长过眼尾',
    handle: { pointId: 'p-brow-peak', axis: 'x' },
  },

  // ─── 鼻 ─────────────────────────────────────────────────────
  {
    id: 'noseBridgeHeight',
    group: 'nose',
    labelZh: '鼻梁高度',
    low: '鼻梁低平',
    high: '鼻梁高挺',
    quick: true,
    handle: { pointId: 'p-nose-bridge', axis: 'y', invert: true },
  },
  {
    id: 'noseBridgeWidth',
    group: 'nose',
    labelZh: '鼻梁宽',
    low: '鼻梁窄',
    high: '鼻梁宽',
    handle: { pointId: 'p-nose-bridge', axis: 'x' },
  },
  { id: 'noseTipSize', group: 'nose', labelZh: '鼻头大小', low: '鼻头小巧', high: '鼻头饱满' },
  {
    id: 'nostrilWidth',
    group: 'nose',
    labelZh: '鼻翼宽',
    low: '鼻翼收窄',
    high: '鼻翼外扩',
    handle: { pointId: 'p-nostril', axis: 'x' },
  },
  {
    id: 'noseTipAngle',
    group: 'nose',
    labelZh: '鼻尖角度',
    low: '鼻尖下垂',
    high: '鼻尖上翘',
    handle: { pointId: 'p-nose-tip', axis: 'y', invert: true },
  },
  { id: 'noseLength', group: 'nose', labelZh: '鼻长', low: '鼻子短', high: '鼻子长' },

  // ─── 嘴 ─────────────────────────────────────────────────────
  {
    id: 'upperLipThickness',
    group: 'mouth',
    labelZh: '上唇厚',
    low: '上唇薄',
    high: '上唇厚',
    quick: true,
    handle: { pointId: 'p-lip-top', axis: 'y', invert: true },
  },
  {
    id: 'lowerLipThickness',
    group: 'mouth',
    labelZh: '下唇厚',
    low: '下唇薄',
    high: '下唇厚',
    handle: { pointId: 'p-lip-bottom', axis: 'y' },
  },
  {
    id: 'mouthWidth',
    group: 'mouth',
    labelZh: '嘴宽',
    low: '嘴小',
    high: '嘴宽',
    handle: { pointId: 'p-lip-corner', axis: 'x' },
  },
  { id: 'lipPeak', group: 'mouth', labelZh: '唇珠唇峰', low: '唇峰平缓', high: '唇珠明显唇峰清晰' },
  {
    id: 'mouthCorner',
    group: 'mouth',
    labelZh: '嘴角',
    low: '嘴角下垂',
    high: '嘴角自然上扬',
    handle: { pointId: 'p-lip-corner', axis: 'y', invert: true },
  },
  { id: 'philtrumLength', group: 'mouth', labelZh: '人中长度', low: '人中短', high: '人中长' },

  // ─── 皮肤与年龄结构（不含颜色）─────────────────────────────
  { id: 'skinTexture', group: 'surface', labelZh: '皮肤纹理', low: '皮肤细腻无瑕', high: '毛孔与纹理清晰真实', driver: 'material' },
  { id: 'facialFat', group: 'surface', labelZh: '面部脂肪', low: '面部消瘦骨感', high: '面部丰润' },
  { id: 'nasolabial', group: 'surface', labelZh: '法令纹', low: '无法令纹', high: '法令纹明显' },
  { id: 'underEyeShadow', group: 'surface', labelZh: '眼下阴影', low: '眼下干净', high: '眼下阴影疲惫感', driver: 'material' },
  { id: 'freckles', group: 'surface', labelZh: '雀斑', low: '无斑点', high: '雀斑明显', driver: 'material' },

  // ─── 体型结构 ───────────────────────────────────────────────
  { id: 'heightFeel', group: 'body', labelZh: '身高感', low: '身形娇小', high: '身形高挑', driver: 'bone' },
  {
    id: 'shoulderWidth',
    group: 'body',
    labelZh: '肩宽',
    low: '窄肩溜肩',
    high: '宽肩平直',
    bodyMetricKey: 'shoulderWidth',
    driver: 'bone',
  },
  { id: 'torsoLength', group: 'body', labelZh: '躯干比例', low: '短躯干长腿', high: '长躯干', driver: 'bone' },
  {
    id: 'legRatio',
    group: 'body',
    labelZh: '腿身比',
    low: '腿偏短',
    high: '腿长比例突出',
    bodyMetricKey: 'legLength',
    driver: 'bone',
  },
  { id: 'muscleMass', group: 'body', labelZh: '肌肉量', low: '肌肉量低柔和', high: '肌肉线条明显' },
  { id: 'bodyFat', group: 'body', labelZh: '体脂', low: '体脂低精瘦', high: '体脂高圆润' },
  { id: 'neckLength', group: 'body', labelZh: '脖颈', low: '短颈', high: '长颈', driver: 'bone' },
  {
    id: 'handSize',
    group: 'body',
    labelZh: '手部',
    low: '手小骨感',
    high: '手大骨节明显',
    bodyMetricKey: 'handLength',
    driver: 'bone',
  },
];

export const FACE_RIG_PARAMS_BY_ID: Map<string, FaceRigParamDef> = new Map(
  FACE_RIG_PARAMS.map((p) => [p.id, p]),
);

export function faceRigParamsOfGroup(group: FaceRigGroupId): FaceRigParamDef[] {
  return FACE_RIG_PARAMS.filter((p) => p.group === group);
}

export interface FaceRigPreset {
  id: string;
  label: string;
  /** 只写偏离项；未列出的参数保持 0 */
  values: NonNullable<CharacterFaceRig['values']>;
}

/** 内置脸型预设：仅作起手式，落库后即为角色自身参数 */
export const CHARACTER_FACE_RIG_PRESETS: FaceRigPreset[] = [
  {
    id: 'oval',
    label: '鹅蛋脸',
    values: {
      shape: { faceLength: 20, jawWidth: -25, jawAngle: -30, cheekFullness: 20, chinLength: 15 },
    },
  },
  {
    id: 'heart',
    label: '瓜子脸',
    values: {
      shape: { faceLength: 30, jawWidth: -55, jawAngle: -20, chinLength: 35, cheekboneWidth: 25 },
    },
  },
  {
    id: 'square',
    label: '方脸',
    values: {
      shape: { faceLength: -25, jawWidth: 60, jawAngle: 55, cheekboneWidth: 30, chinLength: -20 },
    },
  },
  {
    id: 'round',
    label: '圆脸',
    values: {
      shape: { faceLength: -40, jawWidth: -20, jawAngle: -60, cheekFullness: 55, chinLength: -30 },
      surface: { facialFat: 35 },
    },
  },
  {
    id: 'long',
    label: '长脸',
    values: {
      shape: { faceLength: 60, cheekFullness: -30, chinLength: 30, templeWidth: -20 },
    },
  },
  {
    id: 'sharp',
    label: '骨感冷感',
    values: {
      shape: { cheekboneWidth: 55, cheekFullness: -50, jawAngle: 45, jawWidth: -25 },
      eyes: { orbitDepth: 45, eyeTilt: 30 },
      surface: { facialFat: -45 },
    },
  },
  {
    id: 'soft',
    label: '柔和亲和',
    values: {
      shape: { jawAngle: -50, cheekFullness: 35 },
      eyes: { eyeSize: 30, eyeTilt: -25, underEyeFold: 30 },
      mouth: { mouthCorner: 30, upperLipThickness: 20 },
    },
  },
];

export const FACE_RIG_PRESETS_BY_ID: Map<string, FaceRigPreset> = new Map(
  CHARACTER_FACE_RIG_PRESETS.map((p) => [p.id, p]),
);
