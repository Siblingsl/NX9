/**
 * 内置文字 / 音频（TTS）模型目录回归（增量新增能力）。
 *
 * 同样走相对路径直取 shared 源码，避免 barrel（packages/shared/src/index.ts）
 * 引用了尚不存在的 data/* 模块导致解析失败。
 */
import { describe, expect, it } from 'vitest';
import {
  LLM_MODELS,
  lookupLlmModel,
} from '../../../../../packages/shared/src/data/llm-models';
import {
  AUDIO_MODELS,
  AUDIO_VOICES,
  DEFAULT_AUDIO_VOICE_ID,
  isKnownAudioVoiceId,
} from '../../../../../packages/shared/src/data/audio-models';
import {
  BUILTIN_GROUP_LABEL,
  BUILTIN_VOICE_GROUP_LABEL,
  CONNECTION_GROUP_LABEL,
  listBuiltinAudioVoiceOptions,
  listBuiltinLlmModelOptions,
  listMergedAudioModelOptions,
  listMergedAudioVoiceOptions,
  listMergedLlmModelOptions,
} from '../../../../../packages/shared/src/data/model-catalog';

const lower = (v: string) => v.trim().toLowerCase();

describe('LLM_MODELS 目录本身', () => {
  it('非空、id 唯一、每条有可读 label、model 串与中文说明', () => {
    expect(LLM_MODELS.length).toBeGreaterThan(8);
    const ids = LLM_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of LLM_MODELS) {
      expect(def.label.trim(), def.id).toBeTruthy();
      expect(def.model.trim(), def.id).toBeTruthy();
      // 品牌名可保留英文（GPT-4o / Gemini），但能力说明必须是中文
      expect(/^(todo|tbd|placeholder|model|test)/i.test(def.label), def.id).toBe(false);
      expect(def.hint?.trim(), def.id).toBeTruthy();
      expect(/[\u4e00-\u9fa5]/.test(def.hint ?? ''), def.id).toBe(true);
    }
  });

  it('覆盖需求列出的厂商与本地桥', () => {
    const providers = new Set(LLM_MODELS.map((m) => m.provider));
    for (const p of ['deepseek', 'zhipu', 'aliyun', 'moonshot', 'openai', 'anthropic', 'gemini', 'xai', 'ollama', 'localai']) {
      expect(providers.has(p), p).toBe(true);
    }
    expect(LLM_MODELS.some((m) => m.group === 'local')).toBe(true);
    expect(LLM_MODELS.some((m) => m.group === 'glm')).toBe(true);
    expect(LLM_MODELS.some((m) => m.group === 'qwen')).toBe(true);
  });

  it('lookupLlmModel 支持 id 与 model 串', () => {
    expect(lookupLlmModel('deepseek-chat')?.model).toBe('deepseek-chat');
    expect(lookupLlmModel('gpt-4o-mini')?.id).toBe('gpt-4o-mini');
    expect(lookupLlmModel('gpt-4o-mini')?.model).toBe('gpt-4o-mini');
    expect(lookupLlmModel('openrouter-gpt-4o-mini')?.model).toBe('openai/gpt-4o-mini');
    expect(lookupLlmModel('不存在')).toBeUndefined();
  });
});

describe('listMergedLlmModelOptions', () => {
  it('无连接时仅返回内置项，且 id 不重复', () => {
    const merged = listMergedLlmModelOptions(undefined);
    expect(merged.length).toBe(listBuiltinLlmModelOptions().length);
    expect(merged.every((m) => m.source === 'builtin')).toBe(true);
    const ids = merged.map((m) => lower(m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('内置在前，连接在后，且同串去重', () => {
    const merged = listMergedLlmModelOptions([
      { id: 'c1', kind: 'llm', label: '我的 DeepSeek', model: 'deepseek-chat', isActive: true },
      { id: 'c2', kind: 'llm', label: '私有模型', model: 'my-llm-x', isActive: false },
    ]);
    const firstConn = merged.findIndex((m) => m.source === 'connection');
    const lastBuiltin = merged.map((m) => m.source).lastIndexOf('builtin');
    expect(firstConn).toBeGreaterThan(lastBuiltin);

    // deepseek-chat 是内置串，连接项被吸收
    expect(merged.filter((m) => lower(m.id) === 'deepseek-chat')).toHaveLength(1);
    // 私有模型保留为连接项
    const privateOpt = merged.find((m) => m.id === 'my-llm-x');
    expect(privateOpt?.source).toBe('connection');
    expect(privateOpt?.connectionId).toBe('c2');
    expect(privateOpt?.groupLabel).toBe(CONNECTION_GROUP_LABEL);
  });

  it('忽略非文字连接', () => {
    const merged = listMergedLlmModelOptions([
      { id: 'c9', kind: 'video', label: '视频', model: 'kling-v1' },
    ]);
    expect(merged.some((m) => m.id === 'kling-v1')).toBe(false);
  });
});

describe('AUDIO_MODELS / AUDIO_VOICES 目录本身', () => {
  it('音频模型非空、id 唯一，本地桥单独 group=local', () => {
    expect(AUDIO_MODELS.length).toBeGreaterThan(3);
    const ids = AUDIO_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(AUDIO_MODELS.some((m) => m.id === 'tts-1')).toBe(true);
    expect(AUDIO_MODELS.some((m) => m.id === 'tts-1-hd')).toBe(true);
    const local = AUDIO_MODELS.filter((m) => m.group === 'local').map((m) => m.id);
    expect(local).toEqual(expect.arrayContaining(['voicebox', 'luxtts']));
    for (const def of AUDIO_MODELS) {
      expect(def.label.trim(), def.id).toBeTruthy();
      expect(def.model.trim(), def.id).toBeTruthy();
      expect(/[\u4e00-\u9fa5]/.test(def.hint ?? ''), def.id).toBe(true);
    }
  });

  it('音色目录保留既有云端音色 id，缺省仍是 alloy', () => {
    const voiceIds = AUDIO_VOICES.map((v) => v.id);
    for (const v of ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']) {
      expect(voiceIds, v).toContain(v);
    }
    expect(new Set(voiceIds).size).toBe(voiceIds.length);
    expect(DEFAULT_AUDIO_VOICE_ID).toBe('alloy');
    expect(isKnownAudioVoiceId('alloy')).toBe(true);
    expect(isKnownAudioVoiceId('tts-1')).toBe(false);
  });

  it('含常见中文音色条目', () => {
    const labels = AUDIO_VOICES.map((v) => v.label).join('|');
    expect(labels).toContain('晓晓');
    expect(labels).toContain('云希');
  });
});

describe('listMergedAudioModelOptions', () => {
  it('内置在前，连接在后', () => {
    const merged = listMergedAudioModelOptions([
      { id: 'c1', kind: 'audio', label: '我的 TTS', model: 'custom-tts-9', isActive: true },
    ]);
    expect(merged[0]?.source).toBe('builtin');
    expect(merged[0]?.groupLabel).toBe(BUILTIN_GROUP_LABEL);
    const connOpt = merged.find((m) => m.id === 'custom-tts-9');
    expect(connOpt?.source).toBe('connection');
    expect(connOpt?.groupLabel).toBe(CONNECTION_GROUP_LABEL);
    // 内置引擎名与连接同串时去重
    expect(merged.filter((m) => lower(m.id) === 'tts-1')).toHaveLength(1);
  });
});

describe('listMergedAudioVoiceOptions', () => {
  it('无连接时只返回内置音色（按 groupLabel=内置音色）', () => {
    const merged = listMergedAudioVoiceOptions(undefined);
    expect(merged.length).toBe(listBuiltinAudioVoiceOptions().length);
    expect(merged.every((m) => m.groupLabel === BUILTIN_VOICE_GROUP_LABEL)).toBe(true);
  });

  it('连接声明的引擎名（tts-1）不会被当音色下发', () => {
    const merged = listMergedAudioVoiceOptions([
      { id: 'c1', kind: 'audio', label: 'OpenAI TTS', model: 'tts-1', isActive: true },
    ]);
    expect(merged.some((m) => m.id === 'tts-1')).toBe(false);
  });

  it('连接声明的非引擎音色值直通到「我的连接」组', () => {
    const merged = listMergedAudioVoiceOptions([
      { id: 'c1', kind: 'audio', label: '中文代理', model: 'zh-CN-YunjianNeural', isActive: true },
    ]);
    const connOpt = merged.find((m) => m.id === 'zh-CN-YunjianNeural');
    expect(connOpt?.source).toBe('connection');
    expect(connOpt?.groupLabel).toBe(CONNECTION_GROUP_LABEL);
    expect(connOpt?.connectionId).toBe('c1');
    // 内置音色仍在前
    expect(merged[0]?.source).toBe('builtin');
  });
});
