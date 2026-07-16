import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, ChevronDown, GripVertical, Play, Sparkles } from 'lucide-react';
import {
  canConfirmStoryboardPreview,
  KEYFRAME_SCORE_THRESHOLD,
  lookupBlock,
  storyboardPreviewSummary,
  type StoryboardPreviewGridColumns,
  type StoryboardPreviewViewMode,
} from '@nx9/shared';
import { useReactFlow } from '@xyflow/react';
import { normalizeDirectorProject } from '@nx9/director3d';
import { useDeckUi } from '../../../stores/deck-ui';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useDirector3dUi } from '../../../../../stores/director3d-ui';
import { useStoryboardPreviewState } from './useStoryboardPreviewState';
import { StoryboardPreviewGrid } from './StoryboardPreviewGrid';
import { StoryboardPreviewTimeline } from './StoryboardPreviewTimeline';
import { StoryboardPreviewFrameEditor } from './StoryboardPreviewFrameEditor';
import { StoryboardPreviewGenSettings } from './StoryboardPreviewGenSettings';
import { StoryboardPreviewDirector3dPanel } from './StoryboardPreviewDirector3dPanel';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { prepareDirectorProjectForShot } from '../../../../director3d-character-sync';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const VIEW_MODES: { id: StoryboardPreviewViewMode; label: string }[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'storyboard', label: 'Scene' },
];

const GRID_COLS: StoryboardPreviewGridColumns[] = [2, 3, 4];

export interface StoryboardPreviewWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
  /** 内嵌于分镜台 ScreenModal 时隐藏底栏拖拽头，加高内容区 */
  embedded?: boolean;
}

export function StoryboardPreviewWorkspace({
  blockId,
  kind,
  onCollapse,
  embedded = false,
}: StoryboardPreviewWorkspaceProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const appendLog = useActivityLog((s) => s.append);
  const { getNode, updateNodeData } = useReactFlow();
  const openDirector3d = useDirector3dUi((state) => state.openForBlock);
  const setDirector3dHostBridge = useDirector3dUi((state) => state.setHostBridge);
  const actions = useStoryboardPreviewState(blockId);
  const characters = useWorkspaceDocument((state) => state.characters.characters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStyle, setBatchStyle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [directorPanelOpen, setDirectorPanelOpen] = useState(false);
  const [panoramaPrompt, setPanoramaPrompt] = useState('');
  const [generatingPanorama, setGeneratingPanorama] = useState(false);

  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const payload = actions.readPayload(data);
  const meta = lookupBlock(kind);
  const status = (data.status as string) ?? 'idle';
  const summary = storyboardPreviewSummary(payload);
  const canConfirm = canConfirmStoryboardPreview(payload);
  const pictureNode = actions.connectedPictureNode();
  const director3dNode = actions.connectedDirector3dNode();
  const { model, pictureGenMode, quality, aspectRatio } = payload.pictureSettings;
  const unboundCharacterShotCount = actions.shots.filter(
    (shot) => (shot.characterNames?.length ?? 0) > (shot.characterIds?.length ?? 0),
  ).length;
  const unboundSceneShotCount = actions.shots.filter(
    (shot) => Boolean(shot.sceneName) && !shot.sceneAssetId,
  ).length;

  useEffect(() => {
    if (!pictureNode) return;
    actions.syncPictureSettingsToExecNode({ model, pictureGenMode, quality, aspectRatio });
  }, [actions.syncPictureSettingsToExecNode, pictureNode?.id, model, pictureGenMode, quality, aspectRatio]);

  useEffect(() => {
    const hasUpstream = Boolean(actions.upstreamBreakdown?.episodes?.some((ep) => ep.shots.length > 0));
    if (payload.frames.length === 0 && (actions.shotCount > 0 || hasUpstream)) {
      actions.syncFromStoryboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once when shots available
  }, [blockId, actions.shotCount, actions.upstreamBreakdown, payload.frames.length]);

  useEffect(() => {
    if (actions.shotCount > 0) actions.syncFromStoryboard();
    // activeEpisodeId 是唯一切集触发器；syncFromStoryboard 本身保持稳定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions.activeEpisodeId]);

  const framesByScene = useMemo(() => {
    const map = new Map<string, typeof payload.frames>();
    for (const f of payload.frames) {
      const key = f.sceneCode ?? f.sceneId ?? '未分场';
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return map;
  }, [payload.frames]);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const toggleSelect = useCallback((frameId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(frameId)) next.delete(frameId);
      else next.add(frameId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(payload.frames.map((f) => f.id)));
  }, [payload.frames]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBatchRegenerate = useCallback(async () => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : payload.frames.map((f) => f.id);
    const unlocked = payload.frames.filter(
      (f) => ids.includes(f.id) && !f.locked && f.status !== 'generating',
    );
    if (unlocked.length === 0) {
      appendLog('无可重新生成的分镜（已全部锁定或生成中）');
      return;
    }
    setGenerating(true);
    for (const frame of unlocked) {
      await actions.regenerateFrame(frame.id);
    }
    setGenerating(false);
    appendLog(`批量重新生成 ${unlocked.length} 张（跳过锁定）`);
  }, [actions, appendLog, payload.frames, selectedIds]);

  const handleGenerateAll = useCallback(async () => {
    setGenerating(true);
    await actions.generateAllFrames(true);
    setGenerating(false);
  }, [actions]);

  const selectedFrame = payload.selectedFrameId
    ? payload.frames.find((f) => f.id === payload.selectedFrameId)
    : undefined;

  useEffect(() => {
    if (payload.panorama720?.prompt) {
      setPanoramaPrompt(payload.panorama720.prompt);
      return;
    }
    if (selectedFrame) {
      setPanoramaPrompt(
        [selectedFrame.sceneAssetRef, selectedFrame.promptSummary].filter(Boolean).join(' · '),
      );
      return;
    }
    setPanoramaPrompt('');
  }, [payload.panorama720?.imageUrl, payload.panorama720?.prompt, selectedFrame?.id]);

  const loadPanoramaIntoDirector = useCallback(
    (imageUrl: string) => {
      if (!director3dNode) return;
      const directorData = (director3dNode.data ?? {}) as Record<string, unknown>;
      const project = normalizeDirectorProject(directorData.scene);
      const nextProject = {
        ...project,
        panorama: { url: imageUrl, yaw: 0, exposure: 1 },
      };
      updateNodeData(director3dNode.id, {
        scene: nextProject,
        sceneVersion: 1,
        panoramaUrl: imageUrl,
        panoramaProjection: 'equirectangular',
      });
      appendLog('720° 全景环境已加载到 3D 导演台');
    },
    [appendLog, director3dNode, updateNodeData],
  );

  const handleGeneratePanorama = useCallback(async () => {
    setGeneratingPanorama(true);
    try {
      const imageUrl = await actions.generatePanorama720(panoramaPrompt);
      if (imageUrl && director3dNode) loadPanoramaIntoDirector(imageUrl);
    } finally {
      setGeneratingPanorama(false);
    }
  }, [actions, director3dNode, loadPanoramaIntoDirector, panoramaPrompt]);

  const handleOpenDirector3d = useCallback(() => {
    if (!director3dNode) return;
    const directorData = (director3dNode.data ?? {}) as Record<string, unknown>;
    const project = normalizeDirectorProject(directorData.scene);
    const referenceUrl = selectedFrame?.imageUrl ?? selectedFrame?.referenceImageUrl ?? undefined;
    const panoramaUrl = payload.panorama720?.imageUrl;
    const environmentProject = panoramaUrl
      ? { ...project, panorama: { url: panoramaUrl, yaw: 0, exposure: 1 } }
      : referenceUrl && !project.panorama
        ? { ...project, panorama: { url: referenceUrl, yaw: 0, exposure: 1 } }
        : project;
    const nextProject = prepareDirectorProjectForShot(
      environmentProject,
      selectedFrame?.characterIds,
      characters,
      selectedFrame?.director3dGuide?.characterPlacements,
      selectedFrame?.characterNames,
    );
    updateNodeData(director3dNode.id, {
      linkedStoryboardPreviewId: blockId,
      linkedStoryboardPreviewFrameId: selectedFrame?.id ?? null,
      linkedShotId: selectedFrame?.sourceShotId ?? null,
    });
    openDirector3d(
      director3dNode.id,
      nextProject,
      selectedFrame?.sourceShotId,
      selectedFrame ? { previewBlockId: blockId, frameId: selectedFrame.id } : undefined,
    );
    setDirector3dHostBridge(panoramaUrl ?? referenceUrl ?? null);
  }, [
    blockId,
    characters,
    director3dNode,
    openDirector3d,
    payload.panorama720?.imageUrl,
    selectedFrame,
    setDirector3dHostBridge,
    updateNodeData,
  ]);

  const gridProps = {
    selectedFrameId: payload.selectedFrameId,
    selectedIds,
    onSelect: actions.selectFrame,
    onToggleSelect: toggleSelect,
    onToggleLock: actions.toggleLock,
    onRegenerate: actions.regenerateFrame,
    onInsertAfter: actions.insertAfter,
    onRemove: actions.removeFrame,
    onReorder: actions.reorderFrame,
  };

  const report = payload.lastConsistencyReport;
  const lowCount = report?.suggestRegenerateFrameIds?.length
    ?? payload.frames.filter((f) => f.suggestRegenerate).length;

  return (
    <div
      className={`flex flex-col w-full nodrag ${
        embedded
          ? 'h-[min(560px,62vh)] min-h-[360px] px-0 py-0'
          : 'h-[min(480px,55vh)] min-h-[320px] px-3 py-2'
      }`}
      onMouseDown={stop}
      onPointerDown={stop}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 shrink-0 h-8 px-1">
        {!embedded && (
          <GripVertical size={13} className="text-ink/20 nx9-prompt-bar-drag-handle cursor-grab" />
        )}
        <p className="flex-1 text-[13px] font-medium text-ink truncate">
          {embedded ? '关键帧预览' : (meta?.label ?? '分镜预览')}
          <span className="ml-2 text-[10px] font-normal text-ink/40">
            Video Proof · 出图 / 评分 / 批审
          </span>
        </p>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded ${
            pictureNode ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'
          }`}
        >
          {pictureNode ? '已连接图像生成' : '未连接图像生成'}
        </span>
        {director3dNode && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700">
            已连接 3D 导演台
          </span>
        )}
        {(unboundCharacterShotCount > 0 || unboundSceneShotCount > 0) && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded bg-warn/10 text-warn"
            title="在角色库/场景库补齐同名资产后，回到分镜网格点击同步重新绑定"
          >
            资产待绑定 {unboundCharacterShotCount + unboundSceneShotCount}
          </span>
        )}
        <span className="text-[10px] text-ink/45 tabular-nums">
          {summary.success}/{summary.total} · 🔒 {summary.locked}
        </span>
        {!embedded && (
          <button type="button" onClick={handleCollapse} className="p-1 rounded-lg text-ink/35 hover:text-ink">
            <ChevronDown size={15} />
          </button>
        )}
      </div>

      {report && (
        <div
          className={`shrink-0 mx-1 mb-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] ${
            (report.overallScore ?? 0) < KEYFRAME_SCORE_THRESHOLD
              ? 'border-warn/40 bg-warn/10 text-warn'
              : 'border-ok/30 bg-ok/10 text-ok'
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-semibold">
              综合 {report.overallScore}/100
              {(report.overallScore ?? 0) < KEYFRAME_SCORE_THRESHOLD ? ' · 建议重生成低分镜' : ' · 达标'}
            </span>
            {report.dimensions.map((d) => (
              <span key={d.id} className="text-ink/55">
                {d.label} {d.score}
              </span>
            ))}
            {lowCount > 0 && (
              <span className="text-warn font-medium">
                {lowCount} 镜 &lt; {KEYFRAME_SCORE_THRESHOLD} 分
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 mt-1.5 rounded-xl border border-line/35 bg-white shadow-[0_1px_8px_rgba(15,15,15,0.03)] flex flex-col overflow-hidden">
        {pictureNode && (
          <StoryboardPreviewGenSettings
            settings={payload.pictureSettings}
            onChange={actions.updatePictureSettings}
          />
        )}
        <StoryboardPreviewTimeline
          frames={payload.frames}
          totalDurationSec={payload.totalDurationSec}
          selectedFrameId={payload.selectedFrameId}
          onSelect={actions.selectFrame}
        />

        <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-line/20">
          <div className="flex rounded-lg bg-surface/80 p-0.5 border border-line/50">
            {VIEW_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={stop}
                onClick={() => actions.setViewMode(m.id)}
                className={`px-2 py-0.5 rounded-md text-[10px] nodrag ${
                  payload.viewMode === m.id ? 'bg-white text-brand shadow-sm font-medium' : 'text-ink/45'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {payload.viewMode === 'grid' && (
            <div className="flex gap-1 ml-1">
              {GRID_COLS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={stop}
                  onClick={() => actions.setGridColumns(c)}
                  className={`px-1.5 py-0.5 rounded text-[9px] border nodrag ${
                    payload.gridColumns === c
                      ? 'border-brand/40 bg-brand/10 text-brand'
                      : 'border-line text-ink/40'
                  }`}
                >
                  {c}列
                </button>
              ))}
            </div>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onMouseDown={stop}
            disabled={status === 'running'}
            onClick={() => void actions.checkConsistency('full')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-brand/10 text-brand disabled:opacity-40"
            title={`角色+场景+其它一致性 · 低于 ${KEYFRAME_SCORE_THRESHOLD} 分建议重生成`}
          >
            <Sparkles size={11} />
            关键帧评分
          </button>
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => void actions.checkConsistency('character')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-ink/50 hover:text-brand"
          >
            角色
          </button>
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => void actions.checkConsistency('scene')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-ink/50 hover:text-brand"
          >
            场景
          </button>
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => void actions.checkConsistency('other')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-ink/50 hover:text-brand"
          >
            其它
          </button>
          {lowCount > 0 && (
            <button
              type="button"
              disabled={generating}
              onMouseDown={stop}
              onClick={() => {
                const ids = report?.suggestRegenerateFrameIds
                  ?? payload.frames.filter((f) => f.suggestRegenerate).map((f) => f.id);
                setSelectedIds(new Set(ids));
                void (async () => {
                  setGenerating(true);
                  for (const id of ids) {
                    const frame = payload.frames.find((f) => f.id === id);
                    if (frame && !frame.locked) await actions.regenerateFrame(id);
                  }
                  setGenerating(false);
                  appendLog(`已对 ${ids.length} 张低分关键帧触发重生成`);
                })();
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-warn/15 text-warn disabled:opacity-40"
            >
              重生成低分镜
            </button>
          )}
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => setDirectorPanelOpen((open) => !open)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] ${
              directorPanelOpen
                ? 'bg-violet-500/10 text-violet-700 font-medium'
                : 'text-ink/50 hover:text-violet-700'
            }`}
          >
            <Box size={11} />
            3D 导演
          </button>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-3 py-1 border-b border-line/15 bg-surface/15">
          <button type="button" onMouseDown={stop} onClick={selectAll} className="text-[10px] text-ink/45 hover:text-brand">
            全选
          </button>
          <button type="button" onMouseDown={stop} onClick={clearSelection} className="text-[10px] text-ink/45 hover:text-brand">
            取消
          </button>
          <span className="text-[9px] text-ink/30">|</span>
          <button
            type="button"
            disabled={generating}
            onMouseDown={stop}
            onClick={() => void handleBatchRegenerate()}
            className="text-[10px] text-ink/45 hover:text-brand disabled:opacity-40"
          >
            批量重生
          </button>
          <button
            type="button"
            disabled={generating}
            onMouseDown={stop}
            onClick={() => actions.batchLock([...selectedIds], true)}
            className="text-[10px] text-ink/45 hover:text-brand disabled:opacity-40"
          >
            批量锁定
          </button>
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => actions.batchDelete([...selectedIds])}
            className="text-[10px] text-ink/45 hover:text-warn"
          >
            批量删除
          </button>
          <input
            type="text"
            value={batchStyle}
            onChange={(e) => setBatchStyle(e.target.value)}
            onMouseDown={stop}
            placeholder="批量风格"
            className="w-20 text-[10px] rounded border border-line/50 px-1.5 py-0.5"
          />
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => {
              if (!batchStyle.trim() || selectedIds.size === 0) return;
              actions.batchStyleReplace([...selectedIds], batchStyle.trim());
            }}
            className="text-[10px] text-ink/45 hover:text-brand"
          >
            应用风格
          </button>
          <div className="flex-1" />
          <button
            type="button"
            disabled={generating || !pictureNode}
            onMouseDown={stop}
            onClick={() => void handleGenerateAll()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand/10 text-brand text-[10px] font-medium disabled:opacity-40"
          >
            <Play size={10} fill="currentColor" />
            生成全部预览图
          </button>
          <button
            type="button"
            onMouseDown={stop}
            onClick={actions.syncFromStoryboard}
            className="px-2 py-0.5 rounded-md text-[10px] text-ink/50 hover:text-brand"
          >
            同步上游
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto nowheel overscroll-contain">
          {directorPanelOpen ? (
            <StoryboardPreviewDirector3dPanel
              frames={payload.frames}
              selectedFrameId={payload.selectedFrameId}
              panorama={payload.panorama720}
              panoramaPrompt={panoramaPrompt}
              directorData={(director3dNode?.data ?? {}) as Record<string, unknown>}
              pictureConnected={Boolean(pictureNode)}
              directorConnected={Boolean(director3dNode)}
              generatingPanorama={generatingPanorama}
              onSelectFrame={actions.selectFrame}
              onPanoramaPromptChange={setPanoramaPrompt}
              onGeneratePanorama={() => void handleGeneratePanorama()}
              onLoadPanorama={() => {
                if (payload.panorama720?.imageUrl) {
                  loadPanoramaIntoDirector(payload.panorama720.imageUrl);
                }
              }}
              onOpenDirector3d={handleOpenDirector3d}
            />
          ) : selectedFrame ? (
            <StoryboardPreviewFrameEditor
              frame={selectedFrame}
              onClose={() => actions.selectFrame(null)}
              onUpdate={(patch) => actions.updateFrame(selectedFrame.id, patch)}
              onRegenerate={() => void actions.regenerateFrame(selectedFrame.id)}
              onOpenDirector3d={handleOpenDirector3d}
              director3dConnected={Boolean(director3dNode)}
            />
          ) : payload.viewMode === 'storyboard' ? (
            <div className="p-3 space-y-3">
              {[...framesByScene.entries()].map(([scene, frames]) => (
                <div key={scene}>
                  <p className="text-[10px] font-medium text-ink/55 mb-1.5">Scene · {scene}</p>
                  <StoryboardPreviewGrid frames={frames} columns={payload.gridColumns} {...gridProps} />
                </div>
              ))}
            </div>
          ) : payload.viewMode === 'timeline' ? (
            <StoryboardPreviewGrid
              frames={[...payload.frames].sort((a, b) => a.startSec - b.startSec)}
              columns={Math.min(4, Math.max(2, payload.gridColumns)) as StoryboardPreviewGridColumns}
              {...gridProps}
            />
          ) : (
            <StoryboardPreviewGrid frames={payload.frames} columns={payload.gridColumns} {...gridProps} />
          )}
        </div>

        {payload.lastConsistencyReport && (
          <div className="shrink-0 px-3 py-1 border-t border-line/20 bg-white/70 text-[10px] text-ink/45">
            一致性 {payload.lastConsistencyReport.overallScore}/100
            {payload.lastConsistencyReport.dimensions[0]?.issues.length
              ? ` · ${payload.lastConsistencyReport.dimensions[0].issues[0].message}`
              : ' · 暂无明显问题'}
          </div>
        )}

        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-line/30 bg-surface/20">
          <p className="text-[10px] text-ink/40">
            {payload.frames.length} 张 · 总时长 {payload.totalDurationSec.toFixed(0)}s
            {pictureNode ? ' · 出图由图像生成节点执行' : ' · 请连接图像生成节点'}
          </p>
          <div className="flex-1" />
          <button
            type="button"
            disabled={!canConfirm || status === 'running' || generating}
            onClick={actions.confirmAll}
            className="px-3 py-1.5 rounded-lg bg-brand text-white text-[11px] font-medium hover:bg-brand/90 disabled:opacity-40"
          >
            提交分镜批审
          </button>
        </div>
      </div>
    </div>
  );
}
