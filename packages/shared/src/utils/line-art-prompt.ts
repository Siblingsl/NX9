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

/** 按镜头数量选最紧凑的等分宫格（最多 3×3）。 */
export function pickLineArtGridLayout(count: number): { rows: number; cols: number } {
  const n = Math.max(1, Math.floor(count));
  if (n <= 1) return { rows: 1, cols: 1 };
  if (n <= 4) return { rows: 2, cols: 2 };
  if (n <= 6) return { rows: 2, cols: 3 };
  return { rows: 3, cols: 3 };
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
 * 空余格要求留白，避免模型乱画。
 */
export function buildLineArtPanelGridPrompt(
  panels: LineArtGridPanel[],
  rows: number,
  cols: number,
): string {
  const capacity = Math.max(1, rows) * Math.max(1, cols);
  const cells = panels.slice(0, capacity);
  const panelLines = Array.from({ length: capacity }, (_, i) => {
    const cell = cells[i];
    if (!cell) return `Panel ${i + 1}: leave completely blank white, no drawing.`;
    const body = cell.prompt.trim().replace(/\s+/g, ' ').slice(0, 280);
    return `Panel ${i + 1} (${cell.label}): ${body}`;
  });
  return [
    `Single image: ${rows}x${cols} equal storyboard panel grid.`,
    'Panels ordered left-to-right, top-to-bottom. Equal cell size, thin black gutters, no captions or watermarks inside panels.',
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
