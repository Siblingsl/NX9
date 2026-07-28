/**
 * F-045 acceptance test — 导演台 WebGL 生命周期
 *
 * G1 验收清单:
 * - [x] 关闭 DirectorDesk 时 3D shell dispose 被调用
 *
 * G2: ref 替代 DOM querySelector；visibilitychange 暂停/恢复渲染；
 *     GPU 争用信号；Path A + Path B 均有 dispose 回调
 * G3: 本文件 + 缺陷分析同步
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WEB_SRC = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');
const DIRECTOR3D_SRC = resolve(__dirname, '..', '..', '..', 'packages', 'director3d', 'src');

function readWeb(relPath: string): string {
  return readFileSync(resolve(WEB_SRC, relPath), 'utf-8');
}

function readD3d(relPath: string): string {
  return readFileSync(resolve(DIRECTOR3D_SRC, relPath), 'utf-8');
}

describe('F-045 acceptance — 导演台 WebGL 生命周期', () => {
  // ═══════════ G1: StageDeckShell 用 gl ref 替代 DOM querySelector ═══════════
  describe('G1: StageDeckShell — ref 替代 querySelector', () => {
    const src = readD3d('ui/StageDeckShell.tsx');

    it('有 glRef 用于存储 WebGLRenderer', () => {
      expect(src).toContain('glRef');
      expect(src).toContain('WebGLRenderer');
    });

    it('visibility handler 使用 gl.domElement 替代 document.querySelector', () => {
      expect(src).toContain('gl.domElement');
      expect(src).not.toMatch(/document\.querySelector\(.*canvas/);
    });

    it('visibility handler 有 setPixelRatio 降分辨率（隐藏时 0.1）', () => {
      expect(src).toContain('setPixelRatio');
      expect(src).toContain('0.1');
    });
  });

  // ═══════════ G2: DirectorCanvas 暴露 onGLCreated ═══════════
  describe('G2: DirectorCanvas — onGLCreated 回调', () => {
    const src = readD3d('canvas/DirectorCanvas.tsx');

    it('接口包含 onGLCreated', () => {
      expect(src).toContain('onGLCreated');
      expect(src).toContain('WebGLRenderer');
    });

    it('onCreated 中调用 onGLCreated', () => {
      expect(src).toContain('onGLCreated?.(gl)');
    });
  });

  // ═══════════ G3: Director3dStageEmbed — Path A dispose ═══════════
  describe('G3: Director3dStageEmbed — Path A dispose + 生命周期', () => {
    const src = readWeb('blocks/core/director-desk/director-3d-stage-embed.tsx');

    it('有 disposeRef 存储 renderer.dispose', () => {
      expect(src).toContain('disposeRef');
    });

    it('cleanup effect 调用 disposeRef + disposeDirectorWebGLLifecycle', () => {
      expect(src).toContain('disposeRef.current?.()');
      expect(src).toContain('disposeDirectorWebGLLifecycle');
    });

    it('handleRendererReady 存储 renderer.dispose', () => {
      expect(src).toContain('handleRendererReady');
      expect(src).toContain('renderer.dispose');
    });
  });

  // ═══════════ G4: Director3dPanel — Path B dispose ═══════════
  describe('G4: Director3dPanel — Path B dispose + onRendererReady', () => {
    const src = readWeb('panels/Director3dPanel.tsx');

    it('有 disposeRef 存储 renderer.dispose', () => {
      expect(src).toContain('disposeRef');
    });

    it('cleanup 调用 dispose + disposeDirectorWebGLLifecycle', () => {
      expect(src).toContain('disposeRef.current?.()');
      expect(src).toContain('disposeDirectorWebGLLifecycle');
    });

    it('Director3dShell 传入 onRendererReady', () => {
      expect(src).toContain('onRendererReady');
    });
  });

  // ═══════════ G5: GPU 争用信号模块 ═══════════
  describe('G5: director-webgl-lifecycle — GPU 争用信号', () => {
    const src = readWeb('engine/director-webgl-lifecycle.ts');

    it('isDirector3dGPUContention 导出', () => {
      expect(src).toContain('isDirector3dGPUContention');
    });

    it('disposeDirectorWebGLLifecycle 导出', () => {
      expect(src).toContain('disposeDirectorWebGLLifecycle');
    });

    it('attachDirectorWebGLLifecycle 使用 WebGLRenderer（不创建独立上下文）', () => {
      expect(src).toContain('WebGLRenderer');
      expect(src).toContain('attachDirectorWebGLLifecycle');
    });

    it('notifyContention 通知 GPU 争用状态变更', () => {
      expect(src).toContain('notifyContention');
      expect(src).toContain('contentionActive');
    });
  });

  // ═══════════ G6: 不创建独立 WebGL 上下文 ═══════════
  describe('G6: 无独立 WebGL 上下文创建（防双重上下文争用）', () => {
    const src = readWeb('engine/director-webgl-lifecycle.ts');

    it('不包含 canvas.getContext 调用（旧 createWebGLLifecycle 模式）', () => {
      expect(src).not.toMatch(/canvas\.getContext/);
    });

    it('不包含旧 createWebGLLifecycle 函数名', () => {
      expect(src).not.toContain('createWebGLLifecycle');
    });
  });
});
