import type { BacklotWorkspaceItem } from '../data/backlot-templates';
import { defaultCharacterVariants } from '../data/creative-asset-presets';
import type { CharacterProfile } from '../types/character';
import type { SoundAssetProfile } from '../types/sound-library';
import { regenerateCharacterPrompts, regenerateVoicePrompts, regenerateWorkspacePrompts } from './creative-asset-prompts';

export function newCharacterProfile(name = '新角色'): CharacterProfile {
  const id = `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const variants = defaultCharacterVariants();
  const base: CharacterProfile = {
    id,
    name,
    descriptionZh: '',
    consistencyPrompt: '',
    referenceImageUrl: null,
    referenceAudioUrl: null,
    tags: [],
    bible: {
      identity: '',
      appearance: '',
      personality: '',
      background: '',
      voice: '',
      relationships: '',
    },
    creative: {
      ...variants,
      occupation: '',
      identityRole: '',
      personalityText: '',
      backgroundStory: '',
      worldView: '',
    },
  };
  const creative = regenerateCharacterPrompts(base);
  return normalizeCharacterProfile({
    ...base,
    creative,
    consistencyPrompt: creative.consistency?.consistencyPrompt ?? '',
  });
}

export function normalizeCharacterProfile(c: CharacterProfile): CharacterProfile {
  const variants = defaultCharacterVariants();
  const creative = c.creative ?? {};
  return {
    ...c,
    creative: {
      ...variants,
      ...creative,
      expressions: creative.expressions?.length ? creative.expressions : variants.expressions,
      poses: creative.poses?.length ? creative.poses : variants.poses,
      angles: creative.angles?.length ? creative.angles : variants.angles,
    },
    consistencyPrompt:
      c.consistencyPrompt?.trim() ||
      creative.consistency?.consistencyPrompt?.trim() ||
      creative.prompts?.bible?.text?.trim() ||
      c.consistencyPrompt,
  };
}

export function patchCharacterCreative(
  c: CharacterProfile,
  patch: Partial<NonNullable<CharacterProfile['creative']>>,
): CharacterProfile {
  return normalizeCharacterProfile({
    ...c,
    creative: { ...c.creative, ...patch },
  });
}

export function patchWorkspaceCreative<T extends BacklotWorkspaceItem>(
  item: T,
  patch: Partial<NonNullable<T['creative']>>,
): T {
  return {
    ...item,
    creative: { ...(item.creative as object), ...patch } as T['creative'],
  };
}

export function patchVoiceCreative(
  s: SoundAssetProfile,
  patch: Partial<NonNullable<SoundAssetProfile['creative']>>,
): SoundAssetProfile {
  return { ...s, creative: { ...s.creative, ...patch } };
}

export function refreshCharacterPrompts(c: CharacterProfile): CharacterProfile {
  const creative = regenerateCharacterPrompts(c);
  return normalizeCharacterProfile({
    ...c,
    creative,
    consistencyPrompt: creative.consistency?.consistencyPrompt ?? c.consistencyPrompt,
  });
}

export function refreshWorkspacePrompts(item: BacklotWorkspaceItem): BacklotWorkspaceItem {
  const creative = regenerateWorkspacePrompts(item);
  return { ...item, creative };
}

export function refreshVoicePrompts(s: SoundAssetProfile): SoundAssetProfile {
  return { ...s, creative: regenerateVoicePrompts(s) };
}
