import type { WebGLRenderer } from 'three';

const MAX_EDGE = 1920;

export function captureViewport(gl: WebGLRenderer): string {
  const canvas = gl.domElement;
  const w = canvas.width;
  const h = canvas.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  if (scale >= 1) {
    return canvas.toDataURL('image/png');
  }
  const off = document.createElement('canvas');
  off.width = Math.round(w * scale);
  off.height = Math.round(h * scale);
  const ctx = off.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');
  ctx.drawImage(canvas, 0, 0, off.width, off.height);
  return off.toDataURL('image/png');
}
