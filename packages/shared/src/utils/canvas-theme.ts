export type CanvasThemeMode = 'light' | 'dark';
export type CanvasGridStyle = 'dots' | 'lines' | 'blank';

export interface CanvasAppearance {
  theme: CanvasThemeMode;
  gridStyle: CanvasGridStyle;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number;
}

export const DEFAULT_CANVAS_APPEARANCE: CanvasAppearance = {
  theme: 'light',
  gridStyle: 'dots',
  backgroundImageOpacity: 0.35,
};

export const CANVAS_THEMES = {
  light: {
    canvasBg: '#FAFAF8',
    gridDot: '#E6E6E6',
    gridLine: '#E0E0E0',
    nodeBg: '#FFFFFF',
  },
  dark: {
    canvasBg: '#11100E',
    gridDot: 'rgba(255,255,255,0.13)',
    gridLine: 'rgba(255,255,255,0.075)',
    nodeBg: '#211F1C',
  },
} as const;
