/**
 * 3D 导演台：运镜时间轴交接轨（增量新增）。
 *
 * 与既有 `DollyTimeline`（A→B 两键）与 `ShotPreviewTimeline`（多镜 scrub）并列：
 * 本轨负责把工作台交接过来的 `CameraMoveTimeline` 变成**多段 A→B 关键帧机位**，
 * 并按「时间」而不是「镜头序号」scrub 预览（含 easing / 速度曲线）。
 *
 * 数据流：
 *   useMoveTimelineStore.timeline（工作台交接）
 *     → buildCameraMoveKeyframes（本包 schema/cameraMoveTimelineKeys，纯函数）
 *     → directorStore.applyMoveTimelineKeys（写入 project.cameras，可 undo）
 *     → sampleCameraMoveTimeline + previewActiveCamera（scrub 预览，不入 undo 栈）
 *     → 导演台 300ms 落盘把机位序列写进镜头态 cameraKeys（跨会话保留）
 *
 * 「已套用」以 **project.cameras 里是否存在 `movetl-*` 机位**为准（落盘后的真实状态），
 * 而不是会话里的 applied 标记，于是重新打开同一镜头时本轨仍能回显并移除已落盘的关键帧。
 * 按时间 scrub / 播放需要「时间轴 + 真实秒数」，属会话级：会话里没有对应时间轴时明确提示，
 * 不伪造时间。
 *
 * 诚实说明：导演台相机模型只有球坐标 + fov + roll，运镜→机位的映射是**代理映射**，
 * 用于预览机位走向与节奏，不等价于成片效果（详见 schema/cameraMoveTimelineKeys.ts）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDirectorStore } from '../store/directorStore';
import { useMoveTimelineStore } from '../store/moveTimelineStore';
import {
  MOVE_TIMELINE_CAMERA_PREFIX,
  buildCameraMoveKeyframes,
  moveTimelineToDirectorCameras,
  sampleCameraMoveTimeline,
} from '../schema/cameraMoveTimelineKeys';
import { normalizeMoveTimeline } from '../../../shared/src/utils/camera-move-timeline';
import { lookupCameraMove } from '../../../shared/src/data/camera-move-library';
import type { CameraMoveKeyframe } from '../schema/cameraMoveTimelineKeys';
import type { DirectorProject } from '../schema/directorProject';

export interface MoveTimelineRailState {
  /** 落盘态关键帧机位数量（project.cameras 里的 movetl-*） */
  persistedCount: number;
  /** 本镜是否已有落盘的关键帧机位 */
  applied: boolean;
  /** 能否按真实秒 scrub / 播放（需要「本会话对**本镜**套用过 + 时间轴还在」） */
  scrubbable: boolean;
}

/**
 * 由「落盘态 + 会话态」推导本轨的可用状态（纯函数，便于单测）。
 *
 * - `applied` 只看落盘：重新打开同一镜头后仍能回显并移除已保存的关键帧；
 * - `scrubbable` 还要求会话里那批关键帧属于**当前镜头**，否则会出现
 *   「用 A 镜的时间轴 scrub B 镜」——会话中转站不随切镜清空，必须显式对账；
 * - 时间轴时长未知（`durationSec <= 0`，如刷新后只剩落盘机位）时不假装能按秒 scrub。
 */
export function resolveMoveTimelineRailState(input: {
  project: DirectorProject;
  sessionKeys: CameraMoveKeyframe[];
  appliedShotId: string | null;
  shotId?: string;
  durationSec: number;
}): MoveTimelineRailState {
  const persistedCount = input.project.cameras
    .filter((camera) => camera.id.startsWith(MOVE_TIMELINE_CAMERA_PREFIX))
    .length;
  const applied = persistedCount > 0;
  const belongsToShot = (input.appliedShotId ?? null) === (input.shotId ?? null);
  return {
    persistedCount,
    applied,
    scrubbable: applied && belongsToShot && input.sessionKeys.length > 0 && input.durationSec > 0,
  };
}

export function CameraMoveTimelineRail({ shotId }: { shotId?: string }) {
  const timeline = useMoveTimelineStore((s) => s.timeline);
  const sourceLabel = useMoveTimelineStore((s) => s.sourceLabel);
  const keys = useMoveTimelineStore((s) => s.keys);
  const appliedShotId = useMoveTimelineStore((s) => s.appliedShotId);
  const setKeys = useMoveTimelineStore((s) => s.setKeys);
  const clearTimeline = useMoveTimelineStore((s) => s.clearTimeline);

  const project = useDirectorStore((s) => s.project);
  const applyMoveTimelineKeys = useDirectorStore((s) => s.applyMoveTimelineKeys);
  const clearMoveTimelineKeys = useDirectorStore((s) => s.clearMoveTimelineKeys);
  const previewActiveCamera = useDirectorStore((s) => s.previewActiveCamera);

  const [tSec, setTSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef(0);
  const tRef = useRef(0);
  tRef.current = tSec;

  const norm = useMemo(() => normalizeMoveTimeline(timeline), [timeline]);
  const duration = norm.durationSec;
  const hasTimeline = norm.segments.length > 0;
  const activeId = project.activeCameraId ?? project.cameras[0]?.id ?? null;

  /** 落盘态：project.cameras 里由运镜时间轴生成的机位（跨会话保留的那一份）。 */
  const { persistedCount, applied, scrubbable } = useMemo(
    () => resolveMoveTimelineRailState({
      project,
      sessionKeys: keys,
      appliedShotId,
      shotId,
      durationSec: duration,
    }),
    [project, keys, appliedShotId, shotId, duration],
  );

  useEffect(() => {
    setTSec(0);
    setPlaying(false);
  }, [timeline]);

  // scrub / 播放：把采样到的机位打到当前机位预览（不入 undo 栈）
  useEffect(() => {
    if (!scrubbable) return;
    const sample = sampleCameraMoveTimeline(keys, tSec);
    if (!sample) return;
    previewActiveCamera({
      fov: sample.camera.fov,
      target: sample.camera.target,
      transform: sample.camera.transform,
    });
  }, [scrubbable, keys, tSec, previewActiveCamera]);

  useEffect(() => {
    if (!playing || !scrubbable) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = tRef.current + dt;
      if (next >= duration) {
        setTSec(duration);
        setPlaying(false);
        return;
      }
      setTSec(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, scrubbable, duration]);

  const handleApply = useCallback(() => {
    if (norm.segments.length === 0) return;
    const base = project.cameras.find((c) => c.id === activeId) ?? project.cameras[0];
    if (!base) return;
    const nextKeys = buildCameraMoveKeyframes(norm, base);
    const cameras = moveTimelineToDirectorCameras(norm, base);
    applyMoveTimelineKeys(cameras);
    setKeys(nextKeys, true, shotId ?? null);
    setTSec(0);
  }, [norm, project.cameras, activeId, applyMoveTimelineKeys, setKeys, shotId]);

  const handleClearKeys = useCallback(() => {
    // 清 project.cameras 里的 movetl-* → 落盘订阅随即把 cameraKeys 一起清掉
    clearMoveTimelineKeys();
    setKeys([], false, null);
    setPlaying(false);
    setTSec(0);
  }, [clearMoveTimelineKeys, setKeys]);

  const sample = scrubbable ? sampleCameraMoveTimeline(keys, tSec) : null;
  const currentLabel = sample?.moveId
    ? (lookupCameraMove(sample.moveId)?.labelZh ?? sample.moveId)
    : sample
      ? '持稳'
      : null;

  if (!hasTimeline && !applied) {
    return (
      <div className="nx9-stage-dolly nx9-stage-movetl">
        <div className="nx9-stage-dolly-head">运镜时间轴</div>
        <p className="nx9-stage-hint">
          还没有交接运镜时间轴。在视频 / 图片工作台或分镜镜编辑里打开「运镜时间轴」，
          排好片段后点「交接 3D 导演台」。
        </p>
      </div>
    );
  }

  return (
    <div className="nx9-stage-dolly nx9-stage-movetl">
      <div className="nx9-stage-dolly-head">
        运镜时间轴
        {hasTimeline && (
          <span className="nx9-stage-chip">
            {norm.segments.length} 段 · {duration.toFixed(1)}s
            {norm.beatAligned ? ' · 节拍' : ''}
          </span>
        )}
      </div>

      {sourceLabel && <p className="nx9-stage-hint">来源：{sourceLabel}</p>}
      <div className="nx9-stage-dolly-actions">
        <button
          type="button"
          className={`nx9-stage-mini-btn${applied ? ' is-on' : ''}`}
          disabled={!activeId || !hasTimeline}
          onClick={handleApply}
          title="按当前机位为基准，把每段运镜转成 A→B 关键帧机位"
        >
          {applied ? '按当前机位重套' : '套用为关键帧'}
        </button>
        <button
          type="button"
          className="nx9-stage-mini-btn"
          disabled={!scrubbable}
          onClick={() => {
            setPlaying(false);
            setTSec(0);
            const s = sampleCameraMoveTimeline(keys, 0);
            if (s) previewActiveCamera({ fov: s.camera.fov, target: s.camera.target, transform: s.camera.transform });
          }}
        >
          复位
        </button>
        <button
          type="button"
          className="nx9-stage-mini-btn"
          disabled={!applied}
          onClick={handleClearKeys}
          title="移除写入的 movetl-* 关键帧机位（本镜头已保存的关键帧也会一起清除）"
        >
          移除关键帧
        </button>
        <button
          type="button"
          className="nx9-stage-mini-btn"
          disabled={!hasTimeline}
          onClick={() => {
            setPlaying(false);
            clearTimeline();
          }}
          title="清除本次交接的时间轴（已写入的机位请用「移除关键帧」）"
        >
          清除时间轴
        </button>
      </div>

      {hasTimeline && (
        <div className="nx9-stage-movetl-strip" role="img" aria-label="运镜时间轴片段条">
          {norm.segments.map((seg) => {
            const left = duration > 0 ? (seg.startT / duration) * 100 : 0;
            const width = duration > 0 ? ((seg.endT - seg.startT) / duration) * 100 : 0;
            const amp = seg.amplitude ?? 1;
            const label = lookupCameraMove(seg.moveId)?.labelZh ?? seg.moveId;
            return (
              <span
                key={seg.id}
                className={`nx9-stage-movetl-seg${sample?.segmentId === seg.id ? ' is-on' : ''}`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  opacity: Math.max(0.35, Math.min(1, 0.45 + amp / 4)),
                }}
                title={`${label} ${seg.startT.toFixed(2)}–${seg.endT.toFixed(2)}s · 幅度 ${amp}`}
              />
            );
          })}
          <span
            className="nx9-stage-movetl-cursor"
            style={{ left: `${duration > 0 ? Math.min(100, (tSec / duration) * 100) : 0}%` }}
          />
        </div>
      )}

      <label className="nx9-stage-field">
        {scrubbable
          ? `${tSec.toFixed(2)}s / ${duration.toFixed(1)}s${currentLabel ? ` · ${currentLabel}` : ''}`
          : applied
            ? '已落盘的关键帧机位：本会话没有对应时间轴，按时间 scrub 不可用'
            : '先「套用为关键帧」再 scrub 预览'}
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(duration * 100))}
          value={Math.round(tSec * 100)}
          disabled={!scrubbable}
          onChange={(e) => {
            setPlaying(false);
            setTSec(Number(e.target.value) / 100);
          }}
        />
      </label>

      <div className="nx9-stage-dolly-actions">
        <button
          type="button"
          className={`nx9-stage-mini-btn${playing ? ' is-on' : ''}`}
          disabled={!scrubbable}
          onClick={() => {
            if (tSec >= duration) setTSec(0);
            setPlaying(!playing);
          }}
        >
          {playing ? '暂停' : '播放'}
        </button>
        <button
          type="button"
          className="nx9-stage-mini-btn"
          disabled={!scrubbable}
          onClick={() => {
            setPlaying(false);
            setTSec(0);
          }}
        >
          回到起点
        </button>
        <span className="nx9-stage-chip">
          {applied ? `${persistedCount} 关键帧机位${scrubbable ? ' · 可 scrub' : ''}` : '未套用'}
        </span>
      </div>

      <p className="nx9-stage-hint">
        {scrubbable
          ? '已写入多段关键帧机位（追加在机位列表末尾，可 undo 撤销），并随镜头保存跨会话保留。scrub 只驱动当前机位的预览位姿（不入 undo 栈），不会改动其它关键帧机位。'
          : applied
            ? '这些关键帧机位已随镜头保存（重新打开会自动还原）；要按时间 scrub / 播放，请在工作台重新「交接 3D 导演台」再重套。'
            : '运镜→机位是代理映射：只保证机位走向与节奏，跟焦/时间切片等不做等价还原。'}
      </p>
    </div>
  );
}
