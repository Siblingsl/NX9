import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WebGLRenderer } from 'three';
import type { Director3dHostOptions } from '../bridge/types';
import { DirectorCanvas } from '../canvas/DirectorCanvas';
import {
  normalizeDirectorProject,
  normalizeShotState,
  projectFromShotState,
  restoreCommittedSnapshot,
  applyCandidateUploadResult,
  shotStateFromProject,
  type Director3dCandidate,
  type Director3dShotState,
} from '../schema/directorProject';
import { useDirectorStore } from '../store/directorStore';
import { StageHeader } from './StageHeader';
import { CameraPresetBar } from './CameraPresetBar';
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
  const [viewedCandidateId, setViewedCandidateId] = useState<string | null>(
    shotState.selectedCandidateId ?? null,
  );
  const [glEpoch, setGlEpoch] = useState(0);

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
    setViewedCandidateId(next.selectedCandidateId ?? next.candidates.at(-1)?.id ?? null);
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
  }, [glEpoch]);

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
          name: `候选 ${activeState.candidates.length + 1}`,
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
          dirty: true,
          updatedAt: new Date().toISOString(),
        });
        setViewedCandidateId(candidate.id);
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
          const skipUpload = !options.onCandidateCreated;
          emitState(applyCandidateUploadResult(latest, {
            candidateId: candidate.id,
            expectedShotId: candidate.shotId,
            imageUrl: uploaded?.imageUrl,
            allowReadyWithoutUrl: skipUpload,
            error: skipUpload || uploaded?.imageUrl
              ? undefined
              : '候选帧未获得持久化图片 URL',
          }));
        } catch (error) {
          emitState(applyCandidateUploadResult(stateRef.current, {
            candidateId: candidate.id,
            expectedShotId: candidate.shotId,
            error: String(error),
          }));
          throw error;
        }
      })().catch((error) => setCaptureError(String(error))).finally(() => setCapturing(false));
    });
  }, [activeState, emitState, options]);

  const viewCandidate = useCallback((id: string) => {
    setViewedCandidateId(id);
  }, []);

  const adoptCandidate = useCallback((id: string) => {
    const candidate = stateRef.current.candidates.find((item) => item.id === id);
    if (!candidate || (candidate.status !== 'ready' && candidate.status !== 'committed')) return;
    const latest = stateRef.current;
    emitState({
      ...latest,
      selectedCandidateId: id,
      dirty: true,
      updatedAt: new Date().toISOString(),
    });
    setViewedCandidateId(id);
  }, [emitState]);

  const retryCandidate = useCallback(async (id: string) => {
    const candidate = stateRef.current.candidates.find((item) => item.id === id);
    if (!candidate?.localDataUrl || !options.onCandidateCreated) return;
    const latest = stateRef.current;
    emitState({
      ...latest,
      candidates: latest.candidates.map((item) => item.id === id
        ? { ...item, status: 'uploading', error: undefined }
        : item),
      updatedAt: new Date().toISOString(),
    });
    try {
      const uploaded = await options.onCandidateCreated({
        dataUrl: candidate.localDataUrl,
        cameraPrompt: candidate.prompt,
        cameraPosition: candidate.camera.position,
        cameraRotation: candidate.camera.rotation,
        cameraFov: candidate.camera.fov,
        captureId: candidate.id,
        shotId: candidate.shotId,
        stateVersion: candidate.stateVersion,
      });
      if (!uploaded?.imageUrl) throw new Error('候选帧未获得持久化图片 URL');
      emitState(applyCandidateUploadResult(stateRef.current, {
        candidateId: id,
        expectedShotId: candidate.shotId,
        imageUrl: uploaded.imageUrl,
      }));
    } catch (error) {
      emitState(applyCandidateUploadResult(stateRef.current, {
        candidateId: id,
        expectedShotId: candidate.shotId,
        error: String(error),
      }));
    }
  }, [emitState, options]);

  const deleteCandidate = useCallback((id: string) => {
    const latest = stateRef.current;
    const candidate = latest.candidates.find((item) => item.id === id);
    if (!candidate || candidate.status === 'committed') return;
    emitState({
      ...latest,
      candidates: latest.candidates.filter((item) => item.id !== id),
      selectedCandidateId: latest.selectedCandidateId === id ? null : latest.selectedCandidateId,
      dirty: true,
      updatedAt: new Date().toISOString(),
    });
    setViewedCandidateId((current) => current === id ? null : current);
  }, [emitState]);

  const renameCandidate = useCallback((id: string, name: string) => {
    const latest = stateRef.current;
    emitState({
      ...latest,
      candidates: latest.candidates.map((item) => item.id === id ? { ...item, name } : item),
      dirty: true,
      updatedAt: new Date().toISOString(),
    });
  }, [emitState]);

  const commitCandidate = useCallback(async () => {
    setCommitError(null);
    const candidate = activeState.candidates.find((item) => item.id === activeState.selectedCandidateId);
    if (!candidate) { setCommitError('请先选择候选帧'); return; }
    if (candidate.status === 'failed') { setCommitError('候选帧上传失败，请重新记录后再提交'); return; }
    if (candidate.status !== 'ready' && candidate.status !== 'committed') {
      setCommitError('候选帧尚未完成上传');
      return;
    }
    const imageUrl = candidate.imageUrl?.trim();
    if (!imageUrl || imageUrl.startsWith('data:')) {
      setCommitError('采用帧缺少持久化图片，禁止提交本地草稿');
      return;
    }
    if (!options.shotContext?.shotId) { setCommitError('独立场景不能提交到导演台'); return; }
    setWorking(true);
    try {
      const committedAt = new Date().toISOString();
      const commitId =
        candidate.commitId && activeState.committedCandidateId === candidate.id
          ? candidate.commitId
          : `commit-${Date.now().toString(36)}`;
      const committedCandidate = {
        ...candidate,
        status: 'committed' as const,
        commitId,
        committedAt,
      };
      await options.onCommit?.({
        version: 1,
        commitId,
        shotId: activeState.shotId,
        episodeId: activeState.episodeId,
        sourceShotRevision: activeState.sourceShotRevision,
        candidate: committedCandidate,
        sceneState: {
          ...activeState,
          committedCandidateId: candidate.id,
          candidates: activeState.candidates.map((item) =>
            item.id === candidate.id ? committedCandidate : item,
          ),
        },
        committedAt,
      });
      emitState({
        ...activeState,
        committedCandidateId: candidate.id,
        committedSnapshot: {
          stateVersion: activeState.stateVersion,
          candidateId: candidate.id,
          environment: structuredClone(activeState.environment),
          objects: structuredClone(activeState.objects),
          camera: structuredClone(activeState.camera),
          committedAt,
        },
        candidates: activeState.candidates.map((item) =>
          item.id === candidate.id ? committedCandidate : item,
        ),
        dirty: false,
        updatedAt: committedAt,
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

  const switchShot = useCallback((mode: 'keep-draft' | 'restore-committed') => {
    if (!pendingShotId) return;
    if (mode === 'restore-committed') {
      const restored = restoreCommittedSnapshot(activeState);
      if (restored) emitState(restored);
      else emitState({ ...activeState, dirty: false, updatedAt: new Date().toISOString() });
    } else {
      emitState({ ...activeState, dirty: false, updatedAt: new Date().toISOString() });
    }
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

  const selectedCandidate = activeState.candidates.find((item) => item.id === activeState.selectedCandidateId);
  const canCommitSelected = Boolean(
    shotId
    && selectedCandidate
    && (selectedCandidate.status === 'ready' || selectedCandidate.status === 'committed')
    && selectedCandidate.imageUrl?.trim()
    && !selectedCandidate.imageUrl.trim().startsWith('data:'),
  );

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
        <button type="button" className="nx9-stage-cta" disabled={working || capturing || !canCommitSelected} onClick={() => void commitCandidate()}>提交到导演台</button>
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
      <CameraPresetBar />
      {options.shotContext?.sourceStale && (
        <div className="nx9-stage-switch-warning">
          <span>上游镜头内容已变化，提交前请重新对齐当前镜头版本。</span>
          <button type="button" className="nx9-stage-mini-btn is-on" onClick={() => options.onReloadSource?.()}>重新对齐上游版本</button>
        </div>
      )}
      {pendingShotId && (
        <div className="nx9-stage-switch-warning">
          <span>当前镜头草稿已自动保存，切换前请确认：</span>
          <button type="button" className="nx9-stage-mini-btn is-on" onClick={() => switchShot('keep-draft')}>保留草稿并切换</button>
          <button
            type="button"
            className="nx9-stage-mini-btn"
            disabled={!activeState.committedSnapshot}
            title={activeState.committedSnapshot ? '丢弃未提交改动，恢复最近一次提交的场景' : '尚无已提交版本'}
            onClick={() => switchShot('restore-committed')}
          >
            恢复已提交版本并切换
          </button>
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
        <StageRail
          onUploadFile={options.onUploadFile}
          onSaveSceneTemplate={options.onSaveSceneTemplate}
          sceneTemplates={options.sceneTemplates}
          onApplySceneTemplate={options.onApplySceneTemplate}
        />
        <div className="nx9-stage-workspace">
          <div className="nx9-stage-viewport-shell">
            <DirectorCanvas
              performanceMode={mode}
              nodeCount={nodeCount}
              viewMode={viewMode === 'camera' ? 'camera' : 'director'}
              lineArtUrl={options.shotContext?.lineArtUrl}
              compareMode={viewMode === 'compare'}
              diagnosticMode={viewMode === 'diagnostic'}
              onGLCreated={(gl) => {
                glRef.current = gl;
                setGlEpoch((n) => n + 1);
              }}
              onContextLost={() => {
                setCaptureError('WebGL 上下文丢失。请关闭后重新打开 3D 舞台再继续切镜。');
              }}
              onCaptureReady={(fn) => {
                captureFnRef.current = fn;
              }}
              onRendererReady={options.onRendererReady}
            />
            <TransformRail />
            <AspectGuide />
          </div>
            <Filmstrip
              candidates={activeState.candidates}
              viewedId={viewedCandidateId}
              adoptedId={activeState.selectedCandidateId}
              onView={viewCandidate}
              onAdopt={adoptCandidate}
              onRetry={(id) => void retryCandidate(id)}
              onDelete={deleteCandidate}
              onRename={renameCandidate}
            />
          </div>
        <InspectorCard />
      </div>
      {(captureError || commitError) && <div className="nx9-stage-error">{captureError ?? commitError}</div>}
    </div>
  );
}
