/**
 * 3D 导演台：大师运镜库面板（增量新增）。
 *
 * 数据流（与既有「运镜时间轴交接轨」同构，两条路径都最终落到镜头态 `cameraKeys`）：
 *   词库（shared/data/camera-move-library，56 条）
 *     → `buildMotionPreview`（本包 schema/cameraMoveMotion，纯函数：计划 + 机位序列 + 关键帧）
 *     → ① 即时预演：`previewActiveCamera` 打采样机位（不入 undo 栈）/ 写入既有 A→B 运镜轨
 *       ② 「套用为关键帧」：`applyCameraMoveMotion` 写入 project.cameras（`cammv-*`，可 undo）
 *       ③ 「加入运镜时间轴」：`useMoveTimelineStore.pushTimeline` 交给既有交接轨套用 / 播放
 *     → 导演台 300ms 落盘把机位序列写进镜头态 `cameraKeys`（跨会话保留）
 *
 * 诚实边界：面板会在运镜说明下方**显式**标出代理近似（`representation: 'proxy'`），
 * 说明舞台到底生成了什么、以及哪一部分无法等价（详见 schema/cameraMoveMotion.ts）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDirectorStore } from '../store/directorStore';
import { useMoveTimelineStore } from '../store/moveTimelineStore';
import {
  buildMotionCameraPrompt,
  buildMotionPreview,
  countMotionCameras,
  motionToCameraMoveTimeline,
} from '../schema/cameraMoveMotion';
import { sampleCameraMoveTimeline } from '../schema/cameraMoveTimelineKeys';
import { buildSceneLightingPrompt } from '../presets/lightingPresets';
import { skinCameraPrompt } from '../schema/promptSkin';
import {
  CAMERA_MOVE_FAMILY_LABELS,
  CAMERA_MOVE_FAMILY_ORDER,
  searchCameraMoves,
  type CameraMoveDef,
  type CameraMoveFamily,
} from '../../../shared/src/data/camera-move-library';
import type { DirectorCameraShot } from '../schema/directorProject';

const DIFFICULTY_LABELS: Record<string, string> = {
  basic: '基础',
  advanced: '进阶',
  pro: '专业',
};

/** 家族分组（空家族不出现），保持词库定义的家族顺序。纯函数，便于单测。 */
export function groupCameraMovesByFamily(
  defs: CameraMoveDef[],
): { family: CameraMoveFamily; labelZh: string; items: CameraMoveDef[] }[] {
  const list = Array.isArray(defs) ? defs : [];
  return CAMERA_MOVE_FAMILY_ORDER
    .map((family) => ({
      family,
      labelZh: CAMERA_MOVE_FAMILY_LABELS[family],
      items: list.filter((def) => def?.family === family),
    }))
    .filter((group) => group.items.length > 0);
}

/** 面板范围推导（纯函数）：当前机位、已落盘的 cammv-* 机位数量、是否已套用本运镜。 */
export function resolveMoveLibraryScope(input: {
  cameras: DirectorCameraShot[];
  activeCameraId: string | null;
  moveId: string | null;
}): {
  activeCamera: DirectorCameraShot | null;
  persistedCount: number;
  appliedMoveId: string | null;
  applied: boolean;
} {
  const cameras = Array.isArray(input.cameras) ? input.cameras : [];
  const activeCamera = cameras.find((camera) => camera.id === input.activeCameraId) ?? cameras[0] ?? null;
  return {
    activeCamera,
    persistedCount: countMotionCameras(cameras),
    appliedMoveId: input.moveId,
    applied: Boolean(input.moveId) && countMotionCameras(cameras) > 0,
  };
}

export function CameraMoveLibraryPanel() {
  const project = useDirectorStore((s) => s.project);
  const cameraMove = useDirectorStore((s) => s.cameraMove);
  const promptPlatform = useDirectorStore((s) => s.promptPlatform);
  const promptDetails = useDirectorStore((s) => s.promptDetails);
  const appliedMoveId = useDirectorStore((s) => s.cameraMoveLibraryId);
  const setCameraMoveLibraryId = useDirectorStore((s) => s.setCameraMoveLibraryId);
  const applyCameraMoveMotion = useDirectorStore((s) => s.applyCameraMoveMotion);
  const clearCameraMoveMotion = useDirectorStore((s) => s.clearCameraMoveMotion);
  const previewActiveCamera = useDirectorStore((s) => s.previewActiveCamera);
  const setDollyKey = useDirectorStore((s) => s.setDollyKey);
  const setDollyT = useDirectorStore((s) => s.setDollyT);
  const clearDolly = useDirectorStore((s) => s.clearDolly);
  const pushTimeline = useMoveTimelineStore((s) => s.pushTimeline);

  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<CameraMoveFamily | 'all'>('all');
  const [selectedId, setSelectedId] = useState('push-slow');
  const [amplitude, setAmplitude] = useState(1);
  const [tSec, setTSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [queuedZh, setQueuedZh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** 预演基准机位快照：预演期间冻结，避免 scrub 写回的机位反过来改变预演基准 */
  const [previewBase, setPreviewBase] = useState<DirectorCameraShot | null>(null);
  const rafRef = useRef(0);
  const tRef = useRef(0);
  tRef.current = tSec;

  const results = useMemo(() => searchCameraMoves(query), [query]);
  const groups = useMemo(
    () => groupCameraMovesByFamily(family === 'all' ? results : results.filter((def) => def.family === family)),
    [results, family],
  );

  const scope = useMemo(
    () => resolveMoveLibraryScope({
      cameras: project.cameras,
      activeCameraId: project.activeCameraId ?? null,
      moveId: appliedMoveId,
    }),
    [project.cameras, project.activeCameraId, appliedMoveId],
  );
  const activeCamera = scope.activeCamera;
  const baseCamera = previewBase ?? activeCamera;

  const preview = useMemo(
    () => (baseCamera ? buildMotionPreview(selectedId, baseCamera, { amplitude }) : null),
    [selectedId, baseCamera, amplitude],
  );
  const plan = preview?.plan ?? null;
  const duration = plan?.durationSec ?? 0;

  useEffect(() => {
    setTSec(0);
    setPlaying(false);
  }, [selectedId]);

  // 播放：按真实秒数推进预演（scrub 只驱动当前机位的预览位姿，不入 undo 栈）
  useEffect(() => {
    if (!playing || !preview || duration <= 0) return;
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
  }, [playing, preview, duration]);

  const beginPreview = useCallback(() => {
    if (!previewBase && activeCamera) setPreviewBase(structuredClone(activeCamera));
  }, [previewBase, activeCamera]);

  /** scrub 到秒：写入当前机位的预览位姿（复用既有 previewActiveCamera，不入 undo 栈） */
  const scrubTo = useCallback((next: number) => {
    if (!preview) return;
    const t = Math.max(0, Math.min(duration, next));
    setTSec(t);
    const sample = sampleCameraMoveTimeline(preview.keyframes, t);
    if (!sample) return;
    previewActiveCamera({
      fov: sample.camera.fov,
      target: sample.camera.target,
      transform: sample.camera.transform,
    });
  }, [preview, duration, previewActiveCamera]);

  const resetPreview = useCallback(() => {
    setPlaying(false);
    clearDolly();
    setTSec(0);
    if (previewBase) {
      previewActiveCamera({
        fov: previewBase.fov,
        target: previewBase.target,
        transform: previewBase.transform,
      });
      setPreviewBase(null);
    }
  }, [previewBase, previewActiveCamera, clearDolly]);

  /** 「预演」写入既有 A→B 运镜轨：A = 当前机位、B = 运镜终点，交给既有 DollyTimeline scrub */
  const previewAsDolly = useCallback(() => {
    if (!preview || !preview.cameras.length) return;
    setPlaying(false);
    if (!previewBase && activeCamera) setPreviewBase(structuredClone(activeCamera));
    const start = preview.cameras[0]!;
    const end = preview.cameras[preview.cameras.length - 1]!;
    previewActiveCamera({ fov: start.fov, target: start.target, transform: start.transform });
    setDollyKey('A');
    previewActiveCamera({ fov: end.fov, target: end.target, transform: end.transform });
    setDollyKey('B');
    setDollyT(0);
    setTSec(0);
  }, [preview, previewBase, activeCamera, previewActiveCamera, setDollyKey, setDollyT]);

  const promptText = useMemo(() => {
    if (!activeCamera) return '';
    return skinCameraPrompt(
      buildMotionCameraPrompt(activeCamera, {
        moveId: appliedMoveId,
        fallbackMove: cameraMove,
        roll: activeCamera.transform.rotation[2],
        subjectYawDeg: project.objects.find((o) => o.kind === 'character' && o.visible)?.transform.rotation[1] ?? 0,
        details: promptDetails,
        lightingPrompt: buildSceneLightingPrompt(project.scene),
      }),
      promptPlatform,
      cameraMove,
    );
  }, [activeCamera, appliedMoveId, cameraMove, promptDetails, promptPlatform, project.scene, project.objects]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="nx9-stage-drawer nx9-stage-move-lib">
      <div className="nx9-stage-drawer-head">
        大师运镜库
        <span className="nx9-stage-chip">{scope.persistedCount > 0 ? `${scope.persistedCount} 关键帧机位` : '未套用'}</span>
        <button
          type="button"
          className="nx9-stage-mini-btn nx9-stage-mobile-only"
          onClick={() => {
            const store = useDirectorStore.getState();
            store.setActiveDrawer(null);
            store.setMobileSheet(null);
          }}
        >
          关闭
        </button>
      </div>
      <div className="nx9-stage-drawer-body">
        <label className="nx9-stage-field">
          搜索
          <input
            type="search"
            value={query}
            placeholder="推镜 / orbit / 手持…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <div className="nx9-stage-move-families" role="group" aria-label="运镜家族">
          <button
            type="button"
            className={`nx9-stage-pill${family === 'all' ? ' is-on' : ''}`}
            onClick={() => setFamily('all')}
          >
            全部 {results.length}
          </button>
          {CAMERA_MOVE_FAMILY_ORDER.map((id) => {
            const count = results.filter((def) => def.family === id).length;
            if (count === 0) return null;
            return (
              <button
                key={id}
                type="button"
                className={`nx9-stage-pill${family === id ? ' is-on' : ''}`}
                onClick={() => setFamily(family === id ? 'all' : id)}
              >
                {CAMERA_MOVE_FAMILY_LABELS[id]} {count}
              </button>
            );
          })}
        </div>

        <div className="nx9-stage-move-list">
          {groups.map((group) => (
            <div key={group.family} className="nx9-stage-move-group">
              <div className="nx9-stage-move-family">{group.labelZh}</div>
              {group.items.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  className={`nx9-stage-layer nx9-stage-move-item${selectedId === def.id ? ' is-on' : ''}`}
                  title={def.descZh}
                  onClick={() => setSelectedId(def.id)}
                >
                  <span>{def.labelZh}</span>
                  {appliedMoveId === def.id && <span className="nx9-stage-chip is-on">已套用</span>}
                  {def.difficulty && <span className="nx9-stage-chip">{DIFFICULTY_LABELS[def.difficulty] ?? def.difficulty}</span>}
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && <p className="nx9-stage-hint">没有匹配的运镜，换个关键词（支持中文名 / 英文名 / 标签 / 说明）。</p>}
        </div>

        {plan && (
          <div className="nx9-stage-move-plan">
            <div className="nx9-stage-move-plan-head">
              <strong>{plan.labelZh}</strong>
              {plan.labelEn && <span className="nx9-stage-chip">{plan.labelEn}</span>}
              <span className="nx9-stage-chip">{plan.familyLabelZh}</span>
            </div>
            <p className="nx9-stage-hint">{plan.descZh}</p>
            <p className="nx9-stage-hint">
              建议景别 {plan.shotSizes.length > 0 ? plan.shotSizes.join(' / ') : '不限'}
              {' · '}时长 {plan.durationHintSec[0]}–{plan.durationHintSec[1]}s
              {plan.difficulty ? ` · 难度 ${DIFFICULTY_LABELS[plan.difficulty] ?? plan.difficulty}` : ''}
            </p>
            <p className="nx9-stage-hint">{plan.summaryZh}</p>
            {plan.representation === 'proxy' && (
              <p className="nx9-stage-move-proxy">代理近似：{plan.proxyNoteZh}</p>
            )}
            {plan.representation === 'native' && (
              <p className="nx9-stage-hint">该运镜可用现有自由度（球坐标 / 视线 / 平移 / 视野 / 滚转）直接表达，无需近似。</p>
            )}
          </div>
        )}

        <label className="nx9-stage-field">
          幅度 {amplitude.toFixed(2)}×
          <input
            type="range"
            min={25}
            max={300}
            value={Math.round(amplitude * 100)}
            onChange={(e) => setAmplitude(Number(e.target.value) / 100)}
          />
        </label>

        <div className="nx9-stage-dolly-actions">
          <button
            type="button"
            className="nx9-stage-mini-btn"
            disabled={!preview}
            onClick={previewAsDolly}
            title="写入既有 A→B 运镜轨：A = 当前机位、B = 运镜终点"
          >
            预演 A→B 轨
          </button>
          <button
            type="button"
            className={`nx9-stage-mini-btn${playing ? ' is-on' : ''}`}
            disabled={!preview}
            onClick={() => {
              beginPreview();
              if (tSec >= duration) scrubTo(0);
              setPlaying(!playing);
            }}
          >
            {playing ? '暂停' : '播放预演'}
          </button>
          <button type="button" className="nx9-stage-mini-btn" disabled={!preview} onClick={() => scrubTo(0)}>
            回起点
          </button>
          <button
            type="button"
            className="nx9-stage-mini-btn"
            disabled={!previewBase}
            onClick={resetPreview}
            title="恢复预演前的机位，并清空 A→B 轨"
          >
            复位
          </button>
        </div>

        <label className="nx9-stage-field">
          {`${tSec.toFixed(2)}s / ${duration.toFixed(1)}s`}
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(duration * 100))}
            value={Math.round(tSec * 100)}
            disabled={!preview}
            onChange={(e) => {
              setPlaying(false);
              beginPreview();
              scrubTo(Number(e.target.value) / 100);
            }}
          />
        </label>

        <div className="nx9-stage-dolly-actions">
          <button
            type="button"
            className="nx9-stage-mini-btn is-on"
            disabled={!preview || !plan?.found}
            onClick={() => {
              if (!preview) return;
              setPlaying(false);
              // 套用：替换上一批 cammv-* 机位，并入运镜短语（下一次截帧 / 提交写进 cameraPrompt）
              applyCameraMoveMotion(preview.cameras, selectedId);
            }}
            title="把该运镜生成的机位序列写进本镜（可撤销），并写入镜头语言"
          >
            {scope.applied && appliedMoveId === selectedId ? '按当前机位重套' : '套用为关键帧'}
          </button>
          <button
            type="button"
            className="nx9-stage-mini-btn"
            disabled={scope.persistedCount === 0 && !appliedMoveId}
            onClick={clearCameraMoveMotion}
            title="移除本镜由运镜库生成的 cammv-* 机位，并清除镜头语言里的运镜"
          >
            移除关键帧
          </button>
          <button
            type="button"
            className="nx9-stage-mini-btn"
            disabled={!plan?.found}
            onClick={() => {
              const timeline = motionToCameraMoveTimeline(selectedId, { amplitude });
              if (!timeline || !plan) return;
              pushTimeline(timeline, `大师运镜库 · ${plan.labelZh}`);
              setQueuedZh(plan.labelZh);
            }}
            title="交给下方「运镜时间轴」轨：可套用为关键帧、按秒 scrub 与播放"
          >
            加入运镜时间轴
          </button>
        </div>

        <div className="nx9-stage-dolly-actions">
          <button
            type="button"
            className={`nx9-stage-mini-btn${appliedMoveId === selectedId ? ' is-on' : ''}`}
            disabled={!plan?.found}
            onClick={() => setCameraMoveLibraryId(appliedMoveId === selectedId ? null : selectedId)}
            title="只把运镜短语并入镜头语言提示词（不动机位）"
          >
            {appliedMoveId === selectedId ? '清除镜头语言' : '写入镜头语言'}
          </button>
          <button type="button" className="nx9-stage-mini-btn" disabled={!promptText} onClick={() => void copyPrompt()}>
            {copied ? '已复制' : '复制提示词'}
          </button>
        </div>

        <div className="nx9-stage-prompt-box" title="下一次截帧 / 提交写入 cameraPrompt 的镜头语言">
          {promptText}
        </div>

        {queuedZh && (
          <p className="nx9-stage-hint">
            已把「{queuedZh}」交接给运镜时间轴：在下方「运镜时间轴」点「套用为关键帧」后即可按秒 scrub / 播放。
          </p>
        )}
        <p className="nx9-stage-hint">
          {plan
            ? `套用会写入 ${plan.frames} 个 cammv-* 关键帧机位（追加在机位列表末尾，可 undo / 可整体移除），随镜头保存跨会话保留。`
            : '先选一条运镜。'}
          预演只驱动当前机位的预览位姿，不入 undo 栈。
        </p>
      </div>
    </div>
  );
}
