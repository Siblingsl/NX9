/**
 * director-webgl-lifecycle.ts — 导演台 WebGL 生命周期 + GPU 争用信号（F-045）。
 *
 * 关导演台强制 dispose Three/WebGL；后台降帧/降分辨率；反复开关稳定。
 * GPU 争用信号：供 2D 画布等组件在导演台活跃时主动降质。
 */
import type { WebGLRenderer } from 'three';

export interface DirectorWebGLLifecycle {
  isActive(): boolean;
  dispose(): void;
}

let lifecycle: DirectorWebGLLifecycle | null = null;

/** GPU 争用状态：导演台 3D 是否正占用 GPU */
let contentionActive = false;
const contentionListeners = new Set<(active: boolean) => void>();

export function isDirector3dGPUContention(): boolean {
  return contentionActive;
}

export function onDirector3dGPUContentionChange(cb: (active: boolean) => void): () => void {
  contentionListeners.add(cb);
  return () => { contentionListeners.delete(cb); };
}

function notifyContention(active: boolean) {
  contentionActive = active;
  for (const cb of contentionListeners) cb(active);
}

/**
 * 使用 R3F WebGLRenderer 创建生命周期管理器。
 * 不创建独立 WebGL 上下文，只管理 R3F 已有的 renderer。
 */
export function attachDirectorWebGLLifecycle(renderer: WebGLRenderer): DirectorWebGLLifecycle {
  disposeDirectorWebGLLifecycle();

  let disposed = false;
  const canvas = renderer.domElement;

  notifyContention(true);

  const lc: DirectorWebGLLifecycle = {
    isActive: () => !disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        const ctx = renderer.getContext();
        const ext = ctx.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
        renderer.setAnimationLoop(null);
        renderer.dispose();
      } catch { /* swallow dispose errors */ }
      canvas.style.display = 'none';
      notifyContention(false);
      lifecycle = null;
    },
  };

  lifecycle = lc;
  return lc;
}

export function disposeDirectorWebGLLifecycle(): void {
  if (lifecycle) {
    lifecycle.dispose();
  }
}

export function getDirectorWebGLLifecycle(): DirectorWebGLLifecycle | null {
  return lifecycle;
}
