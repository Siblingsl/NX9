import type { CreativeVariantEntry } from '../types/creative-asset-center';

export const CAC_EXPRESSION_PRESETS: CreativeVariantEntry[] = [
  { id: 'smile', label: '微笑', prompt: 'gentle smile, soft eyes' },
  { id: 'happy', label: '开心', prompt: 'happy cheerful expression' },
  { id: 'laugh', label: '大笑', prompt: 'laughing openly, joyful' },
  { id: 'calm', label: '平静', prompt: 'calm neutral expression' },
  { id: 'lost', label: '失落', prompt: 'disappointed, downcast eyes' },
  { id: 'sad', label: '悲伤', prompt: 'sad expression, teary eyes' },
  { id: 'cry', label: '哭泣', prompt: 'crying, tears streaming' },
  { id: 'angry', label: '生气', prompt: 'angry expression, furrowed brow' },
  { id: 'furious', label: '愤怒', prompt: 'furious intense glare' },
  { id: 'surprised', label: '惊讶', prompt: 'surprised wide eyes' },
  { id: 'afraid', label: '害怕', prompt: 'fearful anxious expression' },
  { id: 'speechless', label: '无语', prompt: 'speechless blank stare' },
  { id: 'confused', label: '疑惑', prompt: 'confused puzzled look' },
  { id: 'tsundere', label: '傲娇', prompt: 'tsundere pout, arms crossed' },
  { id: 'cold', label: '冷漠', prompt: 'cold indifferent expression' },
  { id: 'aggrieved', label: '委屈', prompt: 'aggrieved teary pout' },
];

export const CAC_POSE_PRESETS: CreativeVariantEntry[] = [
  { id: 'stand', label: '站立', prompt: 'standing neutral full body' },
  { id: 'walk', label: '走路', prompt: 'walking naturally' },
  { id: 'run', label: '奔跑', prompt: 'running action pose' },
  { id: 'sit', label: '坐下', prompt: 'sitting relaxed' },
  { id: 'jump', label: '跳跃', prompt: 'jumping mid-air action' },
  { id: 'combat', label: '战斗', prompt: 'combat fighting stance' },
  { id: 'wave', label: '挥手', prompt: 'waving hand greeting' },
  { id: 'hug', label: '拥抱', prompt: 'open arms hug pose' },
  { id: 'phone', label: '拿手机', prompt: 'holding smartphone' },
  { id: 'drink', label: '喝水', prompt: 'drinking from cup' },
];

export const CAC_ANGLE_PRESETS: CreativeVariantEntry[] = [
  { id: 'front', label: '正面', prompt: 'front view' },
  { id: 'three-quarter', label: '45°', prompt: 'three-quarter view' },
  { id: 'side', label: '侧面', prompt: 'side profile view' },
  { id: 'back', label: '背面', prompt: 'back view' },
  { id: 'top', label: '俯视', prompt: 'top-down view' },
  { id: 'low', label: '仰视', prompt: 'low angle view' },
  { id: 'close', label: '近景', prompt: 'close-up shot' },
  { id: 'medium', label: '中景', prompt: 'medium shot' },
  { id: 'wide', label: '远景', prompt: 'wide shot' },
];

export const CAC_HOOK_TYPES = [
  '反转',
  '误会',
  '震惊',
  '冲突',
  '揭秘',
  '悬念',
  '情感',
  '搞笑',
] as const;

export const CAC_SHOT_SIZES = ['特写', '近景', '中景', '全景', '远景', '大远景'] as const;

export const CAC_VOICE_GENDERS = ['男', '女', '中性', '童声'] as const;

export const CAC_VOICE_EMOTIONS = ['平静', '开心', '悲伤', '愤怒', '温柔', '激动', '冷漠'] as const;

/** 设定板标准 8 表情（与 gen-character-sheet-master expressions 分类对齐） */
export const CAC_SHEET_EXPRESSION_PRESETS: CreativeVariantEntry[] = [
  { id: 'neutral', label: '平静', prompt: 'neutral calm expression, soft eyes' },
  { id: 'smile', label: '微笑', prompt: 'gentle smile, soft eyes' },
  { id: 'angry', label: '愤怒', prompt: 'angry expression, furrowed brow' },
  { id: 'tense', label: '紧张', prompt: 'tense uneasy expression, tight jaw' },
  { id: 'surprised', label: '惊讶', prompt: 'surprised wide eyes, open lips' },
  { id: 'afraid', label: '害怕', prompt: 'afraid anxious expression, tense eyes' },
  { id: 'sad', label: '悲伤', prompt: 'sad expression, downcast eyes' },
  { id: 'determined', label: '坚定', prompt: 'determined focused gaze, firm mouth' },
];

export const CAC_MICRO_EXPRESSION_PRESETS: CreativeVariantEntry[] = [
  { id: 'eye-tension', label: '眼部紧张', prompt: 'micro expression eye tension, tight eyelids' },
  { id: 'slight-smile', label: '微笑', prompt: 'micro slight smile, soft mouth corners' },
  { id: 'mouth-tension', label: '嘴部用力', prompt: 'micro mouth tension, pressed lips' },
  { id: 'micro-fear', label: '微恐惧', prompt: 'micro fear, subtle wide eyes' },
  { id: 'breath-control', label: '呼吸控制', prompt: 'micro breath control, calm nostrils and lips' },
  { id: 'lip-bite', label: '咬唇', prompt: 'micro lip bite, teeth gently catching lip' },
];

export const CAC_SHEET_POSE_PRESETS: CreativeVariantEntry[] = [
  { id: 'relaxed', label: '放松', prompt: 'relaxed standing posture, soft shoulders' },
  { id: 'tense', label: '紧张', prompt: 'tense posture, crossed arms or guarded stance' },
  { id: 'confident', label: '自信', prompt: 'confident upright posture, open chest' },
];

export const CAC_SHEET_HEAD_ANGLE_PRESETS: CreativeVariantEntry[] = [
  { id: 'head-three-quarter', label: '3/4', prompt: 'head three-quarter view' },
  { id: 'head-side', label: '侧面', prompt: 'head side profile view' },
  { id: 'head-up', label: '仰视', prompt: 'head looking up view' },
  { id: 'head-down', label: '俯视', prompt: 'head looking down view' },
  { id: 'head-back', label: '背面', prompt: 'head back view, hairstyle readable' },
];

export const CAC_COSTUME_DETAIL_PRESETS: CreativeVariantEntry[] = [
  { id: 'hairstyle', label: '发型', prompt: 'hairstyle detail close-up' },
  { id: 'fabric', label: '材质', prompt: 'fabric material texture detail' },
  { id: 'accessory', label: '配饰', prompt: 'accessory or garment edge detail' },
  { id: 'footwear', label: '鞋', prompt: 'footwear detail or barefoot detail' },
];

export const CAC_HAND_REF_PRESETS: CreativeVariantEntry[] = [
  { id: 'hand-relaxed', label: '放松', prompt: 'relaxed hand pose reference' },
  { id: 'hand-tense', label: '紧张', prompt: 'tense hand pose reference' },
  { id: 'hand-pointing', label: '指向', prompt: 'pointing hand pose reference' },
  { id: 'hand-grasping', label: '抓握', prompt: 'grasping hand pose reference' },
  { id: 'hand-touching-face', label: '触脸', prompt: 'hand touching face pose reference' },
];

/** 按预设槽位顺序合并：保留已有图/文案，补齐新增空槽（如微表情·咬唇）。 */
export function mergeVariantSlots(
  existing: CreativeVariantEntry[] | undefined,
  defaults: CreativeVariantEntry[],
  options?: { keepUnknown?: boolean },
): CreativeVariantEntry[] {
  const byId = new Map((existing ?? []).map((item) => [item.id, item]));
  const merged = defaults.map((slot) => {
    const cur = byId.get(slot.id);
    return cur ? { ...slot, ...cur, id: slot.id, label: cur.label?.trim() || slot.label } : { ...slot };
  });
  // 设定板表情等固定槽：丢弃旧预设残留（如好奇/放松），避免与新 8 格叠成 10 框
  if (options?.keepUnknown === false) return merged;
  for (const item of existing ?? []) {
    if (defaults.some((slot) => slot.id === item.id)) continue;
    merged.push(item);
  }
  return merged;
}

export function defaultCharacterVariants(): {
  expressions: CreativeVariantEntry[];
  poses: CreativeVariantEntry[];
  angles: CreativeVariantEntry[];
  microExpressions: CreativeVariantEntry[];
  costumeDetails: CreativeVariantEntry[];
  handRefs: CreativeVariantEntry[];
} {
  return {
    expressions: CAC_SHEET_EXPRESSION_PRESETS.map((p) => ({ ...p })),
    poses: CAC_SHEET_POSE_PRESETS.map((p) => ({ ...p })),
    angles: CAC_SHEET_HEAD_ANGLE_PRESETS.map((p) => ({ ...p })),
    microExpressions: CAC_MICRO_EXPRESSION_PRESETS.map((p) => ({ ...p })),
    costumeDetails: CAC_COSTUME_DETAIL_PRESETS.map((p) => ({ ...p })),
    handRefs: CAC_HAND_REF_PRESETS.map((p) => ({ ...p })),
  };
}

/** 服装状态变体（轻量，非角色表情墙） */
export const CAC_COSTUME_VARIANT_PRESETS: CreativeVariantEntry[] = [
  { id: 'damaged', label: '破损', prompt: 'same outfit, battle-worn tears and frayed edges, locked wardrobe landmarks' },
  { id: 'wet', label: '湿衣', prompt: 'same outfit rain-soaked fabric cling, locked wardrobe landmarks' },
  { id: 'night', label: '夜视低光', prompt: 'same outfit under low-key night lighting, locked wardrobe landmarks' },
  { id: 'combat', label: '战斗磨损', prompt: 'same outfit with combat scuffs and dust, locked wardrobe landmarks' },
];
