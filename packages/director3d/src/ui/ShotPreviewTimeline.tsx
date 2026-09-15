import { useEffect, useMemo, useRef } from 'react';
import type { DirectorCameraShot } from '../schema/directorProject';
import { interpolateCamera } from '../schema/cameraGeometry';
import { useDirectorStore } from '../store/directorStore';

function captureToShot(base: DirectorCameraShot, capture: DirectorCameraShot['captures'][number]): DirectorCameraShot {
  const position = capture.cameraPosition ?? base.transform.position;
  const target = capture.cameraTarget ?? base.target;
  const rotation = capture.cameraRotation ?? base.transform.rotation;
  return {
    ...base,
    id: capture.id,
    name: capture.name,
    fov: capture.cameraFov ?? base.fov,
    target: [...target] as [number, number, number],
    transform: {
      ...base.transform,
      position: [...position] as [number, number, number],
      rotation: [...rotation] as [number, number, number],
    },
  };
}

/** Build scrubbable keyframes: multi-cam first, else capture poses (need ≥2). */
export function buildTimelineKeys(cameras: DirectorCameraShot[], activeId: string | null): DirectorCameraShot[] {
  if (cameras.length >= 2) return cameras.map((c) => structuredClone(c));
  const active = cameras.find((c) => c.id === activeId) ?? cameras[0];
  if (!active) return [];
  const fromCaptures = active.captures
    .filter((c) => Array.isArray(c.cameraPosition) && c.cameraPosition.length === 3)
    .map((c) => captureToShot(active, c));
  return fromCaptures;
}

export function sampleTimeline(keys: DirectorCameraShot[], tRaw: number): DirectorCameraShot | null {
  if (keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  const t = Math.min(1, Math.max(0, tRaw));
  const span = keys.length - 1;
  const f = t * span;
  const i = Math.min(span - 1, Math.floor(f));
  const local = f - i;
  return interpolateCamera(keys[i], keys[i + 1], local);
}

export function ShotPreviewTimeline() {
  const project = useDirectorStore((s) => s.project);
  const timelineT = useDirectorStore((s) => s.timelineT);
  const timelinePlaying = useDirectorStore((s) => s.timelinePlaying);
  const setTimelineT = useDirectorStore((s) => s.setTimelineT);
  const setTimelinePlaying = useDirectorStore((s) => s.setTimelinePlaying);
  const previewActiveCamera = useDirectorStore((s) => s.previewActiveCamera);
  const activeId = project.activeCameraId ?? project.cameras[0]?.id ?? null;

  const sourceSig = useMemo(() => {
    if (project.cameras.length >= 2) {
      return `cams:${project.cameras.map((c) => c.id).join(',')}`;
    }
    const active = project.cameras.find((c) => c.id === activeId) ?? project.cameras[0];
    return `caps:${active?.id ?? ''}:${(active?.captures ?? []).map((c) => c.id).join(',')}`;
  }, [project.cameras, activeId]);

  const frozenRef = useRef<DirectorCameraShot[]>([]);
  const lastSigRef = useRef('');

  const ensureFrozen = () => {
    if (lastSigRef.current === sourceSig && frozenRef.current.length >= 2) return frozenRef.current;
    frozenRef.current = buildTimelineKeys(project.cameras, activeId);
    lastSigRef.current = sourceSig;
    return frozenRef.current;
  };

  const keyCount = useMemo(() => {
    const keys = buildTimelineKeys(project.cameras, activeId);
    return keys.length;
  }, [sourceSig, project.cameras, activeId]);

  const canPlay = keyCount >= 2;

  useEffect(() => {
    if (!canPlay) return;
    const keys = ensureFrozen();
    if (keys.length < 2) return;
    const mixed = sampleTimeline(keys, timelineT);
    if (!mixed) return;
    previewActiveCamera({
      fov: mixed.fov,
      target: mixed.target,
      transform: mixed.transform,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- freeze keys on sig; scrub only applies preview
  }, [timelineT, canPlay, sourceSig, previewActiveCamera]);

  useEffect(() => {
    if (!timelinePlaying || !canPlay) return;
    ensureFrozen();
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const cur = useDirectorStore.getState().timelineT;
      const next = cur + dt / 4;
      if (next >= 1) {
        setTimelineT(1);
        setTimelinePlaying(false);
        return;
      }
      setTimelineT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelinePlaying, canPlay, setTimelineT, setTimelinePlaying]);

  return (
    <div className="nx9-stage-dolly nx9-stage-timeline">
      <div className="nx9-stage-dolly-head">多镜预览轨</div>
      <div className="nx9-stage-dolly-actions">
        <button
          type="button"
          className={`nx9-stage-mini-btn${timelinePlaying ? ' is-on' : ''}`}
          disabled={!canPlay}
          onClick={() => {
            ensureFrozen();
            if (timelineT >= 1) setTimelineT(0);
            setTimelinePlaying(!timelinePlaying);
          }}
        >
          {timelinePlaying ? '暂停' : '播放'}
        </button>
        <button
          type="button"
          className="nx9-stage-mini-btn"
          disabled={!canPlay}
          onClick={() => {
            setTimelinePlaying(false);
            setTimelineT(0);
            lastSigRef.current = '';
            ensureFrozen();
          }}
        >
          复位
        </button>
        <span className="nx9-stage-chip">{keyCount} 关键</span>
      </div>
      <label className="nx9-stage-field">
        预览 {Math.round(timelineT * 100)}%
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(timelineT * 100)}
          disabled={!canPlay}
          onChange={(e) => {
            ensureFrozen();
            setTimelinePlaying(false);
            setTimelineT(Number(e.target.value) / 100);
          }}
        />
      </label>
      <p className="nx9-stage-hint">
        {canPlay
          ? project.cameras.length >= 2
            ? '在多台摄像机之间插值 scrub / 播放。'
            : '在截帧机位之间插值预览。'
          : '添加第二台摄像机，或截两帧以上，即可 scrub 回放。'}
      </p>
    </div>
  );
}
