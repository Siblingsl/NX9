import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BGM_NOT_IMPLEMENTED,
  GatewayMusicService,
} from '../src/modules/gateway/gateway-music.service';

describe('SRV-01 BGM 网关禁止占位成功', () => {
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

  it('已配置 key 但未接真实 API 时仍拒绝，不创建假任务', async () => {
    const svc = new GatewayMusicService();
    await expect(svc.submit('epic orchestra', 30, 'suno', 'sk-test')).rejects.toThrow(
      BGM_NOT_IMPLEMENTED('suno'),
    );
    await expect(svc.getStatus('bgm-never-created')).rejects.toBeInstanceOf(BadRequestException);
  });
});
