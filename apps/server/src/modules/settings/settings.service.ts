import { Injectable } from '@nestjs/common';
import type { AppSettings, ConnectionChannelStatus, ConnectionStatus, ModelConnection } from '@nx9/shared';
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
  'connections',
] as const;

function maskSecret(value: string | undefined): string | undefined {
  if (!value || value.length < 4) return value ? '****' : undefined;
  return `****${value.slice(-4)}`;
}

function hasValue(v: string | undefined): boolean {
  return !!v && v.length > 0 && !v.startsWith('****');
}

function migrateConnections(raw: AppSettings): ModelConnection[] {
  const existing = raw.connections ?? [];
  if (existing.length > 0) return existing;

  const conns: ModelConnection[] = [];
  const now = new Date().toISOString();

  if (hasValue(raw.llmApiKey) || hasValue(raw.primaryApiKey)) {
    conns.push({
      id: 'llm-default', label: '默认 LLM', kind: 'llm', provider: 'openai',
      apiKey: raw.llmApiKey || raw.primaryApiKey,
      baseUrl: raw.llmBaseUrl || raw.primaryBaseUrl || 'https://api.openai.com/v1',
      model: raw.llmModel || 'gpt-4o-mini', isActive: true, createdAt: now,
    });
  }

  if (hasValue(raw.primaryApiKey) || hasValue(raw.geminiApiKey)) {
    conns.push({
      id: 'image-default', label: '默认 图片', kind: 'image', provider: 'openai',
      apiKey: raw.primaryApiKey || raw.geminiApiKey,
      baseUrl: raw.primaryBaseUrl || 'https://api.openai.com/v1',
      model: 'dall-e-3', isActive: true, createdAt: now,
    });
  }

  if (hasValue(raw.xaiApiKey) || hasValue(raw.videoApiKey) || hasValue(raw.grokGoApiKey)) {
    const vp = raw.videoProvider || 'custom';
    conns.push({
      id: 'video-default', label: vp === 'xai' ? 'xAI Grok' : vp === 'grokgo' ? 'GrokGo 本地' : '默认 视频',
      kind: 'video', provider: vp,
      apiKey: (vp === 'xai' ? raw.xaiApiKey : vp === 'grokgo' ? raw.grokGoApiKey : raw.videoApiKey) || raw.primaryApiKey,
      baseUrl: vp === 'xai' ? (raw.xaiBaseUrl || 'https://api.x.ai/v1') : vp === 'grokgo' ? (raw.grokGoBaseUrl || 'http://127.0.0.1:8787/v1') : (raw.videoBaseUrl || raw.primaryBaseUrl || 'https://api.openai.com/v1'),
      model: 'grok-imagine-video', isActive: true, createdAt: now,
    });
  }

  if (hasValue(raw.ttsApiKey) || hasValue(raw.primaryApiKey)) {
    conns.push({
      id: 'audio-default', label: '默认 TTS', kind: 'audio', provider: 'openai',
      apiKey: raw.ttsApiKey || raw.primaryApiKey,
      baseUrl: raw.ttsBaseUrl || raw.primaryBaseUrl || 'https://api.openai.com/v1',
      model: 'tts-1', isActive: true, createdAt: now,
    });
  }

  return conns;
}

@Injectable()
export class SettingsService {
  constructor(private readonly store: JsonStoreService) {}

  private readRaw(): AppSettings {
    const raw = this.store.readJson<AppSettings>(PATHS.settings, {
      preferences: {
        snapToGrid: true,
        gridSize: 20,
        autoSaveIntervalMs: 700,
        showBlockIndex: true,
        reduceMotion: false,
      },
    });
    raw.connections = migrateConnections(raw);
    return raw;
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
      connections: raw.connections?.map((c) => ({
        ...c,
        apiKey: maskSecret(c.apiKey),
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

  getConnectionStatus(): ConnectionStatus {
    const cfg = this.readRaw();
    const channels: ConnectionChannelStatus[] = [];

    const llmKey = cfg.llmApiKey;
    const primaryKey = cfg.primaryApiKey;
    const llmStatus = hasValue(llmKey) ? 'ready' : hasValue(primaryKey) ? 'partial' : 'missing';
    channels.push({
      channel: 'llm',
      status: llmStatus,
      configured: hasValue(llmKey) || hasValue(primaryKey),
      effectiveKeySource: hasValue(llmKey) ? 'LLM API Key' : hasValue(primaryKey) ? '通用 API Key（回退）' : '无',
      effectiveBaseUrl: cfg.llmBaseUrl || cfg.primaryBaseUrl || 'https://api.openai.com/v1',
      model: cfg.llmModel || 'gpt-4o-mini',
      hints: !hasValue(llmKey) && hasValue(primaryKey)
        ? ['LLM Key 留空，回退使用通用 API Key']
        : !hasValue(llmKey) && !hasValue(primaryKey)
          ? ['请到 设置 → 连接 → 文字模型 填写 LLM API Key（或填写通用 Key 作为回退）']
          : [],
    });

    const geminiKey = cfg.geminiApiKey;
    const magicHourKey = process.env.MAGIC_HOUR_API_KEY;
    const imageConfigured = hasValue(primaryKey) || hasValue(geminiKey) || !!magicHourKey;
    let imageStatus: ConnectionChannelStatus['status'] = 'missing';
    if (hasValue(primaryKey) && hasValue(geminiKey)) imageStatus = 'ready';
    else if (hasValue(primaryKey) || hasValue(geminiKey) || !!magicHourKey) imageStatus = 'partial';
    channels.push({
      channel: 'image',
      status: imageStatus,
      configured: imageConfigured,
      effectiveKeySource: hasValue(primaryKey)
        ? '通用 API Key' : hasValue(geminiKey)
          ? 'Gemini API Key' : magicHourKey
            ? 'Magic Hour (env)' : '无',
      effectiveBaseUrl: cfg.primaryBaseUrl || cfg.geminiBaseUrl || 'https://api.openai.com/v1',
      hints: [
        !hasValue(primaryKey) ? '通用 API Key 未配，Fal/兼容出图不可用' : '',
        !hasValue(geminiKey) && !magicHourKey ? 'Gemini/Magic Hour 未配，相关出图模式不可用' : '',
        hasValue(primaryKey) ? '通用 Key 亦用于 Fal.ai 抠图/Inpaint' : '',
      ].filter(Boolean),
    });

    const videoKey = cfg.videoApiKey;
    const xaiKey = cfg.xaiApiKey;
    const grokGoKey = cfg.grokGoApiKey;
    const vp = cfg.videoProvider || 'custom';
    let videoConfigured = false;
    if (vp === 'xai') videoConfigured = hasValue(xaiKey) || hasValue(videoKey);
    else if (vp === 'grokgo') videoConfigured = hasValue(grokGoKey) || hasValue(videoKey) || hasValue(primaryKey);
    else videoConfigured = hasValue(videoKey) || hasValue(primaryKey);
    channels.push({
      channel: 'video',
      status: videoConfigured ? 'ready' : 'missing',
      configured: videoConfigured,
      effectiveKeySource: vp === 'xai'
        ? (hasValue(xaiKey) ? 'xAI API Key' : '自定义 Video Key')
        : vp === 'grokgo'
          ? (hasValue(grokGoKey) ? 'GrokGo Key' : '回退 Key')
          : hasValue(videoKey)
            ? '自定义 Video Key'
            : hasValue(primaryKey)
              ? '通用 Key（回退）' : '无',
      effectiveBaseUrl: vp === 'xai' ? (cfg.xaiBaseUrl || 'https://api.x.ai/v1') : vp === 'grokgo' ? (cfg.grokGoBaseUrl || 'http://127.0.0.1:8787/v1') : (cfg.videoBaseUrl || cfg.primaryBaseUrl || 'https://api.openai.com/v1'),
      hints: !videoConfigured ? [`当前视频通道为 ${vp}，请填写对应 Key 或切换通道`] : [],
    });

    const ttsKey = cfg.ttsApiKey;
    const audioConfigured = hasValue(ttsKey) || hasValue(primaryKey) || (cfg.voiceboxEnabled ?? false) || (cfg.luxTtsEnabled ?? false);
    channels.push({
      channel: 'audio',
      status: audioConfigured ? 'ready' : 'partial',
      configured: audioConfigured,
      effectiveKeySource: hasValue(ttsKey)
        ? 'TTS API Key' : hasValue(primaryKey)
          ? '通用 Key（回退）' : cfg.voiceboxEnabled
            ? 'Voicebox 本地桥' : cfg.luxTtsEnabled
              ? 'LuxTTS 本地克隆' : '无',
      effectiveBaseUrl: cfg.ttsBaseUrl || cfg.primaryBaseUrl || 'https://api.openai.com/v1',
      hints: [
        (cfg.voiceboxEnabled ?? false) ? `Voicebox: ${cfg.voiceboxBaseUrl || 'http://127.0.0.1:17493'}` : '',
        (cfg.luxTtsEnabled ?? false) ? `LuxTTS: ${cfg.luxTtsBaseUrl || 'http://127.0.0.1:17880'}` : '',
        !hasValue(ttsKey) && !hasValue(primaryKey) && !(cfg.voiceboxEnabled ?? false) && !(cfg.luxTtsEnabled ?? false)
          ? '请配置 TTS Key 或启用本地桥' : '',
      ].filter(Boolean),
    });

    const advancedCount = (cfg.advancedProviders || []).filter((p) => p.enabled !== false).length;
    const overallReady = channels.every((c) => c.status === 'ready' || c.status === 'partial');

    return { channels, advancedProviderCount: advancedCount, overallReady };
  }
}
