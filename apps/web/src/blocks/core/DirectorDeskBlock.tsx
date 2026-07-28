import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { activeEpisodeShots } from '@nx9/shared';
import { normalizeDirectorProject } from '@nx9/director3d';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useStoryboardUi } from '../../stores/flow-runtime';
import { checkAssetReadinessInEdges } from '../../engine/asset-readiness';
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
import { Director3dStageEmbed } from './director-desk/director-3d-stage-embed';
import { DirectorFilmstrip } from './director-desk/director-filmstrip';
import { DirectorMainPanel } from './director-desk/director-main-panel';
import { DirectorDeliverTab } from './director-desk/director-deliver-tab';
import { buildBatchOpts } from './director-desk/director-batch-opts';
import './director-desk.css';
import './director-desk.v2.css';


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
  const cardTitle = useMemo(() => { const epId = storyboard.activeEpisodeId; const ep = (storyboard.episodes ?? []).find((e) => e.id === epId); return ep?.title || storyboard.title || '关键帧导演'; }, [storyboard.activeEpisodeId, storyboard.episodes, storyboard.title]);

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
      if (!ready && (forceCharacterRef || forceSceneRef)) {
        appendLog('导演台：上游设定未就绪，锁参考模式下禁止批出。请先在编剧台「设定就绪」标记放行。');
        updateNodeData(props.id, { status: 'error', error: '设定未就绪，锁参考禁止批出' });
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
          ...buildBatchOpts({
            blockId: props.id,
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
            pictureNodeData: (pictureNode?.data ?? {}) as Record<string, unknown>,
            blockData: data,
            nodes,
            edges,
          }),
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
            {!immersed3d && (
              <DirectorFilmstrip
                running={running}
                liveProgress={liveProgress}
                barPct={barPct}
                stats={stats}
                visibleShots={visibleShots}
                filter={filter}
                selectedIds={selectedIds}
                currentShotId={currentShot?.id}
                runningShotId={runningShotId}
                blockId={props.id}
                focusShot={focusShot}
                updateNodeData={updateNodeData}
                onFilterChange={(v) => updateNodeData(props.id, { queueFilter: v })}
              />
            )}
            <div className="dd2-work-area">
              {studioTab === 'produce' && (
                <DirectorMainPanel
                  previewUrl={previewUrl}
                  guideUrl={guideUrl}
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
                  runBatch={runBatch}
                  stopBatch={stopBatch}
                  primaryLabel={primaryLabel}
                  skipExisting={skipExisting}
                  skipApproved={skipApproved}
                  forceCharacterRef={forceCharacterRef}
                  forceSceneRef={forceSceneRef}
                  styleLock={styleLock}
                  prefer3dRef={prefer3dRef}
                  concurrency={concurrency}
                  maxRetries={maxRetries}
                  stylePrompt={stylePrompt}
                  styleSeed={styleSeed}
                  syncStyleToPicture={syncStyleToPicture}
                  autoOpenReview={autoOpenReview}
                  globalArtDirection={storyboard.globalArtDirection}
                  blockId={props.id}
                  updateNodeData={updateNodeData}
                  syncStyleNow={syncStyleNow}
                />
              )}
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
                <DirectorDeliverTab
                  blockId={props.id}
                  sortedShots={sortedShots as never}
                  reviewStats={reviewStats}
                  keyframeGatePassed={keyframeGatePassed}
                  running={running}
                  handleApproveShot={handleApproveShot}
                  handleApproveAll={handleApproveAll}
                  handleRejectShot={handleRejectShot}
                  rejectDrafts={rejectDrafts}
                  setRejectDrafts={setRejectDrafts}
                  rejectEditingId={rejectEditingId}
                  setRejectEditingId={setRejectEditingId}
                  rejectBusyId={rejectBusyId}
                  pictureNode={pictureNode as { data: Record<string, unknown> } | null}
                  clipNode={clipNode}
                  stats={stats}
                  nodes={nodes}
                  edges={edges as unknown[]}
                  updateNodeData={updateNodeData}
                  appendLog={appendLog}
                  focusShot={focusShot}
                  styleSeed={styleSeed}
                  stylePrompt={stylePrompt}
                  handlePushClipGen={handlePushClipGen}
                />
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
