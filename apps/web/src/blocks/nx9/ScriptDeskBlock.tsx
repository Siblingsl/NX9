import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Check,
  ChevronRight,
  ChevronUp,
  FileText,
  FileUp,
  FolderOpen,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  RotateCcw,
  RefreshCw,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  type ScreenplayPackage,
  type ScreenplayEpisode,
  type ScriptDeskAgentSession,
  type ScriptDeskSkillId,
  emptyScreenplayPackage,
  episodesFromIngestText,
  normalizeScreenplayEpisodes,
  removeScreenplayEpisode,
  insertEmptyEpisodeAfter,
  lintScreenplayFormat,
  findReplaceInEpisode,
  renameCharacterInPackage,
  screenplayFullText,
  screenplayWordCount,
  touchScreenplayPackage,
  unconfirmIfEdited,
  normalizeScreenplayBibleCharacters,
} from '@nx9/shared';
import { enrichPromptWithAssetMentions, summarizePackagePatch, resolveConnectedPictureGenId } from '@nx9/shared';
import { enrichBibleScenesFromPackage } from '@nx9/shared';
import { api } from '../../api/client';
import { useAllAssetLibraryItems } from '../../hooks/use-asset-library-items';
import { askConfirmWithOption, confirmDelete } from '../../stores/confirm-dialog';
import { isDevPromptEnabled } from '../../stores/dev-prompt-overrides';
import { toastSuccess } from '../../stores/toast';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { useFlowCommands } from '../../stores/flow-commands';
import { useFlowRuntime } from '../../stores/flow-runtime';
import {
  appendAgentMessage,
  applyPendingMessagePatch,
  confirmPackage,
  extractBibleFromPackage,
  ingestScreenplayText,
  packageSummaryLine,
  persistScriptDeskPackage,
  readScriptDeskPackage,
  runConsistencyCheck,
  applyConsistencyFixes,
  runAppendEpisodeSkill,
  runRewriteEpisodeSkill,
  runScriptDeskSkill,
} from '../../engine/script-desk-runner';
import { inspectBibleAssets, type AssetReadinessState } from '../../engine/asset-readiness';
import { AssetReadinessPanel } from '../../components/asset/AssetReadinessPanel';
import { useAssetLibraryModalUi } from '../../stores/asset-library-modal-ui';
import { ScriptDeskDevPackOverlay } from './script-desk/script-desk-dev-pack-overlay';
import './script-desk.css';
import './script-desk.v2.css';

type EntryMode = 'agent' | 'ingest';
type RightTab = 'screenplay' | 'bible' | 'readiness' | 'diagnostics';

/** 左侧对话区宽度占比（相对 sd2-body）；默认 60，可拖拽调整 */
const SPLIT_DEFAULT = 60;
const SPLIT_MIN = 32;
const SPLIT_MAX = 72;

function clampSplitPct(n: number): number {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(n * 10) / 10));
}

const SKILL_CHIPS: Array<{ id: ScriptDeskSkillId; label: string; segment: 'brief' | 'draft' | 'qa' }> = [
  { id: 'topic', label: '选题', segment: 'brief' },
  { id: 'world', label: '世界观', segment: 'brief' },
  { id: 'character', label: '人物', segment: 'brief' },
  { id: 'plot', label: '剧情', segment: 'brief' },
  { id: 'pacing', label: '节奏', segment: 'draft' },
  { id: 'dialogue', label: '对白', segment: 'draft' },
  { id: 'hooks', label: '爆点', segment: 'draft' },
  { id: 'consistency', label: '一致性', segment: 'qa' },
  { id: 'generate', label: '生成剧本', segment: 'draft' },
];

function compact(text: string, max = 48) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Brief 已可用：至少有剧名或 logline，才允许首次选集数生成分集 */
function isBriefReadyForFirstGen(pkg: ScreenplayPackage): boolean {
  return Boolean(pkg.brief.title?.trim() || pkg.brief.logline?.trim());
}

/** 列表标题：去掉与集号重复的「第N集」前缀；若标题仅有集号则返回空串 */
function episodeDisplayTitle(index: number, title?: string): string {
  const raw = (title ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(new RegExp(`^第\\s*${index}\\s*集\\s*[·\\-—:：]?\\s*`), '')
    .trim();
}

function ScriptDeskBlock(props: NodeProps) {
  const { updateNodeData, getNodes, getEdges } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const openAssetAt = useAssetLibraryModalUi((s) => s.openAt);
  const nodeData = props.data as Record<string, unknown> | undefined;
  const pkg = useMemo(() => readScriptDeskPackage(nodeData), [nodeData]);
  const connectedPictureGenId = useMemo(
    () => resolveConnectedPictureGenId(props.id, getNodes(), getEdges()),
    [props.id, getNodes, getEdges],
  );
  const session = (nodeData?.agentSession as ScriptDeskAgentSession | undefined) ?? {
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  const entryMode = ((nodeData?.entryMode as EntryMode | undefined) ?? 'agent') as EntryMode;
  const status = (nodeData?.status as string | undefined) ?? 'idle';
  const legacyBreakdown = nodeData?.legacyScriptBreakdown;

  const [studioOpen, setStudioOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('screenplay');
  const [activeSkills, setActiveSkills] = useState<ScriptDeskSkillId[]>(['generate']);
  const [chatInput, setChatInput] = useState('');
  const [ingestText, setIngestText] = useState(() => screenplayFullText(pkg));
  const [atOpen, setAtOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState('');
  const [rightDrawerOpen, setRightDrawerOpen] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [highlightedBibleId, setHighlightedBibleId] = useState<string | null>(null);
  const [leftPanePct, setLeftPanePct] = useState(() => {
    const raw = Number((props.data as Record<string, unknown> | undefined)?.studioSplitPct);
    return Number.isFinite(raw) ? clampSplitPct(raw) : SPLIT_DEFAULT;
  });
  const [splitDragging, setSplitDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const leftPanePctRef = useRef(leftPanePct);
  leftPanePctRef.current = leftPanePct;

  // 首次生成：对话区底线小悬浮窗（Brief 就绪且尚无分集时自动出现；底边半圆箭头展开/收起）
  const [genFloatExpanded, setGenFloatExpanded] = useState(false);
  const [genEpisodeCount, setGenEpisodeCount] = useState<number | 'all'>(1);
  /** 用户点「稍后」后不再自动展开；半圆入口仍保留，可手动再开 */
  const [firstGenFloatDeferred, setFirstGenFloatDeferred] = useState(false);
  // F1: 续写集数弹层
  const [continueOpen, setContinueOpen] = useState(false);
  const [continueCount, setContinueCount] = useState<number | 'all'>(1);
  const [continueBusy, setContinueBusy] = useState(false);
  const [rewritingEpIndex, setRewritingEpIndex] = useState<number | null>(null);
  const [chatMenu, setChatMenu] = useState<{ x: number; y: number } | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [editingBibleId, setEditingBibleId] = useState<string | null>(null);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeType, setMergeType] = useState<'character' | 'scene' | null>(null);
  const [outlineView, setOutlineView] = useState(false);
  const [skeletonIndexes, setSkeletonIndexes] = useState<number[]>([]);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findScope, setFindScope] = useState<'current' | 'all'>('all');
  const [ingestPreviewOpen, setIngestPreviewOpen] = useState(false);
  const [ingestPreviewEps, setIngestPreviewEps] = useState<ScreenplayEpisode[]>([]);
  const [pendingIngestSource, setPendingIngestSource] = useState<'pasted' | 'uploaded'>('pasted');
  const [dragEpId, setDragEpId] = useState<string | null>(null);
  const [epMoreMenuId, setEpMoreMenuId] = useState<string | null>(null);
  const [failedEpisodeIndexes, setFailedEpisodeIndexes] = useState<number[]>([]);
  const [renamingDraftId, setRenamingDraftId] = useState<string | null>(null);
  const [renamingDraftText, setRenamingDraftText] = useState('');
  const tipClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevConfirmedRef = useRef(false);
  const lastOpenStudioRequestAtRef = useRef<string | null>(null);

  // 分镜台「打开上游编剧台」：写入 openStudioRequest 后自动展开本台
  useEffect(() => {
    const req = nodeData?.openStudioRequest as
      | { at?: string; reason?: string; fromId?: string }
      | null
      | undefined;
    if (!req?.at || req.at === lastOpenStudioRequestAtRef.current) return;
    lastOpenStudioRequestAtRef.current = req.at;
    setStudioOpen(true);
    if (req.reason === 'confirm-for-breakdown' && pkg.status !== 'confirmed') {
      setTip('分镜台等待本稿确认：请点顶栏「确认成稿」，再回分镜台同步最新成稿');
    } else if (req.reason === 'confirm-for-breakdown' && pkg.status === 'confirmed') {
      setTip('成稿已确认：可点「送到分镜台」，或直接回分镜台点「同步最新成稿」');
    }
    updateNodeData(props.id, { openStudioRequest: null });
  }, [nodeData?.openStudioRequest, pkg.status, props.id, updateNodeData]);

  const scriptDeskDrafts = useWorkspaceDocument((s) => s.scriptDeskDrafts);
  const saveScriptDeskDraft = useWorkspaceDocument((s) => s.saveScriptDeskDraft);
  const trashScriptDeskSnapshot = useWorkspaceDocument((s) => s.trashScriptDeskSnapshot);
  const moveScriptDeskDraftToTrash = useWorkspaceDocument((s) => s.moveScriptDeskDraftToTrash);
  const getScriptDeskDraft = useWorkspaceDocument((s) => s.getScriptDeskDraft);
  const upsertScriptDeskWorkingDraft = useWorkspaceDocument((s) => s.upsertScriptDeskWorkingDraft);
  const renameScriptDeskDraft = useWorkspaceDocument((s) => s.renameScriptDeskDraft);

  const { privateItems, publicItems, allItems } = useAllAssetLibraryItems();
  const libChars = useMemo(() => allItems.filter((i) => i.kind === 'character'), [allItems]);
  const libScenes = useMemo(() => allItems.filter((i) => i.kind === 'scene'), [allItems]);
  const hasLibraryItems = libChars.length > 0 || libScenes.length > 0;

  const epCount = pkg.screenplay.episodes.length;
  const charCount = pkg.bible.characters.length;
  const sceneCount = pkg.bible.scenes.length;
  const wordCount = screenplayWordCount(pkg);
  const diagCount = pkg.diagnostics?.length ?? 0;
  const title = pkg.brief.title || pkg.screenplay.episodes[0]?.title || '未命名剧本';
  const logline = pkg.brief.logline || pkg.screenplay.episodes[0]?.bodyMd || '';
  /** 已有成稿/Bible 记忆时，空对话不回引导页，只显示空白对话窗 */
  const hasDraftMemory =
    epCount > 0
    || charCount > 0
    || sceneCount > 0
    || Boolean(pkg.brief.title?.trim())
    || Boolean(pkg.brief.logline?.trim());
  /** Brief 就绪且尚无分集：左侧对话底保留选集入口；生成中隐藏；「稍后」只收起 */
  const showGenFloat =
    pkg.screenplay.episodes.length === 0
    && isBriefReadyForFirstGen(pkg)
    && !busy;

  // X-03: 本地撤销栈（max 20）
  const undoStackRef = useRef<ScreenplayPackage[]>([]);
  const pushUndo = useCallback((prev: ScreenplayPackage) => {
    undoStackRef.current.push(prev);
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
  }, []);

  const savePkg = useCallback((next: ScreenplayPackage, extra: Record<string, unknown> = {}) => {
    pushUndo(pkg);
    persistScriptDeskPackage(updateNodeData, props.id, next, extra);
  }, [props.id, updateNodeData, pushUndo, pkg]);

  // F-08: 跟踪确认状态；显示确认失效 banner
  useEffect(() => {
    if (pkg.status === 'confirmed') prevConfirmedRef.current = true;
  }, [pkg.status]);
  const showUnconfirmBanner = pkg.status !== 'confirmed' && prevConfirmedRef.current && epCount > 0;

  // 修复历史脏数据：模型 JSON 被当成纯文本切开后，title 会吃进 "bodyMd"
  useEffect(() => {
    const raw = pkg.screenplay.episodes;
    if (raw.length === 0) return;
    const fixed = normalizeScreenplayEpisodes(raw);
    const dirty = fixed.some((ep, i) => ep.title !== raw[i]?.title || ep.bodyMd !== raw[i]?.bodyMd);
    if (!dirty) return;
    savePkg(touchScreenplayPackage(pkg, {
      screenplay: { ...pkg.screenplay, episodes: fixed },
    }));
  }, [pkg, savePkg]);

  const setEntryMode = useCallback((mode: EntryMode) => {
    updateNodeData(props.id, { entryMode: mode });
  }, [props.id, updateNodeData]);

  const persistSplitPct = useCallback((pct: number) => {
    const next = clampSplitPct(pct);
    leftPanePctRef.current = next;
    setLeftPanePct(next);
    updateNodeData(props.id, { studioSplitPct: next });
  }, [props.id, updateNodeData]);

  const onSplitterPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSplitDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add('sd2-splitting');
  }, []);

  const onSplitterPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = clampSplitPct(((e.clientX - rect.left) / rect.width) * 100);
    leftPanePctRef.current = pct;
    setLeftPanePct(pct);
  }, []);

  const onSplitterPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setSplitDragging(false);
    document.body.classList.remove('sd2-splitting');
    persistSplitPct(leftPanePctRef.current);
  }, [persistSplitPct]);

  const onSplitterDoubleClick = useCallback(() => {
    persistSplitPct(SPLIT_DEFAULT);
  }, [persistSplitPct]);

  const runAutoLint = useCallback((latestPkg: ScreenplayPackage) => {
    const lintDiag = lintScreenplayFormat(latestPkg);
    const consistencyPkg = runConsistencyCheck(latestPkg);
    const allDiag = [
      ...lintDiag.map((d) => ({ ...d, code: `lint-${d.code}` })),
      ...(consistencyPkg.diagnostics ?? []).filter((d) => d.code.startsWith('consistency-')),
    ];
    if (allDiag.length === 0) return latestPkg;
    const merged = [
      ...(latestPkg.diagnostics ?? []).filter((d) => !d.code.startsWith('lint-') && !d.code.startsWith('consistency-')),
      ...allDiag,
    ];
    return touchScreenplayPackage(latestPkg, { diagnostics: merged });
  }, []);

  const handleIngestSave = useCallback(() => {
    const text = ingestText.trim();
    if (!text) {
      setTip('请粘贴或上传剧本文本');
      return;
    }
    const preview = episodesFromIngestText(text, { episodeCount: pkg.brief.episodeCount, sourceType: 'pasted' });
    if (preview.length === 0) {
      setTip('未识别到任何分集，请确认格式');
      return;
    }
    setIngestPreviewEps(preview);
    setIngestPreviewOpen(true);
    setPendingIngestSource('pasted');
  }, [ingestText, pkg.brief.episodeCount]);

  const doIngestConfirm = useCallback(() => {
    setIngestPreviewOpen(false);
    const sourceType = pendingIngestSource === 'uploaded' ? 'uploaded' : 'pasted';
    let next = ingestScreenplayText(pkg, ingestText.trim(), sourceType);
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    next = runAutoLint(next);
    savePkg(next, { entryMode: 'ingest' });
    setTip(pkg.status === 'confirmed' ? '成稿已失效，需重新确认' : `已写入 ${next.screenplay.episodes.length} 集`);
    appendLog(`编剧台：已保存成稿 · ${next.screenplay.episodes.length} 集`);
    setRightTab('screenplay');
  }, [appendLog, ingestText, pkg, savePkg, runAutoLint, pendingIngestSource]);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    setIngestText(text);
    const preview = episodesFromIngestText(text, { episodeCount: pkg.brief.episodeCount, sourceType: 'uploaded' });
    if (preview.length === 0) {
      setTip('未识别到任何分集，请确认文件格式（需要含「第N集」分集标记）');
      return;
    }
    setIngestPreviewEps(preview);
    setIngestPreviewOpen(true);
    setPendingIngestSource('uploaded');
  }, [pkg.brief.episodeCount, setIngestText]);

  const handleExtractBible = useCallback(async () => {
    if (!screenplayFullText(pkg).trim()) {
      setTip('请先写入成稿');
      return;
    }
    setBusy(true);
    setTip('抽取设定中…');
    try {
      updateNodeData(props.id, { status: 'running' });
      const next = await extractBibleFromPackage(pkg);
      savePkg(next);
      setRightTab('bible');
      setTip(`设定已更新 · 角 ${next.bible.characters.length} / 场 ${next.bible.scenes.length}`);
      appendLog(`编剧台：抽取设定 · 角 ${next.bible.characters.length} / 场 ${next.bible.scenes.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateNodeData(props.id, { status: 'error', error: msg });
      setTip(`抽取失败：${msg}`);
      appendLog(`编剧台抽取失败：${msg}`);
    } finally {
      setBusy(false);
    }
  }, [appendLog, pkg, props.id, savePkg, updateNodeData]);

  const handleConfirm = useCallback(async () => {
    // B-05: 确认前先检查 Bible
    let enriched = enrichBibleScenesFromPackage(pkg);
    const sceneCountBefore = pkg.bible.scenes.length;
    const sceneCountAfter = enriched.bible.scenes.length;
    const needsBibleCheck = enriched.bible.characters.length === 0 && enriched.bible.scenes.length === 0
      && screenplayWordCount(enriched) > 200;
    if (needsBibleCheck) {
      const result = await askConfirmWithOption({
        title: '设定尚未抽取',
        description: '确认成稿前建议先抽取人物与场景到设定。跳过抽取继续确认？',
        confirmLabel: '先抽取设定',
        cancelLabel: '取消',
        tone: 'neutral',
        option: { label: '跳过抽取，直接确认', defaultChecked: false },
      });
      if (!result.confirmed) return;
      if (!result.optionChecked) {
        try {
          setBusy(true);
          enriched = await extractBibleFromPackage(enriched);
        } catch (e) {
          setTip('抽取失败：' + (e instanceof Error ? e.message : String(e)));
          setBusy(false);
          return;
        } finally {
          setBusy(false);
        }
      }
    } else if (sceneCountAfter > sceneCountBefore) {
      setTip(`从成稿中补了 ${sceneCountAfter - sceneCountBefore} 个场景草稿`);
    }
    const next = confirmPackage(normalizeScreenplayBibleCharacters(enriched));
    if (next.status !== 'confirmed') {
      setTip(next.diagnostics?.find((d) => d.code === 'empty-screenplay')?.message || '无法确认');
      savePkg(next);
      return;
    }
    const readiness = inspectBibleAssets(next);
    savePkg(next, { assetReadiness: readiness });
    setRightTab('readiness');
    const visualGaps =
      (readiness.missingCharacterRefs?.length ?? 0) +
      (readiness.missingCharacterTurnarounds?.length ?? 0);
    setTip(
      readiness.ready
        ? '成稿已确认，设定已就绪 · 可回分镜台点「同步最新成稿」'
        : `成稿已确认 · 设定缺口：角色 ${readiness.missingCharacters.length} / 场景 ${readiness.missingScenes.length} / 视觉 ${visualGaps} · 请在设定就绪补齐`,
    );
    appendLog(`编剧台：确认成稿 · ${packageSummaryLine(next)}`);
  }, [appendLog, pkg, savePkg]);

  // B-07/H-01: 打开送分镜 checklist 或直接送
  const handleHandoffToStoryboard = useCallback(() => {
    const body = screenplayFullText(pkg).trim();
    if (pkg.status !== 'confirmed' || !body) {
      setTip(
        !body
          ? '尚无分集成稿正文：请先用「生成剧本」成功生成并点「应用」，再确认成稿'
          : '请先点「确认成稿」，再送到分镜台',
      );
      return;
    }
    setHandoffOpen(true);
  }, [pkg]);

  // B-07/H-01: 实际送分镜（从 checklist 触发）
  const doHandoffToStoryboard = useCallback(() => {
    setHandoffOpen(false);
    const handoff = {
      from: 'script-desk',
      to: 'storyboard-desk',
      fromId: props.id,
      at: new Date().toISOString(),
      autoOpenBreakdown: true,
      sourceScriptBlockId: props.id,
      episodeRange: {
        count: pkg.screenplay.episodes.length,
        firstId: pkg.screenplay.episodes[0]?.id ?? null,
        lastId: pkg.screenplay.episodes[pkg.screenplay.episodes.length - 1]?.id ?? null,
        titles: pkg.screenplay.episodes.map((e) => e.title || `第${e.index}集`),
      },
      scriptTitle: pkg.brief.title || pkg.screenplay.episodes[0]?.title || '',
      scriptWordCount: screenplayWordCount(pkg),
    };
    const runtime = useFlowRuntime.getState().runtime;
    const nodes = runtime?.getNodes() ?? [];
    const storyboardDesk = nodes.find((n) => n.type === 'storyboard-desk');
    if (storyboardDesk) {
      updateNodeData(storyboardDesk.id, { handoff });
      runtime?.focusBlock(storyboardDesk.id);
      setTip(`已送到分镜台 · ${pkg.screenplay.episodes.length} 集 · 请在「拆镜」页点「只拆新增」`);
      appendLog(`编剧台：送到分镜台 · ${pkg.screenplay.episodes.length} 集 · 打开拆镜页只拆新增`);
    } else {
      useFlowCommands.getState().requestSpawn('storyboard-desk', undefined, {
        connectToSource: props.id,
        handoff,
      });
      setTip(`已创建分镜台并连线 · ${pkg.screenplay.episodes.length} 集 · 打开后请在「拆镜」页点「从成稿拆镜」`);
      appendLog(`编剧台：送至分镜 · 一键创建并连线分镜台 · ${pkg.screenplay.episodes.length} 集`);
    }
  }, [appendLog, pkg, props.id, updateNodeData]);

  const handleReadinessChange = useCallback((state: AssetReadinessState) => {
    updateNodeData(props.id, { assetReadiness: state });
    if (state.ready) {
      setTip('设定已就绪，可交分镜台');
      appendLog('编剧台：已标记设定就绪');
    }
  }, [appendLog, props.id, updateNodeData]);

  const handleReadinessPackageChange = useCallback((next: ScreenplayPackage) => {
    dirtyRef.current = true;
    savePkg(next);
  }, [savePkg]);

  const handleManualConsistencyCheck = useCallback(() => {
    const next = runConsistencyCheck(pkg);
    savePkg(next);
    setRightTab('diagnostics');
    setTip(`一致性检查完成 · 诊断 ${next.diagnostics?.length ?? 0} 条`);
    appendLog(`编剧台：手动一致性检查 · ${next.diagnostics?.length ?? 0} 条`);
  }, [appendLog, pkg, savePkg]);

  const handleAutoFix = useCallback(() => {
    const before = pkg;
    const { package: next, fixedCount } = applyConsistencyFixes(before);
    if (fixedCount === 0) {
      setTip('未发现可自动修复的缺失字段');
      return;
    }
    const details: string[] = [];
    next.bible.characters.forEach((c, i) => {
      const prev = before.bible.characters[i];
      if (!prev?.voiceNotes && c.voiceNotes) details.push(`${c.name}（补语气）`);
      if (!prev?.appearance && c.appearance) details.push(`${c.name}（补外貌）`);
    });
    next.bible.scenes.forEach((s, i) => {
      const prev = before.bible.scenes[i];
      if (!prev?.location && !prev?.summary && s.location) details.push(`${s.name}（补地点）`);
    });
    savePkg(next);
    const detailStr = details.length > 0 ? `：${details.join('、')}` : '';
    setTip(`已一键填充 ${fixedCount} 个缺失字段${detailStr}`);
    appendLog(`编剧台：一键修复 ${fixedCount} 个字段${detailStr}`);
  }, [appendLog, pkg, savePkg]);

  const handleDiagClick = useCallback((d: { entityId?: string; episodeId?: string }) => {
    if (d.episodeId) {
      scrollToEpisode(d.episodeId);
      setRightTab('screenplay');
    } else if (d.entityId) {
      setHighlightedBibleId(d.entityId);
      setRightTab('bible');
    }
  }, []);

  const toggleSkill = useCallback((id: ScriptDeskSkillId) => {
    setActiveSkills([id]);
  }, []);

  const openFirstGenFloat = useCallback((fromPkg: ScreenplayPackage = pkg) => {
    if (fromPkg.screenplay.episodes.length > 0) {
      setTip('已有分集成稿，请用右侧「续写」追加');
      return false;
    }
    if (!isBriefReadyForFirstGen(fromPkg)) {
      setTip('请先共创并应用大纲（至少剧名或一句话故事）');
      return false;
    }
    setFirstGenFloatDeferred(false);
    setGenEpisodeCount(1);
    setGenFloatExpanded(true);
    return true;
  }, [pkg]);

  const handleAgentSend = useCallback(async () => {
    const instruction = chatInput.trim();
    const skillId = activeSkills[0] ?? 'generate';
    if (!instruction && skillId !== 'consistency' && skillId !== 'generate') {
      setTip('请输入说明或选择生成/一致性技能');
      return;
    }
    // C-03: 存在未应用 pending 时禁止再发送
    const hasPending = session.messages.some((m) => m.pendingPatch && !m.applied && !m.discarded);
    if (hasPending) {
      setTip('当前有待应用的产出，请先应用或丢弃后再发送新指令');
      return;
    }
    // 生成技能且尚无分集：改走底浮层选集数，不直接发送
    if (skillId === 'generate' && pkg.screenplay.episodes.length === 0) {
      openFirstGenFloat(pkg);
      return;
    }
    const enrichedInstruction = enrichPromptWithAssetMentions(instruction || `执行技能：${skillId}`, privateItems, publicItems);
    // Q-03: 创建 AbortController
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    updateNodeData(props.id, { status: 'running', entryMode: 'agent' });
    let nextSession = appendAgentMessage(session, {
      role: 'user',
      content: enrichedInstruction,
      skillId,
    });
    updateNodeData(props.id, { agentSession: nextSession });
    try {
      const result = await runScriptDeskSkill(skillId, pkg, enrichedInstruction, ac.signal);
      nextSession = appendAgentMessage(nextSession, {
        role: 'assistant',
        content: result.assistantText,
        skillId,
        pendingPatch: result.patch,
        applied: false,
      });
      updateNodeData(props.id, {
        agentSession: nextSession,
        status: 'success',
      });
      setChatInput('');
      setTip(result.patch ? '有待应用产出，请点「应用此步产出」' : result.assistantText);
      appendLog(`编剧台 Agent · ${skillId}`);
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      const msg = e instanceof Error ? e.message : String(e);
      if (isAbort) {
        setTip('已停止');
        appendLog(`编剧台 Agent 已停止 · ${skillId}`);
      } else {
        nextSession = appendAgentMessage(nextSession, {
          role: 'assistant',
          content: `失败：${msg}`,
          skillId,
        });
        updateNodeData(props.id, { agentSession: nextSession, status: 'error', error: msg });
        setTip(msg);
        appendLog(`编剧台 Agent 失败：${msg}`);
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
    }
  }, [activeSkills, appendLog, chatInput, openFirstGenFloat, pkg, props.id, session, updateNodeData, privateItems, publicItems]);

  const handleApplyMessage = useCallback((messageId: string) => {
    const result = applyPendingMessagePatch(pkg, session, messageId);
    savePkg(result.package, { agentSession: result.session });
    setTip(result.package.status === 'drafting' && pkg.status === 'confirmed'
      ? '成稿已失效，需重新确认'
      : '已应用此步产出');
    appendLog('编剧台：已应用 Agent 产出');
    // 首次：尚无分集 + Brief 已可用 → 对话区底浮层选集数（「稍后」后不再自动弹）
    const next = result.package;
    if (
      !firstGenFloatDeferred
      && next.screenplay.episodes.length === 0
      && isBriefReadyForFirstGen(next)
    ) {
      setGenEpisodeCount(1);
      setGenFloatExpanded(true);
    }
  }, [appendLog, firstGenFloatDeferred, pkg, savePkg, session]);

  // C-02: 丢弃 pending patch（标记 discarded，不修改 package）
  const handleDiscardMessage = useCallback((messageId: string) => {
    const messages = session.messages.map((m) =>
      m.id === messageId ? { ...m, discarded: true } : m,
    );
    updateNodeData(props.id, {
      agentSession: { ...session, messages, updatedAt: new Date().toISOString() },
    });
    setTip('已丢弃此步产出');
    appendLog('编剧台：已丢弃 Agent 产出');
  }, [appendLog, props.id, session, updateNodeData]);

  const handleExportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'screenplay-package'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pkg, title]);

  const handleExportMd = useCallback(() => {
    const md = [
      `# ${title}`,
      pkg.brief.logline ? `> ${pkg.brief.logline}` : '',
      '',
      screenplayFullText(pkg),
      '',
      '## 设定 · 人物',
      ...pkg.bible.characters.map((c) => `- **${c.name}**：${[c.identity, c.personality, c.appearance].filter(Boolean).join(' · ')}`),
      '',
      '## 设定 · 场景',
      ...pkg.bible.scenes.map((s) => `- **${s.name}**：${[s.location, s.summary].filter(Boolean).join(' · ')}`),
    ].filter(Boolean).join('\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'screenplay'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pkg, title]);

  // ---- export

  // 首次生成：确认集数后串行写入分集（对齐续写进度展示，确认后直接落盘，不再二次「应用」）
  const handleGenStart = useCallback(async () => {
    const resolvedCount = genEpisodeCount === 'all'
      ? (pkg.brief.episodeCount || 10)
      : genEpisodeCount;
    if (!resolvedCount || resolvedCount < 1) {
      setTip('生成集数需 ≥ 1');
      return;
    }
    if (pkg.screenplay.episodes.length > 0) {
      setTip('已有分集成稿，请用右侧「续写」追加');
      return;
    }
    if (!isBriefReadyForFirstGen(pkg)) {
      setTip('请先共创并应用大纲（至少剧名或一句话故事）');
      return;
    }
    setGenFloatExpanded(false);
    setFirstGenFloatDeferred(true);
    // Q-03: 创建 AbortController
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    updateNodeData(props.id, { status: 'running', entryMode: 'agent' });

    let currentPkg = touchScreenplayPackage(pkg, {
      brief: { ...pkg.brief, episodeCount: resolvedCount },
    });
    savePkg(currentPkg);

    let nextSession = appendAgentMessage(session, {
      role: 'system',
      content: `首次生成 · 将写 ${resolvedCount} 集…`,
    });
    updateNodeData(props.id, { agentSession: nextSession });

    let ok = 0;
    const failed: number[] = [];
    let aborted = false;
    const expectedIndexes = Array.from({ length: resolvedCount }, (_, i) => i + 1);
    setSkeletonIndexes(expectedIndexes);
    for (let i = 0; i < resolvedCount; i++) {
      if (ac.signal.aborted) { aborted = true; break; }
      const nextIndex = i + 1;
      nextSession = appendAgentMessage(nextSession, {
        role: 'system',
        content: `生成中 第 ${i + 1}/${resolvedCount} 集…`,
      });
      updateNodeData(props.id, { agentSession: nextSession });
      setTip(`生成中 第 ${i + 1}/${resolvedCount} 集…`);
      try {
        const result = await runAppendEpisodeSkill(currentPkg, {
          nextEpisodeIndex: nextIndex,
          userInstruction: chatInput.trim() || undefined,
          signal: ac.signal,
        });
        if (result.patch) {
          currentPkg = touchScreenplayPackage(currentPkg, result.patch);
          if (currentPkg.status === 'confirmed') currentPkg = unconfirmIfEdited(currentPkg);
          savePkg(currentPkg);
          ok++;
          setSkeletonIndexes((prev) => prev.filter((idx) => idx !== nextIndex));
          const newEp = currentPkg.screenplay.episodes.find((ep) => ep.index === nextIndex);
          const epTitle = newEp?.title || `第${nextIndex}集`;
          const bodyPreview = (newEp?.bodyMd || '').slice(0, 800);
          const truncatedNote = (newEp?.bodyMd || '').length > 800 ? '\n\n（完整正文已写入右侧成稿）' : '';
          nextSession = appendAgentMessage(nextSession, {
            role: 'assistant',
            content: `已生成第 ${nextIndex} 集《${epTitle}》\n\n${bodyPreview}${truncatedNote}`,
            skillId: 'generate',
          });
          updateNodeData(props.id, { agentSession: nextSession });
        }
      } catch (e) {
        const isAbort = e instanceof DOMException && e.name === 'AbortError';
        if (isAbort) { aborted = true; break; }
        failed.push(nextIndex);
        setSkeletonIndexes((prev) => prev.filter((idx) => idx !== nextIndex));
        const errMsg = e instanceof Error ? e.message : String(e);
        nextSession = appendAgentMessage(nextSession, {
          role: 'system',
          content: `生成失败 · 第 ${nextIndex} 集：${errMsg}（可单独重试）`,
        });
        updateNodeData(props.id, { agentSession: nextSession });
        appendLog(`首次生成第 ${nextIndex} 集失败：${errMsg}`);
        // 继续尝试生成下一集
      }
    }

    currentPkg = runAutoLint(currentPkg);
    savePkg(currentPkg);

    const summary = aborted
      ? `生成已停止 · 已生成第 1–${ok} 集 · 成功 ${ok}${failed.length > 0 ? ` · 失败 ${failed.length} 集` : ''}`
      : ok > 0
        ? `首次生成完成 · 第 1–${ok} 集 · 成功 ${ok}${failed.length > 0 ? ` · 失败 ${failed.length} 集（第${failed.join(',')}）` : ' · 全部成功'}`
        : '首次生成失败，未成功生成任何集';
    if (failed.length > 0) {
      setFailedEpisodeIndexes(failed);
    }
    nextSession = appendAgentMessage(nextSession, {
      role: 'system',
      content: summary,
    });
    updateNodeData(props.id, {
      agentSession: nextSession,
      status: ok > 0 ? 'success' : 'error',
      ...(ok === 0 && failed.length > 0 ? { error: summary } : {}),
    });
    if (ok > 0) {
      setChatInput('');
      setTip(aborted ? `已停止 · 已生成 ${ok} 集` : `已生成 ${ok} 集`);
      appendLog(`编剧台首次生成 · 成功 ${ok} 集 · 目标 ${resolvedCount}`);
      setRightTab('screenplay');
      setRightDrawerOpen(true);
      setFirstGenFloatDeferred(false);
    } else {
      setTip(aborted ? '已停止' : '首次生成失败，未成功生成任何集');
      setFirstGenFloatDeferred(false);
      setGenFloatExpanded(true);
    }
    if (abortRef.current === ac) abortRef.current = null;
    setSkeletonIndexes([]);
    setBusy(false);
  }, [appendLog, chatInput, genEpisodeCount, pkg, props.id, savePkg, session, updateNodeData]);

  // E-07: 只重试失败的集
  const handleRetryFailed = useCallback(async (indexes: number[]) => {
    if (indexes.length === 0) return;
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setFailedEpisodeIndexes([]);
    let currentPkg = pkg;
    let ok = 0;
    const failed: number[] = [];
    for (const nextIndex of indexes) {
      if (ac.signal.aborted) break;
      setTip(`重试第 ${nextIndex} 集…`);
      try {
        // 先移除此集旧内容（如果有的话），然后重新生成
        const existing = currentPkg.screenplay.episodes.find((ep) => ep.index === nextIndex);
        if (existing) {
          currentPkg = touchScreenplayPackage(currentPkg, {
            screenplay: { ...currentPkg.screenplay, episodes: currentPkg.screenplay.episodes.filter((ep) => ep.index !== nextIndex) },
          });
        }
        const result = await runAppendEpisodeSkill(currentPkg, {
          nextEpisodeIndex: nextIndex,
          signal: ac.signal,
        });
        if (result.patch) {
          currentPkg = touchScreenplayPackage(currentPkg, result.patch);
          if (currentPkg.status === 'confirmed') currentPkg = unconfirmIfEdited(currentPkg);
          ok++;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') break;
        failed.push(nextIndex);
        appendLog(`重试第 ${nextIndex} 集失败：${e instanceof Error ? e.message : String(e)}`);
      }
    }
    currentPkg = runAutoLint(currentPkg);
    savePkg(currentPkg);
    if (failed.length > 0) setFailedEpisodeIndexes(failed);
    setTip(`重试完成 · 成功 ${ok}${failed.length > 0 ? ` · 失败 ${failed.length}` : ''}`);
    if (abortRef.current === ac) abortRef.current = null;
    setBusy(false);
  }, [appendLog, pkg, savePkg]);
  const handleContinueStart = useCallback(async () => {
    // resolve count
    let count = 0;
    if (continueCount === 'all') {
      const current = pkg.screenplay.episodes.length;
      const target = pkg.brief.episodeCount;
      if (typeof target === 'number' && target > current) {
        count = target - current;
      } else {
        count = 10;
      }
    } else {
      count = continueCount;
    }
    if (!count || count < 1) {
      setTip('续写集数需 ≥ 1');
      return;
    }
    if (count > 10 && !window.confirm(`即将续写 ${count} 集。是否继续？`)) {
      return;
    }
    setContinueOpen(false);
    setContinueBusy(true);
    // Q-03: 创建 AbortController
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    updateNodeData(props.id, { status: 'running', entryMode: 'agent' });
    const existingEpisodes = [...pkg.screenplay.episodes].sort((a, b) => a.index - b.index);
    const maxIndex = existingEpisodes.length > 0
      ? Math.max(...existingEpisodes.map((ep) => ep.index))
      : 0;
    const startIndex = maxIndex + 1;
    const endIndex = maxIndex + count;

    // write start message to session
    let nextSession = appendAgentMessage(session, {
      role: 'system',
      content: `续写开始 · 将追加 ${count} 集（第 ${startIndex}–${endIndex} 集）…`,
    });
    updateNodeData(props.id, { agentSession: nextSession });

    let currentPkg = pkg;
    let ok = 0;
    let failAt: number | null = null;
    let aborted = false;
    setSkeletonIndexes(Array.from({ length: count }, (_, i) => startIndex + i));
    for (let i = 0; i < count; i++) {
      if (ac.signal.aborted) { aborted = true; break; }
      const nextIndex = startIndex + i;
      // progress message
      nextSession = appendAgentMessage(nextSession, {
        role: 'system',
        content: `续写中 第 ${i + 1}/${count} 集（写入第 ${nextIndex} 集）…`,
      });
      updateNodeData(props.id, { agentSession: nextSession });
      setTip(`续写中 第 ${i + 1}/${count} 集（将写入第 ${nextIndex} 集）…`);
      try {
        const result = await runAppendEpisodeSkill(currentPkg, {
          nextEpisodeIndex: nextIndex,
          userInstruction: chatInput.trim() || undefined,
          signal: ac.signal,
        });
        if (result.patch) {
          currentPkg = touchScreenplayPackage(currentPkg, result.patch);
          if (currentPkg.status === 'confirmed') currentPkg = unconfirmIfEdited(currentPkg);
          savePkg(currentPkg);
          ok++;
          setSkeletonIndexes((prev) => prev.filter((idx) => idx !== nextIndex));

          // result message with body preview
          const newEp = currentPkg.screenplay.episodes.find((ep) => ep.index === nextIndex);
          const epTitle = newEp?.title || `第${nextIndex}集`;
          const bodyPreview = (newEp?.bodyMd || '').slice(0, 800);
          const truncatedNote = (newEp?.bodyMd || '').length > 800 ? '\n\n（完整正文已写入右侧成稿）' : '';
          nextSession = appendAgentMessage(nextSession, {
            role: 'assistant',
            content: `已续写第 ${nextIndex} 集《${epTitle}》\n\n${bodyPreview}${truncatedNote}`,
          });
          updateNodeData(props.id, { agentSession: nextSession });
        }
      } catch (e) {
        const isAbort = e instanceof DOMException && e.name === 'AbortError';
        if (isAbort) { aborted = true; break; }
        failAt = nextIndex;
        const errMsg = e instanceof Error ? e.message : String(e);
        nextSession = appendAgentMessage(nextSession, {
          role: 'system',
          content: `续写失败 · 第 ${nextIndex} 集：${errMsg}`,
        });
        updateNodeData(props.id, { agentSession: nextSession });
        appendLog(`续写第 ${nextIndex} 集失败：${errMsg}`);
        break;
      }
    }

    currentPkg = runAutoLint(currentPkg);
    savePkg(currentPkg);

    // completion message
    const summary = aborted
      ? `续写已停止 · 新增第 ${startIndex}–${startIndex + ok - 1} 集 · 成功 ${ok}`
      : ok > 0
        ? `续写完成 · 新增第 ${startIndex}–${startIndex + ok - 1} 集 · 成功 ${ok}${failAt != null ? ` · 第 ${failAt} 集失败` : ' · 全部成功'}`
        : '续写失败，未成功生成任何集';
    nextSession = appendAgentMessage(nextSession, {
      role: 'system',
      content: summary,
    });
    updateNodeData(props.id, { agentSession: nextSession });
    if (ok > 0) {
      appendLog(`续写完成 · 新增第 ${startIndex}–${startIndex + ok - 1} 集 · 成功 ${ok} · ${failAt != null ? `第 ${failAt} 集失败` : '全部成功'}`);
      setTip(aborted ? `已停止 · 新增 ${ok} 集` : `续写完成 · 新增 ${ok} 集`);
    } else {
      setTip(aborted ? '已停止' : '续写失败，未成功生成任何集');
    }
    if (abortRef.current === ac) abortRef.current = null;
    setSkeletonIndexes([]);
    setContinueBusy(false);
    updateNodeData(props.id, { status: 'success' });
    setChatInput('');
  }, [appendLog, chatInput, continueCount, pkg, props.id, savePkg, session, updateNodeData]);

  /** 重写本集：保留集号/id，替换正文；prompt 带上一集结尾与下一集开头以保证衔接 */

  /** E-01: 删除指定集并重排 index */
  const handleRemoveEpisode = useCallback(async (episodeId: string, epIndex: number) => {
    const target = pkg.screenplay.episodes.find((ep) => ep.id === episodeId);
    const ok = await confirmDelete({
      title: `删除第${epIndex}集「${target?.title || '未命名'}」？`,
      description: '删除后将重新编号后续集，不可就地撤销。',
    });
    if (!ok) return;
    let next = removeScreenplayEpisode(pkg, episodeId);
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next);
    setTip(`已删除第 ${epIndex} 集`);
    appendLog(`编剧台删集 · 第${epIndex}集`);
  }, [appendLog, pkg, savePkg]);

  const handleRewriteEpisode = useCallback(async (episodeIndex: number) => {
    if (busy || continueBusy || rewritingEpIndex != null) return;
    const target = pkg.screenplay.episodes.find((ep) => ep.index === episodeIndex);
    if (!target) {
      setTip(`第 ${episodeIndex} 集不存在`);
      return;
    }
    // Q-03: 创建 AbortController
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRewritingEpIndex(episodeIndex);
    setBusy(true);
    updateNodeData(props.id, { status: 'running', entryMode: 'agent' });

    let nextSession = appendAgentMessage(session, {
      role: 'system',
      content: `重写中 · 第 ${episodeIndex} 集《${target.title || '未命名'}》（衔接前后集）…`,
    });
    updateNodeData(props.id, { agentSession: nextSession });
    setTip(`重写中 · 第 ${episodeIndex} 集…`);

    try {
      const result = await runRewriteEpisodeSkill(pkg, {
        episodeIndex,
        userInstruction: chatInput.trim() || undefined,
        signal: ac.signal,
      });
      // E-05: 不直接落盘，改为 pending patch，用户应用后才写入
      nextSession = appendAgentMessage(nextSession, {
        role: 'assistant',
        content: `已重写第 ${episodeIndex} 集（待应用）\n\n` + (result.assistantText || ''),
        skillId: 'generate',
        pendingPatch: result.patch,
        applied: false,
      });
      nextSession = appendAgentMessage(nextSession, {
        role: 'system',
        content: `重写完成 · 第 ${episodeIndex} 集 · 请确认应用或丢弃`,
      });
      updateNodeData(props.id, { agentSession: nextSession, status: 'success' });
      setTip(`重写第 ${episodeIndex} 集已生成 · 请点「应用」写入或「丢弃」保留旧文`);
      appendLog(`编剧台重写第 ${episodeIndex} 集（pending）`);
      setRightTab('screenplay');
      setRightDrawerOpen(true);
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      const errMsg = e instanceof Error ? e.message : String(e);
      if (isAbort) {
        setTip(`已停止重写第 ${episodeIndex} 集`);
        appendLog(`重写第 ${episodeIndex} 集已停止`);
      } else {
        nextSession = appendAgentMessage(nextSession, {
          role: 'system',
          content: `重写失败 · 第 ${episodeIndex} 集：${errMsg}`,
        });
        updateNodeData(props.id, { agentSession: nextSession, status: 'error', error: errMsg });
        setTip(`重写失败：${errMsg}`);
        appendLog(`重写第 ${episodeIndex} 集失败：${errMsg}`);
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setRewritingEpIndex(null);
      setBusy(false);
    }
  }, [appendLog, busy, chatInput, continueBusy, pkg, props.id, rewritingEpIndex, savePkg, session, updateNodeData]);

  const handleExportPackage = useCallback(async () => {
    try {
      const blob = await api.scriptExport(pkg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'screenplay-package'}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setTip('剧本包已导出');
    } catch {
      setTip('导出失败，已降级为本地 JSON 导出');
      handleExportJson();
    }
  }, [api, handleExportJson, pkg, title]);

  const patchBriefTitle = useCallback((value: string) => {
    dirtyRef.current = true;
    let next = touchScreenplayPackage(pkg, { brief: { ...pkg.brief, title: value } });
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next);
  }, [pkg, savePkg]);

  const patchEpisodeBody = useCallback((episodeId: string, bodyMd: string) => {
    dirtyRef.current = true;
    const episodes = pkg.screenplay.episodes.map((ep) => (
      ep.id === episodeId
        ? { ...ep, bodyMd, updatedAt: new Date().toISOString() }
        : ep
    ));
    let next = touchScreenplayPackage(pkg, {
      screenplay: { ...pkg.screenplay, episodes },
    });
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next);
  }, [pkg, savePkg]);

  // B-01: 更新 Bible 人物卡片字段
  const patchBibleCharacter = useCallback((charId: string, field: string, value: string) => {
    dirtyRef.current = true;
    const chars = pkg.bible.characters.map((c) => c.id === charId ? { ...c, [field]: value } : c);
    savePkg(touchScreenplayPackage(pkg, { bible: { ...pkg.bible, characters: chars } }));
  }, [pkg, savePkg]);

  // B-01: 更新 Bible 场景卡片字段
  const patchBibleScene = useCallback((sceneId: string, field: string, value: string) => {
    dirtyRef.current = true;
    const scenes = pkg.bible.scenes.map((s) => s.id === sceneId ? { ...s, [field]: value } : s);
    savePkg(touchScreenplayPackage(pkg, { bible: { ...pkg.bible, scenes } }));
  }, [pkg, savePkg]);

  // B-04: 更新世界观字段
  const patchBibleWorld = useCallback((field: string, value: string) => {
    dirtyRef.current = true;
    savePkg(touchScreenplayPackage(pkg, { bible: { ...pkg.bible, world: { ...pkg.bible.world, [field]: value } } }));
  }, [pkg, savePkg]);

  // B-01: 删除 Bible 人物
  const removeBibleCharacter = useCallback(async (charId: string, name: string) => {
    const ok = await confirmDelete({ title: `删除设定人物「${name}」？`, description: '此操作不可撤销。' });
    if (!ok) return;
    dirtyRef.current = true;
    const chars = pkg.bible.characters.filter((c) => c.id !== charId);
    savePkg(touchScreenplayPackage(pkg, { bible: { ...pkg.bible, characters: chars } }));
    setEditingBibleId(null);
  }, [pkg, savePkg]);

  // B-01: 删除 Bible 场景
  const removeBibleScene = useCallback(async (sceneId: string, name: string) => {
    const ok = await confirmDelete({ title: `删除设定场景「${name}」？`, description: '此操作不可撤销。' });
    if (!ok) return;
    dirtyRef.current = true;
    const scenes = pkg.bible.scenes.filter((s) => s.id !== sceneId);
    savePkg(touchScreenplayPackage(pkg, { bible: { ...pkg.bible, scenes } }));
    setEditingBibleId(null);
  }, [pkg, savePkg]);

  // B-02: Bible 合并
  const handleBibleMerge = useCallback(async () => {
    if (mergeSelection.length !== 2 || !mergeType) return;
    const [idA, idB] = mergeSelection;
    if (mergeType === 'character') {
      const charA = pkg.bible.characters.find((c) => c.id === idA);
      const charB = pkg.bible.characters.find((c) => c.id === idB);
      if (!charA || !charB) return;
      const ok = await askConfirmWithOption({
        title: `合并人物「${charA.name}」与「${charB.name}」`,
        description: `当前以「${charA.name}」为主（保留其名称，合并「${charB.name}」的字段），确认后「${charB.name}」将被删除。`,
        confirmLabel: '合并',
        tone: 'danger',
        option: { label: `改为以「${charB.name}」为主` },
      });
      if (!ok.confirmed) return;
      const target = ok.optionChecked ? charB : charA;
      const source = ok.optionChecked ? charA : charB;
      const merged = {
        ...target,
        aliases: [...(target.aliases ?? []), ...(source.aliases ?? []).filter((a) => !(target.aliases ?? []).includes(a))],
        identity: target.identity || source.identity,
        personality: target.personality || source.personality,
        appearance: target.appearance || source.appearance,
        voiceNotes: target.voiceNotes || source.voiceNotes,
        fixedVisualKeywords: target.fixedVisualKeywords || source.fixedVisualKeywords,
      };
      const chars = pkg.bible.characters.filter((c) => c.id !== source.id).map((c) => (c.id === target.id ? merged : c));
      dirtyRef.current = true;
      savePkg(touchScreenplayPackage(pkg, { bible: { ...pkg.bible, characters: chars } }));
      setTip(`已合并人物：${source.name} → ${target.name}`);
    } else if (mergeType === 'scene') {
      const sceneA = pkg.bible.scenes.find((s) => s.id === idA);
      const sceneB = pkg.bible.scenes.find((s) => s.id === idB);
      if (!sceneA || !sceneB) return;
      const ok = await askConfirmWithOption({
        title: `合并场景「${sceneA.name}」与「${sceneB.name}」`,
        description: `当前以「${sceneA.name}」为主（保留其名称，合并「${sceneB.name}」的字段），确认后「${sceneB.name}」将被删除。`,
        confirmLabel: '合并',
        tone: 'danger',
        option: { label: `改为以「${sceneB.name}」为主` },
      });
      if (!ok.confirmed) return;
      const target = ok.optionChecked ? sceneB : sceneA;
      const source = ok.optionChecked ? sceneA : sceneB;
      const merged = { ...target, location: target.location || source.location, summary: target.summary || source.summary, era: target.era || source.era, dramaticFunction: target.dramaticFunction || source.dramaticFunction };
      const scenes = pkg.bible.scenes.filter((s) => s.id !== source.id).map((s) => (s.id === target.id ? merged : s));
      dirtyRef.current = true;
      savePkg(touchScreenplayPackage(pkg, { bible: { ...pkg.bible, scenes } }));
      setTip(`已合并场景：${source.name} → ${target.name}`);
    }
    setMergeSelection([]);
    setMergeType(null);
  }, [mergeSelection, mergeType, pkg, savePkg]);

  const toggleMergeSelect = useCallback((id: string, kind: 'character' | 'scene') => {
    setMergeType(kind);
    setMergeSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }, []);
  const handleInsertEmptyEpisode = useCallback((afterEpisodeId: string | null) => {
    dirtyRef.current = true;
    const next = insertEmptyEpisodeAfter(pkg, afterEpisodeId);
    savePkg(next);
    setTip(afterEpisodeId ? '已插入空集' : '已插入首集');
  }, [pkg, savePkg]);

  // E-09: 拖拽重排集序
  const handleEpisodeReorder = useCallback((dragId: string, dropId: string) => {
    if (dragId === dropId) return;
    dirtyRef.current = true;
    const episodes = [...pkg.screenplay.episodes];
    const dragIdx = episodes.findIndex((e) => e.id === dragId);
    const dropIdx = episodes.findIndex((e) => e.id === dropId);
    if (dragIdx === -1 || dropIdx === -1) return;
    const [removed] = episodes.splice(dragIdx, 1);
    episodes.splice(dropIdx, 0, removed);
    const reindexed = episodes.map((ep, i) => ({ ...ep, index: i + 1 }));
    let next = touchScreenplayPackage(pkg, { screenplay: { ...pkg.screenplay, episodes: reindexed } });
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next);
    setTip('已重排集序');
  }, [pkg, savePkg]);

  // E-03: 滚动到指定集
  const scrollToEpisode = useCallback((epId: string) => {
    const el = document.getElementById(`sd2-ep-${epId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // X-03: Ctrl+Z listener（不在 textarea/input 中触发）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!studioOpen) return;
      if (e.key !== 'z' || !e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (undoStackRef.current.length === 0) return;
      e.preventDefault();
      const prev = undoStackRef.current.pop()!;
      savePkg(prev);
      setTip('已撤销');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [studioOpen, savePkg]);

  // D-01: 生成/续写完成后自动格式化诊断
  const clearSession = useCallback(() => {
    updateNodeData(props.id, {
      agentSession: { messages: [], updatedAt: new Date().toISOString() },
    });
  }, [props.id, updateNodeData]);

  const showTimedTip = useCallback((message: string, ms = 3000) => {
    if (tipClearRef.current) clearTimeout(tipClearRef.current);
    setTip(message);
    tipClearRef.current = setTimeout(() => {
      setTip('');
      tipClearRef.current = null;
    }, ms);
  }, []);

  // S-01: 自动工作草稿定时存储（每 60s）
  useEffect(() => {
    if (!studioOpen || !hasDraftMemory) return;
    const id = setInterval(() => {
      const { isNew } = upsertScriptDeskWorkingDraft({
        package: pkg,
        agentSession: session,
        entryMode,
        sourceBlockId: props.id,
      });
      if (isNew) showTimedTip('已自动保存到草稿「工作中」');
      dirtyRef.current = false;
    }, 60000);
    autoSaveTimerRef.current = id;
    return () => {
      clearInterval(id);
      autoSaveTimerRef.current = null;
    };
  }, [studioOpen, hasDraftMemory, pkg, session, entryMode, props.id, upsertScriptDeskWorkingDraft, showTimedTip]);

  // S-02: beforeunload 离开提示
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const applyDeskSnapshot = useCallback((folder: {
    package: ScreenplayPackage;
    agentSession: ScriptDeskAgentSession;
    entryMode?: EntryMode;
  }) => {
    persistScriptDeskPackage(updateNodeData, props.id, folder.package, {
      agentSession: folder.agentSession,
      entryMode: folder.entryMode ?? 'agent',
    });
    setEntryMode(folder.entryMode ?? 'agent');
    setIngestText(screenplayFullText(folder.package));
    setChatInput('');
    setRightTab('screenplay');
  }, [props.id, setEntryMode, updateNodeData]);

  const resetDeskToEmpty = useCallback(() => {
    const empty = emptyScreenplayPackage();
    persistScriptDeskPackage(updateNodeData, props.id, empty, {
      agentSession: { messages: [], updatedAt: new Date().toISOString() },
      entryMode: 'agent',
      status: 'idle',
    });
    setEntryMode('agent');
    setIngestText('');
    setChatInput('');
    setActiveSkills(['generate']);
    setRightTab('screenplay');
    setContinueOpen(false);
    setFirstGenFloatDeferred(false);
    setGenFloatExpanded(true);
  }, [props.id, setEntryMode, updateNodeData]);

  const handleResetDesk = useCallback(async () => {
    if (busy || continueBusy || rewritingEpIndex != null) {
      showTimedTip('运行中无法重置');
      return;
    }
    if (!hasDraftMemory) {
      showTimedTip('当前编剧台已是空台，无需重置');
      return;
    }
    const result = await askConfirmWithOption({
      title: '确定重置编剧台？',
      description: '将清空当前剧集、设定、对话与相关成稿内容，此操作不可就地撤销。',
      confirmLabel: '确认重置',
      cancelLabel: '取消',
      tone: 'danger',
      option: {
        label: '重置前将当前内容存入草稿箱（不勾选则移入私有项目资源回收站）',
        defaultChecked: true,
      },
    });
    if (!result.confirmed) return;

    const snapshotInput = {
      package: pkg,
      agentSession: session,
      entryMode,
      sourceBlockId: props.id,
    };
    if (result.optionChecked) {
      const folder = saveScriptDeskDraft(snapshotInput);
      toastSuccess(`已存入草稿「${folder.title}」并重置编剧台`);
      showTimedTip(`已存入草稿「${folder.title}」· 编剧台已初始化`);
    } else {
      const folder = trashScriptDeskSnapshot(snapshotInput);
      toastSuccess(`「${folder.title}」已移入回收站，编剧台已重置`);
      showTimedTip(`「${folder.title}」已进回收站 · 编剧台已初始化`);
    }
    resetDeskToEmpty();
    setDraftsOpen(false);
  }, [
    entryMode, hasDraftMemory, pkg, props.id, resetDeskToEmpty,
    saveScriptDeskDraft, session, showTimedTip, trashScriptDeskSnapshot,
  ]);

  const handleOpenDraftFolder = useCallback((draftId: string) => {
    const folder = getScriptDeskDraft(draftId);
    if (!folder) {
      showTimedTip('草稿不存在或已删除');
      return;
    }

    if (hasDraftMemory) {
      const auto = saveScriptDeskDraft({
        package: pkg,
        agentSession: session,
        entryMode,
        sourceBlockId: props.id,
      });
      showTimedTip(`当前《${auto.title}》已自动存入草稿`);
      toastSuccess(`当前《${auto.title}》已自动存入草稿`);
    }

    applyDeskSnapshot(folder);
    setDraftsOpen(false);
    setRightDrawerOpen(true);
  }, [
    applyDeskSnapshot, entryMode, getScriptDeskDraft, hasDraftMemory,
    pkg, props.id, saveScriptDeskDraft, session, showTimedTip,
  ]);

  const handleDeleteDraftFolder = useCallback(async (draftId: string, draftTitle: string) => {
    const ok = await confirmDelete({
      title: `删除草稿「${draftTitle}」？`,
      description: '将移入私有项目资源回收站，可在回收站恢复到草稿箱。',
    });
    if (!ok) return;
    const moved = moveScriptDeskDraftToTrash(draftId);
    if (moved) {
      toastSuccess(`「${draftTitle}」已移入回收站`);
      showTimedTip(`「${draftTitle}」已移入回收站`);
    }
  }, [moveScriptDeskDraftToTrash, showTimedTip]);

  const onChatContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setChatMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // S-01/S-02: 关台前 upsert 工作草稿；dirty 时确认
  const handleCloseStudio = useCallback(async () => {
    if (hasDraftMemory && dirtyRef.current) {
      const result = await askConfirmWithOption({
        title: '关闭前保存到草稿？',
        description: '当前有未保存到工作草稿的修改。',
        confirmLabel: '保存并关闭',
        cancelLabel: '取消',
        tone: 'neutral',
        option: {
          label: '放弃本次修改（不会丢手动存的草稿）',
          defaultChecked: false,
        },
      });
      if (!result.confirmed) return;
      if (!result.optionChecked) {
        upsertScriptDeskWorkingDraft({
          package: pkg,
          agentSession: session,
          entryMode,
          sourceBlockId: props.id,
        });
      }
    } else if (hasDraftMemory) {
      upsertScriptDeskWorkingDraft({
        package: pkg,
        agentSession: session,
        entryMode,
        sourceBlockId: props.id,
      });
    }
    setStudioOpen(false);
  }, [hasDraftMemory, pkg, session, entryMode, props.id, upsertScriptDeskWorkingDraft, dirtyRef]);

  const skillName = activeSkills[0] ? SKILL_CHIPS.find((s) => s.id === activeSkills[0])?.label : '';

  return (
    <BlockShell {...props}>
      <div className="sd2-card nodrag nopan">
        <div
          className="sd2-card__clickable"
          role="button"
          tabIndex={0}
          onClick={() => setStudioOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setStudioOpen(true);
            }
          }}
        >
          <div className="sd2-card__header">
            <span className="sd2-card__eyebrow">编剧台 · 成稿</span>
            <span className={`sd2-card__badge ${pkg.status === 'confirmed' ? 'is-ok' : ''}`}>
              {pkg.status === 'confirmed' ? '已确认' : '草稿'}
            </span>
          </div>
          <div className="sd2-card__title">{title}</div>
          <div className="sd2-card__meta">
            {epCount} 集 · 设定 角 {charCount} · 场 {sceneCount}
            {connectedPictureGenId ? ' · 已连出图' : ''}
          </div>
          <div className="sd2-card__logline">{logline ? compact(logline, 72) : '点击打开编剧台 · Agent 共创或上传成稿'}</div>
          <div className="sd2-card__actions">
            <button type="button" className="sd2-btn sd2-btn--ghost" onClick={(e) => { e.stopPropagation(); setStudioOpen(true); }}>打开编剧台</button>
          </div>
        </div>
      </div>

      <ScreenModal
        open={studioOpen}
        onClose={handleCloseStudio}
        title="编剧台"
        subtitle="共创成稿 → 抽取设定 → 确认交付"
        width="min(1180px, 100vw - 32px)"
        variant="default"
        className="sd2-modal"
        headerRight={(
          <div className="sd2-header-right">
            <div className="sd2-mode-seg" role="group" aria-label="创作入口">
              <button
                type="button"
                className={`sd2-mode-seg__btn ${entryMode === 'agent' && activeSkills.includes('generate') ? 'is-on' : ''}`}
                onClick={() => {
                  setEntryMode('agent');
                  toggleSkill('generate');
                  if (pkg.screenplay.episodes.length === 0) {
                    openFirstGenFloat(pkg);
                  }
                }}
              >
                <Wand2 size={13} strokeWidth={2} />
                生成剧本
              </button>
              <button
                type="button"
                className={`sd2-mode-seg__btn ${entryMode === 'ingest' ? 'is-on' : ''}`}
                disabled={busy || continueBusy || rewritingEpIndex != null}
                onClick={() => setEntryMode('ingest')}
              >
                <FileUp size={13} strokeWidth={2} />
                上传成稿
              </button>
            </div>

            <div className="sd2-tool-strip" role="group" aria-label="工具">
              <button
                type="button"
                className={`sd2-tool ${rightDrawerOpen && rightTab !== 'diagnostics' ? 'is-on' : ''}`}
                onClick={() => setRightDrawerOpen((v) => !v)}
                title="稿纸"
                aria-label="稿纸"
                aria-pressed={rightDrawerOpen}
              >
                <FileText size={15} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className={`sd2-tool ${rightDrawerOpen && rightTab === 'diagnostics' ? 'is-on' : ''} ${diagCount > 0 ? 'has-badge' : ''}`}
                onClick={() => {
                  setRightDrawerOpen(true);
                  setRightTab('diagnostics');
                }}
                title={diagCount > 0 ? `诊断 · ${diagCount} 条` : '诊断'}
                aria-label={diagCount > 0 ? `诊断，${diagCount} 条` : '诊断'}
              >
                <Stethoscope size={15} strokeWidth={1.75} />
                {diagCount > 0 ? (
                  <span className="sd2-tool__badge sd2-tool__badge--warn">{diagCount}</span>
                ) : null}
              </button>
              <button
                type="button"
                className="sd2-tool"
                disabled={busy || continueBusy || rewritingEpIndex != null}
                onClick={() => void handleExtractBible()}
                title="抽取设定"
                aria-label="抽取设定"
              >
                <Sparkles size={15} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className={`sd2-tool ${draftsOpen ? 'is-on' : ''}`}
                disabled={busy || continueBusy || rewritingEpIndex != null}
                onClick={() => setDraftsOpen(true)}
                title="草稿箱"
                aria-label={`草稿箱${scriptDeskDrafts.length > 0 ? `，${scriptDeskDrafts.length} 份` : ''}`}
              >
                <FolderOpen size={15} strokeWidth={1.75} />
                {scriptDeskDrafts.length > 0 ? (
                  <span className="sd2-tool__badge">{scriptDeskDrafts.length}</span>
                ) : null}
              </button>
              <button
                type="button"
                className="sd2-tool sd2-tool--danger"
                disabled={busy || continueBusy || rewritingEpIndex != null}
                onClick={() => void handleResetDesk()}
                title="重置编剧台"
                aria-label="重置编剧台"
              >
                <RotateCcw size={15} strokeWidth={1.75} />
              </button>
            </div>

            {pkg.status === 'confirmed' ? (
              <button type="button" className="sd2-btn sd2-btn--primary" disabled={busy} onClick={handleHandoffToStoryboard}>
                <Send size={14} /> 送到分镜台
              </button>
            ) : (
              <button
                type="button"
                className="sd2-btn sd2-btn--primary"
                disabled={busy || !screenplayFullText(pkg).trim()}
                onClick={handleConfirm}
              >
                <Check size={14} /> 确认成稿
              </button>
            )}

            <div className="sd2-more-wrap">
              <button type="button" className="sd2-tool" onClick={() => setShowMoreMenu((v) => !v)} aria-label="更多" title="更多">⋯</button>
              {showMoreMenu && (
                <div className="sd2-more-menu">
                  <button type="button" onClick={() => { handleExportMd(); setShowMoreMenu(false); }}>导出 MD</button>
                  <button type="button" onClick={() => { handleExportJson(); setShowMoreMenu(false); }}>导出 JSON</button>
                  <button type="button" onClick={() => { void handleExportPackage(); setShowMoreMenu(false); }}>导出 ZIP</button>
                  {!!legacyBreakdown && (
                    <div className="sd2-more-menu__warn">检测到旧版分镜表</div>
                  )}
                  {isDevPromptEnabled() && (
                    <div className="sd2-more-menu__dev">
                      <ScriptDeskDevPackOverlay pkg={pkg} session={session} savePkg={savePkg} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      >
        {/* 首次生成选集数：对话区底浮层（由「应用」成功触发；顶栏/右侧亦可打开） */}

        {draftsOpen && (
          <div className="sd2-overlay" onClick={() => setDraftsOpen(false)}>
            <div className="sd2-popup sd2-popup--drafts" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="编剧台草稿箱">
              <h3 className="sd2-popup__title">草稿箱</h3>
              <p className="sd2-popup__desc">每个剧本一个文件夹。打开会回显到编剧台；若当前有制作中内容，会先自动存入草稿。</p>
              {scriptDeskDrafts.length === 0 ? (
                <div className="sd2-drafts-empty">暂无草稿</div>
              ) : (
                <ul className="sd2-drafts-list">
                  {scriptDeskDrafts.map((folder) => (
                    <li key={folder.id} className="sd2-draft-folder">
                      <div className="sd2-draft-folder__icon" aria-hidden>
                        <FolderOpen size={18} />
                      </div>
                      <div className="sd2-draft-folder__meta">
                        <div className="sd2-draft-folder__title">
                          {renamingDraftId === folder.id ? (
                            <input
                              className="sd2-draft-folder__rename-input"
                              value={renamingDraftText}
                              onChange={(e) => setRenamingDraftText(e.target.value)}
                              onBlur={() => {
                                if (renamingDraftText.trim() && renamingDraftText !== folder.title) {
                                  renameScriptDeskDraft(folder.id, renamingDraftText);
                                }
                                setRenamingDraftId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (renamingDraftText.trim() && renamingDraftText !== folder.title) {
                                    renameScriptDeskDraft(folder.id, renamingDraftText);
                                  }
                                  setRenamingDraftId(null);
                                } else if (e.key === 'Escape') {
                                  setRenamingDraftId(null);
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <span
                              className="sd2-draft-folder__title-text"
                              title="双击改名"
                              onDoubleClick={() => {
                                setRenamingDraftId(folder.id);
                                setRenamingDraftText(folder.title);
                              }}
                            >
                              {folder.title}
                            </span>
                          )}
                          {folder.kind === 'autosave' && (
                            <span className="sd2-draft-folder__tag">自动</span>
                          )}
                          {folder.sourceBlockId && (
                            <span className="sd2-draft-folder__tag" title={folder.sourceBlockId}>源：{compact(folder.sourceBlockId, 20)}</span>
                          )}
                        </div>
                        <div className="sd2-draft-folder__sub">
                          {folder.episodeCount} 集 · {folder.wordCount} 字 · {new Date(folder.savedAt).toLocaleString()}
                          {folder.package.screenplay.episodes.length > 0 && (
                            <span className="sd2-draft-folder__preview">
                              {folder.package.screenplay.episodes.slice(0, 3).map((ep) => `第${ep.index}集 ${ep.title || '未命名'}`).join(' · ')}
                              {folder.package.screenplay.episodes.length > 3 ? ` …共${folder.package.screenplay.episodes.length}集` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="sd2-draft-folder__acts">
                        <button
                          type="button"
                          className="sd2-btn sd2-btn--primary"
                          disabled={busy || continueBusy || rewritingEpIndex != null}
                          onClick={() => handleOpenDraftFolder(folder.id)}
                        >
                          打开
                        </button>
                        <button
                          type="button"
                          className="sd2-btn sd2-btn--ghost"
                          disabled={busy || continueBusy || rewritingEpIndex != null}
                          title="删除到回收站"
                          onClick={() => void handleDeleteDraftFolder(folder.id, folder.title)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="sd2-popup__acts">
                <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setDraftsOpen(false)}>关闭</button>
              </div>
            </div>
          </div>
        )}

        <div className="sd2-layout" onClick={() => { if (showMoreMenu) setShowMoreMenu(false); if (epMoreMenuId) setEpMoreMenuId(null); if (chatMenu) setChatMenu(null); }}>
          <div className="sd2-flow">
            <span className={`sd2-flow__step${pkg.brief.title?.trim() || pkg.brief.logline?.trim() ? ' is-done' : ''}${!hasDraftMemory ? ' is-on' : ''}`}>1 共创</span>
            <span className="sd2-flow__arrow" aria-hidden>→</span>
            <span className={`sd2-flow__step${epCount > 0 ? ' is-done' : ''}${hasDraftMemory && epCount === 0 ? ' is-on' : ''}`}>2 成稿</span>
            <span className="sd2-flow__arrow" aria-hidden>→</span>
            <span className={`sd2-flow__step${pkg.status === 'confirmed' ? ' is-done' : ''}${epCount > 0 && pkg.status !== 'confirmed' ? ' is-on' : ''}`}>3 确认</span>
          </div>

          <div className="sd2-skill-rail" role="tablist" aria-label="创作技能">
            {(['brief', 'draft', 'qa'] as const).map((seg) => (
              <div className="sd2-skill-seg" key={seg}>
                <span className="sd2-skill-seg__label">
                  {seg === 'brief' ? '大纲' : seg === 'draft' ? '成稿' : '质检'}
                </span>
                {SKILL_CHIPS.filter((skill) => skill.segment === seg && skill.id !== 'generate').map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    role="tab"
                    aria-selected={activeSkills.includes(skill.id)}
                    className={`sd2-skill-chip ${activeSkills.includes(skill.id) ? 'is-on' : ''}`}
                    onClick={() => { setEntryMode('agent'); toggleSkill(skill.id); }}
                  >
                    {skill.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="sd2-skill-hint">
            {entryMode === 'agent' && skillName ? `本轮技能 · ${skillName}` : '\u00a0'}
          </div>

          <div
            className={`sd2-body${splitDragging ? ' is-splitting' : ''}`}
            ref={bodyRef}
            style={{ '--sd2-left-pct': `${leftPanePct}%` } as CSSProperties}
          >
            <div className="sd2-stage">
              {entryMode === 'ingest' ? (
                <div className="sd2-ingest">
                  <div className="sd2-ingest__intro">
                    <h3>导入已有成稿</h3>
                    <p>支持拖放或粘贴；写入后可抽取设定，再确认交付。</p>
                  </div>
                  <div className="sd2-ingest__drop">
                    <FileUp size={22} strokeWidth={1.5} />
                    <span>拖放 .txt / .md 到此处</span>
                    <button type="button" className="sd2-btn" onClick={() => fileRef.current?.click()}>选择文件</button>
                    <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
                  </div>
                  <textarea
                    className="sd2-ingest__textarea"
                    value={ingestText}
                    onChange={(e) => setIngestText(e.target.value)}
                    placeholder="或直接粘贴小说 / 分集剧本… 支持「第N集」标题自动分集"
                  />
                  <div className="sd2-ingest__actions">
                    <button type="button" className="sd2-btn sd2-btn--primary" onClick={handleIngestSave}>写入成稿</button>
                    <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setEntryMode('agent')}>改用 Agent 共创</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`sd2-stage-chat${showGenFloat ? ' has-gen-float' : ''}`}>
                  <div className="sd2-messages" onContextMenu={onChatContextMenu}>
                    {session.messages.length === 0 && !hasDraftMemory && (
                      <div className="sd2-empty-hero">
                        <p className="sd2-empty-hero__eyebrow">Agent 共创</p>
                        <h3 className="sd2-empty-hero__title">从选题到成稿，一步一步写清楚</h3>
                        <p className="sd2-empty-hero__desc">先点上方技能，再用自然语言说明本轮目标。产出需点「应用」才会写入稿纸。</p>
                        <div className="sd2-empty-hero__entries">
                          <button
                            type="button"
                            className="sd2-empty-hero__entry"
                            onClick={() => { setEntryMode('agent'); toggleSkill('topic'); }}
                          >
                            <MessageSquareText size={18} strokeWidth={1.5} />
                            <span>Agent 共创</span>
                            <small>从选题、世界观、人物开始，AI 陪你写完</small>
                          </button>
                          <button
                            type="button"
                            className="sd2-empty-hero__entry"
                            onClick={() => setEntryMode('ingest')}
                          >
                            <FileUp size={18} strokeWidth={1.5} />
                            <span>上传成稿</span>
                            <small>已有小说/剧本，导入后抽设定再确认交付</small>
                          </button>
                          <button
                            type="button"
                            className="sd2-empty-hero__entry"
                            onClick={() => setDraftsOpen(true)}
                          >
                            <FolderOpen size={18} strokeWidth={1.5} />
                            <span>打开草稿</span>
                            <small>继续之前存下的剧本草稿</small>
                          </button>
                        </div>
                        <div className="sd2-empty-hero__hints">
                          {(['topic', 'character', 'plot'] as ScriptDeskSkillId[]).map((id) => {
                            const label = SKILL_CHIPS.find((s) => s.id === id)?.label ?? id;
                            return (
                              <button
                                key={id}
                                type="button"
                                className="sd2-empty-hero__chip"
                                onClick={() => { setEntryMode('agent'); toggleSkill(id); }}
                              >
                                从「{label}」开始
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {session.messages.length === 0 && hasDraftMemory && (
                      <div className="sd2-chat-blank" aria-label="空白对话">
                        <p className="sd2-chat-blank__hint">
                          对话已清空 · 《{title}》成稿记忆仍在，可继续共创或续写
                        </p>
                      </div>
                    )}
                    {session.messages.map((m) => {
                      const summaryLines = m.pendingPatch && !m.applied && !m.discarded
                        ? summarizePackagePatch(pkg, m.pendingPatch)
                        : null;
                      return (
                      <div key={m.id} className={`sd2-msg sd2-msg--${m.role}`}>
                        <div className="sd2-msg__meta">
                          {m.role === 'user' ? '你' : m.role === 'assistant' ? '编剧 Agent' : '系统'}
                          {m.skillId ? ` · ${m.skillId}` : ''}
                        </div>
                        <div className="sd2-msg__body">{m.content}</div>
                        {m.pendingPatch && !m.applied && !m.discarded && (
                          <div className="sd2-msg__patch-sum">
                            <div className="sd2-msg__patch-sum-title">将写入变更：</div>
                            {summaryLines && summaryLines.map((line, i) => (
                              <div key={i} className="sd2-msg__patch-sum-line">{line}</div>
                            ))}
                            <div className="sd2-msg__apply-row">
                              <button type="button" className="sd2-btn sd2-btn--primary" onClick={() => handleApplyMessage(m.id)}>应用</button>
                              <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => handleDiscardMessage(m.id)}>丢弃</button>
                            </div>
                          </div>
                        )}
                        {m.applied && <div className="sd2-msg__applied">已应用</div>}
                        {m.discarded && <div className="sd2-msg__applied" style={{ color: 'var(--sd2-faint)' }}>已丢弃</div>}
                      </div>
                      );
                    })}
                  </div>
                  {showGenFloat && (
                    <div
                      className={`sd2-gen-float${genFloatExpanded ? ' is-expanded' : ' is-collapsed'}`}
                      role="dialog"
                      aria-label="选择生成集数"
                      aria-expanded={genFloatExpanded}
                    >
                      {/* 升旗：点弧朝上把手后，选集自下向上升起 */}
                      <div className="sd2-gen-float__sail" aria-hidden={!genFloatExpanded}>
                        <div className="sd2-gen-float__sail-inner">
                          <div className="sd2-gen-float__panel">
                            <div className="sd2-gen-float__body">
                              <div className="sd2-gen-float__opts">
                                {([1, 2, 3, 5, 10] as const).map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    className={`sd2-gen-float__opt ${genEpisodeCount === n ? 'is-on' : ''}`}
                                    onClick={() => setGenEpisodeCount(n)}
                                    tabIndex={genFloatExpanded ? 0 : -1}
                                  >
                                    {n}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className={`sd2-gen-float__opt ${genEpisodeCount === 'all' ? 'is-on' : ''}`}
                                  onClick={() => setGenEpisodeCount('all')}
                                  tabIndex={genFloatExpanded ? 0 : -1}
                                >
                                  全部
                                </button>
                              </div>
                              <div className="sd2-gen-float__acts">
                                <button
                                  type="button"
                                  className="sd2-gen-float__later"
                                  disabled={busy}
                                  tabIndex={genFloatExpanded ? 0 : -1}
                                  onClick={() => {
                                    setFirstGenFloatDeferred(true);
                                    setGenFloatExpanded(false);
                                    setTip('已收起 · 点底边半圆或右侧「生成分集」可再开');
                                  }}
                                >
                                  稍后
                                </button>
                                <button
                                  type="button"
                                  className="sd2-btn sd2-btn--primary sd2-gen-float__go"
                                  disabled={busy}
                                  tabIndex={genFloatExpanded ? 0 : -1}
                                  onClick={() => void handleGenStart()}
                                >
                                  {busy ? '生成中…' : '开始'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="sd2-gen-float__tab"
                        onClick={() => setGenFloatExpanded(true)}
                        aria-label="向上展开选集浮层"
                        title="向上展开"
                        tabIndex={genFloatExpanded ? -1 : 0}
                        aria-hidden={genFloatExpanded}
                      >
                        <ChevronUp size={11} strokeWidth={2.75} aria-hidden />
                      </button>
                    </div>
                  )}
                  </div>
                  <div className="sd2-input-bar">
                    <div className="sd2-input-wrap">
                      <textarea
                        className="sd2-input"
                        value={chatInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setChatInput(val);
                          const lastChar = val.slice(-1);
                          const prevChar = val.length > 1 ? val.slice(-2, -1) : '';
                          if (lastChar === '@' && prevChar !== '@') { setAtOpen(true); }
                          else if (atOpen && (lastChar === ' ' || lastChar === '\n')) { setAtOpen(false); }
                        }}
                        placeholder={skillName ? `围绕「${skillName}」描述本轮目标…  Ctrl/⌘+Enter 发送` : '描述本轮目标… 可跳步，不必走完所有技能'}
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setAtOpen(false); return; }
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void handleAgentSend(); }
                        }}
                      />
                      {atOpen && (pkg.bible.characters.length > 0 || pkg.bible.scenes.length > 0 || hasLibraryItems) && (
                        <div className="sd2-at-dropdown">
                          {(pkg.bible.characters.length > 0 || pkg.bible.scenes.length > 0) && (
                            <div className="sd2-at-dropdown__group">设定草稿</div>
                          )}
                          {pkg.bible.characters.map((c) => (
                            <button key={c.id} type="button" className="sd2-at-dropdown__item" onClick={() => { setChatInput((prev) => prev.replace(/@\s*$/, `@${c.name} `)); setAtOpen(false); }}>人物：{c.name}</button>
                          ))}
                          {pkg.bible.scenes.map((s) => (
                            <button key={s.id} type="button" className="sd2-at-dropdown__item" onClick={() => { setChatInput((prev) => prev.replace(/@\s*$/, `@${s.name} `)); setAtOpen(false); }}>场景：{s.name}</button>
                          ))}
                          {hasLibraryItems && (
                            <>
                              <div className="sd2-at-dropdown__group">素材库</div>
                              {libChars.map((item) => (
                                <button key={item.id} type="button" className="sd2-at-dropdown__item" onClick={() => { setChatInput((prev) => prev.replace(/@\s*$/, `@角色:${item.label} `)); setAtOpen(false); }}>人物：{item.label}</button>
                              ))}
                              {libScenes.map((item) => (
                                <button key={item.id} type="button" className="sd2-at-dropdown__item" onClick={() => { setChatInput((prev) => prev.replace(/@\s*$/, `@场景:${item.label} `)); setAtOpen(false); }}>场景：{item.label}</button>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="sd2-btn sd2-btn--primary"
                      onClick={busy ? () => abortRef.current?.abort() : () => void handleAgentSend()}
                    >
                      {busy ? <Loader2 size={14} className="sd-spin" /> : <MessageSquareText size={14} />}
                      {busy ? '停止' : '发送'}
                    </button>
                  </div>
                  {(pkg.bible.characters.length > 0 || hasLibraryItems) && (
                    <div className="sd2-ref-hint">
                      @ 可引用 {[...pkg.bible.characters.map((c) => c.name), ...libChars.map((i) => i.label)].slice(0, 6).join('、')}
                      {(pkg.bible.scenes.length > 0 || libScenes.length > 0) && ` · ${[...pkg.bible.scenes.map((s) => s.name), ...libScenes.map((i) => i.label)].slice(0, 4).join('、')}`}
                    </div>
                  )}
                </>
              )}
            </div>

            {rightDrawerOpen && (
              <div
                className={`sd2-split nodrag nopan${splitDragging ? ' is-dragging' : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label="拖拽调整左右面板宽度"
                aria-valuenow={Math.round(leftPanePct)}
                aria-valuemin={SPLIT_MIN}
                aria-valuemax={SPLIT_MAX}
                title="拖拽调整左右宽度 · 双击恢复 60/40"
                onPointerDown={onSplitterPointerDown}
                onPointerMove={onSplitterPointerMove}
                onPointerUp={onSplitterPointerUp}
                onPointerCancel={onSplitterPointerUp}
                onDoubleClick={onSplitterDoubleClick}
              />
            )}

            {rightDrawerOpen && (
              <aside className="sd2-drawer" aria-label="成稿稿纸">
                <div className="sd2-drawer__tabs">
                  <button type="button" className={rightTab === 'screenplay' ? 'is-on' : ''} onClick={() => setRightTab('screenplay')}>成稿</button>
                  <button type="button" className={rightTab === 'bible' ? 'is-on' : ''} onClick={() => setRightTab('bible')}>设定</button>
                  <button type="button" className={rightTab === 'readiness' ? 'is-on' : ''} onClick={() => setRightTab('readiness')}>设定就绪</button>
                  <button type="button" className={rightTab === 'diagnostics' ? 'is-on' : ''} onClick={() => setRightTab('diagnostics')}>诊断</button>
                </div>
                {showUnconfirmBanner && (
                  <div className="sd2-unconfirm-banner">
                    成稿已修改，确认已失效，送分镜前请重新确认
                  </div>
                )}
                <div className="sd2-drawer__body">
                  {rightTab === 'screenplay' && (
                    <>
                      <div className="sd2-drawer__head">
                      <div className="sd2-meta">
                        
                        <div className="sd2-brief-row">
                        <label className="sd2-field">
                          <span className="sd2-field__label">剧名</span>
                          <input value={pkg.brief.title ?? ''} onChange={(e) => patchBriefTitle(e.target.value)} placeholder="剧名" />
                        </label>
                        <label className="sd2-field">
                          <span className="sd2-field__label">一句话故事</span>
                          <input value={pkg.brief.logline ?? ''} onChange={(e) => { dirtyRef.current = true; let next = touchScreenplayPackage(pkg, { brief: { ...pkg.brief, logline: e.target.value } }); if (pkg.status === 'confirmed') next = unconfirmIfEdited(next); savePkg(next); }} placeholder="一句话故事" />
                        </label>
                        <label className="sd2-field sd2-field--count">
                          <span className="sd2-field__label">目标集数</span>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={pkg.brief.episodeCount ?? ''}
                            onChange={(e) => {
                              dirtyRef.current = true;
                              const v = e.target.valueAsNumber;
                              let next = touchScreenplayPackage(pkg, { brief: { ...pkg.brief, episodeCount: Number.isFinite(v) && v >= 1 ? v : undefined } });
                              if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
                              savePkg(next);
                            }}
                            placeholder="—"
                          />
                        </label>
                        </div>
                      </div>
                      <div className="sd2-rail">
                        <div className="sd2-rail__head">
                          <span className="sd2-rail__title">爆点</span>
                          <span className="sd2-rail__meta">{(pkg.brief.hooks ?? []).length}</span>
                          <button
                            type="button"
                            className="sd2-rail__add"
                            title="添加爆点"
                            aria-label="添加爆点"
                            onClick={() => {
                              dirtyRef.current = true;
                              let next = touchScreenplayPackage(pkg, { brief: { ...pkg.brief, hooks: [...(pkg.brief.hooks ?? []), ''] } });
                              if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
                              savePkg(next);
                            }}
                          >
                            <Plus size={12} strokeWidth={2} aria-hidden />
                            添加
                          </button>
                        </div>
                        <div className="sd2-rail__body">
                          {(pkg.brief.hooks ?? []).length === 0 ? (
                            <span className="sd2-rail__empty">暂无爆点，点击右上角添加</span>
                          ) : (
                            (pkg.brief.hooks ?? []).map((hook, i) => (
                              <span key={i} className="sd2-hook-chip" title={hook || `爆点 ${i + 1}`}>
                                <span className="sd2-hook-chip__idx" aria-hidden>{i + 1}</span>
                                <input
                                  value={hook}
                                  onChange={(e) => {
                                    dirtyRef.current = true;
                                    const hooks = [...(pkg.brief.hooks ?? [])];
                                    hooks[i] = e.target.value;
                                    let next = touchScreenplayPackage(pkg, { brief: { ...pkg.brief, hooks } });
                                    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
                                    savePkg(next);
                                  }}
                                  className="sd2-hook-chip__input"
                                  placeholder={`爆点 ${i + 1}`}
                                />
                                <button
                                  type="button"
                                  className="sd2-hook-chip__del"
                                  aria-label={`删除爆点 ${i + 1}`}
                                  onClick={() => {
                                    dirtyRef.current = true;
                                    const hooks = [...(pkg.brief.hooks ?? [])];
                                    hooks.splice(i, 1);
                                    let next = touchScreenplayPackage(pkg, { brief: { ...pkg.brief, hooks } });
                                    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
                                    savePkg(next);
                                  }}
                                >
                                  <X size={11} strokeWidth={2} aria-hidden />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      {pkg.screenplay.episodes.length > 0 && (
                        <div className="sd2-jump">
                          <div className="sd2-jump__head">
                            <span className="sd2-jump__title">跳转</span>
                            <span className="sd2-jump__meta">{pkg.screenplay.episodes.length} 集</span>
                            <div className="sd2-jump__tools">
                              <button
                                type="button"
                                className={`sd2-tool ${outlineView ? 'is-on' : ''}`}
                                onClick={() => setOutlineView((v) => !v)}
                                title="大纲视图"
                                aria-label={outlineView ? '退出大纲视图' : '大纲视图'}
                              >
                                <FileText size={14} strokeWidth={1.5} />
                              </button>
                              <button
                                type="button"
                                className={`sd2-tool ${findOpen ? 'is-on' : ''}`}
                                onClick={() => setFindOpen((v) => !v)}
                                title="查找替换"
                                aria-label="查找替换"
                              >
                                <Wand2 size={14} strokeWidth={1.5} />
                              </button>
                              <button
                                type="button"
                                className="sd2-tool"
                                disabled={busy || continueBusy || rewritingEpIndex != null}
                                onClick={() => handleInsertEmptyEpisode(pkg.screenplay.episodes[pkg.screenplay.episodes.length - 1]?.id)}
                                title="在末尾插入空集"
                                aria-label="插入空集"
                              >
                                <Plus size={14} strokeWidth={1.75} aria-hidden />
                              </button>
                            </div>
                          </div>
                          <div className="sd2-jump__track" role="navigation" aria-label="分集跳转">
                            {pkg.screenplay.episodes
                              .slice()
                              .sort((a, b) => a.index - b.index)
                              .map((ep) => (
                                <button
                                  key={ep.id}
                                  type="button"
                                  className="sd2-jump__chip"
                                  title={`第${ep.index}集 · ${ep.title || '无标题'}`}
                                  onClick={() => scrollToEpisode(ep.id)}
                                >
                                  {ep.index}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                      {findOpen && (
                        <div className="sd2-find-bar">
                          <input
                            className="sd2-find-bar__input"
                            value={findText}
                            onChange={(e) => setFindText(e.target.value)}
                            placeholder="查找…"
                          />
                          <input
                            className="sd2-find-bar__input"
                            value={replaceText}
                            onChange={(e) => setReplaceText(e.target.value)}
                            placeholder="替换为…"
                          />
                          <button
                            type="button"
                            className="sd2-btn sd2-btn--ghost"
                            disabled={!findText || busy}
                            onClick={() => {
                              dirtyRef.current = true;
                              let totalCount = 0;
                              const eps = pkg.screenplay.episodes.map((ep) => {
                                if (findScope === 'current' && ep.index !== pkg.screenplay.episodes[0]?.index) return ep;
                                const { bodyMd, count } = findReplaceInEpisode(ep.bodyMd, findText, replaceText);
                                totalCount += count;
                                return { ...ep, bodyMd, updatedAt: new Date().toISOString() };
                              });
                              savePkg(touchScreenplayPackage(pkg, {
                                screenplay: { ...pkg.screenplay, episodes: eps },
                              }));
                              setTip(`已替换 ${totalCount} 处`);
                              if (totalCount === 0) setTip('未找到匹配内容');
                            }}
                          >
                            替换
                          </button>
                        </div>
                      )}
                      {failedEpisodeIndexes.length > 0 && (
                        <div className="sd2-merge-bar">
                          <span>第 {failedEpisodeIndexes.join(', ')} 集生成失败，</span>
                          <button type="button" className="sd2-btn sd2-btn--primary" disabled={busy} onClick={() => void handleRetryFailed(failedEpisodeIndexes)}>重试失败</button>
                          <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setFailedEpisodeIndexes([])}>忽略</button>
                        </div>
                      )}
                      </div>
                      <div className="sd2-ep-panel">
                        <div className="sd2-ep-panel__head">
                          <span className="sd2-ep-panel__title">剧集</span>
                          <span className="sd2-ep-panel__meta">
                            {pkg.screenplay.episodes.length + skeletonIndexes.length} 集
                          </span>
                        </div>
                        <div className="sd2-ep-list" onScroll={() => { if (epMoreMenuId) setEpMoreMenuId(null); }}>
                      {skeletonIndexes.map((idx) => (
                        <div key={`skel-${idx}`} className="sd2-ep is-skeleton">
                          <div className="sd2-ep__summary">
                            <span className="sd2-ep__title">第{idx}集 · 生成中…</span>
                          </div>
                          <div className="sd2-ep__body sd2-ep__skeleton" />
                        </div>
                      ))}
                      {pkg.screenplay.episodes.length === 0 && skeletonIndexes.length === 0 && <div className="sd2-empty">尚无分集成稿</div>}
                      {normalizeScreenplayEpisodes(pkg.screenplay.episodes).map((ep) => {
                        const isRewriting = rewritingEpIndex === ep.index;
                        const titleLabel = episodeDisplayTitle(ep.index, ep.title);
                        return (
                          <details
                            key={ep.id}
                            className={`sd2-ep${skeletonIndexes.includes(ep.index) ? ' is-skeleton' : ''}${dragEpId === ep.id ? ' is-dragging' : ''}`}
                            id={`sd2-ep-${ep.id}`}
                            defaultOpen={ep.index === 1}
                          >
                            <summary
                              className="sd2-ep__summary"
                              draggable="true"
                              onDragStart={(e) => {
                                setDragEpId(ep.id);
                                (e.currentTarget as HTMLElement).closest('.sd2-ep')?.classList.add('is-dragging');
                              }}
                              onDragEnd={(e) => {
                                setDragEpId(null);
                                (e.currentTarget as HTMLElement).closest('.sd2-ep')?.classList.remove('is-dragging');
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                (e.currentTarget as HTMLElement).closest('.sd2-ep')?.classList.add('is-drop-target');
                              }}
                              onDragLeave={(e) => {
                                (e.currentTarget as HTMLElement).closest('.sd2-ep')?.classList.remove('is-drop-target');
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                (e.currentTarget as HTMLElement).closest('.sd2-ep')?.classList.remove('is-drop-target');
                                const dragId = dragEpId;
                                if (dragId && dragId !== ep.id) {
                                  handleEpisodeReorder(dragId, ep.id);
                                }
                                setDragEpId(null);
                              }}
                            >
                              <ChevronRight className="sd2-ep__chevron" size={14} aria-hidden />
                              <span className="sd2-ep__title">
                                {titleLabel ? `第${ep.index}集 · ${titleLabel}` : `第${ep.index}集`}
                              </span>
                              <span className="sd2-ep__stats">{ep.bodyMd.replace(/\s+/g, '').length} 字 · {(ep.bodyMd.match(/【场景/g) ?? []).length} 场</span>
                              <span
                                className="sd2-ep__acts"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              >
                                {epMoreMenuId === ep.id && !isRewriting ? (
                                  <span className="sd2-ep__more-bar" role="menu">
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="sd2-ep__rewrite"
                                      disabled={busy || continueBusy || rewritingEpIndex != null}
                                      title="在此集后插入"
                                      aria-label={`在第${ep.index}集后插入`}
                                      onClick={() => {
                                        setEpMoreMenuId(null);
                                        handleInsertEmptyEpisode(ep.id);
                                      }}
                                    >
                                      <Plus size={13} aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="sd2-ep__rewrite"
                                      disabled={busy || continueBusy || rewritingEpIndex != null}
                                      title="重写本集（衔接前后集）"
                                      aria-label={`重写第${ep.index}集`}
                                      onClick={() => {
                                        setEpMoreMenuId(null);
                                        void handleRewriteEpisode(ep.index);
                                      }}
                                    >
                                      <RefreshCw size={13} aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="sd2-ep__rewrite sd2-ep__delete"
                                      disabled={busy || continueBusy || rewritingEpIndex != null}
                                      title="删除本集"
                                      aria-label={`删除第${ep.index}集`}
                                      onClick={() => {
                                        setEpMoreMenuId(null);
                                        void handleRemoveEpisode(ep.id, ep.index);
                                      }}
                                    >
                                      <Trash2 size={13} aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      className="sd2-ep__rewrite"
                                      title="收起"
                                      aria-label="收起更多操作"
                                      onClick={() => setEpMoreMenuId(null)}
                                    >
                                      <X size={13} aria-hidden />
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className={`sd2-ep__rewrite${isRewriting ? ' is-busy' : ''}`}
                                    disabled={isRewriting ? false : busy || continueBusy || rewritingEpIndex != null}
                                    title={isRewriting ? '重写中…' : '更多操作'}
                                    aria-label={isRewriting ? `第${ep.index}集重写中` : `第${ep.index}集更多操作`}
                                    aria-expanded={epMoreMenuId === ep.id}
                                    onClick={() => {
                                      if (isRewriting) return;
                                      setEpMoreMenuId((cur) => (cur === ep.id ? null : ep.id));
                                    }}
                                  >
                                    {isRewriting ? (
                                      <RefreshCw size={13} className="sd-spin" aria-hidden />
                                    ) : (
                                      <MoreHorizontal size={14} aria-hidden />
                                    )}
                                  </button>
                                )}
                              </span>
                            </summary>
                            <div className="sd2-ep__body">
                              {outlineView ? (
                                <div className="sd2-ep__outline" onClick={() => setOutlineView(false)}>
                                  <div className="sd2-ep__outline-title">{ep.title || `第${ep.index}集`}</div>
                                  <div className="sd2-ep__outline-preview">{ep.bodyMd.slice(0, 200)}{ep.bodyMd.length > 200 ? '…' : ''}</div>
                                  <div className="sd2-ep__outline-hint">点击展开全文</div>
                                </div>
                              ) : (
                                <textarea
                                  value={ep.bodyMd}
                                  onChange={(e) => patchEpisodeBody(ep.id, e.target.value)}
                                  rows={8}
                                  disabled={isRewriting}
                                />
                              )}
                              <div className="sd2-ep__body-acts">
                                <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => { void navigator.clipboard.writeText(`第${ep.index}集 · ${ep.title || '未命名'}\n\n${ep.bodyMd}`); setTip(`已复制 第${ep.index}集`); }}>
                                  <FileText size={12} /> 复制本集
                                </button>
                              </div>
                            </div>
                          </details>
                        );
                      })}
                        </div>
                      </div>
                    </>
                  )}
                  {rightTab === 'bible' && (
                    <>
                      {mergeSelection.length === 2 && (
                        <div className="sd2-merge-bar">
                          <span>已选 2 条{mergeType === 'character' ? '人物' : '场景'}，</span>
                          <button type="button" className="sd2-btn sd2-btn--primary" onClick={() => void handleBibleMerge()}>确认合并</button>
                          <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => { setMergeSelection([]); setMergeType(null); }}>取消</button>
                        </div>
                      )}
                      {mergeSelection.length === 1 && (
                        <div className="sd2-merge-bar">
                          <span>请再选 1 条{mergeType === 'character' ? '人物' : '场景'}进行合并，</span>
                          <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => { setMergeSelection([]); setMergeType(null); }}>取消</button>
                        </div>
                      )}
                      <div className="sd2-section-label">人物草稿（叙事层 · 不入库）</div>
                      {pkg.bible.characters.length === 0 && <div className="sd2-empty">暂无人物</div>}
                      {pkg.bible.characters.map((c) => {
                        const isEdit = editingBibleId === c.id;
                        return (
                          <div
                            key={c.id}
                            className={`sd2-bible-card${highlightedBibleId === c.name ? ' sd2-bible-card--highlight' : ''}${isEdit ? ' is-edit' : ''}`}
                            onClick={() => setEditingBibleId(isEdit ? null : c.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') setEditingBibleId(isEdit ? null : c.id); }}
                          >
                            <div className="sd2-bible-card__name">{c.name}</div>
                            {!isEdit && (
                              <div className="sd2-bible-card__meta">{c.identity || c.personality || c.appearance ? [c.identity, c.personality, c.appearance].filter(Boolean).join(' · ') : '—'}</div>
                            )}
                            {isEdit && (
                              <div className="sd2-bible-card__fields" onClick={(e) => e.stopPropagation()}>
                                <label className="sd2-field sd2-field--compact">
                                  <span className="sd2-field__label">身份</span>
                                  <input value={c.identity ?? ''} onChange={(e) => patchBibleCharacter(c.id, 'identity', e.target.value)} />
                                </label>
                                <label className="sd2-field sd2-field--compact">
                                  <span className="sd2-field__label">性格</span>
                                  <input value={c.personality ?? ''} onChange={(e) => patchBibleCharacter(c.id, 'personality', e.target.value)} />
                                </label>
                                <label className="sd2-field sd2-field--compact">
                                  <span className="sd2-field__label">外貌</span>
                                  <input value={c.appearance ?? ''} onChange={(e) => patchBibleCharacter(c.id, 'appearance', e.target.value)} />
                                </label>
                                <div className="sd2-bible-card__acts">
                                  <button type="button" className="sd2-btn sd2-btn--ghost sd2-btn--danger" onClick={() => void removeBibleCharacter(c.id, c.name)}>
                                    <Trash2 size={13} /> 删除
                                  </button>
                                  <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => openAssetAt({ tab: 'character', itemId: c.name })}>
                                    素材库
                                  </button>
                                  <button
                                    type="button"
                                    className={`sd2-btn sd2-btn--ghost ${mergeSelection.includes(c.id) ? 'is-on' : ''}`}
                                    onClick={() => toggleMergeSelect(c.id, 'character')}
                                  >
                                    合并
                                  </button>
                                  <button
                                    type="button"
                                    className="sd2-btn sd2-btn--primary"
                                    onClick={() => setEditingBibleId(null)}
                                  >
                                    保存
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="sd2-section-label">场景草稿</div>
                      {pkg.bible.scenes.length === 0 && <div className="sd2-empty">暂无场景</div>}
                      {pkg.bible.scenes.map((s) => {
                        const isEdit = editingBibleId === s.id;
                        return (
                          <div
                            key={s.id}
                            className={`sd2-bible-card${(highlightedBibleId === s.name || highlightedBibleId === s.code) ? ' sd2-bible-card--highlight' : ''}${isEdit ? ' is-edit' : ''}`}
                            onClick={() => setEditingBibleId(isEdit ? null : s.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') setEditingBibleId(isEdit ? null : s.id); }}
                          >
                            <div className="sd2-bible-card__name">{s.name}</div>
                            {!isEdit && (
                              <div className="sd2-bible-card__meta">{s.location || s.summary ? [s.location, s.summary].filter(Boolean).join(' · ') : '—'}</div>
                            )}
                            {isEdit && (
                              <div className="sd2-bible-card__fields" onClick={(e) => e.stopPropagation()}>
                                <label className="sd2-field sd2-field--compact">
                                  <span className="sd2-field__label">地点</span>
                                  <input value={s.location ?? ''} onChange={(e) => patchBibleScene(s.id, 'location', e.target.value)} />
                                </label>
                                <label className="sd2-field sd2-field--compact">
                                  <span className="sd2-field__label">摘要</span>
                                  <input value={s.summary ?? ''} onChange={(e) => patchBibleScene(s.id, 'summary', e.target.value)} />
                                </label>
                                <label className="sd2-field sd2-field--compact">
                                  <span className="sd2-field__label">时代</span>
                                  <input value={s.era ?? ''} onChange={(e) => patchBibleScene(s.id, 'era', e.target.value)} />
                                </label>
                                <div className="sd2-bible-card__acts">
                                  <button type="button" className="sd2-btn sd2-btn--ghost sd2-btn--danger" onClick={() => void removeBibleScene(s.id, s.name)}>
                                    <Trash2 size={13} /> 删除
                                  </button>
                                  <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => openAssetAt({ tab: 'scene', itemId: s.name })}>
                                    素材库
                                  </button>
                                  <button
                                    type="button"
                                    className={`sd2-btn sd2-btn--ghost ${mergeSelection.includes(s.id) ? 'is-on' : ''}`}
                                    onClick={() => toggleMergeSelect(s.id, 'scene')}
                                  >
                                    合并
                                  </button>
                                  <button
                                    type="button"
                                    className="sd2-btn sd2-btn--primary"
                                    onClick={() => setEditingBibleId(null)}
                                  >
                                    保存
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {pkg.bible.world && (() => {
                        const isEdit = editingBibleId === 'world';
                        return (
                          <>
                            <div className="sd2-section-label">世界观</div>
                            <div
                              className={`sd2-bible-card${isEdit ? ' is-edit' : ''}`}
                              onClick={() => setEditingBibleId(isEdit ? null : 'world')}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter') setEditingBibleId(isEdit ? null : 'world'); }}
                            >
                              {!isEdit && (
                                <div className="sd2-bible-card__meta">{[pkg.bible.world.era, pkg.bible.world.location, pkg.bible.world.worldview].filter(Boolean).join(' · ') || '—'}</div>
                              )}
                              {isEdit && (
                                <div className="sd2-bible-card__fields" onClick={(e) => e.stopPropagation()}>
                                  <label className="sd2-field sd2-field--compact">
                                    <span className="sd2-field__label">时代</span>
                                    <input value={pkg.bible.world.era ?? ''} onChange={(e) => patchBibleWorld('era', e.target.value)} />
                                  </label>
                                  <label className="sd2-field sd2-field--compact">
                                    <span className="sd2-field__label">地点</span>
                                    <input value={pkg.bible.world.location ?? ''} onChange={(e) => patchBibleWorld('location', e.target.value)} />
                                  </label>
                                  <label className="sd2-field sd2-field--compact">
                                    <span className="sd2-field__label">世界观</span>
                                    <input value={pkg.bible.world.worldview ?? ''} onChange={(e) => patchBibleWorld('worldview', e.target.value)} />
                                  </label>
                                  <div className="sd2-bible-card__acts">
                                    <button
                                      type="button"
                                      className="sd2-btn sd2-btn--primary"
                                      onClick={() => setEditingBibleId(null)}
                                    >
                                      保存
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}
                  {rightTab === 'readiness' && (
                    <AssetReadinessPanel
                      blockId={props.id}
                      pkg={pkg}
                      onReadinessChange={handleReadinessChange}
                      onPackageChange={handleReadinessPackageChange}
                      connectedPictureGenId={connectedPictureGenId}
                    />
                  )}
                  {rightTab === 'diagnostics' && (
                    <>
                      <div className="sd2-diag-actions">
                        <button type="button" className="sd2-btn sd2-btn--ghost" disabled={busy} onClick={handleManualConsistencyCheck}>
                          运行手动一致性检查
                        </button>
                        {(pkg.diagnostics ?? []).length > 0 && (
                          <button type="button" className="sd2-btn sd2-btn--ghost" onClick={handleAutoFix}>
                            一键修复缺失字段
                          </button>
                        )}
                      </div>
                      {(pkg.diagnostics ?? []).length === 0 && <div className="sd2-empty">暂无诊断</div>}
                       {(pkg.diagnostics ?? []).map((d, i) => (
                        <div
                          key={`${d.code}-${i}`}
                          className={`sd2-diag sd2-diag--${d.level}${(d.entityId || d.episodeId) ? ' sd2-diag--clickable' : ''}`}
                          title={d.episodeId ? `点击定位到「第${pkg.screenplay.episodes.find((e) => e.id === d.episodeId)?.index ?? '?'}集」` : (d.entityId ? `点击定位到设定「${d.entityId}」` : undefined)}
                          onClick={() => handleDiagClick(d)}
                          role={(d.entityId || d.episodeId) ? 'button' : undefined}
                          tabIndex={(d.entityId || d.episodeId) ? 0 : undefined}
                          onKeyDown={(d.entityId || d.episodeId) ? (e) => { if (e.key === 'Enter') handleDiagClick(d); } : undefined}
                        >
                          <b>{d.level}</b> {d.message}
                        </div>
                      ))}
                    </>
                  )}
                </div>
                {rightTab === 'screenplay' && (
                  <div className="sd2-drawer__foot">
                    <div className="sd2-drawer__foot-divider" />
                    <div className="sd2-continue-wrap">
                      {pkg.screenplay.episodes.length === 0 ? (
                        <button
                          type="button"
                          className="sd2-btn sd2-btn--primary"
                          disabled={continueBusy}
                          title={
                            isBriefReadyForFirstGen(pkg)
                              ? busy ? '停止生成' : '打开左侧选集框，确认集数后开始'
                              : '请先共创并应用大纲（至少剧名或一句话故事）'
                          }
                          onClick={busy ? () => abortRef.current?.abort() : () => {
                            openFirstGenFloat(pkg);
                          }}
                        >
                          {busy ? '停止生成' : '打开选集'}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="sd2-btn sd2-btn--primary"
                            disabled={busy && !continueBusy}
                            onClick={continueBusy ? () => abortRef.current?.abort() : () => setContinueOpen(true)}
                          >
                            {continueBusy ? '停止续写' : '续写'}
                          </button>
                          {continueOpen && (
                            <div className="sd2-continue-pop" role="dialog" onClick={(e) => e.stopPropagation()}>
                              <div className="sd2-continue-pop__title">续写集数</div>
                              <div className="sd2-continue-pop__preview">
                                预览：当前 {pkg.screenplay.episodes.length} 集
                                {continueCount === 'all'
                                  ? ` → 将新增 ${
                                      (() => {
                                        const current = pkg.screenplay.episodes.length;
                                        const target = pkg.brief.episodeCount;
                                        if (typeof target === 'number' && target > current) return target - current;
                                        return 10;
                                      })()
                                    } 集（全部）`
                                  : continueCount > 0
                                    ? ` → 将新增 ${continueCount} 集`
                                    : ''}
                              </div>
                              <div className="sd2-continue-pop__opts">
                                {([1, 2, 3, 5, 10] as const).map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    className={`sd2-continue-pop__opt ${continueCount === n ? 'is-on' : ''}`}
                                    onClick={() => setContinueCount(n)}
                                  >
                                    {n}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className={`sd2-continue-pop__opt ${continueCount === 'all' ? 'is-on' : ''}`}
                                  onClick={() => setContinueCount('all')}
                                >
                                  全部
                                </button>
                              </div>
                              <div className="sd2-continue-pop__all-desc">
                                全部 = 补齐大纲目标集数；无目标则续写 10 集
                              </div>
                              <div className="sd2-continue-pop__acts">
                                <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setContinueOpen(false)}>取消</button>
                                <button type="button" className="sd2-btn sd2-btn--primary" disabled={continueBusy} onClick={() => void handleContinueStart()}>
                                  {continueBusy ? '续写中…' : '开始续写'}
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </aside>
            )}
          </div>

          <div className="sd2-tip" aria-live="polite">{tip || '\u00a0'}</div>
        </div>
        {ingestPreviewOpen && (
          <div className="sd2-overlay" onClick={() => setIngestPreviewOpen(false)}>
            <div className="sd2-popup" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="导入预览">
              <h3 className="sd2-popup__title">导入预览</h3>
              <p className="sd2-popup__desc">将识别以下 {ingestPreviewEps.length} 集：</p>
              <ul className="sd2-popup__list">
                {ingestPreviewEps.map((ep) => (
                  <li key={ep.id} className="sd2-popup__list-item">
                    <b>第{ep.index}集</b> · {ep.title || '无标题'} · {ep.bodyMd.replace(/\s+/g, '').length} 字
                  </li>
                ))}
              </ul>
              <div className="sd2-popup__acts">
                <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setIngestPreviewOpen(false)}>取消</button>
                <button type="button" className="sd2-btn sd2-btn--primary" onClick={doIngestConfirm}>确认写入</button>
              </div>
            </div>
          </div>
        )}
        {handoffOpen && (
          <div className="sd2-overlay" onClick={() => setHandoffOpen(false)}>
            <div className="sd2-popup" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="送到分镜台">
              <h3 className="sd2-popup__title">送到分镜台</h3>
              <div className="sd2-popup__desc">
                {(() => {
                  const items: string[] = [
                    `已确认 · ${epCount} 集 · ${wordCount} 字`,
                  ];
                  const readiness = inspectBibleAssets(pkg);
                  if (!readiness.ready) {
                    const gaps: string[] = [];
                    if (readiness.missingCharacters.length > 0) gaps.push(`角色入库 ${readiness.missingCharacters.length}`);
                    if (readiness.missingScenes.length > 0) gaps.push(`场景 ${readiness.missingScenes.length}`);
                    if ((readiness.missingCharacterTurnarounds?.length ?? 0) > 0) {
                      gaps.push(`主角三视图 ${readiness.missingCharacterTurnarounds!.length}`);
                    }
                    if ((readiness.missingCharacterRefs?.length ?? 0) > 0) {
                      gaps.push(`定妆 ${readiness.missingCharacterRefs!.length}`);
                    }
                    items.push(`就绪缺口：${gaps.join(' / ')}`);
                  } else {
                    items.push('设定已就绪');
                  }
                  return items.join(' · ');
                })()}
              </div>
              <div className="sd2-popup__acts">
                <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setHandoffOpen(false)}>取消</button>
                {!inspectBibleAssets(pkg).ready && (
                  <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => { setHandoffOpen(false); setRightTab('readiness'); setRightDrawerOpen(true); }}>去就绪</button>
                )}
                <button type="button" className="sd2-btn sd2-btn--primary" onClick={doHandoffToStoryboard}>
                  {inspectBibleAssets(pkg).ready ? '确认送出' : '仍要送出'}
                </button>
              </div>
            </div>
          </div>
        )}
        {chatMenu && (
          <div className="sd2-ctx-menu" style={{ left: chatMenu.x, top: chatMenu.y }}>
            <button
              type="button"
              className="sd2-ctx-menu__item"
              onClick={async () => {
                setChatMenu(null);
                const ok = await confirmDelete({ title: '清空左侧对话？', description: '此操作仅清空对话记录，不影响已成稿与设定。', confirmLabel: '仅清对话', cancelLabel: '保留' });
                if (ok) {
                  updateNodeData(props.id, {
                    agentSession: {
                      messages: [],
                      updatedAt: new Date().toISOString(),
                    },
                  });
                }
              }}
            >
              清屏
            </button>
          </div>
        )}
      </ScreenModal>
    </BlockShell>
  );
}

export default memo(ScriptDeskBlock);
