import {
  CHARACTER_SHEET_PANEL_LAYOUT,
  panelRectToPixels,
} from '@nx9/shared';

export async function cropCharacterSheetPanels(
  sheetImageUrl: string,
): Promise<Record<string, Blob>> {
  const img = await loadImage(sheetImageUrl);
  const out: Record<string, Blob> = {};
  for (const panel of CHARACTER_SHEET_PANEL_LAYOUT) {
    const px = panelRectToPixels(panel.rect, img.naturalWidth, img.naturalHeight);
    out[panel.id] = await cropToBlob(img, px.x, px.y, px.w, px.h);
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`无法加载设定板图片: ${src}`));
    img.src = src;
  });
}

function cropToBlob(
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 不可用'));
  ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('裁切失败'))), 'image/jpeg', 0.92);
  });
}
