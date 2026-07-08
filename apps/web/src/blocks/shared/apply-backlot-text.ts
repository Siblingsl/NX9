export type BacklotApplyMode = 'replace' | 'append';

export function applyBacklotText(
  base: string,
  incoming: string,
  mode: BacklotApplyMode,
): string {
  const text = incoming.trim();
  if (!text) return base;
  if (mode === 'replace') return text;
  const prev = base.trim();
  return prev ? `${prev}\n${text}` : text;
}
