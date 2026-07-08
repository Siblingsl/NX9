export type TextSplitMode = 'paragraph' | 'line' | 'sentence' | 'regex';

export function splitText(
  text: string,
  mode: TextSplitMode,
  regex?: string,
): string[] {
  const raw = (text ?? '').trim();
  if (!raw) return [];

  if (mode === 'line') {
    return raw
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (mode === 'sentence') {
    return raw
      .split(/(?<=[。！？.!?])\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (mode === 'regex' && regex) {
    try {
      const re = new RegExp(regex);
      return raw
        .split(re)
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      return [raw];
    }
  }

  return raw
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
