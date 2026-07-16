import type { CharacterProfile } from '../types/character';
import type { StoryboardShot } from '../types/storyboard';

export interface CharacterPromptContext {
  characters: CharacterProfile[];
  promptSuffix: string;
  referenceImageUrl?: string;
}

/**
 * Parse @Name mentions from a prompt string and resolve to CharacterProfile objects.
 */
export function parseMentionsFromPrompt(
  prompt: string | undefined,
  library: CharacterProfile[],
): CharacterProfile[] {
  if (!prompt) return [];
  const nameMap = new Map(library.map((c) => [c.name, c]));
  const mentionPattern = /@(\S+)/g;
  const seen = new Set<string>();
  const result: CharacterProfile[] = [];
  for (const m of prompt.matchAll(mentionPattern)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      const found = nameMap.get(name);
      if (found) result.push(found);
    }
  }
  return result;
}

/** Resolve characters for a block from explicit id or linked shot. */
export function resolveBlockCharacters(
  blockData: Record<string, unknown> | undefined,
  linkedShot: StoryboardShot | undefined,
  library: CharacterProfile[],
): CharacterProfile[] {
  const byId = new Map(library.map((c) => [c.id, c]));
  const byName = new Map(library.map((c) => [c.name.trim().toLowerCase(), c]));
  const ids = new Set<string>();

  const explicit = blockData?.characterId as string | undefined;
  if (explicit) ids.add(explicit);

  for (const id of linkedShot?.characterIds ?? []) {
    if (id) ids.add(id);
  }

  // 镜头仅有 characterNames 时也解析（剧本拆分常见）
  for (const name of linkedShot?.characterNames ?? []) {
    const found = byName.get(name.trim().toLowerCase());
    if (found) ids.add(found.id);
  }

  return [...ids].map((id) => byId.get(id)).filter((c): c is CharacterProfile => Boolean(c));
}

/** Append consistency descriptions to generation prompt. */
export function characterPromptSuffix(characters: CharacterProfile[]): string {
  if (characters.length === 0) return '';

  const parts = characters
    .map((c) => {
      const desc =
        c.creative?.prompts?.bible?.text?.trim() ||
        c.consistencyPrompt?.trim() ||
        c.descriptionZh?.trim();
      if (!desc) return null;
      return `[Character ${c.name}]: ${desc}`;
    })
    .filter(Boolean);

  if (parts.length === 0) return '';
  return `Character consistency:\n${parts.join('\n')}`;
}

export function enrichPromptWithCharacters(
  basePrompt: string,
  characters: CharacterProfile[],
): string {
  const suffix = characterPromptSuffix(characters);
  const trimmed = basePrompt.trim();
  if (!suffix) return trimmed;
  return trimmed ? `${trimmed}\n\n${suffix}` : suffix;
}

/** Prefer character reference image, then upstream picture. */
export function pickReferenceImage(
  characters: CharacterProfile[],
  upstreamPictures: string[],
): string | undefined {
  for (const c of characters) {
    if (c.referenceImageUrl) return c.referenceImageUrl;
  }
  return upstreamPictures[0];
}

export function buildCharacterContext(
  blockData: Record<string, unknown> | undefined,
  linkedShot: StoryboardShot | undefined,
  library: CharacterProfile[],
  upstreamPictures: string[] = [],
): CharacterPromptContext {
  const characters = resolveBlockCharacters(blockData, linkedShot, library);
  const promptSuffix = characterPromptSuffix(characters);
  return {
    characters,
    promptSuffix,
    referenceImageUrl: pickReferenceImage(characters, upstreamPictures),
  };
}
