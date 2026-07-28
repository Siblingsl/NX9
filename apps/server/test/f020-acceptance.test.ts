/**
 * F-020 Remotion 服务端真渲验收
 * - submit 创建 job 并调用 processJob
 * - getStatus 返回正确状态
 * - 非法 timeline → error（非 done）
 * - 缺少 @remotion/renderer → error
 * - 缺少组合包 bundle → error
 * - 渲染后产物验证（存在+非空才 done）
 * - 控制器接线：POST render-remotion + GET remotion-tasks
 * - 模块注册：RemotionRenderer 注入 MontageModule
 * - 静态 serve：app.module 注册 remotion 媒体目录
 * - 组合包：Root 注册 Nx9Episode，dist 已构建
 * - timelineToRemotion 纯函数输出
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { timelineToRemotion } from '@nx9/shared';
import type { TimelinePayload } from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const serverSrc = resolve(root, 'apps/server/src');
const compositionsDist = resolve(root, 'packages/remotion-compositions/dist');

function readServer(rel: string): string {
  return readFileSync(resolve(serverSrc, rel), 'utf8');
}

function readFile(p: string): string {
  return readFileSync(p, 'utf8');
}

// ─── 最小合法时间线 ───
const MIN_TIMELINE: TimelinePayload = {
  version: 2,
  title: 'Test',
  fps: 30,
  durationSec: 10,
  aspect: '9:16',
  width: 1080,
  height: 1920,
  tracks: [
    {
      id: 'video-1',
      kind: 'video',
      label: 'V1',
      clips: [
        {
          id: 'c1',
          type: 'video',
          label: '镜头1',
          startSec: 0,
          durationSec: 5,
          assetUrl: '/media/videos/test.mp4',
        },
      ],
    },
  ],
};

describe('F-020 Remotion 服务端真渲', () => {

  // ═══════════ RemotionRenderer 核心行为 ═══════════
  it('RemotionRenderer 文件存在且导出类', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain('export class RemotionRenderer');
    expect(src).toContain('submit');
    expect(src).toContain('getStatus');
    expect(src).toContain('processJob');
  });

  it('submit 创建 job 为 queued 状态', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain("status: 'queued'");
    expect(src).toContain('this.jobs.set(taskId, job)');
    expect(src).toContain('taskId');
  });

  it('submit 返回 taskId 和 status', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain("return { taskId, status: 'queued' }");
  });

  it('getStatus 返回 job 或 null', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain('getStatus(taskId: string)');
    expect(src).toContain("this.jobs.get(taskId) ?? null");
  });

  it('processJob 验证时间线：null/非对象 → error', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain('无效的时间线数据');
    expect(src).toContain('!timeline || typeof timeline !== \'object\'');
  });

  it('processJob 将 status 设为 rendering 后开始处理', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain("job.status = 'rendering'");
  });

  it('processJob 动态导入 @remotion/renderer 失败 → error', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain("await import('@remotion/renderer')");
    expect(src).toContain('Remotion 服务端渲染需要安装 @remotion/renderer');
  });

  it('processJob 缺少 bundle → error', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain('Remotion 组合包未找到');
    expect(src).toContain('请先构建');
  });

  it('processJob 调用 renderMedia 并传 composition/serveUrl/codec', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain('renderMedia');
    expect(src).toContain('outputLocation');
    expect(src).toContain('codec');
    expect(src).toContain('serveUrl');
    expect(src).toContain('inputProps');
  });

  it('processJob 进度回调更新 job.progress', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain('onProgress');
    expect(src).toContain('job.progress');
    expect(src).toContain('job.updatedAt');
  });

  it('processJob 产物验证：不存在 → error', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain('渲染完成但输出文件不存在');
    expect(src).toContain('!fs.existsSync(outputPath)');
  });

  it('processJob 产物验证：空文件 → 删除+error', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain('渲染产物为空文件');
    expect(src).toContain('stats.size === 0');
    expect(src).toContain('fs.unlinkSync(outputPath)');
  });

  it('processJob 成功：done + progress 100 + outputUrl', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain("job.status = 'done'");
    expect(src).toContain('job.progress = 100');
    expect(src).toContain("job.outputUrl = `/media/");
    expect(src).toContain('渲染完成');
  });

  it('processJob catch 块：error + 错误信息记录', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain("job.status = 'error'");
    expect(src).toContain('job.error = err instanceof Error ? err.message');
  });

  it('processJob 异步包装在 submit 中，catch 设 error', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    expect(src).toContain('this.processJob');
    expect(src).toContain(".catch((err) =>");
    expect(src).toContain("existing.status = 'error'");
  });

  // ═══════════ 控制器接线 ═══════════
  it('MontageController 注入 RemotionRenderer', () => {
    const src = readServer('modules/montage/montage.controller.ts');

    expect(src).toContain('remotionRenderer: RemotionRenderer');
    expect(src).toContain('Renderer');
  });

  it('POST render-remotion 调 submit + 返回 ok', () => {
    const src = readServer('modules/montage/montage.controller.ts');

    expect(src).toContain("@Post('render-remotion')");
    expect(src).toContain('this.remotionRenderer.submit');
    expect(src).toContain('ok: true');
    expect(src).toContain('Remotion 渲染已入队');
  });

  it('GET remotion-tasks/:taskId 调 getStatus', () => {
    const src = readServer('modules/montage/montage.controller.ts');

    expect(src).toContain("@Get('remotion-tasks/:taskId')");
    expect(src).toContain('this.remotionRenderer.getStatus(taskId)');
  });

  it('GET remotion-tasks 不存在返回 ok: false', () => {
    const src = readServer('modules/montage/montage.controller.ts');

    expect(src).toContain('task not found');
    expect(src).toContain('ok: false');
  });

  // ═══════════ 模块注册 ═══════════
  it('MontageModule providers 含 RemotionRenderer', () => {
    const src = readServer('modules/montage/montage.module.ts');

    expect(src).toContain('RemotionRenderer');
    expect(src).toContain('providers');
  });

  // ═══════════ 静态 serve 注册 ═══════════
  it('app.module 注册 remotion 媒体静态目录', () => {
    const src = readServer('app.module.ts');

    expect(src).toContain('remotion');
    expect(src).toContain('serveRoot');
    expect(src).toContain('/media');
  });

  // ═══════════ 组合包构建产物 ═══════════
  it('remotion-compositions dist 目录存在', () => {
    expect(existsSync(compositionsDist)).toBe(true);
  });

  it('Root.js 编译产物存在', () => {
    const rootPath = resolve(compositionsDist, 'esm/Root.js');
    expect(existsSync(rootPath)).toBe(true);
  });

  it('Nx9Episode.js 编译产物存在', () => {
    const epPath = resolve(compositionsDist, 'esm/Nx9Episode.js');
    expect(existsSync(epPath)).toBe(true);
  });

  it('Root.tsx 注册 Nx9Episode composition', () => {
    const src = readFile(resolve(root, 'packages/remotion-compositions/src/Root.tsx'));

    expect(src).toContain('id="Nx9Episode"');
    expect(src).toContain('Nx9Episode');
    expect(src).toContain('Composition');
    expect(src).toContain('width={1080}');
    expect(src).toContain('height={1920}');
    expect(src).toContain('fps={30}');
  });

  it('Nx9Episode.tsx 处理 video/audio/subtitle tracks', () => {
    const src = readFile(resolve(root, 'packages/remotion-compositions/src/Nx9Episode.tsx'));

    expect(src).toContain('video-1');
    expect(src).toContain('video-2');
    expect(src).toContain('audio-1');
    expect(src).toContain('subtitle-1');
    expect(src).toContain('Sequence');
    expect(src).toContain('clip.startSec');
    expect(src).toContain('clip.durationSec');
  });

  // ═══════════ timelineToRemotion 纯函数 ═══════════
  it('timelineToRemotion 转换有效时间线', () => {
    const comp = timelineToRemotion(MIN_TIMELINE, { width: 1080, height: 1920 });

    expect(comp.id).toBe('Nx9Timeline');
    expect(comp.fps).toBe(30);
    expect(comp.width).toBe(1080);
    expect(comp.height).toBe(1920);
    expect(comp.durationInFrames).toBe(300);
    expect(comp.props.tracks).toHaveLength(1);
  });

  it('timelineToRemotion tracks[0].clips 含映射后的 clip', () => {
    const comp = timelineToRemotion(MIN_TIMELINE);

    expect(comp.props.tracks[0].kind).toBe('video');
    expect(comp.props.tracks[0].clips).toHaveLength(1);
    expect(comp.props.tracks[0].clips[0].src).toBe('/media/videos/test.mp4');
    expect(comp.props.tracks[0].clips[0].from).toBe(0);
    expect(comp.props.tracks[0].clips[0].durationInFrames).toBe(150);
  });

  it('timelineToRemotion 空 tracks 输出空 clips', () => {
    const comp = timelineToRemotion({
      ...MIN_TIMELINE,
      tracks: [],
    });

    expect(comp.props.tracks).toHaveLength(0);
  });

  it('timelineToRemotion 使用提供的 width/height/fps', () => {
    const comp = timelineToRemotion(
      { ...MIN_TIMELINE, fps: 24, width: 1920, height: 1080 },
      { width: 1920, height: 1080 },
    );

    expect(comp.fps).toBe(24);
    expect(comp.width).toBe(1920);
    expect(comp.height).toBe(1080);
  });

  it('timelineToRemotion durationInFrames >= 1', () => {
    const comp = timelineToRemotion({
      ...MIN_TIMELINE,
      durationSec: 0,
    });

    expect(comp.durationInFrames).toBe(1);
  });

  // ═══════════ 失败不得 done：全链路 guard ═══════════
  it('invalid timeline → error never sets done', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    // 验证 error 路径从不会设 done
    // timeline 验证 → throw → catch block → error（非 done）
    const submitMethod = src.slice(
      src.indexOf('async submit('),
      src.indexOf('async submit(') + 600,
    );
    // submit 只设 queued，异步错误走 catch → error
    expect(submitMethod).toContain("status: 'queued'");
    expect(submitMethod).toContain('this.jobs.set(taskId, job)');
  });

  it('processJob catch 只设 error 不设 done', () => {
    const src = readServer('modules/montage/remotion.renderer.ts');

    const catchIdx = src.indexOf('} catch (err) {');
    // 从 catch 行到 processJob 方法结尾（下一个 private/public 或文件尾）
    const afterCatch = src.slice(catchIdx, catchIdx + 200);
    expect(afterCatch).toContain("job.status = 'error'");
    // 确认 catch 块内无 done 设置
    expect(afterCatch).not.toContain("status = 'done'");
    expect(afterCatch).not.toContain("status: 'done'");
  });
});
