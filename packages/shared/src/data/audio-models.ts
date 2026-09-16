/**
 * 内置音频 / TTS 目录（NX9 开箱可直选）。
 *
 * 词表诚实约定：
 * - `AUDIO_MODELS` 描述 **TTS 引擎（模型）**：写入上游 OpenAI 兼容 /audio/speech 的 `model`，
 *   NX9 服务端缺省为 `tts-1`；
 * - `AUDIO_VOICES` 描述 **音色（voice）**：写入 /audio/speech 的 `voice`，
 *   与模型是两个正交维度，不要把引擎名当音色下发（上游会 400）；
 * - 本地桥（Voicebox / LuxTTS）单独 group `local`，不需要云端 Key；
 * - 中文音色条目只在厂商公开稳定 id 已知时列出，并在 hint 注明所需通道。
 */

export type AudioModelGroup = 'openai' | 'azure' | 'aliyun' | 'local' | 'other';

export interface AudioModelDef {
  /** 目录内唯一 id */
  id: string;
  /** 中文可读名 */
  label: string;
  /** 厂商标识（openai / azure / aliyun / voicebox / luxtts） */
  provider: string;
  /** OpenAI 兼容 /audio/speech 的 model 串 */
  model: string;
  baseUrl?: string;
  hint?: string;
  group?: AudioModelGroup;
}

export const AUDIO_MODELS: AudioModelDef[] = [
  {
    id: 'tts-1',
    label: 'OpenAI TTS-1',
    provider: 'openai',
    model: 'tts-1',
    baseUrl: 'https://api.openai.com/v1',
    group: 'openai',
    hint: 'NX9 缺省 TTS 模型，低延迟',
  },
  {
    id: 'tts-1-hd',
    label: 'OpenAI TTS-1 HD',
    provider: 'openai',
    model: 'tts-1-hd',
    baseUrl: 'https://api.openai.com/v1',
    group: 'openai',
    hint: '音质更高，延迟更大',
  },
  {
    id: 'gpt-4o-mini-tts',
    label: 'OpenAI GPT-4o mini TTS',
    provider: 'openai',
    model: 'gpt-4o-mini-tts',
    baseUrl: 'https://api.openai.com/v1',
    group: 'openai',
    hint: '支持 instructions 语气指令',
  },
  {
    id: 'azure-tts-zh',
    label: 'Azure 语音 · 中文音色',
    provider: 'azure',
    model: 'zh-CN-XiaoxiaoNeural',
    group: 'azure',
    hint: '中文音色；需 Azure 语音端点与 Key，模型名同音色 id',
  },
  {
    id: 'aliyun-cosyvoice',
    label: '阿里 CosyVoice（百炼）',
    provider: 'aliyun',
    model: 'cosyvoice-v1',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    group: 'aliyun',
    hint: '中文音色；具体模型串以百炼文档为准',
  },
  {
    id: 'voicebox',
    label: 'Voicebox 本地桥',
    provider: 'voicebox',
    model: 'voicebox',
    baseUrl: 'http://127.0.0.1:17493',
    group: 'local',
    hint: '本机 Voicebox 进程；需在设置里启用',
  },
  {
    id: 'luxtts',
    label: 'LuxTTS 本地克隆',
    provider: 'luxtts',
    model: 'luxtts',
    baseUrl: 'http://127.0.0.1:17880',
    group: 'local',
    hint: '本机音色克隆；无 GPU 可回落云端或 CPU',
  },
];

/** 按 id 或上游 model 串查内置音频模型 */
export function lookupAudioModel(id?: string): AudioModelDef | undefined {
  const raw = (id ?? '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  return AUDIO_MODELS.find(
    (m) => m.id.toLowerCase() === lower || m.model.toLowerCase() === lower,
  );
}

export function isBuiltinAudioModelId(id?: string): boolean {
  return Boolean(lookupAudioModel(id));
}

export interface AudioVoiceDef {
  /** 下发给 /audio/speech 的 voice 值 */
  id: string;
  /** 中文可读名 */
  label: string;
  provider: string;
  group?: AudioModelGroup;
  hint?: string;
}

/**
 * 内置音色。沿用 NX9 既有云端音色 id（alloy/echo/fable/onyx/nova/shimmer），
 * 只做中文标签化，不改写既有已保存节点的 voice 值。
 */
export const AUDIO_VOICES: AudioVoiceDef[] = [
  { id: 'alloy', label: 'Alloy · 中性（默认）', provider: 'openai', group: 'openai' },
  { id: 'echo', label: 'Echo · 男声', provider: 'openai', group: 'openai' },
  { id: 'fable', label: 'Fable · 叙事', provider: 'openai', group: 'openai' },
  { id: 'onyx', label: 'Onyx · 低沉男声', provider: 'openai', group: 'openai' },
  { id: 'nova', label: 'Nova · 女声', provider: 'openai', group: 'openai' },
  { id: 'shimmer', label: 'Shimmer · 轻柔女声', provider: 'openai', group: 'openai' },
  {
    id: 'zh-CN-XiaoxiaoNeural',
    label: '晓晓 · 中文女声（Azure）',
    provider: 'azure',
    group: 'azure',
    hint: '需 Azure 语音连接',
  },
  {
    id: 'zh-CN-YunxiNeural',
    label: '云希 · 中文男声（Azure）',
    provider: 'azure',
    group: 'azure',
    hint: '需 Azure 语音连接',
  },
];

/** 云端缺省音色（与服务端 / 节点 data.voice 缺省一致） */
export const DEFAULT_AUDIO_VOICE_ID = 'alloy';

export function lookupAudioVoice(id?: string): AudioVoiceDef | undefined {
  const raw = (id ?? '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  return AUDIO_VOICES.find((v) => v.id.toLowerCase() === lower);
}

/** 该值是否是目录内已知音色（用于避免把引擎名 tts-1 当音色下发） */
export function isKnownAudioVoiceId(id?: string): boolean {
  return Boolean(lookupAudioVoice(id));
}
