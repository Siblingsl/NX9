import { useCallback, useMemo, useRef, useState } from 'react';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  Download,
  ImageDown,
  Layers,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  UserSquare,
} from 'lucide-react';
import {
  CHARACTER_SHEET_CONSISTENCY_LEVELS,
  CHARACTER_SHEET_KINDS,
  IMAGE_ASPECT_OPTIONS,
  buildCharacterSheetPlan,
  characterSheetSubjectFromProfile,
  lookupCharacterSheetKindDef,
  readCharacterSheetConsistency,
  readCharacterSheetKind,
  type CharacterSheetCell,
  type CharacterSheetKind,
  type CharacterSheetPlan,
  type CharacterSheetSubject,
  type NodeRunStatus,
} from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { ComposerModelSelect } from '../composer/ComposerModelSelect';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import { useUpstreamMedia } from '../generation/use-upstream-media';
import { useDeckUi } from '../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { toastError, toastSuccess } from '../../../../../stores/toast';
import { askConfirm } from '../../../../../stores/confirm-dialog';
import { api } from '../../../../../api/client';
import { useConnectedPictureModels } from '../../../../../hooks/use-connected-picture-models';
import { collectNodeAssetUsages } from '../../../../collect-node-asset-refs';
import {
  buildCharacterSheetSignature,
  readCharacterSheetCellRunStates,
  readCharacterSheetCellUrls,
  readCharacterSheetPendingTasks,
  type CharacterSheetReferenceState,
} from '../../../../character-sheet-closure';
import {
  buildContactSheetCells,
  buildContactSheetFileName,
  computeContactSheetGridLayout,
  describeMultiGridFailures,
  describeMultiGridPending,
  selectMultiGridRetryIndexes,
  summarizeMultiGridProgress,
  type MultiGridCellFailure,
  type MultiGridCellRunState,
} from '../../../../multi-grid-closure';
import {
  dropCharacterSheetCell,
  resumeCharacterSheetPendingCells,
  runCharacterSheetCellRetry,
} from '../../../../flow-runner-ops/character-sheet-ops';
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

export interface CharacterSheetWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
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

function toInt(value: unknown, fallback: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 逐格卡片的 DOM id（供一致性报告「跳到该格」定位 / 高亮） */
function characterSheetCellDomId(blockId: string, index: number): string {
  return `nx9-character-sheet-cell-${blockId}-${index}`;
}

/**
 * 角色设定表工作区（tool 壳层，节点下方底部跟随工作区）。
 *
 * 能力：版面切换（三视图 / 表情表 / 动作表 / 整套）· 行列 · 一致性强度 ·
 * 角色与参考图来源 · 逐格提示词编辑 · 批量出图 · 逐格重试 / 续查 · 拼成设定表 ·
 * 登记为角色参考图（写回素材库角色档案，无角色上下文时明确提示）。
 */
export function CharacterSheetWorkspace({ blockId, kind, onCollapse }: CharacterSheetWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const data = useAttachedNodeData(blockId);
  const { pictures: upstreamPictures } = useUpstreamMedia(blockId);
  const runAbortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** 素材库角色（回收站中的不参与选择）：先取数组再过滤，避免每帧返回新数组 */
  const allCharacters = useWorkspaceDocument((s) => s.characters.characters);
  const characters = useMemo(() => allCharacters.filter((c) => !c.deletedAt), [allCharacters]);

  const sheetKind = readCharacterSheetKind(data.characterSheetKind);
  const kindDef = lookupCharacterSheetKindDef(sheetKind);
  const storedSubject = data.characterSheetSubject as CharacterSheetSubject | undefined;
  const subject = useMemo(() => storedSubject ?? {}, [storedSubject]);

  const upstreamRef = (upstreamPictures[0] ?? '').trim();
  const pickedRef = (data.characterSheetReferenceImage as string | undefined)?.trim() ?? '';
  const pinnedRef = (data.characterSheetRef as string | undefined)?.trim() ?? '';
  const subjectRef = (subject.referenceImageUrl ?? '').trim();
  const sourceRef = upstreamRef || subjectRef || pickedRef || pinnedRef;

  const rows = toInt(data.characterSheetRows, kindDef.rows);
  const cols = toInt(data.characterSheetCols, kindDef.cols);
  const aspectRatio = ((data.aspectRatio as string | undefined) ?? '').trim();
  const consistency = readCharacterSheetConsistency(data.consistency);
  const negativePrompt = ((data.negativePrompt as string | undefined) ?? '').trim();
  const styleNote = ((data.styleNote as string | undefined) ?? '').trim();
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

  /** 上游节点挂着的角色引用（素材库角色 AssetRef）：作为「上游角色」来源提示 */
  const upstreamCharacterRef = useMemo(() => {
    const sourceIds = new Set(edges.filter((e) => e.target === blockId).map((e) => e.source));
    const upstreamNodes = nodes
      .filter((n) => sourceIds.has(n.id))
      .map((n) => ({ id: n.id, type: n.type, data: (n.data ?? {}) as Record<string, unknown> }));
    return collectNodeAssetUsages(upstreamNodes).find((r) => r.kind === 'character');
  }, [blockId, edges, nodes]);

  /** 按当前参数实时预览的计划（不写节点，避免参数改动即脏写） */
  const builtPlan = useMemo<CharacterSheetPlan>(
    () =>
      buildCharacterSheetPlan(sheetKind, {
        subject,
        sourceRef,
        rows,
        cols,
        aspectRatio: aspectRatio || undefined,
        consistency,
        extraNegative: negativePrompt || undefined,
        styleNoteZh: styleNote || undefined,
      }),
    [aspectRatio, cols, consistency, negativePrompt, rows, sheetKind, sourceRef, styleNote, subject],
  );

  const storedPlan = data.characterSheetPlan as CharacterSheetPlan | undefined;

  /** 编辑稿仅在版面 / 参考图 / 角色标签仍一致时生效，否则回到按参数实时计划 */
  const plan = useMemo<CharacterSheetPlan>(() => {
    const storedCells = Array.isArray(data.characterSheetCells)
      ? (data.characterSheetCells as CharacterSheetCell[])
      : undefined;
    if (!storedCells?.length || !storedPlan) return builtPlan;
    if (storedPlan.kind !== builtPlan.kind || storedPlan.sourceRef !== builtPlan.sourceRef) {
      return builtPlan;
    }
    if (storedCells.length !== builtPlan.cells.length) return builtPlan;
    if (!builtPlan.cells.every((c, i) => storedCells[i]?.role === c.role)) return builtPlan;
    return { ...builtPlan, cells: storedCells };
  }, [builtPlan, data.characterSheetCells, storedPlan]);

  const cellUrls = useMemo(() => readCharacterSheetCellUrls(data), [data]);
  const cellStates = useMemo(() => readCharacterSheetCellRunStates(data), [data]);
  const progress = useMemo(() => summarizeMultiGridProgress(cellStates), [cellStates]);
  const pendingTasks = useMemo(() => readCharacterSheetPendingTasks(data), [data]);
  const retryIndexes = useMemo(() => selectMultiGridRetryIndexes(cellStates), [cellStates]);
  const stateByIndex = useMemo(
    () => new Map(cellStates.map((s) => [s.index, s])),
    [cellStates],
  );
  const batchProgress = data.batchProgress as { done?: number; total?: number } | undefined;
  const sheetUrl = ((data.characterSheetUrl as string | undefined) ?? '').trim();
  const referenceState = data.characterSheetReference as CharacterSheetReferenceState | undefined;
  /** 上一轮失败账单（节点 data，逐格重跑与文案共用） */
  const failureList = useMemo(
    () =>
      ((data.lastResult as { failures?: MultiGridCellFailure[] } | undefined)?.failures ?? []).filter(
        (f) => f && typeof f.index === 'number',
      ),
    [data.lastResult],
  );

  const referenceStale = Boolean(
    sheetUrl &&
      referenceState?.signature &&
      referenceState.signature !== buildCharacterSheetSignature(plan, cellUrls),
  );

  const cellImageUrl = useCallback(
    (index: number): string => (cellUrls[index] ?? '').trim(),
    [cellUrls],
  );

  /* ── 跨格一致性校验（会话内状态：报告在 ConsistencyCheckSection 内部，不写节点 data） ── */

  /** 「跳到该格」的聚焦格序号（仅用于滚动 + 高亮） */
  const [consistencyFocus, setConsistencyFocus] = useState<number | null>(null);

  const handleJumpToCell = useCallback(
    (index: number) => {
      setConsistencyFocus(index);
      document
        .getElementById(characterSheetCellDomId(blockId, index))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    [blockId],
  );

  /** 校验目标格：全部版面格（未出图的格 url 为空串，校验时会被跳过并如实计入「未纳入校验」） */
  const consistencyTargets = useMemo<ConsistencyTarget[]>(
    () => plan.cells.map((cell, i) => ({ index: i, label: cell.role, url: cellImageUrl(i) })),
    [cellImageUrl, plan],
  );

  /** 优先格：三视图正面格（挑最优格时作为排序判据之一，不会盖掉更严重的问题） */
  const consistencyPreferIndexes = useMemo(
    () => plan.cells.map((cell, i) => (cell.angleId === 'front' ? i : -1)).filter((i) => i >= 0),
    [plan],
  );

  /* ────────────── 版面 / 参数 ────────────── */

  const handleSelectKind = useCallback(
    (next: CharacterSheetKind) => {
      const def = lookupCharacterSheetKindDef(next);
      patch({
        characterSheetKind: next,
        characterSheetPlan: undefined,
        characterSheetCells: undefined,
        characterSheetRows: def.rows,
        characterSheetCols: def.cols,
      });
    },
    [patch],
  );

  const handleSelectConsistency = useCallback(
    (next: string) => {
      patch({
        consistency: next,
        // 档位决定图生图强度，必须重算计划里的 consistencyStrength
        characterSheetPlan: undefined,
        characterSheetCells: undefined,
      });
    },
    [patch],
  );

  const handlePickCharacter = useCallback(
    (id: string) => {
      const profile = useWorkspaceDocument.getState().characters.characters.find((c) => c.id === id);
      if (!profile) {
        toastError('未找到该角色：可能已被移入回收站，请刷新素材库后再选');
        return;
      }
      const nextSubject = characterSheetSubjectFromProfile(profile);
      patch({
        characterSheetSubject: nextSubject,
        characterSheetReferenceImage: nextSubject.referenceImageUrl || undefined,
        // 角色变了 → 锁定短语与参考图都变，逐格编辑稿作废
        characterSheetPlan: undefined,
        characterSheetCells: undefined,
      });
      appendLog(
        nextSubject.referenceImageUrl
          ? `角色设定表 · 已选用角色「${profile.name}」，参考图取自该角色的参考图`
          : `角色设定表 · 已选用角色「${profile.name}」（该角色没有参考图：本次为纯文字设定表）`,
      );
    },
    [appendLog, patch],
  );

  const handlePatchCell = useCallback(
    (index: number, value: string) => {
      const cells: CharacterSheetCell[] = plan.cells.map((cell, i) =>
        i === index
          ? { ...cell, imagePromptZh: value, imagePrompt: value, promptEdited: true }
          : cell,
      );
      patch({ characterSheetPlan: { ...plan, cells }, characterSheetCells: cells });
    },
    [patch, plan],
  );

  const handleResetPrompts = useCallback(() => {
    patch({ characterSheetPlan: undefined, characterSheetCells: undefined });
    appendLog('角色设定表 · 已恢复默认提示词');
  }, [appendLog, patch]);

  /* ────────────── 批量出图 / 停止 ────────────── */

  const handleRun = useCallback(async () => {
    if (!runtime) return;
    const controller = beginBlockRunAbort(blockId);
    runAbortRef.current = controller;
    patch({
      status: 'running',
      characterSheetKind: plan.kind,
      characterSheetPlan: plan,
      characterSheetCells: plan.cells,
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
      if (controller.signal.aborted) {
        appendLog('角色设定表 · 已停止');
        return;
      }
      const last = runtime.getNodes().find((n) => n.id === blockId)?.data as
        | { lastResult?: { count?: number; total?: number; failures?: unknown[] } }
        | undefined;
      const failures = last?.lastResult?.failures?.length ?? 0;
      appendLog(
        `角色设定表 · ${kindDef.label} 出图 ${last?.lastResult?.count ?? 0}/${last?.lastResult?.total ?? plan.cells.length}` +
          (failures > 0 ? `（${failures} 格失败）` : ''),
      );
    } catch (e) {
      if (controller.signal.aborted) appendLog('角色设定表 · 已停止');
      else {
        patch({ status: 'error', error: String(e) });
        toastError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      endBlockRunAbort(blockId, controller);
      if (runAbortRef.current === controller) runAbortRef.current = null;
    }
  }, [appendLog, blockId, edges, kindDef.label, nodes, patch, plan, runtime]);

  const handleStop = useCallback(() => {
    const had = abortBlockRun(blockId) || Boolean(runAbortRef.current);
    runAbortRef.current = null;
    patch({ status: 'idle', error: undefined, message: undefined, batchProgress: undefined });
    appendLog(had ? '角色设定表 · 已停止' : '角色设定表 · 已收回空闲');
  }, [appendLog, blockId, patch]);

  const handleRetryCells = useCallback(
    async (indexes?: number[]) => {
      if (!runtime) return;
      const controller = beginBlockRunAbort(blockId);
      runAbortRef.current = controller;
      setBusy(indexes?.length === 1 ? `cell-${indexes[0]}` : 'retry');
      patch({ status: 'running', error: undefined });
      try {
        const res = await runCharacterSheetCellRetry({
          blockId,
          data,
          indexes,
          sourceRef,
          upstreamPictures,
          signal: controller.signal,
          updateNodeData: (id, next) => runtime.updateNodeData(id, next),
        });
        if (controller.signal.aborted) {
          appendLog('角色设定表 · 已停止重跑');
          return;
        }
        if (res.failures.length === 0) {
          if (!res.ok) {
            toastError(res.reason ?? '没有需要重跑的格');
            appendLog(`角色设定表 · 未重跑：${res.reason ?? '没有需要重跑的格'}`);
            return;
          }
          appendLog(`角色设定表 · 重跑完成，现有 ${res.urls.length} 格有图`);
          toastSuccess(`重跑完成 · ${res.urls.length} 格有图`);
          return;
        }
        const failNote = describeMultiGridFailures(res.failures, plan.cells.length) ?? '仍有格失败';
        appendLog(`角色设定表 · 重跑完成，现有 ${res.urls.length} 格有图（${failNote}）`);
        toastError(`重跑完成：${failNote}`);
      } catch (e) {
        if (controller.signal.aborted) appendLog('角色设定表 · 已停止重跑');
        else toastError(e instanceof Error ? e.message : String(e));
      } finally {
        endBlockRunAbort(blockId, controller);
        if (runAbortRef.current === controller) runAbortRef.current = null;
        setBusy(null);
      }
    },
    [appendLog, blockId, data, patch, plan.cells.length, runtime, sourceRef, upstreamPictures],
  );

  /** 续查未完成格：复用 resumePendingImageTasks（与图像 / 多格推演同一条续查链） */
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
      const res = await resumeCharacterSheetPendingCells({
        blockId,
        data,
        sourceRef,
        upstreamPictures,
        signal: controller.signal,
        updateNodeData: (id, next) => runtime.updateNodeData(id, next),
      });
      if (controller.signal.aborted) {
        appendLog('角色设定表 · 已停止续查');
        return;
      }
      if (res.fetched.length > 0) {
        appendLog(`角色设定表 · 续查取回 ${res.fetched.length} 格后台图`);
        toastSuccess(`已取回 ${res.fetched.length} 格后台图`);
      } else if (res.stillPending.length > 0) {
        appendLog(`角色设定表 · ${res.stillPending.length} 格任务仍在后台，请稍后再查`);
      } else {
        toastError('后台图片任务已失败或过期');
      }
    } catch (e) {
      if (controller.signal.aborted) appendLog('角色设定表 · 已停止续查');
      else toastError(e instanceof Error ? e.message : String(e));
    } finally {
      endBlockRunAbort(blockId, controller);
      if (runAbortRef.current === controller) runAbortRef.current = null;
      setBusy(null);
    }
  }, [appendLog, blockId, data, pendingTasks.length, runtime, sourceRef, upstreamPictures]);

  /** 单格清空：清掉该格图（其余格不受影响） */
  const handleClearCell = useCallback(
    (index: number) => {
      if (!(cellUrls[index] ?? '').trim()) {
        toastError('该格还没有出图');
        return;
      }
      const done = dropCharacterSheetCell({
        blockId,
        data,
        index,
        sourceRef,
        upstreamPictures,
        updateNodeData: (id, next) => updateNodeData(id, next),
      });
      if (!done) {
        toastError('该格没有可清空的图（不静默成功）');
        return;
      }
      appendLog(`角色设定表 · 已清空「${plan.cells[index]?.role ?? `第 ${index + 1} 格`}」`);
      toastSuccess('已清空该格');
    },
    [appendLog, blockId, cellUrls, data, plan.cells, sourceRef, updateNodeData, upstreamPictures],
  );

  /* ────────────── 拼成设定表 ────────────── */

  const handleComposeSheet = useCallback(async () => {
    const sheet = buildContactSheetCells({
      cells: plan.cells.map((c) => ({ cellIndex: c.cellIndex, role: c.role })),
      urls: cellUrls,
      sourceUrl: sourceRef,
    });
    if (sheet.imageUrls.every((u) => !u.trim())) {
      toastError('还没有任何可用图：请先出图，再拼成设定表');
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
      if (!res.ok || !res.url) throw new Error('设定表拼合失败，禁止空成功');
      patch({
        characterSheetUrl: res.url,
        characterSheetSignature: buildCharacterSheetSignature(plan, cellUrls),
        characterSheetAt: new Date().toISOString(),
      });
      const placeholderNote = sheet.placeholderIndexes.length
        ? `，${sheet.placeholderIndexes.length} 格未出图已用参考图占位`
        : '';
      appendLog(
        `角色设定表 · 已拼成设定表（${layout.cols}×${layout.rows} · ${sheet.imageUrls.length} 格${placeholderNote}）`,
      );
      toastSuccess(`设定表已生成${placeholderNote}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendLog(`角色设定表 · 设定表拼合失败：${msg}`);
      toastError(msg);
    } finally {
      setBusy(null);
    }
  }, [appendLog, cellUrls, patch, plan, sourceRef]);

  const handleDownloadSheet = useCallback(() => {
    if (!sheetUrl) return;
    const a = document.createElement('a');
    a.href = sheetUrl;
    a.download = buildContactSheetFileName(sheetUrl);
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
  }, [sheetUrl]);

  /* ────────────── 登记为角色参考图 ────────────── */

  /**
   * 写入素材库角色档案：
   * - `referenceImageUrl` ← 设定表母图（没拼合则退三视图正面格 / 首格）；
   * - `consistencyPrompt` ← 本次逐格复述的一致性锁定短语（英文，生图 / 生视频注入用）；
   * - `creative.fullSheetUrl` / `creative.frontViewUrl` ← 设定表母图与正面视图（既有字段）；
   * 其余字段原样保留。无角色上下文时明确提示，不静默、不新建角色。
   */
  const handleRegisterReference = useCallback(async () => {
    const targetId = (subject.characterId ?? '').trim();
    if (!targetId) {
      const msg =
        upstreamCharacterRef?.assetId
          ? `上游节点挂着角色「${upstreamCharacterRef.label ?? upstreamCharacterRef.assetId}」，但本节点尚未选用角色：请先在顶部「角色」里选中该角色，再登记参考图。`
          : '未选择素材库角色：无法登记为角色参考图。请先在顶部「角色」下拉中选择（或先在素材库新建角色）。';
      toastError(msg);
      appendLog(`角色设定表 · 未登记参考图：${msg}`);
      return;
    }
    const doc = useWorkspaceDocument.getState();
    const profile = doc.characters.characters.find((c) => c.id === targetId);
    if (!profile) {
      toastError('目标角色已不在素材库（可能已移入回收站）：未登记，避免写到别的角色上');
      appendLog('角色设定表 · 未登记参考图：目标角色缺失');
      return;
    }
    const frontIndex = plan.cells.findIndex((c) => c.angleId === 'front');
    const imageUrl =
      sheetUrl ||
      (frontIndex >= 0 ? (cellUrls[frontIndex] ?? '').trim() : '') ||
      cellUrls.find((u) => u.trim())?.trim() ||
      '';
    if (!imageUrl) {
      toastError('还没有出图：请先批量出图，再登记为角色参考图');
      return;
    }
    const ok = await askConfirm({
      title: `登记为「${profile.name}」的角色参考图？`,
      description:
        `将写入：参考图 ${sheetUrl ? '整套设定表母图' : '三视图正面格'}；一致性描述用本次锁定短语（${plan.consistency}档）。` +
        (profile.referenceImageUrl && profile.referenceImageUrl !== imageUrl
          ? ' 该角色原参考图会被替换（其余字段保留）。'
          : ''),
      confirmLabel: '登记',
      tone: 'neutral',
    });
    if (!ok) return;

    const next = {
      ...profile,
      referenceImageUrl: imageUrl,
      consistencyPrompt: plan.consistencyLock,
      creative: {
        ...(profile.creative ?? {}),
        ...(sheetUrl ? { fullSheetUrl: sheetUrl } : {}),
        ...(frontIndex >= 0 && (cellUrls[frontIndex] ?? '').trim()
          ? { frontViewUrl: (cellUrls[frontIndex] ?? '').trim() }
          : {}),
      },
    };
    doc.upsertCharacter(next);
    patch({
      characterSheetReference: {
        characterId: profile.id,
        characterName: profile.name,
        imageUrl,
        consistencyPrompt: plan.consistencyLock,
        signature: buildCharacterSheetSignature(plan, cellUrls),
        at: new Date().toISOString(),
        wroteConsistency: true,
      } satisfies CharacterSheetReferenceState,
    });
    appendLog(
      `角色设定表 · 已登记为角色「${profile.name}」的参考图（${sheetUrl ? '整套设定表' : '三视图正面格'}）并写入一致性描述`,
    );
    toastSuccess(`已登记为「${profile.name}」的角色参考图，可在素材库核对`);
  }, [
    appendLog,
    cellUrls,
    patch,
    plan,
    sheetUrl,
    subject.characterId,
    upstreamCharacterRef?.assetId,
    upstreamCharacterRef?.label,
  ]);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  /* ────────────── 渲染 ────────────── */

  const running = status === 'running';
  const modalChips =
    pictureModelOptions.length > 0
      ? pictureModelOptions
      : [{ id: model, label: '未配置图片连接 · 点此去设置' }];
  const gridStyle = { gridTemplateColumns: `repeat(${plan.cols}, minmax(0, 1fr))` };
  const failureCount = ((data.lastResult as { failures?: unknown[] } | undefined)?.failures ?? [])
    .length;

  const toolbarLeft = (
    <div className="flex items-center gap-1 flex-wrap min-w-0" onMouseDown={stop}>
      {CHARACTER_SHEET_KINDS.map((k) => (
        <button
          key={k.id}
          type="button"
          onMouseDown={stop}
          onClick={() => handleSelectKind(k.id)}
          title={k.hint}
          className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
            sheetKind === k.id
              ? 'border-brand/40 bg-brand/10 text-brand'
              : 'border-line/40 text-ink/55 hover:text-ink'
          }`}
        >
          {k.label}
        </button>
      ))}
      <span className="w-px h-3.5 bg-line/50" />
      {CHARACTER_SHEET_CONSISTENCY_LEVELS.map((l) => (
        <button
          key={l.id}
          type="button"
          onMouseDown={stop}
          onClick={() => handleSelectConsistency(l.id)}
          title={`${l.hint}（图生图强度 ${l.strength}）`}
          className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
            consistency === l.id
              ? 'border-brand/40 bg-brand/10 text-brand'
              : 'border-line/40 text-ink/55 hover:text-ink'
          }`}
        >
          一致性 {l.label}
        </button>
      ))}
      <span className="w-px h-3.5 bg-line/50" />
      <button
        type="button"
        onMouseDown={stop}
        onClick={handleResetPrompts}
        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md text-ink/55 hover:text-ink hover:bg-surface/90"
        title="丢弃逐格提示词改写，回到按当前参数生成的默认版面"
      >
        <RotateCcw size={11} />
        恢复默认提示词
      </button>
    </div>
  );

  const toolbarAdvanced = (
    <div className="space-y-2.5" onMouseDown={stop}>
      <div className="rounded-lg bg-surface/60 px-2 py-1.5 text-[10px] text-ink/50 leading-relaxed">
        {kindDef.label} · {plan.rows}×{plan.cols} · {plan.cells.length} 格 · 模型 {effectiveModel} ·
        单格 {plan.aspectRatio} · 一致性强度 {plan.consistencyStrength}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-[10px] text-ink/50">
          版面
          <input
            type="number"
            min={1}
            max={10}
            value={rows}
            onChange={(e) => patch({ characterSheetRows: toInt(e.target.value, kindDef.rows) })}
            className="w-12 rounded-lg border border-line/50 px-1.5 py-1 text-[11px] bg-surface"
          />
          ×
          <input
            type="number"
            min={1}
            max={10}
            value={cols}
            onChange={(e) => patch({ characterSheetCols: toInt(e.target.value, kindDef.cols) })}
            className="w-12 rounded-lg border border-line/50 px-1.5 py-1 text-[11px] bg-surface"
          />
          行 × 列
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">单格宽高比</span>
        <select
          value={aspectRatio}
          onChange={(e) => patch({ aspectRatio: e.target.value })}
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] bg-surface"
        >
          <option value="">按版面默认（{plan.aspectRatio}）</option>
          {IMAGE_ASPECT_OPTIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>

      {/* 逐格出图并发：整套设定表（最多 25+ 格）不再串行；执行器按同一口径解析 data.concurrency */}
      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">
          逐格并发
          <span className="ml-1 text-[9px] text-ink/35">同时出图的格数（1 = 串行）</span>
        </span>
        <select
          value={String(cellConcurrency)}
          onChange={(e) => patch({ concurrency: Number(e.target.value) })}
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] bg-surface"
          title="逐格出图的有界并发上限（1–4，缺省 2）；本批与逐格重跑都按它执行"
        >
          {CELL_GEN_CONCURRENCY_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n === 1 ? '1（串行）' : n}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">画风补充（写入每格风格层，可留空）</span>
        <textarea
          value={styleNote}
          onChange={(e) => patch({ styleNote: e.target.value })}
          rows={2}
          placeholder="例：赛璐璐平涂，主色深蓝，线稿干净"
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] resize-none bg-surface"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">追加负面提示词（叠加到每格默认负面项）</span>
        <textarea
          value={negativePrompt}
          onChange={(e) => patch({ negativePrompt: e.target.value })}
          rows={2}
          placeholder="例：戴眼镜、改发型、换服装"
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] resize-none bg-surface"
        />
      </label>

      <div className="space-y-1 rounded-lg border border-line/40 px-2 py-1.5">
        <div className="text-[10px] text-ink/45">一致性锁定短语（逐格复述）</div>
        <p className="text-[10px] text-ink/60 leading-relaxed break-words">
          {plan.consistencySummaryZh}
        </p>
        <details className="text-[10px] text-ink/40">
          <summary className="cursor-pointer">英文锁定短语（实际发送稿）</summary>
          <p className="mt-1 whitespace-pre-wrap break-words">{plan.consistencyLock}</p>
        </details>
      </div>

      {plan.warningsZh.length > 0 && (
        <ul className="space-y-0.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5">
          {plan.warningsZh.map((w, i) => (
            <li key={`${i}-${w}`} className="text-[10px] text-amber-800 leading-snug">
              · {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const topSlot = (
    <>
      <div className="mx-3 mt-2 flex items-center gap-2" onMouseDown={stop}>
        <span className="text-[10px] text-ink/45 shrink-0">参考图</span>
        {sourceRef ? (
          <img
            src={sourceRef}
            alt=""
            className="h-12 w-20 rounded-md border border-line/40 object-cover"
            draggable={false}
          />
        ) : (
          <span className="text-[10px] text-ink/40">
            无参考图：本次为纯文字设定表（一致性仅由锁定短语约束）；可连接上游图片或选择素材库角色
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={subject.characterId ?? ''}
            onMouseDown={stop}
            onChange={(e) => handlePickCharacter(e.target.value)}
            title="选择素材库角色：带出设定与参考图，登记参考图时也写到该角色"
            className="w-32 rounded-lg border border-line/50 px-1.5 py-1 text-[11px] bg-surface"
          >
            <option value="">未选角色</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
            width={220}
            tone="desk"
          />
        </div>
      </div>

      {upstreamCharacterRef?.assetId && upstreamCharacterRef.assetId !== subject.characterId && (
        <div className="mx-3 mt-1 text-[10px] text-ink/45">
          上游挂着角色「{upstreamCharacterRef.label ?? upstreamCharacterRef.assetId}」：可在右上角「角色」中选用，保持一致。
        </div>
      )}

      {running && (
        <div className="mx-3 mt-1.5 flex items-center gap-2 text-[10px] text-ink/55">
          <Sparkles size={11} className="animate-pulse" />
          出图中 {batchProgress?.done ?? 0}/{batchProgress?.total ?? plan.cells.length}
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
          disabled={progress.done === 0 || busy !== null}
          onClick={() => void handleComposeSheet()}
          title="把逐格设定图按当前版面拼成一张设定表（缺图格用参考图占位并如实标注）"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-line/40 text-ink/60 hover:text-brand hover:border-brand/40 disabled:opacity-40"
        >
          <Layers size={10} className={busy === 'sheet' ? 'animate-pulse' : undefined} />
          拼成设定表
        </button>
        <button
          type="button"
          onMouseDown={stop}
          disabled={progress.done === 0}
          onClick={() => void handleRegisterReference()}
          title="把设定表母图（或三视图正面格）登记为该素材库角色的参考图，并写入一致性描述"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-line/40 text-ink/60 hover:text-brand hover:border-brand/40 disabled:opacity-40"
        >
          <UserSquare size={10} />
          登记为角色参考图
        </button>
        <button
          type="button"
          onMouseDown={stop}
          disabled={!sheetUrl}
          onClick={handleDownloadSheet}
          title={sheetUrl ? '下载设定表母图' : '还没有拼合设定表'}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-line/40 text-ink/60 hover:text-brand hover:border-brand/40 disabled:opacity-40"
        >
          <Download size={10} />
          下载设定表
        </button>
      </div>

      {referenceState && (
        <div className="mx-3 mt-1 text-[10px] text-ink/45 leading-snug">
          已登记到「{referenceState.characterName}」：{referenceState.imageUrl}
          {referenceStale ? ' · 设定或逐格图已变化，可重新登记' : ''}
        </div>
      )}

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
      runLabel={running ? '出设定图中…' : `${kindDef.label} · 批量出图`}
      showAi={false}
      showHistory={false}
      heightClass="h-auto max-h-[560px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2 overflow-y-auto nowheel overscroll-contain"
    >
      <div className="space-y-2">
        <p className="text-[10px] text-ink/45 leading-relaxed">{plan.notesZh}</p>
        {plan.cells.length === 0 ? (
          <p className="text-[11px] text-ink/45">
            当前版面没有可出图的格：请检查既有预设，或切换版面。
          </p>
        ) : (
          <div className="grid gap-2" style={gridStyle}>
            {plan.cells.map((cell, i) => {
              const url = cellImageUrl(i);
              const baseCell = builtPlan.cells[i];
              const edited = cell.promptEdited === true;
              const cellState: MultiGridCellRunState = stateByIndex.get(i) ?? {
                index: i,
                role: cell.role,
                status: 'idle',
                url,
                reuseSourceImage: false,
              };
              const cellBusy = busy === `cell-${i}` || busy === 'retry';
              const tags = [
                cell.angleLabel,
                cell.expressionLabel,
                cell.poseLabel,
              ].filter(Boolean);
              return (
                <div
                  key={`${cell.role}-${i}`}
                  id={characterSheetCellDomId(blockId, i)}
                  className={`rounded-lg border border-line/40 bg-surface/60 p-1.5 space-y-1${
                    consistencyFocus === i ? ' ring-1 ring-amber-400/70' : ''
                  }`}
                >
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] font-medium text-ink/70 truncate">
                      {i + 1}. {cell.role}
                    </span>
                    {edited && <span className="text-[9px] text-amber-600">已改</span>}
                    <span
                      className={`ml-auto text-[9px] ${CELL_STATUS_CLASS[cellState.status]}`}
                      title={cellState.error ? `失败原因：${cellState.error}` : undefined}
                    >
                      {CELL_STATUS_LABEL[cellState.status]}
                    </span>
                  </div>

                  <div className="relative w-full aspect-[3/4] rounded border border-line/30 overflow-hidden bg-surface/80">
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[9px] text-ink/35">
                        {cellState.status === 'failed' ? '出图失败' : '待出图'}
                      </div>
                    )}
                  </div>

                  {cellState.error && (
                    <p
                      className="text-[9px] text-red-500 leading-snug line-clamp-2"
                      title={cellState.error}
                    >
                      {cellState.error}
                    </p>
                  )}

                  {tags.length > 0 && (
                    <div className="text-[9px] text-ink/40 leading-snug">{tags.join(' · ')}</div>
                  )}

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
                      <p className="mt-1 whitespace-pre-wrap break-words">{baseCell.imagePrompt}</p>
                    </details>
                  )}

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
                      onClick={() => handleClearCell(i)}
                      className="inline-flex items-center justify-center gap-1 rounded-md border border-line/50 px-1.5 py-0.5 text-[9px] text-ink/55 hover:text-red-500 hover:border-red-300 disabled:opacity-40"
                      title={url ? '清空该格图（其余格不受影响）' : '该格尚未出图'}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sheetUrl ? (
          <div className="rounded-lg border border-line/40 p-2 space-y-1">
            <div className="text-[10px] text-ink/55">设定表母图</div>
            <img
              src={sheetUrl}
              alt=""
              className="w-full rounded border border-line/30"
              draggable={false}
            />
            {referenceStale && (
              <p className="text-[10px] text-amber-700">
                设定表与最新逐格结果不一致：可重新拼合并登记。
              </p>
            )}
          </div>
        ) : null}

        {pendingTasks.length > 0 && (
          <p className="text-[10px] text-amber-700">{describeMultiGridPending(pendingTasks)}</p>
        )}
        {failureList.length > 0 && (
          <p className="text-[10px] text-red-500">
            {describeMultiGridFailures(failureList, plan.cells.length)}
          </p>
        )}

        <p className="text-[10px] text-ink/30 leading-snug">
          设定表为角色参考素材：逐格复述同一段一致性锁定短语，建议先在素材库完善角色外观 / 服装后再批量出图。
          角色设定表的图与「多格推演」互不影响，下游可直接连宫格拼合或视频生成。
        </p>

        {/* 跨格一致性校验：对已出图的格做图像级体检（人脸有无 / 数量、表情突变、外观关键词） */}
        <ConsistencyCheckSection
          targets={consistencyTargets}
          limit={cellConcurrency}
          preferIndexes={consistencyPreferIndexes}
          contextZh={`${kindDef.label}（${plan.rows}×${plan.cols}）`}
          scopeLabelZh={kindDef.label}
          onJump={handleJumpToCell}
        />
      </div>
    </ComposerWorkspaceShell>
  );
}
