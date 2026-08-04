import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WebGLRenderer } from 'three';
import type { Director3dHostOptions } from '../bridge/types';
import { DirectorCanvas } from '../canvas/DirectorCanvas';
import {
  normalizeDirectorProject,
  normalizeShotState,
  projectFromShotState,
  shotStateFromProject,
  type Director3dCandidate,
  type Director3dShotState,
} from '../schema/directorProject';
import { useDirectorStore } from '../store/directorStore';
import { StageHeader } from './StageHeader';
import { StageRail } from './StageRail';
import { TransformRail } from './TransformRail';
import { AspectGuide } from './AspectGuide';
import { InspectorCard } from '../panels/InspectorCard';
import { Filmstrip } from './Filmstrip';
import '../styles/stage-deck.css';
import { isWebGLAvailable } from '../util/webgl';

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function StageDeckShell({ options }: { options: Director3dHostOptions }) {
  const mode = options.performanceMode ?? 'normal';
  const nodeCount = options.nodeCount ?? 0;
  const captureFnRef = useRef<(() => string) | null>(null);
  const [capturing, setCapturing] = useState(false);
  const glRef = useRef<WebGLRenderer | null>(null);
  const savedDprRef = useRef<number>(1);
  const shotId = options.shotContext?.shotId;
  const standaloneShotId = '__standalone__';
  const [shotState, setShotState] = useState<Director3dShotState>(() =>
    options.shotState
      ? normalizeShotState(options.shotState, options.shotState.shotId, options.project)
      : shotStateFromProject(normalizeDirectorProject(options.project), standaloneShotId),
  );
  const [viewMode, setViewMode] = useState<'composition' | 'camera' | 'compare' | 'diagnostic'>('composition');
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [pendingShotId, setPendingShotId] = useState<string | null>(null);

  const activeState = shotState.shotId === (shotId ?? standaloneShotId)
    ? shotState
    : options.shotState
      ? normalizeShotState(options.shotState, options.shotState.shotId, options.project)
      : shotStateFromProject(normalizeDirectorProject(options.project), standaloneShotId);
  const currentProject = useMemo(
    () => projectFromShotState(activeState, normalizeDirectorProject(options.project)),
    [activeState, options.project],
  );
  const webglAvailable = isWebGLAvailable();
  const stateRef = useRef<Director3dShotState>(activeState);

  useEffect(() => { stateRef.current = activeState; }, [activeState]);

  const emitState = useCallback((next: Director3dShotState) => {
    const previous = stateRef.current;
    const committed = {
      ...next,
      stateVersion: next.shotId === previous.shotId ? previous.stateVersion + 1 : next.stateVersion,
    };
    stateRef.current = committed;
    setShotState(committed);
    options.onShotStateChange?.(committed);
  }, [options.onShotStateChange]);

  useEffect(() => {
    const store = useDirectorStore.getState();
    store.replaceProject(currentProject);
    if (options.crowdMax != null) store.setCrowdMax(options.crowdMax);
  }, [currentProject, options.crowdMax]);

  useEffect(() => {
    if (!options.shotState) return;
    const next = normalizeShotState(options.shotState, options.shotState.shotId, options.project);
    setShotState(next);
  }, [options.shotState, options.project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        useDirectorStore.getState().undo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        useDirectorStore.getState().deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const canvas = gl.domElement;
    const normalDpr = Math.min(window.devicePixelRatio, 1.5);

    const onVisibility = () => {
      if (document.hidden) {
        savedDprRef.current = gl.getPixelRatio();
        gl.setPixelRatio(0.1);
        canvas.style.display = 'none';
      } else {
        gl.setPixelRatio(savedDprRef.current || normalDpr);
        canvas.style.display = '';
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const flush = debounce((project: ReturnType<typeof useDirectorStore.getState>['project']) => {
      const current = useDirectorStore.getState().project;
      const next: Director3dShotState = {
        ...activeState,
        objects: structuredClone(project.objects),
        camera: {
          ...activeState.camera,
          position: structuredClone(project.cameras[0]?.transform.position ?? activeState.camera.position),
          rotation: structuredClone(project.cameras[0]?.transform.rotation ?? activeState.camera.rotation),
          target: structuredClone(project.cameras[0]?.target ?? activeState.camera.target),
          fov: project.cameras[0]?.fov ?? activeState.camera.fov,
          aspectRatio: project.viewportAspectRatio,
        },
        dirty: true,
        updatedAt: new Date().toISOString(),
      };
      emitState(next);
      options.onProjectChange?.(current);
    }, 300);
    return useDirectorStore.subscribe((state, prev) => {
      if (state.project !== prev.project) flush(state.project);
    });
  }, [activeState, emitState, options.onProjectChange]);

  const handleCapture = useCallback(async () => {
    const fn = captureFnRef.current;
    if (!fn) return;
    setCapturing(true);
    setCaptureError(null);
    requestAnimationFrame(() => {
      void (async () => {
        const dataUrl = fn();
        const project = useDirectorStore.getState().project;
        const camera = project.cameras[0];
        if (!camera) throw new Error('当前镜头没有相机');
        const captureId = `candidate-${Date.now().toString(36)}`;
        const candidate: Director3dCandidate = {
          id: captureId,
          shotId: activeState.shotId,
          stateVersion: activeState.stateVersion,
          localDataUrl: dataUrl,
          camera: {
            position: structuredClone(camera.transform.position),
            target: structuredClone(camera.target),
            rotation: structuredClone(camera.transform.rotation),
            fov: camera.fov,
            aspectRatio: project.viewportAspectRatio,
          },
          characterPlacements: project.objects
            .filter((object) => object.kind === 'character' && object.visible)
            .map((object) => ({
              objectId: object.id,
              characterId: object.sourceCharacterId,
              name: object.name,
              position: structuredClone(object.transform.position),
              rotation: structuredClone(object.transform.rotation),
              scale: structuredClone(object.transform.scale),
              bodyType: object.bodyType,
              posePresetId: object.posePresetId,
            })),
          prompt: `Camera shot, FOV ${camera.fov}, target (${camera.target.map((n) => n.toFixed(1)).join(', ')})`,
          status: 'ready',
          createdAt: new Date().toISOString(),
        };
        emitState({
          ...activeState,
          candidates: [...activeState.candidates, { ...candidate, status: 'uploading' }],
          selectedCandidateId: candidate.id,
          dirty: true,
          updatedAt: new Date().toISOString(),
        });
        try {
          const uploaded = await options.onCandidateCreated?.({
            dataUrl,
            cameraPrompt: candidate.prompt,
            cameraPosition: candidate.camera.position,
            cameraRotation: candidate.camera.rotation,
            cameraFov: candidate.camera.fov,
            captureId,
            shotId: activeState.shotId,
            stateVersion: activeState.stateVersion,
          });
          const latest = stateRef.current;
          emitState({
            ...latest,
            candidates: latest.candidates.map((item) => item.id === candidate.id
              ? { ...item, imageUrl: uploaded?.imageUrl ?? item.imageUrl, status: 'ready' }
              : item),
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          const latest = stateRef.current;
          emitState({
            ...latest,
            candidates: latest.candidates.map((item) => item.id === candidate.id
              ? { ...item, status: 'failed', error: String(error) }
              : item),
            updatedAt: new Date().toISOString(),
          });
          throw error;
        }
      })().catch((error) => setCaptureError(String(error))).finally(() => setCapturing(false));
    });
  }, [activeState, emitState, options]);

  const selectCandidate = useCallback((id: string) => {
    emitState({ ...activeState, selectedCandidateId: id, dirty: true, updatedAt: new Date().toISOString() });
  }, [activeState, emitState]);

  const commitCandidate = useCallback(async () => {
    setCommitError(null);
    const candidate = activeState.candidates.find((item) => item.id === activeState.selectedCandidateId);
    if (!candidate) { setCommitError('请先选择候选帧'); return; }
    if (!options.shotContext?.shotId) { setCommitError('独立场景不能提交到导演台'); return; }
    setWorking(true);
    try {
      await options.onCommit?.({
        version: 1,
        commitId: `commit-${Date.now().toString(36)}`,
        shotId: activeState.shotId,
        episodeId: activeState.episodeId,
        sourceShotRevision: activeState.sourceShotRevision,
        candidate,
        sceneState: activeState,
        committedAt: new Date().toISOString(),
      });
      emitState({
        ...activeState,
        committedCandidateId: candidate.id,
        candidates: activeState.candidates.map((item) => item.id === candidate.id ? { ...item, status: 'committed' } : item),
        dirty: false,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setCommitError(String(error));
    } finally {
      setWorking(false);
    }
  }, [activeState, emitState, options]);

  const requestShotChange = useCallback((nextShotId: string) => {
    if (nextShotId === activeState.shotId) return;
    if (activeState.dirty) {
      setPendingShotId(nextShotId);
      return;
    }
    options.onSelectShot?.(nextShotId);
  }, [activeState.dirty, activeState.shotId, options.onSelectShot]);

  const switchShot = useCallback((save: boolean) => {
    if (!pendingShotId) return;
    if (save) emitState({ ...activeState, dirty: false, updatedAt: new Date().toISOString() });
    const next = pendingShotId;
    setPendingShotId(null);
    options.onSelectShot?.(next);
  }, [activeState, emitState, options.onSelectShot, pendingShotId]);

  if (!webglAvailable) {
    return (
      <div className="nx9-stage nx9-stage-empty">
        <strong>无法启动 3D 导演台</strong>
        <span>当前环境不支持 WebGL，请启用浏览器硬件加速后重试。</span>
        {options.onClose && <button type="button" className="nx9-stage-cta" onClick={options.onClose}>关闭</button>}
      </div>
    );
  }

  return (
    <div className="nx9-stage">
      <div className="nx9-stage-context">
        <strong>{options.shotContext?.upstreamConnected ? '导演台' : '独立场景模式'}</strong>
        <span>{options.shotContext?.episodeLabel ?? '未连接分镜台'}</span>
        <span>{options.shotContext?.shotId ? `镜头 ${options.shotContext.shotId}` : '可保存模板，不进入彩色关键帧链'}</span>
        <span>{options.shotContext?.lineArtUrl ? '线稿已载入' : '线稿未载入'}</span>
        <span>{activeState.committedCandidateId ? '3D 构图已提交' : '3D 构图未提交'}</span>
        <div style={{ flex: 1 }} />
        {(['composition', 'camera', 'compare', 'diagnostic'] as const).map((mode) => (
          <button key={mode} type="button" className={`nx9-stage-pill${viewMode === mode ? ' is-on' : ''}`} onClick={() => setViewMode(mode)}>
            {mode === 'composition' ? '构图' : mode === 'camera' ? '镜头' : mode === 'compare' ? '对比' : '诊断'}
          </button>
        ))}
        <button type="button" className="nx9-stage-cta" disabled={working || capturing || !activeState.selectedCandidateId || !shotId} onClick={() => void commitCandidate()}>提交到导演台</button>
      </div>
      <StageHeader
        linkedShotId={options.shotContext?.shotId}
        performanceLow={mode === 'low'}
        capturing={capturing}
        onCapture={handleCapture}
        onClose={options.onClose}
        viewModeOverride={viewMode === 'camera' ? 'camera' : 'director'}
        onViewModeChange={(mode) => setViewMode(mode === 'camera' ? 'camera' : 'composition')}
      />
      {pendingShotId && (
        <div className="nx9-stage-switch-warning">
          <span>当前镜头有未保存修改，切换前请选择：</span>
          <button type="button" className="nx9-stage-mini-btn is-on" onClick={() => switchShot(true)}>保存并切换</button>
          <button type="button" className="nx9-stage-mini-btn" onClick={() => switchShot(false)}>放弃修改</button>
          <button type="button" className="nx9-stage-mini-btn" onClick={() => setPendingShotId(null)}>取消</button>
        </div>
      )}
      <div className="nx9-stage-body">
        <aside className="nx9-stage-shot-list">
          <div className="nx9-stage-drawer-head">镜头</div>
          <div className="nx9-stage-drawer-body">
            {(options.shotContext?.shots ?? []).length === 0 && <p className="nx9-stage-hint">当前为独立场景模式，可保存模板。</p>}
            {(options.shotContext?.shots ?? []).map((shot) => (
              <button key={shot.id} type="button" className={`nx9-stage-layer${activeState.shotId === shot.id ? ' is-on' : ''}`} onClick={() => requestShotChange(shot.id)}>
                <span>#{shot.index} {shot.label ?? '未命名'}</span>
                <span className="nx9-stage-chip">{shot.has3dGuide ? '已提交' : '未提交'}</span>
              </button>
            ))}
          </div>
        </aside>
        <StageRail onUploadFile={options.onUploadFile} onSaveSceneTemplate={options.onSaveSceneTemplate} />
        <div className="nx9-stage-workspace">
          <div className="nx9-stage-viewport-shell">
            <DirectorCanvas
              performanceMode={mode}
              nodeCount={nodeCount}
              viewMode={viewMode === 'camera' ? 'camera' : 'director'}
              lineArtUrl={options.shotContext?.lineArtUrl}
              compareMode={viewMode === 'compare'}
              diagnosticMode={viewMode === 'diagnostic'}
              onGLCreated={(gl) => { glRef.current = gl; }}
              onCaptureReady={(fn) => {
                captureFnRef.current = fn;
              }}
              onRendererReady={options.onRendererReady}
            />
            <TransformRail />
            <AspectGuide />
          </div>
            <Filmstrip candidates={activeState.candidates} selectedId={activeState.selectedCandidateId} onSelect={selectCandidate} />
          </div>
        <InspectorCard />
      </div>
      {(captureError || commitError) && <div className="nx9-stage-error">{captureError ?? commitError}</div>}
    </div>
  );
}
