/**
 * F-018 导演台多机位预设验收
 * - CAMERA_PRESETS 至少 6 个预设
 * - lookupCameraPreset 按 id 查找
 * - 内置预设应用时写入 cameraPrompt
 * - buildShotPrompt 注入 cameraPrompt 到 prompt
 * - user preset 保存/恢复含 cameraPrompt
 * - 预设 UI 源码守卫
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CAMERA_PRESETS,
  lookupCameraPreset,
} from '@nx9/shared';
import type { StoryboardShot } from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(root, 'apps/web/src');

function readWeb(rel: string): string {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

function makeShot(overrides: Partial<StoryboardShot> = {}): StoryboardShot {
  return {
    id: 'shot-1',
    index: 1,
    descriptionZh: '特写男人拔刀',
    durationSec: 8,
    status: 'approved',
    director3dGuide: undefined as any,
    ...overrides,
  } as StoryboardShot;
}

describe('F-018 导演台多机位预设', () => {

  // ─── CAMERA_PRESETS ───
  it('CAMERA_PRESETS 至少包含 6 个预设', () => {
    expect(CAMERA_PRESETS.length).toBeGreaterThanOrEqual(6);
  });

  it('CAMERA_PRESETS 每个预设包含必要字段', () => {
    for (const p of CAMERA_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.position).toHaveLength(3);
      expect(p.target).toHaveLength(3);
      expect(typeof p.fov).toBe('number');
    }
  });

  it('CAMERA_PRESETS 包含常见机位', () => {
    const labels = CAMERA_PRESETS.map((p) => p.label);
    expect(labels).toContain('过肩');
    expect(labels).toContain('低机位');
    expect(labels).toContain('特写');
    expect(labels).toContain('全景');
    expect(labels).toContain('荷兰角');
  });

  it('lookupCameraPreset 按 id 查找', () => {
    const p = lookupCameraPreset('dutch');
    expect(p).toBeDefined();
    expect(p!.label).toBe('荷兰角');
  });

  it('lookupCameraPreset 未知 id 返回 undefined', () => {
    expect(lookupCameraPreset('nonexistent')).toBeUndefined();
  });

  // ─── director3dGuide.cameraPrompt 写入 shot ───
  it('director3dGuide.cameraPrompt 存在时可读', () => {
    const shot = makeShot({
      director3dGuide: {
        sourceBlockId: 'dd-1',
        captureId: 'cap-1',
        captureUrl: '/media/cap.png',
        cameraPrompt: 'Camera at pos (0,1.6,5) looking at (0,1.6,0) fov 50',
        cameraPosition: [0, 1.6, 5],
        cameraFov: 50,
      } as any,
    });

    expect(shot.director3dGuide?.cameraPrompt).toBeDefined();
    expect(shot.director3dGuide!.cameraPrompt).toContain('Camera at');
  });

  // ─── director-desk-runner buildShotPrompt 注入了 cameraPrompt ───
  it('buildShotPrompt 含 3D camera direction 注入逻辑', () => {
    const src = readWeb('engine/director-desk-runner.ts');

    expect(src).toContain('director3dGuide?.cameraPrompt');
    expect(src).toContain('3D camera direction');
    expect(src).toContain('cameraPromptText');
  });

  // ─── 内置预设应用时生成 cameraPrompt ───
  it('内置预设应用时写入 cameraPrompt', () => {
    const bar = readFileSync(resolve(root, 'packages/director3d/src/ui/CameraPresetBar.tsx'), 'utf8');
    const store = readFileSync(resolve(root, 'packages/director3d/src/store/directorStore.ts'), 'utf8');
    expect(bar).toContain('p.name');
    expect(bar).toContain('p.position');
    expect(bar).toContain('applyCamera');
    expect(store).toContain('cameraPrompt: buildCameraPrompt(camera)');
  });

  it('用户预设保存时含 captureUrl', () => {
    const bar = readFileSync(resolve(root, 'packages/director3d/src/ui/CameraPresetBar.tsx'), 'utf8');
    const start = bar.indexOf('const savePreset');
    const saveSection = bar.slice(start, bar.indexOf('return (', start));
    expect(saveSection).toContain('captureUrl');
    expect(saveSection).toContain('cameraPrompt');
  });

  it('用户预设恢复时写回 cameraPrompt', () => {
    const bar = readFileSync(resolve(root, 'packages/director3d/src/ui/CameraPresetBar.tsx'), 'utf8');
    expect(bar).toContain('cameraPrompt');
    expect(bar).toContain('shotPresets');
  });

  // ─── 导演台 3D 预设条 UI 守卫 ───
  it('导演台含预设横滑条 UI', () => {
    const shell = readFileSync(resolve(root, 'packages/director3d/src/ui/StageDeckShell.tsx'), 'utf8');
    const bar = readFileSync(resolve(root, 'packages/director3d/src/ui/CameraPresetBar.tsx'), 'utf8');
    expect(shell).toContain('CameraPresetBar');
    expect(bar).toContain('shotPresets');
    expect(bar).toContain('机位预设');
    expect(bar).toContain('p.name');
  });

  // ─── 批出请求体含 cameraPrompt ───
  it('core-pipeline-runner 将 cameraPrompt 注入生成 prompt', () => {
    const src = readWeb('engine/core-pipeline-runner.ts');

    expect(src).toContain('director3dGuide?.cameraPrompt');
    expect(src).toContain('3D camera direction');
  });

  // ─── DirectorDeskBlock 用户预设含 cameraPrompt ───
  it('director-3d-stage-embed 恢复用户预设含 cameraPrompt', () => {
    const bar = readFileSync(resolve(root, 'packages/director3d/src/ui/CameraPresetBar.tsx'), 'utf8');
    expect(bar).toContain('shotPresets.map');
    expect(bar).toContain('preset.cameraPrompt');
    expect(bar).toContain('applyCamera(preset.name');
  });

  // ─── 批出路径：director3dGuide 数据完整 ───
  it('buildShotPrompt 在批出中使用 director3dGuide.captureUrl 和 cameraPrompt', () => {
    const src = readWeb('engine/director-desk-runner.ts');

    expect(src).toContain('director3dGuide?.captureUrl');
    expect(src).toContain('director3dGuide?.cameraPrompt');
  });
});
