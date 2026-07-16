/**
 * Parse @Name mentions from a prompt string and resolve to CharacterProfile objects.
 */
export function parseMentionsFromPrompt(prompt, library) {
    if (!prompt)
        return [];
    const nameMap = new Map(library.map((c) => [c.name, c]));
    const mentionPattern = /@(\S+)/g;
    const seen = new Set();
    const result = [];
    for (const m of prompt.matchAll(mentionPattern)) {
        const name = m[1];
        if (!seen.has(name)) {
            seen.add(name);
            const found = nameMap.get(name);
            if (found)
                result.push(found);
        }
    }
    return result;
}
/** Resolve characters for a block from explicit id or linked shot. */
export function resolveBlockCharacters(blockData, linkedShot, library) {
    const byId = new Map(library.map((c) => [c.id, c]));
    const ids = new Set();
    const explicit = blockData?.characterId;
    if (explicit)
        ids.add(explicit);
    for (const id of linkedShot?.characterIds ?? []) {
        if (id)
            ids.add(id);
    }
    return [...ids].map((id) => byId.get(id)).filter((c) => Boolean(c));
}
/** Append consistency descriptions to generation prompt. */
export function characterPromptSuffix(characters) {
    if (characters.length === 0)
        return '';
    const parts = characters
        .map((c) => {
        const desc = c.creative?.prompts?.bible?.text?.trim() ||
            c.consistencyPrompt?.trim() ||
            c.descriptionZh?.trim();
        if (!desc)
            return null;
        return `[Character ${c.name}]: ${desc}`;
    })
        .filter(Boolean);
    if (parts.length === 0)
        return '';
    return `Character consistency:\n${parts.join('\n')}`;
}
export function enrichPromptWithCharacters(basePrompt, characters) {
    const suffix = characterPromptSuffix(characters);
    const trimmed = basePrompt.trim();
    if (!suffix)
        return trimmed;
    return trimmed ? `${trimmed}\n\n${suffix}` : suffix;
}
/** Prefer character reference image, then upstream picture. */
export function pickReferenceImage(characters, upstreamPictures) {
    for (const c of characters) {
        if (c.referenceImageUrl)
            return c.referenceImageUrl;
    }
    return upstreamPictures[0];
}
export function buildCharacterContext(blockData, linkedShot, library, upstreamPictures = []) {
    const characters = resolveBlockCharacters(blockData, linkedShot, library);
    const promptSuffix = characterPromptSuffix(characters);
    return {
        characters,
        promptSuffix,
        referenceImageUrl: pickReferenceImage(characters, upstreamPictures),
    };
}
