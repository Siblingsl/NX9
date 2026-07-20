export const LINE_ART_SUFFIX =
  'black and white storyboard sketch, clean pencil line art, no color, no shading, ' +
  'no grayscale fill, no texture, no photorealism, composition guide only, ' +
  'clear silhouettes, readable gestures, film storyboard panel, white background';

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
