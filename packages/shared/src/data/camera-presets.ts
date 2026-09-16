/**
 * camera-presets.ts — 导演台多机位预设条（F-018）。
 *
 * 预设：正俯/过肩/低机/荷兰角/侧拍/全景等。
 * 应用相机参数到 3D/批出。
 */
export interface CameraPreset {
  id: string;
  label: string;
  description: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'front', label: '正面', description: '正对角色，平拍', position: [0, 1.6, 5], target: [0, 1.6, 0], fov: 50 },
  { id: 'over-shoulder', label: '过肩', description: '过肩拍对方', position: [-1.5, 1.5, 3], target: [0, 1.5, -1], fov: 35 },
  { id: 'low-angle', label: '低机位', description: '低角度仰拍', position: [0, 0.3, 4], target: [0, 1.8, 0], fov: 45 },
  { id: 'dutch', label: '荷兰角', description: '倾斜视角', position: [2, 1.5, 4], target: [0, 1.6, 0], fov: 40 },
  { id: 'side', label: '侧拍', description: '侧面平拍', position: [4, 1.6, 0], target: [0, 1.6, 0], fov: 45 },
  { id: 'wide', label: '全景', description: '广角全景', position: [0, 3, 8], target: [0, 1.2, 0], fov: 70 },
  { id: 'close-up', label: '特写', description: '面部特写', position: [0, 1.6, 1.5], target: [0, 1.6, 0], fov: 30 },
  { id: 'top-down', label: '正俯', description: '俯视俯拍', position: [0, 5, 0.1], target: [0, 0, 0], fov: 50 },
];

export function lookupCameraPreset(id: string): CameraPreset | undefined {
  return CAMERA_PRESETS.find((p) => p.id === id);
}
