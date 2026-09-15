import { resolveCharacterReferenceAudio } from '@nx9/shared';
import { api } from '../api/client';
import { useCredentialVault } from '../stores/credential-vault';
import { useWorkspaceDocument } from '../stores/workspace-document';

export type SoundCastLine = {
  speaker: string;
  text: string;
  emotion?: string;
  shotId?: string;
};

export interface SynthesizeTtsInput {
  input: string;
  voice?: string;
  provider?: string;
  referenceAudioUrl?: string;
  characterId?: string;
  audioFormat?: string;
  speechRate?: number;
  instructions?: string;
}

function nestMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join('; ');
    if (parsed.message) return parsed.message;
  } catch {
    /* not JSON */
  }
  return raw;
}

export async function synthesizeTts(opts: SynthesizeTtsInput): Promise<{
  url: string;
  provider?: string;
  bytes?: number;
}> {
  const provider = opts.provider || 'cloud';
  const res = await api.proxyTts({
    input: opts.input,
    voice:
      provider === 'luxtts' && opts.referenceAudioUrl
        ? `luxtts:${opts.referenceAudioUrl}`
        : opts.voice || 'alloy',
    useLuxTts: provider === 'luxtts',
    referenceAudioUrl: provider === 'luxtts' ? opts.referenceAudioUrl : undefined,
    luxTtsProfileId: opts.characterId,
    response_format: opts.audioFormat,
    speed: opts.speechRate,
    instructions: opts.instructions?.trim() || undefined,
  });
  if (!res?.ok || !res?.url?.trim()) throw new Error('TTS 未返回音频 URL，禁止空成功');
  if (typeof res.bytes === 'number' && res.bytes <= 0) {
    throw new Error('TTS 音频字节数为 0，禁止空成功');
  }
  return { url: res.url, provider: res.provider, bytes: res.bytes };
}

/** SF-16: 浏览器 metadata 探测音频时长；失败返回 undefined */
export function probeAudioDurationSec(url: string): Promise<number | undefined> {
  if (typeof Audio === 'undefined') return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const audio = new Audio();
    const done = (v: number | undefined) => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      resolve(v);
    };
    const timer = setTimeout(() => done(undefined), 8000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      const d = audio.duration;
      done(Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : undefined);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done(undefined);
    };
    audio.src = url;
  });
}

export async function runSoundGenCast(
  lines: SoundCastLine[],
  profileMap: Record<string, string>,
): Promise<{
  results: {
    speaker: string;
    text: string;
    shotId?: string;
    audioUrl?: string;
    durationSec?: number;
    error?: string;
  }[];
  audioUrls: string[];
}> {
  if (lines.length === 0) throw new Error('配音：无可解析的对白，禁止空成功');
  const characters = useWorkspaceDocument.getState().characters.characters;
  const sounds = useWorkspaceDocument.getState().soundLibrary.sounds;
  const results: {
    speaker: string;
    text: string;
    shotId?: string;
    audioUrl?: string;
    durationSec?: number;
    error?: string;
  }[] = [];
  for (const line of lines) {
    try {
      const mapped = profileMap[line.speaker] ?? 'alloy';
      const isCharRef = mapped.startsWith('char:');
      const charId = isCharRef ? mapped.slice(5) : '';
      const charHit = isCharRef
        ? characters.find((c) => c.id === charId)
        : characters.find((c) => c.name === line.speaker);
      const voiceId = isCharRef ? 'alloy' : mapped;
      const resolved = resolveCharacterReferenceAudio(charHit, sounds);
      const res = await synthesizeTts({
        input: line.text,
        voice: voiceId,
        provider: resolved.audioUrl ? 'luxtts' : 'cloud',
        referenceAudioUrl: resolved.audioUrl,
        characterId: charHit?.id,
      });
      const probed = await probeAudioDurationSec(res.url);
      const { estimateVoiceDurationSec } = await import('@nx9/shared');
      const durationSec = probed ?? estimateVoiceDurationSec(line.text);
      results.push({
        speaker: line.speaker,
        text: line.text,
        shotId: line.shotId,
        audioUrl: res.url,
        durationSec,
      });
    } catch (e) {
      results.push({
        speaker: line.speaker,
        text: line.text,
        shotId: line.shotId,
        error: String(e),
      });
    }
  }
  const audioUrls = results.map((r) => r.audioUrl).filter(Boolean) as string[];
  return { results, audioUrls };
}

export async function runSoundGenBgm(prompt: string, durationSec = 30): Promise<string> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error('请输入 BGM 描述，禁止空成功');
  const settings = useCredentialVault.getState().settings;
  const apiKey = settings?.bgmApiKey ?? '';
  const baseUrl = (settings?.bgmBaseUrl ?? '').trim();
  const provider = settings?.bgmProvider ?? 'suno';
  if (!apiKey || !baseUrl) {
    throw new Error('BGM 服务未配置。请先在设置→BGM 填写 Suno 兼容 Base URL 与 API Key，禁止空成功');
  }
  const res = await fetch('/api/gateway/music', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: trimmed, durationSec, provider, apiKey, baseUrl }),
  });
  if (!res.ok) {
    throw new Error(nestMessage(await res.text()) || 'BGM 生成失败，禁止空成功');
  }
  const { taskId } = (await res.json()) as { taskId?: string };
  if (!taskId) throw new Error('BGM 任务提交失败，禁止空成功');
  return pollBgmUntilDone(taskId);
}

async function pollBgmUntilDone(taskId: string): Promise<string> {
  let attempts = 0;
  while (attempts < 30) {
    const pollRes = await fetch(`/api/gateway/music/${taskId}`);
    if (!pollRes.ok) throw new Error(nestMessage(await pollRes.text()) || '查询任务状态失败，禁止空成功');
    const task = (await pollRes.json()) as { status?: string; url?: string; error?: string };
    if (task.status === 'done' && task.url) return task.url;
    if (task.status === 'done' && !task.url) {
      throw new Error('BGM 生成完成但无音频地址，禁止空成功');
    }
    if (task.status === 'error') throw new Error(task.error || 'BGM 生成失败，禁止空成功');
    attempts += 1;
    await new Promise((r) => setTimeout(r, 2000));
  }
    throw new Error('BGM 生成超时，禁止空成功');
}
