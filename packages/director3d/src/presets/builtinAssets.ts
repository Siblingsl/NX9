/**
 * NX9 3D 导演台 · 内置程序化模型库。
 *
 * 全部模型由 three.js 基础几何拼装，数据完全可序列化（可写进 project / 场景模板），
 * 不依赖任何外部 glb/obj/fbx 文件即可搭出完整场景。
 *
 * 坐标约定：模型原点在「落地中心」，y=0 即地面；parts 的位置相对模型原点。
 * 尺寸约定（size 字段）：
 * - box    → [宽, 高, 深]
 * - sphere → [直径]
 * - cylinder → [直径, 高]
 * - cone   → [直径, 高]
 * - plane  → [宽, 高]（默认朝 +Z，贴地时 rotation 取 [-90, 0, 0]）
 * rotation 单位为度。
 */
export type BuiltinAssetCategory =
  | 'furniture'
  | 'architecture'
  | 'nature'
  | 'vehicle'
  | 'prop'
  | 'screen';

export const BUILTIN_ASSET_CATEGORIES: { id: BuiltinAssetCategory; label: string }[] = [
  { id: 'furniture', label: '家具' },
  { id: 'architecture', label: '建筑构件' },
  { id: 'nature', label: '自然' },
  { id: 'vehicle', label: '载具' },
  { id: 'prop', label: '道具' },
  { id: 'screen', label: '屏幕板面' },
];

export type BuiltinPartGeometry = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane';

/** sphere 只需 [直径]；plane 只需 [宽, 高]；box / cylinder / cone 用 3 分量。 */
export type BuiltinPartSize = [number] | [number, number] | [number, number, number];

export interface BuiltinAssetPart {
  geometry: BuiltinPartGeometry;
  size: BuiltinPartSize;
  position: [number, number, number];
  rotation?: [number, number, number];
  color: string;
}

export interface BuiltinAssetDef {
  id: string;
  label: string;
  category: BuiltinAssetCategory;
  /** 默认 transform 尺寸参考（米），用于放置提示与面板缩略 */
  size: [number, number, number];
  /** 缩略色 */
  color: string;
  parts: BuiltinAssetPart[];
}

const WOOD = '#9a6b43';
const WOOD_DARK = '#6d4a2c';
const METAL = '#9aa3ad';
const METAL_DARK = '#5c646e';
const FABRIC = '#7f8aa3';
const FABRIC_DARK = '#5b6478';
const STONE = '#8d8f92';
const PLANT = '#4f8f4a';
const PLANT_DARK = '#3d7038';
const GLASS = '#9fd8ff';
const WHITE = '#f2f4f7';
const DARK = '#2c323c';

/** 安全取分量：缺失或非法时回退，保证几何参数永远可用。 */
function sizeAt(size: BuiltinPartSize, index: number, fallback: number): number {
  const value = size[index];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 把 parts 规格换算成 three 几何参数，渲染层与单测共用同一套换算。 */
export function resolvePartArgs(part: BuiltinAssetPart): number[] {
  switch (part.geometry) {
    case 'sphere':
      return [sizeAt(part.size, 0, 2) / 2, 24, 16];
    case 'cylinder': {
      const radius = sizeAt(part.size, 0, 2) / 2;
      return [radius, radius, sizeAt(part.size, 1, 1), 24];
    }
    case 'cone':
      return [sizeAt(part.size, 0, 2) / 2, sizeAt(part.size, 1, 1), 24];
    case 'plane':
      return [sizeAt(part.size, 0, 1), sizeAt(part.size, 1, 1)];
    default:
      return [sizeAt(part.size, 0, 1), sizeAt(part.size, 1, 1), sizeAt(part.size, 2, 1)];
  }
}

export const BUILTIN_ASSETS: BuiltinAssetDef[] = [
  /* ------------------------------ 家具 ------------------------------ */
  {
    id: 'table-dining',
    label: '餐桌',
    category: 'furniture',
    size: [1.6, 0.75, 0.9],
    color: WOOD,
    parts: [
      { geometry: 'box', size: [1.6, 0.08, 0.9], position: [0, 0.71, 0], color: WOOD },
      { geometry: 'cylinder', size: [0.08, 0.7], position: [0.7, 0.35, 0.35], color: WOOD_DARK },
      { geometry: 'cylinder', size: [0.08, 0.7], position: [-0.7, 0.35, 0.35], color: WOOD_DARK },
      { geometry: 'cylinder', size: [0.08, 0.7], position: [0.7, 0.35, -0.35], color: WOOD_DARK },
      { geometry: 'cylinder', size: [0.08, 0.7], position: [-0.7, 0.35, -0.35], color: WOOD_DARK },
    ],
  },
  {
    id: 'chair',
    label: '椅子',
    category: 'furniture',
    size: [0.5, 0.95, 0.5],
    color: WOOD_DARK,
    parts: [
      { geometry: 'box', size: [0.46, 0.06, 0.46], position: [0, 0.45, 0], color: WOOD },
      { geometry: 'box', size: [0.46, 0.5, 0.06], position: [0, 0.72, -0.2], color: WOOD },
      { geometry: 'cylinder', size: [0.05, 0.45], position: [0.2, 0.22, 0.2], color: WOOD_DARK },
      { geometry: 'cylinder', size: [0.05, 0.45], position: [-0.2, 0.22, 0.2], color: WOOD_DARK },
      { geometry: 'cylinder', size: [0.05, 0.45], position: [0.2, 0.22, -0.2], color: WOOD_DARK },
      { geometry: 'cylinder', size: [0.05, 0.45], position: [-0.2, 0.22, -0.2], color: WOOD_DARK },
    ],
  },
  {
    id: 'sofa',
    label: '沙发',
    category: 'furniture',
    size: [2, 0.85, 0.9],
    color: FABRIC,
    parts: [
      { geometry: 'box', size: [2, 0.35, 0.9], position: [0, 0.2, 0], color: FABRIC },
      { geometry: 'box', size: [2, 0.5, 0.25], position: [0, 0.52, -0.32], color: FABRIC_DARK },
      { geometry: 'box', size: [0.22, 0.45, 0.9], position: [0.89, 0.4, 0], color: FABRIC_DARK },
      { geometry: 'box', size: [0.22, 0.45, 0.9], position: [-0.89, 0.4, 0], color: FABRIC_DARK },
    ],
  },
  {
    id: 'bed',
    label: '床',
    category: 'furniture',
    size: [1.5, 0.9, 2],
    color: WHITE,
    parts: [
      { geometry: 'box', size: [1.5, 0.3, 2], position: [0, 0.15, 0], color: WOOD_DARK },
      { geometry: 'box', size: [1.4, 0.22, 1.9], position: [0, 0.41, 0.05], color: WHITE },
      { geometry: 'box', size: [1.5, 0.7, 0.1], position: [0, 0.35, -1], color: WOOD },
      { geometry: 'box', size: [0.5, 0.12, 0.3], position: [-0.35, 0.58, -0.75], color: '#dfe6f2' },
      { geometry: 'box', size: [0.5, 0.12, 0.3], position: [0.35, 0.58, -0.75], color: '#dfe6f2' },
    ],
  },
  {
    id: 'bookshelf',
    label: '书架',
    category: 'furniture',
    size: [0.9, 1.8, 0.32],
    color: WOOD,
    parts: [
      { geometry: 'box', size: [0.05, 1.8, 0.32], position: [0.425, 0.9, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.05, 1.8, 0.32], position: [-0.425, 0.9, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.9, 0.04, 0.32], position: [0, 0.02, 0], color: WOOD },
      { geometry: 'box', size: [0.9, 0.04, 0.32], position: [0, 0.45, 0], color: WOOD },
      { geometry: 'box', size: [0.9, 0.04, 0.32], position: [0, 0.9, 0], color: WOOD },
      { geometry: 'box', size: [0.9, 0.04, 0.32], position: [0, 1.35, 0], color: WOOD },
      { geometry: 'box', size: [0.9, 0.04, 0.32], position: [0, 1.78, 0], color: WOOD },
    ],
  },
  {
    id: 'cabinet',
    label: '柜子',
    category: 'furniture',
    size: [1, 0.95, 0.45],
    color: WOOD,
    parts: [
      { geometry: 'box', size: [1, 0.85, 0.45], position: [0, 0.45, 0], color: WOOD },
      { geometry: 'box', size: [1.04, 0.05, 0.48], position: [0, 0.9, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.03, 0.4, 0.03], position: [0.2, 0.45, 0.24], color: METAL },
      { geometry: 'box', size: [0.03, 0.4, 0.03], position: [-0.2, 0.45, 0.24], color: METAL },
    ],
  },
  {
    id: 'desk',
    label: '书桌',
    category: 'furniture',
    size: [1.4, 0.78, 0.7],
    color: WOOD,
    parts: [
      { geometry: 'box', size: [1.4, 0.06, 0.7], position: [0, 0.72, 0], color: WOOD },
      { geometry: 'box', size: [0.06, 0.72, 0.68], position: [0.67, 0.36, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.06, 0.72, 0.68], position: [-0.67, 0.36, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.5, 0.2, 0.6], position: [0.35, 0.5, 0], color: WOOD_DARK },
    ],
  },
  {
    id: 'bar-counter',
    label: '吧台',
    category: 'furniture',
    size: [2.4, 1.1, 0.6],
    color: WOOD_DARK,
    parts: [
      { geometry: 'box', size: [2.4, 0.1, 0.6], position: [0, 1.05, 0], color: WOOD },
      { geometry: 'box', size: [2.4, 1, 0.14], position: [0, 0.5, 0.23], color: WOOD_DARK },
      { geometry: 'box', size: [0.12, 1, 0.6], position: [1.14, 0.5, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.12, 1, 0.6], position: [-1.14, 0.5, 0], color: WOOD_DARK },
    ],
  },
  {
    id: 'rug',
    label: '地毯',
    category: 'furniture',
    size: [2.4, 0.02, 1.6],
    color: '#8b4a4a',
    parts: [
      { geometry: 'plane', size: [2.4, 1.6], position: [0, 0.01, 0], rotation: [-90, 0, 0], color: '#8b4a4a' },
    ],
  },

  /* ---------------------------- 建筑构件 ---------------------------- */
  {
    id: 'door-frame',
    label: '门',
    category: 'architecture',
    size: [1.2, 2.1, 0.16],
    color: WOOD,
    parts: [
      { geometry: 'box', size: [0.12, 2.05, 0.14], position: [0.51, 1.02, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.12, 2.05, 0.14], position: [-0.51, 1.02, 0], color: WOOD_DARK },
      { geometry: 'box', size: [1.14, 0.12, 0.14], position: [0, 2.01, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.9, 2, 0.05], position: [0, 1, 0], color: WOOD },
      { geometry: 'cylinder', size: [0.06, 0.16], position: [0.34, 1.02, 0.06], rotation: [90, 0, 0], color: METAL },
    ],
  },
  {
    id: 'window-frame',
    label: '窗',
    category: 'architecture',
    size: [1.3, 2.1, 0.14],
    color: GLASS,
    parts: [
      { geometry: 'box', size: [1.3, 0.12, 0.14], position: [0, 0.96, 0], color: WHITE },
      { geometry: 'box', size: [1.3, 0.12, 0.14], position: [0, 2.04, 0], color: WHITE },
      { geometry: 'box', size: [0.12, 1.2, 0.14], position: [0.59, 1.5, 0], color: WHITE },
      { geometry: 'box', size: [0.12, 1.2, 0.14], position: [-0.59, 1.5, 0], color: WHITE },
      { geometry: 'box', size: [1.1, 1.2, 0.04], position: [0, 1.5, 0], color: GLASS },
    ],
  },
  {
    id: 'staircase',
    label: '楼梯',
    category: 'architecture',
    size: [1.2, 1.3, 2],
    color: STONE,
    parts: [
      { geometry: 'box', size: [1.2, 0.18, 0.32], position: [0, 0.09, 0.84], color: STONE },
      { geometry: 'box', size: [1.2, 0.36, 0.32], position: [0, 0.18, 0.52], color: STONE },
      { geometry: 'box', size: [1.2, 0.54, 0.32], position: [0, 0.27, 0.2], color: STONE },
      { geometry: 'box', size: [1.2, 0.72, 0.32], position: [0, 0.36, -0.12], color: STONE },
      { geometry: 'box', size: [1.2, 0.9, 0.32], position: [0, 0.45, -0.44], color: STONE },
      { geometry: 'box', size: [1.2, 1.08, 0.32], position: [0, 0.54, -0.76], color: STONE },
    ],
  },
  {
    id: 'pillar',
    label: '柱子',
    category: 'architecture',
    size: [0.56, 2.6, 0.56],
    color: STONE,
    parts: [
      { geometry: 'box', size: [0.56, 0.12, 0.56], position: [0, 0.06, 0], color: STONE },
      { geometry: 'cylinder', size: [0.4, 2.3], position: [0, 1.27, 0], color: '#a2a5a9' },
      { geometry: 'box', size: [0.56, 0.12, 0.56], position: [0, 2.48, 0], color: STONE },
    ],
  },
  {
    id: 'podium',
    label: '讲台',
    category: 'architecture',
    size: [0.8, 1.5, 0.6],
    color: WOOD_DARK,
    parts: [
      { geometry: 'box', size: [0.7, 0.9, 0.5], position: [0, 0.45, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.8, 0.06, 0.55], position: [0, 0.93, 0], color: WOOD },
      { geometry: 'box', size: [0.7, 0.55, 0.06], position: [0, 1.15, -0.22], color: WOOD },
    ],
  },
  {
    id: 'fence',
    label: '栅栏',
    category: 'architecture',
    size: [2, 1, 0.12],
    color: WOOD,
    parts: [
      { geometry: 'box', size: [2, 0.08, 0.06], position: [0, 0.4, 0], color: WOOD },
      { geometry: 'box', size: [2, 0.08, 0.06], position: [0, 0.8, 0], color: WOOD },
      { geometry: 'box', size: [0.1, 1, 0.08], position: [-0.8, 0.5, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.1, 1, 0.08], position: [-0.4, 0.5, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.1, 1, 0.08], position: [0, 0.5, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.1, 1, 0.08], position: [0.4, 0.5, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.1, 1, 0.08], position: [0.8, 0.5, 0], color: WOOD_DARK },
    ],
  },
  {
    id: 'street-lamp',
    label: '路灯',
    category: 'architecture',
    size: [1, 3.6, 0.4],
    color: METAL_DARK,
    parts: [
      { geometry: 'cylinder', size: [0.12, 3.4], position: [0, 1.7, 0], color: METAL_DARK },
      { geometry: 'box', size: [0.5, 0.1, 0.1], position: [0.25, 3.35, 0], color: METAL_DARK },
      { geometry: 'box', size: [0.36, 0.14, 0.24], position: [0.45, 3.26, 0], color: '#ffe9b8' },
    ],
  },
  {
    id: 'utility-pole',
    label: '电线杆',
    category: 'architecture',
    size: [1.4, 5, 0.3],
    color: WOOD_DARK,
    parts: [
      { geometry: 'cylinder', size: [0.22, 4.8], position: [0, 2.4, 0], color: WOOD_DARK },
      { geometry: 'box', size: [1.4, 0.1, 0.1], position: [0, 4.4, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.1, 0.16, 0.1], position: [0.6, 4.53, 0], color: METAL },
      { geometry: 'box', size: [0.1, 0.16, 0.1], position: [-0.6, 4.53, 0], color: METAL },
    ],
  },

  /* ------------------------------ 自然 ------------------------------ */
  {
    id: 'tree',
    label: '树',
    category: 'nature',
    size: [2.4, 4.2, 2.4],
    color: PLANT,
    parts: [
      { geometry: 'cylinder', size: [0.34, 2.2], position: [0, 1.1, 0], color: WOOD_DARK },
      { geometry: 'sphere', size: [2.2], position: [0, 2.9, 0], color: PLANT_DARK },
      { geometry: 'sphere', size: [1.5], position: [0.5, 3.7, 0.2], color: PLANT },
    ],
  },
  {
    id: 'bush',
    label: '灌木',
    category: 'nature',
    size: [1.4, 0.9, 1.2],
    color: PLANT,
    parts: [
      { geometry: 'sphere', size: [1.2], position: [0, 0.45, 0], color: PLANT },
      { geometry: 'sphere', size: [0.9], position: [0.42, 0.35, 0.1], color: PLANT_DARK },
    ],
  },
  {
    id: 'rock',
    label: '石头',
    category: 'nature',
    size: [1, 0.6, 0.9],
    color: STONE,
    parts: [
      { geometry: 'sphere', size: [1], position: [0, 0.28, 0], color: STONE },
      { geometry: 'sphere', size: [0.6], position: [0.35, 0.18, 0.15], color: '#7c7e81' },
    ],
  },
  {
    id: 'mountain',
    label: '山',
    category: 'nature',
    size: [6, 3, 6],
    color: '#6b7280',
    parts: [
      { geometry: 'cone', size: [6, 3], position: [0, 1.5, 0], color: '#5f6673' },
      { geometry: 'cone', size: [3.6, 2], position: [1.8, 1, 0.6], color: '#6b7280' },
      { geometry: 'cone', size: [2.2, 1.4], position: [-2.2, 0.7, -0.8], color: '#767d88' },
    ],
  },
  {
    id: 'log',
    label: '原木',
    category: 'nature',
    size: [1.6, 0.45, 0.45],
    color: WOOD,
    parts: [
      { geometry: 'cylinder', size: [0.45, 1.6], position: [0, 0.22, 0], rotation: [0, 0, 90], color: WOOD },
      { geometry: 'cylinder', size: [0.4, 0.06], position: [0.8, 0.22, 0], rotation: [0, 0, 90], color: WOOD_DARK },
    ],
  },
  {
    id: 'planter',
    label: '盆栽',
    category: 'nature',
    size: [0.5, 0.8, 0.5],
    color: PLANT,
    parts: [
      { geometry: 'cylinder', size: [0.5, 0.42], position: [0, 0.21, 0], color: '#a2603c' },
      { geometry: 'cylinder', size: [0.44, 0.06], position: [0, 0.45, 0], color: '#4a3a2a' },
      { geometry: 'sphere', size: [0.6], position: [0, 0.68, 0], color: PLANT },
    ],
  },

  /* ------------------------------ 载具 ------------------------------ */
  {
    id: 'car-sedan',
    label: '轿车',
    category: 'vehicle',
    size: [1.8, 1.5, 4.2],
    color: '#3b6ea5',
    parts: [
      { geometry: 'box', size: [1.8, 0.6, 4.2], position: [0, 0.7, 0], color: '#3b6ea5' },
      { geometry: 'box', size: [1.6, 0.55, 2], position: [0, 1.27, -0.2], color: '#2f5b8a' },
      { geometry: 'cylinder', size: [0.6, 0.24], position: [0.9, 0.3, 1.4], rotation: [0, 0, 90], color: DARK },
      { geometry: 'cylinder', size: [0.6, 0.24], position: [-0.9, 0.3, 1.4], rotation: [0, 0, 90], color: DARK },
      { geometry: 'cylinder', size: [0.6, 0.24], position: [0.9, 0.3, -1.4], rotation: [0, 0, 90], color: DARK },
      { geometry: 'cylinder', size: [0.6, 0.24], position: [-0.9, 0.3, -1.4], rotation: [0, 0, 90], color: DARK },
    ],
  },
  {
    id: 'truck',
    label: '卡车',
    category: 'vehicle',
    size: [2.4, 3.1, 6.6],
    color: '#b1543f',
    parts: [
      { geometry: 'box', size: [2.4, 2, 2.2], position: [0, 1.6, 2.1], color: '#b1543f' },
      { geometry: 'box', size: [2.3, 0.9, 2], position: [0, 2.4, 2.1], color: GLASS },
      { geometry: 'box', size: [2.4, 2.4, 4], position: [0, 1.8, -1.2], color: '#9aa3ad' },
      { geometry: 'cylinder', size: [0.9, 0.3], position: [1.1, 0.45, 2.2], rotation: [0, 0, 90], color: DARK },
      { geometry: 'cylinder', size: [0.9, 0.3], position: [-1.1, 0.45, 2.2], rotation: [0, 0, 90], color: DARK },
      { geometry: 'cylinder', size: [0.9, 0.3], position: [1.1, 0.45, -2.4], rotation: [0, 0, 90], color: DARK },
      { geometry: 'cylinder', size: [0.9, 0.3], position: [-1.1, 0.45, -2.4], rotation: [0, 0, 90], color: DARK },
    ],
  },
  {
    id: 'boat',
    label: '船',
    category: 'vehicle',
    size: [2, 3, 4.2],
    color: WHITE,
    parts: [
      { geometry: 'box', size: [1.8, 0.7, 3.6], position: [0, 0.35, 0], color: WHITE },
      { geometry: 'cone', size: [1.8, 1], position: [0, 0.35, 2.3], rotation: [90, 0, 0], color: WHITE },
      { geometry: 'box', size: [1.2, 0.7, 1.2], position: [0, 1.05, -0.6], color: '#9fb6c9' },
      { geometry: 'cylinder', size: [0.08, 2.4], position: [0, 2.4, -0.6], color: METAL },
    ],
  },
  {
    id: 'bus',
    label: '公交车',
    category: 'vehicle',
    size: [2.4, 3, 9],
    color: '#2f8f6f',
    parts: [
      { geometry: 'box', size: [2.4, 2.6, 9], position: [0, 1.6, 0], color: '#2f8f6f' },
      { geometry: 'box', size: [2.44, 0.8, 6.4], position: [0, 2.3, 0], color: GLASS },
      { geometry: 'box', size: [2.3, 0.9, 0.1], position: [0, 2.3, 4.51], color: GLASS },
      { geometry: 'cylinder', size: [1, 0.3], position: [1.15, 0.5, 3], rotation: [0, 0, 90], color: DARK },
      { geometry: 'cylinder', size: [1, 0.3], position: [-1.15, 0.5, 3], rotation: [0, 0, 90], color: DARK },
      { geometry: 'cylinder', size: [1, 0.3], position: [1.15, 0.5, -3], rotation: [0, 0, 90], color: DARK },
      { geometry: 'cylinder', size: [1, 0.3], position: [-1.15, 0.5, -3], rotation: [0, 0, 90], color: DARK },
    ],
  },

  /* ------------------------------ 道具 ------------------------------ */
  {
    id: 'crate',
    label: '木箱',
    category: 'prop',
    size: [0.62, 0.62, 0.62],
    color: WOOD,
    parts: [
      { geometry: 'box', size: [0.6, 0.6, 0.6], position: [0, 0.3, 0], color: WOOD },
      { geometry: 'box', size: [0.62, 0.06, 0.62], position: [0, 0.15, 0], color: WOOD_DARK },
      { geometry: 'box', size: [0.62, 0.06, 0.62], position: [0, 0.45, 0], color: WOOD_DARK },
    ],
  },
  {
    id: 'barrel',
    label: '木桶',
    category: 'prop',
    size: [0.64, 0.95, 0.64],
    color: WOOD_DARK,
    parts: [
      { geometry: 'cylinder', size: [0.6, 0.9], position: [0, 0.45, 0], color: WOOD_DARK },
      { geometry: 'cylinder', size: [0.64, 0.06], position: [0, 0.25, 0], color: METAL_DARK },
      { geometry: 'cylinder', size: [0.64, 0.06], position: [0, 0.65, 0], color: METAL_DARK },
    ],
  },
  {
    id: 'bench',
    label: '长椅',
    category: 'prop',
    size: [1.6, 0.85, 0.55],
    color: WOOD,
    parts: [
      { geometry: 'box', size: [1.6, 0.08, 0.55], position: [0, 0.45, 0], color: WOOD },
      { geometry: 'box', size: [1.6, 0.45, 0.06], position: [0, 0.7, -0.24], color: WOOD },
      { geometry: 'box', size: [0.1, 0.45, 0.5], position: [0.7, 0.22, 0], color: METAL_DARK },
      { geometry: 'box', size: [0.1, 0.45, 0.5], position: [-0.7, 0.22, 0], color: METAL_DARK },
    ],
  },
  {
    id: 'mic-stand',
    label: '话筒架',
    category: 'prop',
    size: [0.4, 1.7, 0.4],
    color: METAL_DARK,
    parts: [
      { geometry: 'cylinder', size: [0.4, 0.04], position: [0, 0.02, 0], color: METAL_DARK },
      { geometry: 'cylinder', size: [0.06, 1.55], position: [0, 0.78, 0], color: METAL },
      { geometry: 'sphere', size: [0.14], position: [0, 1.6, 0], color: DARK },
    ],
  },
  {
    id: 'tripod-camera',
    label: '摄像机三脚架',
    category: 'prop',
    size: [0.8, 1.8, 0.8],
    color: DARK,
    parts: [
      { geometry: 'cylinder', size: [0.05, 1.45], position: [0.28, 0.72, 0], rotation: [0, 0, 16], color: METAL_DARK },
      { geometry: 'cylinder', size: [0.05, 1.45], position: [-0.14, 0.72, 0.24], rotation: [10, 0, -8], color: METAL_DARK },
      { geometry: 'cylinder', size: [0.05, 1.45], position: [-0.14, 0.72, -0.24], rotation: [-10, 0, -8], color: METAL_DARK },
      { geometry: 'box', size: [0.24, 0.16, 0.36], position: [0, 1.52, 0], color: DARK },
      { geometry: 'box', size: [0.2, 0.2, 0.42], position: [0, 1.7, 0.1], color: '#3c434f' },
    ],
  },
  {
    id: 'speaker',
    label: '音箱',
    category: 'prop',
    size: [0.5, 0.9, 0.45],
    color: DARK,
    parts: [
      { geometry: 'box', size: [0.5, 0.9, 0.4], position: [0, 0.45, 0], color: DARK },
      { geometry: 'cylinder', size: [0.3, 0.06], position: [0, 0.33, 0.21], rotation: [90, 0, 0], color: '#4b525d' },
      { geometry: 'cylinder', size: [0.16, 0.06], position: [0, 0.68, 0.21], rotation: [90, 0, 0], color: '#4b525d' },
    ],
  },
  {
    id: 'suitcase',
    label: '手提箱',
    category: 'prop',
    size: [0.45, 0.78, 0.25],
    color: '#8a5a3b',
    parts: [
      { geometry: 'box', size: [0.45, 0.7, 0.25], position: [0, 0.35, 0], color: '#8a5a3b' },
      { geometry: 'box', size: [0.16, 0.06, 0.05], position: [0, 0.73, 0], color: METAL_DARK },
      { geometry: 'box', size: [0.06, 0.06, 0.04], position: [0.14, 0.35, 0.13], color: METAL },
    ],
  },
  {
    id: 'table-lamp',
    label: '台灯',
    category: 'prop',
    size: [0.34, 0.65, 0.34],
    color: '#e0c27a',
    parts: [
      { geometry: 'cylinder', size: [0.28, 0.05], position: [0, 0.03, 0], color: METAL_DARK },
      { geometry: 'cylinder', size: [0.05, 0.4], position: [0, 0.24, 0], color: METAL },
      { geometry: 'cone', size: [0.34, 0.28], position: [0, 0.55, 0], color: '#e0c27a' },
    ],
  },
  {
    id: 'traffic-cone',
    label: '路锥',
    category: 'prop',
    size: [0.4, 0.7, 0.4],
    color: '#e2762d',
    parts: [
      { geometry: 'box', size: [0.4, 0.05, 0.4], position: [0, 0.02, 0], color: DARK },
      { geometry: 'cone', size: [0.3, 0.65], position: [0, 0.35, 0], color: '#e2762d' },
    ],
  },
  {
    id: 'server-rack',
    label: '机柜',
    category: 'prop',
    size: [0.6, 1.8, 0.8],
    color: '#3a4049',
    parts: [
      { geometry: 'box', size: [0.6, 1.8, 0.8], position: [0, 0.9, 0], color: '#3a4049' },
      { geometry: 'box', size: [0.54, 0.1, 0.02], position: [0, 1.4, 0.41], color: '#5a6472' },
      { geometry: 'box', size: [0.54, 0.1, 0.02], position: [0, 1.2, 0.41], color: '#5a6472' },
      { geometry: 'box', size: [0.54, 0.1, 0.02], position: [0, 1, 0.41], color: '#5a6472' },
    ],
  },

  /* --------------------------- 屏幕与板面 --------------------------- */
  {
    id: 'tv-screen',
    label: '电视屏',
    category: 'screen',
    size: [1.4, 1.5, 0.4],
    color: '#1f2733',
    parts: [
      { geometry: 'box', size: [0.5, 0.06, 0.32], position: [0, 0.03, 0], color: DARK },
      { geometry: 'box', size: [0.12, 0.7, 0.1], position: [0, 0.4, 0], color: DARK },
      { geometry: 'box', size: [1.4, 0.85, 0.08], position: [0, 1.15, 0], color: '#1f2733' },
      { geometry: 'box', size: [1.3, 0.75, 0.04], position: [0, 1.15, 0.05], color: '#4f6b8a' },
    ],
  },
  {
    id: 'blackboard',
    label: '黑板',
    category: 'screen',
    size: [2.4, 1.4, 0.12],
    color: '#2b3a33',
    parts: [
      { geometry: 'box', size: [2.4, 1.4, 0.08], position: [0, 1.3, 0], color: WOOD_DARK },
      { geometry: 'box', size: [2.26, 1.26, 0.04], position: [0, 1.3, 0.05], color: '#2b3a33' },
      { geometry: 'box', size: [1.8, 0.06, 0.12], position: [0, 0.57, 0.08], color: WOOD_DARK },
    ],
  },
  {
    id: 'projection-screen',
    label: '投影幕',
    category: 'screen',
    size: [2.1, 2.1, 0.2],
    color: WHITE,
    parts: [
      { geometry: 'box', size: [2.1, 0.12, 0.12], position: [0, 2.06, 0], color: METAL_DARK },
      { geometry: 'plane', size: [2, 1.4], position: [0, 1.3, 0.01], color: '#eef1f5' },
    ],
  },
];

export function lookupBuiltinAsset(id: string | undefined | null): BuiltinAssetDef | undefined {
  if (!id) return undefined;
  return BUILTIN_ASSETS.find((asset) => asset.id === id);
}

export function builtinAssetsByCategory(category: BuiltinAssetCategory): BuiltinAssetDef[] {
  return BUILTIN_ASSETS.filter((asset) => asset.category === category);
}
