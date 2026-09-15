import { describe, expect, it, vi } from 'vitest';
import { VisionToolsService } from './vision-tools.service';

describe('VisionToolsService analyzeFaces', () => {
  it('normalizes model output and never requests identity', async () => {
    const gateway = {
      proxyLlm: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              faces: [{
                box: { x: -0.2, y: 0.1, width: 2, height: 0.3 },
                expression: 'HAPPY',
                confidence: 1.4,
                description: 'raised cheeks',
              }],
              summary: 'one visible face',
            }),
          },
        }],
      }),
    };
    const service = new VisionToolsService(gateway as never);
    const result = await service.analyzeFaces('/media/images/a.png');

    expect(result.faces).toHaveLength(1);
    expect(result.faces[0]).toMatchObject({
      box: { x: 0, y: 0.1, width: 1, height: 0.3 },
      expression: 'HAPPY',
    });
    expect(result.faces[0].confidence).toBe(1);
    expect(gateway.proxyLlm).toHaveBeenCalledTimes(1);
    const instruction = gateway.proxyLlm.mock.calls[0]?.[0]?.messages?.[0]?.content;
    expect(String(instruction)).toContain('Do not identify real people');
  });

  it('returns an empty face list when the model omits faces', async () => {
    const gateway = {
      proxyLlm: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{}' } }],
      }),
    };
    const service = new VisionToolsService(gateway as never);
    const result = await service.analyzeFaces('/media/images/empty.png');

    expect(result.faces).toEqual([]);
    expect(result.summary).toContain('未检测到');
  });
});

describe('VisionToolsService replicateVideoPlan 诚实性', () => {
  it('解析失败时 ok:false，禁止空成功', async () => {
    const gateway = {
      proxyLlm: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '这不是 JSON' } }],
      }),
    };
    const service = new VisionToolsService(gateway as never);
    const result = await service.replicateVideoPlan('https://example.com/v');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('禁止空成功');
    expect(result.storyboardMarkdown).toBe('');
  });

  it('围栏 JSON 可解析且有实质内容时 ok:true', async () => {
    const gateway = {
      proxyLlm: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content:
              '```json\n{"title":"夜跑","rhythm":"快切","structure":["开场"],"storyboardMarkdown":"| 镜号 | 景别 |\\n| 1 | 特写 |","promptPack":"neon night"}\n```',
          },
        }],
      }),
    };
    const service = new VisionToolsService(gateway as never);
    const result = await service.replicateVideoPlan('https://example.com/v');
    expect(result.ok).toBe(true);
    expect(result.title).toBe('夜跑');
    expect(result.storyboardMarkdown).toContain('特写');
  });

  it('空链接诚实失败', async () => {
    const service = new VisionToolsService({ proxyLlm: vi.fn() } as never);
    const result = await service.replicateVideoPlan('  ');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/空/);
  });
});

describe('VisionToolsService reversePrompt / extractStyle 诚实性', () => {
  it('反推解析失败时 ok:false', async () => {
    const gateway = {
      proxyLlm: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'not-json' } }],
      }),
    };
    const service = new VisionToolsService(gateway as never);
    const result = await service.reversePrompt('/media/images/a.png');
    expect(result.ok).toBe(false);
    expect(result.prompt).toBe('');
    expect(result.message).toContain('禁止空成功');
  });

  it('风格提取有实质内容时 ok:true', async () => {
    const gateway = {
      proxyLlm: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              styleTokens: 'cinematic teal',
              sceneTokens: 'rainy street',
              negativePrompt: 'blur',
            }),
          },
        }],
      }),
    };
    const service = new VisionToolsService(gateway as never);
    const result = await service.extractStyle('/media/images/a.png');
    expect(result.ok).toBe(true);
    expect(result.combinedPrompt).toContain('cinematic');
  });
});
