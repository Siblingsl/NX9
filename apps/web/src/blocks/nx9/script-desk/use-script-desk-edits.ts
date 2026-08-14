import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CharacterProfile, ScreenplayPackage, ScriptDeskAgentSession } from '@nx9/shared';
import {
  insertEmptyEpisodeAfter,
  removeScreenplayEpisode,
  renameCharacterInPackage,
  touchScreenplayPackage,
  unconfirmIfEdited,
} from '@nx9/shared';
import {
  findLibraryCharacterForRename,
  libraryCharacterRenameConflict,
  renameCharacterInPendingSession,
  renameLibraryCharacterProfile,
} from '../../../engine/bible-library-sync';
import { askConfirm, askConfirmWithOption, confirmDelete } from '../../../stores/confirm-dialog';
import { countCharacterRenameHits, type RightTab, type SavePkgFn } from './desk-helpers';

export type ScriptDeskEditDeps = {
  propsId: string;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  appendLog: (line: string) => void;
  pkg: ScreenplayPackage;
  pkgRef: { current: ScreenplayPackage };
  sessionRef: { current: ScriptDeskAgentSession };
  savePkg: SavePkgFn;
  dirtyRef: { current: boolean };
  publicItems: Array<{ id: string; kind: string; label?: string }>;
  workspaceCharacters: CharacterProfile[];
  upsertCharacter: (char: CharacterProfile) => void;
  mergeSelection: string[];
  mergeType: 'character' | 'scene' | null;
  setTip: Dispatch<SetStateAction<string>>;
  setRightTab: Dispatch<SetStateAction<RightTab>>;
  setHighlightedBibleId: Dispatch<SetStateAction<string | null>>;
  setRenamingBibleCharId: Dispatch<SetStateAction<string | null>>;
  setEditingBibleId: Dispatch<SetStateAction<string | null>>;
  setMergeSelection: Dispatch<SetStateAction<string[]>>;
  setMergeType: Dispatch<SetStateAction<'character' | 'scene' | null>>;
  setOpenEpIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedEpIds: Dispatch<SetStateAction<Set<string>>>;
};

export function useScriptDeskEditOps(deps: ScriptDeskEditDeps) {
  const {
    propsId,
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
  } = deps;

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
  }, [appendLog, pkg, savePkg, setTip]);

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
    const publicHit = publicItems.find((item) =>
      item.kind === 'character'
      && (item.id === target.libraryCharacterId || item.label === oldName),
    );
    if (publicHit) {
      setTip('公共素材库角色档案为只读，无法随编剧台改名；如需联动请先在素材库「另存为私有」后重试');
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
    const renamedSession = renameCharacterInPendingSession(sessionRef.current, oldName, newName);
    if (renamedSession) {
      sessionRef.current = renamedSession;
      updateNodeData(propsId, { agentSession: renamedSession });
    }
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
  }, [appendLog, propsId, publicItems, savePkg, updateNodeData, upsertCharacter, workspaceCharacters, setRenamingBibleCharId, setTip, sessionRef, dirtyRef]);

  // B-01: 删除 Bible 人物
  const removeBibleCharacter = useCallback(async (charId: string, name: string) => {
    const ok = await confirmDelete({ title: `删除设定人物「${name}」？`, description: '此操作不可撤销。' });
    if (!ok) return;
    dirtyRef.current = true;
    const chars = pkg.bible.characters.filter((c) => c.id !== charId);
    savePkg(touchScreenplayPackage(pkg, { bible: { ...pkg.bible, characters: chars } }));
    setEditingBibleId(null);
  }, [pkg, savePkg, setEditingBibleId, dirtyRef]);

  // B-01: 删除 Bible 场景
  const removeBibleScene = useCallback(async (sceneId: string, name: string) => {
    const ok = await confirmDelete({ title: `删除设定场景「${name}」？`, description: '此操作不可撤销。' });
    if (!ok) return;
    dirtyRef.current = true;
    const scenes = pkg.bible.scenes.filter((s) => s.id !== sceneId);
    savePkg(touchScreenplayPackage(pkg, { bible: { ...pkg.bible, scenes } }));
    setEditingBibleId(null);
  }, [pkg, savePkg, setEditingBibleId, dirtyRef]);

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
  }, [mergeSelection, mergeType, pkg, savePkg, setMergeSelection, setMergeType, setTip, dirtyRef]);

  const toggleMergeSelect = useCallback((id: string, kind: 'character' | 'scene') => {
    setMergeType(kind);
    setMergeSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }, [setMergeSelection, setMergeType]);

  const handleInsertEmptyEpisode = useCallback((afterEpisodeId: string | null) => {
    dirtyRef.current = true;
    const next = insertEmptyEpisodeAfter(pkg, afterEpisodeId);
    savePkg(next);
    setTip(afterEpisodeId ? '已插入空集' : '已插入首集');
  }, [pkg, savePkg, setTip, dirtyRef]);

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
  }, [pkg, savePkg, setTip, dirtyRef]);

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
  }, [setOpenEpIds]);

  const onToggleSelectEpisode = useCallback((episodeId: string) => {
    setSelectedEpIds((prev) => {
      const next = new Set(prev);
      if (next.has(episodeId)) next.delete(episodeId);
      else next.add(episodeId);
      return next;
    });
  }, [setSelectedEpIds]);

  const onClearSelectedEpisodes = useCallback(() => {
    setSelectedEpIds(new Set());
  }, [setSelectedEpIds]);

  const handleDiagClick = useCallback((d: { entityId?: string; episodeId?: string }) => {
    if (d.episodeId) {
      scrollToEpisode(d.episodeId);
      setRightTab('screenplay');
    } else if (d.entityId) {
      setHighlightedBibleId(d.entityId);
      setRightTab('bible');
    }
  }, [scrollToEpisode, setRightTab, setHighlightedBibleId]);

  return {
    handleRemoveEpisode,
    patchBriefTitle,
    patchEpisodeBody,
    patchBibleCharacter,
    patchBibleScene,
    patchBibleWorld,
    handleRenameCharacter,
    removeBibleCharacter,
    removeBibleScene,
    handleBibleMerge,
    toggleMergeSelect,
    handleInsertEmptyEpisode,
    handleEpisodeReorder,
    scrollToEpisode,
    onToggleSelectEpisode,
    onClearSelectedEpisodes,
    handleDiagClick,
  };
}
