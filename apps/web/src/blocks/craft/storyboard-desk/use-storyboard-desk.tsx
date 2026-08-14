import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  type AssetLibraryKind,
  type BacklotWorkspaceItem,
  type CharacterProfile,
  type EnvironmentProfile,
  emptyStoryboardPreview,
  flattenScriptBreakdownShots,
  getEpisodeContactSheet,
  resolveConnectedPictureGenId,
  type ScriptBreakdownPayload,
  type StoryboardPreviewPayload,
  costumeSourcesFromWorkspace,
  propSourcesFromWorkspace,
  shotLexiconSourcesFromWorkspace,
  BUILTIN_BACKLOT_TEMPLATES,
  getShotCreative,
  templateToWorkspaceItem,
} from '@nx9/shared';
import { usePublicAssetLibrary } from '../../../stores/public-asset-library';
import { BlockShell } from '../../shared/BlockShell';
import { ScreenModal } from '../../../components/ui/ScreenModal';
import { useActivityLog } from '../../../stores/activity-log';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { isDevPromptEnabled } from '../../../stores/dev-prompt-overrides';
import {
  persistChainStoryboardHygiene,
} from '../../../engine/chain-storyboard-utils';
import {
  applyScriptBreakdownPayload,
  stableSourceResultEpisodeId,
} from '../../../engine/script-breakdown-runner';
import {
  applyDeskBreakdown,
  buildBreakdownDiagnostics,
  captureDeskUndoSnapshot,
  serializeDeskSessionDraft,
  parseDeskSessionDraft,
  computeCompositionStats,
  deskLineArtUrl,
  type DeskUndoSnapshot,
  filterShots,
  isShotBound,
  isShotComposed,
  packageSourceHash,
  resolveDeskActiveEpisodeId,
  stripEpisodeConfirmation,
  type ShotListFilter,
} from '../../../engine/storyboard-desk-runner';
import { checkAssetReadinessInEdges, runStoryboardPreflight } from '../../../engine/asset-readiness';
import { useToast } from '../../../stores/toast';
import { confirmDelete, askConfirm } from '../../../stores/confirm-dialog';
import { AssetMentionInput } from '../../../engine/stage-deck/chrome/asset-mention/AssetMentionInput';
import { StoryboardPreviewWorkspace } from '../../../engine/stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace';
import { ComposerModelSelect } from '../../../engine/stage-deck/chrome/attached-workspace/composer/ComposerModelSelect';
import {
  createEpisodeQueue,
  type EpisodeQueueState,
  type QueueProgress,
} from '@nx9/shared';
import { EpisodeQueueBar } from '../../../components/EpisodeQueueBar';
import { generateStoryboardFrameImage, resolvePictureGenSettings } from '../../../engine/storyboard-preview-runner';
import { runPictureGenJob } from '../../../engine/picture-gen-runner';
import {
  buildDeskContactSheetSignature,
  composeStoryboardSheetPng,
  deskSheetCellsFromBreakdownShots,
} from '../../../engine/storyboard-sheet-compose';
import { api } from '../../../api/client';
import { toastSuccess } from '../../../stores/toast';
import { useFlowRuntime } from '../../../stores/flow-runtime';
import { useFlowCommands } from '../../../stores/flow-commands';
import '../storyboard-desk.css';
import '../storyboard-desk.v2.css';

import { useUpstreamBreakdown, useUpstreamScreenplay, compact, scenePresetName, createShotEditDraft, type ShotEditDraft, type StudioTab } from './helpers';
import { ShotStoryCell } from './shot-story-cell';
import ShotEditModal from './shot-edit-modal';
import StoryboardStaleBanner from './stale-banner';
import HandoffPanel from './handoff-panel';
import BreakdownPanel from './breakdown-panel';
import ComposePanel from './compose-panel';
import GridPanel from './grid-panel';
import { PipelineBar } from './pipeline-bar';
import { StoryboardDeskDevPack } from './desk-dev-pack';
import { useStoryboardBreakdownQueueOps } from './breakdown-queue-ops';
import { useStoryboardHandoffOps } from './handoff-ops';
import { useStoryboardShotWritebackOps } from './shot-writeback-ops';
import { useStoryboardLineArtOps } from './line-art-ops';
import { useStoryboardSheetExportOps } from './sheet-export-ops';
export function useStoryboardDesk(props: NodeProps) {
  const { updateNodeData, getEdges, getNodes } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const focusBlock = useFlowRuntime((s) => s.runtime?.focusBlock);
  const getAllNodes = useFlowRuntime((s) => s.runtime?.getNodes);
  const upstream = useUpstreamBreakdown(props.id);
  const upstreamPackage = useUpstreamScreenplay(props.id);
  const local = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const payload = local ?? undefined;
  const [breakingDown, setBreakingDown] = useState(false);
  const breakdownAbortRef = useRef<AbortController | null>(null);
  /** 每次开始/取消同步自增；完成后若不匹配则丢弃写回 */
  const breakdownEpochRef = useRef(0);
  const [breakdownElapsedSec, setBreakdownElapsedSec] = useState(0);
  const [shotFilter, setShotFilter] = useState<ShotListFilter>('all');
  const [incrementalText, setIncrementalText] = useState('');
  const [incrementalBusy, setIncrementalBusy] = useState(false);
  const breakdownProgressText = typeof (props.data as Record<string, unknown> | undefined)?.breakdownProgress === 'string'
    ? String((props.data as Record<string, unknown>).breakdownProgress)
    : null;

  // 同步中心跳：避免长时间 AI 调用看起来像卡死
  useEffect(() => {
    if (!breakingDown) {
      setBreakdownElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    setBreakdownElapsedSec(0);
    const id = window.setInterval(() => {
      setBreakdownElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [breakingDown]);

  // 挂载时若遗留 running 且无本地同步任务，清掉脏状态
  useEffect(() => {
    const status = (props.data as Record<string, unknown> | undefined)?.status;
    if (status === 'running' && !breakingDown) {
      updateNodeData(props.id, { status: 'idle', breakdownProgress: null });
    }
    persistChainStoryboardHygiene(
      updateNodeData,
      props.id,
      (props.data ?? {}) as Record<string, unknown>,
    );
    // 仅挂载时检查一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shots = useMemo(() => flattenScriptBreakdownShots(payload), [payload]);
  const activeEpisodeId = resolveDeskActiveEpisodeId(props.data as Record<string, unknown>, payload);
  const characters = useWorkspaceDocument((state) => state.characters.characters);
  const environmentLibrary = useWorkspaceDocument((state) => state.environments);
  const workspaceItems = useWorkspaceDocument((state) => state.backlotWorkspace.items);
  const environments = useMemo(() => environmentLibrary?.environments ?? [], [environmentLibrary]);
  const workspaceScenes = useMemo(
    () => workspaceItems.filter((item) => item.kind === 'scene'),
    [workspaceItems],
  );
  const costumeOptions = useMemo(() => costumeSourcesFromWorkspace(workspaceItems), [workspaceItems]);
  const propOptions = useMemo(() => propSourcesFromWorkspace(workspaceItems), [workspaceItems]);
  const publicTemplates = usePublicAssetLibrary((s) => s.payload.templates);
  const shotLexiconOptions = useMemo(() => {
    const fromPublic = publicTemplates
      .filter((t) => t.kind === 'shot' && !t.deletedAt)
      .map((t) => templateToWorkspaceItem(t))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const fromBuiltin = BUILTIN_BACKLOT_TEMPLATES
      .filter((t) => t.kind === 'shot')
      .map((t) => templateToWorkspaceItem(t))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const fromWorkspace = workspaceItems.filter((i) => i.kind === 'shot');
    const byId = new Map<string, (typeof fromWorkspace)[number]>();
    for (const item of [...fromBuiltin, ...fromPublic, ...fromWorkspace]) {
      byId.set(item.id, item);
    }
    return shotLexiconSourcesFromWorkspace([...byId.values()]);
  }, [publicTemplates, workspaceItems]);
  const shotLexiconById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getShotCreative> & { label: string; cameraMove?: string; shotSize?: string }>();
    const pool = [
      ...BUILTIN_BACKLOT_TEMPLATES.filter((t) => t.kind === 'shot').map((t) => templateToWorkspaceItem(t)),
      ...publicTemplates.filter((t) => t.kind === 'shot').map((t) => templateToWorkspaceItem(t)),
      ...workspaceItems.filter((i) => i.kind === 'shot'),
    ].filter((x): x is NonNullable<typeof x> => Boolean(x));
    for (const item of pool) {
      const ext = getShotCreative(item);
      map.set(item.id, {
        ...ext,
        label: item.label,
        cameraMove: ext.cameraMove,
        shotSize: ext.shotSize,
      });
    }
    return map;
  }, [publicTemplates, workspaceItems]);
  const currentEpisodeId = activeEpisodeId ?? payload?.episodes[0]?.id ?? null;
  const confirmedEpisodeIds = Array.isArray(props.data?.confirmedEpisodeIds)
    ? (props.data.confirmedEpisodeIds as string[])
    : [];
  const currentEpisodeConfirmed = Boolean(
    currentEpisodeId && confirmedEpisodeIds.includes(currentEpisodeId),
  );
  /** X-02: 本集确认被摘除后显示"重新确认" Banner */
  const [unconfirmBannerEpisodeId, setUnconfirmBannerEpisodeId] = useState<string | null>(null);
  const prevConfirmedRef = useRef<{ episodeId: string | null; confirmed: boolean }>({
    episodeId: currentEpisodeId,
    confirmed: currentEpisodeConfirmed,
  });
  useEffect(() => {
    const prev = prevConfirmedRef.current;
    if (prev.confirmed && !currentEpisodeConfirmed && prev.episodeId === currentEpisodeId && currentEpisodeId) {
      setUnconfirmBannerEpisodeId(currentEpisodeId);
    }
    prevConfirmedRef.current = { episodeId: currentEpisodeId, confirmed: currentEpisodeConfirmed };
  }, [currentEpisodeConfirmed, currentEpisodeId]);

  /** S-01: 分镜台会话草稿（镜表 + 预览帧 + 确认态） */
  const draftKey = `nx9-sb-draft-${props.id}`;
  const previewDraftSig = useMemo(() => {
    const preview = props.data?.storyboardPreview as StoryboardPreviewPayload | undefined;
    const frames = preview?.frames ?? [];
    return [
      frames.length,
      frames.map((f) => `${f.id}:${f.imageUrl ?? ''}`).join(','),
      preview?.contactSheetUrl ?? '',
      JSON.stringify(preview?.contactSheetsByEpisode ?? {}),
    ].join('|');
  }, [props.data?.storyboardPreview]);
  useEffect(() => {
    if (!payload) return;
    // SB-D-09: 300ms 防抖，避免连续确认/帧变更每次整包序列化
    const timer = window.setTimeout(() => {
      try {
        const live = (getNodes().find((n) => n.id === props.id)?.data ?? props.data) as Record<string, unknown>;
        sessionStorage.setItem(draftKey, JSON.stringify(serializeDeskSessionDraft(live, payload)));
      } catch {
        // SB-D-09: 配额/隐私模式写入失败时静默降级，不阻塞编辑
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [confirmedEpisodeIds, draftKey, getNodes, payload, previewDraftSig, props.data, props.id]);

  /** S-01: 无镜表时从草稿恢复（兼容 v1 仅镜表） */
  useEffect(() => {
    if (payload) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = parseDeskSessionDraft(raw);
      if (!parsed) return;
      if (parsed.kind === 'v2') {
        const snap = parsed.draft.snapshot;
        applyDeskBreakdown(props.id, snap.payload, updateNodeData, {
          confirmedEpisodeIds: snap.confirmedEpisodeIds,
          gridConfirmed: snap.gridConfirmed,
          chainStoryboard: snap.chainStoryboard,
        });
        updateNodeData(props.id, {
          storyboardPreview: snap.storyboardPreview ?? emptyStoryboardPreview(),
          contactSheetUrl: snap.contactSheetUrl,
        });
        appendLog('已从本次会话草稿恢复镜表/预览/确认态');
        return;
      }
      applyScriptBreakdownPayload(props.id, parsed.payload);
      appendLog('已从本次会话草稿恢复镜表');
    } catch { /* ignore corrupted draft */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleEpisodes = useMemo(() => {
    if (!payload) return [];
    const active = activeEpisodeId
      ? payload.episodes.find((episode) => episode.id === activeEpisodeId)
      : payload.episodes[0];
    return active ? [active] : payload.episodes;
  }, [activeEpisodeId, payload]);
  const visibleShots = useMemo(
    () => visibleEpisodes.flatMap((episode) => episode.shots),
    [visibleEpisodes],
  );
  const currentEpisodeShotIds = useMemo(
    () => new Set(visibleShots.map((s) => s.id)),
    [visibleShots],
  );
  const [studioOpen, setStudioOpen] = useState(false);
  const studioOpenRef = useRef(false);
  useEffect(() => { studioOpenRef.current = studioOpen; }, [studioOpen]);
  // 重新打开分镜台时收起「后台拆镜」常驻提示
  useEffect(() => {
    if (studioOpen) useToast.getState().dismiss('sb-breakdown-bg');
  }, [studioOpen]);
  const [studioTab, setStudioTab] = useState<StudioTab>('grid');
  /** 构图区子页：关键帧预览 / 故事板大图 */
  const [composeViewTab, setComposeViewTab] = useState<'preview' | 'sheet'>('preview');
  const breakdownJob = props.data?.breakdownJob as {
    phase?: string;
    sourcePackageHash?: string;
    error?: string;
  } | undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** G-03: 多选镜 id 集合 */
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(new Set());
  const toggleShotChecked = useCallback((shotId: string) => {
    setSelectedShotIds((prev) => {
      const next = new Set(prev);
      if (next.has(shotId)) next.delete(shotId);
      else next.add(shotId);
      return next;
    });
  }, []);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  /** 正在生成画面的 shot id */
  const [generatingShotId, setGeneratingShotId] = useState<string | null>(null);
  /** 批量任务：逐镜线稿 / 宫格线稿 互斥 */
  const [batchMode, setBatchMode] = useState<'line-art' | 'grid-line-art' | null>(null);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [batchScopeMode, setBatchScopeMode] = useState<'missing' | 'all'>('missing');
  const [lastBatchFailures, setLastBatchFailures] = useState<string[]>([]);
  const [sheetComposing, setSheetComposing] = useState(false);
  const batchRunning = batchMode !== null;
  const lineArtAbortRef = useRef<AbortController | null>(null);
  /** SB-OL-12: 单镜线稿 / 增量补拆的请求控制器 + 拼版写回代际（关台取消需全覆盖） */
  const singleLineArtAbortRef = useRef<AbortController | null>(null);
  const incrementalAbortRef = useRef<AbortController | null>(null);
  const sheetEpochRef = useRef(0);
  /** X-06: 本地撤销栈（镜表 + 预览帧 + 确认态，改字段/重置可悔） */
  const undoStackRef = useRef<DeskUndoSnapshot[]>([]);
  // SB-OL-13: ref 变化不触发渲染，按钮禁用态需用 state 跟踪栈深
  const [undoDepth, setUndoDepth] = useState(0);
  const pushUndo = useCallback((currentPayload: ScriptBreakdownPayload | undefined) => {
    if (!currentPayload) return;
    const live = (getNodes().find((n) => n.id === props.id)?.data ?? props.data) as Record<string, unknown>;
    const stack = undoStackRef.current;
    stack.push(captureDeskUndoSnapshot(live, currentPayload));
    if (stack.length > 20) stack.shift();
    setUndoDepth(stack.length);
  }, [getNodes, props.data, props.id]);
  /** F-016: 多集拆镜队列状态 */
  const [queueState, setQueueState] = useState<EpisodeQueueState>(() => createEpisodeQueue([]));
  const [queueProgress, setQueueProgress] = useState<QueueProgress>(() => ({ total: 0, current: 0, currentId: null, status: 'idle', succeeded: 0, failed: 0, skipped: 0, errorList: [] }));
  const [queueCurrentTitle, setQueueCurrentTitle] = useState('');
  const deskBusy = batchRunning || sheetComposing || queueState.status === 'running' || generatingShotId !== null || breakingDown || incrementalBusy;
  const breakdownBusy = breakingDown
    || queueState.status === 'running'
    || queueState.status === 'paused';

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0 || deskBusy) return;
    const prev = stack.pop()!;
    setUndoDepth(stack.length);
    applyDeskBreakdown(props.id, prev.payload, updateNodeData, {
      confirmedEpisodeIds: prev.confirmedEpisodeIds,
      gridConfirmed: prev.gridConfirmed,
      chainStoryboard: prev.chainStoryboard,
    });
    updateNodeData(props.id, {
      storyboardPreview: prev.storyboardPreview ?? emptyStoryboardPreview(),
      contactSheetUrl: prev.contactSheetUrl,
    });
    appendLog('已撤销');
  }, [deskBusy, props.id, updateNodeData, appendLog]);

  useEffect(() => {
    if (!deskBusy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [deskBusy]);

  /** 拆镜结束后：若弹窗已关，询问是否回到分镜台 */
  const offerReturnAfterBreakdown = useCallback(async (result: 'ok' | 'fail', detail?: string) => {
    if (studioOpenRef.current) {
      if (result === 'ok') setStudioTab('grid');
      return;
    }
    if (result === 'ok') {
      setStudioTab('grid');
      const go = await askConfirm({
        title: '拆镜已完成',
        description: '后台拆镜已结束，是否返回分镜台查看镜表？',
        confirmLabel: '打开分镜台',
        cancelLabel: '稍后',
        tone: 'neutral',
      });
      if (go) {
        setStudioOpen(true);
        focusBlock?.(props.id);
      } else {
        toastSuccess('拆镜已完成，可随时打开分镜台查看');
      }
      return;
    }
    const go = await askConfirm({
      title: '拆镜失败',
      description: detail?.trim()
        ? `${detail.trim()}\n\n是否打开分镜台查看详情？`
        : '后台拆镜失败。是否打开分镜台查看详情？',
      confirmLabel: '打开分镜台',
      cancelLabel: '稍后',
      tone: 'danger',
    });
    if (go) {
      setStudioOpen(true);
      focusBlock?.(props.id);
    }
  }, [focusBlock, props.id]);

  const handleCloseStudio = useCallback(async () => {
    // 拆镜中：可后台继续，不中止请求（节点组件仍挂载，任务不受弹窗关闭影响）
    if (breakdownBusy) {
      const bg = await askConfirm({
        title: '拆镜进行中',
        description: '可关闭弹窗，让拆镜在后台继续；完成后会询问是否返回分镜台。选择「留下等待」则保持打开。',
        confirmLabel: '后台继续',
        cancelLabel: '留下等待',
        tone: 'neutral',
      });
      if (!bg) return;
      appendLog('分镜台：拆镜转入后台继续（关闭弹窗不会中止）');
      useToast.getState().push({
        id: 'sb-breakdown-bg',
        message: '拆镜后台进行中… 可继续操作画布',
        variant: 'info',
        actionLabel: '打开分镜台',
        onAction: () => {
          setStudioOpen(true);
          focusBlock?.(props.id);
        },
      });
      setStudioOpen(false);
      return;
    }
    if (deskBusy) {
      const ok = await askConfirm({
        title: '任务进行中，确定关闭？',
        description: '关闭会取消进行中的线稿/构图任务；已成功的线稿不会撤销。',
        confirmLabel: '仍要关闭',
        cancelLabel: '继续任务',
      });
      if (!ok) return;
      // SB-OL-12: 关台取消须覆盖全部在途任务（批量/单镜线稿、增量补拆、拼版写回）
      lineArtAbortRef.current?.abort();
      lineArtAbortRef.current = null;
      singleLineArtAbortRef.current?.abort();
      singleLineArtAbortRef.current = null;
      incrementalAbortRef.current?.abort();
      incrementalAbortRef.current = null;
      sheetEpochRef.current += 1;
      setBatchMode(null);
      setBatchProgress(null);
      setGeneratingShotId(null);
      setSheetComposing(false);
      setIncrementalBusy(false);
    }
    setStudioOpen(false);
  }, [appendLog, breakdownBusy, deskBusy, focusBlock, props.id]);

  // Q-04: chainStoryboard 是 SSOT；全局 storyboard.shots 不得伪装成 chain 流入优先级 2
  const storyboardShots = useMemo(() => {
    const chain = (props.data as Record<string, unknown>)?.chainStoryboard as { shots: Array<{ id: string }> } | undefined;
    if (chain?.shots?.length) return chain.shots as any[];
    return [];
  }, [props.data]);
  const editingShot = visibleShots.find((shot) => shot.id === editingShotId) ?? null;
  const [editDraft, setEditDraft] = useState<ShotEditDraft | null>(null);
  const scenePresets = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ id: string; label: string; description?: string; source: '场景设定' | '场景库' }> = [];
    for (const env of environments) {
      const label = scenePresetName(env).trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      result.push({ id: env.id, label, description: env.descriptionZh, source: '场景设定' });
    }
    for (const item of workspaceScenes) {
      const label = scenePresetName(item).trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      result.push({ id: item.id, label, description: item.promptZh || item.promptEn, source: '场景库' });
    }
    return result;
  }, [environments, workspaceScenes]);
  const characterNameSet = useMemo(
    () => new Set(characters.map((character) => character.name.trim()).filter(Boolean)),
    [characters],
  );

  useEffect(() => {
    setEditDraft(editingShot ? createShotEditDraft(editingShot) : null);
  }, [editingShot]);

  const canBreakdownFromPackage =
    Boolean(upstreamPackage)
    && upstreamPackage!.status === 'confirmed'
    && Boolean(upstreamPackage!.screenplay.episodes.some((ep) => ep.bodyMd.trim()));

  // H-04: 从编剧台送分镜时高亮拆镜入口并打开工作室
  const handoffData = (props.data as Record<string, unknown>)?.handoff as {
    autoOpenBreakdown?: boolean;
    sourceScriptBlockId?: string;
    at?: string;
  } | undefined;
  const [handoffHighlight, setHandoffHighlight] = useState(false);
  const [staleBannerDismissed, setStaleBannerDismissed] = useState(false);
  const [staleBannerShowDiff, setStaleBannerShowDiff] = useState(false);
  useEffect(() => {
    if (!handoffData?.autoOpenBreakdown) return;
    setHandoffHighlight(true);
    setStudioTab('breakdown');
    setStudioOpen(true);
    setStaleBannerDismissed(false);
  }, [handoffData?.autoOpenBreakdown, handoffData?.at]);
  const studioBreakdownDefault = handoffData?.autoOpenBreakdown ? 'breakdown' : undefined;
  const packageStale = Boolean(
    payload
    && upstreamPackage
    && breakdownJob?.sourcePackageHash
    && packageSourceHash(upstreamPackage) !== breakdownJob.sourcePackageHash,
  );
  useEffect(() => {
    if (!packageStale) { setStaleBannerDismissed(false); setStaleBannerShowDiff(false); }
  }, [packageStale]);

  /** 上游有、本地镜表还没有的集（按 source / stable id 对齐） */
  const missingUpstreamEpisodes = useMemo(() => {
    if (!upstreamPackage) return [];
    const localEps = local?.episodes ?? [];
    return upstreamPackage.screenplay.episodes.filter((ep) => {
      const stableId = stableSourceResultEpisodeId(ep.id);
      return !localEps.some((e) => e.id === ep.id || e.id === stableId);
    });
  }, [local?.episodes, upstreamPackage]);
  /** 本地已有镜表时，才把 missing 当成「只拆新增」；空台一律走「从成稿拆镜」 */
  const hasLocalBreakdownEpisodes = (local?.episodes?.length ?? 0) > 0;
  const incrementalNewEpisodeCount = hasLocalBreakdownEpisodes ? missingUpstreamEpisodes.length : 0;
  const sceneNameSet = useMemo(
    () => new Set([
      ...environments.map((e) => e.name.trim()),
      ...workspaceScenes.map((i) => i.label.trim()),
    ].filter(Boolean)),
    [environments, workspaceScenes],
  );

  const previewPayloadEarly = props.data?.storyboardPreview as StoryboardPreviewPayload | undefined;

  /**
   * SB-OL-02: 不变量守护 —「本集已确认」期间任何写回改动了本集帧
   * （含构图页嵌入的 StoryboardPreviewWorkspace 单帧重生/上传/批量出图），
   * 都必须摘除本集确认。桌面自身的写回路径已在同一次更新里同步摘除
   * （摘除后 confirmed 变 false，此 effect 不会二次触发）；
   * 这里兜底覆盖所有绕过桌面 handler 的写回入口。
   */
  const episodeFramesSignature = useMemo(() => {
    return (previewPayloadEarly?.frames ?? [])
      .filter((f) => f.sourceShotId && currentEpisodeShotIds.has(f.sourceShotId))
      .map((f) => `${f.sourceShotId}:${f.imageUrl ?? ''}`)
      .sort()
      .join('|');
  }, [previewPayloadEarly, currentEpisodeShotIds]);
  const prevFramesSigRef = useRef<{ episodeId: string | null; sig: string } | null>(null);
  useEffect(() => {
    const prev = prevFramesSigRef.current;
    prevFramesSigRef.current = { episodeId: currentEpisodeId, sig: episodeFramesSignature };
    // 首次挂载 / 切集导致的签名变化不算「内容变更」
    if (!prev || prev.episodeId !== currentEpisodeId) return;
    if (prev.sig === episodeFramesSignature) return;
    if (!currentEpisodeConfirmed || !currentEpisodeId) return;
    updateNodeData(props.id, (node) => ({
      ...((node.data ?? {}) as Record<string, unknown>),
      ...stripEpisodeConfirmation((node.data ?? {}) as Record<string, unknown>, currentEpisodeId),
    }));
    appendLog('分镜台：本集线稿已变更，确认状态已撤销');
  }, [appendLog, currentEpisodeConfirmed, currentEpisodeId, episodeFramesSignature, props.id, updateNodeData]);

  const storyboardUrlMapEarly = useMemo(() => {
    const map = new Map<string, string | undefined>();
    // Q-04 优先级 1: 本节点 storyboardPreview 帧（SSOT）
    for (const frame of previewPayloadEarly?.frames ?? []) {
      if (frame.sourceShotId && frame.imageUrl) {
        map.set(frame.sourceShotId, frame.imageUrl);
      }
    }
    // Q-04 优先级 2: 本节点 chain 线稿（不含导演关键帧）
    for (const s of storyboardShots) {
      const url = deskLineArtUrl(s);
      if (url && !map.get(s.id)) map.set(s.id, url);
    }
    return map;
  }, [previewPayloadEarly, storyboardShots]);

  const compositionStats = useMemo(
    () => computeCompositionStats(
      visibleShots,
      previewPayloadEarly,
      storyboardUrlMapEarly,
      characterNameSet,
      sceneNameSet,
    ),
    [characterNameSet, previewPayloadEarly, sceneNameSet, storyboardUrlMapEarly, visibleShots],
  );

  const diagnostics = useMemo(
    () => {
      const list = buildBreakdownDiagnostics(payload, characterNameSet, sceneNameSet);
      // 拆镜进行中会先清空镜表再逐集写入，此时「镜表为空」是中间态，不当错误展示
      if (breakingDown || queueState.status === 'running' || queueState.status === 'paused') {
        return list.filter((d) => d.code !== 'no-shots');
      }
      return list;
    },
    [breakingDown, characterNameSet, payload, queueState.status, sceneNameSet],
  );

  const filteredShots = useMemo(
    () => filterShots(
      visibleShots,
      shotFilter,
      previewPayloadEarly,
      storyboardUrlMapEarly,
      characterNameSet,
      sceneNameSet,
    ),
    [characterNameSet, previewPayloadEarly, sceneNameSet, shotFilter, storyboardUrlMapEarly, visibleShots],
  );

  // SB-OL-08: getNodes/getEdges 是稳定引用，useMemo 永不重算；
  // 换用响应式 useNodes/useEdges，连线/上游设定变化时就绪条与「未连图像」chip 实时刷新
  const flowNodes = useNodes();
  const flowEdges = useEdges();
  const connectedPictureGenId = useMemo(
    () => resolveConnectedPictureGenId(props.id, flowNodes as any, flowEdges as any),
    [props.id, flowNodes, flowEdges],
  );

  const readiness = useMemo(() => {
    try {
      return checkAssetReadinessInEdges(props.id, flowNodes as any, flowEdges as any);
    } catch { return null; }
  }, [props.id, flowNodes, flowEdges]);
  const ready = readiness?.ready ?? false;
  const preflightMode: 'soft' | 'hard' = (props.data as Record<string, unknown>)?.preflightMode === 'hard' ? 'hard' : 'soft';
  /** F-017: 强约束开关 — 启用后无构图模板不得出图 */
  const enforceComposition = (props.data as Record<string, unknown>)?.enforceComposition === true;
  const confirmHardThreshold = (props.data as Record<string, unknown>)?.confirmHardThreshold === true;
  const preflight = useMemo(
    () => runStoryboardPreflight(readiness, preflightMode),
    [readiness, preflightMode],
  );
  const breakdownBlocked = preflight.blocking;
  const breakdownBlockedReason = !upstreamPackage
    ? '未连接编剧台，或上游没有合法成稿包'
    : upstreamPackage.status !== 'confirmed'
      ? `上游成稿状态为「${upstreamPackage.status}」，请先在编剧台点「确认成稿」`
      : !upstreamPackage.screenplay.episodes.some((ep) => ep.bodyMd.trim())
        ? '上游成稿没有分集正文：请回到编剧台用「生成剧本」生成并应用后再确认'
        : breakdownBlocked
          ? (preflight.reason ?? '硬模式下设定未就绪')
          : undefined;
  const hasSource = Boolean(canBreakdownFromPackage || upstreamPackage || payload);

  const togglePreflightMode = useCallback(() => {
    const next = preflightMode === 'hard' ? 'soft' : 'hard';
    updateNodeData(props.id, {
      preflightMode: next,
      preflight: { mode: next, lastReport: readiness ?? undefined },
    });
  }, [preflightMode, props.id, readiness, updateNodeData]);

  /** F-017: 切换构图强约束开关 */
  const toggleEnforceComposition = useCallback(() => {
    const next = !enforceComposition;
    updateNodeData(props.id, { enforceComposition: next });
  }, [enforceComposition, props.id, updateNodeData]);


  const storyboardUrlByShotId = useMemo(() => {
    const map = new Map<string, string>();
    // Q-04 优先级 1: 本节点 storyboardPreview 帧（SSOT）
    for (const frame of previewPayloadEarly?.frames ?? []) {
      if (frame.sourceShotId && frame.imageUrl) {
        map.set(frame.sourceShotId, frame.imageUrl);
      }
    }
    // Q-04 优先级 2: 本节点 chain 线稿（不含导演关键帧）
    for (const s of storyboardShots) {
      const url = deskLineArtUrl(s);
      if (url && !map.has(s.id)) map.set(s.id, url);
    }
    return map;
  }, [previewPayloadEarly, storyboardShots]);

  const previewPayload = (props.data as Record<string, unknown>)?.storyboardPreview as
    | StoryboardPreviewPayload
    | undefined;
  const previewFrames = previewPayload?.frames ?? [];
  const previewOk = previewFrames.filter((f) => f.imageUrl).length;
  const previewLow = previewFrames.filter((f) => f.suggestRegenerate).length;
  const contactSheetInfo = useMemo(
    () => getEpisodeContactSheet(previewPayload, currentEpisodeId),
    [previewPayload, currentEpisodeId],
  );
  const contactSheetUrl = contactSheetInfo.url;

  /** SB-D-03: 展示层比对实时签名，结构/线稿变更后旧大图标记「已过期」 */
  const contactSheetLiveCells = useMemo(
    () => deskSheetCellsFromBreakdownShots(visibleShots, {
      preview: previewPayloadEarly,
      storyboardUrlByShotId,
      workspaceShotById: new Map(storyboardShots.map((s) => [s.id, s])),
    }),
    [previewPayloadEarly, storyboardShots, storyboardUrlByShotId, visibleShots],
  );
  const contactSheetLiveSignature = useMemo(
    () => contactSheetLiveCells.length > 0 ? buildDeskContactSheetSignature(contactSheetLiveCells) : '',
    [contactSheetLiveCells],
  );
  const contactSheetStale = Boolean(
    contactSheetUrl
    && contactSheetLiveSignature
    && contactSheetInfo.signature
    && contactSheetLiveSignature !== contactSheetInfo.signature,
  );

  const {
    setShotFrameUrl,
    cleanupFramesForShots,
    handleDeleteShot,
    handleClearLineArt,
    handleCopyShot,
    handleCopySelected,
    handleDeleteSelected,
  } = useStoryboardShotWritebackOps({
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
  });

  const {
    confirmCurrentEpisode,
    openDirectorDesk,
    saveShotEdit,
    toggleDraftCharacter,
    openStudio,
    openUpstreamScriptDeskForConfirm,
    openEdit,
  } = useStoryboardHandoffOps({
    props,
    updateNodeData,
    getNodes,
    getEdges,
    getAllNodes,
    focusBlock,
    appendLog,
    payload,
    currentEpisodeShotIds,
    currentEpisodeId,
    currentEpisodeConfirmed,
    confirmedEpisodeIds,
    visibleEpisodes,
    visibleShots,
    compositionStats,
    upstreamPackage,
    canBreakdownFromPackage,
    breakdownBlocked,
    deskBusy,
    packageStale,
    ready,
    confirmHardThreshold,
    characters,
    scenePresets,
    characterNameSet,
    environments,
    workspaceScenes,
    setShotFilter,
    setStudioTab,
    setUnconfirmBannerEpisodeId,
    editingShot,
    editDraft,
    setEditDraft,
    pushUndo,
    studioBreakdownDefault,
    setStudioOpen,
    setSelectedId,
    setEditingShotId,
  });

  const upstreamNeedsConfirm = Boolean(
    upstreamPackage && upstreamPackage.status !== 'confirmed',
  );
  const canSyncLatest = Boolean(canBreakdownFromPackage && !breakdownBlocked && !deskBusy);
  const upstreamTitleShort = compact(upstreamPackage?.brief?.title?.trim() || '上游成稿', 12);

  const {
    generateShotLineArt,
    generateBatchLineArt,
    retryFailedLineArt,
    generateBatchGridLineArt,
  } = useStoryboardLineArtOps({
    props,
    updateNodeData,
    getNodes,
    getEdges,
    appendLog,
    payload,
    shots,
    visibleShots,
    currentEpisodeId,
    characters,
    costumeOptions,
    propOptions,
    shotLexiconOptions,
    batchRunning,
    batchScopeMode,
    setBatchScopeMode,
    setBatchMode,
    setBatchProgress,
    generatingShotId,
    setGeneratingShotId,
    lineArtAbortRef,
    singleLineArtAbortRef,
    lastBatchFailures,
    setLastBatchFailures,
    setShotFrameUrl,
    studioOpen,
    studioTab,
    filteredShots,
    selectedId,
    setSelectedId,
    deskBusy,
    openEdit,
    handleDeleteShot,
  });

  const {
    importLegacyBreakdown,
    breakdownFromPackage,
    runIncrementalBreakdown,
    handleRetryFailed,
    handleQueuePause,
    handleQueueResume,
    handleQueueSkip,
    handleQueueCancel,
    cancelBreakdown,
    breakdownNewEpisodesOnly,
    breakdownUnconfirmedOnly,
  } = useStoryboardBreakdownQueueOps({
    props,
    updateNodeData,
    getNodes,
    appendLog,
    payload,
    local,
    upstream,
    upstreamPackage,
    readiness,
    preflightMode,
    confirmedEpisodeIds,
    currentEpisodeId,
    offerReturnAfterBreakdown,
    setBreakingDown,
    setStudioTab,
    setStudioOpen,
    incrementalText,
    setIncrementalText,
    setIncrementalBusy,
    incrementalAbortRef,
    queueState,
    setQueueState,
    setQueueProgress,
    setQueueCurrentTitle,
    breakingDown,
    hasLocalBreakdownEpisodes,
    missingUpstreamEpisodes,
  });

  const {
    exportReviewPackage,
    generateStoryboardSheet,
    downloadContactSheet,
    updatePictureSettings,
  } = useStoryboardSheetExportOps({
    props,
    updateNodeData,
    getNodes,
    getEdges,
    appendLog,
    payload,
    visibleShots,
    visibleEpisodes,
    currentEpisodeId,
    compositionStats,
    storyboardShots,
    storyboardUrlByShotId,
    previewPayload,
    contactSheetUrl,
    sheetComposing,
    setSheetComposing,
    setComposeViewTab,
    batchRunning,
    sheetEpochRef,
  });

  // F-006: 上下口由 FlowSurface spawn 时显式设 true，不再运行时覆写。
  // 旧节点用户可通过 BlockShell toggle 按钮手动打开。

  const showShotNav = studioTab === 'grid' || studioTab === 'compose';

  return (
    <div className="relative">
      <BlockShell {...props}>
        <div className="sg3-card nodrag nopan">
          <div
            className="sg3-card__clickable"
            role="button"
            tabIndex={0}
            onClick={() => openStudio(payload ? 'grid' : 'breakdown')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openStudio(payload ? 'grid' : 'breakdown');
              }
            }}
          >
            <div className="sg3-card__header">
              <span className="sg3-card__eyebrow">分镜台 · 拆镜</span>
              <span className={`sg3-card__badge ${breakingDown ? 'is-run' : currentEpisodeConfirmed ? 'is-ok' : ''}`}>
                {breakingDown
                  ? (studioOpen ? '拆镜中' : '后台拆镜中')
                  : currentEpisodeConfirmed
                    ? '已确认'
                    : payload
                      ? '未确认'
                      : '待拆镜'}
              </span>
            </div>
            <div className="sg3-card__title">
              {payload
                ? compact(visibleEpisodes[0]?.title || payload.title || '本集', 22)
                : canBreakdownFromPackage
                  ? '从成稿拆镜'
                  : '分镜台'}
            </div>
            <div className="sg3-card__meta">
              {breakingDown
                ? (breakdownProgressText || `AI 拆镜中 · 已等待 ${breakdownElapsedSec}s`)
                : payload
                  ? `${shots.length} 镜 · 构图 ${compositionStats.composed}/${compositionStats.total}`
                  : canBreakdownFromPackage
                    ? '上游成稿已确认'
                    : '等待编剧台成稿'}
            </div>
            <div className="sg3-card__logline">
              {breakingDown && !studioOpen
                ? '后台拆镜进行中 · 点开可查看进度或取消'
                : packageStale
                  ? '成稿已更新，建议重拆'
                  : hasSource && !ready
                    ? '上游设定未就绪（请在编剧台标记设定就绪）'
                    : payload
                      ? '点击打开分镜台 · 镜表与构图'
                      : canBreakdownFromPackage
                        ? '点开台即可从成稿拆镜'
                        : '连接编剧台确认成稿后拆镜'}
            </div>
            <div className="sg3-card__actions">
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  openStudio(payload ? 'grid' : 'breakdown');
                }}
              >
                打开分镜台
              </button>
            </div>
          </div>
        </div>
      </BlockShell>

      <ScreenModal
        open={studioOpen}
        onClose={handleCloseStudio}
        title="分镜台"
        subtitle="拆镜 → 镜表 → 构图确认 → 交导演台"
        width="min(1280px, 100vw - 24px)"
        variant="default"
        className="sg3-modal"
        headerRight={(
          <div className="sg3-header-right">
            {currentEpisodeConfirmed && currentEpisodeId && studioTab === 'handoff' ? (
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={deskBusy}
                onClick={() => {
                  updateNodeData(props.id, {
                    ...stripEpisodeConfirmation(props.data, currentEpisodeId),
                  });
                  appendLog(`已撤回本集确认 · ${visibleEpisodes[0]?.title ?? currentEpisodeId}`);
                }}
              >
                撤回确认
              </button>
            ) : null}
            {studioTab === 'breakdown' ? (
              breakingDown ? (
                <button
                  type="button"
                  className="sg3-btn sg3-btn--primary"
                  onClick={cancelBreakdown}
                >
                  取消同步
                </button>
              ) : upstreamNeedsConfirm ? (
                <button
                  type="button"
                  className="sg3-btn sg3-btn--primary"
                  disabled={deskBusy}
                  onClick={openUpstreamScriptDeskForConfirm}
                  title={`打开上游编剧台「${upstreamPackage?.brief?.title || '未命名'}」`}
                >
                  打开上游编剧台 · 确认成稿
                </button>
              ) : packageStale && canSyncLatest ? (
                <button
                  type="button"
                  className="sg3-btn sg3-btn--primary"
                  disabled={breakingDown || deskBusy}
                  onClick={() => void (
                    incrementalNewEpisodeCount > 0
                      ? breakdownNewEpisodesOnly()
                      : breakdownFromPackage()
                  )}
                >
                  {breakingDown
                    ? '同步中…'
                    : incrementalNewEpisodeCount > 0
                      ? `只拆新增 ${incrementalNewEpisodeCount} 集`
                      : '同步最新成稿'}
                </button>
              ) : (
                <button
                  type="button"
                  className="sg3-btn sg3-btn--primary"
                  disabled={deskBusy || !payload}
                  onClick={() => setStudioTab(payload ? 'grid' : 'breakdown')}
                >
                  {payload ? '去镜表' : '先完成拆镜'}
                </button>
              )
            ) : null}
            {studioTab === 'grid' ? (
              <button
                type="button"
                className="sg3-btn sg3-btn--primary"
                disabled={deskBusy || visibleShots.length === 0}
                onClick={() => setStudioTab('compose')}
              >
                {compositionStats.coverage < 1 ? '去构图补线稿' : '去构图'}
              </button>
            ) : null}
            {studioTab === 'compose' ? (
              compositionStats.coverage < 1 ? (
                <button
                  type="button"
                  className="sg3-btn sg3-btn--primary"
                  disabled={deskBusy || visibleShots.length === 0 || Boolean(batchMode)}
                  onClick={() => void generateBatchLineArt('visible')}
                >
                  {batchMode === 'line-art' ? `批量线稿 ${batchProgress ?? ''}…` : '缺图批量线稿'}
                </button>
              ) : (
                <button
                  type="button"
                  className="sg3-btn sg3-btn--primary"
                  disabled={deskBusy}
                  onClick={() => setStudioTab('handoff')}
                >
                  去交接确认
                </button>
              )
            ) : null}
            {studioTab === 'handoff' && !currentEpisodeConfirmed ? (
              <button
                type="button"
                className="sg3-btn sg3-btn--primary"
                disabled={visibleShots.length === 0 || deskBusy}
                onClick={confirmCurrentEpisode}
                title={
                  packageStale
                    ? '成稿不同步：确认前会再次提示'
                    : undefined
                }
              >
                确认本集
              </button>
            ) : null}
          </div>
        )}
      >
        {/* F-005: 上游设定就绪预检条 */}
        <div className={`sg3-readiness-bar${ready ? ' sg3-readiness-bar--ready' : ''}`}>
          {ready ? (
            <span className="sg3-readiness-bar__ok">设定已就绪 · 可安全拆镜</span>
          ) : readiness ? (
            <span className="sg3-readiness-bar__warn">
              上游设定未就绪
              {(readiness.missingCharacters?.length ?? 0) > 0 && ` · 缺 ${readiness.missingCharacters!.length} 角色`}
              {(readiness.missingScenes?.length ?? 0) > 0 && ` · 缺 ${readiness.missingScenes!.length} 场景`}
              {(readiness.missingCostumes?.length ?? 0) > 0 && ` · 缺 ${readiness.missingCostumes!.length} 服装`}
              {(readiness.missingProps?.length ?? 0) > 0 && ` · 缺 ${readiness.missingProps!.length} 道具`}
              {breakdownBlocked ? ' · 硬模式阻断拆镜' : ' · 软模式仍可拆镜'}
            </span>
          ) : (
            <span className="sg3-readiness-bar__unknown">未检测到上游设定 · 请连接编剧台并确认成稿</span>
          )}
          <button
            type="button"
            className={`sg3-readiness-bar__mode ${preflightMode === 'hard' ? 'is-hard' : 'is-soft'}`}
            onClick={togglePreflightMode}
            title="切换拆镜预检软/硬模式：硬模式在设定未就绪时阻断拆镜"
          >
            {preflightMode === 'hard' ? '预检:硬' : '预检:软'}
          </button>
          {/* F-017: 构图强约束开关 */}
          <button
            type="button"
            className={`sg3-readiness-bar__mode ${enforceComposition ? 'is-on' : 'is-off'}`}
            onClick={toggleEnforceComposition}
            title={enforceComposition ? '构图强约束：开启（无模板阻发出线稿）' : '构图强约束：关闭（无模板仍可出线稿）'}
          >
            {enforceComposition ? '构图约束:开' : '构图约束:关'}
          </button>
        </div>
        {packageStale && upstreamPackage && !staleBannerDismissed ? (
          <StoryboardStaleBanner
            upstreamPackage={upstreamPackage}
            upstreamNeedsConfirm={upstreamNeedsConfirm}
            upstreamTitleShort={upstreamTitleShort}
            incrementalNewEpisodeCount={incrementalNewEpisodeCount}
            deskBusy={deskBusy}
            breakingDown={breakingDown}
            breakdownBlocked={breakdownBlocked}
            confirmedEpisodeIds={confirmedEpisodeIds}
            localPackageHash={breakdownJob?.sourcePackageHash ?? '-'}
            showDiff={staleBannerShowDiff}
            onToggleDiff={() => setStaleBannerShowDiff((v) => !v)}
            onDismiss={() => setStaleBannerDismissed(true)}
            onOpenUpstreamConfirm={openUpstreamScriptDeskForConfirm}
            onBreakdownNewOnly={() => {
              setStaleBannerDismissed(true);
              void breakdownNewEpisodesOnly();
            }}
            onSyncLatest={() => {
              setStaleBannerDismissed(true);
              void breakdownFromPackage();
            }}
            onRebreakAll={() => {
              setStaleBannerDismissed(true);
              void breakdownFromPackage(undefined, true);
            }}
            onRebreakUnconfirmed={() => {
              setStaleBannerDismissed(true);
              void breakdownUnconfirmedOnly();
            }}
          />
        ) : null}
        <div className="sg3-studio">
          <PipelineBar
            studioTab={studioTab}
            setStudioTab={setStudioTab}
            payload={payload}
            hasLineArt={compositionStats.composed > 0}
            coveragePct={Math.round(compositionStats.coverage * 100)}
            currentEpisodeConfirmed={currentEpisodeConfirmed}
            confirmedEpisodeIds={confirmedEpisodeIds}
            activeEpisodeId={activeEpisodeId}
            blockId={props.id}
            updateNodeData={updateNodeData}
            setSelectedId={setSelectedId}
            breakdownBusy={breakdownBusy}
            queueProgress={queueProgress}
          />

          {unconfirmBannerEpisodeId === currentEpisodeId ? (
            <div className="sg3-unconfirm-banner">
              <span className="sg3-unconfirm-banner__msg">
                本集镜表/线稿已变更，确认状态已撤销
              </span>
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                onClick={() => {
                  setUnconfirmBannerEpisodeId(null);
                  setStudioTab('handoff');
                }}
              >
                重新确认
              </button>
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                onClick={() => setUnconfirmBannerEpisodeId(null)}
              >
                稍后
              </button>
            </div>
          ) : null}

          <div className={`sg3-body ${showShotNav ? 'has-nav' : 'is-wide'}`}>
            {showShotNav && (
              <aside className="sg3-nav" aria-label="镜头导航">
                <div className="sg3-nav__filter-block">
                  <div className="sg3-filters">
                  {([
                    ['all', '全部', visibleShots.length],
                    ['uncomposed', '未构图', visibleShots.filter(
                      (s) => !isShotComposed(s, previewPayloadEarly, storyboardUrlMapEarly.get(s.id)),
                    ).length],
                    ['unbound', '未绑定', visibleShots.filter(
                      (s) => !isShotBound(s, characterNameSet, sceneNameSet),
                    ).length],
                  ] as const).map(([id, label, count]) => (
                    <button
                      key={id}
                      type="button"
                      className={shotFilter === id ? 'is-on' : ''}
                      onClick={() => setShotFilter(id)}
                    >
                      {label} ({count})
                    </button>
                  ))}
                  </div>
                </div>
                {!ready && visibleShots.some((s) => !isShotBound(s, characterNameSet, sceneNameSet)) ? (
                  <p className="sg3-nav__bind-hint">
                    设定未就绪时角色/场景无法匹配素材库，故显示未绑定。可先软拆，或回编剧台补设定。
                  </p>
                ) : null}
                <div className="sg3-nav__list">
                  {!payload || filteredShots.length === 0 ? (
                    <div className="sg3-empty">暂无镜头</div>
                  ) : (
                    filteredShots.map((shot) => {
                      const composed = isShotComposed(
                        shot,
                        previewPayloadEarly,
                        storyboardUrlMapEarly.get(shot.id),
                      );
                      const active = selectedId === shot.id || editingShotId === shot.id;
                      return (
                        <button
                          key={shot.id}
                          type="button"
                          className={`sg3-nav__row ${active ? 'is-on' : ''} ${composed ? 'is-composed' : ''}`}
                          onClick={() => {
                            setSelectedId(shot.id);
                            setTimeout(() => {
                              const cell = document.querySelector(`[data-shot-id="${shot.id}"]`);
                              cell?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }, 60);
                          }}
                        >
                          <span className="sg3-nav__dot" />
                          <span className="sg3-nav__code" title={shot.sceneCode || undefined}>
                            #{shot.index}
                            {shot.sceneCode ? ` · ${shot.sceneCode}` : ''}
                          </span>
                          <span className="sg3-nav__title">
                            {compact(shot.title || shot.scene || shot.action || '—', 16)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>
            )}

            <main className="sg3-main">
              {studioTab === 'breakdown' && (
                <BreakdownPanel
                  upstreamPackage={upstreamPackage}
                  packageStale={packageStale}
                  canBreakdownFromPackage={canBreakdownFromPackage}
                  breakdownBlockedReason={breakdownBlockedReason}
                  breakingDown={breakingDown}
                  breakdownProgressText={breakdownProgressText}
                  breakdownElapsedSec={breakdownElapsedSec}
                  cancelBreakdown={cancelBreakdown}
                  breakdownBlocked={breakdownBlocked}
                  deskBusy={deskBusy}
                  handoffHighlight={handoffHighlight}
                  confirmedEpisodeIds={confirmedEpisodeIds}
                  queueState={queueState}
                  queueCurrentTitle={queueCurrentTitle}
                  queueProgress={queueProgress}
                  payload={payload}
                  incrementalText={incrementalText}
                  setIncrementalText={setIncrementalText}
                  incrementalBusy={incrementalBusy}
                  upstream={upstream}
                  diagnostics={diagnostics}
                  setStudioTab={setStudioTab}
                  setSelectedId={setSelectedId}
                  breakdownFromPackage={breakdownFromPackage}
                  breakdownNewEpisodesOnly={breakdownNewEpisodesOnly}
                  breakdownUnconfirmedOnly={breakdownUnconfirmedOnly}
                  missingUpstreamEpisodeCount={incrementalNewEpisodeCount}
                  runIncrementalBreakdown={runIncrementalBreakdown}
                  importLegacyBreakdown={importLegacyBreakdown}
                  handleRetryFailed={handleRetryFailed}
                  handleQueuePause={handleQueuePause}
                  handleQueueResume={handleQueueResume}
                  handleQueueSkip={handleQueueSkip}
                  handleQueueCancel={handleQueueCancel}
                  upstreamNeedsConfirm={upstreamNeedsConfirm}
                  upstreamTitleShort={upstreamTitleShort}
                  openUpstreamScriptDeskForConfirm={openUpstreamScriptDeskForConfirm}
                />
              )}

              {studioTab === 'grid' && (
                <GridPanel
                  blockId={props.id}
                  blockData={props.data}
                  payload={payload}
                  visibleShots={visibleShots}
                  deskBusy={deskBusy}
                  setStudioTab={setStudioTab}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  editingShotId={editingShotId}
                  canUndo={undoDepth > 0}
                  undo={undo}
                  selectedShotIds={selectedShotIds}
                  setSelectedShotIds={setSelectedShotIds}
                  toggleShotChecked={toggleShotChecked}
                  generatingShotId={generatingShotId}
                  batchRunning={batchRunning}
                  storyboardUrlByShotId={storyboardUrlByShotId}
                  updateNodeData={updateNodeData}
                  currentEpisodeId={currentEpisodeId}
                  appendLog={appendLog}
                  pushUndo={pushUndo}
                  setShotFrameUrl={setShotFrameUrl}
                  generateShotLineArt={generateShotLineArt}
                  openEdit={openEdit}
                  handleDeleteShot={handleDeleteShot}
                  handleClearLineArt={handleClearLineArt}
                  handleCopyShot={handleCopyShot}
                  handleCopySelected={handleCopySelected}
                  handleDeleteSelected={handleDeleteSelected}
                  cleanupFramesForShots={cleanupFramesForShots}
                />
              )}

              {studioTab === 'compose' && (
                <ComposePanel
                  blockId={props.id}
                  payload={payload}
                  visibleShots={visibleShots}
                  deskBusy={deskBusy}
                  sheetComposing={sheetComposing}
                  generatingShotId={generatingShotId}
                  batchMode={batchMode}
                  batchProgress={batchProgress}
                  batchRunning={batchRunning}
                  batchScopeMode={batchScopeMode}
                  setBatchScopeMode={setBatchScopeMode}
                  lastBatchFailures={lastBatchFailures}
                  compositionStats={compositionStats}
                  contactSheetUrl={contactSheetUrl}
                  contactSheetStale={contactSheetStale}
                  composeViewTab={composeViewTab}
                  setComposeViewTab={setComposeViewTab}
                  setStudioTab={setStudioTab}
                  connectedPictureGenId={connectedPictureGenId}
                  currentEpisodeShotIds={currentEpisodeShotIds}
                  previewPayloadEarly={previewPayloadEarly}
                  lineArtAbortRef={lineArtAbortRef}
                  generateBatchLineArt={generateBatchLineArt}
                  retryFailedLineArt={retryFailedLineArt}
                  generateBatchGridLineArt={generateBatchGridLineArt}
                  generateStoryboardSheet={generateStoryboardSheet}
                  downloadContactSheet={downloadContactSheet}
                  updatePictureSettings={updatePictureSettings}
                />
              )}

              {studioTab === 'handoff' && (
                <HandoffPanel
                  visibleShots={visibleShots}
                  compositionStats={compositionStats}
                  confirmHardThreshold={confirmHardThreshold}
                  updateNodeData={updateNodeData}
                  blockId={props.id}
                  contactSheetUrl={contactSheetUrl}
                  contactSheetStale={contactSheetStale}
                  currentEpisodeConfirmed={currentEpisodeConfirmed}
                  downloadContactSheet={downloadContactSheet}
                  sheetComposing={sheetComposing}
                  deskBusy={deskBusy}
                  payload={payload}
                  setStudioTab={setStudioTab}
                  setComposeViewTab={setComposeViewTab}
                  confirmCurrentEpisode={confirmCurrentEpisode}
                  openDirectorDesk={openDirectorDesk}
                  exportReviewPackage={exportReviewPackage}
                  generateStoryboardSheet={generateStoryboardSheet}
                />
              )}
            </main>
          </div>

          <div className="sg3-foot" aria-live="polite">
            {/* X-14: 本集总时长与平均镜长（紧凑提示条，主操作在顶栏） */}
            {(() => {
              const totalSec = visibleShots.reduce((sum, s) => sum + (s.durationSec ?? 5), 0);
              const avgSec = visibleShots.length > 0 ? Math.round(totalSec / visibleShots.length) : 0;
              const min = Math.floor(totalSec / 60);
              const sec = totalSec % 60;
              const durStr = min > 0 ? `${min}m${sec}s` : `${sec}s`;
              const unboundCount = visibleShots.filter(
                (s) => !isShotBound(s, characterNameSet, sceneNameSet),
              ).length;
              return (
                <p className="sg3-foot__hint">
                  {visibleEpisodes[0]?.title ?? '本集'}
                  {' · '}
                  {visibleShots.length} 镜 · 总 {durStr} · 均 {avgSec}s
                  {' · '}
                  构图 {Math.round(compositionStats.coverage * 100)}%
                  {unboundCount > 0 ? ` · 未绑定 ${unboundCount}` : ''}
                  {packageStale ? ' · 成稿不同步' : ''}
                  {currentEpisodeConfirmed ? ' · 已确认可交导演台' : ' · 确认后交导演台批出'}
                </p>
              );
            })()}
          </div>
        </div>
        {isDevPromptEnabled() && <StoryboardDeskDevPack blockId={props.id} />}
      </ScreenModal>
      {/* 编辑分镜 — 功能全保留（SB-OL-11 拆至 shot-edit-modal.tsx） */}
      <ShotEditModal
        editingShot={editingShot}
        editDraft={editDraft}
        setEditDraft={setEditDraft}
        onClose={() => setEditingShotId(null)}
        onSave={saveShotEdit}
        scenePresets={scenePresets}
        characterNameSet={characterNameSet}
        characters={characters}
        costumeOptions={costumeOptions}
        propOptions={propOptions}
        shotLexiconOptions={shotLexiconOptions}
        shotLexiconById={shotLexiconById}
        workspaceScenes={workspaceScenes}
        toggleDraftCharacter={toggleDraftCharacter}
      />
    </div>
  );
}
