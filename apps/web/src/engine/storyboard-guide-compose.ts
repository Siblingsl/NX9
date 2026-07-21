import {
  STORYBOARD_GUIDE_COLORS,
  type StoryboardGuideArrow,
  type StoryboardGuideOverlay,
} from '@nx9/shared';

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  a: StoryboardGuideArrow,
  w: number,
  h: number,
) {
  const x1 = a.x1 * w;
  const y1 = a.y1 * h;
  const x2 = a.x2 * w;
  const y2 = a.y2 * h;
  const color = STORYBOARD_GUIDE_COLORS[a.kind];
  const stroke = Math.max(2.5, Math.min(w, h) * 0.008);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  if (a.curve) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * a.curve * Math.min(w, h) * 0.22;
    const ny = (dx / len) * a.curve * Math.min(w, h) * 0.22;
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx + nx, my + ny, x2, y2);
  } else {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = stroke * 3.2;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - head * Math.cos(angle - Math.PI / 7),
    y2 - head * Math.sin(angle - Math.PI / 7),
  );
  ctx.lineTo(
    x2 - head * Math.cos(angle + Math.PI / 7),
    y2 - head * Math.sin(angle + Math.PI / 7),
  );
  ctx.closePath();
  ctx.fill();

  if (a.label) {
    const lx = (x1 + x2) / 2;
    const ly = (y1 + y2) / 2 - stroke * 2;
    ctx.font = `700 ${Math.max(12, Math.round(w * 0.028))}px "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.lineWidth = Math.max(3, stroke);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(a.label, lx, ly);
    ctx.fillStyle = color;
    ctx.fillText(a.label, lx, ly);
  }
  ctx.restore();
}

/**
 * 将干净首帧 + 导引标注合成为「带箭头引导图」。
 * 仅用于视频生成参考 / 故事板导出展示；成片提示词会要求不画出箭头。
 */
export async function composeStoryboardGuideFrameDataUrl(
  imageUrl: string,
  overlay: StoryboardGuideOverlay,
): Promise<string | null> {
  if (!overlay.arrows.length && !overlay.marks.length) return imageUrl;
  const img = await loadImage(imageUrl);
  if (!img) return null;

  const w = img.naturalWidth || 1280;
  const h = img.naturalHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, w, h);

  for (const a of overlay.arrows) {
    drawArrow(ctx, a, w, h);
  }

  for (const m of overlay.marks) {
    const color = STORYBOARD_GUIDE_COLORS[m.kind];
    const x = m.x * w;
    const y = m.y * h;
    const size = m.kind === 'label' ? Math.max(14, w * 0.032) : Math.max(12, w * 0.026);
    ctx.font = `600 ${Math.round(size)}px "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.textAlign = m.align === 'end' ? 'right' : m.align === 'middle' ? 'center' : 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, w * 0.004);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(m.text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(m.text, x, y);
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}
