import type { BacklotCustomTemplate } from '../data/backlot-templates';
import type { CharacterProfile } from './character';
import type { SoundAssetProfile } from './sound-library';
import type { StylePresetProfile } from './style-library';
import { emptyCharacterLibrary } from './character';
import { emptyBacklotCustom } from '../data/backlot-templates';
import { emptySoundLibrary } from './sound-library';
import { emptyStyleLibrary } from './style-library';

/** 用户级公共素材库 — 跨项目可用，不绑定工作区 */
export interface PublicLibraryPayload {
  version: 1;
  characters: CharacterProfile[];
  /** scene / shot / emotion / hook / character 模板 */
  templates: BacklotCustomTemplate[];
  sounds: SoundAssetProfile[];
  /** 镜头/风格词典：风格预设放公共库（跨项目） */
  styles?: StylePresetProfile[];
}

export function emptyPublicLibrary(): PublicLibraryPayload {
  return {
    version: 1,
    characters: emptyCharacterLibrary().characters,
    templates: emptyBacklotCustom().items,
    sounds: emptySoundLibrary().sounds,
    styles: emptyStyleLibrary().styles,
  };
}
