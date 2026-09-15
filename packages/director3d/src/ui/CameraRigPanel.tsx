import { useMemo, useState } from 'react';
import { useDirectorStore } from '../store/directorStore';
import {
  describeCameraShot,
  focalLengthMm,
  fovFromFocalMm,
  getOrbit,
  PROMPT_DETAIL_LABELS,
  shotDistance,
  type CameraMoveId,
  type PromptDetailFlags,
} from '../schema/cameraGeometry';
import { PROMPT_PLATFORMS, skinCameraPrompt, type PromptPlatformId } from '../schema/promptSkin';

const MOVES: { id: CameraMoveId; label: string }[] = [
  { id: 'static', label: '固定' },
  { id: 'dolly-in', label: '推进' },
  { id: 'dolly-out', label: '拉远' },
  { id: 'truck-left', label: '左移' },
  { id: 'truck-right', label: '右移' },
  { id: 'pan-left', label: '左摇' },
  { id: 'pan-right', label: '右摇' },
  { id: 'tilt-up', label: '上仰' },
  { id: 'tilt-down', label: '下俯' },
  { id: 'orbit', label: '环绕' },
  { id: 'crane-up', label: '升臂' },
  { id: 'crane-down', label: '降臂' },
  { id: 'handheld', label: '手持' },
];

const SHOT_PRESETS: { label: string; r: number }[] = [
  { label: '特写', r: 0.45 },
  { label: '近景', r: 0.75 },
  { label: '中景', r: 1.15 },
  { label: '全景', r: 1.8 },
  { label: '远景', r: 2.8 },
];

export function CameraRigPanel() {
  const project = useDirectorStore((s) => s.project);
  const cameraMove = useDirectorStore((s) => s.cameraMove);
  const setCameraMove = useDirectorStore((s) => s.setCameraMove);
  const promptPlatform = useDirectorStore((s) => s.promptPlatform);
  const setPromptPlatform = useDirectorStore((s) => s.setPromptPlatform);
  const promptDetails = useDirectorStore((s) => s.promptDetails);
  const setPromptDetail = useDirectorStore((s) => s.setPromptDetail);
  const applyActiveOrbit = useDirectorStore((s) => s.applyActiveOrbit);
  const updateCamera = useDirectorStore((s) => s.updateCamera);
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const camera = project.cameras.find((c) => c.id === project.activeCameraId) ?? project.cameras[0];
  const subject = project.objects.find((o) => o.kind === 'character' && o.visible);
  const subjectYaw = subject?.transform.rotation[1] ?? 0;

  const desc = useMemo(() => {
    if (!camera) return null;
    return describeCameraShot(camera, {
      roll: camera.transform.rotation[2],
      subjectYawDeg: subjectYaw,
      move: cameraMove,
      details: promptDetails,
    });
  }, [camera, cameraMove, subjectYaw, promptDetails]);

  if (!camera || !desc) {
    return (
      <div className="nx9-stage-rig">
        <div className="nx9-stage-rig-head">机位台</div>
        <p className="nx9-stage-hint">当前没有活动镜头。</p>
      </div>
    );
  }

  const orbit = getOrbit(
    { x: camera.transform.position[0], y: camera.transform.position[1], z: camera.transform.position[2] },
    { x: camera.target[0], y: camera.target[1], z: camera.target[2] },
  );
  const lens = focalLengthMm(camera.fov);
  const skinned = skinCameraPrompt(desc.prompt, promptPlatform, cameraMove);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(skinned);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="nx9-stage-rig">
      <div className="nx9-stage-rig-head">
        机位台
        <span className="nx9-stage-chip">{desc.shot}</span>
        <span className="nx9-stage-chip">{desc.angle}</span>
      </div>
      <div className="nx9-stage-rig-body">
        <label className="nx9-stage-field">
          方位角 {Math.round(orbit.az)}°
          <input type="range" min={0} max={360} value={orbit.az} onChange={(e) => applyActiveOrbit({ az: Number(e.target.value) })} />
        </label>
        <label className="nx9-stage-field">
          仰角 {Math.round(orbit.el)}°
          <input type="range" min={-85} max={88} value={orbit.el} onChange={(e) => applyActiveOrbit({ el: Number(e.target.value) })} />
        </label>
        <label className="nx9-stage-field">
          距离 {orbit.dist.toFixed(1)} m
          <input
            type="range"
            min={3}
            max={300}
            value={Math.round(orbit.dist * 10)}
            onChange={(e) => applyActiveOrbit({ dist: Number(e.target.value) / 10 })}
          />
        </label>
        <label className="nx9-stage-field">
          焦段 ~{lens}mm · FOV {Math.round(camera.fov)}°
          <input type="range" min={14} max={135} value={lens} onChange={(e) => applyActiveOrbit({ fov: fovFromFocalMm(Number(e.target.value)) })} />
        </label>
        <label className="nx9-stage-field">
          荷兰角 {Math.round(camera.transform.rotation[2])}°
          <input
            type="range"
            min={-35}
            max={35}
            value={camera.transform.rotation[2]}
            onChange={(e) => applyActiveOrbit({ roll: Number(e.target.value) })}
          />
        </label>
        <label className="nx9-stage-field">
          机位 XYZ
          <input
            type="text"
            value={camera.transform.position.map((n) => n.toFixed(2)).join(', ')}
            onChange={(e) => {
              const values = e.target.value.split(',').map((item) => Number(item.trim()));
              if (values.length === 3 && values.every(Number.isFinite)) {
                updateCamera(camera.id, {
                  transform: { ...camera.transform, position: values as [number, number, number] },
                });
              }
            }}
          />
        </label>
        <label className="nx9-stage-field">
          目标点 XYZ
          <input
            type="text"
            value={camera.target.map((n) => n.toFixed(2)).join(', ')}
            onChange={(e) => {
              const values = e.target.value.split(',').map((item) => Number(item.trim()));
              if (values.length === 3 && values.every(Number.isFinite)) {
                updateCamera(camera.id, { target: values as [number, number, number] });
              }
            }}
          />
        </label>
        <div className="nx9-stage-rig-presets">
          {SHOT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="nx9-stage-mini-btn"
              onClick={() => applyActiveOrbit({ dist: shotDistance(p.r, camera.fov) })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="nx9-stage-field">
          运镜
          <select value={cameraMove} onChange={(e) => setCameraMove(e.target.value as CameraMoveId)}>
            {MOVES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="nx9-stage-field">
          提示词皮肤
          <select value={promptPlatform} onChange={(e) => setPromptPlatform(e.target.value as PromptPlatformId)}>
            {PROMPT_PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`nx9-stage-mini-btn${detailsOpen ? ' is-on' : ''}`}
          onClick={() => setDetailsOpen((v) => !v)}
        >
          提示词细节 {detailsOpen ? '▾' : '▸'}
        </button>
        {detailsOpen && (
          <div className="nx9-stage-prompt-toggles" role="group" aria-label="提示词细节开关">
            {PROMPT_DETAIL_LABELS.map((item) => (
              <label key={item.id} className="nx9-stage-toggle">
                <input
                  type="checkbox"
                  checked={promptDetails[item.id]}
                  onChange={(e) => setPromptDetail(item.id as keyof PromptDetailFlags, e.target.checked)}
                />
                {item.label}
              </label>
            ))}
          </div>
        )}
        <div className="nx9-stage-prompt-box" title="写入批出的镜头语言">
          {skinned}
        </div>
        <button type="button" className="nx9-stage-mini-btn is-on" onClick={() => void copyPrompt()}>
          {copied ? '已复制' : '复制提示词'}
        </button>
      </div>
    </div>
  );
}
