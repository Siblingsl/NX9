/** 角色设定 · 表情芯片（对齐常见设定图分区） */
export interface CharacterExpressionPreset {
  id: string;
  label: string;
  tags: string;
}

export const CHARACTER_EXPRESSION_PRESETS: CharacterExpressionPreset[] = [
  { id: 'calm', label: '平静', tags: 'calm neutral expression' },
  { id: 'smile', label: '微笑', tags: 'gentle smile, soft eyes' },
  { id: 'grin', label: '咧嘴笑', tags: 'grinning, cheerful' },
  { id: 'laugh', label: '大笑', tags: 'laughing openly, joyful' },
  { id: 'determined', label: '坚定', tags: 'determined focused gaze' },
  { id: 'disappointed', label: '失望', tags: 'disappointed, downcast eyes' },
  { id: 'sad', label: '难过', tags: 'sad expression, teary eyes' },
  { id: 'angry', label: '生气', tags: 'angry expression, furrowed brow' },
  { id: 'furious', label: '愤怒', tags: 'furious intense glare' },
  { id: 'yawn', label: '打哈欠', tags: 'yawning, relaxed tired' },
];

/** 角色设定 · 动作（比通用 pose 更偏设定图） */
export interface CharacterSheetPosePreset {
  id: string;
  label: string;
  tags: string;
}

export const CHARACTER_SHEET_POSE_PRESETS: CharacterSheetPosePreset[] = [
  { id: 'stand', label: '站立', tags: 'standing neutral full body' },
  { id: 'combat', label: '战斗', tags: 'combat fighting stance, dynamic guard' },
  { id: 'run', label: '奔跑', tags: 'running action pose' },
  { id: 'sit', label: '坐下', tags: 'sitting relaxed' },
  { id: 'jump', label: '跳跃', tags: 'jumping mid-air action' },
];
