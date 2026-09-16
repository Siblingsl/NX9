import { useCallback, useMemo, useRef, useState } from 'react';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  Clapperboard,
  Copy,
  FileJson,
  FileSpreadsheet,
  Film,
  Gauge,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  FRAME_STUDY_DEFAULT_ASPECT,
  FRAME_STUDY_STRATEGIES,
  buildChainStoryboardPayload,
  buildFrameStudyPlan,
  buildFrameStudyExportFileName,
  buildFrameStudyShotPreviewRows,
  describeFrameStudyPlan,
  formatFrameStudyTimecode,
  insertMultiGridShotsIntoBreakdown,
  lookupFrameStudyStrategy,
  mergeFrameStudyReversals,
  planFrameStudyShots,
  readFrameStudyMode,
  serializeFrameStudy,
  type FrameStudyExportFormat,
  type FrameStudyItem,
  type FrameStudyPlan,
  type FrameStudyResult,
  type FrameStudyReverseInput,
  type NodeRunStatus,
  type ScriptBreakdownPayload,
} from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import { useUpstreamMedia } from '../generation/use-upstream-media';
import { useUpstreamShots } from '../generation/use-upstream-shots';
import { useDeckUi } from '../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { toastError, toastSuccess } from '../../../../../stores/toast';
import { askConfirm } from '../../../../../stores/confirm-dialog';
import {
  CELL_GEN_CONCURRENCY_OPTIONS,
  resolveCellGenConcurrency,
} from '../../../../flow-runner-ops/cell-gen-batch';
import {
  buildFrameStudyResultPatch,
  clearFrameStudyFrame,
  probeFrameStudyDuration,
  readFrameStudyItems,
  readFrameStudyResult,
  rerunFrameStudyFrame,
} from '../../../../flow-runner-ops/frame-study-ops';
import { MULTI_GRID_NO_UPSTREAM_REASON } from '../../../../multi-grid-closure';
import {
  readDeskChainStoryboard,
  resolveUpstreamChainDesk,
} from '../../../../chain-storyboard-utils';
import {
  applyDeskBreakdown,
  stripEpisodeConfirmation,
} from '../../../../storyboard-desk-runner';
import {
  abortBlockRun,
  beginBlockRunAbort,
  endBlockRunAbort,
} from '../../../../../engine/block-run-abort';

export interface FrameStudyWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

/**
 * 本节点最近一次「送入分镜」的写回记录（存在节点 data，`frameStudyShotWriteback`）。
 * `key` 是「拉片表 + 本批镜头」的防重键：同键不重复追加。
 */
interface FrameStudyShotWriteback {
  key: string;
  ids: string[];
  count: number;
  deskId?: string;
  at: string;
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 单帧卡片的 DOM id（供「跳到该帧」/定位高亮用） */
function frameStudyItemDomId(blockId: string, index: number): string {
  return `nx9-frame-study-${blockId}-${index}`;
}

/**
 * 逐帧拉片工作区（tool 壳层，节点下方底部跟随工作区）。
 *
 * 能力：上游视频 → 抽帧策略（按张数 / 按间隔）→ 抽帧 → 逐帧反推 → 拉片表
 * （缩略图 + 时间码 + 逐帧提示词，可单帧编辑 / 复制 / 重推 / 清空）→ 导出 JSON / CSV → 送入分镜。
 *
 * 诚实口径：
 * - 时间码一律按**抽帧管线实际落点**展示（见 shared/utils/frame-study-plan 的文件头说明）；
 * - 计划告警原样展示在参数区，不隐藏「片尾未覆盖」这类真实限制；
 * - 无上游视频 / 无帧 / 无上游镜表时给明确中文提示，不做空成功。
 */
export function FrameStudyWorkspace({ blockId, kind, onCollapse }: FrameStudyWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const data = useAttachedNodeData(blockId);
  const { clips: upstreamClips } = useUpstreamMedia(blockId);
  const { hasUpstream, shots, shotIds } = useUpstreamShots(blockId);
  const runAbortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const patch = useCallback(
    (next: Record<string, unknown>) => updateNodeData(blockId, next),
    [blockId, updateNodeData],
  );

  /* ────────────── 输入：视频 / 策略 / 上下文 ────────────── */

  const upstreamClip = (upstreamClips[0] ?? '').trim();
  const pinnedVideo = (data.frameStudyVideoUrl as string | undefined)?.trim() ?? '';
  const videoUrl = upstreamClip || pinnedVideo;

  const mode = readFrameStudyMode(data.frameStudyMode);
  const strategy = lookupFrameStudyStrategy(mode);
  const value = toPositiveNumber(data.frameStudyValue, strategy.defaultValue);
  const aspectRatio =
    ((data.aspectRatio as string | undefined) ?? '').trim() || FRAME_STUDY_DEFAULT_ASPECT;
  const context = ((data.frameStudyContext as string | undefined) ?? '').trim();
  const concurrency = resolveCellGenConcurrency(data);
  const status = (data.status as string | undefined) ?? 'idle';
  const running = status === 'running';

  const probedDuration = (() => {
    const n = Number(data.frameStudyDurationSec);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const durationNote = ((data.frameStudyDurationNote as string | undefined) ?? '').trim();

  const plan = data.frameStudyPlan as FrameStudyPlan | undefined;
  const result = useMemo(() => readFrameStudyResult(data), [data]);
  const items = useMemo(() => readFrameStudyItems(data), [data]);
  const batchProgress = data.batchProgress as { done?: number; total?: number } | undefined;

  /** 按当前参数实时预览的计划（不写节点，避免参数改动即脏写） */
  const previewPlan = useMemo<FrameStudyPlan>(
    () =>
      buildFrameStudyPlan({
        mode,
        value,
        durationSec: probedDuration,
        sourceUrl: videoUrl,
        aspectRatio,
      }),
    [aspectRatio, mode, probedDuration, value, videoUrl],
  );

  /** 面板展示的计划：已跑过就用落盘计划（时间码与实际帧对齐），否则用实时预览 */
  const shownPlan = plan && Array.isArray(plan.timeSec) ? plan : previewPlan;
  const shownResult: FrameStudyResult = useMemo(() => {
    if (result) return result;
    return mergeFrameStudyReversals(shownPlan, []);
  }, [result, shownPlan]);

  const frameUrls = useMemo(
    () => items.map((i) => (i.thumbnailUrl ?? '').trim()).filter(Boolean),
    [items],
  );

  /* ────────────── 参数操作 ────────────── */

  const handleSelectMode = useCallback(
    (next: string) => {
      patch({
        frameStudyMode: next,
        frameStudyValue: lookupFrameStudyStrategy(next).defaultValue,
        // 策略变了 → 已落盘的拉片表与计划作废，避免新旧口径混在一张表里
        frameStudyPlan: undefined,
        frameStudyItems: undefined,
        frameStudyResult: undefined,
        frameStudyFrameUrls: undefined,
      });
    },
    [patch],
  );

  const handleProbeDuration = useCallback(async () => {
    if (!videoUrl) {
      toastError('未连接上游视频：请先把视频节点连到本节点左侧，或在下方指定视频地址');
      return;
    }
    setBusy('probe');
    try {
      const probe = await probeFrameStudyDuration(videoUrl);
      patch({
        frameStudyVideoUrl: videoUrl,
        frameStudyDurationSec: probe.durationSec,
        frameStudyDurationNote: probe.message,
      });
      if (probe.durationSec === null) {
        toastError(probe.message ?? '时长探测失败：时间码将留空（不编造）');
        appendLog(`逐帧拉片 · 时长探测失败：${probe.message ?? '未返回时长'}`);
      } else {
        toastSuccess(`视频时长约 ${probe.durationSec}s`);
        appendLog(`逐帧拉片 · 已探到视频时长 ${probe.durationSec}s`);
      }
    } finally {
      setBusy(null);
    }
  }, [appendLog, patch, videoUrl]);

  const handleResetTable = useCallback(() => {
    patch({
      frameStudyPlan: undefined,
      frameStudyItems: undefined,
      frameStudyResult: undefined,
      frameStudyFrameUrls: undefined,
      frameStudyShotWriteback: undefined,
    });
    appendLog('逐帧拉片 · 已清空拉片表（计划与逐帧结果一并作废）');
  }, [appendLog, patch]);

  /* ────────────── 运行 / 停止 ────────────── */

  const handleRun = useCallback(async () => {
    if (!runtime) return;
    if (!videoUrl) {
      toastError('逐帧拉片缺少上游视频：请把视频连到本节点左侧，或在面板指定视频地址（禁止空成功）');
      return;
    }
    const controller = beginBlockRunAbort(blockId);
    runAbortRef.current = controller;
    patch({ status: 'running', error: undefined, frameStudyVideoUrl: videoUrl });
    try {
      const { runCascadeFromBlock } = await import('../../../execution/cascade-runner');
      await runCascadeFromBlock({
        blockId,
        nodes,
        edges,
        setEdges: (updater) => {
          if (typeof updater === 'function') {
            runtime.setEdges(updater(runtime.getEdges()));
          }
        },
        updateNodeData: (id, nodePatch) => runtime.updateNodeData(id, nodePatch),
        signal: {
          get cancelled() {
            return controller.signal.aborted;
          },
          abortSignal: controller.signal,
        },
      });
      if (controller.signal.aborted) {
        appendLog('逐帧拉片 · 已停止');
        return;
      }
      const last = runtime.getNodes().find((n) => n.id === blockId)?.data as
        | { lastResult?: { count?: number; total?: number; failures?: unknown[] } }
        | undefined;
      const failures = last?.lastResult?.failures?.length ?? 0;
      appendLog(
        `逐帧拉片 · 归位 ${last?.lastResult?.count ?? 0}/${last?.lastResult?.total ?? 0} 帧` +
          (failures > 0 ? `（${failures} 帧有问题）` : ''),
      );
    } catch (e) {
      if (controller.signal.aborted) appendLog('逐帧拉片 · 已停止');
      else {
        patch({ status: 'error', error: String(e) });
        toastError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      endBlockRunAbort(blockId, controller);
      if (runAbortRef.current === controller) runAbortRef.current = null;
    }
  }, [appendLog, blockId, edges, nodes, patch, runtime, videoUrl]);

  const handleStop = useCallback(() => {
    const had = abortBlockRun(blockId) || Boolean(runAbortRef.current);
    runAbortRef.current = null;
    patch({ status: 'idle', error: undefined, batchProgress: undefined });
    appendLog(had ? '逐帧拉片 · 已停止' : '逐帧拉片 · 已收回空闲');
  }, [appendLog, blockId, patch]);

  /* ────────────── 单帧：编辑 / 复制 / 重推 / 清空 ────────────── */

  /** 逐帧结果重建：以节点里已落盘的帧为基，只替换指定帧的字段（其余原样保留） */
  const commitItems = useCallback(
    (next: FrameStudyItem[]) => {
      const reversals: FrameStudyReverseInput[] = next.map((it, i) => ({
        index: i,
        timeSec: it.timeSec,
        thumbnailUrl: it.thumbnailUrl,
        reversePromptZh: it.reversePromptZh,
        reversePromptEn: it.reversePromptEn,
      }));
      const merged = mergeFrameStudyReversals(shownPlan, reversals);
      patch(buildFrameStudyResultPatch({ plan: shownPlan, result: merged }));
    },
    [patch, shownPlan],
  );

  const handleEditPrompt = useCallback(
    (index: number, field: 'reversePromptZh' | 'reversePromptEn', text: string) => {
      const next = items.map((it, i) => (i === index ? { ...it, [field]: text } : it));
      commitItems(next);
    },
    [commitItems, items],
  );

  const handleCopyFrame = useCallback(
    async (index: number) => {
      const item = items[index];
      if (!item) return;
      const payload = [
        `第 ${index + 1} 帧${item.timeSec === undefined ? '' : ` · ${formatFrameStudyTimecode(item.timeSec)}`}`,
        item.reversePromptZh ? `中文：${item.reversePromptZh}` : '',
        item.reversePromptEn ? `英文：${item.reversePromptEn}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      try {
        await navigator.clipboard.writeText(payload);
        toastSuccess(`已复制第 ${index + 1} 帧提示词`);
      } catch (e) {
        toastError(`复制失败：${e instanceof Error ? e.message : String(e)}（可手动选中文本复制）`);
      }
    },
    [items],
  );

  const handleRerunFrame = useCallback(
    async (index: number) => {
      if (!runtime) return;
      setBusy(`frame-${index}`);
      try {
        const res = await rerunFrameStudyFrame({
          blockId,
          data,
          index,
          updateNodeData: (id, next) => runtime.updateNodeData(id, next),
        });
        if (res.ok) {
          appendLog(`逐帧拉片 · 第 ${index + 1} 帧已重推`);
          toastSuccess(`第 ${index + 1} 帧已重推`);
        } else {
          appendLog(`逐帧拉片 · 第 ${index + 1} 帧重推失败：${res.reason}`);
          toastError(res.reason ?? '重推失败（禁止空成功）');
        }
      } catch (e) {
        toastError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [appendLog, blockId, data, runtime],
  );

  const handleClearFrame = useCallback(
    (index: number) => {
      const done = clearFrameStudyFrame({
        blockId,
        data,
        index,
        updateNodeData: (id, next) => updateNodeData(id, next),
      });
      if (!done) {
        toastError('该帧没有可清空的内容（不静默成功）');
        return;
      }
      appendLog(`逐帧拉片 · 已清空第 ${index + 1} 帧`);
      toastSuccess('已清空该帧');
    },
    [appendLog, blockId, data, updateNodeData],
  );

  /* ────────────── 导出 ────────────── */

  const handleExport = useCallback(
    (format: FrameStudyExportFormat) => {
      if (items.length === 0) {
        toastError('还没有拉片表：请先抽帧并逐帧反推，再导出（禁止空成功）');
        return;
      }
      const text = serializeFrameStudy(format, shownPlan, shownResult);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
      const blob = new Blob([text], {
        type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildFrameStudyExportFileName(format, stamp);
      a.click();
      URL.revokeObjectURL(url);
      appendLog(
        `逐帧拉片 · 已导出 ${format.toUpperCase()}（${items.length} 帧 · ${shownResult.frameCount} 帧有图）`,
      );
      toastSuccess(`已导出 ${format.toUpperCase()} 拉片表`);
    },
    [appendLog, items.length, shownPlan, shownResult],
  );

  /* ────────────── 送入分镜（写回上游链镜表，复用多格推演同一套写回口径） ────────────── */

  const upstreamDeskId = useMemo(
    () => resolveUpstreamChainDesk(blockId, nodes, edges),
    [blockId, edges, nodes],
  );
  const upstreamDeskData = useMemo(() => {
    const desk = nodes.find((node) => node.id === upstreamDeskId);
    return (desk?.data ?? {}) as Record<string, unknown>;
  }, [nodes, upstreamDeskId]);
  const upstreamChain = useMemo(
    () => readDeskChainStoryboard(upstreamDeskData),
    [upstreamDeskData],
  );
  const upstreamBreakdown = upstreamDeskData.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const writeback = data.frameStudyShotWriteback as FrameStudyShotWriteback | undefined;

  const shotPlan = useMemo(
    () =>
      items.length === 0
        ? undefined
        : planFrameStudyShots(shownPlan, shownResult, {
            upstreamShots: shots,
            episodeId: upstreamChain?.activeEpisodeId ?? null,
          }),
    [items.length, shots, shownPlan, shownResult, upstreamChain?.activeEpisodeId],
  );
  const shotRows = useMemo(
    () => (shotPlan?.ok ? buildFrameStudyShotPreviewRows(shotPlan.shots) : []),
    [shotPlan],
  );
  const shotPlanWritten = Boolean(shotPlan?.key && writeback?.key === shotPlan.key);
  const shotBlockedReason = !videoUrl
    ? '先连接上游视频并运行一次拉片，再送入分镜'
    : items.length === 0
      ? '还没抽帧：请先运行「抽帧并逐帧反推」'
      : !shotPlan?.ok
        ? shotPlan?.warnings[0]?.messageZh ?? '没有可生成的镜头'
        : !hasUpstream || shotIds.length === 0
          ? MULTI_GRID_NO_UPSTREAM_REASON
          : !upstreamDeskId
            ? '未找到上游分镜台节点（storyboard-desk）：无法写回镜表'
            : shotPlanWritten
              ? '本批镜头已写入过（同一拉片表 + 同一批镜头 id）：未重复追加'
              : '';

  const handleSendToStoryboard = useCallback(async () => {
    if (!shotPlan?.ok) {
      toastError(shotPlan?.warnings[0]?.messageZh ?? '没有可生成的镜头（不静默成功）');
      return;
    }
    if (!hasUpstream || shotIds.length === 0) {
      toastError(MULTI_GRID_NO_UPSTREAM_REASON);
      appendLog(`逐帧拉片 · 未送分镜：${MULTI_GRID_NO_UPSTREAM_REASON}`);
      return;
    }
    if (!upstreamDeskId) {
      toastError('未找到上游分镜台节点（storyboard-desk）：无法写回镜表');
      return;
    }
    if (shotPlanWritten) {
      const msg = '本批镜头已写入过（同一拉片表 + 同一批镜头 id）：未重复追加；如需重写请先修改逐帧提示词。';
      toastError(msg);
      appendLog(`逐帧拉片 · 未重复写入：${msg}`);
      return;
    }
    const existingIds = new Set<string>([
      ...(upstreamChain?.shots ?? []).map((shot) => shot.id),
      ...useWorkspaceDocument.getState().storyboard.shots.map((shot) => shot.id),
    ]);
    const fresh = shotPlan.shots.filter((shot) => !existingIds.has(shot.id));
    if (fresh.length === 0) {
      toastError('这批镜头已存在于镜表中（同 id）：未重复写入');
      appendLog('逐帧拉片 · 未重复写入：镜表中已存在同 id 镜头');
      return;
    }

    const warningNote = shotPlan.warnings.length
      ? `\n注意：${shotPlan.warnings.map((w) => w.messageZh).join(' ')}`
      : '';
    const ok = await askConfirm({
      title: `把 ${fresh.length} 个拉片镜头写入分镜台？`,
      description: `${shotPlan.summaryZh}${warningNote}`,
      confirmLabel: '写入分镜',
      tone: 'neutral',
    });
    if (!ok) return;

    setBusy('shots');
    try {
      const targetEpisodeId =
        upstreamChain?.activeEpisodeId ?? shotPlan.targetEpisode.episodeId ?? null;
      const insert = insertMultiGridShotsIntoBreakdown(upstreamBreakdown, fresh, {
        episodeId: targetEpisodeId,
      });
      if (insert.ok && insert.payload) {
        applyDeskBreakdown(
          upstreamDeskId,
          insert.payload,
          (id, next) => updateNodeData(id, next),
          stripEpisodeConfirmation(upstreamDeskData, insert.episodeId),
        );
      } else {
        appendLog(
          `逐帧拉片 · 分镜台拆镜结构未插入（${insert.reasonZh}）：本次只写链镜表与全局镜表`,
        );
      }

      const frameById = new Map(
        fresh
          .filter((shot) => (shot.firstFrameAssetId ?? '').trim())
          .map((shot) => [shot.id, String(shot.firstFrameAssetId)] as const),
      );
      updateNodeData(upstreamDeskId, (node) => {
        const chain = readDeskChainStoryboard((node.data ?? {}) as Record<string, unknown>);
        if (!chain) return {};
        const known = new Set(chain.shots.map((shot) => shot.id));
        const appended = fresh
          .filter((shot) => !known.has(shot.id))
          .map((shot) => ({
            ...shot,
            firstFrameAssetId: frameById.get(shot.id) ?? null,
            keyframeStatus: frameById.has(shot.id) ? ('review' as const) : ('draft' as const),
            status: frameById.has(shot.id) ? ('review' as const) : ('draft' as const),
          }));
        const merged = [...chain.shots, ...appended];
        const nextShots = merged.map((shot) => {
          const frame = frameById.get(shot.id);
          return frame
            ? {
                ...shot,
                firstFrameAssetId: frame,
                keyframeStatus: 'review' as const,
                status: 'review' as const,
              }
            : shot;
        });
        return { chainStoryboard: buildChainStoryboardPayload(chain, { shots: nextShots }) };
      });

      useWorkspaceDocument.getState().addShots(fresh, 'append');
      patch({
        frameStudyShotWriteback: {
          key: shotPlan.key,
          ids: fresh.map((shot) => shot.id),
          count: fresh.length,
          deskId: upstreamDeskId,
          at: new Date().toISOString(),
        } satisfies FrameStudyShotWriteback,
      });
      appendLog(
        `逐帧拉片 · 已写入 ${fresh.length} 个拉片镜头到分镜台（序号 ${shotPlan.startIndex}–${shotPlan.nextIndex - 1}` +
          `${frameById.size > 0 ? ` · ${frameById.size} 镜带首帧` : ''}` +
          `${insert.ok ? '' : ` · 拆镜结构未插入：${insert.reasonZh}`}）`,
      );
      toastSuccess(`已写入 ${fresh.length} 个镜头到分镜台`);
    } finally {
      setBusy(null);
    }
  }, [
    appendLog,
    hasUpstream,
    patch,
    shotIds.length,
    shotPlan,
    shotPlanWritten,
    updateNodeData,
    upstreamBreakdown,
    upstreamChain?.activeEpisodeId,
    upstreamChain?.shots,
    upstreamDeskData,
    upstreamDeskId,
  ]);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  /* ────────────── 渲染 ────────────── */

  const failureCount = (
    (data.lastResult as { failures?: unknown[] } | undefined)?.failures ?? []
  ).length;

  const toolbarLeft = (
    <div className="flex items-center gap-1 flex-wrap min-w-0" onMouseDown={stop}>
      {FRAME_STUDY_STRATEGIES.map((s) => (
        <button
          key={s.id}
          type="button"
          onMouseDown={stop}
          onClick={() => handleSelectMode(s.id)}
          title={s.hint}
          className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
            mode === s.id
              ? 'border-brand/40 bg-brand/10 text-brand'
              : 'border-line/40 text-ink/55 hover:text-ink'
          }`}
        >
          {s.label}
        </button>
      ))}
      <span className="w-px h-3.5 bg-line/50" />
      <button
        type="button"
        onMouseDown={stop}
        onClick={handleResetTable}
        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md text-ink/55 hover:text-ink hover:bg-surface/90"
        title="丢弃当前拉片表（计划 + 逐帧结果），回到按当前参数重新抽帧"
      >
        <RotateCcw size={11} />
        清空拉片表
      </button>
    </div>
  );

  const toolbarAdvanced = (
    <div className="space-y-2.5" onMouseDown={stop}>
      <div className="rounded-lg bg-surface/60 px-2 py-1.5 text-[10px] text-ink/50 leading-relaxed">
        {strategy.label} · {videoUrl ? '已连接视频' : '待视频'} ·{' '}
        {probedDuration === null ? '时长未知' : `时长约 ${probedDuration}s`} · 模型由服务端视觉通道决定
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">
          {strategy.valueLabel}
          <span className="ml-1 text-[9px] text-ink/35">
            {mode === 'count'
              ? `1–${strategy.maxValue} 帧`
              : `1–${strategy.maxValue} 秒（服务端按 fps=1/N 采样，可达间隔 30/15/10/7/6/5/4/3/2/1 秒）`}
          </span>
        </span>
        <input
          type="number"
          min={strategy.minValue}
          max={strategy.maxValue}
          value={value}
          onChange={(e) =>
            patch({ frameStudyValue: toPositiveNumber(e.target.value, strategy.defaultValue) })
          }
          className="w-24 rounded-lg border border-line/50 px-2 py-1 text-[11px] bg-surface"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">帧图宽高比（写入下游出图 / 送分镜的口径）</span>
        <select
          value={aspectRatio}
          onChange={(e) => patch({ aspectRatio: e.target.value })}
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] bg-surface"
        >
          {['16:9', '9:16', '1:1', '4:3', '3:2'].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">
          逐帧反推并发
          <span className="ml-1 text-[9px] text-ink/35">同时反推的帧数（1 = 串行）</span>
        </span>
        <select
          value={String(concurrency)}
          onChange={(e) => patch({ concurrency: Number(e.target.value) })}
          className="w-24 rounded-lg border border-line/50 px-2 py-1 text-[11px] bg-surface"
          title="逐帧反推的有界并发上限（1–4，缺省 2）；与执行器共用同一解析口径（data.concurrency）"
        >
          {CELL_GEN_CONCURRENCY_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n === 1 ? '1（串行）' : n}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">参考视频上下文（作为逐帧反推的剧情 / 复刻目标）</span>
        <textarea
          value={context}
          onChange={(e) => patch({ frameStudyContext: e.target.value })}
          rows={2}
          placeholder="例：雨夜追逐，手持跟拍，冷调霓虹"
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] resize-none bg-surface"
        />
      </label>

      <div className="rounded-lg border border-line/40 px-2 py-1.5 space-y-1">
        <div className="text-[10px] text-ink/45">抽帧计划（按当前参数）</div>
        <p className="text-[10px] text-ink/60 leading-relaxed whitespace-pre-wrap break-words">
          {describeFrameStudyPlan(shownPlan)}
        </p>
      </div>

      {videoUrl && (
        <video
          src={videoUrl}
          controls
          className="w-full max-h-32 rounded-lg border border-line/40 bg-black/80"
        />
      )}
    </div>
  );

  const topSlot = (
    <>
      <div className="mx-3 mt-2 flex items-center gap-2" onMouseDown={stop}>
        <span className="text-[10px] text-ink/45 shrink-0">参考视频</span>
        {videoUrl ? (
          <span className="text-[10px] text-ink/60 truncate" title={videoUrl}>
            {videoUrl}
            {!upstreamClip && <span className="text-ink/35">（面板指定）</span>}
          </span>
        ) : (
          <span className="text-[10px] text-ink/40">
            未连接上游视频：请把「视频生成 / 素材导入」等节点的视频连到本节点左侧，或在右侧指定视频地址
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <input
            type="text"
            value={pinnedVideo}
            onMouseDown={stop}
            onChange={(e) => patch({ frameStudyVideoUrl: e.target.value })}
            placeholder="/media/videos/… 视频地址"
            className="w-44 rounded-lg border border-line/50 px-1.5 py-1 text-[10px] bg-surface"
            title="上游没有视频时，可在此指定待拉片的视频地址"
          />
          <button
            type="button"
            onMouseDown={stop}
            disabled={busy !== null}
            onClick={() => void handleProbeDuration()}
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[10px] text-ink/65 hover:text-brand hover:border-brand/40 disabled:opacity-40"
            title={
              videoUrl
                ? '调用 POST /api/montage/probe-duration 真实探测视频时长；失败会如实说「时长未知」而不是猜'
                : '还没有视频：点击会提示先连接上游视频（或在本行右侧指定视频地址），不会发出探测请求'
            }
          >
            <Gauge size={10} className={busy === 'probe' ? 'animate-pulse' : undefined} />
            探测时长
          </button>
        </div>
      </div>

      {durationNote && probedDuration === null && (
        <div className="mx-3 mt-1 text-[10px] text-amber-700">{durationNote}</div>
      )}

      {running && (
        <div className="mx-3 mt-1.5 flex items-center gap-2 text-[10px] text-ink/55">
          <Sparkles size={11} className="animate-pulse" />
          拉片中 {batchProgress?.done ?? 0}/{batchProgress?.total ?? shownPlan.timeSec.length}
        </div>
      )}

      <div
        className="mx-3 mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-ink/55"
        onMouseDown={stop}
      >
        <span>
          帧 {shownResult.frameCount}/{shownPlan.timeSec.length}
        </span>
        <span>· 反推 {shownResult.reversedCount}/{shownResult.frameCount}</span>
        {failureCount > 0 && <span className="text-red-500">· 有问题 {failureCount}</span>}
        <span className="w-px h-3.5 bg-line/50" />
        <button
          type="button"
          onMouseDown={stop}
          disabled={items.length === 0}
          onClick={() => handleExport('json')}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-line/40 text-ink/60 hover:text-brand hover:border-brand/40 disabled:opacity-40"
          title={items.length === 0 ? '还没有拉片表' : '导出拉片表 JSON（含时间码 / 逐帧提示词 / 备注）'}
        >
          <FileJson size={10} />
          导出 JSON
        </button>
        <button
          type="button"
          onMouseDown={stop}
          disabled={items.length === 0}
          onClick={() => handleExport('csv')}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-line/40 text-ink/60 hover:text-brand hover:border-brand/40 disabled:opacity-40"
          title={items.length === 0 ? '还没有拉片表' : '导出拉片表 CSV（UTF-8 带 BOM，Excel 可直接打开）'}
        >
          <FileSpreadsheet size={10} />
          导出 CSV
        </button>
        <button
          type="button"
          onMouseDown={stop}
          disabled={!shotPlan?.ok || busy !== null || Boolean(shotBlockedReason)}
          onClick={() => void handleSendToStoryboard()}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-brand/40 bg-brand/10 text-brand disabled:opacity-40"
          title={shotBlockedReason || '把拉片表逐帧生成为分镜镜头并写回上游链镜表'}
        >
          <Clapperboard size={10} className={busy === 'shots' ? 'animate-pulse' : undefined} />
          送入分镜
        </button>
      </div>

      {shotBlockedReason && (
        <p className="mx-3 mt-1 text-[10px] text-amber-700 leading-snug">{shotBlockedReason}</p>
      )}

      {(data.message as string | undefined)?.trim() ? (
        <div className="mx-3 mt-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[10px] text-amber-800">
          {String(data.message)}
        </div>
      ) : null}
    </>
  );

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as NodeRunStatus}
      onCollapse={handleCollapse}
      topSlot={topSlot}
      toolbarLeft={toolbarLeft}
      toolbarAdvanced={toolbarAdvanced}
      onRun={() => void handleRun()}
      onStop={handleStop}
      running={running}
      // 无视频时**不禁用**主 CTA：点击即走 handleRun 的无视频分支给出中文提示（禁止空成功，
      // 该分支在此之前就 return，不会发出任何请求 / 写任何节点状态）。禁用态只会让提示无从触达。
      runDisabled={false}
      runLabel={running ? '拉片中…' : '抽帧并逐帧反推'}
      showAi={false}
      showHistory={false}
      heightClass="h-auto max-h-[620px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2 overflow-y-auto nowheel overscroll-contain"
    >
      {!videoUrl ? (
        <p className="text-[11px] text-ink/45">
          逐帧拉片需要一段参考视频：连接上游视频节点后，本面板会按抽帧策略逐帧拆解，
          并为每一帧反推出可复用的提示词。
        </p>
      ) : items.length === 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-ink/45">
            还没有拉片表：确认右上角参数后点「抽帧并逐帧反推」。时间码按抽帧管线实际落点标注。
          </p>
          <ul className="space-y-0.5">
            {previewPlan.warnings.map((w) => (
              <li key={w.code} className="text-[10px] text-amber-700 leading-snug">
                ⚠ {w.messageZh}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-ink/50">
            <span>{shownResult.messageZh}</span>
            {shownResult.warnings.map((w) => (
              <span key={w.code} className="text-amber-700">
                ⚠ {w.messageZh}
              </span>
            ))}
          </div>

          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {items.map((item, i) => {
              const frameBusy = busy === `frame-${i}` || running;
              return (
                <div
                  key={`${item.index}-${i}`}
                  id={frameStudyItemDomId(blockId, i)}
                  className="rounded-lg border border-line/40 bg-surface/60 p-1.5 space-y-1"
                >
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] font-medium text-ink/70">
                      #{i + 1}
                    </span>
                    <span className="text-[9px] text-ink/50">
                      {item.timeSec === undefined
                        ? '时间码未知'
                        : formatFrameStudyTimecode(item.timeSec)}
                    </span>
                    {item.shotSizeLabel && (
                      <span className="text-[9px] text-ink/40">{item.shotSizeLabel}</span>
                    )}
                    {item.cameraMoveLabel && (
                      <span className="text-[9px] text-ink/40">{item.cameraMoveLabel}</span>
                    )}
                  </div>

                  <div className="relative w-full aspect-video rounded border border-line/30 overflow-hidden bg-surface/80">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={`第 ${i + 1} 帧`}
                        className="w-full h-full object-contain"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[9px] text-ink/35">
                        无帧图
                      </div>
                    )}
                  </div>

                  <textarea
                    value={item.reversePromptZh ?? ''}
                    onChange={(e) => handleEditPrompt(i, 'reversePromptZh', e.target.value)}
                    onMouseDown={stop}
                    rows={3}
                    placeholder="中文提示词（可编辑）"
                    title="编辑后写入拉片表并参与导出 / 送分镜"
                    className="w-full rounded border border-line/40 px-1.5 py-1 text-[10px] leading-snug resize-none bg-surface focus:outline-none focus:border-brand/40"
                  />
                  <textarea
                    value={item.reversePromptEn ?? ''}
                    onChange={(e) => handleEditPrompt(i, 'reversePromptEn', e.target.value)}
                    onMouseDown={stop}
                    rows={3}
                    placeholder="英文提示词（可编辑）"
                    title="英文提示词：送分镜时作为该镜 promptEn"
                    className="w-full rounded border border-line/40 px-1.5 py-1 text-[10px] leading-snug resize-none bg-surface focus:outline-none focus:border-brand/40"
                  />

                  {item.notes && (
                    <p className="text-[9px] text-red-500 leading-snug line-clamp-2" title={item.notes}>
                      {item.notes}
                    </p>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onMouseDown={stop}
                      disabled={frameBusy || !item.thumbnailUrl}
                      onClick={() => void handleRerunFrame(i)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-line/50 px-1.5 py-0.5 text-[9px] text-ink/65 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                      title={item.thumbnailUrl ? '只重推该帧，其余帧结果保留' : '该帧没有帧图，无法重推'}
                    >
                      <RefreshCw size={10} className={frameBusy ? 'animate-spin' : undefined} />
                      重推
                    </button>
                    <button
                      type="button"
                      onMouseDown={stop}
                      onClick={() => void handleCopyFrame(i)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-line/50 px-1.5 py-0.5 text-[9px] text-ink/65 hover:text-brand hover:border-brand/40"
                      title="复制该帧的中英提示词与时间码"
                    >
                      <Copy size={10} />
                      复制
                    </button>
                    <button
                      type="button"
                      onMouseDown={stop}
                      onClick={() => handleClearFrame(i)}
                      className="inline-flex items-center justify-center gap-1 rounded-md border border-line/50 px-1.5 py-0.5 text-[9px] text-ink/55 hover:text-red-500 hover:border-red-300"
                      title="清空该帧的帧图与提示词（其余帧不受影响）"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 送入分镜预览：写回前先看清将要新增哪些镜头 */}
          <div className="rounded-lg border border-line/40 bg-surface/60 p-2 space-y-1.5" onMouseDown={stop}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-medium text-ink/70">送入分镜</span>
              {shotPlan?.ok ? (
                <span className="text-[9px] text-ink/45">
                  {shotPlan.shots.length} 镜 · 序号 {shotPlan.startIndex}–{shotPlan.nextIndex - 1}
                  {shotPlan.targetEpisode.episodeTitle
                    ? ` · ${shotPlan.targetEpisode.episodeTitle}`
                    : shotPlan.targetEpisode.episodeId
                      ? ` · ${shotPlan.targetEpisode.episodeId}`
                      : ' · 未识别分集'}
                </span>
              ) : (
                <span className="text-[9px] text-ink/45">待拉片表</span>
              )}
              {shotPlanWritten && (
                <span className="text-[9px] text-emerald-600">
                  本批已写入
                  {writeback?.at ? ` · ${writeback.at.slice(0, 19).replace('T', ' ')}` : ''}
                </span>
              )}
              <button
                type="button"
                onMouseDown={stop}
                disabled={!upstreamDeskId}
                onClick={() => {
                  if (!upstreamDeskId) {
                    toastError(MULTI_GRID_NO_UPSTREAM_REASON);
                    return;
                  }
                  runtime?.focusBlock(upstreamDeskId);
                  runtime?.updateNodeData(upstreamDeskId, { openDeskAt: Date.now() });
                  appendLog('逐帧拉片 · 已定位到上游分镜台：可在工作台核对本批新镜');
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[9px] text-ink/70 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                title={upstreamDeskId ? '定位并打开上游分镜台，核对刚写入的镜头' : '未连接上游分镜台'}
              >
                去分镜台查看
              </button>
            </div>

            {shotRows.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded border border-line/30 divide-y divide-line/20">
                {shotRows.map((row) => (
                  <div key={`${row.index}-${row.descriptionZh.slice(0, 12)}`} className="px-1.5 py-1">
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <span className="text-ink/55">#{row.index}</span>
                      <span className="text-ink/70">{row.shotSizeLabel}</span>
                      <span className="text-ink/45">{row.durationSec}s</span>
                    </div>
                    <p className="text-[9px] text-ink/45 leading-snug line-clamp-2" title={row.descriptionZh}>
                      {row.descriptionZh}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {shotPlan?.warnings.length ? (
              <ul className="space-y-0.5">
                {shotPlan.warnings.map((w) => (
                  <li key={w.code} className="text-[9px] text-amber-700 leading-snug">
                    {w.messageZh}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="text-[9px] text-ink/30 leading-snug">
              逐帧镜头进分镜台拆镜结构（可编辑、重拆不丢）并同步链镜表与全局镜表；
              帧图写为该镜首帧（审阅态）。同一拉片表 + 同一批镜头 id 不会重复追加。
            </p>
          </div>

          <p className="text-[10px] text-ink/30 leading-snug">
            <Film size={9} className="inline mr-0.5" />
            参考帧即上游视频的逐帧截图（服务端 ffmpeg 抽帧，`/media/exports`）；时间码按抽帧管线
            实际落点标注。拉片表与「frame-sampler / 抽帧节点」互不影响：抽帧节点只出图，
            本节点额外给出逐帧提示词与可导出的拉片表。
          </p>
        </div>
      )}
    </ComposerWorkspaceShell>
  );
}
