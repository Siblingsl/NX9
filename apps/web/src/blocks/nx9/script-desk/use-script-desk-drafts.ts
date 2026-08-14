import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ScreenplayPackage, ScriptDeskAgentSession, ScriptDeskFolderSnapshot, ScriptDeskSkillId } from '@nx9/shared';
import { emptyScreenplayPackage, screenplayFullText } from '@nx9/shared';
import { compactAgentSession, persistScriptDeskPackage } from '../../../engine/script-desk-runner';
import { askConfirmWithOption, confirmDelete } from '../../../stores/confirm-dialog';
import { toastSuccess } from '../../../stores/toast';
import { flushDebouncedFields } from './use-debounced-field';
import {
  confirmedLatchForSnapshot,
  initialOpenEpisodeIds,
  type EntryMode,
  type RightTab,
  type UndoLatch,
} from './desk-helpers';

export type ScriptDeskDraftDeps = {
  propsId: string;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  entryMode: EntryMode;
  busy: boolean;
  continueBusy: boolean;
  rewritingEpIndex: number | null;
  hasDraftMemory: boolean;
  pkgRef: { current: ScreenplayPackage };
  sessionRef: { current: ScriptDeskAgentSession };
  abortRef: { current: AbortController | null };
  tipClearRef: { current: ReturnType<typeof setTimeout> | null };
  dirtyRef: { current: boolean };
  prevConfirmedRef: { current: boolean };
  lastUndoRef: { current: UndoLatch | null };
  undoStackRef: { current: Array<{ package: ScreenplayPackage; agentSession?: ScriptDeskAgentSession }> };
  saveScriptDeskDraft: (input: {
    package: ScreenplayPackage;
    agentSession?: ScriptDeskAgentSession;
    entryMode?: EntryMode;
    sourceBlockId?: string;
  }) => ScriptDeskFolderSnapshot;
  trashScriptDeskSnapshot: (input: {
    package: ScreenplayPackage;
    agentSession?: ScriptDeskAgentSession;
    entryMode?: EntryMode;
    sourceBlockId?: string;
  }) => ScriptDeskFolderSnapshot;
  getScriptDeskDraft: (id: string) => ScriptDeskFolderSnapshot | null;
  upsertScriptDeskWorkingDraft: (input: {
    package: ScreenplayPackage;
    agentSession?: ScriptDeskAgentSession;
    entryMode?: EntryMode;
    sourceBlockId?: string;
  }) => { folder: ScriptDeskFolderSnapshot; isNew: boolean };
  moveScriptDeskDraftToTrash: (id: string) => boolean;
  setTip: Dispatch<SetStateAction<string>>;
  setEntryMode: (mode: EntryMode) => void;
  setIngestText: Dispatch<SetStateAction<string>>;
  setChatInput: Dispatch<SetStateAction<string>>;
  setRightTab: Dispatch<SetStateAction<RightTab>>;
  setRightDrawerOpen: Dispatch<SetStateAction<boolean>>;
  setStudioOpen: Dispatch<SetStateAction<boolean>>;
  setDraftsOpen: Dispatch<SetStateAction<boolean>>;
  setOpenEpIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedEpIds: Dispatch<SetStateAction<Set<string>>>;
  setStreamPreview: Dispatch<SetStateAction<string>>;
  setChatSearch: Dispatch<SetStateAction<string>>;
  setCollapsedMsgIds: Dispatch<SetStateAction<Set<string>>>;
  setContinueOpen: Dispatch<SetStateAction<boolean>>;
  setFirstGenFloatDeferred: Dispatch<SetStateAction<boolean>>;
  setGenFloatExpanded: Dispatch<SetStateAction<boolean>>;
  setActiveSkills: Dispatch<SetStateAction<ScriptDeskSkillId[]>>;
};

export function useScriptDeskDraftOps(deps: ScriptDeskDraftDeps) {
  const {
    propsId,
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
  } = deps;

  const showTimedTip = useCallback((message: string, ms = 3000) => {
    if (tipClearRef.current) clearTimeout(tipClearRef.current);
    setTip(message);
    tipClearRef.current = setTimeout(() => {
      setTip('');
      tipClearRef.current = null;
    }, ms);
  }, [tipClearRef, setTip]);

  const applyDeskSnapshot = useCallback((folder: {
    package: ScreenplayPackage;
    agentSession: ScriptDeskAgentSession;
    entryMode?: EntryMode;
  }) => {
    prevConfirmedRef.current = confirmedLatchForSnapshot(folder.package.status);
    lastUndoRef.current = null;
    undoStackRef.current = [];
    pkgRef.current = folder.package;
    persistScriptDeskPackage(updateNodeData, propsId, folder.package, {
      agentSession: compactAgentSession(folder.agentSession),
      entryMode: folder.entryMode ?? 'agent',
    });
    sessionRef.current = compactAgentSession(folder.agentSession);
    setEntryMode(folder.entryMode ?? 'agent');
    setIngestText(screenplayFullText(folder.package));
    setChatInput('');
    setRightTab('screenplay');
    setOpenEpIds(new Set(initialOpenEpisodeIds(folder.package)));
    setSelectedEpIds(new Set());
    setStreamPreview('');
    setChatSearch('');
    setCollapsedMsgIds(new Set());
  }, [propsId, setEntryMode, updateNodeData, prevConfirmedRef, lastUndoRef, undoStackRef, pkgRef, sessionRef, setIngestText, setChatInput, setRightTab, setOpenEpIds, setSelectedEpIds, setStreamPreview, setChatSearch, setCollapsedMsgIds]);

  const resetDeskToEmpty = useCallback(() => {
    const empty = emptyScreenplayPackage();
    prevConfirmedRef.current = false;
    lastUndoRef.current = null;
    undoStackRef.current = [];
    pkgRef.current = empty;
    persistScriptDeskPackage(updateNodeData, propsId, empty, {
      agentSession: { messages: [], updatedAt: new Date().toISOString() },
      entryMode: 'agent',
      status: 'idle',
    });
    sessionRef.current = { messages: [], updatedAt: new Date().toISOString() };
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
  }, [propsId, setEntryMode, updateNodeData, prevConfirmedRef, lastUndoRef, undoStackRef, pkgRef, sessionRef, setIngestText, setChatInput, setActiveSkills, setRightTab, setContinueOpen, setFirstGenFloatDeferred, setGenFloatExpanded, setOpenEpIds, setSelectedEpIds, setStreamPreview, setChatSearch, setCollapsedMsgIds]);

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

    flushDebouncedFields(propsId);
    const snapshotInput = {
      package: pkgRef.current,
      agentSession: sessionRef.current,
      entryMode,
      sourceBlockId: propsId,
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
    entryMode, hasDraftMemory, propsId, resetDeskToEmpty,
    saveScriptDeskDraft, showTimedTip, trashScriptDeskSnapshot,
    busy, continueBusy, rewritingEpIndex, setDraftsOpen,
  ]);

  const handleOpenDraftFolder = useCallback((draftId: string) => {
    const folder = getScriptDeskDraft(draftId);
    if (!folder) {
      showTimedTip('草稿不存在或已删除');
      return;
    }

    flushDebouncedFields(propsId);
    const livePkg = pkgRef.current;
    const liveHasDraft = livePkg.screenplay.episodes.length > 0
      || livePkg.bible.characters.length > 0
      || livePkg.bible.scenes.length > 0
      || Boolean(livePkg.brief.title?.trim())
      || Boolean(livePkg.brief.logline?.trim());
    if (liveHasDraft) {
      const { folder: auto, isNew } = upsertScriptDeskWorkingDraft({
        package: livePkg,
        agentSession: sessionRef.current,
        entryMode,
        sourceBlockId: propsId,
      });
      const label = auto.title || '工作中';
      showTimedTip(isNew ? `当前《${label}》已自动存入草稿` : `当前《${label}》已更新到工作草稿`);
      toastSuccess(isNew ? `当前《${label}》已自动存入草稿` : `当前《${label}》已更新到工作草稿`);
    }

    applyDeskSnapshot(folder);
    setDraftsOpen(false);
    setRightDrawerOpen(true);
  }, [
    applyDeskSnapshot, entryMode, getScriptDeskDraft, propsId,
    showTimedTip, upsertScriptDeskWorkingDraft, setDraftsOpen, setRightDrawerOpen,
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
    flushDebouncedFields(propsId);
    const livePkg = pkgRef.current;
    const liveHasDraft = livePkg.screenplay.episodes.length > 0
      || livePkg.bible.characters.length > 0
      || livePkg.bible.scenes.length > 0
      || Boolean(livePkg.brief.title?.trim())
      || Boolean(livePkg.brief.logline?.trim());
    if (liveHasDraft && dirtyRef.current) {
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
          package: livePkg,
          agentSession: sessionRef.current,
          entryMode,
          sourceBlockId: propsId,
        });
      }
    } else if (liveHasDraft) {
      upsertScriptDeskWorkingDraft({
        package: livePkg,
        agentSession: sessionRef.current,
        entryMode,
        sourceBlockId: propsId,
      });
    }
    setStudioOpen(false);
  }, [busy, continueBusy, rewritingEpIndex, entryMode, propsId, upsertScriptDeskWorkingDraft, dirtyRef, abortRef, setStudioOpen]);

  return {
    showTimedTip,
    applyDeskSnapshot,
    resetDeskToEmpty,
    handleResetDesk,
    handleOpenDraftFolder,
    handleDeleteDraftFolder,
    handleCloseStudio,
  };
}
