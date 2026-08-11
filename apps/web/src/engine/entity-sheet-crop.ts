import { entitySheetCropRect, panelRectToPixels, type EntitySheetCropKind } from '@nx9/shared';

export async function cropEntitySheetPanel(
  sheetImageUrl: string,
  kind: EntitySheetCropKind,
): Promise<Blob> {
  const img = await loadImage(sheetImageUrl);
  const rect = entitySheetCropRect(kind);
  const px = panelRectToPixels(rect, img.naturalWidth, img.naturalHeight, 0.03);
  return cropToBlob(img, px.x, px.y, px.w, px.h);
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
