/**
 * 链接解析：空 prompt 禁止 ok:true。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../src/common/url-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/common/url-utils')>();
  return {
    ...actual,
    fetchRemote: vi.fn(async () => {
      throw new Error('network down');
    }),
  };
});

import { LinkParserService } from '../src/modules/tools/link-parser.service';

describe('link-parser 空成功门禁', () => {
  const proxyLlm = vi.fn();
  let service: LinkParserService;

  beforeEach(() => {
    proxyLlm.mockReset();
    service = new LinkParserService({ proxyLlm } as never);
  });

  it('源码含 PARSE_EMPTY 空 prompt 门禁', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/tools/link-parser.service.ts'),
      'utf8',
    );
    expect(src).toContain('PARSE_EMPTY');
    expect(src).toContain('禁止空成功');
  });

  it('LLM 与元信息均无可用 prompt 时抛 PARSE_EMPTY', async () => {
    proxyLlm.mockResolvedValue({
      choices: [{ message: { content: '{"title":"","summary":"","prompt":"","mediaKind":"none"}' } }],
    });
    await expect(service.parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).rejects.toSatisfy(
      (e: unknown) => e instanceof HttpException && String(e).includes('PARSE_EMPTY'),
    );
  });

  it('有实质 prompt 时 ok:true', async () => {
    proxyLlm.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'demo',
              summary: 's',
              prompt: 'cinematic wide shot of a city',
              mediaKind: 'clip',
            }),
          },
        },
      ],
    });
    const res = await service.parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.ok).toBe(true);
    expect(res.prompt).toMatch(/cinematic/);
  });
});
