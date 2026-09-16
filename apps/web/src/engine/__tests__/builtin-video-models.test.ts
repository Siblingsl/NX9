/**
 * 内置视频模型目录回归（增量新增能力）。
 *
 * 注意：本文件的 import 走**相对路径直取 shared 源码**，而不是 '@nx9/shared'。
 * 原因：packages/shared/src/index.ts 目前引用了若干尚不存在的 data/* 模块（既有缺陷），
 * 走 barrel 会让本测试无法解析；相对路径只依赖本次新增的目录文件，与缺陷解耦。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUILTIN_VIDEO_MODEL_ID,
  VIDEO_GEN_MODELS,
  isBuiltinVideoModelId,
  listBuiltinVideoModels,
  lookupVideoGenModel,
} from '../../../../../packages/shared/src/data/video-gen-models';
import {
  BUILTIN_GROUP_LABEL,
  CONNECTION_GROUP_LABEL,
  listBuiltinVideoModelOptions,
  listMergedVideoModelOptions,
} from '../../../../../packages/shared/src/data/model-catalog';

const lower = (v: string) => v.trim().toLowerCase();

describe('VIDEO_GEN_MODELS 目录本身', () => {
  it('非空且 id 唯一', () => {
    expect(VIDEO_GEN_MODELS.length).toBeGreaterThan(10);
    const ids = VIDEO_GEN_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每条都有可读 label、provider、上游 model 串与中文能力提示', () => {
    for (const def of VIDEO_GEN_MODELS) {
      expect(def.label.trim(), def.id).toBeTruthy();
      expect(def.provider.trim(), def.id).toBeTruthy();
      expect(def.model.trim(), def.id).toBeTruthy();
      // label 不得是占位串（厂商品牌名可保留英文，如 Magic Hour / Pika）
      expect(/^(todo|tbd|placeholder|model|test)/i.test(def.label), def.id).toBe(false);
      // 能力提示必须是中文说明，避免丢给用户英文术语
      expect(def.hint?.trim(), def.id).toBeTruthy();
      expect(/[\u4e00-\u9fa5]/.test(def.hint ?? ''), def.id).toBe(true);
    }
  });

  it('覆盖需求列出的主流引擎与两个 fallback', () => {
    const labels = VIDEO_GEN_MODELS.map((m) => m.label).join('|');
    for (const keyword of [
      '可灵',
      'Seedance',
      'Wan',
      'Hailuo',
      'Vidu',
      'PixVerse',
      'Runway',
      'Luma',
      'Pika',
      'Sora',
      'Veo',
      'Grok Imagine',
    ]) {
      expect(labels, keyword).toContain(keyword);
    }
    expect(isBuiltinVideoModelId('local-video-bridge')).toBe(true);
    expect(isBuiltinVideoModelId('openai-compatible')).toBe(true);

    const groups = VIDEO_GEN_MODELS.map((m) => m.group).filter(Boolean);
    for (const g of ['kling', 'seedance', 'wan', 'minimax', 'openai', 'google', 'runway', 'luma', 'pika', 'vidu']) {
      expect(groups, g).toContain(g);
    }
  });

  it('执行层识别的模型串保持在目录内（Seedance / Grok / Magic Hour）', () => {
    // clip-gen 分支按 data.model 精确匹配这些串，目录不得把它们改写成别的名字
    expect(lookupVideoGenModel('seedance')?.model).toBe('seedance');
    expect(lookupVideoGenModel('grok-imagine-video')?.model).toBe('grok-imagine-video');
    expect(lookupVideoGenModel('magic-hour')?.provider).toBe('magichour');
    expect(DEFAULT_BUILTIN_VIDEO_MODEL_ID).toBe('veo');
    expect(VIDEO_GEN_MODELS.some((m) => m.model === DEFAULT_BUILTIN_VIDEO_MODEL_ID)).toBe(true);
  });

  it('不臆造不确定的能力参数（时长上限一律留空）', () => {
    for (const def of VIDEO_GEN_MODELS) {
      expect(def.maxDurationSec, def.id).toBeUndefined();
    }
  });

  it('lookupVideoGenModel 支持 id 与 model 串，未命中返回 undefined', () => {
    expect(lookupVideoGenModel('kling-v1')?.id).toBe('kling-v1');
    expect(lookupVideoGenModel(' seedance ')?.model).toBe('seedance');
    expect(lookupVideoGenModel('SEEDANCE')?.model).toBe('seedance');
    expect(lookupVideoGenModel('不存在的模型')).toBeUndefined();
    expect(lookupVideoGenModel('')).toBeUndefined();
    expect(lookupVideoGenModel(undefined)).toBeUndefined();
  });
});

describe('listBuiltinVideoModels', () => {
  it('返回与 VideoGenModelOption 兼容的结构并带 builtin 标记', () => {
    const out = listBuiltinVideoModels();
    expect(out.length).toBe(VIDEO_GEN_MODELS.length);
    for (const opt of out) {
      expect(opt.builtin).toBe(true);
      expect(opt.id).toBe(opt.model);
      expect(opt.connectionId).toBeUndefined();
      expect(opt.label.trim()).toBeTruthy();
    }
  });
});

describe('listMergedVideoModelOptions', () => {
  it('无连接时返回全部内置项，且内置在前', () => {
    const merged = listMergedVideoModelOptions(undefined);
    expect(merged.length).toBeGreaterThan(10);
    expect(merged.length).toBeLessThanOrEqual(listBuiltinVideoModelOptions().length);
    expect(merged.every((m) => m.source === 'builtin')).toBe(true);
    expect(merged.every((m) => m.groupLabel === BUILTIN_GROUP_LABEL)).toBe(true);
  });

  it('内置项按上游模型串去重（同串只出现一次）', () => {
    const merged = listMergedVideoModelOptions(null);
    const ids = merged.map((m) => lower(m.id));
    expect(new Set(ids).size).toBe(ids.length);
    // 本地视频桥与 Grok Imagine 共用上游模型串，合并后只保留先出现的厂商项
    expect(ids.filter((v) => v === 'grok-imagine-video').length).toBe(1);
    expect(merged.find((m) => m.id === 'grok-imagine-video')?.source).toBe('builtin');
  });

  it('连接项排在内置之后，并带 source / connection 信息', () => {
    const merged = listMergedVideoModelOptions([
      { id: 'c1', kind: 'video', label: '我的网关', model: 'klings-geheim', isActive: true },
    ]);
    const firstConnection = merged.findIndex((m) => m.source === 'connection');
    const lastBuiltin = merged.map((m) => m.source).lastIndexOf('builtin');
    expect(firstConnection).toBeGreaterThan(lastBuiltin);

    const hit = merged[firstConnection];
    expect(hit.id).toBe('klings-geheim');
    expect(hit.groupLabel).toBe(CONNECTION_GROUP_LABEL);
    expect(hit.connectionId).toBe('c1');
    expect(hit.connectionModel).toBe('klings-geheim');
    expect(hit.connectionLabel).toBe('我的网关');
  });

  it('与内置同串的连接模型被内置吸收，不产生重复项', () => {
    const merged = listMergedVideoModelOptions([
      { id: 'c1', kind: 'video', label: '网关A', model: 'kling-v2', isActive: true },
    ]);
    const hits = merged.filter((m) => lower(m.id) === 'kling-v2');
    expect(hits).toHaveLength(1);
    expect(hits[0].source).toBe('builtin');
  });

  it('展开连接上的 availableModels，并忽略非视频连接', () => {
    const merged = listMergedVideoModelOptions([
      {
        id: 'c2',
        kind: 'video',
        label: '聚合网关',
        model: 'default-video',
        availableModels: ['agg-video-a', 'agg-video-b'],
        isActive: true,
      },
      { id: 'c3', kind: 'llm', label: '文字连接', model: 'gpt-4o' },
      { id: 'c4', kind: 'audio', label: '音频连接', model: 'tts-1' },
    ]);
    const connIds = merged.filter((m) => m.source === 'connection').map((m) => m.id);
    expect(connIds).toEqual(['agg-video-a', 'agg-video-b', 'default-video']);
    expect(merged.some((m) => m.id === 'gpt-4o')).toBe(false);
    expect(merged.some((m) => m.id === 'tts-1')).toBe(false);
  });

  it('key 唯一（内置与连接同串时也不会撞 key）', () => {
    const merged = listMergedVideoModelOptions([
      { id: 'c1', kind: 'video', label: '网关A', model: 'kling-v2', isActive: true },
      { id: 'c5', kind: 'video', label: '网关B', model: 'kling-v2', isActive: false },
    ]);
    const keys = merged.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('不修改传入的连接对象', () => {
    const conns = [
      { id: 'c1', kind: 'video', label: '网关A', model: 'x1', isActive: true },
    ];
    const snapshot = JSON.stringify(conns);
    listMergedVideoModelOptions(conns);
    expect(JSON.stringify(conns)).toBe(snapshot);
  });
});
