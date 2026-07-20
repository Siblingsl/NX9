import { Injectable } from '@nestjs/common';
import type { AppSettings } from '@nx9/shared';
import { JsonStoreService } from '../../common/json-store.service';
import { PATHS } from '../../config/app.config';

const SECRET_KEYS = [
  'primaryApiKey',
  'videoApiKey',
  'xaiApiKey',
  'grokGoApiKey',
  'rhApiKey',
  'geminiApiKey',
  'llmApiKey',
  'ttsApiKey',
  'categoryKeys',
  'advancedProviders',
  'cloudTargets',
] as const;

function maskSecret(value: string | undefined): string | undefined {
  if (!value || value.length < 4) return value ? '****' : undefined;
  return `****${value.slice(-4)}`;
}

@Injectable()
export class SettingsService {
  constructor(private readonly store: JsonStoreService) {}

  private readRaw(): AppSettings {
    return this.store.readJson<AppSettings>(PATHS.settings, {
      preferences: {
        snapToGrid: true,
        gridSize: 20,
        autoSaveIntervalMs: 700,
        showBlockIndex: true,
        reduceMotion: false,
      },
    });
  }

  getMasked(): AppSettings {
    const raw = this.readRaw();
    return {
      ...raw,
      primaryApiKey: maskSecret(raw.primaryApiKey),
      videoApiKey: maskSecret(raw.videoApiKey),
      xaiApiKey: maskSecret(raw.xaiApiKey),
      grokGoApiKey: maskSecret(raw.grokGoApiKey),
      rhApiKey: maskSecret(raw.rhApiKey),
      geminiApiKey: maskSecret(raw.geminiApiKey),
      llmApiKey: maskSecret(raw.llmApiKey),
      ttsApiKey: maskSecret(raw.ttsApiKey),
      categoryKeys: raw.categoryKeys
        ? Object.fromEntries(
            Object.entries(raw.categoryKeys).map(([k, v]) => [k, maskSecret(v) ?? '']),
          )
        : undefined,
      advancedProviders: raw.advancedProviders?.map((p) => ({
        ...p,
        apiKey: maskSecret(p.apiKey),
      })),
      cloudTargets: raw.cloudTargets?.map((t) => ({
        ...t,
        config: Object.fromEntries(
          Object.entries(t.config).map(([k, v]) =>
            /secret|key|token|password/i.test(k) ? [k, maskSecret(v) ?? ''] : [k, v],
          ),
        ),
      })),
    };
  }

  getRaw(): AppSettings {
    return this.readRaw();
  }

  update(partial: AppSettings): AppSettings {
    const current = this.readRaw();
    const merged: AppSettings = { ...current, ...partial };
    for (const key of SECRET_KEYS) {
      const val = partial[key as keyof AppSettings];
      if (val === undefined) continue;
      if (typeof val === 'string' && val.startsWith('****')) {
        (merged as Record<string, unknown>)[key] = (current as Record<string, unknown>)[key];
      }
    }
    this.store.writeJson(PATHS.settings, merged);
    return this.getMasked();
  }
}
