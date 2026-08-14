import { useCallback } from 'react';
import { type NodeProps, type Node as FlowNode } from '@xyflow/react';
import {
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
  type StoryboardPreviewFrame,
  type StoryboardPreviewPayload,
  buildLineArtShotPatch,
  emptyStoryboardPreview,
  flattenScriptBreakdownShots,
  patchChainShot,
  readChainStoryboard,
  resolveStoryboardPreviewPictureSettings,
  writeBackBreakdownPreviewImage,
} from '@nx9/shared';
import {
  applyDeskBreakdown,
  copyShotInBreakdown,
  copyShotsInBreakdown,
  removeFramesForShotIds,
  removeShotFromBreakdown,
  removeShotsFromBreakdown,
  stripEpisodeConfirmation,
} from '../../../engine/storyboard-desk-runner';
import { confirmDelete } from '../../../stores/confirm-dialog';
import { useToast } from '../../../stores/toast';
import { patchShotInPayload } from './helpers';

type StoryboardShotWritebackDeps = {
  props: NodeProps;
  updateNodeData: (id: string, dataUpdate: Partial<Record<string, unknown>> | ((node: FlowNode) => Partial<Record<string, unknown>>), options?: { replace: boolean }) => void;
  getNodes: () => Array<{ id: string; data?: unknown }>;
  appendLog: (line: string) => void;
  payload: ScriptBreakdownPayload | undefined;
  currentEpisodeId: string | null;
  pushUndo: (currentPayload: ScriptBreakdownPayload | undefined) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  editingShotId: string | null;
  setEditingShotId: (id: string | null) => void;
  selectedShotIds: Set<string>;
  setSelectedShotIds: (ids: Set<string>) => void;
};

export function useStoryboardShotWritebackOps(deps: StoryboardShotWritebackDeps) {
  const {
    props,
    updateNodeData,
    getNodes,
    appendLog,
    payload,
    currentEpisodeId,
    pushUndo,
    selectedId,
    setSelectedId,
    editingShotId,
    setEditingShotId,
    selectedShotIds,
    setSelectedShotIds,
  } = deps;
  /** 写入画面 URL：拆分结构 + 故事板 + 预览帧（优先读节点最新 payload，避免批量写回被旧闭包覆盖） */
  const setShotFrameUrl = useCallback(
    (shotId: string, imageUrl: string) => {
      // SB-D-07: 单次函数式原子写 —— breakdown + frames + chain + 摘确认同一 tick 完成
      updateNodeData(props.id, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const base = (data.scriptBreakdown as ScriptBreakdownPayload | undefined) ?? payload;
        if (!base) return {};
        const nextBreakdown = writeBackBreakdownPreviewImage(base, shotId, imageUrl)
          ?? patchShotInPayload(base, shotId, {
            previewImageUrl: imageUrl,
            referenceImageUrl: imageUrl,
            status: 'previewing',
          });

        const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
        const current = raw?.version === 1 && Array.isArray(raw.frames)
          ? { ...emptyStoryboardPreview(), ...raw, pictureSettings: resolveStoryboardPreviewPictureSettings(raw) }
          : emptyStoryboardPreview();
        let frames = current.frames;
        const idx = frames.findIndex(
          (f) =>
            f.sourceShotId === shotId
            || f.id === shotId
            || f.id === `frame-${shotId}`
            || f.id === `spf-${shotId}`,
        );
        const shot = flattenScriptBreakdownShots(nextBreakdown).find((s) => s.id === shotId);
        const framePatch = {
          imageUrl,
          status: 'success' as const,
          errorMessage: null as string | null,
          promptSummary: shot?.imagePrompt || shot?.scriptText || shot?.title || '',
          stylePreset: null as string | null,
        };
        if (idx >= 0) {
          frames = frames.map((f, i) =>
            i === idx
              ? { ...f, ...framePatch }
              : f,
          );
        } else if (shot) {
          const frame: StoryboardPreviewFrame = {
            id: `spf-${shotId}`,
            order: frames.length + 1,
            label: shot.sceneCode || `Shot${shot.index}`,
            startSec: 0,
            endSec: Math.max(1, shot.durationSec || 5),
            sourceShotId: shotId,
            promptSummary: framePatch.promptSummary,
            characterNames: shot.characters,
            sceneAssetRef: shot.scene,
            imageUrl,
            status: 'success',
            locked: false,
            stylePreset: null,
          };
          frames = [...frames, frame];
        }
        // 链镜表同步只 patch 本镜 lineArtUrl，保留导演关键帧等其它字段
        let chain = readChainStoryboard(data);
        if (chain && shot) {
          chain = {
            ...chain,
            shots: patchChainShot(chain, shotId, buildLineArtShotPatch(imageUrl, shot.sketchPrompt)),
          };
        }
        return {
            ...data,
            scriptBreakdown: nextBreakdown,
            ...(chain ? { chainStoryboard: chain } : {}),
            storyboardPreview: {
              ...current,
              frames,
              confirmed: false,
            },
            ...stripEpisodeConfirmation(data, currentEpisodeId),
            previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
          };
      });
    },
    // SB-OL-05: currentEpisodeId 必须入 deps，否则切集后旧闭包会摘掉上一集的确认
    [currentEpisodeId, payload, props.id, updateNodeData],
  );

  /**
   * SB-OL-07: 删镜 / 清线稿后清理关联的 storyboardPreview 帧与 previewUrls，
   * 避免孤儿帧继续出现在拼版 / 交接 / 导演台画面。
   */
  const cleanupFramesForShots = useCallback((shotIds: string[]) => {
    updateNodeData(props.id, (node) => {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
      if (raw?.version !== 1 || !Array.isArray(raw.frames)) return data;
      const frames = removeFramesForShotIds(raw.frames, shotIds);
      if (!frames) return data;
      return {
        ...data,
        storyboardPreview: { ...raw, frames },
        previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
      };
    });
  }, [props.id, updateNodeData]);

  const handleDeleteShot = useCallback(async (shotId: string) => {
    if (!payload) return;
    const ep = payload.episodes.find((e) => e.shots.some((s) => s.id === shotId));
    if (!ep) return;
    if (ep.shots.length <= 1) {
      appendLog('不能删除本集唯一镜头');
      return;
    }
    const shot = ep.shots.find((s) => s.id === shotId);
    const ok = await confirmDelete({
      title: '删除本镜？',
      description: shot?.sceneCode
        ? `确认删除 ${shot.sceneCode} ${shot.title || ''}？删除后可用撤销恢复镜表与确认态。`
        : '确认删除此镜头？删除后可用撤销恢复镜表与确认态。',
    });
    if (!ok) return;
    pushUndo(payload);
    const next = removeShotFromBreakdown(payload, shotId);
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    cleanupFramesForShots([shotId]);
    if (selectedId === shotId) setSelectedId(null);
    if (editingShotId === shotId) setEditingShotId(null);
    appendLog(`已删除镜 · ${shot?.sceneCode || shotId}`);
  }, [appendLog, cleanupFramesForShots, currentEpisodeId, editingShotId, payload, pushUndo, props.data, props.id, selectedId, updateNodeData]);

  /**
   * X-17 / SB-OL-03: 清除本镜线稿。
   * 除拆分结构的 previewImageUrl/referenceImageUrl/sketchUrl 外，
   * 还必须移除 storyboardPreview 里的对应帧，否则 isShotComposed 仍判定「已成图」，
   * 拼版/交接会继续引用被清除的旧图。chain 的 lineArtUrl 由 applyDeskBreakdown
   * 重建时按空 previewImageUrl 覆盖，无需单独处理。
   */
  const handleClearLineArt = useCallback(async (shotId: string) => {
    const livePayload = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.scriptBreakdown as ScriptBreakdownPayload | undefined;
    const base = livePayload ?? payload;
    if (!base) return;
    const ok = await confirmDelete({
      title: '清除本镜线稿？',
      description: '将清空该镜头已生成的线稿图，可重新生成。',
    });
    if (!ok) return;
    const next = patchShotInPayload(base, shotId, {
      previewImageUrl: null,
      referenceImageUrl: null,
      sketchUrl: null,
    } as Partial<ScriptBreakdownShot>);
    // SB-D-08: 清线稿入撤销栈；SB-D-12: 无图语义统一 null
    pushUndo(base);
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    cleanupFramesForShots([shotId]);
    appendLog(`已清除线稿 · ${shotId}`);
  }, [appendLog, cleanupFramesForShots, currentEpisodeId, getNodes, payload, props.data, props.id, pushUndo, updateNodeData]);

  /** G-03: 复制当前选中镜 */
  const handleCopyShot = useCallback((shotId: string) => {
    if (!payload || !currentEpisodeId) return;
    // SB-D-02/05: 复制镜清空线稿媒体字段并深拷贝重排，不就地改原 payload
    const next = copyShotInBreakdown(payload, currentEpisodeId, shotId);
    if (next === payload) return;
    pushUndo(payload);
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    appendLog(`已复制镜 · ${shotId} → 新镜（缺图 draft）`);
  }, [appendLog, currentEpisodeId, payload, props.data, props.id, pushUndo, updateNodeData]);

  /** G-03: 批量复制选中镜 */
  const handleCopySelected = useCallback(() => {
    if (!payload || !currentEpisodeId || selectedShotIds.size === 0) return;
    // SB-D-02/05: 批量复制同样清空媒体字段并深拷贝
    const next = copyShotsInBreakdown(payload, currentEpisodeId, [...selectedShotIds]);
    if (next === payload) return;
    pushUndo(payload);
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    setSelectedShotIds(new Set());
    appendLog(`已批量复制 · ${selectedShotIds.size} 镜（缺图 draft）`);
  }, [appendLog, currentEpisodeId, payload, props.data, props.id, pushUndo, selectedShotIds, updateNodeData]);

  /** G-03: 批量删除选中镜 */
  const handleDeleteSelected = useCallback(async () => {
    if (!payload || !currentEpisodeId || selectedShotIds.size === 0) return;
    const episode = payload.episodes.find((ep) => ep.id === currentEpisodeId);
    if (!episode) return;
    const willRemainCount = episode.shots.length - selectedShotIds.size;
    if (willRemainCount <= 0) {
      useToast.getState().push({ message: '不能删除本集全部镜头，请保留至少 1 镜', variant: 'error' });
      return;
    }
    const ok = await confirmDelete({ title: `删除 ${selectedShotIds.size} 镜？`, description: '删除后可用撤销恢复镜表、预览与确认态。', confirmLabel: '确认删除' });
    if (!ok) return;
    // SB-D-05: 深拷贝后删除，不就地改原 payload
    const next = removeShotsFromBreakdown(payload, currentEpisodeId, selectedShotIds);
    if (next === payload) return;
    pushUndo(payload);
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    cleanupFramesForShots([...selectedShotIds]);
    setSelectedShotIds(new Set());
    const firstRemaining = next.episodes.find((ep) => ep.id === currentEpisodeId)?.shots[0]?.id ?? null;
    if (selectedId && selectedShotIds.has(selectedId)) setSelectedId(firstRemaining);
    appendLog(`已批量删除 · ${selectedShotIds.size} 镜`);
  }, [appendLog, cleanupFramesForShots, currentEpisodeId, payload, props.data, props.id, pushUndo, selectedId, selectedShotIds, updateNodeData]);

  return {
    setShotFrameUrl,
    cleanupFramesForShots,
    handleDeleteShot,
    handleClearLineArt,
    handleCopyShot,
    handleCopySelected,
    handleDeleteSelected,
  };
}
