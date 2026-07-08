export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法加载图像'));
    img.src = src;
  });
}

export async function cropImageToBlob(
  src: string,
  rect: CropRect,
): Promise<Blob> {
  const img = await loadImageElement(src);
  const sx = Math.max(0, Math.min(rect.x, img.naturalWidth - 1));
  const sy = Math.max(0, Math.min(rect.y, img.naturalHeight - 1));
  const sw = Math.max(1, Math.min(rect.w, img.naturalWidth - sx));
  const sh = Math.max(1, Math.min(rect.h, img.naturalHeight - sy));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 不可用');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('裁剪失败'))),
      'image/png',
    );
  });
}

export function defaultCropRect(naturalW: number, naturalH: number): CropRect {
  const marginX = Math.round(naturalW * 0.08);
  const marginY = Math.round(naturalH * 0.08);
  return {
    x: marginX,
    y: marginY,
    w: Math.max(1, naturalW - marginX * 2),
    h: Math.max(1, naturalH - marginY * 2),
  };
}
