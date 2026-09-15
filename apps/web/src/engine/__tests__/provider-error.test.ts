import { describe, expect, it } from 'vitest';
import { isProviderConnectionError } from '../provider-error';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('provider-error deep link', () => {
  it('识别鉴权/额度类错误', () => {
    expect(isProviderConnectionError('401 Insufficient balance')).toBe(true);
    expect(isProviderConnectionError('API key missing')).toBe(true);
    expect(isProviderConnectionError('未配置 LLM')).toBe(true);
    expect(isProviderConnectionError('普通业务校验失败')).toBe(false);
  });

  it('拆镜失败接线：toast + 拆镜页/空镜表深链', () => {
    const root = resolve(__dirname, '../..');
    const desk = readFileSync(
      resolve(root, 'blocks/craft/storyboard-desk/use-storyboard-desk.tsx'),
      'utf8',
    );
    expect(desk).toContain('isProviderConnectionError');
    expect(desk).toContain('去设置修复连接');
    expect(desk).toContain("openSettingsTo('connection')");

    const grid = readFileSync(
      resolve(root, 'blocks/craft/storyboard-desk/grid-panel.tsx'),
      'utf8',
    );
    expect(grid).toContain('grid-open-settings-connection');

    const panel = readFileSync(
      resolve(root, 'blocks/craft/storyboard-desk/breakdown-panel.tsx'),
      'utf8',
    );
    expect(panel).toContain('breakdown-open-settings-connection');
    expect(panel).toContain('breakdown-last-error');
  });
});
