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
    canvasBg: '#181715',
    gridDot: 'rgba(255,255,255,0.08)',
    gridLine: 'rgba(255,255,255,0.06)',
    nodeBg: '#222222',
  },
} as const;
