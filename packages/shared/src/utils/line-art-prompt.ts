export const LINE_ART_SUFFIX =
  'black and white storyboard sketch, clean pencil line art, no color, no shading, ' +
  'no grayscale fill, no texture, no photorealism, composition guide only, ' +
  'clear silhouettes, readable gestures, film storyboard panel, white background';

export interface LineArtGridPanel {
  /** 面板编号标签，如 1-1 / Shot03 */
  label: string;
  /** 该格线稿提示词 */
  prompt: string;
}

/** 宫格线稿固定 2×2（4 格），便于等分裁切；不足 4 镜时空位留白。 */
export const LINE_ART_GRID_ROWS = 2;
export const LINE_ART_GRID_COLS = 2;
export const LINE_ART_GRID_PAGE_SIZE = LINE_ART_GRID_ROWS * LINE_ART_GRID_COLS;

/** 宫格线稿布局：始终 2×2，忽略 count（保留参数以兼容旧调用）。 */
export function pickLineArtGridLayout(_count?: number): { rows: number; cols: number } {
  return { rows: LINE_ART_GRID_ROWS, cols: LINE_ART_GRID_COLS };
}

/** 宫格线稿：统一人物剪影与编号分镜格，便于快速审构图。 */
export function buildLineArtGridPrompt(scenePrompt: string, rows: number, cols: number): string {
  return [
    scenePrompt.trim(),
    `${rows}x${cols} panel grid layout, numbered panels left-to-right top-to-bottom,`,
    'consistent character silhouettes and costume landmarks across panels,',
    'each panel shows a distinct camera beat with clear foreground / midground / background,',
    LINE_ART_SUFFIX,
  ].filter(Boolean).join(' ');
}

/**
 * 多镜提示词拼成一张 contact sheet：每格对应一镜，便于一次出图后等分裁切回填。
 * 固定填满 rows×cols；无镜头的格强制白板，禁止破坏等分布局。
 */
export function buildLineArtPanelGridPrompt(
  panels: LineArtGridPanel[],
  rows: number = LINE_ART_GRID_ROWS,
  cols: number = LINE_ART_GRID_COLS,
): string {
  const capacity = Math.max(1, rows) * Math.max(1, cols);
  const cells = panels.slice(0, capacity);
  const panelLines = Array.from({ length: capacity }, (_, i) => {
    const cell = cells[i];
    if (!cell) {
      return (
        `Panel ${i + 1}: EMPTY SLOT — solid blank white panel only, ` +
        'no drawing, no characters, no props, no text, no symbols.'
      );
    }
    const body = cell.prompt.trim().replace(/\s+/g, ' ').slice(0, 280);
    return `Panel ${i + 1} (${cell.label}): ${body}`;
  });
  return [
    `Single image: strict ${rows}x${cols} equal storyboard panel grid (exactly ${capacity} cells).`,
    'Whole image and every panel are landscape widescreen (cinema 16:9 framing), not square.',
    'Do not change to any other grid size or irregular layout.',
    'Panels ordered left-to-right, top-to-bottom. Equal cell size, thin black gutters, no captions or watermarks inside panels.',
    'Do not merge, stretch, or omit cells. Empty slots stay pure blank white so equal-split crop stays aligned.',
    'Keep character silhouettes and costume landmarks consistent across panels when the same character appears.',
    ...panelLines,
    LINE_ART_SUFFIX,
  ].join('\n');
}

/** 单镜线稿：强调站位、景深层次与镜头方向，不写最终成图质感。 */
export function buildLineArtShotPrompt(shotDescription: string, shotType?: string): string {
  return [
    shotDescription.trim(),
    shotType ? `${shotType} shot,` : '',
    'clear character blocking, readable pose and eyeline, composition center of interest,',
    'foreground midground background separation, simple environment landmarks only,',
    LINE_ART_SUFFIX,
  ].filter(Boolean).join(' ');
}
