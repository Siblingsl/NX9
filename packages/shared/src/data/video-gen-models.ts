import type { VideoGenModelOption } from './gen-models';

/**
 * 内置视频模型目录（NX9 开箱可直选）。
 *
 * 词表诚实约定：
 * - 本目录只描述「可直选的上游模型名」，不承诺任何厂商账号/额度；
 * - `model` 是发给上游 OpenAI 兼容端点（NX9 网关 POST /videos/generations）的模型串，
 *   这些串必须与用户实际使用的网关命名一致 —— 各家聚合网关对同一厂商的命名并不统一，
 *   因此目录按「厂商家族名」给出稳定串，并在 hint 里注明「以你的网关命名为准」；
 * - 不确定的能力（时长上限、音频、参考图）**留空**，不臆造参数；
 * - 真实密钥与端点仍由「设置 → 连接」提供，目录本身不含凭据。
 */

export type VideoGenModelGroup =
  | 'kling'
  | 'seedance'
  | 'wan'
  | 'minimax'
  | 'openai'
  | 'google'
  | 'runway'
  | 'luma'
  | 'pika'
  | 'vidu'
  | 'other';

export interface VideoGenModelDef {
  /** 目录内唯一 id（同时作为下拉去重键） */
  id: string;
  /** 中文可读名 */
  label: string;
  /** 厂商/通道标识，如 kling / byteplus / openai-compatible */
  provider: string;
  /** 网关路径或 OpenAI 兼容 model id（写入 clip-gen data.model） */
  model: string;
  /** 端点提示（仅在该端点稳定已知时填写） */
  baseUrlHint?: string;
  supportsReference?: boolean;
  supportsAudio?: boolean;
  maxDurationSec?: number;
  aspectRatios?: string[];
  /** UI 分组（NX9 内置词表） */
  group?: VideoGenModelGroup;
  /** 简短能力说明，直接展示给用户 */
  hint?: string;
}

/** 主流视频模型均支持横竖屏 */
const LANDSCAPE_PORTRAIT = ['16:9', '9:16'];

/**
 * 通用网关缺省模型串。
 * 与执行层保持一致：clip-gen 请求在 data.model 为空时即用 `veo`，
 * 服务端 resolveVideoModel 会把 `veo` 归一为「当前激活视频连接的模型」。
 */
export const DEFAULT_BUILTIN_VIDEO_MODEL_ID = 'veo';

export const VIDEO_GEN_MODELS: VideoGenModelDef[] = [
  // —— 可灵 Kling ——
  {
    id: 'kling-v1',
    label: '可灵 Kling 1.x',
    provider: 'kling',
    model: 'kling-v1',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'kling',
    hint: '可灵 1.x 家族名；具体型号串以你的网关命名为准',
  },
  {
    id: 'kling-v2',
    label: '可灵 Kling 2.x',
    provider: 'kling',
    model: 'kling-v2',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'kling',
    hint: '可灵 2.x 家族名；画质/运动更强，具体型号串以网关为准',
  },

  // —— 字节 Seedance ——
  {
    id: 'seedance',
    label: '字节 Seedance 1.0',
    provider: 'byteplus',
    model: 'seedance',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'seedance',
    hint: 'NX9 内置 S 级参考通道（参考图 ≤9 / 参考视频 ≤3）；此串为执行层识别 id',
  },
  {
    id: 'seedance-2-0',
    label: '字节 Seedance 2.0',
    provider: 'byteplus',
    model: 'seedance-2-0',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'seedance',
    hint: '型号串以你的网关命名为准；S 级参考校验仅识别 seedance',
  },
  {
    id: 'seedance-2-5',
    label: '字节 Seedance 2.5',
    provider: 'byteplus',
    model: 'seedance-2-5',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'seedance',
    hint: '型号串以你的网关命名为准；S 级参考校验仅识别 seedance',
  },

  // —— 阿里 Wan（通义万相） ——
  {
    id: 'wan-2',
    label: '阿里 Wan 2.x',
    provider: 'aliyun',
    model: 'wan-2',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'wan',
    hint: '通义万相 2.x 家族名；具体型号串以你的网关命名为准',
  },
  {
    id: 'wan-3',
    label: '阿里 Wan 3.0',
    provider: 'aliyun',
    model: 'wan-3',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'wan',
    hint: '通义万相 3.0 家族名；具体型号串以你的网关命名为准',
  },

  // —— MiniMax（海螺） ——
  {
    id: 'minimax-hailuo',
    label: 'MiniMax Hailuo（海螺）',
    provider: 'minimax',
    model: 'minimax-hailuo',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'minimax',
    hint: '海螺视频家族名；具体型号串以你的网关命名为准',
  },
  {
    id: 'minimax-h3',
    label: 'MiniMax H3',
    provider: 'minimax',
    model: 'minimax-h3',
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'minimax',
    hint: '具体型号串以你的网关命名为准',
  },

  // —— 其他主流厂商 ——
  {
    id: 'vidu',
    label: 'Vidu（生数科技）',
    provider: 'vidu',
    model: 'vidu',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'vidu',
    hint: '以图生视频/参考一致性见长；型号串以网关为准',
  },
  {
    id: 'pixverse',
    label: 'PixVerse',
    provider: 'pixverse',
    model: 'pixverse',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'other',
    hint: '型号串以你的网关命名为准',
  },
  {
    id: 'runway-gen4',
    label: 'Runway Gen-4',
    provider: 'runway',
    model: 'runway-gen4',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'runway',
    hint: '型号串以你的网关命名为准',
  },
  {
    id: 'luma-ray',
    label: 'Luma Ray',
    provider: 'luma',
    model: 'luma-ray',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'luma',
    hint: '型号串以你的网关命名为准',
  },
  {
    id: 'pika',
    label: 'Pika',
    provider: 'pika',
    model: 'pika',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'pika',
    hint: '型号串以你的网关命名为准',
  },

  // —— OpenAI / Google ——
  {
    id: 'sora',
    label: 'OpenAI Sora',
    provider: 'openai',
    model: 'sora',
    baseUrlHint: 'https://api.openai.com/v1',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'openai',
    hint: 'OpenAI 视频模型；经你的网关直通',
  },
  {
    id: 'veo-3',
    label: 'Google Veo 3',
    provider: 'google',
    model: 'veo-3',
    baseUrlHint: 'https://generativelanguage.googleapis.com/v1beta',
    supportsReference: true,
    supportsAudio: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'google',
    hint: 'Veo 3 带原生音频；需网关/连接支持该模型名',
  },

  // —— xAI ——
  {
    id: 'grok-imagine-video',
    label: 'xAI Grok Imagine',
    provider: 'xai',
    model: 'grok-imagine-video',
    baseUrlHint: 'https://api.x.ai/v1',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'other',
    hint: '需首帧图；xAI 官方端点，本地视频桥同名直通',
  },
  {
    id: 'grok-imagine-video-1.5',
    label: 'xAI Grok Imagine 1.5',
    provider: 'xai',
    model: 'grok-imagine-video-1.5',
    baseUrlHint: 'https://api.x.ai/v1',
    supportsReference: true,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'other',
    hint: '图生视频更稳；型号串以网关为准',
  },

  // —— NX9 服务端内置适配通道 ——
  {
    id: 'magic-hour',
    label: 'Magic Hour',
    provider: 'magichour',
    model: 'magic-hour',
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'other',
    hint: '服务端内置适配器；需 MAGIC_HOUR_API_KEY',
  },
  {
    id: 'mh-ltx-2.3',
    label: 'MH LTX 2.3',
    provider: 'magichour',
    model: 'mh-ltx-2.3',
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'other',
    hint: 'Magic Hour 免费层推荐，速度快',
  },

  // —— fallback ——
  {
    id: 'local-video-bridge',
    label: '本地视频桥（开发）',
    provider: 'grokgo',
    model: 'grok-imagine-video',
    baseUrlHint: 'http://127.0.0.1:8787/v1',
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'other',
    hint: '本机开发桥；上游模型串与 Grok Imagine 相同，端点由「设置 → 连接」切换',
  },
  {
    id: 'openai-compatible',
    label: '通用 OpenAI 兼容',
    provider: 'openai-compatible',
    model: DEFAULT_BUILTIN_VIDEO_MODEL_ID,
    aspectRatios: LANDSCAPE_PORTRAIT,
    group: 'openai',
    hint: '不指定模型：由当前激活的视频连接决定实际模型串',
  },
];

/** 按 id 或上游 model 串查内置视频模型 */
export function lookupVideoGenModel(id?: string): VideoGenModelDef | undefined {
  const raw = (id ?? '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  return VIDEO_GEN_MODELS.find(
    (m) => m.id.toLowerCase() === lower || m.model.toLowerCase() === lower,
  );
}

export function isBuiltinVideoModelId(id?: string): boolean {
  return Boolean(lookupVideoGenModel(id));
}

export interface BuiltinVideoModelOption extends VideoGenModelOption {
  provider: string;
  /** 写入 clip-gen data.model 的上游模型串 */
  model: string;
  supportsReference?: boolean;
  supportsAudio?: boolean;
  maxDurationSec?: number;
  aspectRatios?: string[];
  group?: VideoGenModelGroup;
  builtin: true;
}

/**
 * 内置视频模型下拉项。
 * 结构与既有 `VideoGenModelOption` 兼容（id/label/hint + connection*），
 * 额外带 provider/model/能力位，`builtin: true` 表示不来自用户连接。
 */
export function listBuiltinVideoModels(): BuiltinVideoModelOption[] {
  return VIDEO_GEN_MODELS.map((def) => ({
    id: def.model,
    label: def.label,
    hint: def.hint,
    provider: def.provider,
    model: def.model,
    supportsReference: def.supportsReference,
    supportsAudio: def.supportsAudio,
    maxDurationSec: def.maxDurationSec,
    aspectRatios: def.aspectRatios,
    group: def.group,
    builtin: true as const,
  }));
}
