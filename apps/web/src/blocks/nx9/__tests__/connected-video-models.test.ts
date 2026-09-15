import { describe, expect, it } from 'vitest';
import {
  listConnectedVideoModels,
  listVideoGenModelOptions,
  lookupVideoGenModelHint,
  normalizeVideoBaseUrl,
  resolveActiveVideoConnectionModel,
  resolveActiveVideoConnection,
} from '@nx9/shared';

describe('listConnectedVideoModels', () => {
  it('展开 active 连接的 availableModels，并保留默认 model', () => {
    const out = listConnectedVideoModels([
      {
        id: 'vid-1',
        kind: 'video',
        label: 'whatstoken',
        model: 'MiniMax-H3-free',
        isActive: true,
        availableModels: ['MiniMax-H3-free', 'kling-v1'],
      },
      {
        id: 'vid-2',
        kind: 'video',
        label: '备用',
        model: 'wanx-v1',
        isActive: false,
      },
      {
        id: 'llm-1',
        kind: 'llm',
        label: 'ignore',
        model: 'gpt-4o',
        isActive: true,
      },
    ]);

    expect(out.map((m) => m.id)).toEqual(['MiniMax-H3-free', 'kling-v1', 'wanx-v1']);
    expect(out[0]?.label).toContain('whatstoken');
    expect(out[0]?.connectionModel).toBe('MiniMax-H3-free');
  });

  it('保留与旧内置同名的连接模型（不再过滤）', () => {
    const out = listConnectedVideoModels([
      {
        id: 'vid-1',
        kind: 'video',
        label: 'proxy',
        model: 'veo',
        isActive: true,
        availableModels: ['veo', 'custom-model'],
      },
    ]);
    expect(out.map((m) => m.id)).toEqual(['veo', 'custom-model']);
  });
});

describe('listVideoGenModelOptions', () => {
  it('仅返回连接模型，不含内置 CLIP_GEN_MODELS', () => {
    const out = listVideoGenModelOptions([
      {
        id: 'vid-1',
        kind: 'video',
        label: 'whatstoken',
        model: 'MiniMax-H3-free',
        isActive: true,
      },
    ]);
    expect(out.map((m) => m.id)).toEqual(['MiniMax-H3-free']);
    expect(out.some((m) => m.id === 'magic-hour')).toBe(false);
  });
});

describe('resolveActiveVideoConnectionModel', () => {
  it('返回当前激活视频连接的 model', () => {
    expect(
      resolveActiveVideoConnectionModel([
        { id: 'v1', kind: 'video', model: 'kling-v1', isActive: true },
        { id: 'v2', kind: 'video', model: 'other', isActive: false },
      ]),
    ).toBe('kling-v1');
  });
});

describe('lookupVideoGenModelHint', () => {
  const conns = [
    {
      id: 'vid-1',
      kind: 'video',
      label: 'whatstoken',
      model: 'MiniMax-H3-free',
      isActive: true,
    },
  ];

  it('连接模型返回连接标签与通道说明', () => {
    expect(lookupVideoGenModelHint('MiniMax-H3-free', conns)).toContain('whatstoken');
    expect(lookupVideoGenModelHint('MiniMax-H3-free', conns)).toContain('/v1/video/generations');
  });

  it('未知模型提示去设置连接', () => {
    expect(lookupVideoGenModelHint('veo', conns)).toContain('设置');
  });
});

describe('normalizeVideoBaseUrl', () => {
  it('将错误的 api.whatstoken.ai 改回可解析的 www', () => {
    expect(normalizeVideoBaseUrl('https://api.whatstoken.ai/v1')).toBe('https://www.whatstoken.ai/v1');
  });

  it('保留正确的 www.whatstoken.ai 并补全 /v1', () => {
    expect(normalizeVideoBaseUrl('https://www.whatstoken.ai')).toBe('https://www.whatstoken.ai/v1');
  });
});

describe('resolveActiveVideoConnection', () => {
  it('返回规范化后的 baseUrl', () => {
    const conn = resolveActiveVideoConnection([
      {
        id: 'vid-1',
        kind: 'video',
        label: 'whatstoken',
        apiKey: 'sk-test',
        baseUrl: 'https://api.whatstoken.ai/v1',
        isActive: true,
      },
    ]);
    expect(conn?.baseUrl).toBe('https://www.whatstoken.ai/v1');
  });
});
