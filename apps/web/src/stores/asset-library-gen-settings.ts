import { create } from 'zustand';
import {
  DEFAULT_ASSET_LIBRARY_GEN_SETTINGS,
  DEFAULT_COSTUME_GEN_SETTINGS,
  DEFAULT_SCENE_GEN_SETTINGS,
  type AssetLibraryGenSettingsValue,
} from '../panels/asset-library/AssetLibraryGenSettings';

function withDefaults(
  base: AssetLibraryGenSettingsValue,
  patch?: Partial<AssetLibraryGenSettingsValue>,
): AssetLibraryGenSettingsValue {
  return {
    model: patch?.model ?? base.model,
    quality: patch?.quality ?? base.quality,
    aspectRatio: patch?.aspectRatio ?? base.aspectRatio,
    resolutionTier: patch?.resolutionTier ?? base.resolutionTier ?? '2k',
  };
}

interface AssetLibraryGenState {
  characterSheet: AssetLibraryGenSettingsValue;
  costumeSheet: AssetLibraryGenSettingsValue;
  scene: AssetLibraryGenSettingsValue;
  setCharacterSheet: (patch: Partial<AssetLibraryGenSettingsValue>) => void;
  setCostumeSheet: (patch: Partial<AssetLibraryGenSettingsValue>) => void;
  setScene: (patch: Partial<AssetLibraryGenSettingsValue>) => void;
}

export const useAssetLibraryGenSettings = create<AssetLibraryGenState>((set) => ({
  characterSheet: { ...DEFAULT_ASSET_LIBRARY_GEN_SETTINGS },
  costumeSheet: { ...DEFAULT_COSTUME_GEN_SETTINGS },
  scene: { ...DEFAULT_SCENE_GEN_SETTINGS },
  setCharacterSheet: (patch) =>
    set((s) => ({ characterSheet: withDefaults(s.characterSheet, patch) })),
  setCostumeSheet: (patch) =>
    set((s) => ({ costumeSheet: withDefaults(s.costumeSheet, patch) })),
  setScene: (patch) =>
    set((s) => ({ scene: withDefaults(s.scene, patch) })),
}));
