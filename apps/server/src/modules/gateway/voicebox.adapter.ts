import { Injectable } from '@nestjs/common';

export interface VoiceboxProbeResult {
  available: boolean;
  baseUrl: string;
  profiles?: { id: string; name: string }[];
  message?: string;
}

@Injectable()
export class VoiceboxAdapter {
  async probe(baseUrl: string): Promise<VoiceboxProbeResult> {
    const url = baseUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${url}/profiles`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) {
        return { available: false, baseUrl: url, message: `HTTP ${res.status}` };
      }
      const profiles = (await res.json()) as { id?: string; name?: string }[] | { profiles?: { id?: string; name?: string }[] };
      const list = Array.isArray(profiles)
        ? profiles
        : (profiles as { profiles?: { id?: string; name?: string }[] }).profiles ?? [];
      return {
        available: true,
        baseUrl: url,
        profiles: list.map((p) => ({ id: p.id ?? '', name: p.name ?? p.id ?? '' })),
        message: `Voicebox 已连接 · ${list.length} 个音色`,
      };
    } catch (e) {
      return { available: false, baseUrl: url, message: String(e) };
    }
  }

  async synthesize(
    baseUrl: string,
    input: string,
    voice?: string,
  ): Promise<{ ok: boolean; buffer: Buffer; contentType: string }> {
    const url = baseUrl.replace(/\/$/, '');

    // OpenAI-compatible path first
    const oaiRes = await fetch(`${url}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input,
        voice: voice || 'alloy',
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (oaiRes.ok) {
      const buf = Buffer.from(await oaiRes.arrayBuffer());
      return { ok: true, buffer: buf, contentType: oaiRes.headers.get('content-type') ?? 'audio/mpeg' };
    }

    // Native /speak endpoint (profile name or id)
    const speakRes = await fetch(`${url}/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Voicebox-Client-Id': 'nx9-studio',
      },
      body: JSON.stringify({ text: input, profile: voice || undefined }),
      signal: AbortSignal.timeout(120_000),
    });

    if (speakRes.ok) {
      const buf = Buffer.from(await speakRes.arrayBuffer());
      return { ok: true, buffer: buf, contentType: speakRes.headers.get('content-type') ?? 'audio/wav' };
    }

    // /generate with profile_id
    const genRes = await fetch(`${url}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input, profile_id: voice, language: 'zh' }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      throw new Error(`Voicebox TTS failed: ${err.slice(0, 200)}`);
    }

    const buf = Buffer.from(await genRes.arrayBuffer());
    return { ok: true, buffer: buf, contentType: genRes.headers.get('content-type') ?? 'audio/wav' };
  }
}
