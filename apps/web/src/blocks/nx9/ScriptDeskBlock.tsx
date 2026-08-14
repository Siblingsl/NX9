import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  FileUp,
  X,
} from 'lucide-react';
import { type NodeProps, useReactFlow, useStore, type ReactFlowState } from '@xyflow/react';
import {
 type ScreenplayEpisode,
  type ScreenplayPackage,
  type ScriptDeskAgentSession,
  type ScriptDeskSkillId,
  lintScreenplayFormat,
  normalizeScreenplayEpisodes,
  screenplayFullText,
  resolveConnectedPictureGenId,
  screenplayWordCount,
  touchScreenplayPackage,
} from '@nx9/shared';
import { useAllAssetLibraryItems } from '../../hooks/use-asset-library-items';
import { confirmDelete } from '../../stores/confirm-dialog';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { useAssetLibraryModalUi } from '../../stores/asset-library-modal-ui';
import { useConnectedLlmModels } from '../../hooks/use-connected-llm-models';
import {
  persistScriptDeskPackage,
  readScriptDeskPackage,
  runConsistencyCheck,
} from '../../engine/script-desk-runner';
import { packageSourceHash } from '../../engine/storyboard-desk-runner';
import { resolveConnectedStoryboardDeskId } from '../../engine/chain-storyboard-utils';
import { inspectBibleAssets } from '../../engine/asset-readiness';
import { AssetReadinessPanel } from '../../components/asset/AssetReadinessPanel';
import { deriveStoryboardSyncStatus, storyboardSyncLabel } from './script-desk/storyboard-sync';
import {
  type EntryMode,
  type RightTab,
  SPLIT_DEFAULT,
  SPLIT_MIN,
  SPLIT_MAX,
  SKILL_CHIPS,
  clampSplitPct,
  compact,
  isBriefReadyForFirstGen,
  shouldShowUnconfirmBanner,
  initialOpenEpisodeIds,
  resolveLibraryItemId,
  type UndoLatch,
  shouldPushUndo,
  type UndoMode,
  type SavePkgFn,
} from './script-desk/desk-helpers';
import { DebouncedFieldScopeProvider, flushDebouncedFields, resetDebouncedFields } from './script-desk/use-debounced-field';
import { ScreenplayPanel } from './script-desk/ScreenplayPanel';
import { BiblePanel } from './script-desk/BiblePanel';
import { DiagnosticsPanel } from './script-desk/DiagnosticsPanel';
import { DraftsDrawer } from './script-desk/DraftsDrawer';
import { DeskHeader } from './script-desk/DeskHeader';
import { ChatStage } from './script-desk/ChatStage';
import { ContinuePop } from './script-desk/ContinuePop';
import { useScriptDeskActions } from './script-desk/use-script-desk-actions';
import { useScriptDeskAgentOps } from './script-desk/use-script-desk-agent';
import { useScriptDeskEditOps } from './script-desk/use-script-desk-edits';
import { useScriptDeskDraftOps } from './script-desk/use-script-desk-drafts';
import './script-desk.css';
import './script-desk.v2.css';

// Q-01: 模块级常量与纯函数已迁至 ./script-desk/desk-helpers.ts
// A9: controller 回调按域拆至 ./script-desk/use-script-desk-{actions,agent,edits,drafts}.ts

function ScriptDeskBlock(props: NodeProps) {
  const { updateNodeData, getNodes, getEdges } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const openAssetAtRaw = useAssetLibraryModalUi((s) => s.openAt);
  const {
    options: llmOptions,
    activeOption: llmActiveOption,
    llmModelLabel,
    selectModel: selectLlmModel,
    openConnectionsSettings: openLlmSettings,
  } = useConnectedLlmModels();
  const nodeData = props.data as Record<string, unknown> | undefined;
  const pkg = useMemo(() => readScriptDeskPackage(nodeData), [nodeData]);
  const connectedPictureGenId = useMemo(
    () => resolveConnectedPictureGenId(props.id, getNodes(), getEdges()),
    [props.id, getNodes, getEdges],
  );
  // H-02: 交接回程状态——比对相连分镜台已拆镜的成稿 hash（只读展示）
  const scriptHash = useMemo(() => packageSourceHash(pkg), [pkg]);
  const storyboardSync = useStore(
    useCallback((s: ReactFlowState) => {
      const deskId = resolveConnectedStoryboardDeskId(props.id, s.nodes, s.edges);
      if (!deskId) return 'none' as const;
      const desk = s.nodes.find((n) => n.id === deskId);
      return deriveStoryboardSyncStatus(desk?.data as Record<string, unknown> | undefined, scriptHash);
    }, [props.id, scriptHash]),
  );
  const storyboardSyncText = storyboardSyncLabel(storyboardSync);
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
  const [renamingBibleCharId, setRenamingBibleCharId] = useState<string | null>(null);
  const [renameCharText, setRenameCharText] = useState('');
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeType, setMergeType] = useState<'character' | 'scene' | null>(null);
  const [outlineView, setOutlineView] = useState(false);
  const [skeletonIndexes, setSkeletonIndexes] = useState<number[]>([]);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [ingestPreviewOpen, setIngestPreviewOpen] = useState(false);
  const [ingestPreviewEps, setIngestPreviewEps] = useState<ScreenplayEpisode[]>([]);
  const [pendingIngestSource, setPendingIngestSource] = useState<'pasted' | 'uploaded'>('pasted');
  const [dragEpId, setDragEpId] = useState<string | null>(null);
  const [epMoreMenuId, setEpMoreMenuId] = useState<string | null>(null);
  const [failedEpisodeIndexes, setFailedEpisodeIndexes] = useState<number[]>([]);
  const [renamingDraftId, setRenamingDraftId] = useState<string | null>(null);
  const [renamingDraftText, setRenamingDraftText] = useState('');
  const [openEpIds, setOpenEpIds] = useState<Set<string>>(() => new Set(initialOpenEpisodeIds(pkg)));
  const [selectedEpIds, setSelectedEpIds] = useState<Set<string>>(() => new Set());
  const [streamPreview, setStreamPreview] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [collapsedMsgIds, setCollapsedMsgIds] = useState<Set<string>>(() => new Set());
  const tipClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevConfirmedRef = useRef(false);
  const lastOpenStudioRequestAtRef = useRef<string | null>(null);
  const lastUndoRef = useRef<UndoLatch | null>(null);
  const latestDraftRef = useRef({ pkg, session, entryMode, id: props.id });
  latestDraftRef.current = { pkg, session, entryMode, id: props.id };
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const pkgRef = useRef(pkg);
  pkgRef.current = pkg;

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
  const workspaceCharacters = useWorkspaceDocument((s) => s.characters.characters);
  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);

  const { privateItems, publicItems, allItems } = useAllAssetLibraryItems();
  const libChars = useMemo(() => allItems.filter((i) => i.kind === 'character'), [allItems]);
  const libScenes = useMemo(() => allItems.filter((i) => i.kind === 'scene'), [allItems]);
  const hasLibraryItems = libChars.length > 0 || libScenes.length > 0;
  const openAssetAt = useCallback((target: { tab: 'character' | 'scene'; itemId: string }) => {
    const pool = target.tab === 'character' ? libChars : libScenes;
    const itemId = resolveLibraryItemId(
      target.itemId,
      pool.map((item) => ({ id: item.id, name: item.label, label: item.label })),
    );
    openAssetAtRaw({ ...target, itemId });
  }, [libChars, libScenes, openAssetAtRaw]);

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
  const undoStackRef = useRef<Array<{ package: ScreenplayPackage; agentSession?: ScriptDeskAgentSession }>>([]);
  const pushUndo = useCallback((prev: ScreenplayPackage, prevSession?: ScriptDeskAgentSession) => {
    undoStackRef.current.push({ package: prev, agentSession: prevSession });
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
  }, []);

  const commitAgentSession = useCallback((nextSession: ScriptDeskAgentSession, extra: Record<string, unknown> = {}) => {
    sessionRef.current = nextSession;
    updateNodeData(props.id, { agentSession: nextSession, ...extra });
  }, [props.id, updateNodeData]);

  const savePkg: SavePkgFn = useCallback((nextOrFn, extra: Record<string, unknown> = {}, opts) => {
    const current = pkgRef.current;
    const next = typeof nextOrFn === 'function' ? nextOrFn(current) : nextOrFn;
    if (next === current) return;
    const mode: UndoMode = opts?.undo ?? 'struct';
    const now = Date.now();
    if (shouldPushUndo(mode, lastUndoRef.current, now)) {
      pushUndo(current, sessionRef.current);
    }
    if (mode === 'struct' || mode === 'typing') {
      lastUndoRef.current = { mode, at: now };
    }
    pkgRef.current = next;
    persistScriptDeskPackage(updateNodeData, props.id, next, extra);
  }, [props.id, updateNodeData, pushUndo]);

  // F-08: 跟踪确认状态；显示确认失效 banner（换稿/重置必须复位 latch）
  useEffect(() => {
    if (pkg.status === 'confirmed') prevConfirmedRef.current = true;
  }, [pkg.status]);
  const showUnconfirmBanner = shouldShowUnconfirmBanner(pkg.status, prevConfirmedRef.current, epCount);

  // 修复历史脏数据：模型 JSON 被当成纯文本切开后，title 会吃进 "bodyMd"
  useEffect(() => {
    const raw = pkg.screenplay.episodes;
    if (raw.length === 0) return;
    const fixed = normalizeScreenplayEpisodes(raw);
    const dirty = fixed.some((ep, i) => ep.title !== raw[i]?.title || ep.bodyMd !== raw[i]?.bodyMd);
    if (!dirty) return;
    savePkg(touchScreenplayPackage(pkg, {
      screenplay: { ...pkg.screenplay, episodes: fixed },
    }), {}, { undo: false });
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

  const edits = useScriptDeskEditOps({
    propsId: props.id,
    updateNodeData,
    appendLog,
    pkg,
    pkgRef,
    sessionRef,
    savePkg,
    dirtyRef,
    publicItems,
    workspaceCharacters,
    upsertCharacter,
    mergeSelection,
    mergeType,
    setTip,
    setRightTab,
    setHighlightedBibleId,
    setRenamingBibleCharId,
    setEditingBibleId,
    setMergeSelection,
    setMergeType,
    setOpenEpIds,
    setSelectedEpIds,
  });

  const actions = useScriptDeskActions({
    propsId: props.id,
    updateNodeData,
    getEdges,
    appendLog,
    pkg,
    pkgRef,
    savePkg,
    runAutoLint,
    dirtyRef,
    title,
    ingestText,
    pendingIngestSource,
    setTip,
    setBusy,
    setRightTab,
    setActiveSkills,
    setIngestText,
    setIngestPreviewEps,
    setIngestPreviewOpen,
    setPendingIngestSource,
    setHandoffOpen,
    setEntryMode,
    setFirstGenFloatDeferred,
    setGenEpisodeCount,
    setGenFloatExpanded,
  });

  const agent = useScriptDeskAgentOps({
    propsId: props.id,
    updateNodeData,
    appendLog,
    pkg,
    pkgRef,
    session,
    sessionRef,
    savePkg,
    commitAgentSession,
    runAutoLint,
    openFirstGenFloat: actions.openFirstGenFloat,
    abortRef,
    chatInput,
    activeSkills,
    genEpisodeCount,
    continueCount,
    continueBusy,
    busy,
    rewritingEpIndex,
    firstGenFloatDeferred,
    selectedEpIds,
    privateItems,
    publicItems,
    setTip,
    setBusy,
    setRightTab,
    setRightDrawerOpen,
    setChatInput,
    setStreamPreview,
    setSkeletonIndexes,
    setFailedEpisodeIndexes,
    setContinueOpen,
    setContinueBusy,
    setGenFloatExpanded,
    setFirstGenFloatDeferred,
    setGenEpisodeCount,
    setRewritingEpIndex,
    setSelectedEpIds,
  });

  const drafts = useScriptDeskDraftOps({
    propsId: props.id,
    updateNodeData,
    entryMode,
    busy,
    continueBusy,
    rewritingEpIndex,
    hasDraftMemory,
    pkgRef,
    sessionRef,
    abortRef,
    tipClearRef,
    dirtyRef,
    prevConfirmedRef,
    lastUndoRef,
    undoStackRef,
    saveScriptDeskDraft,
    trashScriptDeskSnapshot,
    getScriptDeskDraft,
    upsertScriptDeskWorkingDraft,
    moveScriptDeskDraftToTrash,
    setTip,
    setEntryMode,
    setIngestText,
    setChatInput,
    setRightTab,
    setRightDrawerOpen,
    setStudioOpen,
    setDraftsOpen,
    setOpenEpIds,
    setSelectedEpIds,
    setStreamPreview,
    setChatSearch,
    setCollapsedMsgIds,
    setContinueOpen,
    setFirstGenFloatDeferred,
    setGenFloatExpanded,
    setActiveSkills,
  });

  const onToggleCollapseMessage = useCallback((id: string) => {
    setCollapsedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onCollapseApplied = useCallback(() => {
    setCollapsedMsgIds((prev) => {
      const next = new Set(prev);
      for (const m of session.messages) {
        if (m.applied) next.add(m.id);
      }
      return next;
    });
  }, [session.messages]);

  // X-03: Ctrl+Z —— 输入框内仅拦截「结构性」撤销；键入级交给浏览器原生
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!studioOpen) return;
      if (e.key !== 'z' || !e.ctrlKey || e.metaKey) return;
      if (undoStackRef.current.length === 0) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === 'TEXTAREA' || tag === 'INPUT';
      if (inField && lastUndoRef.current?.mode === 'typing') return;
      e.preventDefault();
      resetDebouncedFields(props.id);
      const entry = undoStackRef.current.pop()!;
      lastUndoRef.current = null;
      savePkg(entry.package, entry.agentSession ? { agentSession: entry.agentSession } : {}, { undo: false });
      sessionRef.current = entry.agentSession ?? sessionRef.current;
      setTip('已撤销');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [studioOpen, savePkg]);

  // S-01: 自动工作草稿定时存储（每 60s）；interval 不依赖 pkg，避免键入重置
  useEffect(() => {
    if (!studioOpen || !hasDraftMemory) return;
    const id = setInterval(() => {
      flushDebouncedFields(props.id);
      const cur = { ...latestDraftRef.current, pkg: pkgRef.current };
      const { isNew } = upsertScriptDeskWorkingDraft({
        package: cur.pkg,
        agentSession: cur.session,
        entryMode: cur.entryMode,
        sourceBlockId: cur.id,
      });
      if (isNew) drafts.showTimedTip('已自动保存到草稿「工作中」');
      dirtyRef.current = false;
    }, 60000);
    autoSaveTimerRef.current = id;
    return () => {
      clearInterval(id);
      autoSaveTimerRef.current = null;
    };
  }, [studioOpen, hasDraftMemory, upsertScriptDeskWorkingDraft, drafts.showTimedTip]);

  // S-02: beforeunload 离开提示（仅台打开时注册）
  useEffect(() => {
    if (!studioOpen) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [studioOpen]);

  // 4.3: 删集后清理幽灵选中，避免「已选 N」展示残留记忆
  useEffect(() => {
    const liveIds = new Set(pkg.screenplay.episodes.map((ep) => ep.id));
    setSelectedEpIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => liveIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pkg.screenplay.episodes]);

  const onChatContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setChatMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const skillName = activeSkills[0] ? SKILL_CHIPS.find((s) => s.id === activeSkills[0])?.label ?? '' : '';

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
            {storyboardSyncText ? ` · ${storyboardSyncText}` : ''}
          </div>
          <div className="sd2-card__logline">{logline ? compact(logline, 72) : '点击打开编剧台 · 共创或上传成稿'}</div>
          <div className="sd2-card__actions">
            <button type="button" className="sd2-btn sd2-btn--ghost" onClick={(e) => { e.stopPropagation(); setStudioOpen(true); }}>打开编剧台</button>
          </div>
        </div>
      </div>

      <ScreenModal
        open={studioOpen}
        onClose={drafts.handleCloseStudio}
        title="编剧台"
        subtitle="共创成稿 → 抽取设定 → 确认交付"
        width="min(1180px, 100vw - 32px)"
        variant="default"
        className="sd2-modal"
        headerRight={(
          <DeskHeader
            entryMode={entryMode}
            activeSkills={activeSkills}
            pkg={pkg}
            session={session}
            busy={busy}
            continueBusy={continueBusy}
            rewritingEpIndex={rewritingEpIndex}
            rightDrawerOpen={rightDrawerOpen}
            rightTab={rightTab}
            diagCount={diagCount}
            draftsOpen={draftsOpen}
            draftCount={scriptDeskDrafts.length}
            showMoreMenu={showMoreMenu}
            legacyBreakdown={legacyBreakdown}
            savePkg={savePkg}
            onToggleGenerate={() => {
              setEntryMode('agent');
              actions.toggleSkill('generate');
              if (pkg.screenplay.episodes.length === 0) {
                actions.openFirstGenFloat(pkg);
              }
            }}
            onSetIngest={() => setEntryMode('ingest')}
            onToggleDrawer={() => setRightDrawerOpen((v) => !v)}
            onOpenDiagnostics={() => {
              setRightDrawerOpen(true);
              setRightTab('diagnostics');
            }}
            onExtractBible={() => void actions.handleExtractBible()}
            onOpenDrafts={() => setDraftsOpen(true)}
            onResetDesk={() => void drafts.handleResetDesk()}
            onHandoff={actions.handleHandoffToStoryboard}
            onConfirm={actions.handleConfirm}
            onToggleMore={() => setShowMoreMenu((v) => !v)}
            onExportMd={() => { actions.handleExportMd(); setShowMoreMenu(false); }}
            onExportJson={() => { actions.handleExportJson(); setShowMoreMenu(false); }}
            onExportZip={() => { void actions.handleExportPackage(); setShowMoreMenu(false); }}
          />
        )}
      >
        <DebouncedFieldScopeProvider scope={props.id} onDirty={markDirty}>
        {/* 首次生成选集数：对话区底浮层（由「应用」成功触发；顶栏/右侧亦可打开） */}

        {draftsOpen && (
          <DraftsDrawer
            drafts={scriptDeskDrafts}
            renamingDraftId={renamingDraftId}
            setRenamingDraftId={setRenamingDraftId}
            renamingDraftText={renamingDraftText}
            setRenamingDraftText={setRenamingDraftText}
            renameScriptDeskDraft={renameScriptDeskDraft}
            locked={busy || continueBusy || rewritingEpIndex != null}
            onOpenDraft={drafts.handleOpenDraftFolder}
            onDeleteDraft={drafts.handleDeleteDraftFolder}
            onClose={() => setDraftsOpen(false)}
          />
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
                    onClick={() => { setEntryMode('agent'); actions.toggleSkill(skill.id); }}
                  >
                    {skill.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="sd2-skill-hint">
            {entryMode === 'agent' && skillName
              ? `本轮意图 · ${skillName} · 发送=请求 · 应用=写稿`
              : entryMode === 'agent'
                ? '先点技能定意图，再发送说明；产出需「应用」才写入稿纸'
                : '\u00a0'}
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
                    <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void actions.handleFile(f); e.target.value = ''; }} />
                  </div>
                  <textarea
                    className="sd2-ingest__textarea"
                    value={ingestText}
                    onChange={(e) => setIngestText(e.target.value)}
                    placeholder="或直接粘贴小说 / 分集剧本… 支持「第N集」标题自动分集"
                  />
                  <div className="sd2-ingest__actions">
                    <button type="button" className="sd2-btn sd2-btn--primary" onClick={actions.handleIngestSave}>写入成稿</button>
                    <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => void actions.handlePasteFromClipboard()}>从剪贴板填入</button>
                    <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setEntryMode('agent')}>改回共创</button>
                  </div>
                </div>
              ) : (
                <ChatStage
                  pkg={pkg}
                  session={session}
                  title={title}
                  hasDraftMemory={hasDraftMemory}
                  skillName={skillName}
                  busy={busy}
                  llmModelLabel={llmModelLabel}
                  llmOptions={llmOptions}
                  llmOptionId={llmActiveOption?.id ?? ''}
                  onSelectLlmModel={(id) => { void selectLlmModel(id); }}
                  onOpenLlmSettings={openLlmSettings}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  atOpen={atOpen}
                  setAtOpen={setAtOpen}
                  showGenFloat={showGenFloat}
                  genFloatExpanded={genFloatExpanded}
                  setGenFloatExpanded={setGenFloatExpanded}
                  genEpisodeCount={genEpisodeCount}
                  setGenEpisodeCount={setGenEpisodeCount}
                  setFirstGenFloatDeferred={setFirstGenFloatDeferred}
                  setTip={setTip}
                  libChars={libChars}
                  libScenes={libScenes}
                  hasLibraryItems={hasLibraryItems}
                  streamPreview={streamPreview}
                  chatSearch={chatSearch}
                  setChatSearch={setChatSearch}
                  collapsedMsgIds={collapsedMsgIds}
                  onToggleCollapseMessage={onToggleCollapseMessage}
                  onCollapseApplied={onCollapseApplied}
                  onChatContextMenu={onChatContextMenu}
                  onToggleSkill={actions.toggleSkill}
                  onSetEntryMode={setEntryMode}
                  onOpenDrafts={() => setDraftsOpen(true)}
                  onApplyMessage={agent.handleApplyMessage}
                  onDiscardMessage={agent.handleDiscardMessage}
                  onGenStart={() => void agent.handleGenStart()}
                  onAbort={() => abortRef.current?.abort()}
                  onAgentSend={() => void agent.handleAgentSend()}
                />
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
                    <ScreenplayPanel
                      pkg={pkg}
                      dirtyRef={dirtyRef}
                      savePkg={savePkg}
                      setTip={setTip}
                      patchBriefTitle={edits.patchBriefTitle}
                      busy={busy}
                      continueBusy={continueBusy}
                      rewritingEpIndex={rewritingEpIndex}
                      outlineView={outlineView}
                      setOutlineView={setOutlineView}
                      findOpen={findOpen}
                      setFindOpen={setFindOpen}
                      findText={findText}
                      setFindText={setFindText}
                      replaceText={replaceText}
                      setReplaceText={setReplaceText}
                      failedEpisodeIndexes={failedEpisodeIndexes}
                      setFailedEpisodeIndexes={setFailedEpisodeIndexes}
                      onRetryFailed={agent.handleRetryFailed}
                      skeletonIndexes={skeletonIndexes}
                      epMoreMenuId={epMoreMenuId}
                      setEpMoreMenuId={setEpMoreMenuId}
                      dragEpId={dragEpId}
                      setDragEpId={setDragEpId}
                      onInsertEmptyEpisode={edits.handleInsertEmptyEpisode}
                      onEpisodeReorder={edits.handleEpisodeReorder}
                      onRewriteEpisode={agent.handleRewriteEpisode}
                      onRemoveEpisode={edits.handleRemoveEpisode}
                      patchEpisodeBody={edits.patchEpisodeBody}
                      scrollToEpisode={edits.scrollToEpisode}
                      openEpIds={openEpIds}
                      setOpenEpIds={setOpenEpIds}
                      selectedEpIds={selectedEpIds}
                      onToggleSelectEpisode={edits.onToggleSelectEpisode}
                      onBatchRewrite={() => { void agent.handleBatchRewrite(); }}
                      onClearSelectedEpisodes={edits.onClearSelectedEpisodes}
                    />
                  )}
                  {rightTab === 'bible' && (
                    <BiblePanel
                      pkg={pkg}
                      editingBibleId={editingBibleId}
                      setEditingBibleId={setEditingBibleId}
                      renamingBibleCharId={renamingBibleCharId}
                      setRenamingBibleCharId={setRenamingBibleCharId}
                      renameCharText={renameCharText}
                      setRenameCharText={setRenameCharText}
                      onRenameCharacter={edits.handleRenameCharacter}
                      patchBibleCharacter={edits.patchBibleCharacter}
                      patchBibleScene={edits.patchBibleScene}
                      patchBibleWorld={edits.patchBibleWorld}
                      removeBibleCharacter={edits.removeBibleCharacter}
                      removeBibleScene={edits.removeBibleScene}
                      mergeSelection={mergeSelection}
                      mergeType={mergeType}
                      setMergeSelection={setMergeSelection}
                      setMergeType={setMergeType}
                      toggleMergeSelect={edits.toggleMergeSelect}
                      onBibleMerge={edits.handleBibleMerge}
                      highlightedBibleId={highlightedBibleId}
                      openAssetAt={openAssetAt}
                    />
                  )}
                  {rightTab === 'readiness' && (
                    <AssetReadinessPanel
                      blockId={props.id}
                      pkg={pkg}
                      onReadinessChange={actions.handleReadinessChange}
                      onPackageChange={actions.handleReadinessPackageChange}
                      connectedPictureGenId={connectedPictureGenId}
                    />
                  )}
                  {rightTab === 'diagnostics' && (
                    <DiagnosticsPanel
                      pkg={pkg}
                      busy={busy}
                      onManualCheck={actions.handleManualConsistencyCheck}
                      onAutoFix={actions.handleAutoFix}
                      onDiagClick={edits.handleDiagClick}
                    />
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
                            actions.openFirstGenFloat(pkg);
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
                            <ContinuePop
                              pkg={pkg}
                              continueCount={continueCount}
                              continueBusy={continueBusy}
                              onChangeCount={setContinueCount}
                              onCancel={() => setContinueOpen(false)}
                              onStart={() => void agent.handleContinueStart()}
                            />
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
                <button type="button" className="sd2-btn sd2-btn--primary" onClick={actions.doIngestConfirm}>确认写入</button>
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
                  if (storyboardSync === 'synced') items.push('分镜已同步（本次送出后请回分镜台核对）');
                  else if (storyboardSync === 'stale') items.push('分镜落后于成稿：送出后请在拆镜页「同步最新成稿」');
                  else if (storyboardSync === 'unbroken') items.push('分镜台尚未拆镜：送出后请点「从成稿拆镜」');
                  return items.join(' · ');
                })()}
              </div>
              <div className="sd2-popup__acts">
                <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setHandoffOpen(false)}>取消</button>
                {!inspectBibleAssets(pkg).ready && (
                  <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => { setHandoffOpen(false); setRightTab('readiness'); setRightDrawerOpen(true); }}>去就绪</button>
                )}
                <button type="button" className="sd2-btn sd2-btn--primary" onClick={actions.doHandoffToStoryboard}>
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
                  commitAgentSession({
                    messages: [],
                    updatedAt: new Date().toISOString(),
                  });
                }
              }}
            >
              清屏
            </button>
          </div>
        )}
        </DebouncedFieldScopeProvider>
      </ScreenModal>
    </BlockShell>
  );
}

export default memo(ScriptDeskBlock);
