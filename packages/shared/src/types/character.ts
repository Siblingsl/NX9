export interface CharacterProfile {
  id: string;
  name: string;
  descriptionZh?: string;
  /** 注入到生图/生视频 prompt 的一致性描述（英文为主） */
  consistencyPrompt?: string;
  referenceImageUrl?: string | null;
  /** LuxTTS 克隆用参考音频（≥3s，wav/mp3） */
  referenceAudioUrl?: string | null;
  voiceProfileId?: string | null;
  tags?: string[];
  /** 从自定义模板导入时关联的模板 id，用于覆盖保存 */
  sourceTemplateId?: string;
}

export interface CharacterLibraryPayload {
  version: 1;
  characters: CharacterProfile[];
}

export function emptyCharacterLibrary(): CharacterLibraryPayload {
  return { version: 1, characters: [] };
}
