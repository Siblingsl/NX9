import { useState } from 'react';
import { buildCameraPrompt } from '../schema/cameraGeometry';
import { useDirectorStore } from '../store/directorStore';

/** 与 @nx9/shared CAMERA_PRESETS 对齐的内置机位（director3d 不依赖 shared）。 */
const CAMERA_PRESETS = [
  { id: 'front', name: '正面', position: [0, 1.6, 5] as [number, number, number], target: [0, 1.6, 0] as [number, number, number], fov: 50 },
  { id: 'over-shoulder', name: '过肩', position: [-1.5, 1.5, 3] as [number, number, number], target: [0, 1.5, -1] as [number, number, number], fov: 35 },
  { id: 'low-angle', name: '低机位', position: [0, 0.3, 4] as [number, number, number], target: [0, 1.8, 0] as [number, number, number], fov: 45 },
  { id: 'dutch', name: '荷兰角', position: [2, 1.5, 4] as [number, number, number], target: [0, 1.6, 0] as [number, number, number], fov: 40 },
  { id: 'side', name: '侧拍', position: [4, 1.6, 0] as [number, number, number], target: [0, 1.6, 0] as [number, number, number], fov: 45 },
  { id: 'wide', name: '全景', position: [0, 3, 8] as [number, number, number], target: [0, 1.2, 0] as [number, number, number], fov: 70 },
  { id: 'close-up', name: '特写', position: [0, 1.6, 1.5] as [number, number, number], target: [0, 1.6, 0] as [number, number, number], fov: 30 },
  { id: 'top-down', name: '正俯', position: [0, 5, 0.1] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 50 },
];

interface UserShotPreset {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  captureUrl?: string;
  cameraPrompt: string;
}

export function CameraPresetBar() {
  const project = useDirectorStore((s) => s.project);
  const updateCamera = useDirectorStore((s) => s.updateCamera);
  const [shotPresets, setShotPresets] = useState<UserShotPreset[]>([]);

  const active = project.cameras.find((c) => c.id === project.activeCameraId) ?? project.cameras[0];

  const applyCamera = (
    name: string,
    position: [number, number, number],
    target: [number, number, number],
    fov: number,
  ) => {
    if (!active) return;
    updateCamera(active.id, {
      name,
      fov,
      target,
      transform: { ...active.transform, position },
    });
  };

  const savePreset = () => {
    if (!active) return;
    const last = active.captures[active.captures.length - 1];
    const cameraPrompt = last?.cameraPrompt ?? buildCameraPrompt(active);
    setShotPresets((prev) => [
      ...prev,
      {
        name: active.name,
        position: active.transform.position,
        target: active.target,
        fov: active.fov,
        captureUrl: last?.imageUrl,
        cameraPrompt,
      },
    ]);
  };

  return (
    <div className="nx9-stage-preset-bar" aria-label="机位预设">
      <span className="nx9-stage-preset-bar__label">机位预设</span>
      <div className="nx9-stage-preset-bar__row">
        {CAMERA_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="nx9-stage-pill"
            title={`${p.name} · pos ${p.position.join(',')}`}
            onClick={() => applyCamera(p.name, p.position, p.target, p.fov)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <button type="button" className="nx9-stage-mini-btn" onClick={savePreset} disabled={!active}>
        保存当前机位
      </button>
      {shotPresets.map((preset, index) => (
        <button
          key={`${preset.name}-${index}`}
          type="button"
          className="nx9-stage-pill"
          title={preset.cameraPrompt}
          onClick={() => applyCamera(preset.name, preset.position, preset.target, preset.fov)}
        >
          {preset.name}
        </button>
      ))}
    </div>
  );
}
