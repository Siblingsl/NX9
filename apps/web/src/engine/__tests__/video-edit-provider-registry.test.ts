/**
 * SE-SPEC-02/05：video-edit 供应商注册表与跨帧追踪能力位。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_EDIT_PROVIDER,
  VIDEO_EDIT_PROVIDERS,
  resolveVideoEditProvider,
} from '@nx9/shared';

describe('video-edit provider registry', () => {
  it('默认供应商已注册，且每个供应商都带追踪能力位', () => {
    expect(VIDEO_EDIT_PROVIDERS.length).toBeGreaterThanOrEqual(1);
    expect(
      VIDEO_EDIT_PROVIDERS.some((p) => p.id === DEFAULT_VIDEO_EDIT_PROVIDER),
    ).toBe(true);
    for (const provider of VIDEO_EDIT_PROVIDERS) {
      expect(typeof provider.supportsFrameTracking).toBe('boolean');
      expect(provider.inputKeys.video.length).toBeGreaterThan(0);
      expect(provider.inputKeys.prompt.length).toBeGreaterThan(0);
    }
  });

  it('resolveVideoEditProvider 始终回落到已注册供应商，绝不静默返回未注册 id', () => {
    const resolved = resolveVideoEditProvider();
    expect(VIDEO_EDIT_PROVIDERS.some((p) => p.id === resolved.id)).toBe(true);
    const arbitrary = resolveVideoEditProvider('not-registered');
    expect(VIDEO_EDIT_PROVIDERS.some((p) => p.id === arbitrary.id)).toBe(true);
  });
});
