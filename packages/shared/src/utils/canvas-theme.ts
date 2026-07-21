export type CanvasThemeMode = 'light' | 'dark';
export type CanvasGridStyle = 'dots' | 'lines' | 'blank';
/** 节点连接点外观：点状 / 卡外加号 / 移入卡片再显示 */
export type CanvasSocketStyle = 'dot' | 'plus' | 'hidden';
/** 连接线路径：贝塞尔 / 直线 / 平滑折线 / 直角折线 / 简单曲线 */
export type CanvasEdgePathType =
  | 'default'
  | 'straight'
  | 'smoothstep'
  | 'step'
  | 'simplebezier';

export interface CanvasAppearance {
  theme: CanvasThemeMode;
  gridStyle: CanvasGridStyle;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number;
  /** 连接点样式，默认点状 */
  socketStyle?: CanvasSocketStyle;
  /** 连接线线条类型，默认贝塞尔 */
  edgePathType?: CanvasEdgePathType;
}

/** 默认深色 desk（剧本拆分同源炭黑 + 暖金） */
export const DEFAULT_CANVAS_APPEARANCE: CanvasAppearance = {
  theme: 'dark',
  gridStyle: 'dots',
  backgroundImageUrl: null,
  backgroundImageOpacity: 0.35,
  socketStyle: 'dot',
  edgePathType: 'default',
};

export const CANVAS_THEMES = {
  light: {
    canvasBg: '#E8E4DB',
    gridDot: 'rgba(42,36,28,0.28)',
    gridLine: 'rgba(42,36,28,0.14)',
    nodeBg: '#FBF9F5',
    accent: '#A67C4A',
  },
  dark: {
    canvasBg: '#0C0E12',
    gridDot: 'rgba(255,255,255,0.32)',
    gridLine: 'rgba(255,255,255,0.14)',
    nodeBg: '#1A1C1F',
    accent: '#C4A574',
  },
} as const;
