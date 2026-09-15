/**
 * SRT 字幕解析：标准 SRT 文本 → cues（素材相对时间）。
 * 供「导入转录文件生成字幕轨」使用，与 AI 转写共用 buildSubtitleClipsFromCues 换算。
 */

export interface SrtCue {
  start: number;
  end: number;
  text: string;
}

function parseSrtTime(s: string): number | null {
  const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

export function parseSrt(text: string): SrtCue[] {
  const normalized = text.replace(/\r/g, '');
  const blocks = normalized.split(/\n\s*\n/);
  const out: SrtCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [a, b] = lines[timeIdx].split('-->');
    const start = parseSrtTime(a);
    const end = parseSrtTime(b);
    if (start == null || end == null || end <= start) continue;
    const text = lines.slice(timeIdx + 1).join('\n').trim();
    if (!text) continue;
    out.push({ start, end, text });
  }
  return out;
}
