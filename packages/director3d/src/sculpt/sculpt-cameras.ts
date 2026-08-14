import { PerspectiveCamera, Vector3, type Camera } from 'three';

/**
 * FACE-P3：定妆导出使用的规范机位与固定像素。
 * 禁止复用预览 canvas 拉伸；出图必须可复现（同机位、同分辨率）。
 */
export const CANONICAL_FACE_VIEW_WIDTH = 512;
export const CANONICAL_FACE_VIEW_HEIGHT = 768;
export const CANONICAL_FACE_VIEW_FOV = 32;
export const CANONICAL_FACE_VIEW_POSITION = new Vector3(0, 1.25, 2.55);
export const CANONICAL_FACE_VIEW_TARGET = new Vector3(0, 1.15, 0);

export type SculptCameraPresetId = 'face' | 'side' | 'quarter' | 'back' | 'body';

/** P2 机位键：F 正面 / S 侧面 / Q 四分之三 / B 背面；body 供全览 */
export const SCULPT_CAMERA_PRESETS: Record<
  SculptCameraPresetId,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  face: { position: [0, 1.25, 2.55], target: [0, 1.15, 0] },
  side: { position: [2.6, 1.25, 0.15], target: [0, 1.15, 0] },
  quarter: { position: [1.9, 1.35, 1.9], target: [0, 1.15, 0] },
  back: { position: [0, 1.25, -2.55], target: [0, 1.15, 0] },
  body: { position: [0, 1.05, 3.6], target: [0, 0.95, 0] },
};

export function createCanonicalFaceCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    CANONICAL_FACE_VIEW_FOV,
    CANONICAL_FACE_VIEW_WIDTH / CANONICAL_FACE_VIEW_HEIGHT,
    0.05,
    40,
  );
  camera.position.copy(CANONICAL_FACE_VIEW_POSITION);
  camera.lookAt(CANONICAL_FACE_VIEW_TARGET);
  camera.updateProjectionMatrix();
  return camera;
}

/** P2：把相机/轨道控制器摆到命名机位 */
export function applyCameraPreset(
  camera: Camera,
  controls: { target: Vector3; update: () => void },
  presetId: SculptCameraPresetId,
): void {
  const preset = SCULPT_CAMERA_PRESETS[presetId];
  camera.position.set(...preset.position);
  controls.target.set(...preset.target);
  if (camera instanceof PerspectiveCamera) camera.updateProjectionMatrix();
  controls.update();
}
