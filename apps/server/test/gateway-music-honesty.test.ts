import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BGM_NOT_IMPLEMENTED,
  GatewayMusicService,
} from '../src/modules/gateway/gateway-music.service';

/** 测试用 fetch 桩：按需返回 JSON */
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SRV-01 BGM 网关禁止占位成功', () => {
  afterEach(() => {
    GatewayMusicService.fetcher = (...args) => fetch(...(args as Parameters<typeof fetch>));
  });

  it('源码不再 sleep 后返回不存在的 mp3', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/gateway/gateway-music.service.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/setTimeout/);
    expect(src).not.toMatch(/\/media\/bgm\//);
    expect(src).toContain('BGM_NOT_IMPLEMENTED');
  });

  it('未配置 key 时明确 error', async () => {
    const svc = new GatewayMusicService();
    await expect(svc.submit('epic orchestra', 30, 'none', '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('已配置但 provider 未知时仍拒绝，不创建假任务', async () => {
    const svc = new GatewayMusicService();
    await expect(
      svc.submit('epic orchestra', 30, 'elevenlabs', 'sk-test', 'https://bgm.example'),
    ).rejects.toThrow(BGM_NOT_IMPLEMENTED('elevenlabs'));
    await expect(svc.getStatus('bgm-never-created')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('已配置 Suno 兼容通道时走真实提交：两段式返回本地 taskId', async () => {
    const fetcher = vi.fn(async (input: string) => {
      if (input.endsWith('/generate')) {
        return jsonResponse({ code: 200, data: { taskId: 'upstream-1' } });
      }
      throw new Error(`unexpected url ${input}`);
    });
    const svc = new GatewayMusicService();
    const prevFetcher = GatewayMusicService.fetcher;
    GatewayMusicService.fetcher = fetcher;
    const { taskId } = await svc.submit('epic orchestra', 30, 'suno', 'sk-test', 'https://bgm.example/api/v1');
    expect(taskId).toMatch(/^bgm-/);
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(svc.getStatusCache().get(taskId)?.upstreamTaskId).toBe('upstream-1');
    });
  });

  it('轮询映射上游状态：SUCCESS + audio_url → done 带可播放 URL', async () => {
    const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse({ taskId: 'upstream-2' });
      }
      return jsonResponse({
        data: { status: 'SUCCESS', data: [{ audio_url: 'https://cdn.example/bgm-1.mp3' }] },
      });
    });
    const svc = new GatewayMusicService();
    const prevFetcher = GatewayMusicService.fetcher;
    GatewayMusicService.fetcher = fetcher;
    const { taskId } = await svc.submit('night city synth', 30, 'suno', 'sk-test', 'https://bgm.example');
    await vi.waitFor(() => {
      expect(svc.getStatusCache().get(taskId)?.upstreamTaskId).toBe('upstream-2');
    });
    const task = await svc.getStatus(taskId);
    expect(task.status).toBe('done');
    expect(task.url).toBe('https://cdn.example/bgm-1.mp3');
    // 通道快照不得泄露给调用方
    expect((task as unknown as Record<string, unknown>).channel).toBeUndefined();
  });

  it('上游失败状态映射为 error，不假成功', async () => {
    const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ taskId: 'upstream-3' });
      return jsonResponse({ data: { status: 'GENERATE_FAILURE', message: 'quota exceeded' } });
    });
    const svc = new GatewayMusicService();
    const prevFetcher = GatewayMusicService.fetcher;
    GatewayMusicService.fetcher = fetcher;
    const { taskId } = await svc.submit('calm piano', 30, 'suno', 'sk-test', 'https://bgm.example');
    await vi.waitFor(() => {
      expect(svc.getStatusCache().get(taskId)?.upstreamTaskId).toBe('upstream-3');
    });
    const task = await svc.getStatus(taskId);
    expect(task.status).toBe('error');
    expect(task.error).toContain('quota exceeded');
  });

  it('上游 done 无音频 URL 映射为 error，禁止空成功', async () => {
    const fetcher = vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ taskId: 'upstream-empty' });
      return jsonResponse({ data: { status: 'SUCCESS' } });
    });
    const svc = new GatewayMusicService();
    GatewayMusicService.fetcher = fetcher;
    const { taskId } = await svc.submit('empty audio', 30, 'suno', 'sk-test', 'https://bgm.example');
    await vi.waitFor(() => {
      expect(svc.getStatusCache().get(taskId)?.upstreamTaskId).toBe('upstream-empty');
    });
    const task = await svc.getStatus(taskId);
    expect(task.status).toBe('error');
    expect(task.error).toMatch(/未找到音频 URL.*禁止空成功/);
  });

  it('上游提交失败时任务标 error 且带明确原因', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ message: 'unauthorized' }, 401));
    const svc = new GatewayMusicService();
    const prevFetcher = GatewayMusicService.fetcher;
    GatewayMusicService.fetcher = fetcher;
    const { taskId } = await svc.submit('epic', 30, 'suno', 'sk-bad', 'https://bgm.example');
    await vi.waitFor(() => {
      expect(svc.getStatusCache().get(taskId)?.status).toBe('error');
    });
    const task = await svc.getStatus(taskId);
    expect(task.status).toBe('error');
    expect(task.error).toContain('unauthorized');
  });

  it('上游响应无 taskId 时标 error，禁止空成功', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ code: 200, data: {} }));
    const svc = new GatewayMusicService();
    GatewayMusicService.fetcher = fetcher;
    const { taskId } = await svc.submit('no-id', 30, 'suno', 'sk-test', 'https://bgm.example');
    await vi.waitFor(() => {
      expect(svc.getStatusCache().get(taskId)?.status).toBe('error');
    });
    const task = await svc.getStatus(taskId);
    expect(task.status).toBe('error');
    expect(task.error).toMatch(/未找到 taskId.*禁止空成功/);
  });

  it('BGM 未配置 Provider / Key / Base URL 禁止空成功', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/gateway/gateway-music.service.ts'),
      'utf8',
    );
    expect(src).toContain('请在设置中配置 BGM Provider 和 API Key，禁止空成功');
    expect(src).toContain('请在设置中配置 BGM API Key，禁止空成功');
    expect(src).toContain('请在设置中配置 BGM Base URL（Suno 兼容聚合端点），禁止空成功');
    expect(BGM_NOT_IMPLEMENTED('foo')).toContain('禁止空成功');
    expect(src).toContain('Task ${taskId} not found，禁止空成功');
    expect(src).toMatch(/BGM 轮询失败 HTTP[\s\S]*禁止空成功/);
    expect(src).toContain('BGM 轮询响应不是有效 JSON，禁止空成功');
  });
});
