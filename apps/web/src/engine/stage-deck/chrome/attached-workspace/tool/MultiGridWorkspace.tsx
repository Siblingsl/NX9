import { useCallback, useMemo, useRef, useState } from 'react';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  Clapperboard,
  Download,
  Film,
  FolderPlus,
  ImageDown,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  MULTI_GRID_CLIP_SEC,
  MULTI_GRID_MODES,
  buildChainStoryboardPayload,
  buildMultiGridPlanForMode,
  buildMultiGridShotPreviewRows,
  insertMultiGridShotsIntoBreakdown,
  lookupMultiGridModeDef,
  planCellDurationsFromBeats,
  planMultiGridShots,
  readMultiGridMode,
  type CellDurationPlan,
  type MultiGridCell,
  type MultiGridMode,
  type MultiGridPlan,
  type MultiGridShotPlanResult,
  type NodeRunStatus,
  type ScriptBreakdownPayload,
} from '@nx9/shared';
import { analyzeAudioBeats, type BeatGrid } from '../../../../beat-grid';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { ComposerModelSelect } from '../composer/ComposerModelSelect';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import { useUpstreamMedia } from '../generation/use-upstream-media';
import { useUpstreamShots } from '../generation/use-upstream-shots';
import { useDeckUi } from '../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { toastError, toastSuccess } from '../../../../../stores/toast';
import { askConfirm } from '../../../../../stores/confirm-dialog';
import { api } from '../../../../../api/client';
import { useConnectedPictureModels } from '../../../../../hooks/use-connected-picture-models';
import { uniqueLibraryLabel } from '../../../../picture-gen-refs';
import { writePictureShotPatch } from '../../../../picture-gen-commit';
import {
  readDeskChainStoryboard,
  resolveUpstreamChainDesk,
} from '../../../../chain-storyboard-utils';
import {
  applyDeskBreakdown,
  stripEpisodeConfirmation,
} from '../../../../storyboard-desk-runner';
import {
  MULTI_GRID_NO_UPSTREAM_REASON,
  applyCellUrls,
  buildContactSheetCells,
  buildContactSheetFileName,
  buildMultiGridAssetEntry,
  buildMultiGridAssetLabelBase,
  buildMultiGridContactSheetSignature,
  buildMultiGridShotPatch,
  buildMultiGridWriteBackPlan,
  compactCellUrls,
  computeContactSheetGridLayout,
  describeMultiGridShotTarget,
  readMultiGridCellRunStates,
  readMultiGridCellUrls,
  readMultiGridPendingTasks,
  selectMultiGridRetryIndexes,
  summarizeMultiGridProgress,
  type MultiGridCellRunState,
} from '../../../../multi-grid-closure';
import {
  dropMultiGridCell,
  resumeMultiGridPendingCells,
  runMultiGridCellRetry,
} from '../../../../flow-runner-ops/multi-grid-ops';
import {
  CELL_GEN_CONCURRENCY_OPTIONS,
  resolveCellGenConcurrency,
} from '../../../../flow-runner-ops/cell-gen-batch';
import {
  abortBlockRun,
  beginBlockRunAbort,
  endBlockRunAbort,
} from '../../../../../engine/block-run-abort';
import {
  ConsistencyCheckSection,
  type ConsistencyTarget,
} from '../consistency/ConsistencyCheckSection';

export interface MultiGridWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

/** 逐格结果条目的最小形状（与 GridCellPrompt 对齐，仅用于兜底改写 cellImageUrl） */
interface GridCellLike {
  index?: number;
  cellImageUrl?: string;
}

/**
 * 本节点最近一次「生成分镜镜头」写回记录（存在节点 data，`multiGridShotWriteback`）。
 * `key` 是「计划 + 本批镜头」的防重键：同键不重复追加。
 */
interface MultiGridShotWritebackState {
  key: string;
  ids: string[];
  count: number;
  deskId?: string;
  at: string;
}

const CELL_STATUS_LABEL: Record<MultiGridCellRunState['status'], string> = {
  idle: '待跑',
  running: '出图中',
  success: '成功',
  failed: '失败',
  remote: '后台待续查',
};

const CELL_STATUS_CLASS: Record<MultiGridCellRunState['status'], string> = {
  idle: 'text-ink/40',
  running: 'text-brand',
  success: 'text-emerald-600',
  failed: 'text-red-500',
  remote: 'text-amber-600',
};

/** 稳定空数组：格数不匹配时回落，避免每帧新建引用 */
const EMPTY_DURATIONS: number[] = [];

/** 音频地址短标签（下拉显示末段文件名，完整地址走 option 的 title） */
function shortUrl(url: string): string {
  const clean = (url.split('?')[0] ?? url).replace(/\/+$/, '');
  const parts = clean.split('/');
  return parts[parts.length - 1] || url;
}

function toInt(value: unknown, fallback: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 逐格卡片的 DOM id（供一致性报告「跳到该格」定位 / 高亮） */
function multiGridCellDomId(blockId: string, index: number): string {
  return `nx9-multigrid-cell-${blockId}-${index}`;
}

/**
 * 多格推演工作区：模式切换 → 参数 → 逐格计划（可编辑）→ 批量出图 → 逐格送入视频生成。
 * 结果即计划格：每格展示该格出图，画布摘要与下游消费同一份 gridCells / splitUrls。
 */
export function MultiGridWorkspace({ blockId, kind, onCollapse }: MultiGridWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const data = useAttachedNodeData(blockId);
  const {
    pictures: upstreamPictures,
    sounds: upstreamSounds,
    bgmUrls: upstreamBgmUrls,
    sfxUrls: upstreamSfxUrls,
  } = useUpstreamMedia(blockId);
  const runAbortRef = useRef<AbortController | null>(null);

  /** 可选 BGM 来源：上游音频 / 配乐 / 音效（去重、保序） */
  const audioCandidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const url of [...upstreamSounds, ...upstreamBgmUrls, ...upstreamSfxUrls]) {
      const clean = (url ?? '').trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
    }
    return out;
  }, [upstreamBgmUrls, upstreamSfxUrls, upstreamSounds]);

  const mode = readMultiGridMode(data.multiGridMode);
  const modeDef = lookupMultiGridModeDef(mode);
  const upstreamSource = (upstreamPictures[0] ?? '').trim();
  const pinnedSource = (data.sourceUrl as string | undefined ?? '').trim();
  const sourceUrl = upstreamSource || pinnedSource;

  const rows = toInt(data.multiGridRows, modeDef.rows);
  const cols = toInt(data.multiGridCols, modeDef.cols);
  const focalMin = toInt(data.multiGridFocalMinMm, 18);
  const focalMax = toInt(data.multiGridFocalMaxMm, 100);
  const beforeSec = toInt(data.frameBeforeSec, 5);
  const afterSec = toInt(data.frameAfterSec, 3);
  const storyDirection = ((data.storyDirection as string | undefined) ?? '').trim();
  const aspectRatio = ((data.aspectRatio as string | undefined) ?? '16:9').trim();
  const strength = (() => {
    const n = Number(data.imageStrength);
    return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.85;
  })();
  const negativePrompt = ((data.negativePrompt as string | undefined) ?? '').trim();
  /** 逐格出图并发（缺省 2，范围 1–4）；与执行器共用同一解析口径，避免面板与执行漂移 */
  const cellConcurrency = resolveCellGenConcurrency(data);
  const status = (data.status as string | undefined) ?? 'idle';
  const model = (data.model as string | undefined) || 'gemini-2.5-flash-image';
  const effectiveModel = (data.effectiveModel as string | undefined) || model;

  const {
    options: pictureModelOptions,
    hasConnections: hasPictureConnections,
    selectModel: selectPictureModel,
    openConnectionsSettings,
  } = useConnectedPictureModels(model);

  const patch = useCallback(
    (next: Record<string, unknown>) => updateNodeData(blockId, next),
    [blockId, updateNodeData],
  );

  /** 按当前参数实时预览的计划（不写节点，避免参数改动即脏写） */
  const builtPlan = useMemo<MultiGridPlan | undefined>(() => {
    if (!sourceUrl) return undefined;
    try {
      return buildMultiGridPlanForMode(mode, sourceUrl, {
        rows: mode === 'multi-cam-9' || mode === 'multi-cam-25' ? rows : undefined,
        cols: mode === 'multi-cam-9' || mode === 'multi-cam-25' ? cols : undefined,
        focalRange: [focalMin, focalMax],
        aspectRatio,
        direction: storyDirection || undefined,
        beforeSec,
        afterSec,
      });
    } catch {
      return undefined;
    }
  }, [
    aspectRatio,
    beforeSec,
    afterSec,
    cols,
    focalMax,
    focalMin,
    mode,
    rows,
    sourceUrl,
    storyDirection,
  ]);

  const storedPlan = data.multiGridPlan as MultiGridPlan | undefined;

  /** 编辑稿仅在模式 / 源图 / 角色标签仍一致时生效，否则回到按参数实时计划 */
  const plan = useMemo<MultiGridPlan | undefined>(() => {
    if (!builtPlan) return undefined;
    const storedCells = Array.isArray(data.multiGridCells)
      ? (data.multiGridCells as MultiGridCell[])
      : undefined;
    if (!storedCells?.length || !storedPlan) return builtPlan;
    if (storedPlan.mode !== builtPlan.mode || storedPlan.sourceUrl !== builtPlan.sourceUrl) {
      return builtPlan;
    }
    if (storedCells.length !== builtPlan.cells.length) return builtPlan;
    if (!builtPlan.cells.every((c, i) => storedCells[i]?.role === c.role)) return builtPlan;
    return { ...builtPlan, cells: storedCells };
  }, [builtPlan, data.multiGridCells, storedPlan]);

  /** 每格出图（未出图 / 复用源图） */
  const cellImageUrl = useCallback(
    (index: number): string => {
      const cells = Array.isArray(data.gridCells)
        ? (data.gridCells as { index?: number; cellImageUrl?: string }[])
        : [];
      const hit = cells.find((c, i) => (typeof c.index === 'number' ? c.index : i) === index);
      return (hit?.cellImageUrl ?? '').trim();
    },
    [data.gridCells],
  );

  const pickedIndex = Number.isInteger(Number(data.sendToVideoIndex))
    ? Number(data.sendToVideoIndex)
    : -1;
  const batchProgress = data.batchProgress as { done?: number; total?: number } | undefined;

  const { hasUpstream, shots, shotIds } = useUpstreamShots(blockId);
  const [busy, setBusy] = useState<string | null>(null);

  /* ── 按 BGM 真实节拍分配各格时长（会话内推演参考，不写节点字段） ── */
  const [beatUrl, setBeatUrl] = useState('');
  const [beatGrid, setBeatGrid] = useState<BeatGrid | null>(null);
  const [beatBusy, setBeatBusy] = useState(false);
  const [beatNote, setBeatNote] = useState<string | null>(null);
  const [cellPlan, setCellPlan] = useState<CellDurationPlan | null>(null);

  const handleAnalyzeBeats = useCallback(async () => {
    const url = (beatUrl.trim() || audioCandidates[0] || '').trim();
    if (!url) {
      setBeatGrid(null);
      setCellPlan(null);
      setBeatNote('请先选择或输入 BGM 音频地址（上游音频 / 配乐 / 音效，或素材库地址）');
      return;
    }
    setBeatUrl(url);
    setBeatBusy(true);
    setBeatNote(null);
    try {
      const next = await analyzeAudioBeats(url);
      setBeatGrid(next);
      setCellPlan(null);
      setBeatNote(
        next.ok
          ? `节拍分析完成${next.cached ? '（缓存）' : ''}：${next.tempo ? `约 ${next.tempo} BPM · ` : ''}` +
            `${next.beats.length} 个节拍点`
          : `节拍分析失败：${next.message ?? '未检测到节拍（禁止空成功）'}`,
      );
    } finally {
      setBeatBusy(false);
    }
  }, [audioCandidates, beatUrl]);

  /**
   * 按真实节拍给各格分时长：格与格之间的切点落在音乐拍点上。
   * 节拍不可用时按 MULTI_GRID_CLIP_SEC 兜底并把 ok=false、原因如实显示（不谎称按节拍算的）。
   */
  const handleAssignCellDurations = useCallback(() => {
    if (!plan) {
      setBeatNote('先连接源图生成推演计划，再按节拍分配各格时长');
      return;
    }
    const res = planCellDurationsFromBeats(plan.cells.length, beatGrid, {
      fallbackSec: MULTI_GRID_CLIP_SEC,
    });
    setCellPlan(res);
    setBeatNote(
      res.ok
        ? `已按节拍分配 ${res.cellCount} 格时长 · 共 ${res.totalSec}s（切点落在真实拍点上）`
        : res.messageZh ?? '按节拍分配失败',
    );
    appendLog(
      res.ok
        ? `多格推演 · 按 BGM 节拍分配各格时长：${res.durations
            .map((d, i) => `${i + 1}格${d}s`)
            .join(' / ')}（共 ${res.totalSec}s · 会话内参考，未写入节点字段）`
        : `多格推演 · 按 BGM 节拍分配失败：${res.messageZh ?? '未知原因'}`,
    );
  }, [appendLog, beatGrid, plan]);

  /** 逐格状态（待跑 / 出图中 / 成功 / 失败 / 后台待续查）与进度：唯一来源是节点 data，不另存状态。 */
  const cellUrls = useMemo(() => readMultiGridCellUrls(data), [data]);
  const cellStates = useMemo(() => readMultiGridCellRunStates(data), [data]);
  const progress = useMemo(() => summarizeMultiGridProgress(cellStates), [cellStates]);
  const pendingTasks = useMemo(() => readMultiGridPendingTasks(data), [data]);
  const stateByIndex = useMemo(
    () => new Map<number, MultiGridCellRunState>(cellStates.map((s) => [s.index, s])),
    [cellStates],
  );
  const shotTargets = (data.multiGridShotTargets as Record<string, string> | undefined) ?? {};
  const contactSheetUrl = ((data.contactSheetUrl as string | undefined) ?? '').trim();
  const contactSheetSignature = ((data.contactSheetSignature as string | undefined) ?? '').trim();
  const planRoles = useMemo(() => (plan?.cells ?? []).map((c) => c.role), [plan]);
  /** 逐格图变了 → 已有接触表标记「已过期」（与分镜故事板大图同口径） */
  const contactSheetStale = Boolean(
    contactSheetUrl
      && contactSheetSignature
      && contactSheetSignature !== buildMultiGridContactSheetSignature(cellUrls, planRoles),
  );
  const retryIndexes = useMemo(() => selectMultiGridRetryIndexes(cellStates), [cellStates]);

  /**
   * 接触表标题的计数口径：**分母 = 计划格数**（未跑过时是 9 而不是 0），
   * 分子 = 计划格里**真的出图**的格数（失败 / 待跑的格没有图，不算进分子）。
   * 不用 `summarizeMultiGridProgress` 的 total：那个分母是「已跑过的格」，
   * 未出图时会退化成 0/0，读起来像「没有格要出图」。
   */
  const plannedCellCount = plan?.cells.length ?? 0;
  const plannedWithImageCount = useMemo(() => {
    if (!plan) return 0;
    let count = 0;
    for (let i = 0; i < plan.cells.length; i += 1) {
      if (cellImageUrl(i).trim()) count += 1;
    }
    return count;
  }, [cellImageUrl, plan]);

  /** 各格节拍时长（仅当格数一致时展示，避免错位到别的格） */
  const cellDurations = useMemo(
    () =>
      cellPlan && plan && cellPlan.cellCount === plan.cells.length
        ? cellPlan.durations
        : EMPTY_DURATIONS,
    [cellPlan, plan],
  );

  /* ── 跨格一致性校验（会话内状态：报告在 ConsistencyCheckSection 内部，不写节点 data） ── */

  /** 「跳到该格」的聚焦格序号（仅用于滚动 + 高亮） */
  const [consistencyFocus, setConsistencyFocus] = useState<number | null>(null);

  const handleJumpToCell = useCallback(
    (index: number) => {
      setConsistencyFocus(index);
      document
        .getElementById(multiGridCellDomId(blockId, index))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    [blockId],
  );

  /** 校验目标格：全部计划格（未出图的格 url 为空串，校验时会被跳过并如实计入「未纳入校验」） */
  const consistencyTargets = useMemo<ConsistencyTarget[]>(
    () => (plan?.cells ?? []).map((cell, i) => ({ index: i, label: cell.role, url: cellImageUrl(i) })),
    [cellImageUrl, plan],
  );

  const handleSelectMode = useCallback(
    (next: MultiGridMode) => {
      const def = lookupMultiGridModeDef(next);
      patch({
        multiGridMode: next,
        multiGridPlan: undefined,
        multiGridCells: undefined,
        sendToVideoIndex: undefined,
        multiGridRows: def.rows,
        multiGridCols: def.cols,
        // 模式变了 → 格语义变了，逐格目标镜映射一并作废
        multiGridShotTargets: undefined,
      });
    },
    [patch],
  );

  const handlePatchCell = useCallback(
    (index: number, value: string) => {
      if (!plan) return;
      const cells: MultiGridCell[] = plan.cells.map((cell, i) =>
        i === index
          ? { ...cell, imagePromptZh: value, imagePrompt: value, promptEdited: true }
          : cell,
      );
      patch({ multiGridPlan: { ...plan, cells }, multiGridCells: cells });
    },
    [patch, plan],
  );

  const handleResetPrompts = useCallback(() => {
    patch({ multiGridPlan: undefined, multiGridCells: undefined });
    appendLog('多格推演 · 已恢复默认提示词');
  }, [appendLog, patch]);

  const handleRun = useCallback(async () => {
    if (!runtime) return;
    if (!sourceUrl) {
      toastError('多格推演缺少源图：请连接上游图像，或在面板指定源图（禁止空成功）');
      return;
    }
    const controller = beginBlockRunAbort(blockId);
    runAbortRef.current = controller;
    patch({
      status: 'running',
      multiGridMode: mode,
      multiGridPlan: plan,
      multiGridCells: plan?.cells,
    });
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
      const last = runtime.getNodes().find((n) => n.id === blockId)?.data as
        | { lastResult?: { count?: number; total?: number; failures?: unknown[] } }
        | undefined;
      if (controller.signal.aborted) {
        appendLog('多格推演 · 已停止');
        return;
      }
      const failures = last?.lastResult?.failures?.length ?? 0;
      appendLog(
        `多格推演 · ${modeDef.label} 出图 ${last?.lastResult?.count ?? 0}/${last?.lastResult?.total ?? modeDef.cellCount}` +
          (failures > 0 ? `（${failures} 格失败）` : ''),
      );
    } catch (e) {
      if (controller.signal.aborted) appendLog('多格推演 · 已停止');
      else {
        patch({ status: 'error', error: String(e) });
        toastError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      endBlockRunAbort(blockId, controller);
      if (runAbortRef.current === controller) runAbortRef.current = null;
    }
  }, [
    appendLog,
    blockId,
    edges,
    mode,
    modeDef.cellCount,
    modeDef.label,
    nodes,
    patch,
    plan,
    runtime,
    sourceUrl,
  ]);

  const handleStop = useCallback(() => {
    const had = abortBlockRun(blockId) || Boolean(runAbortRef.current);
    runAbortRef.current = null;
    patch({ status: 'idle', error: undefined, message: undefined, batchProgress: undefined });
    appendLog(had ? '多格推演 · 已停止' : '多格推演 · 已收回空闲');
  }, [appendLog, blockId, patch]);

  const handleSendToVideo = useCallback(
    (index: number) => {
      if (!plan) return;
      const cell = plan.cells[index];
      if (!cell) return;
      const url = cellImageUrl(index) || (cell.reuseSourceImage ? sourceUrl : '');
      if (!url) {
        toastError('该格还没有出图：请先批量出图，再送入视频生成');
        return;
      }
      patch({ sendToVideoIndex: index });
      const clipTarget = edges.find(
        (e) => e.source === blockId && nodes.find((n) => n.id === e.target)?.type === 'clip-gen',
      );
      if (clipTarget) {
        appendLog(`多格推演 · 已把「${cell.role}」作为下游视频生成首帧与提示词`);
        toastSuccess(`「${cell.role}」已送入视频生成`);
      } else {
        appendLog(`多格推演 · 已选定「${cell.role}」为首帧；下游未连接视频生成`);
        toastError('已选定该格为下游首帧，但当前未连接「视频生成」节点');
      }
    },
    [appendLog, blockId, cellImageUrl, edges, nodes, patch, plan, sourceUrl],
  );

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  /* ────────────── 生产闭环：重试 / 续查 / 写入分镜 / 入库 / 接触表 ────────────── */

  /** 逐格重试（indexes 缺省 = 全部非成功格）：成功格不重打，复用首轮模型与源图口径 */
  const handleRetryCells = useCallback(
    async (indexes?: number[]) => {
      if (!runtime) return;
      const controller = beginBlockRunAbort(blockId);
      runAbortRef.current = controller;
      setBusy(indexes?.length === 1 ? `cell-${indexes[0]}` : 'retry');
      patch({ status: 'running', error: undefined });
      try {
        const res = await runMultiGridCellRetry({
          blockId,
          data,
          indexes,
          sourceUrl,
          signal: controller.signal,
          updateNodeData: (id, next) => runtime.updateNodeData(id, next),
        });
        if (controller.signal.aborted) {
          appendLog('多格推演 · 已停止重跑');
          return;
        }
        if (res.failures.length === 0) {
          if (!res.ok) {
            toastError(res.reason ?? '没有需要重跑的格');
            appendLog(`多格推演 · 未重跑：${res.reason ?? '没有需要重跑的格'}`);
            return;
          }
          appendLog(`多格推演 · 重跑完成，现有 ${res.urls.length} 格有图`);
          toastSuccess(`重跑完成 · ${res.urls.length} 格有图`);
          return;
        }
        const failNote = `${res.failures.length} 格仍失败`;
        appendLog(`多格推演 · 重跑完成，现有 ${res.urls.length} 格有图（${failNote}）`);
        toastError(`重跑完成：${failNote}，可查看逐格原因后再试`);
      } catch (e) {
        if (controller.signal.aborted) appendLog('多格推演 · 已停止重跑');
        else toastError(e instanceof Error ? e.message : String(e));
      } finally {
        endBlockRunAbort(blockId, controller);
        if (runAbortRef.current === controller) runAbortRef.current = null;
        setBusy(null);
      }
    },
    [appendLog, blockId, data, patch, runtime, sourceUrl],
  );

  /** 续查未完成格：复用 resumePendingImageTasks，按 taskId → 格号补图 */
  const handleResumePending = useCallback(async () => {
    if (!runtime) return;
    if (pendingTasks.length === 0) {
      toastError('没有待续查的后台任务');
      return;
    }
    const controller = beginBlockRunAbort(blockId);
    runAbortRef.current = controller;
    setBusy('resume');
    try {
      const res = await resumeMultiGridPendingCells({
        blockId,
        data,
        sourceUrl,
        signal: controller.signal,
        updateNodeData: (id, next) => runtime.updateNodeData(id, next),
      });
      if (controller.signal.aborted) {
        appendLog('多格推演 · 已停止续查');
        return;
      }
      if (res.fetched.length > 0) {
        appendLog(`多格推演 · 续查取回 ${res.fetched.length} 格后台图`);
        toastSuccess(`已取回 ${res.fetched.length} 格后台图`);
      } else if (res.stillPending.length > 0) {
        appendLog(`多格推演 · ${res.stillPending.length} 格任务仍在后台，请稍后再查`);
      } else {
        toastError('后台图片任务已失败或过期');
      }
    } catch (e) {
      if (controller.signal.aborted) appendLog('多格推演 · 已停止续查');
      else toastError(e instanceof Error ? e.message : String(e));
    } finally {
      endBlockRunAbort(blockId, controller);
      if (runAbortRef.current === controller) runAbortRef.current = null;
      setBusy(null);
    }
  }, [appendLog, blockId, data, pendingTasks.length, runtime, sourceUrl]);

  /** 写入分镜：复用 writePictureShotPatch（首帧 + 审阅态），逐格或整组 */
  const handleWriteToShots = useCallback(
    (indexes?: number[], spread = false) => {
      const wb = buildMultiGridWriteBackPlan({
        cellIndexes: indexes,
        cellUrls,
        shotIds,
        overrides: shotTargets,
        spread,
      });
      if (!wb.ok) {
        toastError(wb.reason);
        appendLog(`多格推演 · 未写入分镜：${wb.reason}`);
        return;
      }
      let ok = 0;
      let failed = 0;
      for (const target of wb.targets) {
        const url = (cellUrls[target.cellIndex] ?? '').trim();
        if (!url) continue;
        const written = writePictureShotPatch({
          blockId,
          shotId: target.shotId,
          patch: buildMultiGridShotPatch(url),
          updateNodeData: (id, next) => updateNodeData(id, next),
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type,
            data: (n.data ?? {}) as Record<string, unknown>,
          })),
          edges,
        });
        if (written) ok += 1;
        else failed += 1;
      }
      const skippedNote = wb.skipped.length
        ? `，${wb.skipped.length} 格未写（${wb.skipped[0]!.reason}）`
        : '';
      if (ok > 0) {
        appendLog(`多格推演 · 已写入 ${ok} 格首帧到上游镜表${skippedNote}`);
        toastSuccess(`已写入 ${ok} 格首帧到分镜镜表${skippedNote}`);
      }
      if (failed > 0) {
        toastError(`${failed} 格未找到上游镜表对应镜头，已跳过（不静默失败）`);
        appendLog(`多格推演 · ${failed} 格回写失败：上游镜表未命中`);
      }
    },
    [appendLog, blockId, cellUrls, edges, nodes, shotIds, shotTargets, updateNodeData],
  );

  const handleSetShotTarget = useCallback(
    (index: number, shotId: string) => {
      patch({ multiGridShotTargets: { ...shotTargets, [String(index)]: shotId } });
    },
    [patch, shotTargets],
  );

  /* ────────────── 镜头层面：多格推演 → 生成分镜镜头（增量） ────────────── */

  /** 上游链镜表节点：与 useUpstreamShots 同一套「连入 storyboard-desk」解析口径 */
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
  const writebackState = data.multiGridShotWriteback as MultiGridShotWritebackState | undefined;

  /**
   * 本批将生成的镜头清单（纯函数预演，不落库）：
   * 序号接着上游该集续号、分集继承链镜表当前分集、格图已备时顺带带上首帧；
   * 节拍时长（若已按 BGM 真实节拍分配）优先作为各镜时长。
   */
  const shotPlan = useMemo<MultiGridShotPlanResult | undefined>(() => {
    if (!plan) return undefined;
    return planMultiGridShots(plan, {
      upstreamShots: shots,
      episodeId: upstreamChain?.activeEpisodeId ?? null,
      cellImageUrls: cellUrls,
      ...(cellPlan?.ok && cellDurations.length === plan.cells.length
        ? { cellDurationsSec: cellDurations }
        : {}),
    });
  }, [cellDurations, cellPlan?.ok, cellUrls, plan, shots, upstreamChain?.activeEpisodeId]);

  const shotPlanRows = useMemo(
    () => (shotPlan ? buildMultiGridShotPreviewRows(shotPlan.shots) : []),
    [shotPlan],
  );

  /** 同键 = 同一计划 + 同一批镜头；已写入过就不再重复追加 */
  const shotPlanWritten = Boolean(shotPlan?.key && writebackState?.key === shotPlan.key);
  const shotPlanBlockedReason = !plan
    ? '先连接源图生成推演计划，再生成分镜镜头'
    : !shotPlan?.ok
      ? shotPlan?.warnings[0]?.messageZh ?? '没有可生成的镜头'
      : !hasUpstream || shotIds.length === 0
        ? MULTI_GRID_NO_UPSTREAM_REASON
        : !upstreamDeskId
          ? '未找到上游分镜台节点（storyboard-desk）：无法写回镜表'
          : shotPlanWritten
            ? '本批镜头已写入过（同一计划 + 同一批镜头 id）：未重复追加'
            : '';

  /** 定位并打开上游分镜台工作台（写回后核对新镜） */
  const handleOpenUpstreamDesk = useCallback(() => {
    if (!upstreamDeskId) {
      toastError(MULTI_GRID_NO_UPSTREAM_REASON);
      return;
    }
    runtime?.focusBlock(upstreamDeskId);
    runtime?.updateNodeData(upstreamDeskId, { openDeskAt: Date.now() });
    appendLog('多格推演 · 已定位到上游分镜台：可在工作台核对本批新镜');
  }, [appendLog, runtime, upstreamDeskId]);

  /**
   * 生成分镜镜头并写回上游链镜表：
   * ① 分镜台拆镜结构插入新镜 → `applyDeskBreakdown` 重算链镜表（分镜台可编辑、重拆不丢）；
   * ② 链镜表兜底合并：补齐未落链的新镜，并按新镜 id 补首帧（拆镜结构没有首帧字段）；
   * ③ 全局镜表镜像 `addShots('append')`；④ 记录防重键。
   * 无上游链镜表 / 无分镜台节点 / 同批重复 → 明确中文提示，不静默失败、不写到别处。
   */
  const handleGenerateShots = useCallback(async () => {
    if (!plan) {
      toastError('先连接源图生成推演计划，再生成分镜镜头');
      return;
    }
    if (!shotPlan?.ok) {
      toastError(shotPlan?.warnings[0]?.messageZh ?? '没有可生成的镜头（不静默成功）');
      return;
    }
    if (!hasUpstream || shotIds.length === 0) {
      toastError(MULTI_GRID_NO_UPSTREAM_REASON);
      appendLog(`多格推演 · 未生成镜头：${MULTI_GRID_NO_UPSTREAM_REASON}`);
      return;
    }
    if (!upstreamDeskId) {
      toastError('未找到上游分镜台节点（storyboard-desk）：无法写回镜表');
      appendLog('多格推演 · 未生成镜头：连入链未解析到 storyboard-desk 节点');
      return;
    }
    if (shotPlanWritten) {
      const msg = `本批镜头已写入过（同一计划 + 同一批镜头 id）：未重复追加；如需重写请先修改推演计划或逐格提示词。`;
      toastError(msg);
      appendLog(`多格推演 · 未重复写入：${msg}`);
      return;
    }

    /** 第二层防重：链镜表 / 全局镜表里已有同 id 的镜一律不重复追加 */
    const existingIds = new Set<string>([
      ...(upstreamChain?.shots ?? []).map((shot) => shot.id),
      ...useWorkspaceDocument.getState().storyboard.shots.map((shot) => shot.id),
    ]);
    const fresh = shotPlan.shots.filter((shot) => !existingIds.has(shot.id));
    if (fresh.length === 0) {
      toastError('这批镜头已存在于镜表中（同 id）：未重复写入');
      appendLog('多格推演 · 未重复写入：镜表中已存在同 id 镜头');
      return;
    }

    const warningNote = shotPlan.warnings.length
      ? `\n注意：${shotPlan.warnings.map((w) => w.messageZh).join(' ')}`
      : '';
    const ok = await askConfirm({
      title: `生成 ${fresh.length} 个分镜镜头并写回镜表？`,
      description: `${shotPlan.summaryZh}${warningNote}`,
      confirmLabel: '生成并写回',
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
          `多格推演 · 分镜台拆镜结构未插入（${insert.reasonZh}）：本次只写链镜表与全局镜表`,
        );
      }

      /** 需要带首帧的镜（拆镜结构无首帧字段，链镜表在本步补齐） */
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
        const shots = [...chain.shots, ...appended].map((shot) => {
          const frame = frameById.get(shot.id);
          return frame ? { ...shot, ...buildMultiGridShotPatch(frame) } : shot;
        });
        return { chainStoryboard: buildChainStoryboardPayload(chain, { shots }) };
      });

      useWorkspaceDocument.getState().addShots(fresh, 'append');
      patch({
        multiGridShotWriteback: {
          key: shotPlan.key,
          ids: fresh.map((shot) => shot.id),
          count: fresh.length,
          deskId: upstreamDeskId,
          at: new Date().toISOString(),
        } satisfies MultiGridShotWritebackState,
      });

      const head = fresh[0]!;
      const tail = fresh[fresh.length - 1]!;
      appendLog(
        `多格推演 · 已生成 ${fresh.length} 个分镜镜头并写回链镜表（序号 ${head.index}–${tail.index}` +
          `${frameById.size > 0 ? ` · ${frameById.size} 镜带首帧` : ''}` +
          `${insert.ok ? '' : ` · 拆镜结构未插入：${insert.reasonZh}`}）`,
      );
      toastSuccess(`已生成 ${fresh.length} 个镜头并写回分镜台，可点「去分镜台查看」核对`);
    } finally {
      setBusy(null);
    }
  }, [
    appendLog,
    hasUpstream,
    plan,
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

  /** 单格入库：复用图像工作区的入库口径（去重 label + 场景条目 + 封面/参考图） */
  const handleSaveCellToLibrary = useCallback(
    (index: number) => {
      const url = (cellUrls[index] ?? '').trim();
      const cell = plan?.cells[index];
      if (!url || !cell) {
        toastError('该格还没有出图：请先出图，再入库');
        return;
      }
      const doc = useWorkspaceDocument.getState();
      const label = uniqueLibraryLabel(
        buildMultiGridAssetLabelBase({
          modeLabel: modeDef.label,
          role: cell.role,
          prompt: cell.imagePromptZh,
        }),
        doc.backlotWorkspace.items.map((item) => item.label),
      );
      doc.upsertBacklotWorkspace(
        buildMultiGridAssetEntry({ url, label, prompt: cell.imagePromptZh }),
      );
      appendLog(`多格推演 · 已把「${cell.role}」入库为场景「${label}」`);
      toastSuccess(`已入库为场景「${label}」，可在素材库中完善设定`);
    },
    [appendLog, cellUrls, modeDef.label, plan],
  );

  /** 单格软删：进资产回收站并清掉该格结果（成功格不受影响） */
  const handleTrashCell = useCallback(
    (index: number) => {
      const url = (cellUrls[index] ?? '').trim();
      const cell = plan?.cells[index];
      if (!url) {
        toastError('该格还没有出图');
        return;
      }
      useWorkspaceDocument.getState().trashGeneratedMedia({
        url,
        mediaKind: 'picture',
        label: `多格推演 ${cell?.role ?? `第 ${index + 1} 格`}`,
        sourceBlockId: blockId,
      });
      const dropped = runtime
        ? dropMultiGridCell({
            blockId,
            data,
            index,
            sourceUrl,
            updateNodeData: (id, next) => runtime.updateNodeData(id, next),
          })
        : false;
      if (!dropped && runtime) {
        // 计划无法重建时至少把该格从结果里摘掉，避免「已进回收站但画面还在」
        const nextUrls = applyCellUrls(cellUrls, [{ cellIndex: index, url: undefined }], cellUrls.length);
        const filled = compactCellUrls(nextUrls);
        runtime.updateNodeData(blockId, {
          gridCells: (Array.isArray(data.gridCells) ? (data.gridCells as GridCellLike[]) : []).map(
            (c, i) => ({
              ...c,
              cellImageUrl: nextUrls[typeof c.index === 'number' ? c.index : i] ?? '',
            }),
          ),
          splitUrls: filled,
          pictures: filled,
          previewUrls: filled,
          previewUrl: filled[0],
          imageCount: filled.length,
        });
      }
      appendLog(`多格推演 · 「${cell?.role ?? `第 ${index + 1} 格`}」已移入资产回收站`);
      toastSuccess('已移入资产回收站');
    },
    [appendLog, blockId, cellUrls, data, plan, runtime, sourceUrl],
  );

  /** 接触表：逐格图拼一张（复用服务端宫格拼合），缺图格用源图占位并如实播报 */
  const handleExportContactSheet = useCallback(async () => {
    if (!plan) return;
    const sheet = buildContactSheetCells({
      cells: plan.cells.map((c) => ({ cellIndex: c.cellIndex, role: c.role })),
      urls: cellUrls,
      sourceUrl,
    });
    if (sheet.imageUrls.every((u) => !u.trim())) {
      toastError('还没有任何可用图：请先出图，再导出接触表');
      return;
    }
    const layout = computeContactSheetGridLayout({
      rows: plan.rows,
      cols: plan.cols,
      cellCount: plan.cells.length,
    });
    setBusy('sheet');
    try {
      const res = await api.gridCompose({
        imageUrls: sheet.imageUrls,
        rows: layout.rows,
        cols: layout.cols,
        labels: sheet.labels,
      });
      if (!res.ok || !res.url) throw new Error('接触表合成失败，禁止空成功');
      patch({
        contactSheetUrl: res.url,
        contactSheetSignature: buildMultiGridContactSheetSignature(cellUrls, planRoles),
        contactSheetAt: new Date().toISOString(),
      });
      const placeholderNote = sheet.placeholderIndexes.length
        ? `，${sheet.placeholderIndexes.length} 格未出图已用源图占位`
        : '';
      appendLog(
        `多格推演 · 接触表已导出（${layout.cols}×${layout.rows} · ${sheet.imageUrls.length} 格 · ${layout.canvasW}×${layout.canvasH}${placeholderNote}）`,
      );
      toastSuccess(`接触表已生成${placeholderNote}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendLog(`多格推演 · 接触表导出失败：${msg}`);
      toastError(msg);
    } finally {
      setBusy(null);
    }
  }, [appendLog, cellUrls, patch, plan, planRoles, sourceUrl]);

  const handleDownloadContactSheet = useCallback(() => {
    if (!contactSheetUrl) return;
    const a = document.createElement('a');
    a.href = contactSheetUrl;
    a.download = buildContactSheetFileName(contactSheetUrl);
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
  }, [contactSheetUrl]);

  const handleSaveContactSheetToLibrary = useCallback(() => {
    if (!contactSheetUrl) {
      toastError('还没有接触表：请先导出');
      return;
    }
    const doc = useWorkspaceDocument.getState();
    const label = uniqueLibraryLabel(
      `${modeDef.label} 接触表`,
      doc.backlotWorkspace.items.map((item) => item.label),
    );
    doc.upsertBacklotWorkspace(
      buildMultiGridAssetEntry({
        url: contactSheetUrl,
        label,
        prompt: `${modeDef.label} · ${plan?.rows ?? ''}×${plan?.cols ?? ''} 接触表`,
      }),
    );
    appendLog(`多格推演 · 接触表已入库为场景「${label}」`);
    toastSuccess(`接触表已入库为场景「${label}」`);
  }, [appendLog, contactSheetUrl, modeDef.label, plan]);

  const handleTrashContactSheet = useCallback(() => {
    if (!contactSheetUrl) return;
    useWorkspaceDocument.getState().trashGeneratedMedia({
      url: contactSheetUrl,
      mediaKind: 'picture',
      label: `${modeDef.label} 接触表`,
      sourceBlockId: blockId,
    });
    patch({ contactSheetUrl: undefined, contactSheetSignature: undefined, contactSheetAt: undefined });
    appendLog('多格推演 · 接触表已移入资产回收站');
    toastSuccess('接触表已移入资产回收站');
  }, [appendLog, blockId, contactSheetUrl, modeDef.label, patch]);

  const gridStyle = plan
    ? { gridTemplateColumns: `repeat(${plan.cols}, minmax(0, 1fr))` }
    : undefined;
  const running = status === 'running';
  const modalChips = pictureModelOptions.length > 0
    ? pictureModelOptions
    : [{ id: model, label: '未配置图片连接 · 点此去设置' }];

  const toolbarLeft = (
    <div className="flex items-center gap-1 flex-wrap min-w-0" onMouseDown={stop}>
      {MULTI_GRID_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onMouseDown={stop}
          onClick={() => handleSelectMode(m.id)}
          title={m.hint}
          className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
            mode === m.id
              ? 'border-brand/40 bg-brand/10 text-brand'
              : 'border-line/40 text-ink/55 hover:text-ink'
          }`}
        >
          {m.label}
        </button>
      ))}
      <span className="w-px h-3.5 bg-line/50" />
      <button
        type="button"
        onMouseDown={stop}
        onClick={handleResetPrompts}
        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md text-ink/55 hover:text-ink hover:bg-surface/90"
        title="丢弃逐格提示词改写，回到按当前参数生成的默认计划"
      >
        <RotateCcw size={11} />
        恢复默认提示词
      </button>
    </div>
  );

  const toolbarAdvanced = (
    <div className="space-y-2.5" onMouseDown={stop}>
      <div className="rounded-lg bg-surface/60 px-2 py-1.5 text-[10px] text-ink/50 leading-relaxed">
        {modeDef.label} · {plan ? `${plan.rows}×${plan.cols} · ${plan.cells.length} 格` : '待源图'} ·
        模型 {effectiveModel}
        {plan ? ` · ${aspectRatio}` : ''}
      </div>

      {(mode === 'multi-cam-9' || mode === 'multi-cam-25') && (
        <>
          <div className="space-y-1">
            <span className="text-[10px] text-ink/45">宫格规格</span>
            <div className="flex gap-1">
              {[3, 5].map((side) => (
                <button
                  key={side}
                  type="button"
                  onMouseDown={stop}
                  onClick={() =>
                    patch({
                      multiGridRows: side,
                      multiGridCols: side,
                      multiGridMode: side === 5 ? 'multi-cam-25' : 'multi-cam-9',
                      multiGridPlan: undefined,
                      multiGridCells: undefined,
                      multiGridShotTargets: undefined,
                    })
                  }
                  className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
                    rows === side
                      ? 'border-brand/40 bg-brand/10 text-brand'
                      : 'border-line/40 text-ink/50 hover:text-ink'
                  }`}
                >
                  {side}×{side}（{side * side} 格）
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-ink/50">
              焦段
              <input
                type="number"
                min={8}
                max={300}
                value={focalMin}
                onChange={(e) => patch({ multiGridFocalMinMm: Number(e.target.value) || 18 })}
                className="w-14 rounded-lg border border-line/50 px-1.5 py-1 text-[11px] bg-surface"
              />
              –
              <input
                type="number"
                min={8}
                max={300}
                value={focalMax}
                onChange={(e) => patch({ multiGridFocalMaxMm: Number(e.target.value) || 100 })}
                className="w-14 rounded-lg border border-line/50 px-1.5 py-1 text-[11px] bg-surface"
              />
              mm
            </label>
          </div>
        </>
      )}

      {mode === 'story-predict-4' && (
        <label className="block space-y-1">
          <span className="text-[10px] text-ink/45">剧情方向（写入四格节拍，可留空）</span>
          <textarea
            value={storyDirection}
            onChange={(e) => patch({ storyDirection: e.target.value })}
            rows={3}
            placeholder="例：雨夜追逐，男主发现线索指向旧友"
            className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] resize-none bg-surface"
          />
        </label>
      )}

      {mode === 'frame-predict' && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-[10px] text-ink/50">
            前置
            <input
              type="number"
              min={1}
              max={120}
              value={beforeSec}
              onChange={(e) => patch({ frameBeforeSec: Number(e.target.value) || 5 })}
              className="w-14 rounded-lg border border-line/50 px-1.5 py-1 text-[11px] bg-surface"
            />
            秒
          </label>
          <label className="flex items-center gap-1 text-[10px] text-ink/50">
            后续
            <input
              type="number"
              min={1}
              max={120}
              value={afterSec}
              onChange={(e) => patch({ frameAfterSec: Number(e.target.value) || 3 })}
              className="w-14 rounded-lg border border-line/50 px-1.5 py-1 text-[11px] bg-surface"
            />
            秒
          </label>
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">宽高比</span>
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
          参考强度
          <span className="ml-1 text-[9px] text-ink/35">越高越贴源图主体</span>
        </span>
        <input
          type="number"
          min={0.1}
          max={1}
          step={0.05}
          value={strength}
          onChange={(e) => patch({ imageStrength: Number(e.target.value) || 0.85 })}
          className="w-20 rounded-lg border border-line/50 px-2 py-1 text-[11px] bg-surface"
        />
      </label>

      {/* 逐格出图并发：25 格推演不再串行；执行器按同一口径解析 data.concurrency */}
      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">
          逐格并发
          <span className="ml-1 text-[9px] text-ink/35">同时出图的格数（1 = 串行）</span>
        </span>
        <select
          value={String(cellConcurrency)}
          onChange={(e) => patch({ concurrency: Number(e.target.value) })}
          className="w-20 rounded-lg border border-line/50 px-2 py-1 text-[11px] bg-surface"
          title="逐格出图的有界并发上限（1–4，缺省 2）；本批与逐格重跑都按它执行"
        >
          {CELL_GEN_CONCURRENCY_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n === 1 ? '1（串行）' : n}
            </option>
          ))}
        </select>
      </label>

      {/* 按 BGM 真实节拍分配各格时长（会话内推演参考） */}
      <div className="rounded-lg border border-line/40 px-2 py-1.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink/50 shrink-0">BGM 节拍</span>
          {audioCandidates.length > 0 && (
            <select
              value={audioCandidates.includes(beatUrl) ? beatUrl : ''}
              onChange={(e) => {
                setBeatUrl(e.target.value);
                setBeatGrid(null);
                setCellPlan(null);
                setBeatNote(null);
              }}
              className="max-w-[130px] rounded-lg border border-line/50 px-1.5 py-1 text-[10px] bg-surface"
              title="从上游音频 / 配乐 / 音效里选一条"
            >
              <option value="">上游音频…</option>
              {audioCandidates.map((u) => (
                <option key={u} value={u} title={u}>
                  {shortUrl(u)}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={beatUrl}
            aria-label="BGM 音频地址"
            onMouseDown={stop}
            onChange={(e) => setBeatUrl(e.target.value)}
            placeholder="/media/… 音频地址"
            className="flex-1 min-w-0 rounded-lg border border-line/50 px-1.5 py-1 text-[10px] bg-surface"
          />
          <button
            type="button"
            onMouseDown={stop}
            disabled={beatBusy}
            onClick={() => void handleAnalyzeBeats()}
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[10px] text-ink/65 hover:text-brand hover:border-brand/40 disabled:opacity-40"
            title="调用服务端 POST /api/montage/beat-analyze 听音分析 BGM 节拍；失败会显示真实原因，不伪造节拍"
          >
            {beatBusy ? '分析中…' : '分析节拍'}
          </button>
        </div>

        {beatGrid && (
          <p className={`text-[10px] leading-snug ${beatGrid.ok ? 'text-brand' : 'text-alert'}`}>
            {beatGrid.ok
              ? `${beatGrid.tempo ? `约 ${beatGrid.tempo} BPM` : '未估计出 BPM'} · ${beatGrid.beats.length} 个节拍点`
              : beatGrid.message ?? '节拍分析失败（禁止空成功）'}
          </p>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onMouseDown={stop}
            disabled={!beatGrid?.ok || !plan}
            onClick={handleAssignCellDurations}
            className="rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] text-brand disabled:opacity-40"
            title="按真实节拍给各格分时长（格间切点落在拍点上）；节拍不可用时按 3s 兜底并如实标注"
          >
            按 BGM 节拍分配各格时长
          </button>
          {cellPlan && (
            <button
              type="button"
              onMouseDown={stop}
              onClick={() => {
                setCellPlan(null);
                setBeatNote(null);
              }}
              className="rounded-md border border-line/40 px-2 py-0.5 text-[10px] text-ink/55 hover:text-ink"
            >
              清除时长
            </button>
          )}
          {cellPlan?.ok && (
            <span className="text-[9px] text-ink/45">
              {cellPlan.durations.map((d) => String(d)).join(' / ')}s · 共 {cellPlan.totalSec}s
            </span>
          )}
        </div>

        {beatNote && (
          <p className={`text-[9px] leading-snug ${beatGrid && !beatGrid.ok ? 'text-alert' : 'text-ink/45'}`}>
            {beatNote}
          </p>
        )}
        <p className="text-[9px] text-ink/30 leading-snug">
          各格时长是「会话内」推演参考（不写入节点字段，不新增持久化字段名）；下游视频生成仍按各格视频提示词里的时长执行。
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">追加负面提示词（叠加到每格默认负面项）</span>
        <textarea
          value={negativePrompt}
          onChange={(e) => patch({ negativePrompt: e.target.value })}
          rows={2}
          placeholder="例：戴眼镜、改发型、换背景"
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] resize-none bg-surface"
        />
      </label>
    </div>
  );

  const failureCount = Array.isArray(
    (data.lastResult as { failures?: unknown[] } | undefined)?.failures,
  )
    ? ((data.lastResult as { failures: unknown[] }).failures.length ?? 0)
    : 0;

  const topSlot = (
    <>
      <div className="mx-3 mt-2 flex items-center gap-2" onMouseDown={stop}>
        <span className="text-[10px] text-ink/45 shrink-0">源图</span>
        {sourceUrl ? (
          <img
            src={sourceUrl}
            alt=""
            className="h-12 w-20 rounded-md border border-line/40 object-cover"
            draggable={false}
          />
        ) : (
          <span className="text-[10px] text-ink/40">
            未连接上游图像：请把关键帧 / 图片节点连到本节点左侧，或先在右侧指定源图
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ComposerModelSelect
            value={model}
            options={modalChips}
            onChange={(v) => {
              if (!hasPictureConnections) {
                openConnectionsSettings();
                return;
              }
              void selectPictureModel(v, (id) => patch({ model: id }));
            }}
            width={240}
            tone="desk"
          />
        </div>
      </div>

      {running && (
        <div className="mx-3 mt-1.5 flex items-center gap-2 text-[10px] text-ink/55">
          <Sparkles size={11} className="animate-pulse" />
          出图中 {batchProgress?.done ?? 0}/{batchProgress?.total ?? modeDef.cellCount}
        </div>
      )}

      <div
        className="mx-3 mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-ink/55"
        onMouseDown={stop}
      >
        <span>
          完成 {progress.done}/{progress.total}
        </span>
        {progress.failed > 0 && <span className="text-red-500">· 失败 {progress.failed}</span>}
        {progress.remote > 0 && (
          <span className="text-amber-600">· 后台待续查 {progress.remote}</span>
        )}
        <span className="w-px h-3.5 bg-line/50" />
        <button
          type="button"
          onMouseDown={stop}
          disabled={retryIndexes.length === 0 || busy !== null || running}
          onClick={() => void handleRetryCells()}
          title="只重跑失败 / 待跑的格，已出图的格不会被重打"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-line/40 text-ink/60 hover:text-brand hover:border-brand/40 disabled:opacity-40"
        >
          <RefreshCw size={10} className={busy === 'retry' ? 'animate-spin' : undefined} />
          重试未完成格{retryIndexes.length > 0 ? `（${retryIndexes.length}）` : ''}
        </button>
        <button
          type="button"
          onMouseDown={stop}
          disabled={pendingTasks.length === 0 || busy !== null}
          onClick={() => void handleResumePending()}
          title="取回刷新 / 重挂前提交、仍在后台生成的格"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-line/40 text-ink/60 hover:text-brand hover:border-brand/40 disabled:opacity-40"
        >
          <ImageDown size={10} className={busy === 'resume' ? 'animate-pulse' : undefined} />
          续查未完成格{pendingTasks.length > 0 ? `（${pendingTasks.length}）` : ''}
        </button>
        <button
          type="button"
          onMouseDown={stop}
          disabled={progress.done === 0 || shotIds.length === 0}
          onClick={() => handleWriteToShots(undefined, true)}
          title={
            shotIds.length === 0
              ? '上游未连接分镜台镜表，无法写入'
              : '按「格序 ↔ 镜序」把已出图的格逐格写成对应镜头首帧'
          }
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-line/40 text-ink/60 hover:text-brand hover:border-brand/40 disabled:opacity-40"
        >
          <Clapperboard size={10} />
          整组写入分镜
        </button>
      </div>

      {(data.message as string | undefined)?.trim() ? (
        <div className="mx-3 mt-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[10px] text-amber-800">
          {String(data.message)}
        </div>
      ) : null}

      {failureCount > 0 && !running ? (
        <div className="mx-3 mt-1.5 text-[10px] text-amber-700">
          有 {failureCount} 格出图失败，可单独重跑或调整提示词后再次批量出图。
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
      runDisabled={!sourceUrl}
      runLabel={running ? '推演出图中…' : `${modeDef.label} · 批量出图`}
      showAi={false}
      showHistory={false}
      heightClass="h-auto max-h-[520px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2 overflow-y-auto nowheel overscroll-contain"
    >
      {!plan ? (
        <p className="text-[11px] text-ink/45">
          连接一张关键帧 / 图片后自动生成推演计划；也可在右侧参数区调整模式与规格。
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-ink/45 leading-relaxed">{plan.notesZh}</p>
          <div className="grid gap-2" style={gridStyle}>
            {plan.cells.map((cell, i) => {
              const url = cellImageUrl(i);
              const baseCell = builtPlan?.cells[i];
              const edited = cell.promptEdited === true;
              const isPicked = pickedIndex === i;
              const cellState: MultiGridCellRunState = stateByIndex.get(i) ?? {
                index: i,
                role: cell.role,
                status: 'idle',
                url,
                reuseSourceImage: cell.reuseSourceImage === true,
              };
              const cellBusy = busy === `cell-${i}` || busy === 'retry';
              const targetShotId = shotTargets[String(i)];
              return (
                <div
                  key={`${cell.role}-${i}`}
                  id={multiGridCellDomId(blockId, i)}
                  className={`rounded-lg border p-1.5 space-y-1 ${
                    isPicked ? 'border-brand/50 bg-brand/5' : 'border-line/40 bg-surface/60'
                  }${consistencyFocus === i ? ' ring-1 ring-amber-400/70' : ''}`}
                >
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] font-medium text-ink/70 truncate">
                      {i + 1}. {cell.role}
                    </span>
                    {cell.reuseSourceImage && (
                      <span className="text-[9px] text-ink/40">源图</span>
                    )}
                    {isPicked && <span className="text-[9px] text-brand">下游首帧</span>}
                    {edited && <span className="text-[9px] text-amber-600">已改</span>}
                    <span
                      className={`ml-auto text-[9px] ${CELL_STATUS_CLASS[cellState.status]}`}
                      title={cellState.error ? `失败原因：${cellState.error}` : undefined}
                    >
                      {CELL_STATUS_LABEL[cellState.status]}
                    </span>
                  </div>

                  <div className="relative w-full aspect-video rounded border border-line/30 overflow-hidden bg-surface/80">
                    {url ? (
                      <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[9px] text-ink/35">
                        {cellState.status === 'failed' ? '出图失败' : '待出图'}
                      </div>
                    )}
                  </div>

                  {cellState.error && (
                    <p className="text-[9px] text-red-500 leading-snug line-clamp-2" title={cellState.error}>
                      {cellState.error}
                    </p>
                  )}

                  <div className="text-[9px] text-ink/40 leading-snug">
                    {[
                      cell.cameraAngleLabel,
                      cell.shotSizeLabel,
                      cell.focalLengthMm ? `${cell.focalLengthMm}mm` : '',
                      typeof cell.timeOffsetSec === 'number'
                        ? `${cell.timeOffsetSec > 0 ? '+' : ''}${cell.timeOffsetSec}s`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>

                  {cellDurations[i] !== undefined ? (
                    <p className="text-[9px] text-brand leading-snug">
                      节拍时长 {cellDurations[i]}s
                      {cellPlan?.beatsPerCell[i] ? ` · 占 ${cellPlan.beatsPerCell[i]} 拍` : ''}
                      {cellPlan?.usedFallback ? '（非节拍兜底）' : ''}
                    </p>
                  ) : null}

                  <textarea
                    value={cell.imagePromptZh}
                    onChange={(e) => handlePatchCell(i, e.target.value)}
                    onMouseDown={stop}
                    rows={4}
                    title="编辑后该格按此文本出图（中英同源）"
                    className="w-full rounded border border-line/40 px-1.5 py-1 text-[10px] leading-snug resize-none bg-surface focus:outline-none focus:border-brand/40"
                  />

                  {baseCell && edited && (
                    <details className="text-[9px] text-ink/40">
                      <summary className="cursor-pointer">原始发送稿</summary>
                      <p className="mt-1 whitespace-pre-wrap">{baseCell.imagePrompt}</p>
                    </details>
                  )}
                  {cell.cameraPositionHint && (
                    <p className="text-[9px] text-ink/35 leading-snug">{cell.cameraPositionHint}</p>
                  )}

                  <button
                    type="button"
                    onMouseDown={stop}
                    disabled={!url}
                    onClick={() => handleSendToVideo(i)}
                    className="w-full inline-flex items-center justify-center gap-1 rounded-md border border-line/50 px-1.5 py-0.5 text-[9px] text-ink/65 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                    title={url ? '把该格作为下游视频生成的首帧与该镜提示词' : '该格尚未出图'}
                  >
                    <Film size={10} />
                    送入视频生成
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onMouseDown={stop}
                      disabled={cellBusy || running}
                      onClick={() => void handleRetryCells([i])}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-line/50 px-1.5 py-0.5 text-[9px] text-ink/65 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                      title={
                        cellState.status === 'success'
                          ? '该格已出图，重试不会覆盖成功格'
                          : '只重跑该格；其余格结果保留'
                      }
                    >
                      <RefreshCw size={10} className={cellBusy ? 'animate-spin' : undefined} />
                      重试
                    </button>
                    <button
                      type="button"
                      onMouseDown={stop}
                      disabled={!url}
                      onClick={() => handleSaveCellToLibrary(i)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-line/50 px-1.5 py-0.5 text-[9px] text-ink/65 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                      title={url ? '把该格登记进素材库（场景），可继续完善设定' : '该格尚未出图'}
                    >
                      <FolderPlus size={10} />
                      入库
                    </button>
                    <button
                      type="button"
                      onMouseDown={stop}
                      disabled={!url}
                      onClick={() => handleTrashCell(i)}
                      className="inline-flex items-center justify-center gap-1 rounded-md border border-line/50 px-1.5 py-0.5 text-[9px] text-ink/55 hover:text-red-500 hover:border-red-300 disabled:opacity-40"
                      title={url ? '把该格移入资产回收站（可恢复）' : '该格尚未出图'}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1">
                      <select
                        value={targetShotId ?? ''}
                        onMouseDown={stop}
                        disabled={shotIds.length === 0}
                        onChange={(e) => handleSetShotTarget(i, e.target.value)}
                        className="flex-1 min-w-0 rounded border border-line/40 px-1 py-0.5 text-[9px] bg-surface disabled:opacity-50"
                        title={
                          shotIds.length === 0
                            ? '上游未连接分镜台镜表：请把分镜台 / 导演台连到本节点左侧'
                            : '该格写入的目标镜头（缺省为同序号镜头）'
                        }
                      >
                        {shotIds.length === 0 ? (
                          <option value="">无上游镜表</option>
                        ) : (
                          <>
                            {!(targetShotId && shotIds.includes(targetShotId)) && (
                              <option value="">
                                默认 {describeMultiGridShotTarget(shots[Math.min(i, shots.length - 1)])}
                              </option>
                            )}
                            {shots.map((shot) => (
                              <option key={shot.id} value={shot.id}>
                                {describeMultiGridShotTarget(shot)}
                                {shot.descriptionZh?.trim()
                                  ? ` · ${shot.descriptionZh.trim().slice(0, 10)}`
                                  : ''}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                      <button
                        type="button"
                        onMouseDown={stop}
                        disabled={!url || shotIds.length === 0}
                        onClick={() => handleWriteToShots([i])}
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-line/50 px-1.5 py-0.5 text-[9px] text-ink/65 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                        title={
                          url
                            ? shotIds.length === 0
                              ? '上游未连接分镜台镜表，无法写入'
                              : '把该格写成目标镜头的首帧（审阅态）'
                            : '该格尚未出图'
                        }
                      >
                        <Clapperboard size={10} />
                        写入分镜
                      </button>
                    </div>
                    {!hasUpstream && (
                      <p className="text-[9px] text-amber-600 leading-snug">
                        未连接上游镜表：写入分镜不可用（需先连接分镜台 / 导演台）
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 镜头层面：把推演结果生成分镜镜头并写回链镜表（图层面回写见下方接触表与逐格「写入分镜」） */}
          <div className="rounded-lg border border-line/40 bg-surface/60 p-2 space-y-1.5" onMouseDown={stop}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-medium text-ink/70">生成分镜镜头</span>
              {shotPlan?.ok ? (
                <span className="text-[9px] text-ink/45">
                  {shotPlan.shots.length} 镜 · 序号 {shotPlan.startIndex}–
                  {shotPlan.nextIndex - 1}
                  {shotPlan.targetEpisode.episodeTitle
                    ? ` · ${shotPlan.targetEpisode.episodeTitle}`
                    : shotPlan.targetEpisode.episodeId
                      ? ` · ${shotPlan.targetEpisode.episodeId}`
                      : ' · 未识别分集'}
                </span>
              ) : (
                <span className="text-[9px] text-ink/45">待推演计划</span>
              )}
              {shotPlanWritten && (
                <span className="text-[9px] text-emerald-600">
                  本批已写入{writebackState?.at ? ` · ${writebackState.at.slice(0, 19).replace('T', ' ')}` : ''}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onMouseDown={stop}
                  disabled={!shotPlan?.ok || busy !== null || Boolean(shotPlanBlockedReason)}
                  onClick={() => void handleGenerateShots()}
                  className="inline-flex items-center gap-1 rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-[9px] text-brand disabled:opacity-40"
                  title={
                    shotPlanBlockedReason
                      || '按当前推演计划生成镜头：序号接着上游该集续号，写入链镜表与全局镜表'
                  }
                >
                  <Clapperboard size={10} className={busy === 'shots' ? 'animate-pulse' : undefined} />
                  {busy === 'shots' ? '写入中…' : '生成并写回分镜'}
                </button>
                <button
                  type="button"
                  onMouseDown={stop}
                  disabled={!upstreamDeskId}
                  onClick={handleOpenUpstreamDesk}
                  className="inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[9px] text-ink/70 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                  title={upstreamDeskId ? '定位并打开上游分镜台，核对刚写入的镜头' : '未连接上游分镜台'}
                >
                  去分镜台查看
                </button>
              </div>
            </div>

            {shotPlanBlockedReason && (
              <p className="text-[9px] text-amber-600 leading-snug">{shotPlanBlockedReason}</p>
            )}

            {shotPlan?.ok && (
              <div className="max-h-32 overflow-y-auto rounded border border-line/30 divide-y divide-line/20">
                {shotPlanRows.map((row) => (
                  <div key={`${row.index}-${row.descriptionZh.slice(0, 12)}`} className="px-1.5 py-1">
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <span className="text-ink/55">#{row.index}</span>
                      <span className="text-ink/70">{row.shotSizeLabel}</span>
                      <span className="text-ink/45">{row.durationSec}s</span>
                      {row.index === shotPlan.startIndex && (
                        <span className="text-brand">新镜起始</span>
                      )}
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
                {shotPlan.warnings.map((warning) => (
                  <li key={warning.code} className="text-[9px] text-amber-700 leading-snug">
                    {warning.messageZh}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="text-[9px] text-ink/30 leading-snug">
              镜头层面写回：新镜进分镜台拆镜结构（分镜台可编辑、重拆不丢）并同步链镜表与全局镜表；
              已出图的格顺带写入该镜首帧。逐格覆盖既有镜首帧仍用上方「整组写入分镜 / 写入分镜」。
            </p>
          </div>

          {/* 接触表：逐格图拼一张（服务端宫格拼合），缺图格用源图占位 */}
          <div className="rounded-lg border border-line/40 bg-surface/60 p-2 space-y-1.5" onMouseDown={stop}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-ink/70">接触表</span>
              <span className="text-[9px] text-ink/45">
                {plan.cols}×{plan.rows} · {plannedWithImageCount}/{plannedCellCount} 格有图
                {contactSheetStale ? ' · 已有接触表已过期' : contactSheetUrl ? ' · 已有' : ''}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onMouseDown={stop}
                  disabled={progress.done === 0 || busy !== null}
                  onClick={() => void handleExportContactSheet()}
                  className="inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[9px] text-ink/70 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                  title="把已出图的格拼成一张接触表（缺图格用源图占位并如实标注）"
                >
                  <ImageDown size={10} className={busy === 'sheet' ? 'animate-pulse' : undefined} />
                  {contactSheetUrl ? '重出接触表' : '一键导出接触表'}
                </button>
                <button
                  type="button"
                  onMouseDown={stop}
                  disabled={!contactSheetUrl || busy !== null}
                  onClick={handleDownloadContactSheet}
                  className="inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[9px] text-ink/70 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                  title={contactSheetUrl ? '下载接触表大图' : '尚无接触表'}
                >
                  <Download size={10} />
                  下载
                </button>
                <button
                  type="button"
                  onMouseDown={stop}
                  disabled={!contactSheetUrl}
                  onClick={handleSaveContactSheetToLibrary}
                  className="inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[9px] text-ink/70 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                  title={contactSheetUrl ? '把接触表登记进素材库' : '尚无接触表'}
                >
                  <FolderPlus size={10} />
                  入库
                </button>
                <button
                  type="button"
                  onMouseDown={stop}
                  disabled={!contactSheetUrl}
                  onClick={handleTrashContactSheet}
                  className="inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[9px] text-ink/55 hover:text-red-500 hover:border-red-300 disabled:opacity-40"
                  title={contactSheetUrl ? '把接触表移入资产回收站' : '尚无接触表'}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
            {contactSheetUrl ? (
              <img
                src={contactSheetUrl}
                alt="接触表"
                className={`w-full rounded border border-line/30 object-contain max-h-40 ${
                  contactSheetStale ? 'opacity-60' : ''
                }`}
                draggable={false}
              />
            ) : (
              <p className="text-[9px] text-ink/40">
                逐格图拼成一张接触表（复用宫格拼合），导出后可下载 / 入库 / 回收站。
              </p>
            )}
          </div>

          {/* 跨格一致性校验：对已出图的格做图像级体检（人脸有无 / 数量、表情突变、外观关键词） */}
          <ConsistencyCheckSection
            targets={consistencyTargets}
            limit={cellConcurrency}
            contextZh={`${modeDef.label}（${plan.rows}×${plan.cols}）`}
            scopeLabelZh={modeDef.label}
            onJump={handleJumpToCell}
          />
        </div>
      )}
    </ComposerWorkspaceShell>
  );
}
