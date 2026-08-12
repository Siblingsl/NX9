import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  FileUp,
  X,
} from 'lucide-react';
import { type NodeProps, useReactFlow, useStore, type ReactFlowState } from '@xyflow/react';
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
  renameCharacterInPackage,
  screenplayFullText,
  screenplayWordCount,
  touchScreenplayPackage,
  unconfirmIfEdited,
  normalizeScreenplayBibleCharacters,
} from '@nx9/shared';
import { enrichPromptWithAssetMentions, resolveConnectedPictureGenId } from '@nx9/shared';
import { enrichBibleScenesFromPackage } from '@nx9/shared';
import { api } from '../../api/client';
import { useAllAssetLibraryItems } from '../../hooks/use-asset-library-items';
import { askConfirm, askConfirmWithOption, confirmDelete } from '../../stores/confirm-dialog';
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
  compactAgentSession,
  confirmPackage,
  discardPendingMessagePatch,
  extractBibleFromPackage,
  formatScriptDeskError,
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
import {
  findLibraryCharacterForRename,
  libraryCharacterRenameConflict,
  renameLibraryCharacterProfile,
} from '../../engine/bible-library-sync';
import { inspectBibleAssets, type AssetReadinessState } from '../../engine/asset-readiness';
import { packageSourceHash } from '../../engine/storyboard-desk-runner';
import { resolveConnectedStoryboardDeskId } from '../../engine/chain-storyboard-utils';
import { AssetReadinessPanel } from '../../components/asset/AssetReadinessPanel';
import { useAssetLibraryModalUi } from '../../stores/asset-library-modal-ui';
import { useConnectedLlmModels } from '../../hooks/use-connected-llm-models';
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
  isVisualStyleReady,
  shouldPushUndo,
  shouldShowUnconfirmBanner,
  confirmedLatchForSnapshot,
  countCharacterRenameHits,
  initialOpenEpisodeIds,
  resolveLibraryItemId,
  textLooksLikeEpisodicScreenplay,
  type UndoLatch,
  type UndoMode,
  type SavePkgFn,
} from './script-desk/desk-helpers';
import { ScreenplayPanel } from './script-desk/ScreenplayPanel';
import { BiblePanel } from './script-desk/BiblePanel';
import { DiagnosticsPanel } from './script-desk/DiagnosticsPanel';
import { DraftsDrawer } from './script-desk/DraftsDrawer';
import { DeskHeader } from './script-desk/DeskHeader';
import { ChatStage } from './script-desk/ChatStage';
import { ContinuePop } from './script-desk/ContinuePop';
import './script-desk.css';
import './script-desk.v2.css';

// Q-01: 模块级常量与纯函数已迁至 ./script-desk/desk-helpers.ts

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
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevConfirmedRef = useRef(false);
  const lastOpenStudioRequestAtRef = useRef<string | null>(null);
  const lastUndoRef = useRef<UndoLatch | null>(null);
  const latestDraftRef = useRef({ pkg, session, entryMode, id: props.id });
  latestDraftRef.current = { pkg, session, entryMode, id: props.id };
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
  const undoStackRef = useRef<ScreenplayPackage[]>([]);
  const pushUndo = useCallback((prev: ScreenplayPackage) => {
    undoStackRef.current.push(prev);
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
  }, []);

  const savePkg: SavePkgFn = useCallback((nextOrFn, extra: Record<string, unknown> = {}, opts) => {
    const current = pkgRef.current;
    const next = typeof nextOrFn === 'function' ? nextOrFn(current) : nextOrFn;
    if (next === current) return;
    const mode: UndoMode = opts?.undo ?? 'struct';
    const now = Date.now();
    if (shouldPushUndo(mode, lastUndoRef.current, now)) {
      pushUndo(current);
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
      scriptHash: packageSourceHash(pkg),
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
    const storyboardDeskId = resolveConnectedStoryboardDeskId(props.id, nodes as any, getEdges() as any);
    const storyboardDesk = storyboardDeskId ? nodes.find((node) => node.id === storyboardDeskId) : undefined;
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
    if (!isVisualStyleReady(fromPkg)) {
      setTip('请先在右侧「世界观」中选择人物与全片视觉风格，再生成剧本');
      setRightTab('bible');
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
    if (skillId === 'generate' && !isVisualStyleReady(pkg)) {
      setTip('请先在右侧「世界观」中选择人物与全片视觉风格');
      setRightTab('bible');
      return;
    }
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
      const msg = formatScriptDeskError(e);
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
      setStreamPreview('');
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

  // C-02: 丢弃 pending patch（标记 discarded，并去掉全文避免 node.data 膨胀）
  const handleDiscardMessage = useCallback((messageId: string) => {
    updateNodeData(props.id, {
      agentSession: discardPendingMessagePatch(session, messageId),
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
    if (!isVisualStyleReady(pkg)) {
      setTip('请先在右侧「世界观」中选择人物与全片视觉风格，再生成剧本');
      setRightTab('bible');
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
      setStreamPreview('');
      try {
        const result = await runAppendEpisodeSkill(currentPkg, {
          nextEpisodeIndex: nextIndex,
          userInstruction: chatInput.trim() || undefined,
          signal: ac.signal,
          onChunk: (chunk) => setStreamPreview((prev) => prev + chunk),
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
        const errMsg = formatScriptDeskError(e);
        nextSession = appendAgentMessage(nextSession, {
          role: 'system',
          content: `生成失败 · 第 ${nextIndex} 集：${errMsg}（可单独重试）`,
        });
        updateNodeData(props.id, { agentSession: nextSession });
        appendLog(`首次生成第 ${nextIndex} 集失败：${errMsg}`);
        // 继续尝试生成下一集
      }
    }

    setStreamPreview('');
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
    if (count > 10 && !(await askConfirm({
      title: `即将续写 ${count} 集`,
      description: '续写可能需要较长时间，确认继续？',
      confirmLabel: '继续续写',
      cancelLabel: '取消',
    }))) return;
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
    const failedIndexes: number[] = [];
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
      setStreamPreview('');
      try {
        const result = await runAppendEpisodeSkill(currentPkg, {
          nextEpisodeIndex: nextIndex,
          userInstruction: chatInput.trim() || undefined,
          signal: ac.signal,
          onChunk: (chunk) => setStreamPreview((prev) => prev + chunk),
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
        failedIndexes.push(nextIndex);
        const errMsg = formatScriptDeskError(e);
        nextSession = appendAgentMessage(nextSession, {
          role: 'system',
          content: `续写失败 · 第 ${nextIndex} 集：${errMsg}`,
        });
        updateNodeData(props.id, { agentSession: nextSession });
        appendLog(`续写第 ${nextIndex} 集失败：${errMsg}`);
        continue;
      }
    }

    currentPkg = runAutoLint(currentPkg);
    savePkg(currentPkg);
    if (failedIndexes.length > 0) setFailedEpisodeIndexes(failedIndexes);

    // completion message
    const summary = aborted
      ? `续写已停止 · 新增第 ${startIndex}–${startIndex + ok - 1} 集 · 成功 ${ok}`
      : ok > 0
        ? `续写完成 · 新增第 ${startIndex}–${startIndex + ok - 1} 集 · 成功 ${ok}${failedIndexes.length > 0 ? ` · 失败 ${failedIndexes.join(', ')}` : ' · 全部成功'}`
        : '续写失败，未成功生成任何集';
    nextSession = appendAgentMessage(nextSession, {
      role: 'system',
      content: summary,
    });
    updateNodeData(props.id, { agentSession: nextSession });
    if (ok > 0) {
       appendLog(`续写完成 · 新增第 ${startIndex}–${startIndex + ok - 1} 集 · 成功 ${ok} · ${failedIndexes.length > 0 ? `失败 ${failedIndexes.join(', ')}` : '全部成功'}`);
      setTip(aborted ? `已停止 · 新增 ${ok} 集` : `续写完成 · 新增 ${ok} 集`);
    } else {
      setTip(aborted ? '已停止' : '续写失败，未成功生成任何集');
    }
    if (abortRef.current === ac) abortRef.current = null;
    setStreamPreview('');
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
    setStreamPreview('');
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
        onChunk: (chunk) => setStreamPreview((prev) => prev + chunk),
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
      const errMsg = formatScriptDeskError(e);
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
      setStreamPreview('');
    }
  }, [appendLog, busy, chatInput, continueBusy, pkg, props.id, rewritingEpIndex, session, updateNodeData]);

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
    savePkg((current) => {
      let next = touchScreenplayPackage(current, { brief: { ...current.brief, title: value } });
      if (current.status === 'confirmed') next = unconfirmIfEdited(next);
      return next;
    }, {}, { undo: 'typing' });
  }, [savePkg]);

  const patchEpisodeBody = useCallback((episodeId: string, bodyMd: string) => {
    dirtyRef.current = true;
    savePkg((current) => {
      const episodes = current.screenplay.episodes.map((ep) => (
        ep.id === episodeId
          ? { ...ep, bodyMd, updatedAt: new Date().toISOString() }
          : ep
      ));
      let next = touchScreenplayPackage(current, {
        screenplay: { ...current.screenplay, episodes },
      });
      if (current.status === 'confirmed') next = unconfirmIfEdited(next);
      return next;
    }, {}, { undo: 'typing' });
  }, [savePkg]);

  // B-01: 更新 Bible 人物卡片字段
  const patchBibleCharacter = useCallback((charId: string, field: string, value: string) => {
    dirtyRef.current = true;
    savePkg((current) => {
      const chars = current.bible.characters.map((c) => c.id === charId ? { ...c, [field]: value } : c);
      return touchScreenplayPackage(current, { bible: { ...current.bible, characters: chars } });
    }, {}, { undo: 'typing' });
  }, [savePkg]);

  // B-01: 更新 Bible 场景卡片字段
  const patchBibleScene = useCallback((sceneId: string, field: string, value: string) => {
    dirtyRef.current = true;
    savePkg((current) => {
      const scenes = current.bible.scenes.map((s) => s.id === sceneId ? { ...s, [field]: value } : s);
      return touchScreenplayPackage(current, { bible: { ...current.bible, scenes } });
    }, {}, { undo: 'typing' });
  }, [savePkg]);

  // B-04: 更新世界观字段
  const patchBibleWorld = useCallback((field: string, value: string) => {
    dirtyRef.current = true;
    savePkg((current) => (
      touchScreenplayPackage(current, {
        bible: { ...current.bible, world: { ...current.bible.world, [field]: value } },
      })
    ), {}, { undo: 'typing' });
  }, [savePkg]);

  // B-08: 人物全局改名（正文 + 标题 + Bible + 素材库档案同步）
  const handleRenameCharacter = useCallback(async (charId: string, newNameRaw: string) => {
    const current = pkgRef.current;
    const target = current.bible.characters.find((c) => c.id === charId);
    if (!target) return;
    const oldName = target.name.trim();
    const newName = newNameRaw.trim();
    if (!newName || newName === oldName) {
      setRenamingBibleCharId(null);
      return;
    }
    if (current.bible.characters.some((c) => c.id !== charId && c.name.trim() === newName)) {
      setTip(`已存在同名人物「${newName}」，如需归并请用「合并」`);
      return;
    }
    const libHit = findLibraryCharacterForRename(workspaceCharacters, {
      oldName,
      libraryCharacterId: target.libraryCharacterId,
    });
    if (libHit) {
      const conflict = libraryCharacterRenameConflict(workspaceCharacters, libHit.id, newName);
      if (conflict) {
        setTip(`素材库已有同名角色「${conflict.name}」，请先在素材库处理冲突后再改名`);
        return;
      }
    }
    const { bodyHits, bibleHits } = countCharacterRenameHits(current, oldName);
    const ok = await askConfirm({
      title: `全局改名「${oldName}」→「${newName}」`,
      description: `将替换成稿正文/集标题 ${bodyHits} 处、设定卡 ${bibleHits} 处${libHit ? '，并同步素材库角色档案名（旧名写入别名）' : ''}。${current.status === 'confirmed' ? '改名后成稿确认将失效，需重新确认。' : ''}`,
      confirmLabel: '改名',
    });
    if (!ok) return;
    dirtyRef.current = true;
    savePkg((live) => {
      let next = renameCharacterInPackage(live, oldName, newName);
      if (live.status === 'confirmed') next = unconfirmIfEdited(next);
      if (libHit) {
        next = {
          ...next,
          bible: {
            ...next.bible,
            characters: next.bible.characters.map((c) => (
              c.id === charId
                ? { ...c, libraryCharacterId: libHit.id }
                : c
            )),
          },
        };
      }
      return next;
    });
    if (libHit) {
      upsertCharacter(renameLibraryCharacterProfile(libHit, oldName, newName));
    }
    setRenamingBibleCharId(null);
    setTip(
      libHit
        ? `已改名 ${oldName} → ${newName} · 正文 ${bodyHits} 处、设定卡 ${bibleHits} 处 · 素材库已同步`
        : `已改名 ${oldName} → ${newName} · 正文 ${bodyHits} 处、设定卡 ${bibleHits} 处 · 素材库无匹配档案`,
    );
    appendLog(`编剧台：人物全局改名 ${oldName} → ${newName} · 正文 ${bodyHits} / 设定 ${bibleHits}${libHit ? ' · 库同步' : ''}`);
  }, [appendLog, savePkg, upsertCharacter, workspaceCharacters]);

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
    setOpenEpIds((prev) => {
      if (prev.has(epId)) return prev;
      const next = new Set(prev);
      next.add(epId);
      return next;
    });
    const el = document.getElementById(`sd2-ep-${epId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const onToggleSelectEpisode = useCallback((episodeId: string) => {
    setSelectedEpIds((prev) => {
      const next = new Set(prev);
      if (next.has(episodeId)) next.delete(episodeId);
      else next.add(episodeId);
      return next;
    });
  }, []);

  const onClearSelectedEpisodes = useCallback(() => {
    setSelectedEpIds(new Set());
  }, []);

  const handleBatchRewrite = useCallback(async () => {
    if (busy || continueBusy || rewritingEpIndex != null) return;
    const indexes = pkg.screenplay.episodes
      .filter((ep) => selectedEpIds.has(ep.id))
      .map((ep) => ep.index)
      .sort((a, b) => a - b);
    if (indexes.length === 0) return;
    const ok = await askConfirm({
      title: `批量重写 ${indexes.length} 集？`,
      description: `将依次重写第 ${indexes.join('、')} 集，每集产出需单独应用。`,
      confirmLabel: '开始重写',
    });
    if (!ok) return;
    for (const idx of indexes) {
      if (abortRef.current?.signal.aborted) break;
      await handleRewriteEpisode(idx);
    }
    setSelectedEpIds(new Set());
  }, [busy, continueBusy, handleRewriteEpisode, pkg.screenplay.episodes, rewritingEpIndex, selectedEpIds]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setTip('剪贴板为空');
        return;
      }
      if (!textLooksLikeEpisodicScreenplay(text)) {
        setTip('剪贴板不像分集剧本（需含「第N集」）');
        return;
      }
      setIngestText(text);
      setEntryMode('ingest');
      setTip('已从剪贴板填入，确认后写入成稿');
    } catch {
      setTip('无法读取剪贴板（需授予权限）');
    }
  }, [setEntryMode]);

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
      const prev = undoStackRef.current.pop()!;
      lastUndoRef.current = null;
      savePkg(prev, {}, { undo: false });
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

  // S-01: 自动工作草稿定时存储（每 60s）；interval 不依赖 pkg，避免键入重置
  useEffect(() => {
    if (!studioOpen || !hasDraftMemory) return;
    const id = setInterval(() => {
      const cur = latestDraftRef.current;
      const { isNew } = upsertScriptDeskWorkingDraft({
        package: cur.pkg,
        agentSession: cur.session,
        entryMode: cur.entryMode,
        sourceBlockId: cur.id,
      });
      if (isNew) showTimedTip('已自动保存到草稿「工作中」');
      dirtyRef.current = false;
    }, 60000);
    autoSaveTimerRef.current = id;
    return () => {
      clearInterval(id);
      autoSaveTimerRef.current = null;
    };
  }, [studioOpen, hasDraftMemory, upsertScriptDeskWorkingDraft, showTimedTip]);

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

  const applyDeskSnapshot = useCallback((folder: {
    package: ScreenplayPackage;
    agentSession: ScriptDeskAgentSession;
    entryMode?: EntryMode;
  }) => {
    prevConfirmedRef.current = confirmedLatchForSnapshot(folder.package.status);
    lastUndoRef.current = null;
    undoStackRef.current = [];
    pkgRef.current = folder.package;
    persistScriptDeskPackage(updateNodeData, props.id, folder.package, {
      agentSession: compactAgentSession(folder.agentSession),
      entryMode: folder.entryMode ?? 'agent',
    });
    setEntryMode(folder.entryMode ?? 'agent');
    setIngestText(screenplayFullText(folder.package));
    setChatInput('');
    setRightTab('screenplay');
    setOpenEpIds(new Set(initialOpenEpisodeIds(folder.package)));
    setSelectedEpIds(new Set());
    setStreamPreview('');
    setChatSearch('');
    setCollapsedMsgIds(new Set());
  }, [props.id, setEntryMode, updateNodeData]);

  const resetDeskToEmpty = useCallback(() => {
    const empty = emptyScreenplayPackage();
    prevConfirmedRef.current = false;
    lastUndoRef.current = null;
    undoStackRef.current = [];
    pkgRef.current = empty;
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
    setOpenEpIds(new Set());
    setSelectedEpIds(new Set());
    setStreamPreview('');
    setChatSearch('');
    setCollapsedMsgIds(new Set());
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
      const { folder: auto, isNew } = upsertScriptDeskWorkingDraft({
        package: pkg,
        agentSession: session,
        entryMode,
        sourceBlockId: props.id,
      });
      const label = auto.title || '工作中';
      showTimedTip(isNew ? `当前《${label}》已自动存入草稿` : `当前《${label}》已更新到工作草稿`);
      toastSuccess(isNew ? `当前《${label}》已自动存入草稿` : `当前《${label}》已更新到工作草稿`);
    }

    applyDeskSnapshot(folder);
    setDraftsOpen(false);
    setRightDrawerOpen(true);
  }, [
    applyDeskSnapshot, entryMode, getScriptDeskDraft, hasDraftMemory,
    pkg, props.id, session, showTimedTip, upsertScriptDeskWorkingDraft,
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
    const runningTask = busy || continueBusy || rewritingEpIndex != null;
    if (runningTask) {
      const result = await askConfirmWithOption({
        title: '任务仍在运行',
        description: '可以停止任务并关闭，或继续后台运行。',
        confirmLabel: '关闭并停止任务',
        cancelLabel: '取消',
        tone: 'danger',
        option: { label: '继续后台运行', defaultChecked: false },
      });
      if (!result.confirmed) return;
      if (!result.optionChecked) abortRef.current?.abort();
    }
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
  }, [busy, continueBusy, rewritingEpIndex, hasDraftMemory, pkg, session, entryMode, props.id, upsertScriptDeskWorkingDraft, dirtyRef]);

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
        onClose={handleCloseStudio}
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
              toggleSkill('generate');
              if (pkg.screenplay.episodes.length === 0) {
                openFirstGenFloat(pkg);
              }
            }}
            onSetIngest={() => setEntryMode('ingest')}
            onToggleDrawer={() => setRightDrawerOpen((v) => !v)}
            onOpenDiagnostics={() => {
              setRightDrawerOpen(true);
              setRightTab('diagnostics');
            }}
            onExtractBible={() => void handleExtractBible()}
            onOpenDrafts={() => setDraftsOpen(true)}
            onResetDesk={() => void handleResetDesk()}
            onHandoff={handleHandoffToStoryboard}
            onConfirm={handleConfirm}
            onToggleMore={() => setShowMoreMenu((v) => !v)}
            onExportMd={() => { handleExportMd(); setShowMoreMenu(false); }}
            onExportJson={() => { handleExportJson(); setShowMoreMenu(false); }}
            onExportZip={() => { void handleExportPackage(); setShowMoreMenu(false); }}
          />
        )}
      >
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
            onOpenDraft={handleOpenDraftFolder}
            onDeleteDraft={handleDeleteDraftFolder}
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
                    onClick={() => { setEntryMode('agent'); toggleSkill(skill.id); }}
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
                    <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => void handlePasteFromClipboard()}>从剪贴板填入</button>
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
                  onToggleSkill={toggleSkill}
                  onSetEntryMode={setEntryMode}
                  onOpenDrafts={() => setDraftsOpen(true)}
                  onApplyMessage={handleApplyMessage}
                  onDiscardMessage={handleDiscardMessage}
                  onGenStart={() => void handleGenStart()}
                  onAbort={() => abortRef.current?.abort()}
                  onAgentSend={() => void handleAgentSend()}
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
                      patchBriefTitle={patchBriefTitle}
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
                      onRetryFailed={handleRetryFailed}
                      skeletonIndexes={skeletonIndexes}
                      epMoreMenuId={epMoreMenuId}
                      setEpMoreMenuId={setEpMoreMenuId}
                      dragEpId={dragEpId}
                      setDragEpId={setDragEpId}
                      onInsertEmptyEpisode={handleInsertEmptyEpisode}
                      onEpisodeReorder={handleEpisodeReorder}
                      onRewriteEpisode={handleRewriteEpisode}
                      onRemoveEpisode={handleRemoveEpisode}
                      patchEpisodeBody={patchEpisodeBody}
                      scrollToEpisode={scrollToEpisode}
                      openEpIds={openEpIds}
                      setOpenEpIds={setOpenEpIds}
                      selectedEpIds={selectedEpIds}
                      onToggleSelectEpisode={onToggleSelectEpisode}
                      onBatchRewrite={() => { void handleBatchRewrite(); }}
                      onClearSelectedEpisodes={onClearSelectedEpisodes}
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
                      onRenameCharacter={handleRenameCharacter}
                      patchBibleCharacter={patchBibleCharacter}
                      patchBibleScene={patchBibleScene}
                      patchBibleWorld={patchBibleWorld}
                      removeBibleCharacter={removeBibleCharacter}
                      removeBibleScene={removeBibleScene}
                      mergeSelection={mergeSelection}
                      mergeType={mergeType}
                      setMergeSelection={setMergeSelection}
                      setMergeType={setMergeType}
                      toggleMergeSelect={toggleMergeSelect}
                      onBibleMerge={handleBibleMerge}
                      highlightedBibleId={highlightedBibleId}
                      openAssetAt={openAssetAt}
                    />
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
                    <DiagnosticsPanel
                      pkg={pkg}
                      busy={busy}
                      onManualCheck={handleManualConsistencyCheck}
                      onAutoFix={handleAutoFix}
                      onDiagClick={handleDiagClick}
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
                            <ContinuePop
                              pkg={pkg}
                              continueCount={continueCount}
                              continueBusy={continueBusy}
                              onChangeCount={setContinueCount}
                              onCancel={() => setContinueOpen(false)}
                              onStart={() => void handleContinueStart()}
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
