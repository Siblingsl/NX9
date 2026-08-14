import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, ChevronDown, GripVertical, Play, Sparkles } from 'lucide-react';
import {
  KEYFRAME_SCORE_THRESHOLD,
  lookupBlock,
  STORYBOARD_GUIDE_KINDS,
  scopeStoryboardPreviewFrames,
  storyboardPreviewSummary,
  type StoryboardGuideKind,
  type StoryboardPreviewGridColumns,
  type StoryboardPreviewViewMode,
} from '@nx9/shared';
import { useReactFlow } from '@xyflow/react';
import { normalizeDirectorProject } from '@nx9/director3d';
import { useDeckUi } from '../../../stores/deck-ui';
import { useActivityLog } from '../../../../../stores/activity-log';
import { DIRECTOR_3D_ENABLED } from '../../../../director3d-feature';
import { openDirector3dStage } from '../../../../director3d-open';
import { useStoryboardGuidePrefs } from '../../../../../stores/storyboard-guide-prefs';
import {
  buildContactSheetSignature,
  useStoryboardPreviewState,
} from './useStoryboardPreviewState';
import { StoryboardPreviewGrid } from './StoryboardPreviewGrid';
import { StoryboardContactSheet } from './StoryboardContactSheet';
import { StoryboardPreviewTimeline } from './StoryboardPreviewTimeline';
import { StoryboardPreviewFrameEditor } from './StoryboardPreviewFrameEditor';
import { StoryboardPreviewGenSettings } from './StoryboardPreviewGenSettings';
import { StoryboardPreviewDirector3dPanel } from './StoryboardPreviewDirector3dPanel';
import { VideoPopover } from '../generation/video/VideoPopover';
import '../../../../../styles/storyboard-board.css';
import '../../../../../styles/keyframe-preview.css';

const GUIDE_LEGEND_SHORT: { kind: StoryboardGuideKind; label: string }[] = [
  { kind: 'action', label: '红=动作' },
  { kind: 'camera', label: '蓝=机位' },
  { kind: 'light', label: '橙=照明' },
  { kind: 'compose', label: '绿=构图' },
  { kind: 'emotion', label: '紫=情绪/台词' },
  { kind: 'label', label: '黑=镜头说明' },
];

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const VIEW_MODES: { id: StoryboardPreviewViewMode; label: string }[] = [
  { id: 'grid', label: '宫格' },
  { id: 'timeline', label: '时间轴' },
  { id: 'storyboard', label: '分场' },
];

const GRID_COLS: StoryboardPreviewGridColumns[] = [2, 3, 4];

export interface StoryboardPreviewWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
  /** 内嵌于分镜台 ScreenModal 时隐藏底栏拖拽头，加高内容区 */
  embedded?: boolean;
  /** X-16: 按当前集过滤 frames，仅展示属于这些 shotId 的帧 */
  episodeShotIds?: Set<string>;
}

export function StoryboardPreviewWorkspace({
  blockId,
  kind,
  onCollapse,
  embedded = false,
  episodeShotIds,
}: StoryboardPreviewWorkspaceProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const appendLog = useActivityLog((s) => s.append);
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow();
  const guideShowOverlay = useStoryboardGuidePrefs((s) => s.showOverlay);
  const guideUseForVideo = useStoryboardGuidePrefs((s) => s.useForVideo);
  const guideKindsMap = useStoryboardGuidePrefs((s) => s.kinds);
  const setGuideShowOverlay = useStoryboardGuidePrefs((s) => s.setShowOverlay);
  const setGuideUseForVideo = useStoryboardGuidePrefs((s) => s.setUseForVideo);
  const toggleGuideKind = useStoryboardGuidePrefs((s) => s.toggleKind);
  const actions = useStoryboardPreviewState(blockId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStyle, setBatchStyle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [directorPanelOpen, setDirectorPanelOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideBtnRef = useRef<HTMLButtonElement>(null);
  const [panoramaPrompt, setPanoramaPrompt] = useState('');
  const [generatingPanorama, setGeneratingPanorama] = useState(false);
  const [composingSheet, setComposingSheet] = useState(false);
  /** 宫格模式：合成大图（默认）| 分格编辑 */
  const [gridEditMode, setGridEditMode] = useState(false);

  const guideKinds = useMemo(
    () => STORYBOARD_GUIDE_KINDS.filter((k) => guideKindsMap[k] !== false),
    [guideKindsMap],
  );

  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const payload = actions.readPayload(data);
  const meta = lookupBlock(kind);
  const status = (data.status as string) ?? 'idle';
  /** X-16: 按当前集过滤 frames */
  const displayFrames = useMemo(
    () => scopeStoryboardPreviewFrames(payload.frames, episodeShotIds),
    [payload.frames, episodeShotIds],
  );
  const summary = storyboardPreviewSummary(payload);
  const displaySummary = useMemo(() => {
    if (!episodeShotIds || episodeShotIds.size === 0) return summary;
    const total = displayFrames.length;
    const success = displayFrames.filter((f) => f.status === 'success' || f.status === 'locked').length;
    const locked = displayFrames.filter((f) => f.locked).length;
    return { total, success, locked, ready: total > 0 && success === total && Boolean(payload?.confirmed) };
  }, [displayFrames, episodeShotIds, summary, payload?.confirmed]);
  const canConfirmDisplay = displayFrames.length > 0
    && displayFrames.every((frame) => frame.status === 'success' || frame.status === 'locked');
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
    const visibleIds = new Set(displayFrames.map((frame) => frame.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [displayFrames]);

  useEffect(() => {
    if (!pictureNode) return;
    actions.syncPictureSettingsToExecNode({ model, pictureGenMode, quality, aspectRatio });
  }, [actions.syncPictureSettingsToExecNode, pictureNode?.id, model, pictureGenMode, quality, aspectRatio]);

  useEffect(() => {
    const hasUpstream = Boolean(actions.upstreamBreakdown?.episodes?.some((ep) => ep.shots.length > 0));
    const hasSource =
      actions.shotCount > 0 || hasUpstream || actions.localBreakdownShotCount > 0;
    if (payload.frames.length === 0 && hasSource) {
      actions.syncFromStoryboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once when shots available
  }, [
    blockId,
    actions.shotCount,
    actions.localBreakdownShotCount,
    actions.upstreamBreakdown,
    payload.frames.length,
  ]);

  useEffect(() => {
    if (actions.shotCount > 0 || actions.localBreakdownShotCount > 0) {
      actions.syncFromStoryboard();
    }
    // activeEpisodeId 是唯一切集触发器；syncFromStoryboard 本身保持稳定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions.activeEpisodeId]);

  const framesByScene = useMemo(() => {
    const map = new Map<string, typeof displayFrames>();
    for (const f of displayFrames) {
      const key = f.sceneCode ?? f.sceneId ?? '未分场';
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return map;
  }, [displayFrames]);

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
    setSelectedIds(new Set(displayFrames.map((f) => f.id)));
  }, [displayFrames]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBatchRegenerate = useCallback(async () => {
    const scopeIds = new Set(displayFrames.map((f) => f.id));
    const ids = selectedIds.size > 0
      ? [...selectedIds].filter((id) => scopeIds.has(id))
      : [...scopeIds];
    const unlocked = displayFrames.filter(
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
  }, [actions, appendLog, displayFrames, selectedIds]);

  const handleGenerateAll = useCallback(async () => {
    setGenerating(true);
    await actions.generateAllFrames(true, displayFrames.map((frame) => frame.id));
    setGenerating(false);
  }, [actions, displayFrames]);

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
    openDirector3dStage({
      blockId: director3dNode.id,
      nodes: getNodes(),
      edges: getEdges(),
      updateNodeData,
      frameIdOverride: selectedFrame?.id ?? null,
    });
  }, [director3dNode, getEdges, getNodes, selectedFrame?.id, updateNodeData]);

  const shotById = useMemo(
    () => new Map(actions.shots.map((shot) => [shot.id, shot])),
    [actions.shots],
  );

  const gridProps = {
    shotById,
    selectedFrameId: payload.selectedFrameId,
    selectedIds,
    showGuide: guideShowOverlay,
    guideKinds,
    onSelect: actions.selectFrame,
    onToggleSelect: toggleSelect,
    onToggleLock: actions.toggleLock,
    onRegenerate: actions.regenerateFrame,
    onInsertAfter: actions.insertAfter,
    onRemove: actions.removeFrame,
    onReorder: actions.reorderFrame,
  };

  const report =
    payload.frames.length > 0 && payload.lastConsistencyReport
      ? payload.lastConsistencyReport
      : null;
  const lowCount = report?.suggestRegenerateFrameIds?.length
    ?? payload.frames.filter((f) => f.suggestRegenerate).length;
  const scoreLow = report ? (report.overallScore ?? 0) < KEYFRAME_SCORE_THRESHOLD : false;
  const hasFrames = displayFrames.length > 0;
  const missingCount = Math.max(0, (episodeShotIds && episodeShotIds.size > 0 ? displaySummary : summary).total - (episodeShotIds && episodeShotIds.size > 0 ? displaySummary : summary).success);
  const readyImageCount = payload.frames.filter((f) => Boolean(f.imageUrl)).length;
  const contactSig = useMemo(
    () => buildContactSheetSignature(payload.frames, payload.gridColumns),
    [payload.frames, payload.gridColumns],
  );

  /** 大图模式不保留单镜选中，避免切回关键帧时误开编辑器 */
  useEffect(() => {
    if (payload.viewMode === 'grid' && !gridEditMode && payload.selectedFrameId) {
      actions.selectFrame(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 进入大图时清选中
  }, [payload.viewMode, gridEditMode]);

  /** 后台合成可下载的宫格大图（不阻塞主视图） */
  useEffect(() => {
    if (!hasFrames) return;
    if (readyImageCount === 0) {
      if (payload.contactSheetUrl) {
        actions.patchPayload({ contactSheetUrl: null, contactSheetSignature: null });
      }
      return;
    }
    if (payload.contactSheetSignature === contactSig && payload.contactSheetUrl) return;
    let cancelled = false;
    setComposingSheet(true);
    void actions.composeContactSheet(false).finally(() => {
      if (!cancelled) setComposingSheet(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅签名/出图数变化时重合成
  }, [contactSig, readyImageCount, hasFrames]);

  const handleRegenLow = useCallback(() => {
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
  }, [actions, appendLog, payload.frames, report?.suggestRegenerateFrameIds]);

  /** 大图模式不自动进编辑器；点格会切到分格再编辑 */
  const allowFrameEditor = Boolean(selectedFrame) && (gridEditMode || payload.viewMode !== 'grid');

  const stageBody = directorPanelOpen && !embedded ? (
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
  ) : allowFrameEditor && selectedFrame ? (
    <StoryboardPreviewFrameEditor
      frame={selectedFrame}
      onClose={() => actions.selectFrame(null)}
      onUpdate={(patch) => actions.updateFrame(selectedFrame.id, patch)}
      onRegenerate={() => void actions.regenerateFrame(selectedFrame.id)}
      onOpenDirector3d={handleOpenDirector3d}
      director3dConnected={Boolean(director3dNode)}
    />
  ) : !hasFrames ? (
    <div className="kp__empty">
      <h3>{embedded ? '线稿预览' : '尚无关键帧'}</h3>
      <p>
        {!pictureNode
          ? '请先在分镜台节点顶部能力口连接「图像生成」，再同步镜头并出图。'
          : actions.localBreakdownShotCount > 0 || actions.shotCount > 0
            ? '镜头已就绪，点击同步载入宫格，再一键生成预览图。箭头导引仅叠在预览上，不会画进首帧像素。'
            : '从故事板 / 剧本拆分同步镜头后，一键生成全部预览图。'}
      </p>
      <div className="kp__empty-acts">
        <button type="button" className="kp__btn" onMouseDown={stop} onClick={actions.syncFromStoryboard}>
          同步镜头
        </button>
        <button
          type="button"
          className="kp__btn is-solid"
          disabled={generating || !pictureNode}
          onMouseDown={stop}
          onClick={() => void handleGenerateAll()}
        >
          <Play size={11} fill="currentColor" />
          生成全部预览图
        </button>
      </div>
    </div>
  ) : payload.viewMode === 'storyboard' ? (
    <div className="p-3 space-y-4">
      {[...framesByScene.entries()].map(([scene, frames]) => (
        <div key={scene}>
          <p className="kp__scene-label">Scene · {scene}</p>
          <StoryboardPreviewGrid frames={frames} columns={payload.gridColumns} {...gridProps} />
        </div>
      ))}
    </div>
  ) : payload.viewMode === 'timeline' ? (
    <StoryboardPreviewGrid
      frames={[...displayFrames].sort((a, b) => a.startSec - b.startSec)}
      columns={Math.min(4, Math.max(2, payload.gridColumns)) as StoryboardPreviewGridColumns}
      {...gridProps}
    />
  ) : gridEditMode ? (
    <StoryboardPreviewGrid frames={displayFrames} columns={payload.gridColumns} {...gridProps} />
  ) : (
    <StoryboardContactSheet
      frames={displayFrames}
      columns={payload.gridColumns}
      shotById={shotById}
      showGuide={guideShowOverlay}
      guideKinds={guideKinds}
      composedUrl={payload.contactSheetUrl}
      composing={composingSheet}
      onSelectFrame={(id) => {
        setGridEditMode(true);
        actions.selectFrame(id);
      }}
    />
  );

  return (
    <div
      className={`kp nodrag ${embedded ? 'is-embedded' : ''}`}
      onMouseDown={stop}
      onPointerDown={stop}
      onWheel={(e) => e.stopPropagation()}
    >
      {!embedded ? (
        <div className="kp__top">
          <div className="kp__identity">
            <div className="flex items-center gap-2 min-w-0">
              <GripVertical size={13} className="text-ink/25 nx9-prompt-bar-drag-handle cursor-grab shrink-0" />
              <p className="kp__title truncate">{meta?.label ?? '分镜预览'}</p>
              <button type="button" onClick={handleCollapse} className="kp__btn is-ghost" style={{ padding: 4 }}>
                <ChevronDown size={15} />
              </button>
            </div>
            <p className="kp__sub">Video Proof · 出图 / 导引 / 评分 · 提交批审</p>
          </div>

          <div className="kp__chips">
            <span className="kp__chip is-accent">
              {displaySummary.success}/{displaySummary.total || 0} 已出
            </span>
            {missingCount > 0 && <span className="kp__chip is-warn">缺 {missingCount}</span>}
            {displaySummary.locked > 0 && <span className="kp__chip">锁 {displaySummary.locked}</span>}
            <span className={`kp__chip ${pictureNode ? 'is-ok' : 'is-warn'}`}>
              {pictureNode ? '图像已连' : '未连图像'}
            </span>
            {director3dNode && <span className="kp__chip">3D 已连</span>}
            {(unboundCharacterShotCount > 0 || unboundSceneShotCount > 0) && (
              <span
                className="kp__chip is-warn"
                title="在角色库/场景库补齐同名资产后，回到分镜网格同步重新绑定"
              >
                资产待绑 {unboundCharacterShotCount + unboundSceneShotCount}
              </span>
            )}
            {report && (
              <span className={`kp__chip ${scoreLow ? 'is-warn' : 'is-ok'}`}>
                评分 {report.overallScore}
              </span>
            )}
          </div>

          <div className="kp__primary">
            <button
              type="button"
              className="kp__btn is-primary"
              disabled={generating || !pictureNode || status === 'running'}
              onMouseDown={stop}
              onClick={() => void handleGenerateAll()}
            >
              <Play size={11} fill="currentColor" />
              {hasFrames && missingCount > 0 ? `补生成 · ${missingCount}` : '生成全部'}
            </button>
            <button
              type="button"
              className="kp__btn"
              disabled={status === 'running' || !hasFrames}
              onMouseDown={stop}
              onClick={() => void actions.checkConsistency('full')}
              title={`角色+场景+其它 · 低于 ${KEYFRAME_SCORE_THRESHOLD} 建议重生成`}
            >
              <Sparkles size={12} />
              评分
            </button>
            {lowCount > 0 && (
              <button
                type="button"
                className="kp__btn is-warn"
                disabled={generating}
                onMouseDown={stop}
                onClick={handleRegenLow}
              >
                重生低分 · {lowCount}
              </button>
            )}
            <button
              type="button"
              className="kp__btn is-solid"
              disabled={!canConfirmDisplay || status === 'running' || generating}
              onMouseDown={stop}
              onClick={() => actions.confirmAll(displayFrames.map((frame) => frame.id))}
            >
              提交批审
            </button>
          </div>
        </div>
      ) : (
        (missingCount > 0 || unboundCharacterShotCount > 0 || unboundSceneShotCount > 0) && (
          <div className="kp__top kp__top--embedded-alerts">
            <div className="kp__chips">
              {missingCount > 0 && <span className="kp__chip is-warn">缺 {missingCount}</span>}
              {(unboundCharacterShotCount > 0 || unboundSceneShotCount > 0) && (
                <span
                  className="kp__chip is-warn"
                  title="在角色库/场景库补齐同名资产后，回到分镜网格同步重新绑定"
                >
                  资产待绑 {unboundCharacterShotCount + unboundSceneShotCount}
                </span>
              )}
            </div>
          </div>
        )
      )}

      {report && !embedded && (
        <div className={`kp__score ${scoreLow ? 'is-low' : 'is-ok'}`}>
          <span className="kp__score-main">
            综合 {report.overallScore}/100
            {scoreLow ? ` · 建议重生成低分镜` : ' · 达标'}
          </span>
          {report.dimensions.map((d) => (
            <span key={d.id} className="kp__score-dim">
              {d.label} {d.score}
            </span>
          ))}
        </div>
      )}

      <div className={`kp__toolbar ${embedded ? 'kp__toolbar--compact' : ''}`}>
        <div className="kp__seg">
          {VIEW_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={stop}
              className={payload.viewMode === m.id ? 'is-on' : ''}
              onClick={() => actions.setViewMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {(payload.viewMode === 'grid' || payload.viewMode === 'storyboard') && (
          <>
            <span className="kp__sep" aria-hidden />
            <div className="kp__cols">
              {GRID_COLS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={stop}
                  className={payload.gridColumns === c ? 'is-on' : ''}
                  onClick={() => actions.setGridColumns(c)}
                >
                  {c}列
                </button>
              ))}
            </div>
          </>
        )}
        {payload.viewMode === 'grid' && (
          <>
            <span className="kp__sep" aria-hidden />
            <div className="kp__seg">
              <button
                type="button"
                onMouseDown={stop}
                className={!gridEditMode ? 'is-on' : ''}
                title="已出图合成一张宫格大图"
                onClick={() => setGridEditMode(false)}
              >
                大图
              </button>
              <button
                type="button"
                onMouseDown={stop}
                className={gridEditMode ? 'is-on' : ''}
                title="分格编辑单镜"
                onClick={() => setGridEditMode(true)}
              >
                分格
              </button>
            </div>
          </>
        )}

        <div className="kp__toolbar-spacer" />

        <div className="kp__toolbar-acts">
          <button
            ref={guideBtnRef}
            type="button"
            className={`kp__btn ${guideOpen || guideShowOverlay || guideUseForVideo ? 'is-on' : ''}`}
            onMouseDown={stop}
            onClick={() => setGuideOpen((v) => !v)}
            title="箭头导引与色标过滤"
          >
            导引{guideShowOverlay ? '开' : '关'}
          </button>
          <VideoPopover
            open={guideOpen}
            onClose={() => setGuideOpen(false)}
            anchorRef={guideBtnRef}
            width={300}
            align="end"
            tone="desk"
          >
            <div className="kp__guide-popover" title="箭头仅作导引；关键帧像素干净；出视频用引导图但成片不画箭头">
              <div className="kp__guide-popover__toggles">
                <button
                  type="button"
                  onMouseDown={stop}
                  onClick={() => setGuideShowOverlay(!guideShowOverlay)}
                  className={`sb-guide-toggle ${guideShowOverlay ? 'is-on' : ''}`}
                >
                  导引 {guideShowOverlay ? '开' : '关'}
                </button>
                <button
                  type="button"
                  onMouseDown={stop}
                  onClick={() => setGuideUseForVideo(!guideUseForVideo)}
                  className={`sb-guide-toggle ${guideUseForVideo ? 'is-on' : ''}`}
                  title={
                    guideUseForVideo
                      ? '出视频时合成带箭头引导图（成片仍不画箭头）'
                      : '出视频仅用干净首帧'
                  }
                >
                  视频引导 {guideUseForVideo ? '开' : '关'}
                </button>
              </div>
              <div className="kp__guide-popover__kinds">
                {GUIDE_LEGEND_SHORT.map((item) => {
                  const on = guideKindsMap[item.kind] !== false;
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      data-k={item.kind}
                      disabled={!guideShowOverlay && !guideUseForVideo}
                      onMouseDown={stop}
                      onClick={() => toggleGuideKind(item.kind)}
                      className={`sb-guide-kind ${on ? 'is-on' : 'is-off'}`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </VideoPopover>

           {!embedded && (
             <button
               type="button"
               className={`kp__btn ${directorPanelOpen ? 'is-on' : ''}`}
               onMouseDown={stop}
               onClick={() => setDirectorPanelOpen((v) => !v)}
               disabled={!DIRECTOR_3D_ENABLED}
               title={DIRECTOR_3D_ENABLED ? undefined : '3D 导演台暂未开放'}
             >
               <Box size={12} />
               {DIRECTOR_3D_ENABLED ? '3D 导演台' : '3D 暂未开放'}
             </button>
          )}
          <button
            type="button"
            className={`kp__btn ${batchOpen ? 'is-on' : ''}`}
            onMouseDown={stop}
            onClick={() => setBatchOpen((v) => !v)}
          >
            批量
            {selectedIds.size > 0 ? ` · ${selectedIds.size}` : ''}
          </button>
          <button type="button" className="kp__link" onMouseDown={stop} onClick={actions.syncFromStoryboard}>
            同步
          </button>
        </div>

        {!embedded && pictureNode ? (
          <>
            <span className="kp__sep" aria-hidden />
            <div className="kp__gen kp__gen--inline">
              <StoryboardPreviewGenSettings
                settings={payload.pictureSettings}
                onChange={actions.updatePictureSettings}
                hideModel={false}
                modelWidth={260}
                endSlot={(
                  <button
                    type="button"
                    className="kp__btn"
                    disabled={!payload.contactSheetUrl}
                    onMouseDown={stop}
                    title={payload.contactSheetUrl ? '下载已合成的宫格/故事板大图' : '尚无合成大图可导出'}
                    onClick={() => {
                      if (!payload.contactSheetUrl) return;
                      const a = document.createElement('a');
                      a.href = payload.contactSheetUrl;
                      a.download = `storyboard-${Date.now()}.png`;
                      a.target = '_blank';
                      a.rel = 'noreferrer';
                      a.click();
                    }}
                  >
                    导出图片
                  </button>
                )}
              />
            </div>
          </>
        ) : null}
      </div>

      {batchOpen && (
        <div className="kp__toolbar" style={{ borderRadius: 0, borderTop: 'none', paddingTop: 6, paddingBottom: 6 }}>
          <button type="button" className="kp__link" onMouseDown={stop} onClick={selectAll}>
            全选
          </button>
          <button type="button" className="kp__link" onMouseDown={stop} onClick={clearSelection}>
            取消
          </button>
          <span className="kp__sep" />
          <button
            type="button"
            className="kp__link"
            disabled={generating}
            onMouseDown={stop}
            onClick={() => void handleBatchRegenerate()}
          >
            批量重生
          </button>
          <button
            type="button"
            className="kp__link"
            disabled={generating}
            onMouseDown={stop}
            onClick={() => actions.batchLock([...selectedIds], true)}
          >
            锁定
          </button>
          <button
            type="button"
            className="kp__link is-danger"
            onMouseDown={stop}
            onClick={() => actions.batchDelete([...selectedIds])}
          >
            删除
          </button>
          <span className="kp__sep" />
          <input
            type="text"
            className="kp__style-input"
            value={batchStyle}
            onChange={(e) => setBatchStyle(e.target.value)}
            onMouseDown={stop}
            placeholder="批量风格"
          />
          <button
            type="button"
            className="kp__link"
            onMouseDown={stop}
            onClick={() => {
              if (!batchStyle.trim() || selectedIds.size === 0) return;
              actions.batchStyleReplace([...selectedIds], batchStyle.trim());
            }}
          >
            应用风格
          </button>
          <span className="kp__sep" />
          <button
            type="button"
            className="kp__link"
            onMouseDown={stop}
            onClick={() => void actions.checkConsistency('character')}
          >
            角色分
          </button>
          <button
            type="button"
            className="kp__link"
            onMouseDown={stop}
            onClick={() => void actions.checkConsistency('scene')}
          >
            场景分
          </button>
          <button
            type="button"
            className="kp__link"
            onMouseDown={stop}
            onClick={() => void actions.checkConsistency('other')}
          >
            其它分
          </button>
        </div>
      )}

      <div className="kp__stage sb-board">
        {payload.viewMode === 'timeline' && hasFrames && !selectedFrame && !directorPanelOpen && (
          <div className="kp__timeline">
            <StoryboardPreviewTimeline
              frames={displayFrames}
              totalDurationSec={payload.totalDurationSec}
              selectedFrameId={payload.selectedFrameId}
              onSelect={actions.selectFrame}
            />
          </div>
        )}
        <div className="kp__stage-scroll nowheel">{stageBody}</div>
      </div>

      <div className="kp__foot">
        <p className="kp__foot-meta">
          {displayFrames.length} 镜 · {payload.totalDurationSec.toFixed(0)}s
          {pictureNode ? ' · 出图经图像生成节点' : ' · 请连接图像生成'}
          {selectedIds.size > 0 ? ` · 已选 ${selectedIds.size}` : ''}
        </p>
      </div>
    </div>
  );
}
