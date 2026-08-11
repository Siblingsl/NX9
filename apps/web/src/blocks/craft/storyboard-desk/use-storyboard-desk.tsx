import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, ImagePlus, Loader2, Pencil } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  type AssetLibraryKind,
  type BacklotWorkspaceItem,
  type CharacterProfile,
  type EnvironmentProfile,
  buildLineArtShotPrompt,
  buildLineArtPanelGridPrompt,
  LINE_ART_GRID_PAGE_SIZE,
  pickLineArtGridLayout,
  createScriptBreakdownPromptPack,
  parseScriptBreakdownPromptPack,
  DEFAULT_SCRIPT_BREAKDOWN_PROMPTS,
  normalizeScriptBreakdownConfig,
  normalizeScriptBreakdownPrompts,
  screenplayFullText,
  type ScriptBreakdownPromptPack,
  type ScriptBreakdownPromptTemplates,
  buildPictureGenDelegatePatch,
  emptyStoryboardPreview,
  flattenScriptBreakdownShots,
  getEpisodeContactSheet,
  buildLineArtShotPatch,
  patchChainShot,
  chainStoryboardHash,
  lineArtVersionHash,
  readChainStoryboard,
  resolveConnectedPictureGenId,
  resolveStoryboardPreviewPictureSettings,
  type StoryboardPreviewPictureSettings,
  bindStoryboardShotAssets,
  writeBackBreakdownPreviewImage,
  BUILTIN_COMPOSITION_TEMPLATES,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
  type StoryboardPreviewFrame,
  type StoryboardPreviewPayload,
  costumeSourcesFromWorkspace,
  propSourcesFromWorkspace,
  enrichPromptWithShotAssets,
  getSceneCreative,
} from '@nx9/shared';
import { BlockShell } from '../../shared/BlockShell';
import { ScreenModal } from '../../../components/ui/ScreenModal';
import { useActivityLog } from '../../../stores/activity-log';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { isDevPromptEnabled, useDevPromptOverrides } from '../../../stores/dev-prompt-overrides';
import {
  applyScriptBreakdownPayload,
  runProductionScriptBreakdownForEpisodes,
  stableSourceResultEpisodeId,
} from '../../../engine/script-breakdown-runner';
import {
  addShotToBreakdown,
  applyDeskBreakdown,
  buildBreakdownDiagnostics,
  buildEpisodeReadyMeta,
  computeCompositionStats,
  filterShots,
  isShotBound,
  isShotComposed,
  mergeIncrementalBreakdown,
  mergeShotsInBreakdown,
  packageSourceHash,
  removeShotFromBreakdown,
  reorderShotsInBreakdown,
  resolveDeskActiveEpisodeId,
  runBreakdownFromPackage,
  splitShotInBreakdown,
  stripEpisodeConfirmation,
  type ShotListFilter,
  type StoryboardDeskMode,
} from '../../../engine/storyboard-desk-runner';
import { checkAssetReadinessInEdges, runStoryboardPreflight } from '../../../engine/asset-readiness';
import { useToast } from '../../../stores/toast';
import { confirmDelete, askConfirm } from '../../../stores/confirm-dialog';
import { getAllChainShots } from '../../../engine/chain-storyboard-aggregate';
import { AssetMentionInput } from '../../../engine/stage-deck/chrome/asset-mention/AssetMentionInput';
import { StoryboardPreviewWorkspace } from '../../../engine/stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace';
import { ComposerModelSelect } from '../../../engine/stage-deck/chrome/attached-workspace/composer/ComposerModelSelect';
import {
  createEpisodeQueue,
  queueNextEpisode,
  queueMarkSuccess,
  queueMarkError,
  queueSkipEpisode,
  queuePause,
  queueResume,
  queueCancel,
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

import { useUpstreamBreakdown, useUpstreamScreenplay, findUpstreamScriptDeskId, compact, clonePayload, namesToText, textToNames, stripMentionToken, scenePresetName, characterMeta, GLOBAL_MENTION_KINDS, CHARACTER_MENTION_KINDS, SCENE_MENTION_KINDS, patchShotInPayload, createShotEditDraft, shotDialogueLine, SHOT_SIZES, CAMERA_MOVES, type ShotEditDraft, type StudioTab } from './helpers';
import { ShotStoryCell } from './shot-story-cell';
import HandoffPanel from './handoff-panel';
import BreakdownPanel from './breakdown-panel';
import ComposePanel from './compose-panel';
import GridPanel from './grid-panel';
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

  /** S-01: 分镜表草稿自动暂存（sessionStorage，同一浏览器会话内恢复） */
  const draftKey = `nx9-sb-draft-${props.id}`;
  useEffect(() => {
    if (!payload) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(payload));
    } catch { /* ignore quota */ }
  }, [draftKey, payload]);

  /** S-01: 无镜表时尝试从草稿恢复 */
  useEffect(() => {
    if (payload) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as ScriptBreakdownPayload;
      if (!draft?.version) return;
      applyScriptBreakdownPayload(props.id, draft);
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
  /** X-06: 本地撤销栈，仅 mirror scriptBreakdown 结构（不强制恢复确认） */
  const undoStackRef = useRef<ScriptBreakdownPayload[]>([]);
  const pushUndo = useCallback((currentPayload: ScriptBreakdownPayload | undefined) => {
    if (!currentPayload) return;
    const stack = undoStackRef.current;
    stack.push(JSON.parse(JSON.stringify(currentPayload)));
    if (stack.length > 20) stack.shift();
  }, []);
  /** F-016: 多集拆镜队列状态 */
  const [queueState, setQueueState] = useState<EpisodeQueueState>(() => createEpisodeQueue([]));
  const [queueProgress, setQueueProgress] = useState<QueueProgress>(() => ({ total: 0, current: 0, currentId: null, status: 'idle', succeeded: 0, failed: 0, skipped: 0, errorList: [] }));
  const queuePauseRef = useRef<(() => void) | null>(null);
  const queueCancelRef = useRef(false);
  const [queueCurrentTitle, setQueueCurrentTitle] = useState('');
  /** F-016: 队列状态的 mutable ref（runner 通过它读暂停状态） */
  const queueStateRef = useRef(queueState);
  useEffect(() => { queueStateRef.current = queueState; }, [queueState]);
  const deskBusy = batchRunning || sheetComposing || queueState.status === 'running' || generatingShotId !== null || breakingDown || incrementalBusy;
  const breakdownBusy = breakingDown
    || queueState.status === 'running'
    || queueState.status === 'paused';

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0 || deskBusy) return;
    const prev = stack.pop()!;
    applyDeskBreakdown(props.id, prev, updateNodeData, {});
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
      lineArtAbortRef.current?.abort();
      lineArtAbortRef.current = null;
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
  const storyboardUrlMapEarly = useMemo(() => {
    const map = new Map<string, string | undefined>();
    // Q-04 优先级 1: 本节点 storyboardPreview 帧（SSOT）
    for (const frame of previewPayloadEarly?.frames ?? []) {
      if (frame.sourceShotId && frame.imageUrl) {
        map.set(frame.sourceShotId, frame.imageUrl);
      }
    }
    // Q-04 优先级 2: 本节点 chainStoryboard 镜图
    for (const s of storyboardShots) {
      const url = s.lineArtUrl || s.firstFrameAssetId;
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

  const connectedPictureGenId = useMemo(
    () => resolveConnectedPictureGenId(props.id, getNodes(), getEdges()),
    [props.id, getNodes, getEdges],
  );

  const readiness = useMemo(() => {
    try {
      return checkAssetReadinessInEdges(props.id, getNodes() as any, getEdges() as any);
    } catch { return null; }
  }, [props.id, getNodes, getEdges]);
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

  const applyBreakdownPayload = useCallback((source: ScriptBreakdownPayload, logLabel: string, clearConfirm = true) => {
    applyDeskBreakdown(props.id, source, updateNodeData, clearConfirm
      ? { gridConfirmed: false, confirmedEpisodeIds: [] }
      : {});
    const flat = flattenScriptBreakdownShots(source);
    appendLog(`${logLabel} · ${source.episodes.length} 集 / ${flat.length} 镜`);
  }, [appendLog, props.id, updateNodeData]);

  /** 迁移：导入旧镜表（不再作为主路径 CTA） */
  const importLegacyBreakdown = useCallback(async () => {
    if (!upstream) return;
    if (local && flattenScriptBreakdownShots(local).length > 0) {
      const ok = await askConfirm({
        title: '导入旧镜表将覆盖本地镜表',
        description: '建议改为从编剧台成稿重拆。是否继续？',
        confirmLabel: '继续导入',
        tone: 'danger',
      });
      if (!ok) return;
    }
    applyBreakdownPayload(upstream, '已导入旧镜表（迁移路径）');
    setStudioTab('grid');
    setStudioOpen(true);
  }, [applyBreakdownPayload, local, upstream]);

  /** 主路径：从编剧台 confirmed package 拆镜 */
  const breakdownFromPackage = useCallback(async (_episodeIndex?: number, multiEpisode?: boolean) => {
    if (!upstreamPackage) {
      appendLog('分镜台：上游无编剧台成稿包');
      return;
    }
    const gate = runStoryboardPreflight(readiness, preflightMode);
    updateNodeData(props.id, {
      preflight: { mode: preflightMode, lastReport: readiness ?? undefined },
    });
    if (gate.blocking) {
      appendLog(`分镜台：硬预检阻断 · ${gate.reason ?? '设定未就绪'}`);
      useToast.getState().push({
        message: gate.reason ?? '硬模式下设定未就绪，无法拆镜',
        variant: 'error',
      });
      return;
    }
    if (!gate.ok || gate.reason) {
      appendLog(`分镜台：软预检提示 · ${gate.reason ?? '设定未完全就绪'}`);
      useToast.getState().push({
        message: gate.reason ?? '设定未完全就绪（软模式可继续）',
        variant: 'info',
      });
    }
    if (local && flattenScriptBreakdownShots(local).length > 0) {
      const hasConfirmed = confirmedEpisodeIds.length > 0;
      const ok = await askConfirm({
        title: hasConfirmed ? '重拆将清空确认状态并覆盖镜表' : '已有镜表将被覆盖',
        description: hasConfirmed
          ? '本地已有镜表且含已确认集。重拆将清空确认状态并覆盖镜表。是否继续？'
          : '本地已有镜表，从成稿重拆将覆盖。是否继续？',
        confirmLabel: '继续重拆',
        tone: 'danger',
      });
      if (!ok) return;
    }
    breakdownAbortRef.current?.abort();
    const controller = new AbortController();
    breakdownAbortRef.current = controller;
    const epoch = ++breakdownEpochRef.current;
    setBreakingDown(true);
    appendLog('分镜台：开始从成稿同步（AI 拆镜可能需数分钟，进度秒数会跳动）…');
    try {
      // 多集一律走队列，便于看到 0/N → 1/N 推进，避免整包一次请求像卡死
      const useQueue = upstreamPackage.screenplay.episodes.length > 1
        && (multiEpisode !== false);
      if (useQueue) {
        // F-016: 队列化多集拆镜（按集合并，禁止整表覆盖；支持暂停/继续/跳过/取消）
        await runQueueForEpisodes(upstreamPackage.screenplay.episodes, controller.signal, { replaceAll: true });
      } else {
        await runBreakdownFromPackage({
          blockId: props.id,
          pkg: upstreamPackage,
          updateNodeData,
          getLiveBreakdown: () => (
            getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined
          )?.scriptBreakdown as ScriptBreakdownPayload | undefined,
          signal: controller.signal,
        });
        if (epoch === breakdownEpochRef.current) appendLog('从成稿拆镜完成');
      }
      if (epoch === breakdownEpochRef.current && !controller.signal.aborted) {
        useToast.getState().dismiss('sb-breakdown-bg');
        await offerReturnAfterBreakdown('ok');
      }
    } catch (e) {
      if (epoch !== breakdownEpochRef.current) return;
      const aborted = controller.signal.aborted
        || (e instanceof DOMException && e.name === 'AbortError')
        || (e instanceof Error && e.name === 'AbortError');
      if (aborted) {
        appendLog('分镜台：同步已取消');
        useToast.getState().dismiss('sb-breakdown-bg');
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        appendLog(`[SB_BREAKDOWN_FAIL] 从成稿拆镜失败：${msg}`);
        useToast.getState().dismiss('sb-breakdown-bg');
        await offerReturnAfterBreakdown('fail', msg);
      }
    } finally {
      if (breakdownAbortRef.current === controller) breakdownAbortRef.current = null;
      if (epoch === breakdownEpochRef.current) setBreakingDown(false);
    }
  }, [appendLog, confirmedEpisodeIds.length, getNodes, local, offerReturnAfterBreakdown, preflightMode, props.id, readiness, updateNodeData, upstreamPackage]);
  // runQueueForEpisodes 在下方定义；回调执行时取当次闭包，勿写入 deps 以免 TDZ

  /** 增量补拆：按用户指定的文本补拆镜并合并进现有镜表 */
  const runIncrementalBreakdown = useCallback(async () => {
    const text = incrementalText.trim();
    if (!text) { appendLog('分镜台：请输入待补拆的文本'); return; }
    if (!upstreamPackage) { appendLog('分镜台：上游无编剧台成稿包'); return; }
    const gate = runStoryboardPreflight(readiness, preflightMode);
    if (gate.blocking) {
      appendLog(`分镜台：硬预检阻断增量补拆 · ${gate.reason ?? '设定未就绪'}`);
      useToast.getState().push({
        message: gate.reason ?? '硬模式下设定未就绪，无法补拆',
        variant: 'error',
      });
      return;
    }
    if (gate.reason) {
      useToast.getState().push({ message: gate.reason, variant: 'info' });
    }
    setIncrementalBusy(true);
    try {
      const cfg = (props.data as Record<string, unknown>)?.scriptBreakdownConfig as
        import('@nx9/shared').ScriptBreakdownConfig | undefined;
      const pro = (props.data as Record<string, unknown>)?.scriptBreakdownPrompts as
        import('@nx9/shared').ScriptBreakdownPromptTemplates | undefined;
      const result = await api.productionScriptBreakdown({
        sourceText: text,
        config: cfg ? normalizeScriptBreakdownConfig(cfg) : undefined,
        prompts: pro ? normalizeScriptBreakdownPrompts(pro) : undefined,
      });
      if (!result.ok || !result.payload) throw new Error('API 返回异常');
      const incremental = result.payload;
      const existing = payload ?? { version: 1, title: '', sourceText: '', generatedAt: new Date().toISOString(), episodes: [] };
      const merged = mergeIncrementalBreakdown(existing, incremental);
      const existingShotIds = new Set(flattenScriptBreakdownShots(existing).map((s) => s.id));
      const newShots = flattenScriptBreakdownShots(merged).filter((s) => !existingShotIds.has(s.id));
      if (newShots.length === 0) {
        appendLog('增量补拆：未检出可比对的新镜，镜表不变');
        setIncrementalText('');
        setStudioTab('grid');
        return;
      }
      const previewLines = newShots.slice(0, 15).map((s) =>
        `${s.sceneCode || `#${s.index}`} ${s.title || ''}`.trim(),
      ).join('\n');
      const moreHint = newShots.length > 15 ? `\n... 共 ${newShots.length} 镜` : '';
      const ok = await askConfirm({
        title: '增量补拆预览',
        description: `将新增 ${newShots.length} 镜：\n\n${previewLines}${moreHint}\n\n合并前请核对镜号与分期。`,
        confirmLabel: '合并入镜表',
        cancelLabel: '取消',
      });
      if (!ok) { appendLog('增量补拆已取消 · 镜表不变'); return; }
      applyDeskBreakdown(props.id, merged, updateNodeData, stripEpisodeConfirmation(props.data, currentEpisodeId));
      setIncrementalText('');
      appendLog(`增量补拆完成 · 新增 ${newShots.length} 镜合并入镜表`);
      setStudioTab('grid');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendLog(`[SB_BREAKDOWN_FAIL] 增量补拆失败：${msg}`);
    } finally {
      setIncrementalBusy(false);
    }
  }, [appendLog, incrementalText, payload, preflightMode, props.data, props.id, readiness, updateNodeData, upstreamPackage, currentEpisodeId]);

  /** F-016: 从队列状态构造进度快照 */
  const buildProgress = useCallback((qs: EpisodeQueueState): QueueProgress => ({
    total: qs.episodeIds.length,
    current: qs.index,
    currentId: qs.episodeIds[qs.index] ?? null,
    status: qs.status,
    succeeded: Object.values(qs.results).filter(Boolean).length,
    failed: Object.keys(qs.errors).length,
    skipped: qs.skipped.length,
    errorList: Object.entries(qs.errors).map(([episodeId, error]) => ({ episodeId, error })),
  }), []);

  /** F-016: 恢复等待器 ref — 暂停时 runner 挂起于此，恢复时 resolve */
  const queueResumeRef = useRef<(() => void) | null>(null);

  const handleQueuePause = useCallback(() => {
    setQueueState((prev) => { const s = queuePause(prev); setQueueProgress(buildProgress(s)); return s; });
  }, [buildProgress]);

  const handleQueueResume = useCallback(() => {
    setQueueState((prev) => { const s = queueResume(prev); setQueueProgress(buildProgress(s)); return s; });
    queueResumeRef.current?.();
  }, [buildProgress]);

  const handleQueueSkip = useCallback(() => {
    setQueueState((prev) => { const s = queueSkipEpisode(prev); setQueueProgress(buildProgress(s)); return s; });
    queueResumeRef.current?.();
  }, [buildProgress]);

  const handleQueueCancel = useCallback(() => {
    queueCancelRef.current = true;
    breakdownAbortRef.current?.abort();
    setQueueState((prev) => { const s = queueCancel(prev); setQueueProgress(buildProgress(s)); return s; });
    queueResumeRef.current?.();
  }, [buildProgress]);

  const cancelBreakdown = useCallback(() => {
    if (!breakingDown && queueState.status !== 'running' && queueState.status !== 'paused') return;
    breakdownEpochRef.current += 1;
    appendLog('分镜台：正在取消同步…');
    handleQueueCancel();
    breakdownAbortRef.current?.abort();
    breakdownAbortRef.current = null;
    setBreakingDown(false);
    useToast.getState().dismiss('sb-breakdown-bg');
    updateNodeData(props.id, {
      status: 'idle',
      breakdownProgress: null,
      breakdownJob: {
        phase: 'cancelled',
        error: '用户取消',
      },
    });
  }, [appendLog, breakingDown, handleQueueCancel, props.id, queueState.status, updateNodeData]);

  /** F-016: 运行队列化拆镜（按集合并写入，禁止整表覆盖；支持暂停/继续/跳过/取消） */
  const runQueueForEpisodes = useCallback(async (
    episodes: Array<{ id: string; title: string; index?: number; bodyMd?: string }>,
    signal?: AbortSignal,
    opts?: { replaceAll?: boolean },
  ) => {
    const episodeIds = episodes.map((ep) => ep.id);
    const initQs = createEpisodeQueue(episodeIds);
    initQs.status = 'running';
    setQueueState(initQs);
    setQueueProgress(buildProgress(initQs));
    queueCancelRef.current = false;

    const fullHash = upstreamPackage ? packageSourceHash(upstreamPackage) : '';
    const fullSourceText = upstreamPackage ? screenplayFullText(upstreamPackage) : '';
    const cfg = (props.data as Record<string, unknown>)?.scriptBreakdownConfig as
      import('@nx9/shared').ScriptBreakdownConfig | undefined;
    const pro = (props.data as Record<string, unknown>)?.scriptBreakdownPrompts as
      import('@nx9/shared').ScriptBreakdownPromptTemplates | undefined;

    // 全量重拆：清空旧镜表，避免与按集 stable id 合并后残留幽灵集
    if (opts?.replaceAll) {
      updateNodeData(props.id, {
        scriptBreakdown: {
          version: 1,
          title: upstreamPackage?.brief?.title || '',
          sourceText: fullSourceText,
          generatedAt: new Date().toISOString(),
          episodes: [],
        } satisfies ScriptBreakdownPayload,
        confirmedEpisodeIds: [],
        gridConfirmed: false,
      });
    }

    let idx = 0;
    while (idx < episodes.length) {
      if (queueCancelRef.current || signal?.aborted) {
        const cancelled = queueCancel(initQs);
        setQueueState(cancelled);
        setQueueProgress(buildProgress(cancelled));
        appendLog('分镜台 · 拆镜队列已取消');
        break;
      }

      // 检查暂停 — 读 ref 获取最新状态
      if (queueStateRef.current.status === 'paused') {
        setQueueProgress(buildProgress(queueStateRef.current));
        await new Promise<void>((resolve) => { queueResumeRef.current = resolve; });
        queueResumeRef.current = null;
        continue;
      }

      const ep = episodes[idx];
      const episodeData = upstreamPackage?.screenplay?.episodes?.find((e) => e.id === ep.id);
      const listIndex = Math.max(0, (episodeData?.index ?? ep.index ?? idx + 1) - 1);
      const epTitle = (episodeData?.title || ep.title || `第${listIndex + 1}集`).trim();
      const body = (episodeData?.bodyMd ?? ep.bodyMd ?? '').trim();
      setQueueCurrentTitle(epTitle);

      const progress: QueueProgress = {
        total: episodes.length,
        current: idx,
        currentId: ep.id,
        status: 'running',
        succeeded: Object.values(initQs.results).filter(Boolean).length,
        failed: Object.keys(initQs.errors).length,
        skipped: initQs.skipped.length,
        errorList: Object.entries(initQs.errors).map(([eid, error]) => ({ episodeId: eid, error })),
      };
      setQueueProgress(progress);

      appendLog(`分镜台 · 拆镜第 ${idx + 1}/${episodes.length} 集：${epTitle}`);
      updateNodeData(props.id, {
        content: `拆镜中 ${idx + 1}/${episodes.length}…`,
        breakdownProgress: `正在拆第 ${idx + 1}/${episodes.length} 集「${epTitle}」（AI 调用中）…`,
      });

      if (!body) {
        initQs.errors[ep.id] = '该集正文为空';
        initQs.results[ep.id] = false;
        appendLog(`[SB_BREAKDOWN_FAIL] 分镜台 · 第 ${idx + 1} 集拆镜失败：该集正文为空`);
        idx++;
        initQs.index = idx;
        if (idx >= episodes.length) initQs.status = 'done';
        const snap = { ...initQs };
        setQueueState(snap);
        setQueueProgress(buildProgress(snap));
        continue;
      }

      try {
        const live = (
          getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined
        )?.scriptBreakdown as ScriptBreakdownPayload | undefined;
        // 去掉本集旧结果（含 AI 自建 id / 旧 stable id），再合并写入
        const replaceId = stableSourceResultEpisodeId(ep.id);
        const existingPayload = live
          ? {
            ...live,
            episodes: (live.episodes ?? []).filter((e) => (
              e.id !== replaceId
              && e.id !== ep.id
              && (e.index ?? -1) !== listIndex + 1
            )),
          }
          : undefined;

        const merged = await runProductionScriptBreakdownForEpisodes({
          blockId: props.id,
          episodes: [{
            id: ep.id,
            title: epTitle,
            text: body,
            listIndex,
          }],
          fullSourceText,
          existingPayload,
          config: cfg ? normalizeScriptBreakdownConfig(cfg) : undefined,
          prompts: pro ? normalizeScriptBreakdownPrompts(pro) : undefined,
          signal,
        });

        if (signal?.aborted || queueCancelRef.current) {
          initQs.results[ep.id] = false;
          break;
        }

        applyDeskBreakdown(props.id, merged, updateNodeData, {
          breakdownJob: {
            phase: idx + 1 >= episodes.length ? 'done' : 'running',
            sourcePackageId: upstreamPackage?.brief?.title || 'package',
            // 必须用完整成稿包 hash，否则逐集拆完会误报「成稿不同步」
            sourcePackageHash: fullHash,
            startedAt: new Date().toISOString(),
          },
          gridConfirmed: false,
        });
        initQs.results[ep.id] = true;
      } catch (e) {
        const aborted = signal?.aborted
          || (e instanceof DOMException && e.name === 'AbortError')
          || (e instanceof Error && e.name === 'AbortError');
        if (aborted || queueCancelRef.current) {
          appendLog(`分镜台 · 第 ${idx + 1} 集拆镜已取消`);
          break;
        }
        const msg = e instanceof Error ? e.message : String(e);
        initQs.errors[ep.id] = msg;
        initQs.results[ep.id] = false;
        appendLog(`[SB_BREAKDOWN_FAIL] 分镜台 · 第 ${idx + 1} 集拆镜失败：${msg}`);
      }

      idx++;
      initQs.index = idx;

      if (idx >= episodes.length) {
        initQs.status = 'done';
      }

      const snap = { ...initQs };
      setQueueState(snap);
      setQueueProgress(buildProgress(snap));
    }

    if (signal?.aborted || queueCancelRef.current) {
      const cancelled = queueCancel(initQs);
      setQueueState(cancelled);
      setQueueProgress(buildProgress(cancelled));
    }

    const finalQ = queueStateRef.current;
    const final: QueueProgress = {
      total: episodes.length,
      current: finalQ.index,
      currentId: null,
      status: finalQ.status,
      succeeded: Object.values(finalQ.results).filter(Boolean).length,
      failed: Object.keys(finalQ.errors).length,
      skipped: finalQ.skipped.length,
      errorList: Object.entries(finalQ.errors).map(([eid, error]) => ({ episodeId: eid, error })),
    };
    setQueueProgress(final);
    appendLog(`分镜台 · 队列完成 · 成功 ${final.succeeded} · 失败 ${final.failed} · 跳过 ${final.skipped}`);
    setQueueCurrentTitle('');
  }, [props.id, props.data, upstreamPackage, updateNodeData, getNodes, appendLog, buildProgress]);

  /** B-05: 重试失败集 */
  const handleRetryFailed = useCallback(() => {
    const failedIds = Object.keys(queueState.errors);
    if (!failedIds.length || !upstreamPackage) return;
    const failedEps = upstreamPackage.screenplay.episodes.filter((ep) => failedIds.includes(ep.id));
    if (!failedEps.length) return;
    void runQueueForEpisodes(failedEps);
  }, [queueState.errors, upstreamPackage, runQueueForEpisodes]);

  /** 只拆上游新增集，保留已有镜表（不 replaceAll）；本地空台请走从成稿拆镜 */
  const breakdownNewEpisodesOnly = useCallback(async () => {
    if (!upstreamPackage) { appendLog('分镜台：上游无编剧台成稿包'); return; }
    if (!hasLocalBreakdownEpisodes) {
      appendLog('分镜台：本地尚无镜表，改走从成稿拆镜');
      await breakdownFromPackage();
      return;
    }
    const newEps = missingUpstreamEpisodes;
    if (newEps.length === 0) {
      appendLog('分镜台：没有新增集可拆（若旧集正文有变，请用「仅重拆未确认」或「全量重拆」）');
      useToast.getState().push({
        message: '没有新增集。旧集有改动时请用「仅重拆未确认」或「全量重拆」',
        variant: 'info',
      });
      return;
    }
    const gate = runStoryboardPreflight(readiness, preflightMode);
    updateNodeData(props.id, {
      preflight: { mode: preflightMode, lastReport: readiness ?? undefined },
    });
    if (gate.blocking) {
      appendLog(`分镜台：硬预检阻断 · ${gate.reason ?? '设定未就绪'}`);
      useToast.getState().push({
        message: gate.reason ?? '硬模式下设定未就绪，无法拆镜',
        variant: 'error',
      });
      return;
    }
    if (!gate.ok || gate.reason) {
      useToast.getState().push({
        message: gate.reason ?? '设定未完全就绪（软模式可继续）',
        variant: 'info',
      });
    }
    const titles = newEps.map((ep) => ep.title || `第${ep.index}集`).join('、');
    const ok = await askConfirm({
      title: `只拆新增 ${newEps.length} 集`,
      description: `将拆：${titles}。已有镜表（第 1…集）会保留，不会覆盖。`,
      confirmLabel: '开始拆新增',
    });
    if (!ok) return;
    breakdownAbortRef.current?.abort();
    const controller = new AbortController();
    breakdownAbortRef.current = controller;
    const epoch = ++breakdownEpochRef.current;
    setBreakingDown(true);
    appendLog(`分镜台：只拆新增 ${newEps.length} 集（保留已有镜表）…`);
    try {
      await runQueueForEpisodes(newEps, controller.signal);
      if (epoch === breakdownEpochRef.current && !controller.signal.aborted) {
        appendLog(`只拆新增集完成 · ${newEps.length} 集`);
        useToast.getState().dismiss('sb-breakdown-bg');
        await offerReturnAfterBreakdown('ok');
      }
    } catch (e) {
      if (epoch !== breakdownEpochRef.current) return;
      const aborted = controller.signal.aborted
        || (e instanceof DOMException && e.name === 'AbortError')
        || (e instanceof Error && e.name === 'AbortError');
      if (aborted) {
        appendLog('分镜台：拆新增集已取消');
        useToast.getState().dismiss('sb-breakdown-bg');
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        appendLog(`[SB_BREAKDOWN_FAIL] 拆新增集失败：${msg}`);
        useToast.getState().dismiss('sb-breakdown-bg');
        await offerReturnAfterBreakdown('fail', msg);
      }
    } finally {
      if (breakdownAbortRef.current === controller) breakdownAbortRef.current = null;
      if (epoch === breakdownEpochRef.current) setBreakingDown(false);
    }
  }, [
    appendLog,
    breakdownFromPackage,
    hasLocalBreakdownEpisodes,
    missingUpstreamEpisodes,
    offerReturnAfterBreakdown,
    preflightMode,
    props.id,
    readiness,
    runQueueForEpisodes,
    updateNodeData,
    upstreamPackage,
  ]);

  /** B-04: 仅重拆未确认的集 */
  const breakdownUnconfirmedOnly = useCallback(async () => {
    if (!upstreamPackage) { appendLog('分镜台：上游无编剧台成稿包'); return; }
    const unconfirmedEps = upstreamPackage.screenplay.episodes.filter(
      (ep) => !confirmedEpisodeIds.includes(ep.id),
    );
    if (unconfirmedEps.length === 0) {
      appendLog('所有集均已确认，无需重拆');
      useToast.getState().push({ message: '所有集均已确认，无需重拆', variant: 'info' });
      return;
    }
    const ok = await askConfirm({
      title: '仅重拆未确认集',
      description: `将对 ${unconfirmedEps.length} 个未确认集重新拆镜（已确认 ${confirmedEpisodeIds.length} 集将保留）。是否继续？`,
      confirmLabel: '开始重拆',
      tone: 'danger',
    });
    if (!ok) return;
    breakdownAbortRef.current?.abort();
    const controller = new AbortController();
    breakdownAbortRef.current = controller;
    const epoch = ++breakdownEpochRef.current;
    setBreakingDown(true);
    appendLog(`分镜台：开始仅重拆未确认集（${unconfirmedEps.length}）…`);
    try {
      await runQueueForEpisodes(unconfirmedEps, controller.signal);
      if (epoch === breakdownEpochRef.current && !controller.signal.aborted) {
        appendLog('仅重拆未确认集完成');
        useToast.getState().dismiss('sb-breakdown-bg');
        await offerReturnAfterBreakdown('ok');
      }
    } catch (e) {
      if (epoch !== breakdownEpochRef.current) return;
      const aborted = controller.signal.aborted
        || (e instanceof DOMException && e.name === 'AbortError')
        || (e instanceof Error && e.name === 'AbortError');
      if (aborted) {
        appendLog('分镜台：重拆未确认集已取消');
        useToast.getState().dismiss('sb-breakdown-bg');
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        appendLog(`[SB_BREAKDOWN_FAIL] 重拆未确认集失败：${msg}`);
        useToast.getState().dismiss('sb-breakdown-bg');
        await offerReturnAfterBreakdown('fail', msg);
      }
    } finally {
      if (breakdownAbortRef.current === controller) breakdownAbortRef.current = null;
      if (epoch === breakdownEpochRef.current) setBreakingDown(false);
    }
  }, [appendLog, confirmedEpisodeIds, offerReturnAfterBreakdown, upstreamPackage, runQueueForEpisodes]);

  const confirmCurrentEpisode = useCallback(async () => {
    if (!currentEpisodeId || visibleShots.length === 0) return;
    if (deskBusy) return;

    if (packageStale) {
      const ok = await askConfirm({
        title: '上游成稿已更新',
        description: '当前镜表与上游成稿不同步。建议先重拆本集，再确认交接。仍要按现状确认？',
        confirmLabel: '仍要确认',
        cancelLabel: '取消',
      });
      if (!ok) return;
    }

    const preview = props.data?.storyboardPreview as StoryboardPreviewPayload | undefined;
    const urlMap = new Map<string, string | undefined>();
    // Q-04 优先级 1: 本节点 storyboardPreview 帧（SSOT）
    for (const frame of preview?.frames ?? []) {
      if (frame.sourceShotId && frame.imageUrl) {
        urlMap.set(frame.sourceShotId, frame.imageUrl);
      }
    }
    // Q-04 优先级 2: chainStoryboard 镜图
    for (const s of getAllChainShots(getNodes())) {
      const url = s.lineArtUrl || s.firstFrameAssetId;
      if (url && !urlMap.get(s.id)) urlMap.set(s.id, url);
    }
    const sceneNameSet = new Set([
      ...environments.map((e) => e.name.trim()),
      ...workspaceScenes.map((i) => i.label.trim()),
    ].filter(Boolean));
    const stats = computeCompositionStats(
      visibleShots,
      preview,
      urlMap,
      characterNameSet,
      sceneNameSet,
    );
    const unboundShots = visibleShots.filter(
      (s) => !isShotBound(s, characterNameSet, sceneNameSet),
    );
    if (unboundShots.length > 0) {
      const unboundList = unboundShots
        .slice(0, 12)
        .map((s) => s.sceneCode || `#${s.index}`)
        .join(', ');
      const more = unboundShots.length > 12 ? ` 等 ${unboundShots.length} 镜` : '';
      const ok = await askConfirm({
        title: '仍有未绑定镜头',
        description: !ready
          ? `上游设定未就绪，${unboundShots.length} 镜的角色/场景无法匹配素材库（${unboundList}${more}）。建议先在编剧台标记设定就绪，或在编辑里修正 @角色/@场景。仍要确认？`
          : `${unboundShots.length} 镜未绑定角色或场景：${unboundList}${more}\n建议先在镜表编辑里补齐。仍要确认？`,
        confirmLabel: '仍要确认',
        cancelLabel: '去处理',
      });
      if (!ok) {
        setShotFilter('unbound');
        setStudioTab('grid');
        return;
      }
    }
    const missingShots = visibleShots.filter(
      (s) => !isShotComposed(s, preview, urlMap.get(s.id)),
    );
    if (stats.coverage < 0.6 && missingShots.length > 0) {
      if (confirmHardThreshold) {
        const missingList = missingShots.map((s) => s.sceneCode || `#${s.index}`).join(', ');
        useToast.getState().push({
          message: `硬阈值：构图覆盖 ${Math.round(stats.coverage * 100)}% 未达标（≥60%）· 缺图: ${missingList}`,
          variant: 'error',
        });
        return;
      }
      const missingList = missingShots.map((s) => s.sceneCode || `#${s.index}`).join(', ');
      const ok = await askConfirm({
        title: '确认检查',
        description: `镜头数: ${visibleShots.length}\n构图覆盖: ${Math.round(stats.coverage * 100)}%（建议 ≥ 60%）\n缺图: ${missingList}\n\n仍要确认本集？`,
        confirmLabel: '仍要确认',
        cancelLabel: '取消',
      });
      if (!ok) return;
    }
    const readyMeta = buildEpisodeReadyMeta({
      deskId: props.id,
      episodeId: currentEpisodeId,
      shotCount: visibleShots.length,
      compositionCoverage: stats.coverage,
    });
    updateNodeData(props.id, {
      status: 'success',
      gridConfirmed: true,
      confirmedEpisodeIds: [...new Set([...confirmedEpisodeIds, currentEpisodeId])],
      confirmedAt: new Date().toISOString(),
      meta: readyMeta,
      episodeReadyMeta: readyMeta,
    });
    setUnconfirmBannerEpisodeId(null);
    appendLog(
      `本集已确认可交导演台 · ${visibleEpisodes[0]?.title ?? currentEpisodeId} / ${visibleShots.length} 镜 · 构图 ${Math.round(stats.coverage * 100)}%`,
    );
    setStudioTab('handoff');
  }, [
    appendLog,
    characterNameSet,
    confirmHardThreshold,
    confirmedEpisodeIds,
    currentEpisodeId,
    deskBusy,
    environments,
    packageStale,
    props.data?.storyboardPreview,
    props.id,
    ready,
    updateNodeData,
    visibleEpisodes,
    visibleShots,
    workspaceScenes,
    getNodes,
  ]);

  const openDirectorDesk = useCallback(() => {
    const nodes = getAllNodes?.() ?? getNodes();
    const desk = nodes.find((n) => (n.type ?? '') === 'director-desk');
    const preview = props.data?.storyboardPreview as StoryboardPreviewPayload | undefined;
    const lineArtFrames = (preview?.frames ?? [])
      .filter((f) => f.sourceShotId && f.imageUrl && currentEpisodeShotIds?.has(f.sourceShotId))
      .map((f) => ({ shotId: f.sourceShotId!, imageUrl: f.imageUrl! }));
    const chain = readChainStoryboard(props.data as Record<string, unknown>);
    const scriptHash = upstreamPackage ? packageSourceHash(upstreamPackage) : '';
    const storyboardHash = chain ? chainStoryboardHash(chain) : '';
    const lineartVersion = chain ? lineArtVersionHash(chain, currentEpisodeId) : '';
    const handoffVersion = Number(props.data?.handoffVersion ?? 0) + 1;
    const handoff = {
      sourceStoryboardBlockId: props.id,
      scriptHash,
      storyboardHash,
      lineartVersion,
      handoffVersion,
      confirmedAt: props.data?.confirmedAt as string | undefined,
      episodeId: currentEpisodeId,
      episodeTitle: visibleEpisodes[0]?.title ?? undefined,
      shotCount: visibleShots.length,
      compositionCoverage: compositionStats.coverage,
      confirmed: currentEpisodeConfirmed,
      confirmedEpisodeIds: confirmedEpisodeIds.slice(),
      lineArtFrameCount: lineArtFrames.length,
      lineArtFrameIds: visibleShots.map((s) => s.id),
      lineArtFrames,
      at: new Date().toISOString(),
    };
    updateNodeData(props.id, { handoffVersion });
    if (desk && focusBlock) {
      updateNodeData(desk.id, {
        lastHandoff: {
          from: 'storyboard-desk',
          to: 'director-desk',
          fromId: props.id,
          ...handoff,
        },
      });
      focusBlock(desk.id);
      appendLog('已聚焦导演台 · 交接数据已同步');
      return;
    }
    useFlowCommands.getState().requestSpawn('director-desk', undefined, {
      connectToSource: props.id,
      handoff: {
        from: 'storyboard-desk',
        to: 'director-desk',
        fromId: props.id,
        at: handoff.at,
        sourceStoryboardBlockId: props.id,
        scriptHash,
        storyboardHash,
        lineartVersion,
        handoffVersion,
        confirmedAt: handoff.confirmedAt,
        episodeId: currentEpisodeId,
        episodeTitle: handoff.episodeTitle,
        shotCount: handoff.shotCount,
        compositionCoverage: handoff.compositionCoverage,
        confirmed: handoff.confirmed,
        confirmedEpisodeIds: handoff.confirmedEpisodeIds,
        lineArtFrameCount: handoff.lineArtFrameCount,
        lineArtFrameIds: handoff.lineArtFrameIds,
        lineArtFrames: handoff.lineArtFrames,
      },
    });
    appendLog('已创建导演台并连线 · 交接数据已推送');
  }, [appendLog, focusBlock, getAllNodes, getNodes, props.data, props.id, currentEpisodeId, currentEpisodeConfirmed, confirmedEpisodeIds, visibleEpisodes, visibleShots, compositionStats, updateNodeData, currentEpisodeShotIds, upstreamPackage]);

  const saveShotEdit = useCallback(() => {
    if (!payload || !editingShot || !editDraft) return;
    const dialogueText = editDraft.dialogueText.trim();
    const dialogueSpeaker = editDraft.dialogueSpeaker.trim();
    const dialogue = dialogueText
      ? [{
          speaker: dialogueSpeaker || editingShot.dialogue?.[0]?.speaker || editDraft.characters[0] || '旁白',
          text: dialogueText,
          emotion: editingShot.dialogue?.[0]?.emotion,
        }]
      : editingShot.dialogue;
    const notesRaw = Array.isArray(editDraft.continuityNotes)
      ? editDraft.continuityNotes
      : String(editDraft.continuityNotes ?? '')
          .split(/[；;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    const next = patchShotInPayload(payload, editingShot.id, {
      title: editDraft.title,
      durationSec: Math.max(1, Math.round(Number(editDraft.durationSec) || editingShot.durationSec || 5)),
      scene: stripMentionToken(editDraft.scene),
      characters: editDraft.characters,
      purpose: editDraft.purpose,
      scriptText: editDraft.scriptText,
      imagePrompt: editDraft.imagePrompt,
      videoPrompt: editDraft.videoPrompt,
      sketchPrompt: editDraft.sketchPrompt?.trim() || undefined,
      shotSize: editDraft.shotSize,
      cameraMove: editDraft.cameraMove,
      cameraAngle: editDraft.cameraAngle,
      cameraLens: editDraft.cameraLens,
      visual: editDraft.visual,
      action: editDraft.action,
      narration: editDraft.narration,
      sound: editDraft.sound,
      audiovisualLanguage: editDraft.audiovisualLanguage,
      negativePrompt: editDraft.negativePrompt,
      compositionTemplateId: editDraft.compositionTemplateId ?? null,
      continuityNotes: notesRaw,
      dialogue,
      costumeOverrides: (editDraft.costumeOverrides ?? [])
        .filter((o) => o.characterName?.trim() && o.costumeId?.trim())
        .map((o) => ({
          characterName: o.characterName.trim(),
          costumeId: o.costumeId,
          costumeLabel: o.costumeLabel,
        })),
      propIds: [...(editDraft.propIds ?? [])],
    });
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    setEditingShotId(null);
    appendLog(`已修改分镜 · ${editingShot.sceneCode} ${editDraft.title}`);
  }, [appendLog, editDraft, editingShot, payload, props.id, updateNodeData]);

  const toggleDraftCharacter = useCallback((name: string) => {
    setEditDraft((current) => {
      if (!current) return current;
      const exists = current.characters.some((item) => item.trim() === name);
      return {
        ...current,
        characters: exists
          ? current.characters.filter((item) => item.trim() !== name)
          : [...current.characters, name],
      };
    });
  }, []);

  const openStudio = useCallback((tab: StudioTab = 'grid') => {
    // 无镜表时默认进拆镜 Tab；H-04：handoff 指定时优先
    const next = studioBreakdownDefault
      ? 'breakdown'
      : !payload && (tab === 'grid' || tab === 'compose') ? 'breakdown' : tab;
    setStudioTab(next);
    setStudioOpen(true);
  }, [payload, studioBreakdownDefault]);

  /** 打开连线上游编剧台并请求展开（确认成稿后再回分镜同步） */
  const openUpstreamScriptDeskForConfirm = useCallback(() => {
    const nodes = getAllNodes?.() ?? getNodes();
    const edges = getEdges();
    const scriptDeskId = findUpstreamScriptDeskId(props.id, nodes, edges);
    if (!scriptDeskId) {
      appendLog('分镜台：未找到连线上游编剧台');
      return;
    }
    const title = upstreamPackage?.brief?.title?.trim() || '上游成稿';
    updateNodeData(scriptDeskId, {
      openStudioRequest: {
        at: new Date().toISOString(),
        reason: 'confirm-for-breakdown',
        fromId: props.id,
        title,
      },
    });
    setStudioOpen(false);
    focusBlock?.(scriptDeskId);
    appendLog(`已打开上游编剧台 · ${title} · 请确认成稿后回分镜台同步`);
  }, [appendLog, focusBlock, getAllNodes, getEdges, getNodes, props.id, updateNodeData, upstreamPackage?.brief?.title]);

  const upstreamNeedsConfirm = Boolean(
    upstreamPackage && upstreamPackage.status !== 'confirmed',
  );
  const canSyncLatest = Boolean(canBreakdownFromPackage && !breakdownBlocked && !deskBusy);
  const upstreamTitleShort = compact(upstreamPackage?.brief?.title?.trim() || '上游成稿', 12);

  const openEdit = useCallback((shotId: string) => {
    setSelectedId(shotId);
    setEditingShotId(shotId);
  }, []);

  const storyboardUrlByShotId = useMemo(() => {
    const map = new Map<string, string>();
    // Q-04 优先级 1: 本节点 storyboardPreview 帧（SSOT）
    for (const frame of previewPayloadEarly?.frames ?? []) {
      if (frame.sourceShotId && frame.imageUrl) {
        map.set(frame.sourceShotId, frame.imageUrl);
      }
    }
    // Q-04 优先级 2: 本节点 chainStoryboard 镜图
    for (const s of storyboardShots) {
      const url = s.lineArtUrl || s.firstFrameAssetId;
      if (url && !map.has(s.id)) map.set(s.id, url);
    }
    return map;
  }, [previewPayloadEarly, storyboardShots]);

  /** 写入画面 URL：拆分结构 + 故事板 + 预览帧（优先读节点最新 payload，避免批量写回被旧闭包覆盖） */
  const setShotFrameUrl = useCallback(
    (shotId: string, imageUrl: string) => {
      const livePayload = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.scriptBreakdown as ScriptBreakdownPayload | undefined;
      const base = livePayload ?? payload;
      if (!base) return;
      const nextBreakdown = writeBackBreakdownPreviewImage(base, shotId, imageUrl)
        ?? patchShotInPayload(base, shotId, {
          previewImageUrl: imageUrl,
          referenceImageUrl: imageUrl,
          status: 'previewing',
        });
      applyScriptBreakdownPayload(props.id, nextBreakdown);

      // 同步 storyboardPreview.frames + chainStoryboard（镜表 SSOT）
      updateNodeData(props.id, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        // 节点 data 可能仍滞后于刚 apply 的拆分；以 nextBreakdown 为准
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
        return {
            ...data,
            scriptBreakdown: nextBreakdown,
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
    [getNodes, payload, props.id, updateNodeData],
  );

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
        ? `确认删除 ${shot.sceneCode} ${shot.title || ''}？删除后不可恢复。`
        : '确认删除此镜头？删除后不可恢复。',
    });
    if (!ok) return;
    pushUndo(payload);
    const next = removeShotFromBreakdown(payload, shotId);
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    if (selectedId === shotId) setSelectedId(null);
    if (editingShotId === shotId) setEditingShotId(null);
    appendLog(`已删除镜 · ${shot?.sceneCode || shotId}`);
  }, [appendLog, currentEpisodeId, editingShotId, payload, pushUndo, props.data, props.id, selectedId, updateNodeData]);

  /** X-17: 清除本镜线稿，清空 previewImageUrl/referenceImageUrl */
  const handleClearLineArt = useCallback(async (shotId: string) => {
    if (!payload) return;
    const ok = await confirmDelete({
      title: '清除本镜线稿？',
      description: '将清空该镜头已生成的线稿图，可重新生成。',
    });
    if (!ok) return;
    const next = patchShotInPayload(payload, shotId, {
      previewImageUrl: '',
      referenceImageUrl: '',
    });
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    appendLog(`已清除线稿 · ${shotId}`);
  }, [appendLog, currentEpisodeId, payload, props.data, props.id, updateNodeData]);

  /** G-03: 复制当前选中镜 */
  const handleCopyShot = useCallback((shotId: string) => {
    if (!payload || !currentEpisodeId) return;
    const episode = payload.episodes.find((ep) => ep.id === currentEpisodeId);
    if (!episode) return;
    const idx = episode.shots.findIndex((s) => s.id === shotId);
    if (idx < 0) return;
    const source = episode.shots[idx]!;
    const copyId = `${shotId}-copy-${Date.now()}`;
    const copy: typeof source = { ...source, id: copyId, sceneCode: '' };
    const newShots = [...episode.shots];
    newShots.splice(idx + 1, 0, copy);
    newShots.forEach((s, i) => { s.index = i + 1; });
    const next: ScriptBreakdownPayload = {
      ...payload,
      episodes: payload.episodes.map((ep) => ep.id === currentEpisodeId ? { ...ep, shots: newShots } : ep),
    };
    pushUndo(payload);
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    appendLog(`已复制镜 · ${source.sceneCode || `#${source.index}`} → ${copyId}`);
  }, [appendLog, currentEpisodeId, payload, props.data, props.id, pushUndo, updateNodeData]);

  /** G-03: 批量复制选中镜 */
  const handleCopySelected = useCallback(() => {
    if (!payload || !currentEpisodeId || selectedShotIds.size === 0) return;
    const episode = payload.episodes.find((ep) => ep.id === currentEpisodeId);
    if (!episode) return;
    const sorted = [...selectedShotIds].sort((a, b) => {
      const ia = episode.shots.findIndex((s) => s.id === a);
      const ib = episode.shots.findIndex((s) => s.id === b);
      return ia - ib;
    });
    const newShots = [...episode.shots];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const source = episode.shots.find((s) => s.id === sorted[i]);
      if (!source) continue;
      const idx = newShots.findIndex((s) => s.id === sorted[i]);
      if (idx < 0) continue;
      const copyId = `${source.id}-copy-${Date.now()}-${i}`;
      const copy: typeof source = { ...source, id: copyId, sceneCode: '' };
      newShots.splice(idx + 1, 0, copy);
    }
    newShots.forEach((s, i) => { s.index = i + 1; });
    const next: ScriptBreakdownPayload = {
      ...payload,
      episodes: payload.episodes.map((ep) => ep.id === currentEpisodeId ? { ...ep, shots: newShots } : ep),
    };
    pushUndo(payload);
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    setSelectedShotIds(new Set());
    appendLog(`已批量复制 · ${sorted.length} 镜`);
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
    const ok = await confirmDelete({ title: `删除 ${selectedShotIds.size} 镜？`, description: '此操作不可撤销。', confirmLabel: '确认删除' });
    if (!ok) return;
    const newShots = episode.shots.filter((s) => !selectedShotIds.has(s.id));
    newShots.forEach((s, i) => { s.index = i + 1; });
    const next: ScriptBreakdownPayload = {
      ...payload,
      episodes: payload.episodes.map((ep) => ep.id === currentEpisodeId ? { ...ep, shots: newShots } : ep),
    };
    pushUndo(payload);
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
    });
    setSelectedShotIds(new Set());
    if (selectedId && selectedShotIds.has(selectedId)) setSelectedId(newShots[0]?.id ?? null);
    appendLog(`已批量删除 · ${selectedShotIds.size} 镜`);
  }, [appendLog, currentEpisodeId, payload, props.data, props.id, pushUndo, selectedId, selectedShotIds, updateNodeData]);

  const referenceBoardData = useMemo(() => {
    // Find connected reference-board nodes
    const boardNodes = getNodes().filter((n) => n.type === 'reference-board');
    const incoming = getEdges().filter((e) => e.target === props.id);
    const relevant: Array<{ styleNotes?: string; palette?: string[] }> = [];
    for (const edge of incoming) {
      const src = boardNodes.find((n) => n.id === edge.source);
      if (!src) continue;
      const d = src.data as Record<string, unknown> | undefined;
      relevant.push({
        styleNotes: d?.styleNotes as string | undefined,
        palette: d?.palette as string[] | undefined,
      });
    }
    return relevant;
  }, [getNodes, getEdges, props.id]);

  const resolveSketchPrompt = useCallback((shot: ScriptBreakdownShot) => {
    const raw = shot.sketchPrompt?.trim();
    if (raw) return raw;
    const refParts: string[] = [];
    for (const rb of referenceBoardData) {
      if (rb.styleNotes?.trim()) refParts.push(`style: ${rb.styleNotes.trim()}`);
      if (rb.palette?.length) refParts.push(`palette: ${rb.palette.join(', ')}`);
    }
    return buildLineArtShotPrompt(
      [
        shot.scriptText || shot.visual || shot.title,
        shot.scene ? `location: ${shot.scene}` : '',
        shot.shotSize ? `${shot.shotSize} shot` : '',
        shot.cameraMove ? `camera: ${shot.cameraMove}` : '',
        shot.cameraAngle ? `angle: ${shot.cameraAngle}` : '',
        (shot.characters?.length ? `characters: ${shot.characters.join(', ')}` : ''),
        ...refParts,
      ].filter(Boolean).join('\n'),
      shot.shotSize,
    );
  }, [referenceBoardData]);

  const generateShotLineArt = useCallback(
    async (shot: ScriptBreakdownShot) => {
      if (batchRunning) {
        appendLog('分镜台：批量任务进行中，请稍候再单镜生成线稿');
        return;
      }
      if (generatingShotId !== null) {
        useToast.getState().push({ message: '已有单镜线稿生成中，请稍候', variant: 'info' });
        return;
      }
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (!pictureId) {
        appendLog('分镜台：请先用顶部能力口连接「图像生成」节点后再生成线稿');
        return;
      }
      const pictureNode = getNodes().find((n) => n.id === pictureId);
      if (!pictureNode) return;

      setGeneratingShotId(shot.id);
      const baseSketch = resolveSketchPrompt(shot);
      const sketchPrompt = enrichPromptWithShotAssets(
        baseSketch,
        shot,
        characters,
        costumeOptions,
        propOptions,
      );
      const frame: StoryboardPreviewFrame = {
        id: `frame-line-${shot.id}`,
        order: 1,
        label: `${shot.sceneCode || `Shot${shot.index}`} · 线稿`,
        startSec: 0,
        endSec: Math.max(1, shot.durationSec || 5),
        sourceShotId: shot.id,
        promptSummary: sketchPrompt,
        characterNames: shot.characters,
        sceneAssetRef: shot.scene,
        referenceImageUrl: null,
        status: 'generating',
        locked: false,
        stylePreset: 'line-art',
      };
      try {
        const nodeData = (getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>;
        const previewRaw = nodeData.storyboardPreview as StoryboardPreviewPayload | undefined;
        const pictureSettings = resolveStoryboardPreviewPictureSettings(previewRaw);
        const imageUrl = await generateStoryboardFrameImage(
          frame,
          (pictureNode.data ?? {}) as Record<string, unknown>,
          pictureSettings,
        );
        if (!payload) {
          setShotFrameUrl(shot.id, imageUrl);
        } else {
          const withSketch = patchShotInPayload(payload, shot.id, {
            sketchPrompt,
            previewImageUrl: imageUrl,
            referenceImageUrl: imageUrl,
            status: 'previewing',
          });
          const nextBreakdown = writeBackBreakdownPreviewImage(withSketch, shot.id, imageUrl) ?? withSketch;
          applyScriptBreakdownPayload(props.id, nextBreakdown);
          updateNodeData(props.id, (node) => {
            const data = (node.data ?? {}) as Record<string, unknown>;
            const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
            const current = raw?.version === 1 && Array.isArray(raw.frames)
              ? { ...emptyStoryboardPreview(), ...raw, pictureSettings: resolveStoryboardPreviewPictureSettings(raw) }
              : emptyStoryboardPreview();
            let frames = [...current.frames];
            const idx = frames.findIndex((f) => f.sourceShotId === shot.id || f.id === `frame-line-${shot.id}` || f.id === shot.id);
            const framePatch = {
              imageUrl,
              status: 'success' as const,
              errorMessage: null,
              promptSummary: sketchPrompt,
              stylePreset: 'line-art',
            };
            if (idx >= 0) {
              frames = frames.map((f, i) => (i === idx ? { ...f, ...framePatch } : f));
            } else {
              frames = [
                ...frames,
                {
                  id: `frame-line-${shot.id}`,
                  order: frames.length + 1,
                  label: `${shot.sceneCode || `Shot${shot.index}`} · 线稿`,
                  startSec: 0,
                  endSec: Math.max(1, shot.durationSec || 5),
                  sourceShotId: shot.id,
                  promptSummary: sketchPrompt,
                  characterNames: shot.characters,
                  sceneAssetRef: shot.scene,
                  referenceImageUrl: null,
                  imageUrl,
                  status: 'success' as const,
                  locked: false,
                  stylePreset: 'line-art',
                },
              ];
            }
            return {
                ...data,
                scriptBreakdown: nextBreakdown,
                storyboardPreview: { ...current, frames, confirmed: false },
                ...stripEpisodeConfirmation(data, currentEpisodeId),
                previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
              };
          });
        }
        appendLog(`分镜线稿已生成 · ${shot.sceneCode || shot.id}`);
        toastSuccess(`已生成 ${shot.sceneCode || '分镜'} 线稿`);
      } catch (e) {
        appendLog(`[SB_LINEART_FAIL] 分镜线稿生成失败: ${String(e)}`);
      } finally {
        setGeneratingShotId(null);
      }
    },
    [appendLog, batchRunning, characters, costumeOptions, getEdges, getNodes, payload, propOptions, props.id, resolveSketchPrompt, setShotFrameUrl, updateNodeData],
  );

  /** X-12: 键盘快捷键 · ↑↓ 选镜，E 编辑，L 线稿，Del 删镜 */
  useEffect(() => {
    if (!studioOpen || studioTab !== 'grid') return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (!filteredShots.length) return;
      if (!e.key) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filteredShots.findIndex((s) => s.id === selectedId);
        const nextIdx = e.key === 'ArrowDown'
          ? (idx + 1) % filteredShots.length
          : idx <= 0 ? filteredShots.length - 1 : idx - 1;
        const nextShot = filteredShots[nextIdx];
        if (nextShot) {
          setSelectedId(nextShot.id);
          setTimeout(() => {
            document.querySelector(`[data-shot-id="${nextShot.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 60);
        }
        return;
      }
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        if (selectedId) openEdit(selectedId);
        return;
      }
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        if (selectedId) {
          const shot = filteredShots.find((s) => s.id === selectedId);
          if (shot) void generateShotLineArt(shot);
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !deskBusy && selectedId) {
        e.preventDefault();
        void handleDeleteShot(selectedId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [studioOpen, studioTab, filteredShots, selectedId, deskBusy, openEdit, generateShotLineArt, handleDeleteShot]);

  const generateBatchLineArt = useCallback(
    async (scope: 'visible' | 'all' = 'visible') => {
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (!pictureId) {
        appendLog('分镜台：批量线稿前请先连接「图像生成」节点');
        return;
      }
      const pictureNode = getNodes().find((n) => n.id === pictureId);
      if (!pictureNode) return;

      lineArtAbortRef.current?.abort();
      const controller = new AbortController();
      lineArtAbortRef.current = controller;
      const { signal } = controller;

      let targetShots = (scope === 'visible' ? visibleShots : shots).filter(Boolean);
      if (targetShots.length === 0) {
        appendLog('分镜台：当前没有可生成线稿的镜头');
        lineArtAbortRef.current = null;
        return;
      }

      const onlyMissing = batchScopeMode === 'missing';
      if (onlyMissing) {
        const preview = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.storyboardPreview as StoryboardPreviewPayload | undefined;
        targetShots = targetShots.filter((s) => !isShotComposed(s, preview));
      }
      if (targetShots.length === 0) {
        appendLog('分镜台：当前没有需要补线稿的镜头');
        lineArtAbortRef.current = null;
        setBatchMode(null);
        return;
      }

      const modeLabel = onlyMissing ? '缺图优先' : '全部覆盖';
      setBatchMode('line-art');
      setBatchProgress(`0/${targetShots.length}`);
      appendLog(`开始批量线稿 · ${targetShots.length} 镜（${scope === 'visible' ? '当前可见' : '全部'} · ${modeLabel}）`);

      let ok = 0;
      let fail = 0;
      const failures: string[] = [];
      for (let i = 0; i < targetShots.length; i++) {
        if (signal.aborted) break;
        const shot = targetShots[i];
        setBatchProgress(`${i + 1}/${targetShots.length}`);
        setGeneratingShotId(shot.id);
        try {
          const livePayload = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.scriptBreakdown as ScriptBreakdownPayload | undefined;
          const liveShot = flattenScriptBreakdownShots(livePayload).find((s) => s.id === shot.id) ?? shot;
          const sketchPrompt = enrichPromptWithShotAssets(
            resolveSketchPrompt(liveShot),
            liveShot,
            characters,
            costumeOptions,
            propOptions,
          );
          const frame: StoryboardPreviewFrame = {
            id: `frame-line-${liveShot.id}`,
            order: i + 1,
            label: `${liveShot.sceneCode || `Shot${liveShot.index}`} · 线稿`,
            startSec: 0,
            endSec: Math.max(1, liveShot.durationSec || 5),
            sourceShotId: liveShot.id,
            promptSummary: sketchPrompt,
            characterNames: liveShot.characters,
            sceneAssetRef: liveShot.scene,
            referenceImageUrl: null,
            status: 'generating',
            locked: false,
            stylePreset: 'line-art',
          };
          const nodeData = (getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>;
          const previewRaw = nodeData.storyboardPreview as StoryboardPreviewPayload | undefined;
          const pictureSettings = resolveStoryboardPreviewPictureSettings(previewRaw);
          const imageUrl = await generateStoryboardFrameImage(
            frame,
            (pictureNode.data ?? {}) as Record<string, unknown>,
            pictureSettings,
            true,
            signal,
          );

          const base = livePayload ?? payload;
          if (!base) {
            setShotFrameUrl(liveShot.id, imageUrl);
          } else {
            const withSketch = patchShotInPayload(base, liveShot.id, {
              sketchPrompt,
              previewImageUrl: imageUrl,
              referenceImageUrl: imageUrl,
              status: 'previewing',
            });
            const nextBreakdown = writeBackBreakdownPreviewImage(withSketch, liveShot.id, imageUrl) ?? withSketch;
            applyScriptBreakdownPayload(props.id, nextBreakdown);
            updateNodeData(props.id, (node) => {
              const data = (node.data ?? {}) as Record<string, unknown>;
              const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
              const current = raw?.version === 1 && Array.isArray(raw.frames)
                ? { ...emptyStoryboardPreview(), ...raw, pictureSettings: resolveStoryboardPreviewPictureSettings(raw) }
                : emptyStoryboardPreview();
              let frames = [...current.frames];
              const idx = frames.findIndex((f) => f.sourceShotId === liveShot.id || f.id === `frame-line-${liveShot.id}` || f.id === liveShot.id);
              const framePatch = {
                imageUrl,
                status: 'success' as const,
                errorMessage: null,
                promptSummary: sketchPrompt,
                stylePreset: 'line-art',
              };
              if (idx >= 0) {
                frames = frames.map((f, fi) => (fi === idx ? { ...f, ...framePatch } : f));
              } else {
                frames = [
                  ...frames,
                  {
                    id: `frame-line-${liveShot.id}`,
                    order: frames.length + 1,
                    label: `${liveShot.sceneCode || `Shot${liveShot.index}`} · 线稿`,
                    startSec: 0,
                    endSec: Math.max(1, liveShot.durationSec || 5),
                    sourceShotId: liveShot.id,
                    promptSummary: sketchPrompt,
                    characterNames: liveShot.characters,
                    sceneAssetRef: liveShot.scene,
                    referenceImageUrl: null,
                    imageUrl,
                    status: 'success' as const,
                    locked: false,
                    stylePreset: 'line-art',
                  },
                ];
              }
              return {
                  ...data,
                  scriptBreakdown: nextBreakdown,
                  storyboardPreview: { ...current, frames, confirmed: false },
                  ...stripEpisodeConfirmation(data, currentEpisodeId),
                  previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
                };
            });
          }
          ok += 1;
        } catch (e) {
          fail += 1;
          failures.push(shot.id);
          appendLog(`[SB_LINEART_FAIL] 批量线稿失败 · ${shot.sceneCode || shot.id}: ${String(e)}`);
        }
      }

      setGeneratingShotId(null);
      setBatchMode(null);
      setBatchProgress(null);
      lineArtAbortRef.current = null;
      setLastBatchFailures(failures);
      const aborted = signal.aborted;
      appendLog(`批量线稿${aborted ? '已停止' : '完成'} · 成功 ${ok} · 失败 ${fail}`);
      if (ok > 0) toastSuccess(`批量线稿完成 ${ok}/${targetShots.length}`);
    },
    [
      appendLog,
      batchScopeMode,
      characters,
      costumeOptions,
      getEdges,
      getNodes,
      payload,
      propOptions,
      props.id,
      resolveSketchPrompt,
      setShotFrameUrl,
      shots,
      updateNodeData,
      visibleShots,
    ],
  );

  const retryFailedLineArt = useCallback(async () => {
    if (lastBatchFailures.length === 0) return;
    const prevMode = batchScopeMode;
    setBatchScopeMode('all');
    await generateBatchLineArt('visible');
    setBatchScopeMode(prevMode);
    setLastBatchFailures([]);
  }, [lastBatchFailures, batchScopeMode, generateBatchLineArt]);

  /** 宫格线稿：多镜提示词合成一张图 → grid-split → 按顺序回填（省出图次数） */
  const generateBatchGridLineArt = useCallback(
    async (scope: 'visible' | 'all' = 'visible') => {
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (!pictureId) {
        appendLog('分镜台：宫格线稿前请先连接「图像生成」节点');
        return;
      }
      const pictureNode = getNodes().find((n) => n.id === pictureId);
      if (!pictureNode) return;

      lineArtAbortRef.current?.abort();
      const controller = new AbortController();
      lineArtAbortRef.current = controller;
      const { signal } = controller;

      const targetShots = (scope === 'visible' ? visibleShots : shots).filter(Boolean);
      if (targetShots.length === 0) {
        appendLog('分镜台：当前没有可生成线稿的镜头');
        lineArtAbortRef.current = null;
        return;
      }

      // 固定四宫格（2×2）：每页最多 4 镜；不足 4 镜时空格白板，布局不变形
      const pageSize = LINE_ART_GRID_PAGE_SIZE;
      const { rows, cols } = pickLineArtGridLayout(pageSize);
      const pageCount = Math.ceil(targetShots.length / pageSize);
      setBatchMode('grid-line-art');
      setBatchProgress(`0/${pageCount}`);
      appendLog(
        `开始宫格线稿 · ${targetShots.length} 镜 · ${pageCount} 张四宫格（${scope === 'visible' ? '当前可见' : '全部'}）`,
      );

      let ok = 0;
      let fail = 0;
      const pictureData = (pictureNode.data ?? {}) as Record<string, unknown>;

      for (let page = 0; page < pageCount; page++) {
        if (signal.aborted) break;
        const chunk = targetShots.slice(page * pageSize, page * pageSize + pageSize);
        setBatchProgress(`${page + 1}/${pageCount}`);
        setGeneratingShotId(chunk[0]?.id ?? null);

        try {
          const livePayload = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)
            ?.scriptBreakdown as ScriptBreakdownPayload | undefined;
          const liveMap = new Map(flattenScriptBreakdownShots(livePayload).map((s) => [s.id, s]));

          const panels = chunk.map((shot) => {
            const liveShot = liveMap.get(shot.id) ?? shot;
            const sketchPrompt = enrichPromptWithShotAssets(
              resolveSketchPrompt(liveShot),
              liveShot,
              characters,
              costumeOptions,
              propOptions,
            );
            return {
              shot: liveShot,
              sketchPrompt,
              label: liveShot.sceneCode || `Shot${liveShot.index}`,
              prompt: sketchPrompt,
            };
          });

          // 始终按 2×2 构图；chunk < 4 时 prompt 空格白板，切分仍按四格
          const gridPrompt = buildLineArtPanelGridPrompt(
            panels.map((p) => ({ label: p.label, prompt: p.prompt })),
            rows,
            cols,
          );
          const nodeData = (getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>;
          const previewRaw = nodeData.storyboardPreview as StoryboardPreviewPayload | undefined;
          const pictureSettings = resolveStoryboardPreviewPictureSettings(previewRaw);
          // 宫格出横屏：跟随工具条画幅；若为方图/竖图则回落 16:9，2×2 等分后每格仍为横屏
          const settingsResolved = resolvePictureGenSettings(pictureData, pictureSettings);
          const [bw, bh] = settingsResolved.size.split('x').map((n) => Number(n) || 0);
          const { modelId, size } = bw > bh
            ? settingsResolved
            : resolvePictureGenSettings(pictureData, { ...pictureSettings, aspectRatio: '16:9' });

          const blankSlots = pageSize - chunk.length;
          appendLog(
            `宫格出图中 · 第 ${page + 1}/${pageCount} 张 · 2×2 · ${size} · ${chunk.length} 镜`
              + (blankSlots > 0 ? ` · 白板补 ${blankSlots} 格` : ''),
          );
          const urls = await runPictureGenJob({
            prompt: gridPrompt,
            modelId,
            size,
            n: 1,
          });
          const gridUrl = urls[0];
          if (!gridUrl) throw new Error('宫格线稿未返回图片');

           const split = await api.gridSplit({ sourceUrl: gridUrl, rows, cols }, { signal });
          if (!split.urls?.length) throw new Error('宫格切分未返回图片');

          // 每页开始前重读节点，并用已有预览帧图补齐缺 previewImageUrl 的镜
          // （避免上一页写回尚未进入闭包 / 被旧 payload 覆盖）
          const freshNode = (getNodes().find((n) => n.id === props.id)?.data
            ?? {}) as Record<string, unknown>;
          const freshBreakdown = (freshNode.scriptBreakdown as ScriptBreakdownPayload | undefined)
            ?? livePayload
            ?? payload;
          const existingFrames = (freshNode.storyboardPreview as StoryboardPreviewPayload | undefined)?.frames ?? [];
          let nextBreakdown = freshBreakdown;
          if (nextBreakdown) {
            for (const frame of existingFrames) {
              if (!frame.sourceShotId || !frame.imageUrl) continue;
              const existing = flattenScriptBreakdownShots(nextBreakdown).find((s) => s.id === frame.sourceShotId);
              if (existing?.previewImageUrl) continue;
              nextBreakdown = writeBackBreakdownPreviewImage(nextBreakdown, frame.sourceShotId, frame.imageUrl)
                ?? patchShotInPayload(nextBreakdown, frame.sourceShotId, {
                  previewImageUrl: frame.imageUrl,
                  referenceImageUrl: frame.imageUrl,
                  status: 'previewing',
                });
            }
          }
          const framePatches: Array<{
            shot: ScriptBreakdownShot;
            sketchPrompt: string;
            imageUrl: string;
          }> = [];

          for (let i = 0; i < panels.length; i++) {
            const imageUrl = split.urls[i];
            if (!imageUrl) {
              fail += 1;
              appendLog(`宫格线稿缺格 · ${panels[i].label}`);
              continue;
            }
            const { shot: liveShot, sketchPrompt } = panels[i];
            framePatches.push({ shot: liveShot, sketchPrompt, imageUrl });
            if (!nextBreakdown) {
              setShotFrameUrl(liveShot.id, imageUrl);
              ok += 1;
              continue;
            }
            const withSketch = patchShotInPayload(nextBreakdown, liveShot.id, {
              sketchPrompt,
              previewImageUrl: imageUrl,
              referenceImageUrl: imageUrl,
              status: 'previewing',
            });
            nextBreakdown = writeBackBreakdownPreviewImage(withSketch, liveShot.id, imageUrl) ?? withSketch;
            ok += 1;
          }

          if (nextBreakdown && framePatches.length > 0) {
            applyScriptBreakdownPayload(props.id, nextBreakdown);
            const applied = nextBreakdown;
            updateNodeData(props.id, (node) => {
              const data = (node.data ?? {}) as Record<string, unknown>;
              const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
              const current = raw?.version === 1 && Array.isArray(raw.frames)
                ? { ...emptyStoryboardPreview(), ...raw, pictureSettings: resolveStoryboardPreviewPictureSettings(raw) }
                : emptyStoryboardPreview();
              let frames = [...current.frames];
              for (const patch of framePatches) {
                const idx = frames.findIndex(
                  (f) =>
                    f.sourceShotId === patch.shot.id
                    || f.id === `frame-line-${patch.shot.id}`
                    || f.id === `spf-${patch.shot.id}`
                    || f.id === patch.shot.id,
                );
                const framePatch = {
                  imageUrl: patch.imageUrl,
                  status: 'success' as const,
                  errorMessage: null,
                  promptSummary: patch.sketchPrompt,
                  stylePreset: 'line-art',
                };
                if (idx >= 0) {
                  frames = frames.map((f, fi) => (fi === idx ? { ...f, ...framePatch } : f));
                } else {
                  frames = [
                    ...frames,
                    {
                      id: `spf-${patch.shot.id}`,
                      order: frames.length + 1,
                      label: `${patch.shot.sceneCode || `Shot${patch.shot.index}`} · 线稿`,
                      startSec: 0,
                      endSec: Math.max(1, patch.shot.durationSec || 5),
                      sourceShotId: patch.shot.id,
                      promptSummary: patch.sketchPrompt,
                      characterNames: patch.shot.characters,
                      sceneAssetRef: patch.shot.scene,
                      referenceImageUrl: null,
                      imageUrl: patch.imageUrl,
                      status: 'success' as const,
                      locked: false,
                      stylePreset: 'line-art',
                    },
                  ];
                }
              }
              let chain = readChainStoryboard(data);
              if (chain) {
                let chainShots = chain.shots;
                for (const patch of framePatches) {
                  chainShots = patchChainShot(
                    { ...chain, shots: chainShots },
                    patch.shot.id,
                    buildLineArtShotPatch(patch.imageUrl, patch.sketchPrompt),
                  );
                }
                chain = { ...chain, shots: chainShots };
              }
              return {
                ...data,
                ...(chain ? { chainStoryboard: chain } : {}),
                scriptBreakdown: applied,
                storyboardPreview: { ...current, frames, confirmed: false },
                ...stripEpisodeConfirmation(data, currentEpisodeId),
                previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
              };
            });
          }

          appendLog(`宫格线稿已回填 · 第 ${page + 1}/${pageCount} 张 · ${framePatches.length} 镜`);
        } catch (e) {
          fail += chunk.length;
          appendLog(`[SB_LINEART_FAIL] 宫格线稿失败 · 第 ${page + 1}/${pageCount} 张: ${String(e)}`);
        }
      }

      setGeneratingShotId(null);
      setBatchMode(null);
      setBatchProgress(null);
      lineArtAbortRef.current = null;
      const aborted = signal.aborted;
      appendLog(`宫格线稿${aborted ? '已停止' : '完成'} · 成功 ${ok} · 失败 ${fail}`);
      if (ok > 0) toastSuccess(`宫格线稿完成 ${ok}/${targetShots.length}`);
    },
    [
      appendLog,
      characters,
      costumeOptions,
      getEdges,
      getNodes,
      payload,
      propOptions,
      props.id,
      resolveSketchPrompt,
      setShotFrameUrl,
      shots,
      updateNodeData,
      visibleShots,
    ],
  );

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

  /** X-13: 导出审片包（CSV + Markdown + 故事板PNG） */
  const exportReviewPackage = useCallback(async () => {
    if (!payload || visibleShots.length === 0) {
      appendLog('暂无镜表可导出');
      return;
    }
    const epTitle = visibleEpisodes[0]?.title ?? currentEpisodeId ?? '分镜';
    const header = [
      '镜号', '标题', '景别', '运镜', '角度', '镜头', '对白', '时长(s)', '角色', '场景',
    ];
    const rows = visibleShots.map((s) => [
      s.sceneCode || `S${s.index}`,
      s.title || '',
      s.shotSize || '',
      s.cameraMove || '',
      s.cameraAngle || '',
      s.cameraLens || '',
      s.dialogue?.map((d) => `${d.speaker ?? ''}:${d.text}`).join('; ') || '',
      String(s.durationSec ?? 5),
      (s.characters ?? []).join('; '),
      s.scene || '',
    ]);
    const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
    const md = [
      `# ${epTitle} 分镜审片包`,
      '',
      `- 镜数: ${visibleShots.length}`,
      `- 总时长: ${(() => { const t = visibleShots.reduce((s, shot) => s + (shot.durationSec ?? 5), 0); const m = Math.floor(t / 60); const sec = t % 60; return m > 0 ? `${m}m${sec}s` : `${sec}s`; })()}`,
      `- 构图覆盖: ${Math.round(compositionStats.coverage * 100)}%`,
      contactSheetUrl ? `- 故事板大图: ${contactSheetUrl}` : '',
      '',
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...rows.map((r) => `| ${r.join(' | ')} |`),
    ].join('\n');
    const csvBlob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const mdBlob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const safeTitle = epTitle.replace(/[/:*?"<>|]/g, '-').slice(0, 40);
    const url1 = URL.createObjectURL(csvBlob);
    const a1 = document.createElement('a'); a1.href = url1; a1.download = `${safeTitle}-镜表.csv`; a1.click();
    URL.revokeObjectURL(url1);
    const url2 = URL.createObjectURL(mdBlob);
    const a2 = document.createElement('a'); a2.href = url2; a2.download = `${safeTitle}-审片.md`; a2.click();
    URL.revokeObjectURL(url2);
    if (contactSheetUrl) {
      try {
        const pngResp = await fetch(contactSheetUrl);
        if (pngResp.ok) {
          const pngBlob = await pngResp.blob();
          const pngUrl = URL.createObjectURL(pngBlob);
          const a3 = document.createElement('a'); a3.href = pngUrl; a3.download = `${safeTitle}-故事板.png`; a3.click();
          URL.revokeObjectURL(pngUrl);
        }
      } catch { /* CORS/ext failure: skip PNG, CSV+MD still exported */ }
    }
    appendLog(`审片包已导出 · ${safeTitle}-镜表.csv + ${safeTitle}-审片.md${contactSheetUrl ? ' + 故事板.png' : ''}`);
    if (!contactSheetUrl) appendLog('尚无故事板大图 · 可先生成后再导出');
  }, [appendLog, compositionStats.coverage, contactSheetUrl, currentEpisodeId, payload, visibleEpisodes, visibleShots]);

  const generateStoryboardSheet = useCallback(
    async (force = false) => {
      if (!payload || visibleShots.length === 0) {
        appendLog('分镜台：没有可合成的镜头');
        return;
      }
      if (sheetComposing || batchRunning) return;

      const livePreview = ((getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>)
        .storyboardPreview as StoryboardPreviewPayload | undefined;
       // Q-04: workspaceShotById 只认当前节点 chain 数据。
       const wsById = new Map(storyboardShots.map((s) => [s.id, s]));
      const cells = deskSheetCellsFromBreakdownShots(visibleShots, {
        preview: livePreview ?? previewPayload,
        storyboardUrlByShotId,
        workspaceShotById: wsById,
      });
      const withImage = cells.filter((c) => c.imageUrl?.trim()).length;
      if (withImage === 0) {
        appendLog('分镜台：请先生成线稿或上传分镜图，再合成故事板大图');
        return;
      }

      const signature = buildDeskContactSheetSignature(cells);
      const { url: existingUrl, signature: existingSig } = getEpisodeContactSheet(livePreview ?? previewPayload, currentEpisodeId);
      if (
        !force
        && existingUrl
        && existingSig === signature
      ) {
        toastSuccess('故事板大图已是最新');
        return;
      }

      setSheetComposing(true);
      try {
        const epTitle = visibleEpisodes[0]?.title || payload.title || '本集';
        const blob = await composeStoryboardSheetPng(cells, {
          title: `${epTitle} · 分镜故事板`,
          subtitle: `${cells.length} 镜 · 线稿构图 ${withImage}/${cells.length} · NX9 分镜台`,
        });
        const file = new File(
          [blob],
          `storyboard-sheet-${Date.now()}.png`,
          { type: 'image/png' },
        );
        const uploaded = await api.uploadAsset(file);
        updateNodeData(props.id, (node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
          const current = raw?.version === 1 && Array.isArray(raw.frames)
            ? {
                ...emptyStoryboardPreview(),
                ...raw,
                pictureSettings: resolveStoryboardPreviewPictureSettings(raw),
              }
            : emptyStoryboardPreview();
          return {
            ...data,
            storyboardPreview: {
              ...current,
              contactSheetUrl: uploaded.url,
              contactSheetSignature: signature,
              contactSheetsByEpisode: {
                ...(current.contactSheetsByEpisode ?? {}),
                [currentEpisodeId ?? '']: {
                  url: uploaded.url,
                  signature,
                  updatedAt: new Date().toISOString(),
                },
              },
            },
          };
        });
        appendLog(`分镜故事板大图已生成 · ${withImage}/${cells.length} 格有图`);
        toastSuccess(`故事板大图已生成 · ${withImage} 格`);
        setComposeViewTab('sheet');
      } catch (e) {
        appendLog(`[SB_SHEET_FAIL] 分镜故事板大图失败: ${String(e)}`);
      } finally {
        setSheetComposing(false);
      }
    },
    [
      appendLog,
      batchRunning,
      getNodes,
      payload,
      previewPayload,
      props.id,
      sheetComposing,
      storyboardShots,
      storyboardUrlByShotId,
      updateNodeData,
      visibleEpisodes,
      visibleShots,
    ],
  );

  const downloadContactSheet = useCallback(() => {
    if (!contactSheetUrl) return;
    const a = document.createElement('a');
    a.href = contactSheetUrl;
    a.download = `storyboard-sheet-${Date.now()}.png`;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
  }, [contactSheetUrl]);

  const updatePictureSettings = useCallback(
    (patch: Partial<StoryboardPreviewPictureSettings>) => {
      let nextSettings: StoryboardPreviewPictureSettings | undefined;
      updateNodeData(props.id, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
        const current = raw?.version === 1 && Array.isArray(raw.frames)
          ? {
              ...emptyStoryboardPreview(),
              ...raw,
              pictureSettings: resolveStoryboardPreviewPictureSettings(raw),
            }
          : emptyStoryboardPreview();
        const pictureSettings = { ...current.pictureSettings, ...patch };
        nextSettings = pictureSettings;
        return {
          ...data,
          storyboardPreview: { ...current, pictureSettings },
        };
      });
      if (!nextSettings) return;
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (pictureId) {
        updateNodeData(pictureId, buildPictureGenDelegatePatch(nextSettings));
      }
    },
    [getEdges, getNodes, props.id, updateNodeData],
  );

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
          <div className="sg3-stale-banner">
            <span className="sg3-stale-banner__icon">&#x26A0;&#xFE0F;</span>
            <span className="sg3-stale-banner__msg">
              {upstreamNeedsConfirm
                ? `上游「${upstreamTitleShort}」已更新，但尚未确认成稿 · 先确认再同步`
                : incrementalNewEpisodeCount > 0
                  ? `上游新增 ${incrementalNewEpisodeCount} 集（可只拆新增，保留现有 1…集镜表）`
                  : '上游成稿已更新（与当前镜表不同步）'}
            </span>
            <div className="sg3-stale-banner__acts">
              <button type="button" className="sg3-btn sg3-btn--ghost" onClick={() => setStaleBannerShowDiff((v) => !v)}>
                {staleBannerShowDiff ? '收起差异' : '查看差异摘要'}
              </button>
              {upstreamNeedsConfirm ? (
                <button
                  type="button"
                  className="sg3-btn sg3-btn--primary"
                  disabled={deskBusy}
                  onClick={openUpstreamScriptDeskForConfirm}
                >
                  打开上游编剧台 · 确认成稿
                </button>
              ) : (
                <>
                  {incrementalNewEpisodeCount > 0 ? (
                    <button type="button" className="sg3-btn sg3-btn--primary" disabled={breakingDown || breakdownBlocked || deskBusy} onClick={() => {
                      setStaleBannerDismissed(true);
                      void breakdownNewEpisodesOnly();
                    }}>
                      只拆新增 {incrementalNewEpisodeCount} 集
                    </button>
                  ) : (
                    <button type="button" className="sg3-btn sg3-btn--ghost" disabled={breakingDown || breakdownBlocked || deskBusy} onClick={() => {
                      setStaleBannerDismissed(true);
                      void breakdownFromPackage();
                    }}>
                      同步最新成稿
                    </button>
                  )}
                  {upstreamPackage.screenplay.episodes.length > 1 ? (
                    <>
                      <button type="button" className="sg3-btn sg3-btn--ghost" disabled={breakingDown || breakdownBlocked || deskBusy} onClick={() => {
                        setStaleBannerDismissed(true);
                        void breakdownFromPackage(undefined, true);
                      }}>
                        重拆全部
                      </button>
                      {upstreamPackage.screenplay.episodes.some((ep) => !confirmedEpisodeIds.includes(ep.id)) ? (
                        <button type="button" className="sg3-btn sg3-btn--ghost" disabled={breakingDown || breakdownBlocked || deskBusy} onClick={() => {
                          setStaleBannerDismissed(true);
                          void breakdownUnconfirmedOnly();
                        }}>
                          重拆仅未确认
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
              <button type="button" className="sg3-btn sg3-btn--ghost" onClick={() => setStaleBannerDismissed(true)}>
                稍后
              </button>
            </div>
            {staleBannerShowDiff ? (
              <div className="sg3-stale-banner__diff" style={{ width: '100%', marginTop: 6, padding: 8, background: 'rgba(0,0,0,0.25)', borderRadius: 8, fontSize: 11, lineHeight: 1.6 }}>
                <div>上游集数: {upstreamPackage.screenplay.episodes.length}</div>
                <div>上游标题: {upstreamPackage.brief.title || '-'}</div>
                <div>上游状态: {upstreamPackage.status}</div>
                <div>上游 hash: {packageSourceHash(upstreamPackage).slice(0, 16)}...</div>
                <div>本地 hash: {(breakdownJob?.sourcePackageHash ?? '-').slice(0, 16)}...</div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="sg3-studio">
          <div className="sg3-pipeline" aria-label="分镜流程">
            <div className="sg3-pipeline__steps">
              {(() => {
                const hasBreakdown = Boolean(payload?.episodes?.length);
                // F-01：有镜表 → 1/2 done；有线稿 → 3 done；已确认 → 4 done
                // 未绑定是设定/梳表质量信号，不挡「镜表」步骤完成态（否则设定未就绪时会出现 3 亮而 2 不亮）
                const hasLineArt = compositionStats.composed > 0;
                const stepDone: Record<string, boolean> = {
                  breakdown: hasBreakdown,
                  grid: hasBreakdown,
                  compose: hasLineArt,
                  handoff: currentEpisodeConfirmed,
                };
                return ([
                  ['breakdown', '1', '拆镜'],
                  ['grid', '2', '镜表'],
                  ['compose', '3', '构图'],
                  ['handoff', '4', '交接'],
                ] as const).map(([id, num, label], i) => (
                  <span key={id} className="sg3-pipeline__item">
                    {i > 0 ? <span className="sg3-pipeline__sep" aria-hidden /> : null}
                    <button
                      type="button"
                      className={`sg3-pipeline__step ${studioTab === id ? 'is-on' : ''} ${stepDone[id] ? 'is-done' : ''}`}
                      onClick={() => setStudioTab(id)}
                    >
                      <b>{num}</b> {label}
                    </button>
                  </span>
                ));
              })()}
            </div>
            <div className="sg3-pipeline__episode">
              {(payload?.episodes?.length ?? 0) > 0 ? (
                <select
                  className="sg3-episode-select sg3-episode-select--pipeline"
                  value={activeEpisodeId ?? payload!.episodes[0]?.id ?? ''}
                  onChange={(event) => {
                    updateNodeData(props.id, { activeEpisodeId: event.target.value || null });
                    setSelectedId(null);
                  }}
                  aria-labelledby="sg3-episode-label"
                  title="选择要编辑的剧集；左侧镜表与中间构图会跟随切换"
                >
                  {payload!.episodes.map((episode) => {
                    const done = confirmedEpisodeIds.includes(episode.id);
                    return (
                      <option key={episode.id} value={episode.id}>
                        {episode.title}
                        {done ? ' · 已确认' : ''}
                        {` · ${episode.shots.length} 镜`}
                      </option>
                    );
                  })}
                </select>
              ) : breakdownBusy ? (
                <span className="sg3-episode-select sg3-episode-select--pipeline sg3-episode-select--busy" aria-live="polite">
                  {queueProgress.total > 0
                    ? `拆镜中 ${Math.min(queueProgress.current + 1, queueProgress.total)}/${queueProgress.total} 集`
                    : '拆镜中…'}
                </span>
              ) : (
                <span className="sg3-episode-select sg3-episode-select--pipeline sg3-episode-select--empty">暂无剧集</span>
              )}
              <span
                className={`sg3-pipeline__episode-meta ${currentEpisodeConfirmed ? 'is-ok' : ''}`}
                title={
                  breakdownBusy
                    ? '拆镜进行中'
                    : (payload?.episodes?.length ?? 0) > 1
                      ? `全片已确认 ${(payload?.episodes ?? []).filter((ep) => confirmedEpisodeIds.includes(ep.id)).length}/${payload?.episodes?.length ?? 0} 集 · 本集构图 ${Math.round(compositionStats.coverage * 100)}%`
                      : currentEpisodeConfirmed
                        ? '本集已确认，可交导演台'
                        : '本集尚未确认交接'
                }
              >
                {breakdownBusy
                  ? (queueProgress.total > 0
                    ? `拆镜 ${Math.min(queueProgress.current + 1, queueProgress.total)}/${queueProgress.total}`
                    : '拆镜中')
                  : (payload?.episodes?.length ?? 0) > 1
                    ? `已确认 ${(payload?.episodes ?? []).filter((ep) => confirmedEpisodeIds.includes(ep.id)).length}/${payload?.episodes?.length ?? 0} 集`
                    : currentEpisodeConfirmed ? '本集已确认' : '本集未确认'}
              </span>
            </div>
          </div>

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
                  undoStackRef={undoStackRef}
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
      {/* 编辑分镜 — 功能全保留 */}
      <ScreenModal
        open={Boolean(editingShot && editDraft)}
        onClose={() => setEditingShotId(null)}
        title="编辑分镜"
        subtitle={
          editingShot
            ? `${editingShot.sceneCode} · 文案 / Prompt · @人物 @场景`
            : undefined
        }
        width={860}
        variant="default"
        className="sg3-modal sg3-modal--edit"
        label="编辑分镜"
      >
        {editingShot && editDraft && (
          <div className="sg sg-studio" style={{ minHeight: 'auto', maxHeight: 'min(86vh, 760px)' }}>
            <div className="sg-studio__body">
              <div className="sg-grid-2">
                <label className="sg-field" style={{ gridColumn: 'span 1' }}>
                  <span className="sg-label">标题</span>
                  <input
                    className="sg-input"
                    value={editDraft.title}
                    onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                  />
                </label>
                <label className="sg-field">
                  <span className="sg-label">
                    时长 s
                    {' '}
                    <Clock size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
                  </span>
                  <input
                    className="sg-input"
                    type="number"
                    value={editDraft.durationSec}
                    onChange={(event) =>
                      setEditDraft({ ...editDraft, durationSec: Number(event.target.value) || 1 })
                    }
                  />
                </label>
              </div>

              <div className="sg-grid-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <label className="sg-field">
                  <span className="sg-label">景别</span>
                  <select
                    className="sg-select"
                    value={editDraft.shotSize ?? ''}
                    onChange={(e) => setEditDraft({
                      ...editDraft,
                      shotSize: (e.target.value || undefined) as ShotEditDraft['shotSize'],
                    })}
                  >
                    <option value="">—</option>
                    {SHOT_SIZES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="sg-field">
                  <span className="sg-label">运镜</span>
                  <select
                    className="sg-select"
                    value={editDraft.cameraMove ?? ''}
                    onChange={(e) => setEditDraft({
                      ...editDraft,
                      cameraMove: (e.target.value || undefined) as ShotEditDraft['cameraMove'],
                    })}
                  >
                    <option value="">—</option>
                    {CAMERA_MOVES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="sg-field">
                  <span className="sg-label">机位</span>
                  <input
                    className="sg-input"
                    value={editDraft.cameraAngle ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, cameraAngle: e.target.value })}
                    placeholder="平视 / 俯 / 仰…"
                  />
                </label>
                <label className="sg-field">
                  <span className="sg-label">镜头焦距</span>
                  <input
                    className="sg-input"
                    value={editDraft.cameraLens ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, cameraLens: e.target.value })}
                    placeholder="广角 / 标准 / 长焦"
                  />
                </label>
              </div>

              {/* F-017: 构图模板选择 */}
              <label className="sg-field">
                <span className="sg-label">构图模板</span>
                <select
                  className="sg-select"
                  value={editDraft.compositionTemplateId ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, compositionTemplateId: e.target.value || null })}
                >
                  <option value="">— 无模板 —</option>
                  {BUILTIN_COMPOSITION_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>

              <label className="sg-field">
                <span className="sg-label">
                  场景
                  {editDraft.scene
                    && !scenePresets.some((scene) => scene.label === stripMentionToken(editDraft.scene)) && (
                      <span className="is-req">未入库</span>
                    )}
                </span>
                <select
                  className="sg-select"
                  value={
                    scenePresets.some((scene) => scene.label === stripMentionToken(editDraft.scene))
                      ? stripMentionToken(editDraft.scene)
                      : ''
                  }
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next) setEditDraft({ ...editDraft, scene: next });
                  }}
                >
                  <option value="">
                    {editDraft.scene ? `当前：${stripMentionToken(editDraft.scene)}` : '选择场景预设'}
                  </option>
                  {scenePresets.map((scene) => (
                    <option key={scene.id} value={scene.label}>
                      {scene.label} · {scene.source}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 6 }}>
                  <AssetMentionInput
                    value={editDraft.scene}
                    onChange={(next) => setEditDraft({ ...editDraft, scene: next })}
                    kinds={SCENE_MENTION_KINDS}
                    placeholder="@场景 或输入"
                    className="sg-input"
                  />
                </div>
              </label>

              <label className="sg-field">
                <span className="sg-label">
                  角色
                  {editDraft.characters.some((n) => !characterNameSet.has(stripMentionToken(n))) && (
                    <span className="is-req">含未入库</span>
                  )}
                  <span className="text-[10px] text-ink/40 font-normal ml-1">从 @ 列表选库内角色（写入正式名）</span>
                </span>
                <AssetMentionInput
                  value={namesToText(editDraft.characters)}
                  onChange={(next) => setEditDraft({ ...editDraft, characters: textToNames(next) })}
                  kinds={CHARACTER_MENTION_KINDS}
                  placeholder="@角色:名 从库选择"
                  className="sg-input"
                />
              </label>

              {editDraft.characters.length > 0 && costumeOptions.length > 0 ? (
                <div className="sg-field">
                  <span className="sg-label">本镜换装（Cos-06 · 优先于角色默认服装）</span>
                  <div className="sg-grid-2" style={{ gap: 8 }}>
                    {editDraft.characters.map((rawName) => {
                      const name = stripMentionToken(rawName);
                      const current = (editDraft.costumeOverrides ?? []).find(
                        (o) => o.characterName.trim().toLowerCase() === name.trim().toLowerCase(),
                      );
                      return (
                        <label key={name} className="sg-field" style={{ margin: 0 }}>
                          <span className="sg-label" style={{ fontWeight: 400 }}>{name}</span>
                          <select
                            className="sg-select"
                            value={current?.costumeId ?? ''}
                            onChange={(e) => {
                              const costumeId = e.target.value;
                              const hit = costumeOptions.find((c) => c.id === costumeId);
                              const rest = (editDraft.costumeOverrides ?? []).filter(
                                (o) => o.characterName.trim().toLowerCase() !== name.trim().toLowerCase(),
                              );
                              setEditDraft({
                                ...editDraft,
                                costumeOverrides: costumeId
                                  ? [...rest, { characterName: name, costumeId, costumeLabel: hit?.label }]
                                  : rest,
                              });
                            }}
                          >
                            <option value="">角色默认服装</option>
                            {costumeOptions.map((c) => (
                              <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {propOptions.length > 0 ? (
                <div className="sg-field">
                  <span className="sg-label">本镜道具（Prop-06）</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {propOptions.map((p) => {
                      const on = (editDraft.propIds ?? []).includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`sg-chip ${on ? 'is-on' : ''}`}
                          style={{
                            border: '1px solid var(--nx9-line, #333)',
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: 11,
                            background: on ? 'rgba(45, 212, 191, 0.12)' : 'transparent',
                            color: on ? 'var(--nx9-brand, #2dd4bf)' : 'inherit',
                          }}
                          onClick={() => {
                            const cur = editDraft.propIds ?? [];
                            setEditDraft({
                              ...editDraft,
                              propIds: on ? cur.filter((id) => id !== p.id) : [...cur, p.id],
                            });
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {(() => {
                const sceneLabel = stripMentionToken(editDraft.scene || '');
                const sceneItem = workspaceScenes.find(
                  (s) => s.label.trim().toLowerCase() === sceneLabel.trim().toLowerCase(),
                );
                const rec = sceneItem ? getSceneCreative(sceneItem) : null;
                const hasRec = Boolean(
                  rec
                  && (
                    (rec.recommendedShots?.length ?? 0)
                    || (rec.recommendedEmotions?.length ?? 0)
                    || (rec.recommendedCharacters?.length ?? 0)
                  ),
                );
                if (!hasRec || !rec) return null;
                return (
                  <div className="sg-field">
                    <span className="sg-label">场景创作推荐（点选写入本镜）</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(rec.recommendedShots ?? []).map((v) => (
                        <button
                          key={`shot-${v}`}
                          type="button"
                          className="sg-chip"
                          style={{ border: '1px solid var(--nx9-line,#333)', borderRadius: 999, padding: '2px 8px', fontSize: 11 }}
                          onClick={() => setEditDraft({
                            ...editDraft,
                            shotSize: (SHOT_SIZES as readonly string[]).includes(v)
                              ? (v as ShotEditDraft['shotSize'])
                              : editDraft.shotSize,
                            purpose: editDraft.purpose?.trim()
                              ? `${editDraft.purpose} · 推荐镜头:${v}`
                              : `推荐镜头:${v}`,
                          })}
                        >
                          镜头·{v}
                        </button>
                      ))}
                      {(rec.recommendedEmotions ?? []).map((v) => (
                        <button
                          key={`emo-${v}`}
                          type="button"
                          className="sg-chip"
                          style={{ border: '1px solid var(--nx9-line,#333)', borderRadius: 999, padding: '2px 8px', fontSize: 11 }}
                          onClick={() => setEditDraft({
                            ...editDraft,
                            purpose: editDraft.purpose?.trim()
                              ? `${editDraft.purpose} · @情绪:${v}`
                              : `@情绪:${v}`,
                          })}
                        >
                          情绪·{v}
                        </button>
                      ))}
                      {(rec.recommendedCharacters ?? []).map((v) => (
                        <button
                          key={`char-${v}`}
                          type="button"
                          className="sg-chip"
                          style={{ border: '1px solid var(--nx9-line,#333)', borderRadius: 999, padding: '2px 8px', fontSize: 11 }}
                          onClick={() => {
                            if (editDraft.characters.some((n) => stripMentionToken(n) === v)) return;
                            setEditDraft({ ...editDraft, characters: [...editDraft.characters, v] });
                          }}
                        >
                          角色·{v}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="sg-grid-2">
                <label className="sg-field">
                  <span className="sg-label">对白说话人</span>
                  <input
                    className="sg-input"
                    value={editDraft.dialogueSpeaker}
                    onChange={(e) => setEditDraft({ ...editDraft, dialogueSpeaker: e.target.value })}
                    placeholder="角色名 / 旁白"
                  />
                </label>
                <label className="sg-field">
                  <span className="sg-label">对白文本</span>
                  <input
                    className="sg-input"
                    value={editDraft.dialogueText}
                    onChange={(e) => setEditDraft({ ...editDraft, dialogueText: e.target.value })}
                    placeholder="首条对白"
                  />
                </label>
              </div>

              <label className="sg-field">
                <span className="sg-label">镜头目的</span>
                <AssetMentionInput
                  value={editDraft.purpose ?? ''}
                  onChange={(next) => setEditDraft({ ...editDraft, purpose: next })}
                  kinds={GLOBAL_MENTION_KINDS}
                  placeholder="可 @情绪 @镜头"
                  className="sg-input"
                />
              </label>

              <div className="sg-grid-2">
                <label className="sg-field">
                  <span className="sg-label">画面描述 visual</span>
                  <textarea
                    className="sg-textarea"
                    rows={3}
                    value={editDraft.visual ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, visual: e.target.value })}
                    placeholder="画面：环境、人物位置、光线、情绪、构图"
                  />
                </label>
                <label className="sg-field">
                  <span className="sg-label">动作设计 action</span>
                  <textarea
                    className="sg-textarea"
                    rows={3}
                    value={editDraft.action ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, action: e.target.value })}
                    placeholder="开始动作 → 变化 → 结束"
                  />
                </label>
              </div>

              <label className="sg-field">
                <span className="sg-label">视听语言</span>
                <textarea
                  className="sg-textarea"
                  rows={3}
                  value={editDraft.audiovisualLanguage ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, audiovisualLanguage: e.target.value })}
                  placeholder="成段镜头叙事：运镜如何服务情绪、景别功能、光色对比、声画关系…"
                />
              </label>

              <div className="sg-grid-2">
                <label className="sg-field">
                  <span className="sg-label">旁白</span>
                  <input
                    className="sg-input"
                    value={editDraft.narration ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, narration: e.target.value })}
                  />
                </label>
                <label className="sg-field">
                  <span className="sg-label">声音 / 音效</span>
                  <input
                    className="sg-input"
                    value={editDraft.sound ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, sound: e.target.value })}
                    placeholder="环境声、音乐设计"
                  />
                </label>
              </div>

              <label className="sg-field">
                <span className="sg-label">连贯备注（分号分隔）</span>
                <input
                  className="sg-input"
                  value={(editDraft.continuityNotes ?? []).join('；')}
                  onChange={(e) => setEditDraft({
                    ...editDraft,
                    continuityNotes: e.target.value
                      .split(/[；;\n]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })}
                  placeholder="服装/道具/位置/朝向/光线延续"
                />
              </label>

              <div className="sg-edit-grid">
                <div className="sg-panel">
                  <div className="sg-panel__head">
                    <h3 className="sg-panel__title">角色预选</h3>
                    <span className="sg-panel__meta">{characters.length}</span>
                  </div>
                  {characters.length === 0 ? (
                    <p className="sg-warn" style={{ margin: 0 }}>暂无角色，先在角色设定补齐</p>
                  ) : (
                    <div className="sg-chip-wrap">
                      {characters.map((character) => {
                        const active = editDraft.characters.includes(character.name);
                        return (
                          <button
                            key={character.id}
                            type="button"
                            className={`sg-chip ${active ? 'is-on' : ''}`}
                            onClick={() => toggleDraftCharacter(character.name)}
                            title={characterMeta(character)}
                          >
                            {character.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="sg-panel">
                  <div className="sg-panel__head">
                    <h3 className="sg-panel__title">场景预选</h3>
                    <span className="sg-panel__meta">{scenePresets.length}</span>
                  </div>
                  {scenePresets.length === 0 ? (
                    <p className="sg-warn" style={{ margin: 0 }}>暂无场景，先在场景设定补齐</p>
                  ) : (
                    <div className="sg-chip-wrap">
                      {scenePresets.map((scene) => {
                        const active = stripMentionToken(editDraft.scene) === scene.label;
                        return (
                          <button
                            key={scene.id}
                            type="button"
                            className={`sg-chip ${active ? 'is-on' : ''}`}
                            onClick={() => setEditDraft({ ...editDraft, scene: scene.label })}
                            title={scene.description}
                          >
                            {scene.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <label className="sg-field">
                <span className="sg-label">分镜剧本 / 文案</span>
                <AssetMentionInput
                  as="textarea"
                  rows={3}
                  value={editDraft.scriptText}
                  onChange={(next) => setEditDraft({ ...editDraft, scriptText: next })}
                  kinds={GLOBAL_MENTION_KINDS}
                  placeholder="可 @ 角色、场景、镜头、情绪、声音"
                  className="sg-textarea"
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">画面图片提示词 imagePrompt</span>
                <AssetMentionInput
                  as="textarea"
                  rows={4}
                  value={editDraft.imagePrompt}
                  onChange={(next) => setEditDraft({ ...editDraft, imagePrompt: next })}
                  kinds={GLOBAL_MENTION_KINDS}
                  className="sg-textarea"
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">画面视频提示词 videoPrompt</span>
                <AssetMentionInput
                  as="textarea"
                  rows={4}
                  value={editDraft.videoPrompt}
                  onChange={(next) => setEditDraft({ ...editDraft, videoPrompt: next })}
                  kinds={GLOBAL_MENTION_KINDS}
                  className="sg-textarea"
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">线稿构图提示词 sketchPrompt</span>
                <AssetMentionInput
                  as="textarea"
                  rows={3}
                  value={editDraft.sketchPrompt ?? ''}
                  onChange={(next) => setEditDraft({ ...editDraft, sketchPrompt: next })}
                  kinds={GLOBAL_MENTION_KINDS}
                  placeholder="黑白线稿构图：站位 / 前中后景 / 轮廓 / 机位；无色彩无材质"
                  className="sg-textarea"
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    onClick={() => {
                      const filled = buildLineArtShotPrompt(
                        [
                          editDraft.scriptText || editDraft.visual || editDraft.title,
                          editDraft.scene ? `location: ${editDraft.scene}` : '',
                          editDraft.shotSize ? `${editDraft.shotSize} shot` : '',
                          editDraft.cameraMove ? `camera: ${editDraft.cameraMove}` : '',
                          editDraft.cameraAngle ? `angle: ${editDraft.cameraAngle}` : '',
                          editDraft.characters?.length ? `characters: ${editDraft.characters.join(', ')}` : '',
                        ].filter(Boolean).join('\n'),
                        editDraft.shotSize,
                      );
                      setEditDraft({ ...editDraft, sketchPrompt: filled });
                    }}
                  >
                    用镜头信息填充线稿词
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={!editDraft.sketchPrompt?.trim()}
                    onClick={() => {
                      const v = (editDraft.sketchPrompt ?? '').trim();
                      if (!v) return;
                      void navigator.clipboard.writeText(v).then(
                        () => toastSuccess('已复制线稿提示词'),
                        () => toastSuccess('已复制线稿提示词'),
                      );
                    }}
                  >
                    复制线稿词
                  </button>
                </div>
              </label>
              <label className="sg-field">
                <span className="sg-label">排除项 negativePrompt</span>
                <textarea
                  className="sg-textarea"
                  rows={2}
                  value={editDraft.negativePrompt ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, negativePrompt: e.target.value })}
                  placeholder="不想出现的元素"
                />
              </label>
            </div>

            <div className="sg-studio__foot">
              <p className="sg-studio__foot-hint">
                {editingShot.sceneCode}
                {' · '}
                修改写回剧本拆分结构与故事板
              </p>
              <div className="sg-studio__foot-actions">
                <button
                  type="button"
                  className="sg-btn sg-btn--ghost"
                  onClick={() => setEditingShotId(null)}
                >
                  取消
                </button>
                <button type="button" className="sg-btn sg-btn--primary" onClick={saveShotEdit}>
                  保存修改
                </button>
              </div>
            </div>
          </div>
        )}
      </ScreenModal>
    </div>
  );
function StoryboardDeskDevPack({ blockId: _bid }: { blockId: string }) {
  const { values: gv, importJson: _gj } = useDevPromptOverrides();
  const [prompts, setPrompts] = useState<ScriptBreakdownPromptTemplates>(() => normalizeScriptBreakdownPrompts(undefined));
  const [tip, setTip] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fullTemplates = useMemo(() => {
    const dft = DEFAULT_SCRIPT_BREAKDOWN_PROMPTS;
    return {
      episodePlannerSystem: prompts.episodePlannerSystem || dft.episodePlannerSystem,
      episodeBreakdownSystem: prompts.episodeBreakdownSystem || dft.episodeBreakdownSystem,
    };
  }, [prompts]);

  const nodeOverride = useMemo(() => {
    const result: Partial<Record<string, boolean>> = {};
    for (const key of ['episodePlannerSystem', 'episodeBreakdownSystem'] as const) {
      result[key] = Boolean(prompts[key as keyof ScriptBreakdownPromptTemplates]?.trim());
    }
    return result;
  }, [prompts]);

  const globalOverrides = useMemo(() => {
    const result: Partial<Record<string, boolean>> = {};
    for (const key of ['storyboard.episodeBreakdownSystem', 'storyboard.episodePlannerSystem'] as const) {
      result[key] = Boolean(gv[key]?.trim());
    }
    return result;
  }, [gv]);

  const sourceLabel = useCallback((key: 'episodePlannerSystem' | 'episodeBreakdownSystem'): string => {
    const globalKey = key === 'episodePlannerSystem' ? 'storyboard.episodePlannerSystem' : 'storyboard.episodeBreakdownSystem';
    if (nodeOverride[key]) return '来源：节点 Pack';
    if (globalOverrides[globalKey]) return '来源：全局 Override';
    return '来源：DEFAULT';
  }, [nodeOverride, globalOverrides]);

  const patch = useCallback((key: 'episodePlannerSystem' | 'episodeBreakdownSystem', value: string) => {
    setPrompts((prev) => ({ ...prev, [key]: value.trim() }));
  }, []);

  const reset = useCallback(() => { setPrompts(normalizeScriptBreakdownPrompts(undefined)); setTip('已恢复默认'); }, []);

  const importPack = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ScriptBreakdownPromptPack;
      const result = parseScriptBreakdownPromptPack(parsed);
      if (result && result.prompts) {
        setPrompts(normalizeScriptBreakdownPrompts(result.prompts));
        setTip('导入成功');
      } else {
        setTip('非法 Pack 格式，拒绝导入');
      }
    } catch { setTip('JSON 解析失败'); }
  }, []);

  return (
    <details className="sg-warn" style={{ marginTop: 8, padding: 8, borderRadius: 10, border: '1px dashed var(--desk-warn)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 11, color: 'var(--desk-warn)' }}>
        ⚠ 开发 · 分镜台 Prompt Pack（仅开发）
      </summary>
      <div className="flex flex-col gap-2 mt-2 max-h-60 overflow-auto">
        {(['episodePlannerSystem', 'episodeBreakdownSystem'] as const).map((key) => (
          <div key={key}>
            <label className="text-[10px] font-bold opacity-60">{key}</label>
            <textarea
              className="w-full border border-line rounded text-[10px] p-1.5 mt-1 bg-surface resize-none font-mono"
              rows={4}
              value={fullTemplates[key]}
              onChange={(e) => patch(key, e.target.value)}
            />
            <div className="flex justify-between text-[8px] text-ink/40">
              <span>{sourceLabel(key)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-2" style={{ maxHeight: 60, overflow: 'visible' }}>
        <button type="button" className="sg-btn" onClick={reset}>恢复默认</button>
        <button type="button" className="sg-btn" onClick={() => {
          const pack = createScriptBreakdownPromptPack(undefined, prompts);
          const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'storyboard-prompt-pack.json'; a.click();
          URL.revokeObjectURL(url);
        }}>导出</button>
        <button type="button" className="sg-btn" onClick={() => fileRef.current?.click()}>导入</button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importPack(f);
          e.target.value = '';
        }} />
      </div>
      {tip ? <p className="text-[10px] mt-1" style={{ color: 'var(--desk-ok)' }}>{tip}</p> : null}
    </details>
  );
}
}
