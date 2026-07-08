import { BadRequestException, Injectable } from '@nestjs/common';
import type { VoiceLine, WorkspacePayload } from '@nx9/shared';
import { normalizeWorkspacePayload } from '@nx9/shared';
import { GatewayService } from '../gateway/gateway.service';
import { WorkspaceService } from './workspace.service';

@Injectable()
export class VoiceWorkspaceService {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly gateway: GatewayService,
  ) {}

  async generateLines(
    workspaceId: string,
    body?: { lineIds?: string[]; voice?: WorkspacePayload['voice'] },
  ): Promise<{
    ok: number;
    failed: number;
    results: { id: string; status: string; audioAssetId?: string }[];
  }> {
    const payload = await this.workspaces.load(workspaceId);
    if (body?.voice) payload.voice = body.voice;
    if (!payload.voice?.lines?.length) {
      throw new BadRequestException('No voice lines in workspace');
    }

    const voice = payload.voice;
    const targetIds = body?.lineIds?.length ? new Set(body.lineIds) : null;
    const lines = voice.lines.filter((ln) => !targetIds || targetIds.has(ln.id));

    let ok = 0;
    let failed = 0;
    const results: { id: string; status: string; audioAssetId?: string }[] = [];

    for (const line of lines) {
      if (!line.text?.trim()) {
        failed++;
        results.push({ id: line.id, status: 'failed' });
        continue;
      }
      const profile = voice.profiles.find(
        (p) => p.id === line.voiceProfileId || p.name === line.speaker,
      );
      const voiceId = profile?.voiceId ?? 'alloy';
      const ttsBody: Record<string, unknown> = { input: line.text, voice: voiceId };

      if (profile?.provider === 'luxtts' && profile.referenceAudioAssetId) {
        ttsBody.useLuxTts = true;
        ttsBody.referenceAudioUrl = profile.referenceAudioAssetId;
        ttsBody.luxTtsProfileId = profile.id;
      } else if (profile?.provider === 'voicebox') {
        ttsBody.voice = profile.voiceId || profile.name;
      }

      const linkedChar = payload.characters?.characters.find(
        (c) => c.voiceProfileId === profile?.id,
      );
      if (linkedChar?.referenceAudioUrl && !ttsBody.referenceAudioUrl) {
        ttsBody.useLuxTts = true;
        ttsBody.referenceAudioUrl = linkedChar.referenceAudioUrl;
        ttsBody.luxTtsProfileId = linkedChar.id;
      }

      try {
        const res = await this.gateway.proxyTts(ttsBody);
        ok++;
        results.push({ id: line.id, status: 'ready', audioAssetId: res.url });
        this.patchLine(payload, line.id, { audioAssetId: res.url, status: 'ready' });
      } catch {
        failed++;
        results.push({ id: line.id, status: 'failed' });
        this.patchLine(payload, line.id, { status: 'failed' });
      }
    }

    await this.workspaces.save(workspaceId, normalizeWorkspacePayload(payload));
    return { ok, failed, results };
  }

  private patchLine(payload: WorkspacePayload, id: string, patch: Partial<VoiceLine>) {
    if (!payload.voice) return;
    payload.voice.lines = payload.voice.lines.map((ln) =>
      ln.id === id ? { ...ln, ...patch } : ln,
    );
  }
}
