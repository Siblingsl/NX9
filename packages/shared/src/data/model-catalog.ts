import {
  listConnectedAudioModels,
  listConnectedLlmModels,
  listConnectedVideoModels,
} from './gen-models';
import { VIDEO_GEN_MODELS, lookupVideoGenModel } from './video-gen-models';
import { LLM_MODELS } from './llm-models';
import { AUDIO_MODELS, AUDIO_VOICES } from './audio-models';

/**
 * 模型目录合并层。
 *
 * 目标：让下拉同时呈现「NX9 内置目录」与「我的连接」，内置在前。
 * 约束（勿破坏契约）：
 * - `id` 始终是**写入节点/设置的上游模型串**（视频=clip-gen data.model，LLM=llmModel，
 *   音频=/audio/speech 的 model），既有已保存数据的读取路径不变；
 * - 去重按 id（忽略大小写）全局进行，内置优先 —— 同一上游串只出现一次，
 *   因此同一模型既在内置目录、又被连接声明时，只保留内置项；
 * - `key` 才是列表渲染主键（内置 `builtin:<目录 id>`，连接 `conn:<连接 id>::<模型>`），
 *   避免同串项撞 React key。
 */

export type ModelOptionSource = 'builtin' | 'connection';

export interface MergedModelOption {
  /** 下拉值 = 写入上游的模型串（唯一下拉取值） */
  id: string;
  label: string;
  hint?: string;
  source: ModelOptionSource;
  /** 列表渲染主键（非写入值） */
  key: string;
  /** 内置目录 id（仅 source === 'builtin'） */
  builtinId?: string;
  connectionId?: string;
  connectionModel?: string;
  connectionLabel?: string;
  /** 厂商分组（内置项） */
  group?: string;
  /** UI 分组标题：「内置模型」/「我的连接」/「内置音色」 */
  groupLabel: string;
}

export const BUILTIN_GROUP_LABEL = '内置模型';
export const CONNECTION_GROUP_LABEL = '我的连接';
export const BUILTIN_VOICE_GROUP_LABEL = '内置音色';

/** 连接的最小结构（与 ModelConnection 兼容，避免 shared 内循环依赖） */
export type ModelConnectionLike = {
  id: string;
  kind: string;
  model?: string;
  label?: string;
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  isActive?: boolean;
  availableModels?: string[];
};

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

/** 合并用的连接项（各模态连接选项的公共视图） */
interface ConnectionEntry {
  value: string;
  label: string;
  connectionId: string;
  connectionLabel: string;
}

type ConnectedLike = {
  connectionModel: string;
  label: string;
  connectionId: string;
  connectionLabel: string;
};

function toEntries(connected: ConnectedLike[]): ConnectionEntry[] {
  return connected.map((c) => ({
    value: c.connectionModel,
    label: c.label,
    connectionId: c.connectionId,
    connectionLabel: c.connectionLabel,
  }));
}

/** 内置项内部也去重（同上游串只保留先出现者） */
function dedupeById(items: MergedModelOption[]): MergedModelOption[] {
  const seen = new Set<string>();
  const out: MergedModelOption[] = [];
  for (const item of items) {
    const key = normalizeId(item.id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** 内置目录在前 + 连接项在后，按上游模型串去重 */
function mergeCatalogAndConnections(
  builtins: MergedModelOption[],
  entries: ConnectionEntry[],
): MergedModelOption[] {
  const out = dedupeById(builtins);
  const seen = new Set(out.map((o) => normalizeId(o.id)));
  for (const entry of entries) {
    const value = entry.value.trim();
    const key = normalizeId(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: value,
      label: entry.label,
      source: 'connection',
      key: `conn:${entry.connectionId}::${value}`,
      connectionId: entry.connectionId,
      connectionModel: value,
      connectionLabel: entry.connectionLabel,
      groupLabel: CONNECTION_GROUP_LABEL,
    });
  }
  return out;
}

/** 内置视频模型合并项（不含连接，保留目录 1:1 视图供检查） */
export function listBuiltinVideoModelOptions(): MergedModelOption[] {
  return VIDEO_GEN_MODELS.map((def) => ({
    id: def.model,
    label: def.label,
    hint: def.hint,
    source: 'builtin' as const,
    key: `builtin:${def.id}`,
    builtinId: def.id,
    group: def.group,
    groupLabel: BUILTIN_GROUP_LABEL,
  }));
}

/** 内置文字模型合并项（不含连接） */
export function listBuiltinLlmModelOptions(): MergedModelOption[] {
  return LLM_MODELS.map((def) => ({
    id: def.model,
    label: def.label,
    hint: def.hint,
    source: 'builtin' as const,
    key: `builtin:${def.id}`,
    builtinId: def.id,
    group: def.group,
    groupLabel: BUILTIN_GROUP_LABEL,
  }));
}

/** 内置音频模型合并项（不含连接） */
export function listBuiltinAudioModelOptions(): MergedModelOption[] {
  return AUDIO_MODELS.map((def) => ({
    id: def.model,
    label: def.label,
    hint: def.hint,
    source: 'builtin' as const,
    key: `builtin:${def.id}`,
    builtinId: def.id,
    group: def.group,
    groupLabel: BUILTIN_GROUP_LABEL,
  }));
}

/** 内置音色合并项（不含连接） */
export function listBuiltinAudioVoiceOptions(): MergedModelOption[] {
  return AUDIO_VOICES.map((def) => ({
    id: def.id,
    label: def.label,
    hint: def.hint,
    source: 'builtin' as const,
    key: `builtin:${def.id}`,
    builtinId: def.id,
    group: def.group,
    groupLabel: BUILTIN_VOICE_GROUP_LABEL,
  }));
}

/** 内置 + 视频连接模型（去重，内置在前） */
export function listMergedVideoModelOptions(
  connections?: ModelConnectionLike[] | null,
): MergedModelOption[] {
  return mergeCatalogAndConnections(
    listBuiltinVideoModelOptions(),
    toEntries(listConnectedVideoModels(connections)),
  );
}

/** 内置 + 文字连接模型（去重，内置在前） */
export function listMergedLlmModelOptions(
  connections?: ModelConnectionLike[] | null,
): MergedModelOption[] {
  return mergeCatalogAndConnections(
    listBuiltinLlmModelOptions(),
    toEntries(listConnectedLlmModels(connections)),
  );
}

/**
 * 内置 + 音频连接模型（去重，内置在前）。
 * 注意：这里的值语义是 **TTS 引擎**（tts-1 等），不是音色；
 * 音色请用 listMergedAudioVoiceOptions。
 */
export function listMergedAudioModelOptions(
  connections?: ModelConnectionLike[] | null,
): MergedModelOption[] {
  return mergeCatalogAndConnections(
    listBuiltinAudioModelOptions(),
    toEntries(listConnectedAudioModels(connections)),
  );
}

/**
 * 内置音色 + 音频连接上声明的音色值（去重，内置在前）。
 *
 * 连接里 `model` / `availableModels` 存的常是 **TTS 引擎名**（tts-1 等），
 * 把它当音色下发必被上游拒绝；因此命中内置音频引擎名的连接值一律剔除，
 * 其余按用户自己声明的值直通（与视频/文字连接下拉语义一致）——
 * 需要「选得上就发得出」，不做静默兜底。
 */
export function listMergedAudioVoiceOptions(
  connections?: ModelConnectionLike[] | null,
): MergedModelOption[] {
  const engineIds = new Set(AUDIO_MODELS.map((m) => normalizeId(m.model)));
  const entries = toEntries(listConnectedAudioModels(connections)).filter(
    (e) => !engineIds.has(normalizeId(e.value)),
  );
  return mergeCatalogAndConnections(listBuiltinAudioVoiceOptions(), entries);
}

/** 该值是否属于内置视频目录（含别名 model 串） */
export function isBuiltinVideoModelValue(id?: string): boolean {
  return Boolean(lookupVideoGenModel(id));
}
