import { describe, expect, it } from 'vitest';
import { listConnectedLlmModels } from '@nx9/shared';

describe('listConnectedLlmModels', () => {
  it('展开 active 连接的 availableModels，并保留默认 model', () => {
    const out = listConnectedLlmModels([
      {
        id: 'llm-1',
        kind: 'llm',
        label: 'OpenAI',
        model: 'gpt-4o-mini',
        isActive: true,
        availableModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
      },
      {
        id: 'llm-2',
        kind: 'llm',
        label: 'DeepSeek',
        model: 'deepseek-chat',
        isActive: false,
      },
      {
        id: 'img-1',
        kind: 'image',
        label: 'ignore',
        model: 'dall-e-3',
        isActive: true,
      },
    ]);

    expect(out.map((m) => m.id)).toEqual([
      'llm-1::gpt-4o',
      'llm-1::gpt-4o-mini',
      'llm-1::o3-mini',
      'llm-2::deepseek-chat',
    ]);
    expect(out[0]?.label).toContain('OpenAI');
    expect(out[0]?.connectionModel).toBe('gpt-4o');
  });

  it('无 availableModels 时回退到连接默认 model', () => {
    const out = listConnectedLlmModels([
      { id: 'a', kind: 'llm', label: 'Local', model: 'qwen2.5:7b', isActive: true },
    ]);
    expect(out).toEqual([
      {
        id: 'a::qwen2.5:7b',
        label: 'Local · qwen2.5:7b',
        connectionId: 'a',
        connectionModel: 'qwen2.5:7b',
        connectionLabel: 'Local',
      },
    ]);
  });
});
