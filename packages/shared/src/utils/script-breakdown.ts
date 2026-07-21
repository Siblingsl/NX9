import type {
  ScriptBreakdownDialogueLine,
  ScriptBreakdownEpisode,
  ScriptBreakdownPayload,
  ScriptBreakdownShot,
} from '../types/script-breakdown';

const EP_RE = /第\s*([一二三四五六七八九十百\d]+)\s*集/g;
const SCENE_RE = /^\s*(?:#{1,4}\s*)?((?:\d+\s*[-.]\s*)?\d+)\s*(?:[.、]\s*)?(.{2,40})?$/;
const DIALOGUE_RE = /^([^：:\s（）()]{1,12})[：:]\s*(.{2,})$/;

function cnNum(raw: string): number {
  if (/^\d+$/.test(raw)) return Number(raw);
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
    百: 100,
  };
  if (raw === '十') return 10;
  if (raw.includes('十')) {
    const [left, right] = raw.split('十');
    return (left ? map[left] ?? 1 : 1) * 10 + (right ? map[right] ?? 0 : 0);
  }
  return map[raw] ?? 1;
}

function clampDuration(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.max(3, Math.min(12, Math.round(n)));
}

function compactText(text: string, max = 120): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])\s*|\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function extractDialogue(text: string): ScriptBreakdownDialogueLine[] {
  return text
    .split('\n')
    .map((line) => {
      const m = line.trim().match(DIALOGUE_RE);
      if (!m) return null;
      return { speaker: m[1], text: m[2] } satisfies ScriptBreakdownDialogueLine;
    })
    .filter(Boolean)
    .slice(0, 5) as ScriptBreakdownDialogueLine[];
}

function extractCharacters(text: string, dialogue: ScriptBreakdownDialogueLine[]): string[] {
  const chars = new Set(dialogue.map((d) => d.speaker).filter(Boolean));
  const inline = text.match(/人物[：:]\s*([^\n]+)/);
  if (inline) {
    inline[1]
      .split(/[、,，\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((x) => chars.add(x));
  }
  return [...chars].slice(0, 6);
}

function guessScene(text: string): string {
  const explicit = text.match(/(?:场景|地点|位置)[：:]\s*([^\n，。]+)/);
  if (explicit) return explicit[1].trim();
  const loc = text.match(/在([^，。！？\n]{2,16})(?:里|中|内|外|前|后|旁|上|下)/);
  return loc?.[1]?.trim() || '未指定场景';
}

function makeShot(
  episodeId: string,
  episodeIndex: number,
  shotIndex: number,
  sceneCode: string,
  text: string,
): ScriptBreakdownShot {
  const dialogue = extractDialogue(text);
  const characters = extractCharacters(text, dialogue);
  const scene = guessScene(text);
  const title = compactText(text, 28) || `分镜 ${shotIndex}`;
  const visual = compactText(text, 160);
  const characterPart = characters.length ? `，角色：${characters.join('、')}` : '';
  const scenePart = scene ? `，场景：${scene}` : '';
  const imagePrompt = `漫画短剧关键帧，${visual}${characterPart}${scenePart}，画面清晰，角色一致，电影感构图`;
  const videoPrompt = `根据关键帧生成 5 秒短视频：${visual}${characterPart}${scenePart}，动作自然，镜头稳定，保持角色与场景一致`;
  const subject = compactText(text, 48) || '关键戏剧瞬间';
  const audiovisualLanguage =
    `稳定镜头贴近情境，中景到特写逐步交代${subject}。光色层次与角色状态形成对比，强化这一拍的情绪冲击。`;

  return {
    id: `${episodeId}-shot-${shotIndex}`,
    episodeId,
    episodeIndex,
    index: shotIndex,
    sceneId: `${episodeId}-scene-${shotIndex}`,
    sceneCode,
    title,
    durationSec: 3,
    characters,
    scene,
    scriptText: text,
    dialogue,
    audiovisualLanguage,
    imagePrompt,
    videoPrompt,
    referenceImageUrl: null,
    previewImageUrl: null,
    status: 'draft',
  };
}

function splitEpisodeChunks(sourceText: string): Array<{ index: number; title: string; text: string }> {
  const matches = [...sourceText.matchAll(EP_RE)];
  if (matches.length === 0) return [{ index: 1, title: '第一集', text: sourceText }];

  return matches.map((match, i) => {
    const start = match.index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? sourceText.length : sourceText.length;
    const index = cnNum(match[1]);
    return {
      index,
      title: `第${index}集`,
      text: sourceText.slice(start, end).replace(match[0], '').trim(),
    };
  });
}

function splitShotChunks(text: string): string[] {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const isSceneHead =
      /^分镜\s*\d+/.test(line) ||
      /^镜头\s*\d+/.test(line) ||
      /^\d+\s*[.、]/.test(line) ||
      Boolean(line.match(SCENE_RE) && line.length <= 42);
    if (isSceneHead && current.length > 0) {
      chunks.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) chunks.push(current.join('\n').trim());
  if (chunks.length >= 2) return chunks;

  const sentences = splitSentences(text);
  const grouped: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    grouped.push(sentences.slice(i, i + 2).join('\n'));
  }
  return grouped.filter(Boolean).slice(0, 24);
}

export function buildScriptBreakdownFromText(sourceText: string): ScriptBreakdownPayload {
  const source = sourceText.trim();
  const title = source.match(/[《「]([^》」]+)[》」]/)?.[1]?.trim() || '剧本拆分';
  const episodes: ScriptBreakdownEpisode[] = splitEpisodeChunks(source).map((ep, epPos) => {
    const episodeId = `ep-${ep.index}`;
    const shots = splitShotChunks(ep.text).map((chunk, i) =>
      makeShot(episodeId, ep.index, i + 1, `${ep.index}-${i + 1}`, chunk),
    );
    return {
      id: episodeId,
      index: ep.index || epPos + 1,
      title: ep.title,
      logline: compactText(ep.text, 80),
      shots,
    };
  });

  return {
    version: 1,
    title,
    sourceText: source,
    episodes,
    generatedAt: new Date().toISOString(),
  };
}
