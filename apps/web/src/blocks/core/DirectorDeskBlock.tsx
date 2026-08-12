import { memo, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { type Edge, type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { normalizeDirectorProject } from '@nx9/director3d';
import { describeKeyframeColorCheck, type DirectorKeyframeBatch } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useStoryboardUi } from '../../stores/flow-runtime';
import { checkAssetReadinessInEdges } from '../../engine/asset-readiness';
import {
  migrateUpstreamChainStoryboard,
  persistUpstreamChainHygiene,
  resolveUpstreamChainDesk,
} from '../../engine/chain-storyboard-utils';
import { askConfirm } from '../../stores/confirm-dialog';
import {
  findDirectorClipGenNode,
  findDirectorPictureGenNode,
  approveAllDirectorKeyframes,
  approveDirectorKeyframe,
  unapproveDirectorKeyframe,
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
  resolveDirectorQueueShots,
  previewDirectorReferenceGaps,
  resolveDirectorRunContext,
  syncStyleToPictureGen,
  type DirectorDeskQueueFilter,
  type DirectorDeskShotResult,
  type DirectorShotPhase,
} from '../../engine/director-desk-runner';
import {
  applySplitMixedDirector3dGraph,
  needsDirector3dSplit,
  splitMixedDirector3dNode,
} from '../../engine/director3d-split';
import { Director3dStageEmbed } from './director-desk/director-3d-stage-embed';
import { DIRECTOR_3D_ENABLED } from '../../engine/director3d-feature';
import { DirectorFilmstrip } from './director-desk/director-filmstrip';
import { DirectorMainPanel } from './director-desk/director-main-panel';
import { DirectorDeliverTab } from './director-desk/director-deliver-tab';
import { buildBatchOpts, buildDirectorBatchLabel } from './director-desk/director-batch-opts';
import { describeDirectorKeyframeBatchStatus } from '../../engine/director-keyframe-batch-runner';
import './director-desk.css';
import './director-desk.v2.css';


function DirectorDeskBlock(props: NodeProps) {
  const { updateNodeData, fitView, getNodes, setNodes, setEdges } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const appendLog = useActivityLog((s) => s.append);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  // 勿在 selector 内 `?? []`：每次新建数组会使 getSnapshot 不稳定 → 无限重渲染
  const environmentLibrary = useWorkspaceDocument((s) => s.environments);
  const environments = useMemo(() => environmentLibrary?.environments ?? [], [environmentLibrary]);
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
  const preferLineArtRef = (data.preferLineArtRef as boolean | undefined) ?? true;
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
  const needs3dSplit = useMemo(
    () => needsDirector3dSplit(props.type, data),
    [props.type, data],
  );

  useEffect(() => {
    migrateUpstreamChainStoryboard(
      updateNodeData,
      props.id,
      nodes as any,
      edges as any,
      storyboard,
    );
    persistUpstreamChainHygiene(
      updateNodeData,
      props.id,
      nodes as any,
      edges as any,
    );
  }, [edges, nodes, props.id, storyboard, updateNodeData]);

  const runContext = useMemo(
    () => resolveDirectorRunContext({
      deskBlockId: props.id,
      nodes,
      edges,
      blockData: data,
      updateNodeData: (id, patch) => updateNodeData(id, patch),
      getLatestNodes: getNodes,
      updateNodeDataAtomically: (id, updater) => updateNodeData(id, updater as any),
    }),
    [props.id, nodes, edges, data, updateNodeData, getNodes],
  );
  const chain = runContext.chain;
  const upstreamDeskId = runContext.sourceDeskId;
  const upstreamDeskData = runContext.sourceDeskData;

  // X-41: 从 lastHandoff 读取当前集
  const handoffEpisodeId = useMemo(
    () => (data.lastHandoff as Record<string, unknown> | undefined)?.episodeId as string | undefined,
    [data.lastHandoff],
  );
  const episodeId = runContext.episodeId ?? handoffEpisodeId ?? chain?.activeEpisodeId;
  const episodeArtDirection = useMemo(
    () => chain?.episodes?.find((episode) => episode.id === episodeId)?.artDirection,
    [chain, episodeId],
  );
  const handoffValidation = runContext.handoffValidation;
  useEffect(() => {
    if (!data.lastHandoff || handoffValidation.valid || data.lastHandoffStatus === 'stale') return;
    updateNodeData(props.id, {
      lastHandoffStatus: 'stale',
      lastHandoffInvalidReason: handoffValidation.reason,
    });
  }, [data.lastHandoff, data.lastHandoffStatus, handoffValidation, props.id, updateNodeData]);

  // X-26: 解析上游 desk 标题
  const upstreamDeskTitle = useMemo(() => {
    if (!upstreamDeskId) return undefined;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const deskNode = nodeMap.get(upstreamDeskId);
    const deskData = deskNode?.data as Record<string, unknown> | undefined;
    return (deskData?.chainStoryboard as Record<string, unknown> | undefined)?.title as string | undefined
      || deskData?.title as string | undefined
      || data.sourceDeskName as string | undefined;
  }, [upstreamDeskId, nodes, data.sourceDeskName]);

  const activeShots = runContext.shots;
  const lineArtByShotId = runContext.lineArtByShotId;
  const episodeConfirmed = runContext.episodeConfirmed;

  const lineArtCount = Object.keys(lineArtByShotId).length;
  const episodeScopeInvalid = runContext.blockCode === 'missing-episode'
    || runContext.blockCode === 'empty-episode';

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [runningShotId, setRunningShotId] = useState<string | null>(null);
  const [phaseHint, setPhaseHint] = useState<string>('');
  const [liveProgress, setLiveProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<'produce' | 'stage3d' | 'deliver'>('produce');
  const [previewMode, setPreviewMode] = useState<'keyframe' | 'lineart' | 'guide3d' | 'compare'>('compare');
  const [immersed3d, setImmersed3d] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});
  const [rejectEditingId, setRejectEditingId] = useState<string | null>(null);
  const [rejectBusyId, setRejectBusyId] = useState<string | null>(null);
  const abortRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const failedCountRef = useRef(0);

  const stats = useMemo(() => summarizeDirectorQueue(activeShots), [activeShots]);
  const queueCounts = useMemo(() => ({
    missing: activeShots.filter((shot) => isShotMissingKeyframe(shot)).length,
    failed: activeShots.filter((shot) => isShotKeyframeFailed(shot)).length,
    selected: activeShots.filter((shot) => selectedIds.has(shot.id)).length,
    all: activeShots.length,
  }), [activeShots, selectedIds]);
  const reviewStats = useMemo(() => summarizeDirectorKeyframeReview(activeShots), [activeShots]);
  const keyframeGatePassed = useMemo(
    () => isDirectorKeyframeGatePassed(activeShots),
    [activeShots],
  );
  const reviewMode = (data.reviewMode as 'manual' | 'auto' | undefined) ?? 'manual';
  const batchSummary = data.batchSummary as { done?: number; failed?: number; skipped?: number } | undefined;
  const lastResults = Array.isArray(data.lastResults)
    ? (data.lastResults as Array<{ shotId: string; ok?: boolean; error?: string }>).map((result) => ({
      ...result,
      index: activeShots.find((shot) => shot.id === result.shotId)?.index,
    }))
    : [];

  const pictureNode = useMemo(
    () => findDirectorPictureGenNode(props.id, nodes, edges),
    [props.id, nodes, edges],
  );
  const clipNode = useMemo(
    () => findDirectorClipGenNode(props.id, nodes, edges),
    [props.id, nodes, edges],
  );
  const clipBatchLabel = useMemo(
    () => describeDirectorKeyframeBatchStatus(
      (clipNode?.data as { directorKeyframeBatch?: DirectorKeyframeBatch } | undefined)
        ?.directorKeyframeBatch,
    ),
    [clipNode],
  );

  const sortedShots = useMemo(
    () => [...activeShots].sort((a, b) => a.index - b.index),
    [activeShots],
  );

  const readiness = useMemo(() => {
    try { return checkAssetReadinessInEdges(props.id, nodes as any, edges as any); }
    catch { return null; }
  }, [props.id, nodes, edges]);
  const ready = readiness?.ready ?? false;

  const currentShot = useMemo(() => {
    const sid = data.linkedShotId as string | undefined;
    return sid ? sortedShots.find((s) => s.id === sid) ?? null : null;
  }, [sortedShots, data.linkedShotId]);
  const guideUrl = currentShot?.director3dGuide?.captureUrl as string | undefined;
  const currentLineArtUrl = currentShot ? lineArtByShotId[currentShot.id] : undefined;

  const visibleShots = useMemo(() => {
    if (filter === 'selected') return sortedShots.filter((s) => selectedIds.has(s.id));
    if (filter === 'failed') return sortedShots.filter((s) => isShotKeyframeFailed(s));
    if (filter === 'missing') {
      return sortedShots.filter((s) => isShotMissingKeyframe(s) || isShotKeyframeFailed(s));
    }
    if (filter === '3donly') return sortedShots.filter((s) => s.director3dGuide?.captureUrl);
    return sortedShots;
  }, [sortedShots, filter, selectedIds]);

  const referenceGaps = useMemo(() => {
    const queueShots = filter === 'selected'
      ? sortedShots.filter((shot) => selectedIds.has(shot.id))
      : resolveDirectorQueueShots(sortedShots, {
        filter,
        selectedIds: [...selectedIds],
        skipExisting,
        skipApproved,
      });
    return previewDirectorReferenceGaps(queueShots, {
      blockData: data,
      pictureNodeData: (pictureNode?.data ?? {}) as Record<string, unknown>,
      forceCharacterRef,
      forceSceneRef,
      prefer3dRef,
      preferLineArtRef,
       lineArtByShotId,
       styleLock,
       globalArtDirection: storyboard.globalArtDirection,
       episodeArtDirection,
       stylePrompt,
       styleSeed,
       characters,
       environments,
       reviewMode,
     });
  }, [filter, sortedShots, selectedIds, skipExisting, skipApproved, data, pictureNode?.data, forceCharacterRef, forceSceneRef, prefer3dRef, preferLineArtRef, lineArtByShotId, styleLock, storyboard.globalArtDirection, episodeArtDirection, stylePrompt, styleSeed, characters, environments, reviewMode]);

  const progressPct =
    stats.total === 0 ? 0 : Math.round((stats.withFrame / stats.total) * 100);
  const running = status === 'running';
  const cardTitle = useMemo(() => {
    if (upstreamDeskTitle) return upstreamDeskTitle;
    const epId = handoffEpisodeId || chain?.activeEpisodeId;
    const epMeta = (chain?.episodes ?? storyboard.episodes ?? []).find((e) => e.id === epId);
    return epMeta?.title || storyboard.title || '关键帧导演';
  }, [upstreamDeskTitle, handoffEpisodeId, chain, storyboard.episodes, storyboard.title]);

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

  // D-02: 写回上游链镜表
  const patchShot = useCallback(
    (shotId: string, patch: Partial<import('@nx9/shared').StoryboardShot>) => {
      const ok = runContext.patchShot?.(shotId, patch) ?? false;
      if (!ok) appendLog('导演台：无法写回上游链镜表（未连接分镜台？）');
      return ok;
    },
    [runContext.patchShot, appendLog],
  );

  const runBatch = useCallback(
    async (mode: 'filter' | 'selected' | 'one' | 'failed', oneId?: string) => {
      if (episodeScopeInvalid) {
        const message = '导演台：当前集不存在或交接已过期，请重新同步后再批出';
        appendLog(message);
        updateNodeData(props.id, { status: 'error', error: message });
        return;
      }
      if (!handoffValidation.valid) {
        const message = `导演台：${handoffValidation.reason}，请从分镜台重新同步后再批出`;
        appendLog(message);
        updateNodeData(props.id, { status: 'error', error: message, lastHandoffStatus: 'stale' });
        return;
      }
      // O-14 / OL-21：门禁未放行时硬阻断（参考锁或 3D 可拍闸）
      if (!ready && (forceCharacterRef || forceSceneRef || prefer3dRef)) {
        appendLog('导演台：上游设定未就绪，锁参考/3D 可拍模式下禁止批出。请先在编剧台「设定就绪」标记放行。');
        updateNodeData(props.id, { status: 'error', error: '设定未就绪，锁参考禁止批出' });
        return;
      }
      const relevantReferenceGaps = mode === 'one'
        ? referenceGaps.filter((gap) => gap.shotId === oneId)
        : referenceGaps;
      if (relevantReferenceGaps.length > 0 && (forceCharacterRef || forceSceneRef || prefer3dRef)) {
        appendLog(`导演台：${relevantReferenceGaps.length} 镜不可拍（参考/定妆缺失），已阻止批出`);
        return;
      }
      const selectedShotsForWarning = mode === 'one' && oneId
        ? activeShots.filter((shot) => shot.id === oneId)
        : mode === 'selected'
          ? activeShots.filter((shot) => selectedIds.has(shot.id))
          : activeShots;
      const without3d = selectedShotsForWarning.filter((shot) => !shot.director3dGuide?.captureUrl);
      if (without3d.length > 0) {
        appendLog(`导演台：${without3d.length} 镜没有 3D 构图参考，仍可继续批出彩色关键帧`);
      }
      // D-04/X-42: 未确认本集二次确认
      if (!episodeConfirmed && activeShots.length > 0) {
        const ok = await askConfirm({
          title: '本集尚未在分镜台确认',
          description: '仍要批出彩色关键帧？',
          confirmLabel: '仍要批出',
          tone: 'danger',
        });
        if (!ok) return;
      }
      abortRef.current = false;
      abortControllerRef.current?.abort();
      const batchController = new AbortController();
      abortControllerRef.current = batchController;
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
          ...buildBatchOpts({
            blockId: props.id,
            skipExisting,
            skipApproved,
            concurrency,
            maxRetries,
            forceCharacterRef,
            forceSceneRef,
             styleLock,
             globalArtDirection: storyboard.globalArtDirection,
             episodeArtDirection,
             prefer3dRef,
            preferLineArtRef,
             lineArtByShotId,
             stylePrompt,
            styleSeed,
            pictureNodeData: (pictureNode?.data ?? {}) as Record<string, unknown>,
             blockData: data,
             characters,
             environments,
            nodes,
            edges,
          }),
           shots: activeShots,
           patchShot,
           reviewMode,
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
           signal: batchController.signal,
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
            shots: activeShots,
            episodeId,
            sourceChainDeskId: resolveUpstreamChainDesk(props.id, nodes, edges) ?? undefined,
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
        abortControllerRef.current = null;
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
      ready,
      forceCharacterRef,
      forceSceneRef,
      preferLineArtRef,
      lineArtByShotId,
      patchShot,
       episodeConfirmed,
       episodeScopeInvalid,
       handoffValidation,
       characters,
       environments,
       episodeArtDirection,
      referenceGaps,
    ],
  );

  const stopBatch = useCallback(() => {
    abortRef.current = true;
    abortControllerRef.current?.abort();
    appendLog('导演台 · 尽快停止：不再开新镜');
  }, [appendLog]);

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

  const handleApproveShot = useCallback(
    (shotId: string) => {
       if (!approveDirectorKeyframe(shotId, nodes as any, patchShot)) {
        appendLog('导演台 · 无法批准（缺关键帧）');
        return;
      }
      const synced = summarizePendingKeyframeGate(undefined, activeShots);
      appendLog(
        `导演台 · 已批准关键帧` +
          (synced.gatePassed ? ' · 本集审阅已放行' : ` · 仍待审 ${synced.pendingIndices.length}`),
      );
    },
    [appendLog, patchShot, activeShots],
  );

  const handleApproveAll = useCallback(() => {
    if (reviewStats.missing > 0) {
      appendLog(`导演台 · 还有 ${reviewStats.missing} 镜缺图，无法全部通过`);
      return;
    }
    const n = approveAllDirectorKeyframes(patchShot, activeShots);
    const synced = summarizePendingKeyframeGate(undefined, activeShots);
    appendLog(
      n > 0
        ? `导演台 · 全部通过 ${n} 镜` + (synced.gatePassed ? ' · 已放行' : '')
        : keyframeGatePassed
          ? '导演台 · 本集已全部通过'
          : '导演台 · 无可批准镜头',
    );
  }, [appendLog, keyframeGatePassed, reviewStats.missing, patchShot, activeShots]);

  const handleUnapproveShot = useCallback((shotId: string) => {
    if (!unapproveDirectorKeyframe(shotId, nodes as any, patchShot)) {
      appendLog('导演台 · 无法撤回批准');
      return;
    }
    appendLog('导演台 · 已撤回批准，可重新审阅');
  }, [nodes, patchShot, appendLog]);

  const handleUnapproveAll = useCallback(async () => {
    if (!keyframeGatePassed) return;
    const ok = await askConfirm({
      title: '撤销本集全部通过？',
      description: '所有关键帧将恢复为待审状态。',
      confirmLabel: '撤销全部通过',
      tone: 'danger',
    });
    if (!ok) return;
    for (const shot of activeShots) {
      unapproveDirectorKeyframe(shot.id, nodes as any, patchShot);
    }
    appendLog('导演台 · 已撤销本集全部通过');
  }, [keyframeGatePassed, activeShots, nodes, patchShot, appendLog]);

  const handleRestoreShot = useCallback((shotId: string) => {
    const shot = activeShots.find((item) => item.id === shotId);
    if (!shot?.keyframePreviousUrl) return;
    patchShot(shotId, {
      firstFrameAssetId: shot.keyframePreviousUrl,
      keyframePreviousUrl: null,
      keyframeRevision: Math.max(1, shot.keyframeRevision ?? 1) + 1,
      keyframeProvenance: shot.keyframeProvenance ?? {
        role: 'director-color-keyframe',
        generator: 'picture-gen',
        sourceDirectorDeskId: props.id,
        sourceLineArtUrl: lineArtByShotId[shot.id] ?? shot.lineArtUrl ?? null,
        sourceDirector3dCaptureId: shot.director3dGuide?.captureId ?? null,
        generatedAt: new Date().toISOString(),
      },
      status: 'review',
      keyframeStatus: 'review',
    });
    appendLog(`导演台 · 已恢复镜 #${shot.index} 上一版关键帧`);
  }, [activeShots, patchShot, appendLog, lineArtByShotId, props.id]);

  const focusFirstMissing = useCallback(() => {
    const first = sortedShots.find((shot) => isShotMissingKeyframe(shot) || isShotKeyframeFailed(shot));
    if (first) focusShot(first.id);
  }, [sortedShots, focusShot]);

  const focusUpstream = useCallback(() => {
    if (upstreamDeskId) fitView({ nodes: [{ id: upstreamDeskId }], duration: 300 });
  }, [upstreamDeskId, fitView]);

  const handleSplitDirector3d = useCallback(async () => {
    if (!needs3dSplit) return;
    const ok = await askConfirm({
      title: '拆分混装的 3D 状态？',
      description:
        '此节点同时含导演台关键帧生产与历史 3D 场景。拆分后会生成/更新独立「3D 导演台」节点，导演台只保留彩色关键帧流程。',
      confirmLabel: '拆分',
    });
    if (!ok) return;
    const latestNodes = getNodes();
    const result = splitMixedDirector3dNode({
      directorDeskId: props.id,
      nodes: latestNodes,
      edges,
    });
    if (!result.ok) {
      appendLog(`导演台 · 拆分失败：${result.reason ?? '未知原因'}`);
      return;
    }
    const next = applySplitMixedDirector3dGraph({
      nodes: latestNodes,
      edges: edges as Edge[],
      result,
    });
    setNodes(next.nodes);
    setEdges(next.edges);
    appendLog(
      result.createdNode
        ? `导演台 · 已拆出独立 3D 节点 ${result.director3dNodeId}`
        : `导演台 · 已把 3D 状态迁入已连接节点 ${result.director3dNodeId}`,
    );
    if (result.director3dNodeId) {
      fitView({ nodes: [{ id: result.director3dNodeId }], duration: 300 });
    }
  }, [
    needs3dSplit,
    getNodes,
    props.id,
    edges,
    setNodes,
    setEdges,
    appendLog,
    fitView,
  ]);

  const handleRejectShot = useCallback(
    async (shotId: string, regenerate: boolean) => {
      const comment = (rejectDrafts[shotId] ?? '').trim();
      if (!comment) {
        appendLog('导演台 · 打回需填写原因');
        return;
      }
      setRejectBusyId(shotId);
      try {
        const res = await rejectDirectorKeyframe({
          shotId,
          comment,
          regenerate,
          nodes: nodes as any,
          patchShot,
          batchOptions: {
            sourceDirectorDeskId: props.id,
            blockData: data,
            pictureNodeData: (pictureNode?.data ?? {}) as Record<string, unknown>,
            forceCharacterRef,
            forceSceneRef,
            prefer3dRef,
            preferLineArtRef,
            lineArtByShotId,
            styleLock,
            stylePrompt,
            styleSeed,
            reviewMode: (data.reviewMode as 'manual' | 'auto' | undefined),
          },
        });
        if (!res.ok) {
          appendLog('导演台 · 打回失败');
          return;
        }
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
    [appendLog, rejectDrafts, patchShot, nodes, data, pictureNode?.data, forceCharacterRef, forceSceneRef, prefer3dRef, preferLineArtRef, lineArtByShotId, styleLock, stylePrompt, styleSeed, props.id],
  );

  const handlePushClipGen = useCallback(
    async (force = false) => {
      if (!force && !keyframeGatePassed) {
        appendLog(
          `导演台 · 审阅未放行（缺图 ${reviewStats.missing} · 待审 ${reviewStats.pending + reviewStats.failed}），未推送`,
        );
        return;
      }
      // H-03: 强制推送二次确认
      if (force) {
        const pendingList = activeShots
          .filter((s) => !isShotKeyframeApproved(s))
          .map((s) => `#${s.index}`);
        const shown = pendingList.slice(0, 12);
        const desc =
          `门禁未放行。未批准镜号：${shown.join(' ')}` +
          (pendingList.length > 12 ? ` 等 ${pendingList.length} 镜` : '');
        const ok = await askConfirm({
          title: '强制推送到视频生成？',
          description: desc,
          confirmLabel: '仍要推送',
          tone: 'danger',
        });
        if (!ok) return;
      }
      const pushed = pushKeyframesToClipGen({
        deskBlockId: props.id,
        nodes,
        edges,
        updateNodeData,
        bypassKeyframeGate: force,
        shots: activeShots,
        episodeId: episodeId ?? undefined,
      });
      if (!pushed.clipGenId) {
        appendLog('导演台 · 未连接 clip-gen，无法推送关键帧批次');
        return;
      }
      if (pushed.shotCount === 0) {
        appendLog('导演台 · 没有可交付的视频关键帧');
        return;
      }
      appendLog(
        force
          ? `导演台 · 已强制推送 clip-gen · ${pushed.shotCount} 镜`
          : `关键帧批次已推送 clip-gen · ${pushed.shotCount} 镜`,
      );
    },
    [
      keyframeGatePassed,
      reviewStats.missing,
      reviewStats.pending,
      reviewStats.failed,
      activeShots,
      props.id,
      nodes,
      edges,
      updateNodeData,
      appendLog,
      episodeId,
    ],
  );

  useEffect(() => {
    if (!studioOpen || immersed3d) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      const index = currentShot ? sortedShots.findIndex((shot) => shot.id === currentShot.id) : -1;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const nextIndex = Math.max(0, Math.min(sortedShots.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
        const nextShot = sortedShots[nextIndex];
        if (nextShot) {
          event.preventDefault();
          focusShot(nextShot.id);
        }
      } else if (event.key.toLowerCase() === 'a' && currentShot) {
        event.preventDefault();
        handleApproveShot(currentShot.id);
      } else if (event.key === 'Enter' && event.shiftKey && currentShot) {
        event.preventDefault();
        void runBatch('one', currentShot.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [studioOpen, immersed3d, currentShot, sortedShots, focusShot, handleApproveShot, runBatch]);

  const exportKeyframeUrls = useCallback(() => {
    const rows = activeShots
      .filter((shot) => shot.firstFrameAssetId)
      .map((shot) => `#${shot.index}\t${shot.firstFrameAssetId}`);
    if (rows.length === 0) {
      appendLog('导演台：没有可导出的关键帧 URL');
      return;
    }
    const blob = new Blob([`NX9 关键帧 URL\n${rows.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${episodeId || 'episode'}-keyframes.txt`;
    link.click();
    URL.revokeObjectURL(url);
    appendLog(`导演台 · 已导出 ${rows.length} 镜关键帧 URL`);
  }, [activeShots, appendLog, episodeId]);

  const footerReason = episodeScopeInvalid
    ? '阻断：当前集不存在或交接已过期，请重新同步'
    : !chain || activeShots.length === 0
      ? '阻断：未连接分镜台或暂无链镜表'
      : !ready && (forceCharacterRef || forceSceneRef || prefer3dRef)
        ? '阻断：设定未就绪，参考锁/3D 可拍未放行'
        : studioTab === 'deliver' && !keyframeGatePassed
          ? '阻断：关键帧门禁未放行'
          : lineArtCount === 0
            ? '提示：无线稿，线稿参考为可选'
            : null;

  const primaryLabel = useMemo(() => {
    if (running) {
      if (liveProgress.total > 0) {
        return `出图中 ${liveProgress.done}/${liveProgress.total}…`;
      }
      return '出图中…';
    }
    return buildDirectorBatchLabel({
      filter,
      selectedCount: selectedIds.size,
      failedCount: stats.failed,
      missingCount: stats.missing + stats.failed,
      skipExisting,
      skipApproved,
    });
  }, [running, liveProgress, filter, selectedIds.size, skipExisting, skipApproved, stats]);

  const barPct =
    running && liveProgress.total > 0
      ? Math.round((liveProgress.done / liveProgress.total) * 100)
      : progressPct;

  const openStudio = useCallback(() => setStudioOpen(true), []);
  const closeStudio = useCallback(async () => {
    if (running) {
      const ok = await askConfirm({
        title: '批出仍在进行，确定关闭导演台？',
        description: '关闭不会自动停止已请求的出图；建议先点「停止」。',
        confirmLabel: '仍要关闭',
        cancelLabel: '继续批出',
        tone: 'danger',
      });
      if (!ok) return;
      abortRef.current = true;
    }
    setStudioOpen(false);
    setImmersed3d(false);
  }, [running]);

  // S-01: 批出中刷新拦截
  useEffect(() => {
    if (!running) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [running]);

  return (
    <>
      <BlockShell {...props}>
        <div className="dd2-card nodrag nopan">
          <div
            className="dd2-card__clickable"
            role="button"
            tabIndex={0}
            onClick={openStudio}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openStudio();
              }
            }}
          >
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
                    : keyframeGatePassed
                      ? '可交视频'
                      : progressPct >= 100
                        ? '已出齐'
                      : '进行中'}
              </span>
            </div>
            <div className="dd2-card__title">{cardTitle}</div>
            <div className="dd2-card__meta">
              {running
                ? `批出中 ${liveProgress.done}/${liveProgress.total}`
                : stats.total === 0
                  ? '先完成分镜台'
                   : `${keyframeGatePassed ? '可交视频' : progressPct >= 100 ? '已出齐' : '已出'} ${stats.withFrame}/${stats.total}${stats.with3d > 0 ? ` · 3D ${stats.with3d}` : ''}`}
            </div>
            <div className="dd2-card__logline">
              {needs3dSplit
                ? '混装历史 3D 状态 · 打开后可拆成独立 3D 节点'
                : batchError
                ? batchError
                : stats.total > 0 && !ready
                  ? '上游设定未就绪 · 建议先完成资产入库'
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
          </div>
        </div>
      </BlockShell>

      <ScreenModal
        open={studioOpen}
        onClose={() => { void closeStudio(); }}
        title={immersed3d ? undefined : '导演台'}
        subtitle={immersed3d ? undefined : '选镜 → 3D 机位 → 批出关键帧 → 审阅送出'}
        width={immersed3d ? 'min(1440px, 100vw - 12px)' : 'min(1280px, calc(100vw - 24px))'}
        showChrome={!immersed3d}
        variant="default"
        className={`dd2-modal ${immersed3d ? 'is-immersed' : ''}`}
      >
        <div className="dd2-studio">
          {!immersed3d && chain && (
            <div className="dd2-episode-ctx">
              <span className="dd2-episode-ctx__info">
                第{episodeId ? chain.episodes?.find((e) => e.id === episodeId)?.index ?? '?' : '?'}集{upstreamDeskTitle ? ` · 来自「${upstreamDeskTitle}」` : ''}
                {episodeConfirmed ? ' · 已确认' : ' · 未确认'}
                {' · '}线稿 {lineArtCount}/{activeShots.length}
                 {' · '}关键帧 {stats.withFrame}/{stats.total}
                 {' · '}3D 构图 {stats.with3d}/{stats.total}
              </span>
            </div>
          )}
          {!immersed3d && (!chain || chain.shots.length === 0) && (
            <div className="dd2-episode-ctx dd2-episode-ctx--warn">
              <span className="dd2-episode-ctx__info">
                ⚠ 未连接分镜台 · 无链镜表
              </span>
              <button type="button" className="dd2-btn dd2-btn--ghost" onClick={focusUpstream} disabled={!upstreamDeskId}>
                聚焦上游分镜台
              </button>
            </div>
          )}
          {!immersed3d && needs3dSplit && (
            <div className="dd2-episode-ctx dd2-episode-ctx--warn">
              <span className="dd2-episode-ctx__info">
                ⚠ 本节点混装了历史 3D 状态与关键帧生产，建议拆成导演台 + 独立 3D 节点
              </span>
              <button
                type="button"
                className="dd2-btn dd2-btn--ghost"
                onClick={() => { void handleSplitDirector3d(); }}
              >
                立即拆分
              </button>
            </div>
          )}
          {!immersed3d && (
            <div className="dd2-pipeline" aria-label="导演流程">
              <button
                type="button"
                className={`dd2-pipeline__step ${studioTab === 'produce' ? 'is-on' : ''} ${stats.withFrame > 0 ? 'is-done' : ''}`}
                onClick={() => { setStudioTab('produce'); setImmersed3d(false); setShowSettings(false); }}
              >
                <b>1</b> 选镜批出
              </button>
              <span className="dd2-pipeline__sep" aria-hidden />
               <button
                 type="button"
                 className={`dd2-pipeline__step ${studioTab === 'stage3d' ? 'is-on' : ''}`}
                 onClick={() => { if (DIRECTOR_3D_ENABLED) { setStudioTab('stage3d'); setShowSettings(false); } }}
                 disabled={!DIRECTOR_3D_ENABLED}
                 title={DIRECTOR_3D_ENABLED ? undefined : '3D 导演台暂未开放'}
               >
                  <b>2</b> 3D 构图（暂未开放）
               </button>
              <span className="dd2-pipeline__sep" aria-hidden />
              <button
                type="button"
                className={`dd2-pipeline__step ${studioTab === 'deliver' ? 'is-on' : ''} ${keyframeGatePassed ? 'is-done' : ''}`}
                onClick={() => { setStudioTab('deliver'); setShowSettings(false); }}
              >
                <b>3</b> 审阅送出
              </button>
            </div>
          )}
          <div className="dd2-studio__main">
            {!immersed3d && studioTab !== 'stage3d' && (
              <DirectorFilmstrip
                running={running}
                liveProgress={liveProgress}
                barPct={barPct}
                 stats={stats}
                 queueCounts={queueCounts}
                  visibleShots={visibleShots}
                 lineArtByShotId={lineArtByShotId}
                filter={filter}
                selectedIds={selectedIds}
                currentShotId={currentShot?.id}
                runningShotId={runningShotId}
                blockId={props.id}
                focusShot={focusShot}
                toggleSelect={toggleSelect}
                selectAllVisible={selectAllVisible}
                 clearSelect={clearSelect}
                 onGenerateShot={(shotId) => { void runBatch('one', shotId); }}
                 updateNodeData={updateNodeData}
                onFilterChange={(v) => updateNodeData(props.id, { queueFilter: v })}
              />
            )}
            <div className="dd2-work-area">
              {studioTab === 'produce' && (
                  <DirectorMainPanel
                   director3dEnabled={DIRECTOR_3D_ENABLED}
                  previewUrl={currentShot?.firstFrameAssetId ?? undefined}
                   guideUrl={guideUrl}
                   lineArtUrl={currentLineArtUrl}
                  currentShotIndex={currentShot?.index != null ? String(currentShot.index) : '—'}
                  currentShotDesc={currentShot?.descriptionZh as string | undefined}
                  previewMode={previewMode}
                   setPreviewMode={setPreviewMode}
                  setStudioTab={setStudioTab}
                  showSettings={showSettings}
                  setShowSettings={setShowSettings}
                  batchError={batchError}
                  running={running}
                  stats={stats}
                  filter={filter}
                  selectedIds={selectedIds}
                  runBatch={runBatch}
                  stopBatch={stopBatch}
                  primaryLabel={primaryLabel}
                  skipExisting={skipExisting}
                  skipApproved={skipApproved}
                  forceCharacterRef={forceCharacterRef}
                  forceSceneRef={forceSceneRef}
                  styleLock={styleLock}
                  prefer3dRef={prefer3dRef}
                  preferLineArtRef={preferLineArtRef}
                  concurrency={concurrency}
                  maxRetries={maxRetries}
                  stylePrompt={stylePrompt}
                  styleSeed={styleSeed}
                  syncStyleToPicture={syncStyleToPicture}
                  autoOpenReview={autoOpenReview}
                  globalArtDirection={storyboard.globalArtDirection}
                   blockId={props.id}
                   pictureGenId={pictureNode?.id}
                   pictureNodeData={(pictureNode?.data ?? {}) as Record<string, unknown>}
                   pictureConnected={Boolean(pictureNode)}
                  updateNodeData={updateNodeData}
                   syncStyleNow={syncStyleNow}
                   referenceGaps={referenceGaps}
                   reviewMode={reviewMode}
                   batchSummary={batchSummary}
                   lastResults={lastResults}
                   focusShot={focusShot}
                   colorCheckWarning={describeKeyframeColorCheck(currentShot?.keyframeProvenance?.colorCheck)}
                 />
              )}
               {studioTab === 'stage3d' && DIRECTOR_3D_ENABLED && (
                <div className="dd2-stage">
                  <div className="dd2-stage__header dd2-stage__header--compact">
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
                    characters={characters}
                    updateNodeData={updateNodeData}
                    getNodes={getNodes}
                    appendLog={appendLog}
                    focusShot={focusShot}
                    nodes={nodes}
                    edges={edges}
                  />
                </div>
              )}
              {studioTab === 'deliver' && (
                <DirectorDeliverTab
                  blockId={props.id}
                  sortedShots={sortedShots as never}
                  reviewStats={reviewStats}
                  keyframeGatePassed={keyframeGatePassed}
                  running={running}
                   handleApproveShot={handleApproveShot}
                   handleApproveAll={handleApproveAll}
                   handleUnapproveShot={handleUnapproveShot}
                   handleUnapproveAll={handleUnapproveAll}
                   handleRestoreShot={handleRestoreShot}
                  handleRejectShot={handleRejectShot}
                  rejectDrafts={rejectDrafts}
                  setRejectDrafts={setRejectDrafts}
                  rejectEditingId={rejectEditingId}
                  setRejectEditingId={setRejectEditingId}
                  rejectBusyId={rejectBusyId}
                  pictureNode={pictureNode as { data: Record<string, unknown> } | null}
                  clipNode={clipNode ? { id: clipNode.id } : null}
                  stats={stats}
                  nodes={nodes}
                  edges={edges as unknown[]}
                  updateNodeData={updateNodeData}
                  appendLog={appendLog}
                  focusShot={focusShot}
                  styleSeed={styleSeed}
                  stylePrompt={stylePrompt}
                   handlePushClipGen={handlePushClipGen}
                   onGoToMissing={() => { setStudioTab('produce'); updateNodeData(props.id, { queueFilter: 'missing' }); focusFirstMissing(); }}
                   lastPushReceipt={data.lastPushReceipt as { at?: string; shotCount?: number; clipGenId?: string } | undefined}
                   clipBatchLabel={clipBatchLabel}
                   reviewMode={reviewMode}
                   episodeId={episodeId}
                   sourceChainDeskId={resolveUpstreamChainDesk(props.id, nodes, edges) ?? undefined}
                   reviewShots={activeShots}
                 />
              )}
            </div>
          </div>
          {!immersed3d && (
            <div className="dd2-studio__footer">
              {pictureNode ? `出图 · ${(pictureNode.data as Record<string, unknown>)?.model ?? '默认'}` : '出图 · Gemini 2.5 Flash Image'}
              {clipNode ? ' · 可送视频' : ''}
              {currentShot ? ` · 当前镜 #${currentShot.index}` : ''}
               {phaseHint ? ` · ${phaseHint}` : running ? ' · 批出中…' : footerReason ? ` · ${footerReason}` : ''}
               {studioTab === 'produce' ? (
                 <button type="button" className="dd2-btn dd2-btn--ghost" onClick={exportKeyframeUrls} disabled={stats.withFrame === 0}>
                   导出本集关键帧 URL
                 </button>
               ) : null}
            </div>
          )}
        </div>
      </ScreenModal>
    </>
  );
}

export default memo(DirectorDeskBlock);
