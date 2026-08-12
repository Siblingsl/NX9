import { resolveCharacterReferenceAudio } from '@nx9/shared';
import { api } from '../api/client';
import { useCredentialVault } from '../stores/credential-vault';
import { useWorkspaceDocument } from '../stores/workspace-document';

export type SoundCastLine = { speaker: string; text: string; emotion?: string };

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
  return { url: res.url, provider: res.provider, bytes: res.bytes };
}

export async function runSoundGenCast(
  lines: SoundCastLine[],
  profileMap: Record<string, string>,
): Promise<{
  results: { speaker: string; text: string; audioUrl?: string; error?: string }[];
  audioUrls: string[];
}> {
  if (lines.length === 0) throw new Error('配音：无可解析的对白');
  const characters = useWorkspaceDocument.getState().characters.characters;
  const sounds = useWorkspaceDocument.getState().soundLibrary.sounds;
  const results: { speaker: string; text: string; audioUrl?: string; error?: string }[] = [];
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
      results.push({ speaker: line.speaker, text: line.text, audioUrl: res.url });
    } catch (e) {
      results.push({ speaker: line.speaker, text: line.text, error: String(e) });
    }
  }
  const audioUrls = results.map((r) => r.audioUrl).filter(Boolean) as string[];
  return { results, audioUrls };
}

export async function runSoundGenBgm(prompt: string, durationSec = 30): Promise<string> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error('请输入 BGM 描述');
  const settings = useCredentialVault.getState().settings;
  const apiKey = settings?.bgmApiKey ?? '';
  const provider = settings?.bgmProvider ?? 'suno';
  if (!apiKey) {
    throw new Error('BGM 服务未配置。请先在设置中配置 BGM API Key。');
  }
  const res = await fetch('/api/gateway/music', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: trimmed, durationSec, provider, apiKey }),
  });
  if (!res.ok) {
    throw new Error(nestMessage(await res.text()) || 'BGM 生成失败');
  }
  const { taskId } = (await res.json()) as { taskId?: string };
  if (!taskId) throw new Error('BGM 任务提交失败');
  return pollBgmUntilDone(taskId);
}

async function pollBgmUntilDone(taskId: string): Promise<string> {
  let attempts = 0;
  while (attempts < 30) {
    const pollRes = await fetch(`/api/gateway/music/${taskId}`);
    if (!pollRes.ok) throw new Error(nestMessage(await pollRes.text()) || '查询任务状态失败');
    const task = (await pollRes.json()) as { status?: string; url?: string; error?: string };
    if (task.status === 'done' && task.url) return task.url;
    if (task.status === 'error') throw new Error(task.error || 'BGM 生成失败');
    attempts += 1;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('BGM 生成超时');
}
