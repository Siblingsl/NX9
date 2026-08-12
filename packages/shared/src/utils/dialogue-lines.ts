import type { ScreenplayPackage } from '../types/screenplay-package';
import type { ScriptBreakdownPayload } from '../types/script-breakdown';

/** 对白行（配音台 / gatherUpstream 共用） */
export interface DialogueLine {
  speaker: string;
  text: string;
  emotion?: string;
}

const DIALOGUE_RE = /^([^：:\s（）()]{1,12})[：:]\s*(.{2,})$/;

export function extractDialogueLinesFromText(text: string): DialogueLine[] {
  const lines: DialogueLine[] = [];
  for (const raw of text.split('\n')) {
    const m = raw.trim().match(DIALOGUE_RE);
    if (!m) continue;
    lines.push({ speaker: m[1], text: m[2] });
  }
  return lines;
}

export function extractDialogueLinesFromPackage(pkg: ScreenplayPackage): DialogueLine[] {
  return pkg.screenplay.episodes.flatMap((ep) => extractDialogueLinesFromText(ep.bodyMd));
}

export function normalizeDialogueLines(raw: unknown): DialogueLine[] {
  if (!Array.isArray(raw)) return [];
  const out: DialogueLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const speaker = typeof rec.speaker === 'string' ? rec.speaker.trim() : '';
    const text = typeof rec.text === 'string' ? rec.text.trim() : '';
    if (!speaker || !text) continue;
    const emotion = typeof rec.emotion === 'string' ? rec.emotion : undefined;
    out.push(emotion ? { speaker, text, emotion } : { speaker, text });
  }
  return out;
}

export function extractDialogueLinesFromBreakdown(payload: ScriptBreakdownPayload): DialogueLine[] {
  return payload.episodes.flatMap((ep) =>
    ep.shots.flatMap((shot) => normalizeDialogueLines(shot.dialogue)),
  );
}

export type VoiceCastLineSource = 'local' | 'upstream' | 'none';

export function resolveVoiceCastLines(
  ownLines: unknown,
  upstreamLines: DialogueLine[] | undefined,
): { lines: DialogueLine[]; source: VoiceCastLineSource } {
  const local = normalizeDialogueLines(ownLines);
  if (local.length > 0) return { lines: local, source: 'local' };
  const upstream = normalizeDialogueLines(upstreamLines);
  if (upstream.length > 0) return { lines: upstream, source: 'upstream' };
  return { lines: [], source: 'none' };
}
