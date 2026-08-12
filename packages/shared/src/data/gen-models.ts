export interface PictureGenModelDef {
  id: string;
  label: string;
  provider: 'openai' | 'fal' | 'magichour' | 'gemini';
  /** OpenAI model id、Fal model path，或 Magic Hour 路由名 */
  model: string;
  supportsReference?: boolean;
  defaultSize?: string;
  /** Fal 模型分辨率上限（超过会报错），undefined 表示无限制 */
  resolutionCap?: number;
  /** UI 分组提示（可选） */
  group?: 'gemini' | 'openai' | 'fal' | 'other';
  /** 简短能力说明 */
  hint?: string;
}

/**
 * 图片生成可选模型。
 * Gemini / Imagen 走服务端 GeminiAdapter（需 Gemini API Key）。
 *
 * 免费 API 优先用 gemini-2.5-flash-image（Nano Banana）。
 * 3.1 / Pro 等多需付费 API 配额（网页 Pro ≠ API 额度）。
 */
export const PICTURE_GEN_MODELS: PictureGenModelDef[] = [
  {
    id: 'gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image（免费）',
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    supportsReference: true,
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: 'API 免费档首选 · Nano Banana',
  },
  {
    id: 'gemini-3.1-flash-image',
    label: 'Gemini 3.1 Flash Image',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image',
    supportsReference: true,
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: '需 API 付费配额 · Nano Banana 2',
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    label: 'Gemini 3.1 Flash Lite Image',
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite-image',
    supportsReference: false,
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: '轻量 · 多需付费配额',
  },
  {
    id: 'gemini-3-pro-image',
    label: 'Gemini 3 Pro Image',
    provider: 'gemini',
    model: 'gemini-3-pro-image',
    supportsReference: true,
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: '高阶 · 需 API 付费配额',
  },
  {
    id: 'imagen-4',
    label: 'Imagen 4',
    provider: 'gemini',
    model: 'imagen-4.0-generate-001',
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: 'Google Imagen · 多需付费',
  },
  {
    id: 'imagen-4-ultra',
    label: 'Imagen 4 Ultra',
    provider: 'gemini',
    model: 'imagen-4.0-ultra-generate-001',
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: 'Imagen 最高画质',
  },
  {
    id: 'imagen-4-fast',
    label: 'Imagen 4 Fast',
    provider: 'gemini',
    model: 'imagen-4.0-fast-generate-001',
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: 'Imagen 快速档',
  },
  {
    id: 'dall-e-3',
    label: 'DALL·E 3',
    provider: 'openai',
    model: 'dall-e-3',
    defaultSize: '1024x1024',
    group: 'openai',
  },
  {
    id: 'dall-e-2',
    label: 'DALL·E 2',
    provider: 'openai',
    model: 'dall-e-2',
    defaultSize: '1024x1024',
    group: 'openai',
  },
  {
    id: 'magic-hour',
    label: 'Magic Hour',
    provider: 'magichour',
    model: 'magic-hour',
    defaultSize: '1024x1024',
    group: 'other',
  },
  {
    id: 'flux-dev',
    label: 'FLUX Dev',
    provider: 'fal',
    model: 'fal-ai/flux/dev',
    defaultSize: '1024x1024',
    group: 'fal',
  },
  {
    id: 'flux-i2i',
    label: 'FLUX 图生图',
    provider: 'fal',
    model: 'fal-ai/flux/dev/image-to-image',
    supportsReference: true,
    defaultSize: '1024x1024',
    group: 'fal',
  },
];

export const PICTURE_GEN_SIZES = [
  { id: '1024x1024', label: '1:1 方图' },
  { id: '1024x1792', label: '9:16 竖图' },
  { id: '1792x1024', label: '16:9 横图' },
] as const;

export interface ClipGenModelDef {
  id: string;
  label: string;
  hint: string;
}

export const CLIP_GEN_MODELS: ClipGenModelDef[] = [
  { id: 'magic-hour', label: 'Magic Hour', hint: '文生视频 / 图生视频（需 MAGIC_HOUR_API_KEY）' },
  { id: 'mh-ltx-2.3', label: 'MH LTX 2.3', hint: 'Magic Hour 免费层推荐，速度快' },
  { id: 'veo', label: 'Veo', hint: 'OpenAI 兼容 /videos/generations' },
  { id: 'grok-imagine-video', label: 'Grok Imagine', hint: 'xAI 官方 / GrokGo 测试通道' },
  { id: 'grok-imagine-video-1.5', label: 'Grok Imagine 1.5', hint: 'xAI 官方 / GrokGo 测试通道，图生视频更稳定' },
  { id: 'grok', label: 'Grok Video', hint: '兼容旧节点，自动映射到 Grok Imagine' },
  { id: 'seedance', label: 'Seedance', hint: 'S 级参考通道：参考图≤9 张 / 参考视频≤3 段' },
];

export const CLIP_GEN_ASPECTS = [
  { id: '16:9', label: '16:9 横屏' },
  { id: '9:16', label: '9:16 竖屏' },
  { id: '1:1', label: '1:1 方屏' },
] as const;

/** 默认图片模型：免费 API 友好的 2.5 Flash Image */
export const DEFAULT_PICTURE_GEN_MODEL_ID = 'gemini-2.5-flash-image';

export function lookupPictureModel(id?: string): PictureGenModelDef {
  if (id) {
    const hit = PICTURE_GEN_MODELS.find((m) => m.id === id || m.model === id);
    if (hit) return hit;
  }
  return (
    PICTURE_GEN_MODELS.find((m) => m.id === DEFAULT_PICTURE_GEN_MODEL_ID) ||
    PICTURE_GEN_MODELS.find((m) => m.provider === 'gemini') ||
    PICTURE_GEN_MODELS[0]
  );
}

export function matchPictureModel(id?: string): PictureGenModelDef | undefined {
  if (!id) return undefined;
  return PICTURE_GEN_MODELS.find((m) => m.id === id || m.model === id);
}

/**
 * 解析实际发请求用的模型定义。
 * 连接里配置了目录外 model（如 gpt-image-2）时，透传为 OpenAI 兼容通道，
 * 勿回落到默认 Gemini（否则 UI 选了连接模型却打到另一家）。
 */
export function resolvePictureModelForRequest(id?: string): PictureGenModelDef {
  const hit = matchPictureModel(id);
  if (hit) return hit;
  const raw = (id ?? '').trim();
  if (!raw) return lookupPictureModel();
  return {
    id: raw,
    label: raw,
    provider: 'openai',
    model: raw,
    supportsReference: true,
    defaultSize: '1024x1024',
    group: 'openai',
  };
}

export interface ConnectedPictureModelOption {
  id: string;
  label: string;
  connectionId: string;
  /** 连接上保存的原始 model 字符串 */
  connectionModel: string;
}

type PictureConnectionLike = {
  id: string;
  kind: string;
  model?: string;
  label?: string;
  isActive?: boolean;
  /** 「自动获取」缓存的可选模型列表 */
  availableModels?: string[];
};

/**
 * 从设置里的图片连接推导图像生成可选模型：
 * 优先展开连接上已获取的 availableModels；否则回退到默认 model。
 */
export function listConnectedPictureModels(
  connections: PictureConnectionLike[] | undefined | null,
): ConnectedPictureModelOption[] {
  const imageConns = (connections ?? []).filter((c) => c.kind === 'image');
  const out: ConnectedPictureModelOption[] = [];
  const seen = new Set<string>();

  const pushModel = (c: PictureConnectionLike, rawModel: string) => {
    const raw = rawModel.trim();
    if (!raw) return;
    const def = matchPictureModel(raw);
    const id = def?.id ?? raw;
    if (seen.has(id)) return;
    seen.add(id);
    const label = def
      ? def.hint
        ? `${def.label} · ${def.hint}`
        : def.label
      : c.label
        ? `${c.label} · ${raw}`
        : raw;
    out.push({ id, label, connectionId: c.id, connectionModel: raw });
  };

  const pushConn = (c: PictureConnectionLike) => {
    const cached = (c.availableModels ?? [])
      .map((m) => m.trim())
      .filter(Boolean);
    if (cached.length > 0) {
      for (const m of cached) pushModel(c, m);
      // 默认 model 若不在缓存里，仍补一条，避免当前选中丢失
      const fallback = (c.model ?? '').trim();
      if (fallback && !cached.includes(fallback)) pushModel(c, fallback);
      return;
    }
    pushModel(c, c.model ?? '');
  };

  // 当前连接优先
  for (const c of imageConns.filter((x) => x.isActive)) pushConn(c);
  for (const c of imageConns.filter((x) => !x.isActive)) pushConn(c);
  return out;
}

export interface ConnectedLlmModelOption {
  /** `${connectionId}::${model}`，避免跨连接同名模型冲突 */
  id: string;
  label: string;
  connectionId: string;
  connectionModel: string;
  connectionLabel: string;
}

type LlmConnectionLike = {
  id: string;
  kind: string;
  model?: string;
  label?: string;
  isActive?: boolean;
  availableModels?: string[];
};

/**
 * 从设置里的文字连接推导编剧台等可选 LLM：
 * 优先展开连接上已获取的 availableModels；否则回退到默认 model。
 */
export function listConnectedLlmModels(
  connections: LlmConnectionLike[] | undefined | null,
): ConnectedLlmModelOption[] {
  const llmConns = (connections ?? []).filter((c) => c.kind === 'llm');
  const out: ConnectedLlmModelOption[] = [];
  const seen = new Set<string>();

  const pushModel = (c: LlmConnectionLike, rawModel: string) => {
    const raw = rawModel.trim();
    if (!raw) return;
    const id = `${c.id}::${raw}`;
    if (seen.has(id)) return;
    seen.add(id);
    const connLabel = (c.label ?? '').trim() || '文字连接';
    out.push({
      id,
      label: `${connLabel} · ${raw}`,
      connectionId: c.id,
      connectionModel: raw,
      connectionLabel: connLabel,
    });
  };

  const pushConn = (c: LlmConnectionLike) => {
    const cached = (c.availableModels ?? [])
      .map((m) => m.trim())
      .filter(Boolean);
    if (cached.length > 0) {
      for (const m of cached) pushModel(c, m);
      const fallback = (c.model ?? '').trim();
      if (fallback && !cached.includes(fallback)) pushModel(c, fallback);
      return;
    }
    pushModel(c, c.model ?? '');
  };

  for (const c of llmConns.filter((x) => x.isActive)) pushConn(c);
  for (const c of llmConns.filter((x) => !x.isActive)) pushConn(c);
  return out;
}
