/**
 * 情绪降级为「镜头推荐标签 / 内置预设」，不与角色表情格抢职责。
 * 角色格 = 身份微表情资产；此处 = 跨角色表演氛围词。
 */

export interface EmotionPreset {
  id: string;
  label: string;
  /** 可写入 Prompt 的短英文 */
  promptEn: string;
}

export const BUILTIN_EMOTION_PRESETS: EmotionPreset[] = [
  { id: 'emo-calm', label: '平静', promptEn: 'calm composed demeanor' },
  { id: 'emo-tense', label: '紧张', promptEn: 'tense anxious body language' },
  { id: 'emo-anger', label: '愤怒', promptEn: 'controlled anger, sharp gaze' },
  { id: 'emo-joy', label: '喜悦', promptEn: 'warm joyful expression' },
  { id: 'emo-grief', label: '悲伤', promptEn: 'quiet grief, heavy eyes' },
  { id: 'emo-fear', label: '恐惧', promptEn: 'fearful alert posture' },
  { id: 'emo-resolve', label: '坚定', promptEn: 'resolute determined presence' },
  { id: 'emo-shame', label: '羞耻', promptEn: 'ashamed averted gaze' },
  { id: 'emo-awe', label: '震撼', promptEn: 'awestruck wonder' },
  { id: 'emo-cold', label: '冷漠', promptEn: 'cold detached affect' },
];
