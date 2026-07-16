export type CanvasThemeMode = 'light' | 'dark';
export type CanvasGridStyle = 'dots' | 'lines' | 'blank';

export interface CanvasAppearance {
  theme: CanvasThemeMode;
  gridStyle: CanvasGridStyle;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number;
}

/** 默认深色 desk（剧本拆分同源炭黑 + 暖金） */
export const DEFAULT_CANVAS_APPEARANCE: CanvasAppearance = {
  theme: 'dark',
  gridStyle: 'dots',
  backgroundImageUrl: null,
  backgroundImageOpacity: 0.35,
};

export const CANVAS_THEMES = {
  light: {
    canvasBg: '#E8E4DB',
    gridDot: 'rgba(42,36,28,0.12)',
    gridLine: 'rgba(42,36,28,0.1)',
    nodeBg: '#FBF9F5',
    accent: '#A67C4A',
  },
  dark: {
    canvasBg: '#0C0E12',
    gridDot: 'rgba(255,255,255,0.13)',
    gridLine: 'rgba(255,255,255,0.085)',
    nodeBg: '#1A1C1F',
    accent: '#C4A574',
  },
} as const;
