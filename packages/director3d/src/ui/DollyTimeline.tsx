import { useEffect } from 'react';
import { useDirectorStore } from '../store/directorStore';
import { interpolateCamera } from '../schema/cameraGeometry';

export function DollyTimeline() {
  const dollyA = useDirectorStore((s) => s.dollyA);
  const dollyB = useDirectorStore((s) => s.dollyB);
  const dollyT = useDirectorStore((s) => s.dollyT);
  const setDollyKey = useDirectorStore((s) => s.setDollyKey);
  const setDollyT = useDirectorStore((s) => s.setDollyT);
  const clearDolly = useDirectorStore((s) => s.clearDolly);
  const previewActiveCamera = useDirectorStore((s) => s.previewActiveCamera);
  const project = useDirectorStore((s) => s.project);
  const activeId = project.activeCameraId ?? project.cameras[0]?.id;

  useEffect(() => {
    if (!dollyA || !dollyB || !activeId) return;
    const mixed = interpolateCamera(dollyA.camera, dollyB.camera, dollyT);
    previewActiveCamera({
      fov: mixed.fov,
      target: mixed.target,
      transform: mixed.transform,
    });
  }, [dollyT, dollyA, dollyB, activeId, previewActiveCamera]);

  return (
    <div className="nx9-stage-dolly">
      <div className="nx9-stage-dolly-head">运镜轨 A → B</div>
      <div className="nx9-stage-dolly-actions">
        <button type="button" className={`nx9-stage-mini-btn${dollyA ? ' is-on' : ''}`} onClick={() => setDollyKey('A')}>
          标记 A
        </button>
        <button type="button" className={`nx9-stage-mini-btn${dollyB ? ' is-on' : ''}`} onClick={() => setDollyKey('B')}>
          标记 B
        </button>
        <button type="button" className="nx9-stage-mini-btn" disabled={!dollyA && !dollyB} onClick={clearDolly}>
          清空
        </button>
      </div>
      <label className="nx9-stage-field">
        预览 {Math.round(dollyT * 100)}%
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(dollyT * 100)}
          disabled={!dollyA || !dollyB}
          onChange={(e) => setDollyT(Number(e.target.value) / 100)}
        />
      </label>
      <p className="nx9-stage-hint">
        {dollyA && dollyB
          ? '拖动预览插值；截帧前选运镜写入镜头语言。'
          : '分别在起点/终点机位点「标记」，再 scrub 检查推拉。'}
      </p>
    </div>
  );
}
