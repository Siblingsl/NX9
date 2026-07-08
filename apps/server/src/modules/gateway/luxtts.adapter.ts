import { Injectable } from '@nestjs/common';
import type { LuxTtsNoGpuFallback } from '@nx9/shared';

export interface LuxTtsProbeResult {
  available: boolean;
  baseUrl: string;
  device?: string;
  activeDevice?: string;
  modelLoaded?: boolean;
  model?: string;
  cachedProfiles?: number;
  message?: string;
  gpuAvailable?: boolean;
  cudaAvailable?: boolean;
  mpsAvailable?: boolean;
  runningOnCpu?: boolean;
  recommendedFallback?: LuxTtsNoGpuFallback | null;
  recommendation?: string | null;
}

export interface LuxTtsSynthesizeOptions {
  referenceAudioPath?: string;
  profileId?: string;
  rms?: number;
  t_shift?: number;
  num_steps?: number;
  speed?: number;
  return_smooth?: boolean;
  ref_duration?: number;
}

@Injectable()
export class LuxTtsAdapter {
  async probe(baseUrl: string): Promise<LuxTtsProbeResult> {
    const url = baseUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        return { available: false, baseUrl: url, message: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        ok?: boolean;
        modelLoaded?: boolean;
        device?: string;
        activeDevice?: string;
        model?: string;
        cachedProfiles?: number;
        message?: string;
        gpuAvailable?: boolean;
        cudaAvailable?: boolean;
        mpsAvailable?: boolean;
        runningOnCpu?: boolean;
        recommendedFallback?: LuxTtsNoGpuFallback | null;
        recommendation?: string | null;
      };
      const loaded = Boolean(data.modelLoaded ?? data.ok);
      const gpuAvailable = data.gpuAvailable;
      const runningOnCpu = data.runningOnCpu ?? data.activeDevice === 'cpu';
      let message = data.message;
      if (loaded) {
        const dev = data.activeDevice ?? data.device ?? 'device';
        if (gpuAvailable === false || runningOnCpu) {
          message = `LuxTTS 已连接 · ${dev}（无 GPU，建议在设置中选择 CPU 或云端保底）`;
        } else {
          message = `LuxTTS 已连接 · ${dev} · ${data.cachedProfiles ?? 0} 缓存音色`;
        }
      }
      return {
        available: loaded,
        baseUrl: url,
        device: data.device,
        activeDevice: data.activeDevice ?? data.device,
        modelLoaded: loaded,
        model: data.model,
        cachedProfiles: data.cachedProfiles,
        gpuAvailable: data.gpuAvailable,
        cudaAvailable: data.cudaAvailable,
        mpsAvailable: data.mpsAvailable,
        runningOnCpu,
        recommendedFallback: data.recommendedFallback ?? null,
        recommendation: data.recommendation ?? null,
        message: loaded ? message : data.message ?? 'LuxTTS 服务在线但模型未加载',
      };
    } catch (e) {
      return { available: false, baseUrl: url, message: String(e) };
    }
  }

  async encode(
    baseUrl: string,
    referenceAudioPath: string,
    opts?: { profileId?: string; rms?: number; ref_duration?: number },
  ): Promise<{ ok: boolean; profileId?: string }> {
    const url = baseUrl.replace(/\/$/, '');
    const res = await fetch(`${url}/encode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference_audio_path: referenceAudioPath,
        profile_id: opts?.profileId,
        rms: opts?.rms ?? 0.01,
        ref_duration: opts?.ref_duration ?? 5,
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LuxTTS encode failed: ${err.slice(0, 300)}`);
    }
    const data = (await res.json()) as { ok?: boolean; profileId?: string };
    return { ok: Boolean(data.ok), profileId: data.profileId };
  }

  async synthesize(
    baseUrl: string,
    input: string,
    opts: LuxTtsSynthesizeOptions,
  ): Promise<{ ok: boolean; buffer: Buffer; contentType: string }> {
    const url = baseUrl.replace(/\/$/, '');
    const res = await fetch(`${url}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: input,
        ...(opts.referenceAudioPath ? { reference_audio_path: opts.referenceAudioPath } : {}),
        ...(opts.profileId ? { profile_id: opts.profileId } : {}),
        rms: opts.rms ?? 0.01,
        t_shift: opts.t_shift ?? 0.9,
        num_steps: opts.num_steps ?? 4,
        speed: opts.speed ?? 1.0,
        return_smooth: opts.return_smooth ?? false,
        ref_duration: opts.ref_duration ?? 5,
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LuxTTS synthesize failed: ${err.slice(0, 300)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, buffer: buf, contentType: res.headers.get('content-type') ?? 'audio/wav' };
  }
}
