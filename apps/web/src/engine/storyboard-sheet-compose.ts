import {
  filterStoryboardGuideOverlay,
  formatShotTimeRange,
  resolveStoryboardGuideOverlay,
  STORYBOARD_GUIDE_COLORS,
  suggestStoryboardGridCols,
  type ShotTimelineEntry,
  type StoryboardGuideOverlay,
  type StoryboardShot,
} from '@nx9/shared';
import {
  enabledGuideKinds,
  readStoryboardGuidePrefs,
} from '../stores/storyboard-guide-prefs';

export type StoryboardSheetCell = {
  imageUrl?: string | null;
  index: number;
  /** 格标题，如「开场建立」 */
  title: string;
  /** 格下说明（动作 / 对白 / 视听） */
  caption: string;
  /** 底栏彩字技法条（运镜 / 光影 / 调色…） */
  chips?: Array<{ text: string; color: string }>;
  /** 画面上对白气泡 */
  dialogue?: string | null;
  /** 导引箭头（叠画在画面上） */
  guide?: StoryboardGuideOverlay | null;
  startSec: number;
  endSec: number;
};

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const raw = text.replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const chars = [...raw];
  const lines: string[] = [];
  let line = '';
  for (const ch of chars) {
    const trial = line + ch;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line = trial;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && lines.join('').length < raw.length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] =
      last.length > 1 ? `${last.slice(0, Math.max(1, last.length - 1))}…` : '…';
  }
  return lines;
}

/**
 * 分镜故事板大图（contact sheet）
 * 白底密铺宫格：镜号标题 + 画面 + 说明，便于下游节点读取。
 */
export async function composeStoryboardSheetPng(
  cells: StoryboardSheetCell[],
  opts?: {
    cols?: number;
    cellW?: number;
    cellH?: number;
    title?: string;
    subtitle?: string;
  },
): Promise<Blob> {
  if (cells.length === 0) throw new Error('没有可拼接的分镜');

  const cols = opts?.cols ?? suggestStoryboardGridCols(cells.length);
  const rows = Math.ceil(cells.length / cols);
  const cellW = opts?.cellW ?? 420;
  const imgH = opts?.cellH ?? 248;
  const titleBarH = 32;
  const captionH = 78;
  const cellH = imgH + titleBarH + captionH;
  const gap = 12;
  const padX = 28;
  const padTop = 72;
  const padBottom = 28;
  const headerTitle = opts?.title?.trim() || '分镜故事板';
  const headerSub = opts?.subtitle?.trim() || '';

  const canvasW = padX * 2 + cols * cellW + (cols - 1) * gap;
  const canvasH = padTop + padBottom + rows * cellH + (rows - 1) * gap;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');

  // 纸白底
  ctx.fillStyle = '#f7f6f2';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 页眉
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '700 28px "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(headerTitle, padX, 40);
  if (headerSub) {
    ctx.fillStyle = '#5c5c5c';
    ctx.font = '500 14px "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    ctx.fillText(headerSub, padX, 60);
  }
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, 68);
  ctx.lineTo(canvasW - padX, 68);
  ctx.stroke();

  const images = await Promise.all(
    cells.map((c) => (c.imageUrl ? loadImage(c.imageUrl) : Promise.resolve(null))),
  );

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = padX + c * (cellW + gap);
    const y = padTop + r * (cellH + gap);

    // 外框
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, cellW, cellH);
    ctx.strokeRect(x + 0.75, y + 0.75, cellW - 1.5, cellH - 1.5);

    // 标题条：序号 + 短标题
    const head = `${cell.index}. ${cell.title.trim() || `分镜 ${cell.index}`}`;
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '700 15px "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const headClipped =
      ctx.measureText(head).width > cellW - 16
        ? (() => {
            let t = head;
            while (t.length > 2 && ctx.measureText(`${t}…`).width > cellW - 16) t = t.slice(0, -1);
            return `${t}…`;
          })()
        : head;
    ctx.fillText(headClipped, x + 8, y + titleBarH / 2);

    // 画面区
    const imgY = y + titleBarH;
    const img = images[i];
    if (img) {
      const scale = Math.max(cellW / img.naturalWidth, imgH / img.naturalHeight);
      const sw = cellW / scale;
      const sh = imgH / scale;
      const sx = (img.naturalWidth - sw) / 2;
      const sy = (img.naturalHeight - sh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, imgY, cellW, imgH);
      ctx.clip();
      ctx.drawImage(img, sx, sy, sw, sh, x, imgY, cellW, imgH);
      ctx.restore();
    } else {
      ctx.fillStyle = '#e8e6e0';
      ctx.fillRect(x, imgY, cellW, imgH);
      ctx.fillStyle = '#8a8680';
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('待预览', x + cellW / 2, imgY + imgH / 2);
    }

    // 画面下分隔
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, imgY + imgH);
    ctx.lineTo(x + cellW, imgY + imgH);
    ctx.stroke();

    // 导引箭头 / 色标（叠在画面上，不改 firstFrame 像素源）
    if (cell.guide && (cell.guide.arrows.length || cell.guide.marks.length)) {
      for (const a of cell.guide.arrows) {
        const color = STORYBOARD_GUIDE_COLORS[a.kind];
        const x1 = x + a.x1 * cellW;
        const y1 = imgY + a.y1 * imgH;
        const x2 = x + a.x2 * cellW;
        const y2 = imgY + a.y2 * imgH;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (a.curve) {
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy) || 1;
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo(
            mx + (-dy / len) * a.curve * 36,
            my + (dx / len) * a.curve * 36,
            x2,
            y2,
          );
        } else {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const head = 8;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(ang - 0.4), y2 - head * Math.sin(ang - 0.4));
        ctx.lineTo(x2 - head * Math.cos(ang + 0.4), y2 - head * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
      }
      for (const m of cell.guide.marks) {
        const color = STORYBOARD_GUIDE_COLORS[m.kind];
        ctx.fillStyle = color;
        ctx.font = `600 ${m.kind === 'label' ? 12 : 11}px "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif`;
        ctx.textAlign = m.align === 'end' ? 'right' : m.align === 'middle' ? 'center' : 'left';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 3;
        const tx = x + m.x * cellW;
        const ty = imgY + m.y * imgH;
        ctx.strokeText(m.text, tx, ty);
        ctx.fillText(m.text, tx, ty);
      }
    }

    // 对白气泡（若有）
    if (cell.dialogue?.trim()) {
      const bubble = cell.dialogue.trim();
      ctx.font = '500 12px "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
      const bubbleLines = wrapLines(ctx, bubble, cellW * 0.55, 3);
      const bw = Math.min(
        cellW * 0.62,
        Math.max(...bubbleLines.map((l) => ctx.measureText(l).width)) + 16,
      );
      const bh = bubbleLines.length * 15 + 12;
      const bx = x + cellW - bw - 10;
      const by = imgY + 10;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = 'rgba(30,30,30,0.55)';
      ctx.lineWidth = 1;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.fillStyle = '#1a1a1a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      let bly = by + 16;
      for (const line of bubbleLines) {
        ctx.fillText(line, bx + 8, bly);
        bly += 15;
      }
    }

    // 说明区：彩字技法 + 正文
    const capY = imgY + imgH;
    const time = formatShotTimeRange(cell.startSec, cell.endSec);
    ctx.fillStyle = '#6b6b6b';
    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(time, x + 8, capY + 14);

    let ly = capY + 30;
    const chips = cell.chips?.filter((c) => c.text.trim()) ?? [];
    if (chips.length > 0) {
      ctx.font = '600 11px "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
      let cx = x + 8;
      for (const chip of chips.slice(0, 4)) {
        const t = chip.text.trim();
        const w = ctx.measureText(t).width;
        if (cx + w > x + cellW - 8) break;
        ctx.fillStyle = chip.color;
        ctx.fillText(t, cx, ly);
        cx += w + 12;
      }
      ly += 16;
    }

    ctx.fillStyle = '#333333';
    ctx.font = '500 11px "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    const lines = wrapLines(ctx, cell.caption || '—', cellW - 16, chips.length > 0 ? 2 : 3);
    for (const line of lines) {
      ctx.fillText(line, x + 8, ly);
      ly += 14;
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('导出 PNG 失败'))),
      'image/png',
      0.95,
    );
  });
}

/** 分镜台：从拆镜表 + 线稿/试出帧拼故事板大图单元格（优先线稿构图图） */
export function deskSheetCellsFromBreakdownShots(
  shots: Array<{
    id: string;
    index: number;
    durationSec: number;
    sceneCode?: string;
    title?: string;
    scene?: string;
    visual?: string;
    action?: string;
    scriptText?: string;
    audiovisualLanguage?: string;
    sketchPrompt?: string;
    shotSize?: string;
    cameraMove?: string;
    cameraAngle?: string;
    cameraLens?: string;
    dialogue?: Array<{ speaker?: string; text?: string }>;
    narration?: string;
    previewImageUrl?: string | null;
    referenceImageUrl?: string | null;
  }>,
  opts?: {
    preview?: { frames?: Array<{
      id?: string;
      sourceShotId?: string;
      imageUrl?: string | null;
      stylePreset?: string | null;
      order?: number;
    }> } | null;
    storyboardUrlByShotId?: Map<string, string | undefined>;
    workspaceShotById?: Map<string, Pick<
      StoryboardShot,
      | 'firstFrameAssetId'
      | 'subtitleText'
      | 'lighting'
      | 'colorGrade'
      | 'audioDirection'
      | 'guideOverlay'
      | 'notes'
      | 'descriptionZh'
      | 'promptEn'
      | 'sceneName'
      | 'cameraMove'
      | 'shotType'
    >>;
  },
): StoryboardSheetCell[] {
  const frames = opts?.preview?.frames ?? [];
  const urlByShot = opts?.storyboardUrlByShotId;
  const wsById = opts?.workspaceShotById;
  const guidePrefs = readStoryboardGuidePrefs();

  return [...shots]
    .sort((a, b) => a.index - b.index)
    .map((shot, i, sorted) => {
      const frameLine = frames.find(
        (f) =>
          (f.sourceShotId === shot.id || f.id === shot.id || f.id === `frame-line-${shot.id}`)
          && f.stylePreset === 'line-art'
          && f.imageUrl?.trim(),
      );
      const frameAny = frames
        .filter((f) => f.sourceShotId === shot.id || f.id === shot.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .find((f) => f.imageUrl?.trim());
      const ws = wsById?.get(shot.id);
      const imageUrl =
        shot.previewImageUrl?.trim()
        || frameLine?.imageUrl?.trim()
        || frameAny?.imageUrl?.trim()
        || shot.referenceImageUrl?.trim()
        || urlByShot?.get(shot.id)?.trim()
        || ws?.firstFrameAssetId?.trim()
        || null;

      const dialogueRaw =
        shot.dialogue?.map((d) => {
          const t = d.text?.trim();
          if (!t) return '';
          return d.speaker?.trim() ? `${d.speaker.trim()}：${t}` : t;
        }).filter(Boolean).join(' ')
        || shot.narration?.trim()
        || ws?.subtitleText?.trim()
        || '';

      const body =
        shot.audiovisualLanguage?.trim()
        || shot.visual?.trim()
        || shot.action?.trim()
        || shot.scriptText?.trim()
        || ws?.descriptionZh?.trim()
        || ws?.notes?.trim()
        || shot.sketchPrompt?.trim()
        || '';

      const title =
        [shot.sceneCode, shot.scene || shot.title].filter(Boolean).join(' ')
        || shot.title?.trim()
        || `分镜 ${i + 1}`;

      const chips: Array<{ text: string; color: string }> = [];
      if (shot.shotSize?.trim()) chips.push({ text: shot.shotSize.trim(), color: STORYBOARD_GUIDE_COLORS.camera });
      if (shot.cameraMove?.trim()) chips.push({ text: shot.cameraMove.trim(), color: STORYBOARD_GUIDE_COLORS.camera });
      if (shot.cameraAngle?.trim()) chips.push({ text: shot.cameraAngle.trim(), color: STORYBOARD_GUIDE_COLORS.camera });
      if (shot.cameraLens?.trim()) chips.push({ text: shot.cameraLens.trim(), color: STORYBOARD_GUIDE_COLORS.camera });
      if (ws?.lighting?.trim()) chips.push({ text: ws.lighting.trim(), color: STORYBOARD_GUIDE_COLORS.light });
      if (ws?.colorGrade?.trim()) chips.push({ text: ws.colorGrade.trim(), color: STORYBOARD_GUIDE_COLORS.light });
      if (ws?.audioDirection?.trim()) chips.push({ text: ws.audioDirection.trim(), color: STORYBOARD_GUIDE_COLORS.emotion });

      const guide = ws
        ? filterStoryboardGuideOverlay(resolveStoryboardGuideOverlay(ws), {
            enabled: guidePrefs.showOnExport,
            kinds: enabledGuideKinds(guidePrefs),
          })
        : null;

      let startSec = 0;
      for (let j = 0; j < i; j++) startSec += Math.max(0.5, sorted[j]?.durationSec || 5);

      return {
        imageUrl,
        index: i + 1,
        title: title.replace(/\s+/g, ' ').trim(),
        caption: body || '（暂无分镜说明）',
        dialogue: dialogueRaw || null,
        chips,
        guide,
        startSec,
        endSec: startSec + Math.max(0.5, shot.durationSec || 5),
      };
    });
}

export function buildDeskContactSheetSignature(cells: StoryboardSheetCell[]): string {
  return cells
    .map((c) => `${c.index}:${c.imageUrl ?? ''}:${c.title}:${c.caption.slice(0, 40)}`)
    .join('|');
}

export function timelineCellsFromShots(
  shots: Array<
    Pick<
      StoryboardShot,
      | 'id'
      | 'index'
      | 'durationSec'
      | 'descriptionZh'
      | 'promptEn'
      | 'sceneName'
      | 'firstFrameAssetId'
      | 'notes'
      | 'subtitleText'
      | 'cameraMove'
      | 'lighting'
      | 'colorGrade'
      | 'audioDirection'
      | 'guideOverlay'
      | 'shotType'
    >
  >,
  timeline: ShotTimelineEntry[],
): StoryboardSheetCell[] {
  const byId = new Map(timeline.map((t) => [t.shotId, t]));
  return [...shots]
    .sort((a, b) => a.index - b.index)
    .map((shot, i) => {
      const t = byId.get(shot.id);
      const body =
        shot.descriptionZh?.trim()
        || shot.notes?.trim()
        || shot.promptEn?.trim()
        || '';
      const short =
        body.length > 20 ? `${body.slice(0, 20)}…` : body;
      const title =
        shot.sceneName?.trim()
        || short
        || `分镜 ${i + 1}`;
      const chips: Array<{ text: string; color: string }> = [];
      if (shot.cameraMove?.trim()) chips.push({ text: shot.cameraMove.trim(), color: STORYBOARD_GUIDE_COLORS.camera });
      if (shot.lighting?.trim()) chips.push({ text: shot.lighting.trim(), color: STORYBOARD_GUIDE_COLORS.light });
      if (shot.colorGrade?.trim()) chips.push({ text: shot.colorGrade.trim(), color: STORYBOARD_GUIDE_COLORS.light });
      if (shot.audioDirection?.trim()) chips.push({ text: shot.audioDirection.trim(), color: STORYBOARD_GUIDE_COLORS.emotion });
      if (shot.subtitleText?.trim()) chips.push({ text: shot.subtitleText.trim().slice(0, 18), color: STORYBOARD_GUIDE_COLORS.emotion });
      const guidePrefs = readStoryboardGuidePrefs();
      const guide = filterStoryboardGuideOverlay(resolveStoryboardGuideOverlay(shot), {
        enabled: guidePrefs.showOnExport,
        kinds: enabledGuideKinds(guidePrefs),
      });
      return {
        imageUrl: shot.firstFrameAssetId ?? null,
        index: i + 1,
        title: title.replace(/\s+/g, ' '),
        caption: body || '（暂无分镜说明）',
        dialogue: shot.subtitleText?.trim() || null,
        chips,
        guide,
        startSec: t?.startSec ?? 0,
        endSec: t?.endSec ?? shot.durationSec,
      };
    });
}
