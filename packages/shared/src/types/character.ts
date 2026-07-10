export interface CharacterBible {
  /** 基础设定：姓名 / 年龄 / 职业 / 身份 */
  identity?: string;
  /** 外貌：识别特征、发色、瞳色、身材、色板 */
  appearance?: string;
  /** 性格与动机 */
  personality?: string;
  /** 背景故事 */
  background?: string;
  /** 声音与语言风格 */
  voice?: string;
  /** 关系网络 */
  relationships?: string;
}

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
  /** Character Bible 六层锚点（EPIC-M01） */
  bible?: CharacterBible;
}

export interface CharacterLibraryPayload {
  version: 1;
  characters: CharacterProfile[];
}

export function emptyCharacterLibrary(): CharacterLibraryPayload {
  return { version: 1, characters: [] };
}
