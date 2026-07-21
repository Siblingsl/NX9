import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  activeEpisodeShots,
  resolveBlockCharacters,
} from '@nx9/shared';
import { Clapperboard, Film, Play, RotateCcw, ShieldCheck, Square } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useStoryboardUi } from '../../stores/flow-runtime';
import {
  findDirectorClipGenNode,
  findDirectorPictureGenNode,
  isShotKeyframeApproved,
  isShotKeyframeFailed,
  isShotMissingKeyframe,
  openReviewAfterDirectorBatch,
  pushKeyframesToClipGen,
  runDirectorDeskBatch,
  shotKeyframePrompt,
  summarizeDirectorQueue,
  syncStyleToPictureGen,
  type DirectorDeskQueueFilter,
  type DirectorDeskShotResult,
  type DirectorShotPhase,
} from '../../engine/director-desk-runner';
import './director-desk.css';

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

function DirectorDeskBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const appendLog = useActivityLog((s) => s.append);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const selectShot = useStoryboardUi((s) => s.selectShot);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);

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
  /** 批出完成后自动打开审阅关卡 / 审片模式 */
  const autoOpenReview = (data.autoOpenReview as boolean | undefined) ?? true;
  /** 批出前把 seed/风格写回图像生成节点 */
  const syncStyleToPicture = (data.syncStyleToPicture as boolean | undefined) ?? true;
  const stylePrompt = (data.stylePrompt as string | undefined) ?? '';
  const styleSeed =
    data.styleSeed === null || data.styleSeed === undefined || data.styleSeed === ''
      ? null
      : Number(data.styleSeed);
  const filter = ((data.queueFilter as DirectorDeskQueueFilter) ?? 'missing') as DirectorDeskQueueFilter;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [runningShotId, setRunningShotId] = useState<string | null>(null);
  const [phaseHint, setPhaseHint] = useState<string>('');
  const [liveProgress, setLiveProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const abortRef = useRef(false);
  const failedCountRef = useRef(0);

  const activeShots = useMemo(() => activeEpisodeShots(storyboard), [storyboard]);
  const stats = useMemo(() => summarizeDirectorQueue(activeShots), [activeShots]);

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

  const visibleShots = useMemo(() => {
    if (filter === 'selected') return sortedShots.filter((s) => selectedIds.has(s.id));
    if (filter === 'failed') return sortedShots.filter((s) => isShotKeyframeFailed(s));
    if (filter === 'missing') {
      return sortedShots.filter((s) => isShotMissingKeyframe(s) || isShotKeyframeFailed(s));
    }
    return sortedShots;
  }, [sortedShots, filter, selectedIds]);

  const progressPct =
    stats.total === 0 ? 0 : Math.round((stats.withFrame / stats.total) * 100);
  const running = status === 'running';

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
              `导演台 · 已打开关键帧审阅 · 待审 ${review.pendingIndices.length} 镜` +
                (review.reviewGateId ? ' · 已同步审阅关卡' : ''),
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
    appendLog(
      `导演台 · 已写入视频生成 ${res.shotCount} 镜关键帧` +
        (res.firstShotId ? ` · 首镜 ${res.firstShotId.slice(0, 8)}` : ''),
    );
  }, [selectedIds, props.id, nodes, edges, updateNodeData, appendLog]);

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

  const openReviewNow = useCallback(() => {
    const review = openReviewAfterDirectorBatch({
      deskBlockId: props.id,
      nodes,
      edges,
      updateNodeData: (id, patch) => updateNodeData(id, patch),
      openSession: true,
    });
    appendLog(
      review.pendingIndices.length > 0
        ? `导演台 · 打开审阅 · 待审 ${review.pendingIndices.length} 镜`
        : '导演台 · 打开审片视图（当前无待审关键帧）',
    );
  }, [props.id, nodes, edges, updateNodeData, appendLog]);

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

  const summaryLine = useMemo(() => {
    if (running) {
      return liveProgress.total > 0
        ? `出图中 ${liveProgress.done}/${liveProgress.total}`
        : '出图中…';
    }
    if (stats.total === 0) return '先完成剧本拆分 / 分镜台';
    if (stats.missing + stats.failed > 0) {
      return `${stats.missing + stats.failed} 镜待出 · 已出 ${stats.withFrame}`;
    }
    return `本集 ${stats.total} 镜关键帧已齐`;
  }, [running, liveProgress, stats]);

  const deskBody = (
    <>
        <div className="dd-progress">
          <div className="dd-stat">
            <b>{stats.total}</b>
            <span>本集镜</span>
          </div>
          <div className="dd-stat is-ok">
            <b>{stats.withFrame}</b>
            <span>已出帧</span>
          </div>
          <div className="dd-stat is-miss">
            <b>{stats.missing}</b>
            <span>未出</span>
          </div>
          <div className={`dd-stat ${stats.failed ? 'is-warn' : ''}`}>
            <b>{stats.failed}</b>
            <span>失败</span>
          </div>
        </div>

        <div className="dd-bar" title={`${progressPct}% 已出帧`}>
          <div
            className={`dd-bar__fill ${running ? 'is-run' : ''}`}
            style={{ width: `${Math.min(100, barPct)}%` }}
          />
        </div>
        {(phaseHint || stats.with3d > 0) && (
          <p className="dd-meta">
            {phaseHint || `${stats.with3d} 镜已有 3D 参考`}
          </p>
        )}

        <div className="dd-row">
          {(
            [
              ['missing', '未出/失败'],
              ['failed', '仅失败'],
              ['selected', '已选'],
              ['all', '全部'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`dd-chip ${filter === id ? 'is-on' : ''}`}
              onClick={() => updateNodeData(props.id, { queueFilter: id })}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="dd-row">
          <label className="dd-check">
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={(e) => updateNodeData(props.id, { skipExisting: e.target.checked })}
            />
            跳过已有
          </label>
          <label className="dd-check">
            <input
              type="checkbox"
              checked={skipApproved}
              onChange={(e) => updateNodeData(props.id, { skipApproved: e.target.checked })}
            />
            跳过通过
          </label>
          <span className="dd-meta">并发</span>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              className={`dd-chip ${concurrency === n ? 'is-on' : ''}`}
              onClick={() => updateNodeData(props.id, { concurrency: n })}
            >
              {n}
            </button>
          ))}
          <span className="dd-meta">重试</span>
          {[0, 1, 2].map((n) => (
            <button
              key={n}
              type="button"
              className={`dd-chip ${maxRetries === n ? 'is-on' : ''}`}
              onClick={() => updateNodeData(props.id, { maxRetries: n })}
              title="失败自动重试次数"
            >
              {n}
            </button>
          ))}
        </div>

        <div className="dd-row">
          <label className="dd-check">
            <input
              type="checkbox"
              checked={forceCharacterRef}
              onChange={(e) =>
                updateNodeData(props.id, { forceCharacterRef: e.target.checked })
              }
            />
            角色参考
          </label>
          <label className="dd-check">
            <input
              type="checkbox"
              checked={forceSceneRef}
              onChange={(e) => updateNodeData(props.id, { forceSceneRef: e.target.checked })}
            />
            场景参考
          </label>
          <label className="dd-check">
            <input
              type="checkbox"
              checked={styleLock}
              onChange={(e) => updateNodeData(props.id, { styleLock: e.target.checked })}
            />
            风格锁
          </label>
          <label className="dd-check">
            <input
              type="checkbox"
              checked={prefer3dRef}
              onChange={(e) => updateNodeData(props.id, { prefer3dRef: e.target.checked })}
            />
            优先3D
          </label>
          <button
            type="button"
            className="dd-chip"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? '收起' : '风格…'}
          </button>
        </div>

        <div className="dd-row">
          <label className="dd-check">
            <input
              type="checkbox"
              checked={autoOpenReview}
              onChange={(e) => updateNodeData(props.id, { autoOpenReview: e.target.checked })}
            />
            批完进审阅
          </label>
          <label className="dd-check">
            <input
              type="checkbox"
              checked={syncStyleToPicture}
              onChange={(e) =>
                updateNodeData(props.id, { syncStyleToPicture: e.target.checked })
              }
            />
            风格写回出图
          </label>
        </div>

        {showAdvanced && (
          <div className="dd-advanced">
            <input
              type="text"
              className="dd-input"
              value={stylePrompt}
              placeholder="统一风格补充（如 film still, teal-orange）"
              onChange={(e) => updateNodeData(props.id, { stylePrompt: e.target.value })}
            />
            <div className="dd-row">
              <span className="dd-meta">Seed</span>
              <input
                type="number"
                className="dd-input is-seed"
                value={styleSeed ?? ''}
                placeholder="空=模型默认"
                onChange={(e) => {
                  const v = e.target.value;
                  updateNodeData(props.id, {
                    styleSeed: v === '' ? null : Number(v),
                  });
                }}
              />
              <button type="button" className="dd-chip is-on" onClick={syncStyleNow}>
                立即写回
              </button>
              {storyboard.globalArtDirection && (
                <span className="dd-meta" title={storyboard.globalArtDirection}>
                  已读全局美术方向
                </span>
              )}
            </div>
          </div>
        )}

        <p className="dd-meta">
          {pictureNode
            ? `出图：图像生成 · ${(pictureNode.data as Record<string, unknown>)?.model ?? '默认'}`
            : '出图：默认 Gemini 2.5 Flash Image（建议放图像生成节点）'}
          {clipNode ? ' · 可送视频' : ''}
          {storyboard.activeEpisodeId ? ' · 仅当前集' : ''}
        </p>

        <div className="dd-queue">
          <div className="dd-queue__head">
            <span className="dd-meta">
              队列 {visibleShots.length}
              {selectedIds.size > 0 ? ` · 已选 ${selectedIds.size}` : ''}
            </span>
            <span className="dd-row">
              <button type="button" onClick={selectAllVisible}>
                全选
              </button>
              <button type="button" onClick={clearSelect}>
                清空
              </button>
              <button
                type="button"
                onClick={() => {
                  setStoryboardOpen(true);
                  appendLog('已打开故事板');
                }}
              >
                故事板
              </button>
            </span>
          </div>

          {visibleShots.length === 0 ? (
            <p className="dd-preview__empty" style={{ padding: 16 }}>
              {stats.total === 0
                ? '当前集暂无镜头 · 请先完成剧本拆分 / 分镜台'
                : '该筛选下无镜头'}
            </p>
          ) : (
            visibleShots.map((shot) => {
              const badge = statusBadge(shot);
              const chars = resolveBlockCharacters(data, shot, characters);
              const isRun = runningShotId === shot.id;
              return (
                <div
                  key={shot.id}
                  className={`dd-item ${isRun ? 'is-running' : ''} ${
                    selectedIds.has(shot.id) ? 'is-active' : ''
                  }`}
                  onDoubleClick={() => {
                    focusShot(shot.id);
                    void runBatch('one', shot.id);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(shot.id)}
                    onChange={() => toggleSelect(shot.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {shot.firstFrameAssetId ? (
                    <img
                      src={shot.firstFrameAssetId}
                      alt=""
                      className="dd-thumb"
                      draggable={false}
                      onClick={() => {
                        focusShot(shot.id);
                        updateNodeData(props.id, {
                          previewUrl: shot.firstFrameAssetId,
                        });
                      }}
                    />
                  ) : (
                    <div
                      className="dd-thumb is-empty"
                      onClick={() => focusShot(shot.id)}
                    >
                      #{shot.index}
                    </div>
                  )}
                  <div
                    className="dd-item__body"
                    onClick={() => focusShot(shot.id)}
                    title={shotKeyframePrompt(shot)}
                  >
                    <div className="dd-item__title">
                      #{shot.index}{' '}
                      {shot.descriptionZh || shot.promptEn || '未命名'}
                    </div>
                    <div className="dd-item__sub">
                      {shot.durationSec}s · {shot.shotType}
                      {chars.length ? ` · ${chars.map((c) => c.name).join('/')}` : ''}
                      {shot.sceneName ? ` · ${shot.sceneName}` : ''}
                      {shot.director3dGuide?.captureUrl ? ' · 3D' : ''}
                    </div>
                  </div>
                  <span className={`dd-badge ${badge.cls}`}>{badge.label}</span>
                </div>
              );
            })
          )}
        </div>

        <div className="dd-preview">
          {previewUrl ? (
            <img src={previewUrl} alt="" draggable={false} />
          ) : (
            <div className="dd-preview__empty">
              <Clapperboard
                size={22}
                strokeWidth={1.25}
                style={{ opacity: 0.45, margin: '0 auto 6px' }}
              />
              批出后显示最近关键帧
              <br />
              双击队列可单镜出图
            </div>
          )}
        </div>

        {batchError && <p className="dd-error">{batchError}</p>}

        <div className="dd-acts">
          {running && (
            <button type="button" className="dd-btn is-ghost" onClick={stopBatch} title="停止">
              <Square size={12} />
            </button>
          )}
          {!running && stats.failed > 0 && (
            <button
              type="button"
              className="dd-btn is-ghost"
              title="重试全部失败镜头"
              onClick={() => void runBatch('failed')}
            >
              <RotateCcw size={12} />
            </button>
          )}
          {!running && (
            <button
              type="button"
              className="dd-btn is-ghost"
              title="打开关键帧审阅"
              onClick={openReviewNow}
            >
              <ShieldCheck size={12} />
            </button>
          )}
          {!running && (
            <button
              type="button"
              className="dd-btn is-ghost"
              title={clipNode ? '关键帧写入视频生成' : '画布需有视频生成节点'}
              disabled={!clipNode || stats.withFrame === 0}
              onClick={sendToVideo}
            >
              <Film size={12} />
            </button>
          )}
          <button
            type="button"
            className="dd-btn is-primary"
            disabled={running || stats.total === 0}
            onClick={() =>
              void runBatch(filter === 'selected' ? 'selected' : 'filter')
            }
          >
            <Play size={12} />
            {primaryLabel}
          </button>
        </div>
    </>
  );

  return (
    <>
      <BlockShell {...props}>
        <div className="dd nodrag nopan">
          <button
            type="button"
            className="dd-summary-card"
            onClick={openStudio}
            onDoubleClick={openStudio}
          >
            <div className={`dd-summary-card__hero ${stats.total === 0 ? 'is-empty' : ''}`}>
              <div>
                <span className="dd-summary-card__eyebrow">导演台</span>
                <strong>关键帧批生产</strong>
                <p>{summaryLine}</p>
              </div>
              <div className="dd-summary-card__metric">
                {stats.withFrame}
                <small>/{stats.total || '—'}</small>
              </div>
            </div>
            {stats.total > 0 && (
              <>
                <div className="dd-summary-card__stats">
                  <span>
                    <b>{stats.missing}</b>未出
                  </span>
                  <span>
                    <b>{stats.failed}</b>失败
                  </span>
                  <span>
                    <b>{stats.with3d}</b>有3D
                  </span>
                  <span>
                    <b>{progressPct}%</b>进度
                  </span>
                </div>
                <div className="dd-summary-card__chips">
                  {forceCharacterRef ? <span>角色参考</span> : null}
                  {forceSceneRef ? <span>场景参考</span> : null}
                  {styleLock ? <span>风格锁</span> : null}
                  {prefer3dRef ? <span>优先3D</span> : null}
                  {running ? <span>出图中</span> : null}
                </div>
              </>
            )}
            <div className="dd-summary-card__trail">点击进入导演台</div>
          </button>

          {batchError ? <p className="dd-card__hint is-warn">{batchError}</p> : null}

          <div className="dd-card__actions">
            {!running && stats.total > 0 ? (
              <button
                type="button"
                className="dd-btn is-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  void runBatch(filter === 'selected' ? 'selected' : 'filter');
                }}
              >
                <Play size={12} />
                批出
              </button>
            ) : null}
            <button
              type="button"
              className="dd-btn is-primary"
              onClick={(e) => {
                e.stopPropagation();
                openStudio();
              }}
            >
              开台
            </button>
          </div>
        </div>
      </BlockShell>

      <ScreenModal
        open={studioOpen}
        onClose={closeStudio}
        title="导演台 · 关键帧批生产"
        subtitle="队列筛选 · 批出 · 审阅 · 送视频"
        width={980}
        variant="default"
        className="dd-modal"
      >
        <div className="dd dd-studio">{deskBody}</div>
      </ScreenModal>
    </>
  );
}

export default memo(DirectorDeskBlock);
