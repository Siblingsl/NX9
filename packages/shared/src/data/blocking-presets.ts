/** 场面调度预设机位（轻量 blocking，非完整 director-3d） */
export interface BlockingCameraPreset {
  id: string;
  label: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export const BLOCKING_CAMERA_PRESETS: BlockingCameraPreset[] = [
  {
    id: 'master-wide',
    label: '全景主镜',
    name: 'Master Wide',
    position: [0, 2.2, 7],
    target: [0, 1, 0],
    fov: 42,
  },
  {
    id: 'medium',
    label: '中景',
    name: 'Medium',
    position: [0, 1.7, 4.5],
    target: [0, 1.2, 0],
    fov: 50,
  },
  {
    id: 'ots-left',
    label: '过肩左',
    name: 'OTS Left',
    position: [-1.2, 1.65, 3.2],
    target: [0.8, 1.3, 0],
    fov: 48,
  },
  {
    id: 'ots-right',
    label: '过肩右',
    name: 'OTS Right',
    position: [1.2, 1.65, 3.2],
    target: [-0.8, 1.3, 0],
    fov: 48,
  },
  {
    id: 'low-angle',
    label: '低角度',
    name: 'Low Angle',
    position: [0, 0.6, 4],
    target: [0, 1.6, 0],
    fov: 55,
  },
];

export type BlockingLayout = 'line' | 'dialogue' | 'triangle';

export const BLOCKING_LAYOUTS: { id: BlockingLayout; label: string }[] = [
  { id: 'line', label: '一字排开' },
  { id: 'dialogue', label: '对话对峙' },
  { id: 'triangle', label: '三角站位' },
];
