export interface SoundAssetProfile {
  id: string;
  name: string;
  description?: string;
  audioUrl: string;
  tags?: string[];
  durationSec?: number;
  /** Creative Asset Center 扩展数据 */
  creative?: import('./creative-asset-center').VoiceCreativeExtension;
}

export interface SoundLibraryPayload {
  version: 1;
  sounds: SoundAssetProfile[];
}

export function emptySoundLibrary(): SoundLibraryPayload {
  return { version: 1, sounds: [] };
}

export function newSoundAsset(name = '新声音'): SoundAssetProfile {
  return {
    id: `sound-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    description: '',
    audioUrl: '',
    tags: [],
  };
}
