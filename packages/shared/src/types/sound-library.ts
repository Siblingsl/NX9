/**
 * 声音库（Snd-01～03）。
 * 轻量：名 + 子类型 + 可选音频 + Voice Prompt；服务 @声音 与配音/BGM/SFX 选用。
 * 内置条目只读，需「导入副本」后编辑。
 */

export type SoundAssetKind = 'voice' | 'sfx' | 'bgm';

export const SOUND_ASSET_KINDS: ReadonlyArray<{
  id: SoundAssetKind;
  label: string;
  hint: string;
}> = [
  { id: 'voice', label: '配音', hint: '旁白、对白、角色声线' },
  { id: 'sfx', label: '音效', hint: '环境声、拟音、点缀' },
  { id: 'bgm', label: 'BGM', hint: '氛围配乐、节奏铺底' },
];

export const SOUND_ASSET_KIND_LABELS: Record<SoundAssetKind, string> = {
  voice: '配音',
  sfx: '音效',
  bgm: 'BGM',
};

export function soundAssetKindLabel(id: SoundAssetKind | string | undefined | null): string {
  if (!id) return '';
  return SOUND_ASSET_KIND_LABELS[id as SoundAssetKind] ?? String(id);
}

export interface SoundAssetProfile {
  id: string;
  name: string;
  description?: string;
  audioUrl: string;
  tags?: string[];
  durationSec?: number;
  /** 子类型：配音 / 音效 / BGM（Snd-01） */
  soundKind?: SoundAssetKind;
  /** 顶层收藏（卡片筛选）；与 creative.favorite 同步读写 */
  favorite?: boolean;
  /** 内置只读标记（有值则不可直接改删） */
  builtinKey?: string;
  /** Creative Asset Center 扩展数据 */
  creative?: import('./creative-asset-center').VoiceCreativeExtension;
  /** F-010: 软删除时间戳，非空表示已移入回收站 */
  deletedAt?: number;
}

export interface SoundLibraryPayload {
  version: 1;
  sounds: SoundAssetProfile[];
}

export const BUILTIN_PUBLIC_SOUND_ASSETS: SoundAssetProfile[] = [
  {
    id: 'builtin-sound-warm-narration',
    builtinKey: 'warm-narration',
    name: '温暖旁白',
    description: '适合治愈、成长、回忆类短片的温柔叙述声线。',
    audioUrl: '',
    tags: ['旁白', '治愈', '温暖'],
    soundKind: 'voice',
    creative: {
      voiceTone: 'warm, gentle, intimate narration voice',
      age: '青年至中年',
      gender: '中性',
      speed: '中慢速',
      emotion: '温暖、克制、有陪伴感',
      language: '中文普通话',
    },
  },
  {
    id: 'builtin-sound-suspense-drone',
    builtinKey: 'suspense-drone',
    name: '悬疑低频氛围',
    description: '用于推理、惊悚、反转前的低频压迫感氛围声。',
    audioUrl: '',
    tags: ['悬疑', '惊悚', '氛围'],
    soundKind: 'bgm',
    creative: {
      voiceTone: 'low frequency suspense drone, subtle pulse, cinematic tension',
      speed: '缓慢推进',
      emotion: '不安、压迫、等待揭示',
      language: '无对白',
    },
  },
  {
    id: 'builtin-sound-city-night',
    builtinKey: 'city-night',
    name: '城市夜景环境声',
    description: '远处车流、人声、霓虹街区的都市夜晚环境底声。',
    audioUrl: '',
    tags: ['城市', '夜晚', '环境声'],
    soundKind: 'sfx',
    creative: {
      voiceTone: 'distant traffic, soft crowd murmur, neon city ambience at night',
      speed: '稳定持续',
      emotion: '孤独、都市感、现实质感',
      language: '环境声',
    },
  },
  {
    id: 'builtin-sound-epic-action',
    builtinKey: 'epic-action',
    name: '史诗动作鼓点',
    description: '适合追逐、战斗、爆发转折的鼓点与管弦推进。',
    audioUrl: '',
    tags: ['动作', '史诗', '战斗'],
    soundKind: 'bgm',
    creative: {
      voiceTone: 'epic percussion, rising orchestral hits, cinematic action rhythm',
      speed: '快速递进',
      emotion: '热血、紧张、爆发',
      language: '无对白',
    },
  },
  {
    id: 'builtin-sound-rain-window',
    builtinKey: 'rain-window',
    name: '雨夜窗边',
    description: '雨滴敲窗、远雷与室内静默，适合情绪独白和失落段落。',
    audioUrl: '',
    tags: ['雨声', '情绪', '室内'],
    soundKind: 'sfx',
    creative: {
      voiceTone: 'rain on window, distant thunder, quiet room tone',
      speed: '缓慢持续',
      emotion: '悲伤、怀旧、私密',
      language: '环境声',
    },
  },
  {
    id: 'builtin-sound-light-comedy',
    builtinKey: 'light-comedy',
    name: '轻喜剧节拍',
    description: '用于尴尬、反差、轻松桥段的轻快节奏和短促音效点。',
    audioUrl: '',
    tags: ['喜剧', '轻快', '节奏'],
    soundKind: 'bgm',
    creative: {
      voiceTone: 'light comedic rhythm, playful plucks, small accent hits',
      speed: '中快速',
      emotion: '轻松、俏皮、反差',
      language: '无对白',
    },
  },
];

export function emptySoundLibrary(): SoundLibraryPayload {
  return { version: 1, sounds: [] };
}

export function newSoundAsset(
  name = '新声音',
  soundKind: SoundAssetKind = 'voice',
  partial?: Partial<SoundAssetProfile>,
): SoundAssetProfile {
  return {
    id: partial?.id ?? `sound-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: partial?.name?.trim() || name,
    description: partial?.description ?? '',
    audioUrl: partial?.audioUrl ?? '',
    tags: partial?.tags ?? [],
    soundKind: partial?.soundKind ?? soundKind,
    favorite: partial?.favorite,
    durationSec: partial?.durationSec,
    creative: partial?.creative,
  };
}

/** 从内置/他人条目导入可编辑副本（去掉 builtinKey，新 id） */
export function cloneSoundAsset(
  source: SoundAssetProfile,
  nameSuffix = '·副本',
): SoundAssetProfile {
  return newSoundAsset(`${source.name}${nameSuffix}`, inferSoundAssetKind(source), {
    description: source.description,
    audioUrl: source.audioUrl,
    tags: (source.tags ?? []).filter((t) => t !== 'builtin'),
    soundKind: inferSoundAssetKind(source),
    durationSec: source.durationSec,
    favorite: false,
    creative: source.creative
      ? { ...source.creative, favorite: false }
      : undefined,
  });
}

/** 公共库：内置 + 自定义（同名自定义覆盖内置展示） */
export function resolvePublicSounds(projectSounds: SoundAssetProfile[] = []): SoundAssetProfile[] {
  const live = projectSounds.filter((s) => !s.deletedAt);
  const byName = new Map(live.map((s) => [s.name.trim().toLowerCase(), s]));
  const builtins = BUILTIN_PUBLIC_SOUND_ASSETS.filter(
    (b) => !byName.has(b.name.trim().toLowerCase()),
  );
  return [...builtins, ...live];
}

export function isBuiltinSoundAsset(sound: SoundAssetProfile | undefined | null): boolean {
  if (!sound) return false;
  if (sound.builtinKey) return true;
  return BUILTIN_PUBLIC_SOUND_ASSETS.some((b) => b.id === sound.id);
}

/** 从标签/描述推断声音子类型（兼容旧数据） */
export function inferSoundAssetKind(sound: SoundAssetProfile): SoundAssetKind {
  if (sound.soundKind) return sound.soundKind;
  const blob = `${sound.name} ${sound.description ?? ''} ${(sound.tags ?? []).join(' ')}`.toLowerCase();
  if (/bgm|配乐|管弦|鼓点|节拍|音乐/.test(blob)) return 'bgm';
  if (/sfx|音效|环境|雨|车流|氛围声|音景/.test(blob)) return 'sfx';
  if (/旁白|配音|声线|narration|voice/.test(blob)) return 'voice';
  return 'voice';
}

/** 收藏状态：顶层优先，兼容 creative.favorite */
export function isSoundFavorite(sound: SoundAssetProfile | undefined | null): boolean {
  if (!sound) return false;
  if (typeof sound.favorite === 'boolean') return sound.favorite;
  return Boolean(sound.creative?.favorite);
}
