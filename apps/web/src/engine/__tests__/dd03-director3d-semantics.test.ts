/**
 * DD-D-03/04/05/08 回归守卫（2026-08-12）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasDirector3dGuide } from '@nx9/shared';
import {
  resolveDirectorQueueShots,
  summarizeDirectorQueue,
} from '../director-desk-runner';
import type { StoryboardShot } from '@nx9/shared';

const webSrc = resolve(__dirname, '..');

function shotWithPendingRepair(id: string): StoryboardShot {
  return {
    id,
    episodeId: 'ep-1',
    index: 1,
    durationSec: 4,
    shotType: 'medium',
    descriptionZh: 'x',
    status: 'draft',
    director3dGuide: {
      captureUrl: '',
      captureUrlPendingRepair: true,
      cameraPrompt: 'low angle',
    },
  } as StoryboardShot;
}

describe('DD-D-03/04 pendingRepair 语义', () => {
  it('hasDirector3dGuide 识别待修复镜头', () => {
    expect(hasDirector3dGuide(shotWithPendingRepair('s1'))).toBe(true);
  });

  it('统计与 3donly 队列包含待修复镜头，不当作“无 3D”', () => {
    const shot = shotWithPendingRepair('s1');
    expect(summarizeDirectorQueue([shot]).with3d).toBe(1);
    expect(resolveDirectorQueueShots([shot], { filter: '3donly' })).toHaveLength(1);
  });
});

describe('DD-D-05/08 文案与全局回退', () => {
  const flow = readFileSync(resolve(webSrc, 'FlowSurface.tsx'), 'utf8');
  const desk = readFileSync(resolve(webSrc, '../blocks/core/DirectorDeskBlock.tsx'), 'utf8');
  const panel = readFileSync(resolve(webSrc, '../blocks/core/director-desk/director-main-panel.tsx'), 'utf8');
  const flowRunner = readFileSync(resolve(webSrc, 'flow-runner-ops/story-ops.ts'), 'utf8');
  const preview = readFileSync(resolve(webSrc, 'stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace.tsx'), 'utf8');
  const payload = readFileSync(resolve(webSrc, 'flow-payload.ts'), 'utf8');
  const clip = readFileSync(resolve(webSrc, '../blocks/core/ClipGenBlock.tsx'), 'utf8');
  const stage = readFileSync(resolve(webSrc, '../../../../', 'packages/director3d/src/ui/StageDeckShell.tsx'), 'utf8');

  it('spawn 不再回退全局 storyboard.shots', () => {
    expect(flow).toContain('只从链镜表查找');
    expect(flow).not.toContain('?? useWorkspaceDocument.getState().storyboard.shots.find');
  });

  it('DIRECTOR_3D_ENABLED=true 时不再出现“暂未开放”主文案', () => {
    expect(desk).not.toContain('3D 构图（暂未开放）');
    expect(panel).toContain("director3dEnabled ? '打开 3D 舞台'");
    expect(panel).toContain("director3dEnabled ? '3D 机位'");
    expect(preview).toContain("{DIRECTOR_3D_ENABLED ? '3D 导演台' : '3D 暂未开放'}");
  });

  it('DD-D-03 待修复镜头有一等 UI 入口', () => {
    expect(desk).toContain('去 3D 重拍');
    expect(desk).toContain('3D 待修复');
    expect(panel).toContain('去 3D 重拍');
    expect(panel).toContain('3D 截图待修复');
  });

  it('DD-D-06 批出结束不再把 previewUrl 当交接代表帧', () => {
    expect(flowRunner).not.toContain('previewUrl: summary.lastUrl');
    expect(flowRunner).toContain('lastBatchPreviewUrl: summary.lastUrl');
  });

  it('DD-D-10 partial 批次有一等重试失败入口', () => {
    expect(clip).toContain('重试失败');
    expect(clip).toContain('receipt?.failed');
  });

  it('DD-D-11 hydrate 自动拆分已接入工作区加载', () => {
    expect(payload).toContain('autoSplitMixedDirector3dGraph');
  });

  it('DD-D-13 3D 切镜脏状态有显式确认', () => {
    expect(stage).toContain('requestShotChange');
    expect(stage).toContain('pendingShotId');
    expect(stage).toContain('保留草稿并切换');
    expect(stage).toContain('恢复已提交版本并切换');
  });
});
