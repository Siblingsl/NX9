import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  activeEpisodeShots,
  resolveBlockCharacters,
} from '@nx9/shared';
import { Director3dShell, normalizeDirectorProject, type DirectorProject, type Director3dCapturePayload } from '@nx9/director3d';
import { Clapperboard, Play, RotateCcw, Square, Box, Bug } from 'lucide-react';
import { isDevPromptEnabled, useDevPromptOverrides } from '../../stores/dev-prompt-overrides';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useStoryboardUi } from '../../stores/flow-runtime';
import { api } from '../../api/client';
import { prepareDirectorProjectForShot } from '../../engine/director3d-character-sync';
import { checkAssetGateInEdges } from '../../engine/asset-gate-runner';
import {
  findDirectorClipGenNode,
  findDirectorPictureGenNode,
  approveAllDirectorKeyframes,
  approveDirectorKeyframe,
  isDirectorKeyframeGatePassed,
  isShotKeyframeApproved,
  isShotKeyframeFailed,
  isShotMissingKeyframe,
  openReviewAfterDirectorBatch,
  pushKeyframesToClipGen,
  rejectDirectorKeyframe,
  runDirectorDeskBatch,
  summarizeDirectorKeyframeReview,
  summarizeDirectorQueue,
  summarizePendingKeyframeGate,
  syncStyleToPictureGen,
  type DirectorDeskQueueFilter,
  type DirectorDeskShotResult,
  type DirectorShotPhase,
} from '../../engine/director-desk-runner';
import './director-desk.css';
import './director-desk.v2.css';

function statusBadge(shot: {
  firstFrameAssetId?: string | null;
  status: string;
  keyframeStatus?: string;
  director3dGuide?: { captureUrl?: string } | null;
}): { label: string; cls: string } {
  if (isShotKeyframeFailed(shot as never)) return { label: '失败', cls: 'is-warn' };
  if (isShotKeyframeApproved(shot as never) && shot.firstFrameAssetId) {
    return { label: '通过', cls: 'is-ok' };
  }
  if (shot.firstFrameAssetId && (shot.keyframeStatus === 'review' || shot.status === 'review')) {
    return { label: '待审', cls: 'is-run' };
  }
  if (shot.status === 'generating') return { label: '生成中', cls: 'is-run' };
  if (shot.firstFrameAssetId) return { label: '已出', cls: 'is-ok' };
  if (shot.director3dGuide?.captureUrl) return { label: '有3D', cls: 'is-miss' };
  return { label: '未出', cls: 'is-miss' };
}

interface CameraPreset {
  id: string;
  name: string;
  captureUrl?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  fov?: number;
  savedAt: string;
}

function Director3dStageEmbed({
  blockId,
  project: rawProject,
  linkedShotId,
  shots,
  characters,
  data,
  updateNodeData,
  appendLog,
  focusShot,
}: {
  blockId: string;
  project: DirectorProject;
  linkedShotId: string | null | undefined;
  shots: Array<Record<string, unknown>>;
  characters: import('@nx9/shared').CharacterProfile[];
  data: Record<string, unknown>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  appendLog: (msg: string) => void;
  focusShot: (shotId: string) => void;
}) {
  const [currentShotId, setCurrentShotId] = useState<string | null>(linkedShotId ?? (shots[0] as Record<string, unknown>)?.id as string ?? null);
  const [sceneProject, setSceneProject] = useState<DirectorProject>(() => rawProject);
  const disposeRef = useRef<() => void>(undefined);
  const allPresets = (data.cameraPresets as Record<string, CameraPreset[]> | undefined) ?? {};
  const shotPresets = currentShotId ? allPresets[currentShotId] ?? [] : [];
  const [presetNameInput, setPresetNameInput] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const lastPayloadRef = useRef<Director3dCapturePayload | null>(null);

  const resolvedScene = useMemo(() => {
    if (!currentShotId) return sceneProject;
    const shot = shots.find((s) => s.id === currentShotId) as Record<string, unknown> | undefined;
    const shotCharacters = shot
      ? resolveBlockCharacters(data, shot as never, characters)
      : [];
    return prepareDirectorProjectForShot(
      sceneProject,
      shotCharacters.map((c: { id: string }) => c.id),
      characters,
      undefined,
      shotCharacters.map((c: { name: string }) => c.name),
    );
  }, [sceneProject, currentShotId, shots, characters, data]);

  useEffect(() => {
    if (linkedShotId) setCurrentShotId(linkedShotId);
  }, [linkedShotId]);

  const handleCapture = useCallback(async (payload: Director3dCapturePayload) => {
    if (!currentShotId) return;
    lastPayloadRef.current = payload;
    let imageUrl = payload.imageUrl;
    if (payload.dataUrl && !imageUrl) {
      try {
        const blob = await (await fetch(payload.dataUrl)).blob();
        const file = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' });
        const uploaded = await api.uploadAsset(file);
        imageUrl = uploaded.url;
      } catch { /* use dataUrl fallback */ }
    }
    const shot = shots.find((s) => s.id === currentShotId) as { index?: number } | undefined;
    if (shot) {
      useWorkspaceDocument.getState().updateShot(currentShotId, {
        director3dGuide: {
          sourceBlockId: blockId,
          captureId: payload.captureId,
          captureUrl: imageUrl || payload.dataUrl || '',
          cameraPrompt: payload.cameraPrompt || '',
          cameraPosition: payload.cameraPosition as [number, number, number] | undefined,
          cameraRotation: payload.cameraRotation as [number, number, number] | undefined,
          cameraFov: payload.cameraFov,
          appliedAt: new Date().toISOString(),
        },
      });
      updateNodeData(blockId, { previewUrl: imageUrl || payload.dataUrl });
      appendLog(`导演台 · 3D 截图已写回镜 #${shot.index}`);
    }
  }, [currentShotId, shots, blockId, updateNodeData, appendLog]);

  const savePreset = useCallback((name: string) => {
    if (!currentShotId || !lastPayloadRef.current) return;
    const payload = lastPayloadRef.current;
    const preset: CameraPreset = {
      id: `preset-${Date.now().toString(36)}`,
      name: name || `机位 ${shotPresets.length + 1}`,
      captureUrl: (() => { const s = shots.find((s2) => s2.id === currentShotId); if (s) { const g = (s as Record<string, unknown>).director3dGuide; return g ? (g as Record<string, unknown>).captureUrl as string : undefined; } return undefined; })(),
      position: payload.cameraPosition as [number, number, number] | undefined,
      rotation: payload.cameraRotation as [number, number, number] | undefined,
      fov: payload.cameraFov,
      savedAt: new Date().toISOString(),
    };
    const updated = { ...allPresets, [currentShotId]: [...shotPresets, preset] };
    updateNodeData(blockId, { cameraPresets: updated });
    setShowSavePreset(false);
    setPresetNameInput('');
    appendLog(`导演台 · 已保存机位预设 ${preset.name}`);
  }, [currentShotId, allPresets, shotPresets, shots, blockId, updateNodeData, appendLog]);

  const deletePreset = useCallback((presetId: string) => {
    if (!currentShotId) return;
    const filtered = shotPresets.filter((p) => p.id !== presetId);
    const updated = { ...allPresets, [currentShotId]: filtered };
    updateNodeData(blockId, { cameraPresets: updated });
    appendLog(`导演台 · 已删除机位预设`);
  }, [currentShotId, allPresets, shotPresets, blockId, updateNodeData, appendLog]);

  const persistProject = useCallback((proj: DirectorProject) => {
    setSceneProject(proj);
    updateNodeData(blockId, { scene: proj as unknown as Record<string, unknown> });
  }, [blockId, updateNodeData]);

  const handleRendererReady = useCallback((renderer: { dispose: () => void }) => {
    disposeRef.current = renderer.dispose;
  }, []);

  useEffect(() => {
    return () => { disposeRef.current?.(); };
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ height: '100%' }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line shrink-0">
        <span className="text-[10px] text-ink/60 font-medium">当前镜</span>
        <select
          className="text-[10px] px-2 py-1 rounded border border-line bg-surface"
          value={currentShotId ?? ''}
          onChange={(e) => {
            const sid = e.target.value;
            setCurrentShotId(sid);
            focusShot(sid);
          }}
        >
           {(shots as Array<{ id: string; index: number; descriptionZh?: string; promptEn?: string }>).map((s) => (
            <option key={s.id} value={s.id}>#{s.index} {s.descriptionZh || s.promptEn || '未命名'}</option>
          ))}
        </select>
        <button
          type="button"
          className="dd-btn is-ghost"
          style={{ fontSize: 10, height: 24, padding: '0 8px', marginLeft: 'auto' }}
          onClick={() => {
            if (!currentShotId) return;
            const shot = shots.find((s) => s.id === currentShotId) as Record<string, unknown> | undefined;
            if (!shot) return;
            const shotCharacters = resolveBlockCharacters(data, shot as never, characters);
            const updated = prepareDirectorProjectForShot(
              sceneProject,
              shotCharacters.map((c: { id: string }) => c.id),
              characters,
              undefined,
              shotCharacters.map((c: { name: string }) => c.name),
            );
            persistProject(updated);
            appendLog(`导演台 · 已应用 3D 摆位建议至镜 #${(shot as { index?: number }).index ?? '?'}`);
          }}
        >
          <Box size={10} />
           生成3D摆位建议
        </button>
        {showSavePreset ? (
          <div className="flex items-center gap-1 shrink-0">
            <input
              className="text-[9px] px-1.5 py-0.5 rounded border border-line bg-surface w-20"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              placeholder="机位名"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') savePreset(presetNameInput); if (e.key === 'Escape') setShowSavePreset(false); }}
            />
            <button type="button" className="dd-btn is-ghost" style={{ fontSize: 9, height: 22, padding: '0 6px' }} onClick={() => { savePreset(presetNameInput); }}>保存</button>
            <button type="button" className="dd-btn is-ghost" style={{ fontSize: 9, height: 22, padding: '0 6px' }} onClick={() => setShowSavePreset(false)}>取消</button>
          </div>
        ) : (
          <button
            type="button"
            className="dd-btn is-ghost"
            style={{ fontSize: 9, height: 22, padding: '0 6px', marginLeft: 4 }}
            onClick={() => setShowSavePreset(true)}
          >
            存机位
          </button>
        )}
      </div>
      {shotPresets.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1 overflow-x-auto shrink-0 border-b border-line" style={{ maxWidth: '100%' }}>
          {shotPresets.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] border border-line bg-surface/50 hover:bg-surface whitespace-nowrap shrink-0"
              title={`位置 ${p.position?.join(',') ?? '—'} · FOV ${p.fov ?? '—'}`}
              onClick={() => {
                if (!currentShotId) return;
                const shot = shots.find((s) => s.id === currentShotId) as Record<string, unknown> | undefined;
                if (!shot) return;
                const existingGuide = (shot.director3dGuide as Record<string, unknown> | undefined) ?? {};
                useWorkspaceDocument.getState().updateShot(currentShotId, {
                  director3dGuide: {
                    sourceBlockId: (existingGuide.sourceBlockId as string) || blockId,
                    captureId: (existingGuide.captureId as string) || '',
                    captureUrl: (existingGuide.captureUrl as string) || '',
                    cameraPosition: p.position,
                    cameraRotation: p.rotation,
                    cameraFov: p.fov,
                    appliedAt: new Date().toISOString(),
                  } as never,
                });
                appendLog(`导演台 · 已恢复机位 ${p.name}`);
              }}
            >
              {p.captureUrl ? <img src={p.captureUrl} alt="" className="w-5 h-4 rounded object-cover" /> : null}
              <span>{p.name}</span>
              <span
                className="ml-1 opacity-40 hover:opacity-100 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }}
                title="删除"
              >×</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Director3dShell
          options={{
            project: resolvedScene,
            linkedShotId: currentShotId ?? undefined,
            performanceMode: 'normal',
            crowdMax: 20,
            onProjectChange: persistProject,
            onCapture: handleCapture,
            onUploadFile: async (file) => {
              const uploaded = await api.uploadAsset(file);
              return { url: uploaded.url, filename: uploaded.filename };
            },
            onRendererReady: handleRendererReady,
          }}
        />
      </div>
    </div>
  );
}

function DirectorDeskDevFields({ blockId: _bid }: { blockId: string }) {
  const { values, setValue, clearKey } = useDevPromptOverrides();
  const consistencyVal = values['directorDesk.consistencySuffix'] ?? '';
  const styleLockVal = values['directorDesk.styleLockAppendix'] ?? '';

  return (
    <details style={{ margin: '8px 4px 0', padding: 8, borderRadius: 8, border: '1px dashed var(--desk-warn, #d97706)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 11, color: 'var(--desk-warn, #d97706)' }}>
        <Bug size={12} style={{ display: 'inline', marginRight: 4 }} />开发 · 导演台短模板字段（仅开发）
      </summary>
      <div className="flex flex-col gap-2 mt-2">
        <label className="text-[10px] font-bold">consistencySuffix</label>
        <textarea
          className="w-full border border-line rounded text-[10px] p-1.5 bg-surface resize-none font-mono"
          rows={2}
          placeholder="拼写在 enrich 后的附加一致性说明"
          value={consistencyVal}
          onChange={(e) => setValue('directorDesk.consistencySuffix', e.target.value)}
        />
        <div className="flex justify-between">
          <span className="text-[9px] text-ink/40">
            {consistencyVal ? '来源：全局 Dev Override' : '来源：DEFAULT（无覆盖）'}
          </span>
          {consistencyVal ? <button type="button" className="text-[9px] text-warn" onClick={() => clearKey('directorDesk.consistencySuffix')}>清除</button> : null}
        </div>
        <label className="text-[10px] font-bold">styleLockAppendix</label>
        <textarea
          className="w-full border border-line rounded text-[10px] p-1.5 bg-surface resize-none font-mono"
          rows={2}
          placeholder="拼写在风格锁附件的额外约束"
          value={styleLockVal}
          onChange={(e) => setValue('directorDesk.styleLockAppendix', e.target.value)}
        />
        <div className="flex justify-between">
          <span className="text-[9px] text-ink/40">
            {styleLockVal ? '来源：全局 Dev Override' : '来源：DEFAULT（无覆盖）'}
          </span>
          {styleLockVal ? <button type="button" className="text-[9px] text-warn" onClick={() => clearKey('directorDesk.styleLockAppendix')}>清除</button> : null}
        </div>
      </div>
    </details>
  );
}

function DirectorDeskBlock(props: NodeProps) {
  const { updateNodeData, fitView } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const appendLog = useActivityLog((s) => s.append);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const selectShot = useStoryboardUi((s) => s.selectShot);

  const data = (props.data ?? {}) as Record<string, unknown>;
  const status = (data.status as string | undefined) ?? 'idle';
  const previewUrl = data.previewUrl as string | undefined;
  const batchError = data.error as string | undefined;
  const skipExisting = (data.skipExisting as boolean | undefined) ?? true;
  const skipApproved = (data.skipApproved as boolean | undefined) ?? true;
  const concurrency = (data.concurrency as number | undefined) ?? 2;
  const maxRetries = (data.maxRetries as number | undefined) ?? 1;
  const forceCharacterRef = (data.forceCharacterRef as boolean | undefined) ?? true;
  const forceSceneRef = (data.forceSceneRef as boolean | undefined) ?? true;
  const styleLock = (data.styleLock as boolean | undefined) ?? true;
  const prefer3dRef = (data.prefer3dRef as boolean | undefined) ?? true;
  /** 批出完成后自动打开审片模式 */
  const autoOpenReview = (data.autoOpenReview as boolean | undefined) ?? true;
  /** 批出前把 seed/风格写回图像生成节点 */
  const syncStyleToPicture = (data.syncStyleToPicture as boolean | undefined) ?? true;
  const stylePrompt = (data.stylePrompt as string | undefined) ?? '';
  const styleSeed =
    data.styleSeed === null || data.styleSeed === undefined || data.styleSeed === ''
      ? null
      : Number(data.styleSeed);
  const scene = useMemo(() => normalizeDirectorProject(data.scene), [data.scene]);
  const filter = ((data.queueFilter as DirectorDeskQueueFilter) ?? 'missing') as DirectorDeskQueueFilter;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [runningShotId, setRunningShotId] = useState<string | null>(null);
  const [phaseHint, setPhaseHint] = useState<string>('');
  const [liveProgress, setLiveProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<'produce' | 'stage3d' | 'deliver'>('produce');
  const [previewMode, setPreviewMode] = useState<'keyframe' | 'guide3d' | 'compare'>('keyframe');
  const [immersed3d, setImmersed3d] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});
  const [rejectEditingId, setRejectEditingId] = useState<string | null>(null);
  const [rejectBusyId, setRejectBusyId] = useState<string | null>(null);
  const abortRef = useRef(false);
  const failedCountRef = useRef(0);

  const activeShots = useMemo(() => activeEpisodeShots(storyboard), [storyboard]);
  const stats = useMemo(() => summarizeDirectorQueue(activeShots), [activeShots]);
  const reviewStats = useMemo(() => summarizeDirectorKeyframeReview(activeShots), [activeShots]);
  const keyframeGatePassed = useMemo(
    () => isDirectorKeyframeGatePassed(activeShots),
    [activeShots],
  );

  const pictureNode = useMemo(
    () => findDirectorPictureGenNode(props.id, nodes, edges),
    [props.id, nodes, edges],
  );
  const clipNode = useMemo(
    () => findDirectorClipGenNode(props.id, nodes, edges),
    [props.id, nodes, edges],
  );

  const sortedShots = useMemo(
    () => [...activeShots].sort((a, b) => a.index - b.index),
    [activeShots],
  );

  const gateInfo = useMemo(() => {
    try { return checkAssetGateInEdges(props.id, nodes, edges); }
    catch { return { passed: false }; }
  }, [props.id, nodes, edges]);
  const gatePassed = gateInfo.passed || false;

  const currentShot = useMemo(() => {
    const sid = data.linkedShotId as string | undefined;
    return sid ? sortedShots.find((s) => s.id === sid) ?? null : null;
  }, [sortedShots, data.linkedShotId]);
  const guideUrl = currentShot?.director3dGuide?.captureUrl as string | undefined;

  const visibleShots = useMemo(() => {
    if (filter === 'selected') return sortedShots.filter((s) => selectedIds.has(s.id));
    if (filter === 'failed') return sortedShots.filter((s) => isShotKeyframeFailed(s));
    if (filter === 'missing') {
      return sortedShots.filter((s) => isShotMissingKeyframe(s) || isShotKeyframeFailed(s));
    }
    if (filter === '3donly') return sortedShots.filter((s) => s.director3dGuide?.captureUrl);
    return sortedShots;
  }, [sortedShots, filter, selectedIds]);

  const progressPct =
    stats.total === 0 ? 0 : Math.round((stats.withFrame / stats.total) * 100);
  const running = status === 'running';

  const cardTitle = useMemo(() => {
    const epId = storyboard.activeEpisodeId;
    const ep = (storyboard.episodes ?? []).find((e) => e.id === epId);
    return ep?.title || storyboard.title || '关键帧导演';
  }, [storyboard.activeEpisodeId, storyboard.episodes, storyboard.title]);

  const batchOptsFromData = useCallback(
    () => ({
      skipExisting,
      skipApproved,
      concurrency,
      maxRetries,
      forceCharacterRef,
      forceSceneRef,
      styleLock,
      prefer3dRef,
      stylePrompt: stylePrompt || undefined,
      styleSeed: styleSeed != null && Number.isFinite(styleSeed) ? styleSeed : null,
      pictureNodeData: (pictureNode?.data ?? {}) as Record<string, unknown>,
      blockData: data,
    }),
    [
      skipExisting,
      skipApproved,
      concurrency,
      maxRetries,
      forceCharacterRef,
      forceSceneRef,
      styleLock,
      prefer3dRef,
      stylePrompt,
      styleSeed,
      pictureNode?.data,
      data,
    ],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(visibleShots.map((s) => s.id)));
  }, [visibleShots]);

  const clearSelect = useCallback(() => setSelectedIds(new Set()), []);

  const focusShot = useCallback(
    (shotId: string) => {
      selectShot(shotId);
      updateNodeData(props.id, { linkedShotId: shotId });
    },
    [selectShot, updateNodeData, props.id],
  );

  const runBatch = useCallback(
    async (mode: 'filter' | 'selected' | 'one' | 'failed', oneId?: string) => {
      // O-14：门禁未放行时硬阻断（导演台锁参考）
      if (!gatePassed && (forceCharacterRef || forceSceneRef)) {
        appendLog('导演台：上游设定检查未放行，锁参考模式下禁止批出。请先在设定检查门禁中放行。');
        updateNodeData(props.id, { status: 'error', error: '设定检查未放行，锁参考禁止批出' });
        return;
      }
      abortRef.current = false;
      const shotIds =
        mode === 'one' && oneId
          ? [oneId]
          : mode === 'selected'
            ? [...selectedIds]
            : mode === 'failed'
              ? activeShots.filter(isShotKeyframeFailed).map((s) => s.id)
              : undefined;

      if (mode === 'selected' && (!shotIds || shotIds.length === 0)) {
        appendLog('导演台：请先勾选镜头');
        return;
      }
      if (mode === 'failed' && (!shotIds || shotIds.length === 0)) {
        appendLog('导演台：没有失败镜头');
        return;
      }

      const queueFilter: DirectorDeskQueueFilter =
        mode === 'selected' || mode === 'one'
          ? 'selected'
          : mode === 'failed'
            ? 'failed'
            : filter;

      updateNodeData(props.id, {
        status: 'running',
        error: undefined,
        batchStartedAt: new Date().toISOString(),
      });
      failedCountRef.current = 0;
      setLiveProgress({ done: 0, total: 0, failed: 0 });
      setPhaseHint('');

      // 批出前：风格 seed 写回图像生成（后续单镜出图也一致）
      if (syncStyleToPicture) {
        const sync = syncStyleToPictureGen({
          deskBlockId: props.id,
          nodes,
          edges,
          updateNodeData: (id, patch) => updateNodeData(id, patch),
          styleSeed: styleSeed != null && Number.isFinite(styleSeed) ? styleSeed : null,
          stylePrompt: stylePrompt || undefined,
          styleLock,
          negativePrompt: (data.negativePrompt as string | undefined) || undefined,
        });
        if (sync.synced) {
          appendLog(
            `导演台 · 风格已写回图像生成` +
              (styleSeed != null && Number.isFinite(styleSeed) ? ` · seed ${styleSeed}` : '') +
              (stylePrompt ? ` · 风格句` : ''),
          );
        }
      }

      appendLog(
        mode === 'one'
          ? `导演台 · 单镜出帧 #${activeShots.find((s) => s.id === oneId)?.index ?? '?'}`
          : mode === 'failed'
            ? `导演台 · 重试失败 ${shotIds!.length} 镜`
            : mode === 'selected'
              ? `导演台 · 批出选中 ${shotIds!.length} 镜`
              : `导演台 · 批出（${filter}）`,
      );

      try {
        // 同步后重新读 picture-gen data（含 seed）
        const livePicture = findDirectorPictureGenNode(props.id, nodes, edges);
        const summary = await runDirectorDeskBatch({
          ...batchOptsFromData(),
          pictureNodeData: {
            ...((livePicture?.data ?? pictureNode?.data ?? {}) as Record<string, unknown>),
            ...(styleSeed != null && Number.isFinite(styleSeed) ? { seed: styleSeed } : {}),
            ...(stylePrompt ? { stylePrompt } : {}),
          },
          shotIds,
          filter: queueFilter,
          skipExisting: mode === 'one' || mode === 'failed' ? false : skipExisting,
          skipApproved: mode === 'one' || mode === 'failed' ? false : skipApproved,
          concurrency: mode === 'one' ? 1 : concurrency,
          shouldAbort: () => abortRef.current,
          onShotStart: (shot, _index, total) => {
            setRunningShotId(shot.id);
            setLiveProgress((p) => ({ ...p, total }));
            updateNodeData(props.id, {
              linkedShotId: shot.id,
              batchProgress: { currentShotId: shot.id, total },
            });
          },
          onShotPhase: (shot, phase: DirectorShotPhase, detail) => {
            const label =
              phase === 'retrying'
                ? `重试 #${shot.index}${detail ? ` · ${detail}` : ''}`
                : phase === 'generating'
                  ? `生成 #${shot.index}`
                  : phase === 'queued'
                    ? `排队 #${shot.index}`
                    : phase === 'failed'
                      ? `失败 #${shot.index}`
                      : phase === 'review' || phase === 'approved' || phase === 'success'
                        ? `完成 #${shot.index}`
                        : `${phase} #${shot.index}`;
            setPhaseHint(label);
          },
          onShotDone: (_shot, result, index, total) => {
            if (!result.ok && !result.skipped) failedCountRef.current += 1;
            setLiveProgress({
              done: index + 1,
              total,
              failed: failedCountRef.current,
            });
            if (result.url) {
              updateNodeData(props.id, { previewUrl: result.url });
            }
          },
        });

        const succeededIds = summary.results.filter((r) => r.ok && r.url).map((r) => r.shotId);

        updateNodeData(props.id, {
          status: summary.failed > 0 && summary.done === 0 ? 'error' : 'success',
          previewUrl: summary.lastUrl ?? previewUrl,
          error: summary.failed > 0 ? `${summary.failed} 镜失败` : undefined,
          batchSummary: {
            total: summary.total,
            done: summary.done,
            failed: summary.failed,
            skipped: summary.skipped,
            retried: summary.retried ?? 0,
            at: new Date().toISOString(),
          },
          lastResults: summary.results.map((r: DirectorDeskShotResult) => ({
            shotId: r.shotId,
            ok: r.ok,
            url: r.url,
            error: r.error,
            attempts: r.attempts,
            phase: r.phase,
            usedRefs: r.usedRefs,
          })),
        });
        appendLog(
          `导演台完成 · 成功 ${summary.done} / 失败 ${summary.failed} / 跳过 ${summary.skipped}` +
            (summary.retried ? ` / 含重试 ${summary.retried}` : '') +
            ` · 共 ${summary.total}`,
        );

        // 批出后：进入审阅（有成功镜或本集已有待审时）
        if (autoOpenReview && (summary.done > 0 || mode !== 'one')) {
          const review = openReviewAfterDirectorBatch({
            deskBlockId: props.id,
            nodes,
            edges,
            updateNodeData: (id, patch) => updateNodeData(id, patch),
            succeededShotIds: succeededIds,
            openSession: true,
          });
          if (review.pendingIndices.length > 0) {
            appendLog(
              `导演台 · 已打开关键帧审阅 · 待审 ${review.pendingIndices.length} 镜`,
            );
          } else if (summary.done > 0) {
            appendLog('导演台 · 关键帧已齐/已通过 · 已切到审片视图');
          }
        }
      } catch (e) {
        updateNodeData(props.id, {
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        });
        appendLog(`导演台批出失败 · ${String(e)}`);
      } finally {
        setRunningShotId(null);
        setPhaseHint('');
        setLiveProgress({ done: 0, total: 0, failed: 0 });
      }
    },
    [
      selectedIds,
      filter,
      skipExisting,
      skipApproved,
      concurrency,
      batchOptsFromData,
      props.id,
      updateNodeData,
      appendLog,
      activeShots,
      previewUrl,
      syncStyleToPicture,
      autoOpenReview,
      nodes,
      edges,
      styleSeed,
      stylePrompt,
      styleLock,
      data.negativePrompt,
      pictureNode?.data,
      gatePassed,
      forceCharacterRef,
      forceSceneRef,
    ],
  );

  const stopBatch = useCallback(() => {
    abortRef.current = true;
    appendLog('导演台 · 请求停止（当前镜完成后生效）');
  }, [appendLog]);

  const sendToVideo = useCallback(() => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : undefined;
    const res = pushKeyframesToClipGen({
      deskBlockId: props.id,
      nodes,
      edges,
      updateNodeData: (id, patch) => updateNodeData(id, patch),
      shotIds: ids,
    });
    if (!res.clipGenId) {
      appendLog('导演台：画布上没有视频生成节点');
      return;
    }
    if (res.shotCount === 0) {
      appendLog('导演台：没有可送出的关键帧（请先批出）');
      return;
    }
    fitView({ nodes: [{ id: res.clipGenId }], duration: 300 });
    appendLog(
      `导演台 · 已聚焦视频生成节点 · 写入 ${res.shotCount} 镜关键帧` +
        (res.firstShotId ? ` · 首镜 ${res.firstShotId.slice(0, 8)}` : ''),
    );
  }, [selectedIds, props.id, nodes, edges, updateNodeData, appendLog, fitView]);

  const syncStyleNow = useCallback(() => {
    const sync = syncStyleToPictureGen({
      deskBlockId: props.id,
      nodes,
      edges,
      updateNodeData: (id, patch) => updateNodeData(id, patch),
      styleSeed: styleSeed != null && Number.isFinite(styleSeed) ? styleSeed : null,
      stylePrompt: stylePrompt || undefined,
      styleLock,
      negativePrompt: (data.negativePrompt as string | undefined) || undefined,
    });
    if (!sync.synced) {
      appendLog('导演台：画布上没有图像生成节点，无法写回风格');
      return;
    }
    appendLog(
      `导演台 · 已写回图像生成` +
        (styleSeed != null && Number.isFinite(styleSeed) ? ` · seed ${styleSeed}` : '') +
        (stylePrompt ? ` · ${stylePrompt.slice(0, 24)}` : ''),
    );
  }, [
    props.id,
    nodes,
    edges,
    updateNodeData,
    appendLog,
    styleSeed,
    stylePrompt,
    styleLock,
    data.negativePrompt,
  ]);

  const refreshKeyframeGate = useCallback(() => summarizePendingKeyframeGate(), []);

  const handleApproveShot = useCallback(
    (shotId: string) => {
      if (!approveDirectorKeyframe(shotId)) {
        appendLog('导演台 · 无法批准（缺关键帧）');
        return;
      }
      const synced = refreshKeyframeGate();
      appendLog(
        `导演台 · 已批准关键帧` +
          (synced.gatePassed ? ' · 本集审阅已放行' : ` · 仍待审 ${synced.pendingIndices.length}`),
      );
    },
    [appendLog, refreshKeyframeGate],
  );

  const handleApproveAll = useCallback(() => {
    if (reviewStats.missing > 0) {
      appendLog(`导演台 · 还有 ${reviewStats.missing} 镜缺图，无法全部通过`);
      return;
    }
    const n = approveAllDirectorKeyframes();
    const synced = refreshKeyframeGate();
    appendLog(
      n > 0
        ? `导演台 · 全部通过 ${n} 镜` + (synced.gatePassed ? ' · 已放行' : '')
        : keyframeGatePassed
          ? '导演台 · 本集已全部通过'
          : '导演台 · 无可批准镜头',
    );
  }, [appendLog, keyframeGatePassed, reviewStats.missing, refreshKeyframeGate]);

  const handleRejectShot = useCallback(
    async (shotId: string, regenerate: boolean) => {
      const comment = (rejectDrafts[shotId] ?? '').trim();
      if (!comment) {
        appendLog('导演台 · 打回需填写原因');
        return;
      }
      setRejectBusyId(shotId);
      try {
        const res = await rejectDirectorKeyframe({ shotId, comment, regenerate });
        if (!res.ok) {
          appendLog('导演台 · 打回失败');
          return;
        }
        refreshKeyframeGate();
        setRejectEditingId(null);
        setRejectDrafts((prev) => {
          const next = { ...prev };
          delete next[shotId];
          return next;
        });
        appendLog(
          regenerate
            ? '导演台 · 已打回并重出关键帧'
            : '导演台 · 已打回关键帧，可回生产 Tab 重出',
        );
      } finally {
        setRejectBusyId(null);
      }
    },
    [appendLog, rejectDrafts, refreshKeyframeGate],
  );

  const handlePushClipGen = useCallback(
    (force = false) => {
      if (!force && !keyframeGatePassed) {
        appendLog(
          `导演台 · 审阅未放行（缺图 ${reviewStats.missing} · 待审 ${reviewStats.pending + reviewStats.failed}），未推送`,
        );
        return;
      }
      pushKeyframesToClipGen({
        deskBlockId: props.id,
        nodes,
        edges,
        updateNodeData,
        bypassKeyframeGate: force,
      });
      appendLog(force ? '导演台 · 已强制推送 clip-gen（未批完）' : '关键帧已推送 clip-gen');
    },
    [
      keyframeGatePassed,
      reviewStats.missing,
      reviewStats.pending,
      reviewStats.failed,
      props.id,
      nodes,
      edges,
      updateNodeData,
      appendLog,
    ],
  );

  const primaryLabel = useMemo(() => {
    if (running) {
      if (liveProgress.total > 0) {
        return `出图中 ${liveProgress.done}/${liveProgress.total}…`;
      }
      return '出图中…';
    }
    if (filter === 'selected') return `批出选中（${selectedIds.size}）`;
    if (filter === 'failed') return `重出失败（${stats.failed}）`;
    if (filter === 'missing') return `批出未完成（${stats.missing + stats.failed}）`;
    return '批出本集（跳过已出）';
  }, [running, liveProgress, filter, selectedIds.size, stats]);

  const barPct =
    running && liveProgress.total > 0
      ? Math.round((liveProgress.done / liveProgress.total) * 100)
      : progressPct;

  const openStudio = useCallback(() => setStudioOpen(true), []);
  const closeStudio = useCallback(() => setStudioOpen(false), []);

  const queuePanel = (
    <div className="dd2-filmstrip">
      <div className="dd2-filmstrip__head">
        <div className="dd2-filmstrip__progress">
          <span>
            {running
              ? `批出 ${liveProgress.done}/${liveProgress.total}`
              : `${stats.withFrame}/${stats.total}`}
          </span>
          <div className="dd2-filmstrip__bar">
            <div className="dd2-filmstrip__fill" style={{ width: `${Math.min(100, barPct)}%` }} />
          </div>
        </div>
        <select
          className="dd2-filmstrip__filter"
          value={filter}
          onChange={(e) => updateNodeData(props.id, { queueFilter: e.target.value })}
          aria-label="镜头筛选"
        >
          <option value="missing">缺帧 / 失败</option>
          <option value="failed">仅失败</option>
          <option value="selected">已选</option>
          <option value="3donly">仅有 3D</option>
          <option value="all">全部</option>
        </select>
      </div>
      <div className="dd2-filmstrip__list" data-scroll="filmstrip">
        {visibleShots.length === 0 ? (
          <p className="dd2-filmstrip__empty">
            {stats.total === 0 ? '暂无镜头 · 先走分镜台' : '该筛选下无镜头'}
          </p>
        ) : (
          visibleShots.map((shot) => {
            const badge = statusBadge(shot);
            return (
              <button
                key={shot.id}
                type="button"
                className={`dd2-frame ${selectedIds.has(shot.id) || currentShot?.id === shot.id ? 'is-on' : ''} ${runningShotId === shot.id ? 'is-run' : ''}`}
                onClick={() => {
                  focusShot(shot.id);
                  if (shot.firstFrameAssetId) {
                    updateNodeData(props.id, { previewUrl: shot.firstFrameAssetId });
                  }
                }}
              >
                <div className="dd2-frame__thumb">
                  {shot.firstFrameAssetId ? (
                    <img src={shot.firstFrameAssetId} alt="" draggable={false} />
                  ) : (
                    <span>#{shot.index}</span>
                  )}
                  {shot.director3dGuide?.captureUrl ? <i className="dd2-frame__3d" title="有 3D 参考" /> : null}
                </div>
                <div className="dd2-frame__meta">
                  <strong>#{shot.index}</strong>
                  <em>{shot.durationSec}s · {shot.shotType}</em>
                </div>
                <span className={`dd2-frame__badge ${badge.cls}`}>{badge.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const deskBody = (
    <div className="dd2-cinema">
      <div className="dd2-cinema__screen">
        <div className="dd2-cinema__toolbar">
          <div className="dd2-cinema__modes" role="tablist">
            <button type="button" className={previewMode === 'keyframe' ? 'is-on' : ''} onClick={() => setPreviewMode('keyframe')}>关键帧</button>
            <button type="button" className={previewMode === 'guide3d' ? 'is-on' : ''} onClick={() => setPreviewMode('guide3d')}>3D 参考</button>
            <button type="button" className={previewMode === 'compare' ? 'is-on' : ''} onClick={() => setPreviewMode('compare')}>对比</button>
          </div>
          <span className="dd2-cinema__shot">
            当前镜 #{currentShot?.index ?? '—'}
            {currentShot?.descriptionZh ? ` · ${String(currentShot.descriptionZh).slice(0, 28)}` : ''}
          </span>
        </div>

        <div className={`dd2-cinema__viewport ${previewMode === 'compare' ? 'is-compare' : ''}`}>
          {previewMode === 'keyframe' && (previewUrl ? (
            <img src={previewUrl} alt="" draggable={false} />
          ) : (
            <div className="dd2-cinema__empty">
              <Clapperboard size={28} strokeWidth={1.25} />
              <strong>等待关键帧</strong>
              <span>选左侧胶片镜号，再批出本集</span>
            </div>
          ))}
          {previewMode === 'guide3d' && (guideUrl ? (
            <img src={guideUrl} alt="" draggable={false} />
          ) : (
            <div className="dd2-cinema__empty">
              <Box size={28} strokeWidth={1.25} />
              <strong>无 3D 参考</strong>
              <span>可切到「3D 舞台」摆机位后截图</span>
              <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => setStudioTab('stage3d')}>进入 3D 舞台</button>
            </div>
          ))}
          {previewMode === 'compare' && (
            <>
              <div className="dd2-cinema__pane">
                <span className="dd2-cinema__pane-label">关键帧</span>
                {previewUrl ? <img src={previewUrl} alt="" draggable={false} /> : <div className="dd2-cinema__empty is-mini">无关键帧</div>}
              </div>
              <div className="dd2-cinema__pane">
                <span className="dd2-cinema__pane-label">3D</span>
                {guideUrl ? <img src={guideUrl} alt="" draggable={false} /> : <div className="dd2-cinema__empty is-mini">无 3D</div>}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="dd2-cinema__dock">
        <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => setShowSettings((v) => !v)}>
          批出设置{showSettings ? ' ▴' : ''}
        </button>
        <button
          type="button"
          className="dd2-btn dd2-btn--ghost"
          onClick={() => {
            if (currentShot) focusShot(currentShot.id);
            setStudioTab('stage3d');
          }}
        >
          <Box size={13} /> 摆 3D 机位
        </button>
        {!running && stats.failed > 0 && (
          <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => void runBatch('failed')}>
            <RotateCcw size={12} /> 重试失败
          </button>
        )}
        {running && (
          <button type="button" className="dd2-btn dd2-btn--ghost dd2-btn--warn" onClick={stopBatch}>
            <Square size={12} /> 停止
          </button>
        )}
        <button
          type="button"
          className="dd2-btn dd2-btn--primary dd2-btn--batch"
          disabled={running || stats.total === 0}
          onClick={() => void runBatch(filter === 'selected' ? 'selected' : 'filter')}
        >
          <Play size={13} /> {primaryLabel}
        </button>
      </div>

      {batchError && <p className="dd2-cinema__error">{batchError}</p>}

      <div className={`dd2-settings-drawer ${showSettings ? 'is-open' : ''}`}>
        <div className="dd2-settings-drawer__head">
          <span>批出设置</span>
          <button type="button" onClick={() => setShowSettings(false)}>完成</button>
        </div>
        <div className="dd2-settings-drawer__body">
          <div className="dd2-settings-group">
            <span className="dd2-settings-group__label">跳过策略</span>
            <div className="dd2-settings-row">
              <label className="dd2-settings-check">
                <input type="checkbox" checked={skipExisting} onChange={(e) => updateNodeData(props.id, { skipExisting: e.target.checked })} />
                跳过已有
              </label>
              <label className="dd2-settings-check">
                <input type="checkbox" checked={skipApproved} onChange={(e) => updateNodeData(props.id, { skipApproved: e.target.checked })} />
                跳过通过
              </label>
            </div>
          </div>

          <div className="dd2-settings-group">
            <span className="dd2-settings-group__label">参考锁</span>
            <div className="dd2-settings-row">
              <label className="dd2-settings-check">
                <input type="checkbox" checked={forceCharacterRef} onChange={(e) => updateNodeData(props.id, { forceCharacterRef: e.target.checked })} />
                角色参考
              </label>
              <label className="dd2-settings-check">
                <input type="checkbox" checked={forceSceneRef} onChange={(e) => updateNodeData(props.id, { forceSceneRef: e.target.checked })} />
                场景参考
              </label>
              <label className="dd2-settings-check">
                <input type="checkbox" checked={styleLock} onChange={(e) => updateNodeData(props.id, { styleLock: e.target.checked })} />
                风格锁
              </label>
              <label className="dd2-settings-check">
                <input type="checkbox" checked={prefer3dRef} onChange={(e) => updateNodeData(props.id, { prefer3dRef: e.target.checked })} />
                优先 3D
              </label>
            </div>
          </div>

          <div className="dd2-settings-group">
            <span className="dd2-settings-group__label">并发 / 重试</span>
            <div className="dd2-settings-row">
              <span className="dd2-settings-hint">并发</span>
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" className={`dd2-settings-chip ${concurrency === n ? 'is-on' : ''}`} onClick={() => updateNodeData(props.id, { concurrency: n })}>{n}</button>
              ))}
              <span className="dd2-settings-hint">重试</span>
              {[0, 1, 2].map((n) => (
                <button key={n} type="button" className={`dd2-settings-chip ${maxRetries === n ? 'is-on' : ''}`} onClick={() => updateNodeData(props.id, { maxRetries: n })}>{n}</button>
              ))}
            </div>
          </div>

          <div className="dd2-settings-group">
            <span className="dd2-settings-group__label">风格</span>
            <input
              type="text"
              className="dd2-settings-input"
              value={stylePrompt}
              placeholder="统一风格补充（如 film still, teal-orange）"
              onChange={(e) => updateNodeData(props.id, { stylePrompt: e.target.value })}
            />
            <div className="dd2-settings-row">
              <span className="dd2-settings-hint">Seed</span>
              <input
                type="number"
                className="dd2-settings-input dd2-settings-input--seed"
                value={styleSeed ?? ''}
                placeholder="空=默认"
                onChange={(e) => {
                  const v = e.target.value;
                  updateNodeData(props.id, { styleSeed: v === '' ? null : Number(v) });
                }}
              />
              <button type="button" className="dd2-settings-sync-btn" onClick={syncStyleNow}>
                立即写回
              </button>
            </div>
            {storyboard.globalArtDirection && (
              <span className="dd2-settings-hint">已读全局美术方向</span>
            )}
            <div className="dd2-settings-row" style={{ marginTop: 4 }}>
              <label className="dd2-settings-check">
                <input type="checkbox" checked={syncStyleToPicture} onChange={(e) => updateNodeData(props.id, { syncStyleToPicture: e.target.checked })} />
                风格写回出图节点
              </label>
              <label className="dd2-settings-check">
                <input type="checkbox" checked={autoOpenReview} onChange={(e) => updateNodeData(props.id, { autoOpenReview: e.target.checked })} />
                批完进审阅
              </label>
            </div>
          </div>

          {isDevPromptEnabled() && (
            <details className="dd2-settings-dev">
              <summary>开发 · 导演台短模板字段</summary>
              <DirectorDeskDevFields blockId={props.id} />
            </details>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <BlockShell {...props}>
        <div className="dd2-card nodrag nopan">
          <button type="button" className="dd2-card__clickable" onClick={openStudio}>
            <div className="dd2-card__header">
              <span className="dd2-card__eyebrow">导演台 · 关键帧</span>
              <span
                className={`dd2-card__badge ${
                  running ? 'is-run' : stats.total > 0 && progressPct >= 100 ? 'is-ok' : ''
                }`}
              >
                {running
                  ? '批出中'
                  : stats.total === 0
                    ? '待接入'
                    : progressPct >= 100
                      ? '已完成'
                      : '进行中'}
              </span>
            </div>
            <div className="dd2-card__title">{cardTitle}</div>
            <div className="dd2-card__meta">
              {running
                ? `批出中 ${liveProgress.done}/${liveProgress.total}`
                : stats.total === 0
                  ? '先完成分镜台'
                  : `已出 ${stats.withFrame}/${stats.total}${stats.with3d > 0 ? ` · 3D ${stats.with3d}` : ''}`}
            </div>
            <div className="dd2-card__logline">
              {batchError
                ? batchError
                : stats.total > 0 && !gatePassed
                  ? '上游设定检查未放行 · 建议先完成资产入库'
                  : running
                    ? '批出进行中，打开台内可停止'
                    : '点击打开导演台 · 选镜批出与 3D 机位'}
            </div>
            <div className="dd2-card__actions">
              <button
                type="button"
                className="dd2-btn dd2-btn--ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  openStudio();
                }}
              >
                打开导演台
              </button>
            </div>
          </button>
        </div>
      </BlockShell>

      <ScreenModal
        open={studioOpen}
        onClose={() => { closeStudio(); setImmersed3d(false); }}
        title={immersed3d ? undefined : '导演台'}
        subtitle={immersed3d ? undefined : '选镜 → 3D 机位 → 批出关键帧 → 审阅送出'}
        width={immersed3d ? 'min(1440px, 100vw - 12px)' : 'min(1280px, calc(100vw - 24px))'}
        showChrome={!immersed3d}
        variant="default"
        className={`dd2-modal ${immersed3d ? 'is-immersed' : ''}`}
      >
        <div className="dd2-studio">
          {!immersed3d && (
            <div className="dd2-pipeline" aria-label="导演流程">
              <button
                type="button"
                className={`dd2-pipeline__step ${studioTab === 'produce' ? 'is-on' : ''}`}
                onClick={() => { setStudioTab('produce'); setImmersed3d(false); setShowSettings(false); }}
              >
                <b>1</b> 选镜批出
              </button>
              <span className="dd2-pipeline__sep" aria-hidden />
              <button
                type="button"
                className={`dd2-pipeline__step ${studioTab === 'stage3d' ? 'is-on' : ''}`}
                onClick={() => { setStudioTab('stage3d'); setShowSettings(false); }}
              >
                <b>2</b> 3D 机位
              </button>
              <span className="dd2-pipeline__sep" aria-hidden />
              <button
                type="button"
                className={`dd2-pipeline__step ${studioTab === 'deliver' ? 'is-on' : ''}`}
                onClick={() => { setStudioTab('deliver'); setShowSettings(false); }}
              >
                <b>3</b> 审阅送出
              </button>
            </div>
          )}
          <div className="dd2-studio__main">
            {!immersed3d && queuePanel}
            <div className="dd2-work-area">
              {studioTab === 'produce' && deskBody}
              {studioTab === 'stage3d' && (
                <div className="dd2-stage">
                  <div className="dd2-stage__header">
                    <span className="dd2-stage__title">
                      3D 舞台{currentShot ? ` · 镜 #${currentShot.index}` : ''}
                    </span>
                    {immersed3d ? (
                      <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => setImmersed3d(false)}>
                        ← 返回
                      </button>
                    ) : (
                      <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => setImmersed3d(true)}>
                        沉浸
                      </button>
                    )}
                  </div>
                  <Director3dStageEmbed
                    blockId={props.id}
                    project={scene}
                    linkedShotId={data.linkedShotId as string | undefined}
                    shots={sortedShots as never[]}
                    characters={characters}
                    data={data}
                    updateNodeData={updateNodeData}
                    appendLog={appendLog}
                    focusShot={focusShot}
                  />
                </div>
              )}
              {studioTab === 'deliver' && (
                <div className="dd2-deliver">
                  <div className="dd2-deliver__intro">
                    <h3>审阅送出</h3>
                    <p>台内批审关键帧 → 写回风格 → 放行后推送视频生成。外审宫格仍可用，不替代本页批审。</p>
                  </div>

                  <section className="dd2-review" aria-label="关键帧批审">
                    <div className="dd2-review__head">
                      <div className="dd2-review__stats">
                        <span>共 {reviewStats.total}</span>
                        <span className={reviewStats.missing ? 'is-warn' : ''}>缺图 {reviewStats.missing}</span>
                        <span className={reviewStats.pending || reviewStats.failed ? 'is-warn' : ''}>
                          待审 {reviewStats.pending + reviewStats.failed}
                        </span>
                        <span className={keyframeGatePassed ? 'is-ok' : ''}>已过 {reviewStats.approved}</span>
                        <em className={keyframeGatePassed ? 'is-ok' : 'is-warn'}>
                          {keyframeGatePassed ? '门禁已放行' : '门禁未放行'}
                        </em>
                      </div>
                      <div className="dd2-review__acts">
                        <button
                          type="button"
                          className="dd2-btn dd2-btn--ghost"
                          disabled={running || reviewStats.total === 0 || reviewStats.missing > 0 || keyframeGatePassed}
                          onClick={handleApproveAll}
                        >
                          全部通过
                        </button>
                        <button
                          type="button"
                          className="dd2-btn dd2-btn--ghost"
                          disabled={running}
                          onClick={() => {
                            openReviewAfterDirectorBatch({
                              deskBlockId: props.id,
                              nodes,
                              edges,
                              updateNodeData,
                              openSession: true,
                            });
                            appendLog('导演台 · 已打开宫格外审');
                          }}
                        >
                          打开宫格审阅
                        </button>
                      </div>
                    </div>

                    {reviewStats.missing > 0 ? (
                      <p className="dd2-review__hint is-warn">
                        还有 {reviewStats.missing} 镜缺关键帧，请先回「选镜批出」补齐，再全部通过。
                      </p>
                    ) : keyframeGatePassed ? (
                      <p className="dd2-review__hint is-ok">本集关键帧已全部批准，可推送视频生成。</p>
                    ) : (
                      <p className="dd2-review__hint">逐镜批准或一键全部通过；打回后可在生产 Tab 重出。</p>
                    )}

                    <div className="dd2-review__board">
                      {sortedShots.length === 0 ? (
                        <p className="dd2-review__empty">暂无镜头</p>
                      ) : (
                        sortedShots.map((shot) => {
                          const approved = isShotKeyframeApproved(shot);
                          const missing = isShotMissingKeyframe(shot);
                          const failed = isShotKeyframeFailed(shot);
                          const editing = rejectEditingId === shot.id;
                          const busy = rejectBusyId === shot.id;
                          return (
                            <article
                              key={shot.id}
                              className={`dd2-review__cell ${approved ? 'is-ok' : ''} ${missing ? 'is-miss' : ''} ${failed ? 'is-fail' : ''}`}
                            >
                              <button
                                type="button"
                                className="dd2-review__thumb"
                                onClick={() => {
                                  focusShot(shot.id);
                                  if (shot.firstFrameAssetId) {
                                    updateNodeData(props.id, { previewUrl: shot.firstFrameAssetId });
                                  }
                                }}
                              >
                                {shot.firstFrameAssetId ? (
                                  <img src={shot.firstFrameAssetId} alt="" draggable={false} />
                                ) : (
                                  <span>缺图</span>
                                )}
                              </button>
                              <div className="dd2-review__meta">
                                <strong>#{shot.index}</strong>
                                <em>
                                  {approved ? '已过' : missing ? '缺图' : failed ? '已打回' : '待审'}
                                  {' · '}
                                  {shot.durationSec}s
                                </em>
                              </div>
                              {!missing && !approved ? (
                                <div className="dd2-review__cell-acts">
                                  <button
                                    type="button"
                                    className="dd2-btn dd2-btn--ghost"
                                    disabled={running || busy}
                                    onClick={() => handleApproveShot(shot.id)}
                                  >
                                    批准
                                  </button>
                                  <button
                                    type="button"
                                    className="dd2-btn dd2-btn--ghost"
                                    disabled={running || busy}
                                    onClick={() => setRejectEditingId(editing ? null : shot.id)}
                                  >
                                    打回
                                  </button>
                                </div>
                              ) : null}
                              {editing ? (
                                <div className="dd2-review__reject">
                                  <textarea
                                    rows={2}
                                    placeholder="打回原因（必填）"
                                    value={rejectDrafts[shot.id] ?? shot.keyframeReviewNote ?? ''}
                                    onChange={(e) =>
                                      setRejectDrafts((prev) => ({ ...prev, [shot.id]: e.target.value }))
                                    }
                                  />
                                  <div className="dd2-review__reject-acts">
                                    <button
                                      type="button"
                                      className="dd2-btn dd2-btn--ghost"
                                      disabled={busy}
                                      onClick={() => void handleRejectShot(shot.id, false)}
                                    >
                                      仅打回
                                    </button>
                                    <button
                                      type="button"
                                      className="dd2-btn dd2-btn--primary"
                                      disabled={busy}
                                      onClick={() => void handleRejectShot(shot.id, true)}
                                    >
                                      {busy ? '处理中…' : '打回并重出'}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                              {!editing && shot.keyframeReviewNote ? (
                                <p className="dd2-review__note">{shot.keyframeReviewNote}</p>
                              ) : null}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </section>

                  <div className="dd2-deliver__grid">
                    <div className="dd2-deliver__card">
                      <span className="dd2-deliver__card-title">同步风格到出图</span>
                      <p className="dd2-deliver__card-desc">把当前风格 prompt / seed 写回下游图像生成节点</p>
                      <button
                        type="button"
                        className="dd2-btn dd2-btn--ghost dd2-deliver__card-btn"
                        disabled={running || !pictureNode}
                        onClick={() => {
                          syncStyleToPictureGen({
                            deskBlockId: props.id,
                            nodes,
                            edges,
                            updateNodeData,
                            styleSeed,
                            stylePrompt,
                          });
                          appendLog('风格已同步出图节点');
                        }}
                      >
                        写回风格
                      </button>
                    </div>
                    <div className={`dd2-deliver__card is-primary ${keyframeGatePassed ? '' : 'is-locked'}`}>
                      <span className="dd2-deliver__card-title">推送到视频生成</span>
                      <p className="dd2-deliver__card-desc">
                        {keyframeGatePassed
                          ? '本集关键帧已批准，写入 clip-gen 进入视频主链'
                          : '需本集关键帧全部批准后放行；紧急时可强制推送'}
                      </p>
                      <div className="dd2-deliver__card-row">
                        <button
                          type="button"
                          className="dd2-btn dd2-btn--primary dd2-deliver__card-btn"
                          disabled={running || !clipNode || stats.withFrame === 0 || !keyframeGatePassed}
                          onClick={() => handlePushClipGen(false)}
                        >
                          推送关键帧
                        </button>
                        {!keyframeGatePassed && clipNode && stats.withFrame > 0 ? (
                          <button
                            type="button"
                            className="dd2-btn dd2-btn--ghost dd2-deliver__card-btn"
                            disabled={running}
                            onClick={() => handlePushClipGen(true)}
                          >
                            强制推送
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="dd2-deliver__summary">
                    {pictureNode
                      ? `出图：${(pictureNode.data as Record<string, unknown>)?.model ?? '默认'}`
                      : '出图：默认 Gemini 2.5 Flash Image'}
                    {clipNode ? ' · 可送视频' : ' · 未接 clip-gen'}
                    {' · '}已出 {stats.withFrame}/{stats.total}
                    {' · '}
                    {keyframeGatePassed ? '审阅已放行' : `审阅未放行（待 ${reviewStats.pending + reviewStats.failed + reviewStats.missing}）`}
                  </div>
                </div>
              )}
            </div>
          </div>
          {!immersed3d && (
            <div className="dd2-studio__footer">
              {pictureNode ? `出图 · ${(pictureNode.data as Record<string, unknown>)?.model ?? '默认'}` : '出图 · Gemini 2.5 Flash Image'}
              {clipNode ? ' · 可送视频' : ''}
              {currentShot ? ` · 当前镜 #${currentShot.index}` : ''}
              {phaseHint ? ` · ${phaseHint}` : running ? ' · 批出中…' : ''}
            </div>
          )}
        </div>
      </ScreenModal>
    </>
  );
}

export default memo(DirectorDeskBlock);
