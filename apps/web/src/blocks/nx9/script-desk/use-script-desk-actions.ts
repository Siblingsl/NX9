import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ScreenplayEpisode, ScreenplayPackage, ScriptDeskSkillId } from '@nx9/shared';
import {
  enrichBibleScenesFromPackage,
  episodesFromIngestText,
  normalizeScreenplayBibleCharacters,
  screenplayFullText,
  screenplayWordCount,
  unconfirmIfEdited,
} from '@nx9/shared';
import { api } from '../../../api/client';
import { askConfirmWithOption } from '../../../stores/confirm-dialog';
import { useFlowCommands } from '../../../stores/flow-commands';
import { useFlowRuntime } from '../../../stores/flow-runtime';
import { inspectBibleAssets, type AssetReadinessState } from '../../../engine/asset-readiness';
import {
  applyConsistencyFixes,
  confirmPackage,
  extractBibleFromPackage,
  ingestScreenplayText,
  packageSummaryLine,
  runConsistencyCheck,
  classifyScriptDeskError,
  formatScriptDeskError,
} from '../../../engine/script-desk-runner';
import { packageSourceHash } from '../../../engine/storyboard-desk-runner';
import { resolveConnectedStoryboardDeskId } from '../../../engine/chain-storyboard-utils';
import { flushDebouncedFields } from './use-debounced-field';
import {
  type EntryMode,
  type RightTab,
  type SavePkgFn,
  isBriefReadyForFirstGen,
  isVisualStyleReady,
  textLooksLikeEpisodicScreenplay,
} from './desk-helpers';

export type ScriptDeskActionDeps = {
  propsId: string;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  getEdges: () => unknown[];
  appendLog: (line: string) => void;
  pkg: ScreenplayPackage;
  pkgRef: { current: ScreenplayPackage };
  savePkg: SavePkgFn;
  runAutoLint: (pkg: ScreenplayPackage) => ScreenplayPackage;
  dirtyRef: { current: boolean };
  title: string;
  ingestText: string;
  pendingIngestSource: 'pasted' | 'uploaded';
  setTip: Dispatch<SetStateAction<string>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setRightTab: Dispatch<SetStateAction<RightTab>>;
  setActiveSkills: Dispatch<SetStateAction<ScriptDeskSkillId[]>>;
  setIngestText: Dispatch<SetStateAction<string>>;
  setIngestPreviewEps: Dispatch<SetStateAction<ScreenplayEpisode[]>>;
  setIngestPreviewOpen: Dispatch<SetStateAction<boolean>>;
  setPendingIngestSource: Dispatch<SetStateAction<'pasted' | 'uploaded'>>;
  setHandoffOpen: Dispatch<SetStateAction<boolean>>;
  setEntryMode: (mode: EntryMode) => void;
  setFirstGenFloatDeferred: Dispatch<SetStateAction<boolean>>;
  setGenEpisodeCount: Dispatch<SetStateAction<number | 'all'>>;
  setGenFloatExpanded: Dispatch<SetStateAction<boolean>>;
};

export function useScriptDeskActions(deps: ScriptDeskActionDeps) {
  const {
    propsId,
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
  } = deps;

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
  }, [ingestText, pkg.brief.episodeCount, setIngestPreviewEps, setIngestPreviewOpen, setPendingIngestSource, setTip]);

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
  }, [appendLog, ingestText, pkg, savePkg, runAutoLint, pendingIngestSource, setIngestPreviewOpen, setRightTab, setTip]);

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
  }, [pkg.brief.episodeCount, setIngestPreviewEps, setIngestPreviewOpen, setPendingIngestSource, setIngestText, setTip]);

  const handleExtractBible = useCallback(async () => {
    if (!screenplayFullText(pkg).trim()) {
      setTip('请先写入成稿');
      return;
    }
    setBusy(true);
    setTip('抽取设定中…');
    try {
      updateNodeData(propsId, { status: 'running' });
      const next = await extractBibleFromPackage(pkg);
      savePkg(next);
      setRightTab('bible');
      setTip(`设定已更新 · 角 ${next.bible.characters.length} / 场 ${next.bible.scenes.length}`);
      appendLog(`编剧台：抽取设定 · 角 ${next.bible.characters.length} / 场 ${next.bible.scenes.length}`);
    } catch (e) {
      const classified = classifyScriptDeskError(e);
      const msg = formatScriptDeskError(e);
      updateNodeData(propsId, { status: 'error', error: msg, errorCode: classified.code });
      setTip(`抽取失败：${msg}`);
      appendLog(`编剧台抽取失败：${msg}`);
    } finally {
      setBusy(false);
    }
  }, [appendLog, pkg, propsId, savePkg, updateNodeData, setBusy, setRightTab, setTip]);

  const handleConfirm = useCallback(async () => {
    flushDebouncedFields(propsId);
    const livePkg = pkgRef.current;
    // B-05: 确认前先检查 Bible
    let enriched = enrichBibleScenesFromPackage(livePkg);
    const sceneCountBefore = livePkg.bible.scenes.length;
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
  }, [appendLog, propsId, savePkg, setBusy, setRightTab, setTip]);

  // B-07/H-01: 打开送分镜 checklist 或直接送
  const handleHandoffToStoryboard = useCallback(() => {
    flushDebouncedFields(propsId);
    const livePkg = pkgRef.current;
    const body = screenplayFullText(livePkg).trim();
    if (livePkg.status !== 'confirmed' || !body) {
      setTip(
        !body
          ? '尚无分集成稿正文：请先用「生成剧本」成功生成并点「应用」，再确认成稿'
          : '请先点「确认成稿」，再送到分镜台',
      );
      return;
    }
    setHandoffOpen(true);
  }, [propsId, setHandoffOpen, setTip]);

  // B-07/H-01: 实际送分镜（从 checklist 触发）
  const doHandoffToStoryboard = useCallback(() => {
    flushDebouncedFields(propsId);
    const livePkg = pkgRef.current;
    setHandoffOpen(false);
    const handoff = {
      from: 'script-desk',
      to: 'storyboard-desk',
      fromId: propsId,
      at: new Date().toISOString(),
      autoOpenBreakdown: true,
      sourceScriptBlockId: propsId,
      scriptHash: packageSourceHash(livePkg),
      episodeRange: {
        count: livePkg.screenplay.episodes.length,
        firstId: livePkg.screenplay.episodes[0]?.id ?? null,
        lastId: livePkg.screenplay.episodes[livePkg.screenplay.episodes.length - 1]?.id ?? null,
        titles: livePkg.screenplay.episodes.map((e) => e.title || `第${e.index}集`),
      },
      scriptTitle: livePkg.brief.title || livePkg.screenplay.episodes[0]?.title || '',
      scriptWordCount: screenplayWordCount(livePkg),
    };
    const runtime = useFlowRuntime.getState().runtime;
    const nodes = runtime?.getNodes() ?? [];
    const storyboardDeskId = resolveConnectedStoryboardDeskId(propsId, nodes as any, getEdges() as any);
    const storyboardDesk = storyboardDeskId ? nodes.find((node) => node.id === storyboardDeskId) : undefined;
    if (storyboardDesk) {
      updateNodeData(storyboardDesk.id, { handoff });
      runtime?.focusBlock(storyboardDesk.id);
      setTip(`已送到分镜台 · ${livePkg.screenplay.episodes.length} 集 · 请在「拆镜」页点「只拆新增」`);
      appendLog(`编剧台：送到分镜台 · ${livePkg.screenplay.episodes.length} 集 · 打开拆镜页只拆新增`);
    } else {
      useFlowCommands.getState().requestSpawn('storyboard-desk', undefined, {
        connectToSource: propsId,
        handoff,
      });
      setTip(`已创建分镜台并连线 · ${livePkg.screenplay.episodes.length} 集 · 打开后请在「拆镜」页点「从成稿拆镜」`);
      appendLog(`编剧台：送至分镜 · 一键创建并连线分镜台 · ${livePkg.screenplay.episodes.length} 集`);
    }
  }, [appendLog, propsId, updateNodeData, getEdges, setHandoffOpen, setTip]);

  const handleReadinessChange = useCallback((state: AssetReadinessState) => {
    updateNodeData(propsId, { assetReadiness: state });
    if (state.ready) {
      setTip('设定已就绪，可交分镜台');
      appendLog('编剧台：已标记设定就绪');
    }
  }, [appendLog, propsId, updateNodeData, setTip]);

  const handleReadinessPackageChange = useCallback((next: ScreenplayPackage) => {
    dirtyRef.current = true;
    savePkg(next);
  }, [dirtyRef, savePkg]);

  const handleManualConsistencyCheck = useCallback(() => {
    const next = runConsistencyCheck(pkg);
    savePkg(next);
    setRightTab('diagnostics');
    setTip(`一致性检查完成 · 诊断 ${next.diagnostics?.length ?? 0} 条`);
    appendLog(`编剧台：手动一致性检查 · ${next.diagnostics?.length ?? 0} 条`);
  }, [appendLog, pkg, savePkg, setRightTab, setTip]);

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
  }, [appendLog, pkg, savePkg, setTip]);

  const toggleSkill = useCallback((id: ScriptDeskSkillId) => {
    setActiveSkills([id]);
  }, [setActiveSkills]);

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
  }, [pkg, setFirstGenFloatDeferred, setGenEpisodeCount, setGenFloatExpanded, setRightTab, setTip]);

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
  }, [setEntryMode, setIngestText, setTip]);

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
  }, [api, handleExportJson, pkg, setTip, title]);

  return {
    handleIngestSave,
    doIngestConfirm,
    handleFile,
    handleExtractBible,
    handleConfirm,
    handleHandoffToStoryboard,
    doHandoffToStoryboard,
    handleReadinessChange,
    handleReadinessPackageChange,
    handleManualConsistencyCheck,
    handleAutoFix,
    toggleSkill,
    openFirstGenFloat,
    handlePasteFromClipboard,
    handleExportJson,
    handleExportMd,
    handleExportPackage,
  };
}
