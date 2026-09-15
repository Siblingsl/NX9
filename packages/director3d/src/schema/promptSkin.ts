import type { CameraMoveId } from '../schema/cameraGeometry';

export type PromptPlatformId =
  | 'nx9'
  | 'runway'
  | 'kling'
  | 'veo'
  | 'luma'
  | 'hailuo'
  | 'pika'
  | 'higgsfield'
  | 'wan'
  | 'seedance'
  | 'ltx'
  | 'generic';

const MOVE_PHRASE: Record<CameraMoveId, { sentence: string; luma: string; bracket: string }> = {
  static: { sentence: 'holds static', luma: 'static', bracket: '' },
  'dolly-in': { sentence: 'slowly dollies in', luma: 'push in', bracket: 'Push in' },
  'dolly-out': { sentence: 'slowly dollies out', luma: 'pull out', bracket: 'Pull out' },
  'truck-left': { sentence: 'trucks left', luma: 'truck left', bracket: 'Truck left' },
  'truck-right': { sentence: 'trucks right', luma: 'truck right', bracket: 'Truck right' },
  'pedestal-up': { sentence: 'pedestals up', luma: 'pedestal up', bracket: 'Pedestal up' },
  'pedestal-down': { sentence: 'pedestals down', luma: 'pedestal down', bracket: 'Pedestal down' },
  'pan-left': { sentence: 'pans left', luma: 'pan left', bracket: 'Pan left' },
  'pan-right': { sentence: 'pans right', luma: 'pan right', bracket: 'Pan right' },
  'tilt-up': { sentence: 'tilts up', luma: 'tilt up', bracket: 'Tilt up' },
  'tilt-down': { sentence: 'tilts down', luma: 'tilt down', bracket: 'Tilt down' },
  orbit: { sentence: 'orbits around the subject', luma: 'orbit left', bracket: 'Orbit left' },
  'crane-up': { sentence: 'cranes up', luma: 'crane up', bracket: 'Crane up' },
  'crane-down': { sentence: 'cranes down', luma: 'crane down', bracket: 'Crane down' },
  handheld: { sentence: 'moves handheld', luma: 'handheld', bracket: 'Shake' },
};

/** Skin NX9 film-vocab base prompt for common AI video platforms. */
export function skinCameraPrompt(
  base: string,
  platform: PromptPlatformId,
  move: CameraMoveId = 'static',
): string {
  const m = MOVE_PHRASE[move] ?? MOVE_PHRASE.static;
  const stripped = base.replace(/,?\s*camera movement:.*/i, '').trim();
  if (platform === 'nx9' || platform === 'generic') return base;
  if (platform === 'pika' || platform === 'higgsfield') {
    return `${stripped}, camera movement: ${m.sentence}`;
  }
  if (platform === 'luma') return `${stripped}, camera ${m.luma}`;
  if (platform === 'hailuo') {
    return m.bracket ? `${stripped} [${m.bracket}]` : stripped;
  }
  if (platform === 'veo' || platform === 'ltx') {
    const end =
      platform === 'ltx'
        ? ` The camera ${m.sentence}, settling on the framed composition.`
        : ` The camera ${m.sentence}.`;
    return `${stripped}.${end}`;
  }
  if (platform === 'kling' || platform === 'runway' || platform === 'wan' || platform === 'seedance') {
    return `${m.sentence}, ${stripped}`;
  }
  return base;
}

export const PROMPT_PLATFORMS: { id: PromptPlatformId; label: string }[] = [
  { id: 'nx9', label: 'NX9' },
  { id: 'runway', label: 'Runway' },
  { id: 'kling', label: 'Kling' },
  { id: 'veo', label: 'Veo' },
  { id: 'luma', label: 'Luma' },
  { id: 'hailuo', label: 'Hailuo' },
  { id: 'pika', label: 'Pika' },
  { id: 'higgsfield', label: 'Higgsfield' },
  { id: 'wan', label: 'Wan' },
  { id: 'seedance', label: 'Seedance' },
  { id: 'ltx', label: 'LTX' },
];
