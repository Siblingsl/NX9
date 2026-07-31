import { loadImageElement } from './image-crop';

export type ClarityScale = 1 | 1.5 | 2;

/**
 * 本地清晰度：可选放大 + unsharp mask，不走上游模型。
 * amount 0–100；0 且 scale=1 时原样输出。
 */
export async function applyLocalClarityToBlob(
  src: string,
  amount: number,
  scale: ClarityScale = 1,
): Promise<Blob> {
  const img = await loadImageElement(src);
  const outW = Math.max(1, Math.round(img.naturalWidth * scale));
  const outH = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 不可用');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  const strength = Math.max(0, Math.min(100, amount)) / 100;
  if (strength > 0.01) {
    const srcData = ctx.getImageData(0, 0, outW, outH);
    const blurred = boxBlur(srcData, Math.max(1, Math.round(1 + strength * 2)));
    const out = ctx.createImageData(outW, outH);
    const s = srcData.data;
    const b = blurred.data;
    const d = out.data;
    const amt = 0.35 + strength * 1.4;
    for (let i = 0; i < s.length; i += 4) {
      d[i] = clampByte(s[i] + (s[i] - b[i]) * amt);
      d[i + 1] = clampByte(s[i + 1] + (s[i + 1] - b[i + 1]) * amt);
      d[i + 2] = clampByte(s[i + 2] + (s[i + 2] - b[i + 2]) * amt);
      d[i + 3] = s[i + 3];
    }
    ctx.putImageData(out, 0, 0);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('清晰度处理失败'))),
      'image/png',
    );
  });
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** 简易箱式模糊（奇数半径），用于 unsharp mask */
function boxBlur(src: ImageData, radius: number): ImageData {
  const { width: w, height: h, data } = src;
  const r = Math.max(1, radius | 0);
  const tmp = new Float32Array(w * h * 4);
  const out = new ImageData(w, h);

  // horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let n = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.min(w - 1, Math.max(0, x + dx));
        const i = (y * w + xx) * 4;
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
        aSum += data[i + 3];
        n++;
      }
      const o = (y * w + x) * 4;
      tmp[o] = rSum / n;
      tmp[o + 1] = gSum / n;
      tmp[o + 2] = bSum / n;
      tmp[o + 3] = aSum / n;
    }
  }

  // vertical
  const od = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        const i = (yy * w + x) * 4;
        rSum += tmp[i];
        gSum += tmp[i + 1];
        bSum += tmp[i + 2];
        aSum += tmp[i + 3];
        n++;
      }
      const o = (y * w + x) * 4;
      od[o] = rSum / n;
      od[o + 1] = gSum / n;
      od[o + 2] = bSum / n;
      od[o + 3] = aSum / n;
    }
  }
  return out;
}
