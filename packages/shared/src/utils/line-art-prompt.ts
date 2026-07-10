export const LINE_ART_SUFFIX =
  'black and white storyboard sketch, clean pencil line art, no color, no shading, ' +
  'composition guide only, film storyboard panel, white background';

export function buildLineArtGridPrompt(scenePrompt: string, rows: number, cols: number): string {
  return [
    scenePrompt.trim(),
    `${rows}x${cols} panel grid layout, numbered panels left-to-right top-to-bottom,`,
    'consistent character silhouettes across panels,',
    LINE_ART_SUFFIX,
  ].filter(Boolean).join(' ');
}

export function buildLineArtShotPrompt(shotDescription: string, shotType?: string): string {
  return [
    shotDescription.trim(),
    shotType ? `${shotType} shot,` : '',
    LINE_ART_SUFFIX,
  ].filter(Boolean).join(' ');
}
