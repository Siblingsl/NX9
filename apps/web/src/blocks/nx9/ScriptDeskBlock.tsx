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
  RotateCcw,
  RefreshCw,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  Wand2,
} from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  type ScreenplayPackage,
  type ScriptDeskAgentSession,
  type ScriptDeskSkillId,
  emptyScreenplayPackage,
  normalizeScreenplayEpisodes,
  screenplayFullText,
  screenplayWordCount,
  touchScreenplayPackage,
  unconfirmIfEdited,
} from '@nx9/shared';
import { enrichPromptWithAssetMentions } from '@nx9/shared';
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

const SKILL_CHIPS: Array<{ id: ScriptDeskSkillId; label: string }> = [
  { id: 'topic', label: '选题' },
  { id: 'world', label: '世界观' },
  { id: 'character', label: '人物' },
  { id: 'plot', label: '剧情' },
  { id: 'pacing', label: '节奏' },
  { id: 'dialogue', label: '对白' },
  { id: 'hooks', label: '爆点' },
  { id: 'consistency', label: '一致性' },
  { id: 'generate', label: '生成剧本' },
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
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const nodeData = props.data as Record<string, unknown> | undefined;
  const pkg = useMemo(() => readScriptDeskPackage(nodeData), [nodeData]);
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
  const tipClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scriptDeskDrafts = useWorkspaceDocument((s) => s.scriptDeskDrafts);
  const saveScriptDeskDraft = useWorkspaceDocument((s) => s.saveScriptDeskDraft);
  const trashScriptDeskSnapshot = useWorkspaceDocument((s) => s.trashScriptDeskSnapshot);
  const moveScriptDeskDraftToTrash = useWorkspaceDocument((s) => s.moveScriptDeskDraftToTrash);
  const getScriptDeskDraft = useWorkspaceDocument((s) => s.getScriptDeskDraft);

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

  const savePkg = useCallback((next: ScreenplayPackage, extra: Record<string, unknown> = {}) => {
    persistScriptDeskPackage(updateNodeData, props.id, next, extra);
  }, [props.id, updateNodeData]);

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

  const handleIngestSave = useCallback(() => {
    const text = ingestText.trim();
    if (!text) {
      setTip('请粘贴或上传剧本文本');
      return;
    }
    let next = ingestScreenplayText(pkg, text, 'pasted');
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next, { entryMode: 'ingest' });
    setTip(pkg.status === 'confirmed' ? '成稿已失效，需重新确认' : '成稿已写入 package');
    appendLog(`编剧台：已保存成稿 · ${next.screenplay.episodes.length} 集`);
    setRightTab('screenplay');
  }, [appendLog, ingestText, pkg, savePkg]);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    setIngestText(text);
    let next = ingestScreenplayText(pkg, text, 'uploaded');
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next, { entryMode: 'ingest' });
    setTip(`已导入 ${file.name}`);
    appendLog(`编剧台：上传成稿 ${file.name}`);
  }, [appendLog, pkg, savePkg]);

  const handleExtractBible = useCallback(async () => {
    if (!screenplayFullText(pkg).trim()) {
      setTip('请先写入成稿');
      return;
    }
    setBusy(true);
    setTip('抽取 Bible 中…');
    try {
      updateNodeData(props.id, { status: 'running' });
      const next = await extractBibleFromPackage(pkg);
      savePkg(next);
      setRightTab('bible');
      setTip(`Bible 已更新 · 角 ${next.bible.characters.length} / 场 ${next.bible.scenes.length}`);
      appendLog(`编剧台：抽取 Bible · 角 ${next.bible.characters.length} / 场 ${next.bible.scenes.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateNodeData(props.id, { status: 'error', error: msg });
      setTip(`抽取失败：${msg}`);
      appendLog(`编剧台抽取失败：${msg}`);
    } finally {
      setBusy(false);
    }
  }, [appendLog, pkg, props.id, savePkg, updateNodeData]);

  const handleConfirm = useCallback(() => {
    const next = confirmPackage(pkg);
    if (next.status !== 'confirmed') {
      setTip(next.diagnostics?.find((d) => d.code === 'empty-screenplay')?.message || '无法确认');
      savePkg(next);
      return;
    }
    const readiness = inspectBibleAssets(next);
    savePkg(next, { assetReadiness: readiness });
    setRightTab('readiness');
    setTip(
      readiness.ready
        ? '成稿已确认，设定已就绪'
        : `成稿已确认 · 设定缺口：角色 ${readiness.missingCharacters.length} / 场景 ${readiness.missingScenes.length}`,
    );
    appendLog(`编剧台：确认成稿 · ${packageSummaryLine(next)}`);
  }, [appendLog, pkg, savePkg]);

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
    const runtime = useFlowRuntime.getState().runtime;
    const nodes = runtime?.getNodes() ?? [];
    const storyboardDesk = nodes.find((n) => n.type === 'storyboard-desk');
    if (storyboardDesk) {
      runtime?.focusBlock(storyboardDesk.id);
      setTip('已打开分镜台 · 请在「拆镜」页点「从成稿拆镜」（送到分镜不会自动生成镜表）');
      appendLog(`编剧台：打开分镜台 · 请手动从成稿拆镜`);
    } else {
      const handoffData = {
        connectToSource: props.id,
        handoff: {
          from: 'script-desk',
          to: 'storyboard-desk',
          fromId: props.id,
          at: new Date().toISOString(),
        },
      };
      useFlowCommands.getState().requestSpawn('storyboard-desk', undefined, handoffData);
      setTip('已创建分镜台并连线 · 打开后请在「拆镜」页点「从成稿拆镜」');
      appendLog(`编剧台：送至分镜 · 一键创建并连线分镜台`);
    }
  }, [appendLog, pkg, props.id]);

  const handleReadinessChange = useCallback((state: AssetReadinessState) => {
    updateNodeData(props.id, { assetReadiness: state });
    if (state.ready) {
      setTip('设定已就绪，可交分镜台');
      appendLog('编剧台：已标记设定就绪');
    }
  }, [appendLog, props.id, updateNodeData]);

  const handleManualConsistencyCheck = useCallback(() => {
    const next = runConsistencyCheck(pkg);
    savePkg(next);
    setRightTab('diagnostics');
    setTip(`一致性检查完成 · 诊断 ${next.diagnostics?.length ?? 0} 条`);
    appendLog(`编剧台：手动一致性检查 · ${next.diagnostics?.length ?? 0} 条`);
  }, [appendLog, pkg, savePkg]);

  const handleAutoFix = useCallback(() => {
    const { package: next, fixedCount } = applyConsistencyFixes(pkg);
    if (fixedCount === 0) {
      setTip('未发现可自动修复的缺失字段');
      return;
    }
    savePkg(next);
    setTip(`已一键填充 ${fixedCount} 个缺失字段`);
    appendLog(`编剧台：一键修复 ${fixedCount} 个字段`);
  }, [appendLog, pkg, savePkg]);

  const handleDiagClick = useCallback((entityId?: string) => {
    if (entityId) {
      setHighlightedBibleId(entityId);
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
      setTip('请先共创并应用 Brief（至少剧名或 logline）');
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
    // 生成技能且尚无分集：改走底浮层选集数，不直接发送
    if (skillId === 'generate' && pkg.screenplay.episodes.length === 0) {
      openFirstGenFloat(pkg);
      return;
    }
    const enrichedInstruction = enrichPromptWithAssetMentions(instruction || `执行技能：${skillId}`, privateItems, publicItems);
    setBusy(true);
    updateNodeData(props.id, { status: 'running', entryMode: 'agent' });
    let nextSession = appendAgentMessage(session, {
      role: 'user',
      content: enrichedInstruction,
      skillId,
    });
    updateNodeData(props.id, { agentSession: nextSession });
    try {
      const result = await runScriptDeskSkill(skillId, pkg, enrichedInstruction);
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
      const msg = e instanceof Error ? e.message : String(e);
      nextSession = appendAgentMessage(nextSession, {
        role: 'assistant',
        content: `失败：${msg}`,
        skillId,
      });
      updateNodeData(props.id, { agentSession: nextSession, status: 'error', error: msg });
      setTip(msg);
      appendLog(`编剧台 Agent 失败：${msg}`);
    } finally {
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
      '## Bible · 人物',
      ...pkg.bible.characters.map((c) => `- **${c.name}**：${[c.identity, c.personality, c.appearance].filter(Boolean).join(' · ')}`),
      '',
      '## Bible · 场景',
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
      setTip('请先共创并应用 Brief（至少剧名或 logline）');
      return;
    }
    setGenFloatExpanded(false);
    setFirstGenFloatDeferred(true);
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
    let failAt: number | null = null;
    for (let i = 0; i < resolvedCount; i++) {
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
        });
        if (result.patch) {
          currentPkg = touchScreenplayPackage(currentPkg, result.patch);
          if (currentPkg.status === 'confirmed') currentPkg = unconfirmIfEdited(currentPkg);
          savePkg(currentPkg);
          ok++;
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
        failAt = nextIndex;
        const errMsg = e instanceof Error ? e.message : String(e);
        nextSession = appendAgentMessage(nextSession, {
          role: 'system',
          content: `生成失败 · 第 ${nextIndex} 集：${errMsg}`,
        });
        updateNodeData(props.id, { agentSession: nextSession });
        appendLog(`首次生成第 ${nextIndex} 集失败：${errMsg}`);
        break;
      }
    }

    const summary = ok > 0
      ? `首次生成完成 · 第 1–${ok} 集 · 成功 ${ok}${failAt != null ? ` · 第 ${failAt} 集失败` : ' · 全部成功'}`
      : '首次生成失败，未成功生成任何集';
    nextSession = appendAgentMessage(nextSession, {
      role: 'system',
      content: summary,
    });
    updateNodeData(props.id, {
      agentSession: nextSession,
      status: ok > 0 ? 'success' : 'error',
      ...(ok === 0 && failAt != null ? { error: summary } : {}),
    });
    if (ok > 0) {
      setChatInput('');
      setTip(`已生成 ${ok} 集`);
      appendLog(`编剧台首次生成 · 成功 ${ok} 集 · 目标 ${resolvedCount}`);
      setRightTab('screenplay');
      setRightDrawerOpen(true);
      setFirstGenFloatDeferred(false);
    } else {
      setTip('首次生成失败，未成功生成任何集');
      setFirstGenFloatDeferred(false);
      setGenFloatExpanded(true);
    }
    setBusy(false);
  }, [appendLog, chatInput, genEpisodeCount, pkg, props.id, savePkg, session, updateNodeData]);

  // F1: 确认续写集数后开始追加
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
    for (let i = 0; i < count; i++) {
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
        });
        if (result.patch) {
          currentPkg = touchScreenplayPackage(currentPkg, result.patch);
          if (currentPkg.status === 'confirmed') currentPkg = unconfirmIfEdited(currentPkg);
          savePkg(currentPkg);
          ok++;

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

    // completion message
    const summary = ok > 0
      ? `续写完成 · 新增第 ${startIndex}–${startIndex + ok - 1} 集 · 成功 ${ok}${failAt != null ? ` · 第 ${failAt} 集失败` : ' · 全部成功'}`
      : '续写失败，未成功生成任何集';
    nextSession = appendAgentMessage(nextSession, {
      role: 'system',
      content: summary,
    });
    updateNodeData(props.id, { agentSession: nextSession });
    if (ok > 0) {
      appendLog(`续写完成 · 新增第 ${startIndex}–${startIndex + ok - 1} 集 · 成功 ${ok} · ${failAt != null ? `第 ${failAt} 集失败` : '全部成功'}`);
      setTip(`续写完成 · 新增 ${ok} 集`);
    } else {
      setTip('续写失败，未成功生成任何集');
    }
    setContinueBusy(false);
    updateNodeData(props.id, { status: 'success' });
    setChatInput('');
  }, [appendLog, chatInput, continueCount, pkg, props.id, savePkg, session, updateNodeData]);

  /** 重写本集：保留集号/id，替换正文；prompt 带上一集结尾与下一集开头以保证衔接 */
  const handleRewriteEpisode = useCallback(async (episodeIndex: number) => {
    if (busy || continueBusy || rewritingEpIndex != null) return;
    const target = pkg.screenplay.episodes.find((ep) => ep.index === episodeIndex);
    if (!target) {
      setTip(`第 ${episodeIndex} 集不存在`);
      return;
    }
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
      });
      let nextPkg = touchScreenplayPackage(pkg, result.patch);
      if (nextPkg.status === 'confirmed') nextPkg = unconfirmIfEdited(nextPkg);
      savePkg(nextPkg);

      const rewritten = nextPkg.screenplay.episodes.find((ep) => ep.index === episodeIndex);
      const epTitle = rewritten?.title || target.title || `第${episodeIndex}集`;
      const bodyPreview = (rewritten?.bodyMd || '').slice(0, 800);
      const truncatedNote = (rewritten?.bodyMd || '').length > 800 ? '\n\n（完整正文已写入右侧成稿）' : '';
      nextSession = appendAgentMessage(nextSession, {
        role: 'assistant',
        content: `已重写第 ${episodeIndex} 集《${epTitle}》\n\n${bodyPreview}${truncatedNote}`,
        skillId: 'generate',
      });
      nextSession = appendAgentMessage(nextSession, {
        role: 'system',
        content: `重写完成 · 第 ${episodeIndex} 集（已衔接前后集）`,
      });
      updateNodeData(props.id, { agentSession: nextSession, status: 'success' });
      setTip(`已重写第 ${episodeIndex} 集`);
      appendLog(`编剧台重写第 ${episodeIndex} 集`);
      setRightTab('screenplay');
      setRightDrawerOpen(true);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      nextSession = appendAgentMessage(nextSession, {
        role: 'system',
        content: `重写失败 · 第 ${episodeIndex} 集：${errMsg}`,
      });
      updateNodeData(props.id, { agentSession: nextSession, status: 'error', error: errMsg });
      setTip(`重写失败：${errMsg}`);
      appendLog(`重写第 ${episodeIndex} 集失败：${errMsg}`);
    } finally {
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
    let next = touchScreenplayPackage(pkg, { brief: { ...pkg.brief, title: value } });
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next);
  }, [pkg, savePkg]);

  const patchEpisodeBody = useCallback((episodeId: string, bodyMd: string) => {
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
    if (!hasDraftMemory) {
      showTimedTip('当前编剧台已是空台，无需重置');
      return;
    }
    const result = await askConfirmWithOption({
      title: '确定重置编剧台？',
      description: '将清空当前剧集、Bible、对话与相关成稿内容，此操作不可就地撤销。',
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
          <div className="sd2-card__meta">{epCount} 集 · Bible 角 {charCount} · 场 {sceneCount}</div>
          <div className="sd2-card__logline">{logline ? compact(logline, 72) : '点击打开编剧台 · Agent 共创或上传成稿'}</div>
          <div className="sd2-card__actions">
            <button type="button" className="sd2-btn sd2-btn--ghost" onClick={(e) => { e.stopPropagation(); setStudioOpen(true); }}>打开编剧台</button>
          </div>
        </div>
      </div>

      <ScreenModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        title="编剧台"
        subtitle="共创成稿 → 抽取 Bible → 确认交付"
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
                disabled={busy}
                onClick={() => void handleExtractBible()}
                title="抽取 Bible"
                aria-label="抽取 Bible"
              >
                <Sparkles size={15} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className={`sd2-tool ${draftsOpen ? 'is-on' : ''}`}
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
                onClick={() => void handleResetDesk()}
                title="重置编剧台"
                aria-label="重置编剧台"
              >
                <RotateCcw size={15} strokeWidth={1.75} />
              </button>
            </div>

            {pkg.status === 'confirmed' ? (
              <>
                <button type="button" className="sd2-btn sd2-btn--ghost" disabled={busy} onClick={handleConfirm}>
                  <Check size={14} /> 确认成稿
                </button>
                <button type="button" className="sd2-btn sd2-btn--primary" disabled={busy} onClick={handleHandoffToStoryboard}>
                  <Send size={14} /> 送到分镜台
                </button>
              </>
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
                  <button type="button" onClick={() => { clearSession(); setShowMoreMenu(false); }}>清空会话</button>
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
                        <div className="sd2-draft-folder__title">{folder.title}</div>
                        <div className="sd2-draft-folder__sub">
                          {folder.episodeCount} 集 · {folder.wordCount} 字 · {new Date(folder.savedAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="sd2-draft-folder__acts">
                        <button
                          type="button"
                          className="sd2-btn sd2-btn--primary"
                          onClick={() => handleOpenDraftFolder(folder.id)}
                        >
                          打开
                        </button>
                        <button
                          type="button"
                          className="sd2-btn sd2-btn--ghost"
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

        <div className="sd2-layout" onClick={() => { if (showMoreMenu) setShowMoreMenu(false); if (chatMenu) setChatMenu(null); }}>
          <div className="sd2-flow">
            <span className="sd2-flow__step is-on">1 共创</span>
            <span className="sd2-flow__arrow" aria-hidden>→</span>
            <span className="sd2-flow__step">2 成稿</span>
            <span className="sd2-flow__arrow" aria-hidden>→</span>
            <span className="sd2-flow__step">3 确认</span>
          </div>

          <div className="sd2-skill-rail" role="tablist" aria-label="创作技能">
            {SKILL_CHIPS.filter((skill) => skill.id !== 'generate').map((skill) => (
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
                    <p>支持拖放或粘贴；写入后可抽取 Bible，再确认交付。</p>
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
                    {session.messages.map((m) => (
                      <div key={m.id} className={`sd2-msg sd2-msg--${m.role}`}>
                        <div className="sd2-msg__meta">
                          {m.role === 'user' ? '你' : m.role === 'assistant' ? '编剧 Agent' : '系统'}
                          {m.skillId ? ` · ${m.skillId}` : ''}
                        </div>
                        <div className="sd2-msg__body">{m.content}</div>
                        {m.pendingPatch && !m.applied && (
                          <button type="button" className="sd2-btn sd2-btn--primary sd2-msg__apply" onClick={() => handleApplyMessage(m.id)}>应用此步产出</button>
                        )}
                        {m.applied && <div className="sd2-msg__applied">已应用</div>}
                      </div>
                    ))}
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
                                {([1, 3, 5, 10] as const).map((n) => (
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
                            <div className="sd2-at-dropdown__group">Bible draft</div>
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
                    <button type="button" className="sd2-btn sd2-btn--primary" disabled={busy} onClick={() => void handleAgentSend()}>
                      {busy ? <Loader2 size={14} className="sd-spin" /> : <MessageSquareText size={14} />} 发送
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
                  <button type="button" className={rightTab === 'bible' ? 'is-on' : ''} onClick={() => setRightTab('bible')}>Bible</button>
                  <button type="button" className={rightTab === 'readiness' ? 'is-on' : ''} onClick={() => setRightTab('readiness')}>设定就绪</button>
                  <button type="button" className={rightTab === 'diagnostics' ? 'is-on' : ''} onClick={() => setRightTab('diagnostics')}>诊断</button>
                </div>
                <div className="sd2-drawer__body">
                  {rightTab === 'screenplay' && (
                    <>
                      <div className="sd2-brief-row">
                        <label className="sd2-field">
                          <span className="sd2-field__label">剧名</span>
                          <input value={pkg.brief.title ?? ''} onChange={(e) => patchBriefTitle(e.target.value)} placeholder="剧名" />
                        </label>
                        <label className="sd2-field">
                          <span className="sd2-field__label">logline</span>
                          <input value={pkg.brief.logline ?? ''} onChange={(e) => { let next = touchScreenplayPackage(pkg, { brief: { ...pkg.brief, logline: e.target.value } }); if (pkg.status === 'confirmed') next = unconfirmIfEdited(next); savePkg(next); }} placeholder="一句话故事" />
                        </label>
                      </div>
                      {(pkg.brief.hooks ?? []).length > 0 && (
                        <div className="sd2-hook-timeline" title="爆点轨">
                          <div className="sd2-hook-timeline__bar">
                            {(pkg.brief.hooks ?? []).map((hook, i) => (
                              <span key={i} className="sd2-hook-timeline__dot" title={hook} />
                            ))}
                          </div>
                        </div>
                      )}
                      {pkg.screenplay.episodes.length === 0 && <div className="sd2-empty">尚无分集成稿</div>}
                      {normalizeScreenplayEpisodes(pkg.screenplay.episodes).map((ep) => {
                        const isRewriting = rewritingEpIndex === ep.index;
                        const titleLabel = episodeDisplayTitle(ep.index, ep.title);
                        return (
                          <details key={ep.id} className="sd2-ep" defaultOpen={ep.index === 1}>
                            <summary className="sd2-ep__summary">
                              <ChevronRight className="sd2-ep__chevron" size={14} aria-hidden />
                              <span className="sd2-ep__title">
                                {titleLabel ? `第${ep.index}集 · ${titleLabel}` : `第${ep.index}集`}
                              </span>
                              <button
                                type="button"
                                className={`sd2-ep__rewrite${isRewriting ? ' is-busy' : ''}`}
                                disabled={busy || continueBusy || rewritingEpIndex != null}
                                title={isRewriting ? '重写中…' : '重写本集（衔接前后集）'}
                                aria-label={isRewriting ? `第${ep.index}集重写中` : `重写第${ep.index}集`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleRewriteEpisode(ep.index);
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                <RefreshCw size={13} className={isRewriting ? 'sd-spin' : undefined} aria-hidden />
                              </button>
                            </summary>
                            <div className="sd2-ep__body">
                              <textarea
                                value={ep.bodyMd}
                                onChange={(e) => patchEpisodeBody(ep.id, e.target.value)}
                                rows={8}
                                disabled={isRewriting}
                              />
                            </div>
                          </details>
                        );
                      })}
                    </>
                  )}
                  {rightTab === 'bible' && (
                    <>
                      <div className="sd2-section-label">人物 draft（叙事层 · 不入库）</div>
                      {pkg.bible.characters.length === 0 && <div className="sd2-empty">暂无人物</div>}
                      {pkg.bible.characters.map((c) => (
                        <div key={c.id} className={`sd2-bible-card${highlightedBibleId === c.name ? ' sd2-bible-card--highlight' : ''}`}>
                          <div className="sd2-bible-card__name">{c.name}</div>
                          <div className="sd2-bible-card__meta">{c.identity || c.personality || c.appearance ? [c.identity, c.personality, c.appearance].filter(Boolean).join(' · ') : '—'}</div>
                          <div className="sd2-bible-card__tag">{c.libraryStatus ?? 'draft'}</div>
                        </div>
                      ))}
                      <div className="sd2-section-label">场景 draft</div>
                      {pkg.bible.scenes.length === 0 && <div className="sd2-empty">暂无场景</div>}
                      {pkg.bible.scenes.map((s) => (
                        <div key={s.id} className={`sd2-bible-card${(highlightedBibleId === s.name || highlightedBibleId === s.code) ? ' sd2-bible-card--highlight' : ''}`}>
                          <div className="sd2-bible-card__name">{s.name}</div>
                          <div className="sd2-bible-card__meta">{s.location || s.summary ? [s.location, s.summary].filter(Boolean).join(' · ') : '—'}</div>
                          <div className="sd2-bible-card__tag">{s.libraryStatus ?? 'draft'}</div>
                        </div>
                      ))}
                      {pkg.bible.world && (
                        <>
                          <div className="sd2-section-label">世界观</div>
                          <div className="sd2-bible-card">
                            <div className="sd2-bible-card__meta">{[pkg.bible.world.era, pkg.bible.world.location, pkg.bible.world.worldview].filter(Boolean).join(' · ') || '—'}</div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {rightTab === 'readiness' && (
                    <AssetReadinessPanel
                      blockId={props.id}
                      pkg={pkg}
                      onReadinessChange={handleReadinessChange}
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
                          className={`sd2-diag sd2-diag--${d.level}${d.entityId ? ' sd2-diag--clickable' : ''}`}
                          title={d.entityId ? `点击定位到 Bible「${d.entityId}」` : undefined}
                          onClick={() => handleDiagClick(d.entityId)}
                          role={d.entityId ? 'button' : undefined}
                          tabIndex={d.entityId ? 0 : undefined}
                          onKeyDown={d.entityId ? (e) => { if (e.key === 'Enter') handleDiagClick(d.entityId); } : undefined}
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
                          disabled={busy || continueBusy}
                          title={
                            isBriefReadyForFirstGen(pkg)
                              ? '打开左侧选集框，确认集数后开始'
                              : '请先共创并应用 Brief（至少剧名或 logline）'
                          }
                          onClick={() => {
                            openFirstGenFloat(pkg);
                          }}
                        >
                          {busy ? '生成中…' : '生成分集'}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="sd2-btn sd2-btn--primary"
                            disabled={continueBusy || busy}
                            onClick={() => setContinueOpen(true)}
                          >
                            {continueBusy ? '续写中…' : '续写'}
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
                                全部 = 补齐 Brief 目标集数；无目标则续写 10 集
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
        {chatMenu && (
          <div className="sd2-ctx-menu" style={{ left: chatMenu.x, top: chatMenu.y }}>
            <button
              type="button"
              className="sd2-ctx-menu__item"
              onClick={() => {
                setChatMenu(null);
                if (window.confirm('清空左侧对话？不成稿与 Bible。')) {
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
