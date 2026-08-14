import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AssetLibraryItem, ScreenplayPackage, ScriptDeskAgentSession, ScriptDeskSkillId } from '@nx9/shared';
import {
  applyPackagePatch,
  enrichPromptWithAssetMentions,
  touchScreenplayPackage,
  unconfirmIfEdited,
} from '@nx9/shared';
import {
  appendAgentMessage,
  applyPendingMessagePatch,
  discardPendingMessagePatch,
  formatScriptDeskError,
  classifyScriptDeskError,
  runAppendEpisodeSkill,
  runRewriteEpisodeSkill,
  runScriptDeskSkill,
} from '../../../engine/script-desk-runner';
import { askConfirm } from '../../../stores/confirm-dialog';
import { isBriefReadyForFirstGen, isVisualStyleReady, type RightTab, type SavePkgFn } from './desk-helpers';

export type ScriptDeskAgentDeps = {
  propsId: string;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  appendLog: (line: string) => void;
  pkg: ScreenplayPackage;
  pkgRef: { current: ScreenplayPackage };
  session: ScriptDeskAgentSession;
  sessionRef: { current: ScriptDeskAgentSession };
  savePkg: SavePkgFn;
  commitAgentSession: (session: ScriptDeskAgentSession, extra?: Record<string, unknown>) => void;
  runAutoLint: (pkg: ScreenplayPackage) => ScreenplayPackage;
  openFirstGenFloat: (fromPkg?: ScreenplayPackage) => boolean;
  abortRef: { current: AbortController | null };
  chatInput: string;
  activeSkills: ScriptDeskSkillId[];
  genEpisodeCount: number | 'all';
  continueCount: number | 'all';
  continueBusy: boolean;
  busy: boolean;
  rewritingEpIndex: number | null;
  firstGenFloatDeferred: boolean;
  selectedEpIds: Set<string>;
  privateItems: AssetLibraryItem[];
  publicItems: AssetLibraryItem[];
  setTip: Dispatch<SetStateAction<string>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setRightTab: Dispatch<SetStateAction<RightTab>>;
  setRightDrawerOpen: Dispatch<SetStateAction<boolean>>;
  setChatInput: Dispatch<SetStateAction<string>>;
  setStreamPreview: Dispatch<SetStateAction<string>>;
  setSkeletonIndexes: Dispatch<SetStateAction<number[]>>;
  setFailedEpisodeIndexes: Dispatch<SetStateAction<number[]>>;
  setContinueOpen: Dispatch<SetStateAction<boolean>>;
  setContinueBusy: Dispatch<SetStateAction<boolean>>;
  setGenFloatExpanded: Dispatch<SetStateAction<boolean>>;
  setGenEpisodeCount: Dispatch<SetStateAction<number | 'all'>>;
  setFirstGenFloatDeferred: Dispatch<SetStateAction<boolean>>;
  setRewritingEpIndex: Dispatch<SetStateAction<number | null>>;
  setSelectedEpIds: Dispatch<SetStateAction<Set<string>>>;
};

export function useScriptDeskAgentOps(deps: ScriptDeskAgentDeps) {
  const {
    propsId,
    updateNodeData,
    appendLog,
    pkg,
    pkgRef,
    session,
    sessionRef,
    savePkg,
    commitAgentSession,
    runAutoLint,
    openFirstGenFloat,
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
    setGenEpisodeCount,
    setFirstGenFloatDeferred,
    setRewritingEpIndex,
    setSelectedEpIds,
  } = deps;

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
    updateNodeData(propsId, { status: 'running', entryMode: 'agent' });
    let nextSession = appendAgentMessage(session, {
      role: 'user',
      content: enrichedInstruction,
      skillId,
    });
    commitAgentSession(nextSession);
    try {
      const result = await runScriptDeskSkill(
        skillId,
        pkg,
        enrichedInstruction,
        ac.signal,
        (chunk) => setStreamPreview((prev) => prev + chunk),
      );
      nextSession = appendAgentMessage(nextSession, {
        role: 'assistant',
        content: result.assistantText,
        skillId,
        pendingPatch: result.patch,
        applied: false,
        errorCode: result.errorCode,
      });
      commitAgentSession(nextSession, { status: 'success' });
      setChatInput('');
      setTip(result.patch ? '有待应用产出，请点「应用此步产出」' : result.assistantText);
      appendLog(`编剧台 Agent · ${skillId}`);
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      const msg = formatScriptDeskError(e);
      const classified = classifyScriptDeskError(e);
      if (isAbort) {
        setTip('已停止');
        appendLog(`编剧台 Agent 已停止 · ${skillId}`);
      } else {
        nextSession = appendAgentMessage(nextSession, {
          role: 'assistant',
          content: `失败：${msg}`,
          skillId,
          errorCode: classified.code,
        });
        commitAgentSession(nextSession, { status: 'error', error: msg, errorCode: classified.code });
        setTip(msg);
        appendLog(`编剧台 Agent 失败：${msg}`);
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
      setStreamPreview('');
    }
  }, [activeSkills, appendLog, chatInput, openFirstGenFloat, pkg, propsId, session, updateNodeData, privateItems, publicItems, commitAgentSession, setBusy, setChatInput, setRightTab, setStreamPreview, setTip, abortRef]);

  const handleApplyMessage = useCallback((messageId: string) => {
    const result = applyPendingMessagePatch(pkg, session, messageId);
    savePkg(result.package, { agentSession: result.session });
    sessionRef.current = result.session;
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
  }, [appendLog, firstGenFloatDeferred, pkg, savePkg, session, sessionRef, setGenEpisodeCount, setGenFloatExpanded, setTip]);

  // C-02: 丢弃 pending patch（标记 discarded，并去掉全文避免 node.data 膨胀）
  const handleDiscardMessage = useCallback((messageId: string) => {
    commitAgentSession(discardPendingMessagePatch(session, messageId));
    setTip('已丢弃此步产出');
    appendLog('编剧台：已丢弃 Agent 产出');
  }, [appendLog, commitAgentSession, session, setTip]);

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
    updateNodeData(propsId, { status: 'running', entryMode: 'agent' });

    let currentPkg = touchScreenplayPackage(pkg, {
      brief: { ...pkg.brief, episodeCount: resolvedCount },
    });
    savePkg(currentPkg);

    let nextSession = appendAgentMessage(session, {
      role: 'system',
      content: `首次生成 · 将写 ${resolvedCount} 集…`,
    });
    commitAgentSession(nextSession);

    let ok = 0;
    const failed: number[] = [];
    let aborted = false;
    let lastErrorCode: string | undefined;
    const expectedIndexes = Array.from({ length: resolvedCount }, (_, i) => i + 1);
    setSkeletonIndexes(expectedIndexes);
    for (let i = 0; i < resolvedCount; i++) {
      if (ac.signal.aborted) { aborted = true; break; }
      const nextIndex = i + 1;
      nextSession = appendAgentMessage(nextSession, {
        role: 'system',
        content: `生成中 第 ${i + 1}/${resolvedCount} 集…`,
      });
      commitAgentSession(nextSession);
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
          currentPkg = applyPackagePatch(currentPkg, result.patch);
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
          commitAgentSession(nextSession);
        }
      } catch (e) {
        const isAbort = e instanceof DOMException && e.name === 'AbortError';
        if (isAbort) { aborted = true; break; }
        failed.push(nextIndex);
        setSkeletonIndexes((prev) => prev.filter((idx) => idx !== nextIndex));
        const errMsg = formatScriptDeskError(e);
        const classified = classifyScriptDeskError(e);
        lastErrorCode = classified.code;
        nextSession = appendAgentMessage(nextSession, {
          role: 'system',
          content: `生成失败 · 第 ${nextIndex} 集：${errMsg}（可单独重试）`,
          errorCode: classified.code,
        });
        commitAgentSession(nextSession);
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
    commitAgentSession(nextSession, {
      status: ok > 0 ? 'success' : 'error',
      ...(ok === 0 && failed.length > 0 ? { error: summary } : {}),
      ...(ok === 0 && failed.length > 0 ? { errorCode: lastErrorCode } : {}),
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
  }, [appendLog, chatInput, genEpisodeCount, pkg, propsId, savePkg, session, updateNodeData, commitAgentSession, setBusy, setChatInput, setFailedEpisodeIndexes, setFirstGenFloatDeferred, setGenFloatExpanded, setRightDrawerOpen, setRightTab, setSkeletonIndexes, setStreamPreview, setTip, abortRef]);

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
        const existing = currentPkg.screenplay.episodes.find((ep) => ep.index === nextIndex);
        const result = existing
          ? await runRewriteEpisodeSkill(currentPkg, { episodeIndex: nextIndex, signal: ac.signal })
          : await runAppendEpisodeSkill(currentPkg, { nextEpisodeIndex: nextIndex, signal: ac.signal });
        if (result.patch) {
          currentPkg = applyPackagePatch(currentPkg, result.patch);
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
  }, [appendLog, pkg, savePkg, setBusy, setFailedEpisodeIndexes, setTip, abortRef]);

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
    updateNodeData(propsId, { status: 'running', entryMode: 'agent' });
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
    commitAgentSession(nextSession);

    let currentPkg = pkg;
    let ok = 0;
    const failedIndexes: number[] = [];
    let aborted = false;
    let lastErrorCode: string | undefined;
    setSkeletonIndexes(Array.from({ length: count }, (_, i) => startIndex + i));
    for (let i = 0; i < count; i++) {
      if (ac.signal.aborted) { aborted = true; break; }
      const nextIndex = startIndex + i;
      // progress message
      nextSession = appendAgentMessage(nextSession, {
        role: 'system',
        content: `续写中 第 ${i + 1}/${count} 集（写入第 ${nextIndex} 集）…`,
      });
      commitAgentSession(nextSession);
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
          currentPkg = applyPackagePatch(currentPkg, result.patch);
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
          commitAgentSession(nextSession);
        }
      } catch (e) {
        const isAbort = e instanceof DOMException && e.name === 'AbortError';
        if (isAbort) { aborted = true; break; }
        failedIndexes.push(nextIndex);
        const errMsg = formatScriptDeskError(e);
        const classified = classifyScriptDeskError(e);
        lastErrorCode = classified.code;
        nextSession = appendAgentMessage(nextSession, {
          role: 'system',
          content: `续写失败 · 第 ${nextIndex} 集：${errMsg}`,
          errorCode: classified.code,
        });
        commitAgentSession(nextSession);
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
    commitAgentSession(nextSession, {
      status: ok > 0 ? 'success' : 'error',
      ...(ok === 0 && failedIndexes.length > 0 ? { error: summary, errorCode: lastErrorCode } : {}),
    });
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
    updateNodeData(propsId, { status: 'success' });
    setChatInput('');
  }, [appendLog, chatInput, continueCount, pkg, propsId, savePkg, session, updateNodeData, commitAgentSession, setChatInput, setContinueBusy, setContinueOpen, setFailedEpisodeIndexes, setSkeletonIndexes, setStreamPreview, setTip, abortRef]);

  const runEpisodeRewrite = useCallback(async (
    episodeIndex: number,
    liveSession: ScriptDeskAgentSession,
  ): Promise<ScriptDeskAgentSession> => {
    const livePkg = pkgRef.current;
    const target = livePkg.screenplay.episodes.find((ep) => ep.index === episodeIndex);
    if (!target) {
      setTip(`第 ${episodeIndex} 集不存在`);
      return liveSession;
    }
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRewritingEpIndex(episodeIndex);
    setBusy(true);
    setStreamPreview('');
    updateNodeData(propsId, { status: 'running', entryMode: 'agent' });

    let nextSession = appendAgentMessage(liveSession, {
      role: 'system',
      content: `重写中 · 第 ${episodeIndex} 集《${target.title || '未命名'}》（衔接前后集）…`,
    });
    commitAgentSession(nextSession);
    setTip(`重写中 · 第 ${episodeIndex} 集…`);

    try {
      const result = await runRewriteEpisodeSkill(livePkg, {
        episodeIndex,
        userInstruction: chatInput.trim() || undefined,
        signal: ac.signal,
        onChunk: (chunk) => setStreamPreview((prev) => prev + chunk),
      });
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
      commitAgentSession(nextSession, { status: 'success' });
      setTip(`重写第 ${episodeIndex} 集已生成 · 请点「应用」写入或「丢弃」保留旧文`);
      appendLog(`编剧台重写第 ${episodeIndex} 集（pending）`);
      setRightTab('screenplay');
      setRightDrawerOpen(true);
      return nextSession;
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      const errMsg = formatScriptDeskError(e);
      const classified = classifyScriptDeskError(e);
      if (isAbort) {
        setTip(`已停止重写第 ${episodeIndex} 集`);
        appendLog(`重写第 ${episodeIndex} 集已停止`);
      } else {
        nextSession = appendAgentMessage(nextSession, {
          role: 'system',
          content: `重写失败 · 第 ${episodeIndex} 集：${errMsg}`,
          errorCode: classified.code,
        });
        commitAgentSession(nextSession, { status: 'error', error: errMsg, errorCode: classified.code });
        setTip(`重写失败：${errMsg}`);
        appendLog(`重写第 ${episodeIndex} 集失败：${errMsg}`);
      }
      return nextSession;
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setRewritingEpIndex(null);
      setBusy(false);
      setStreamPreview('');
    }
  }, [appendLog, chatInput, commitAgentSession, propsId, updateNodeData, setBusy, setRewritingEpIndex, setRightDrawerOpen, setRightTab, setStreamPreview, setTip, abortRef]);

  const handleRewriteEpisode = useCallback(async (episodeIndex: number) => {
    if (busy || continueBusy || rewritingEpIndex != null) return;
    const liveSession = sessionRef.current;
    if (liveSession.messages.some((m) => m.pendingPatch && !m.applied && !m.discarded)) {
      setTip('当前有待应用的重写产出，请先应用或丢弃后再重写');
      return;
    }
    await runEpisodeRewrite(episodeIndex, liveSession);
  }, [busy, continueBusy, rewritingEpIndex, runEpisodeRewrite, sessionRef, setTip]);

  const handleBatchRewrite = useCallback(async () => {
    if (busy || continueBusy || rewritingEpIndex != null) return;
    const liveSession = sessionRef.current;
    if (liveSession.messages.some((m) => m.pendingPatch && !m.applied && !m.discarded)) {
      setTip('当前有待应用的重写产出，请先应用或丢弃后再批量重写');
      return;
    }
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
    let nextSession = liveSession;
    for (const idx of indexes) {
      if (abortRef.current?.signal.aborted) break;
      nextSession = await runEpisodeRewrite(idx, nextSession);
    }
    setSelectedEpIds(new Set());
  }, [busy, continueBusy, pkg.screenplay.episodes, rewritingEpIndex, runEpisodeRewrite, selectedEpIds, sessionRef, setSelectedEpIds, setTip, abortRef]);

  return {
    handleAgentSend,
    handleApplyMessage,
    handleDiscardMessage,
    handleGenStart,
    handleRetryFailed,
    handleContinueStart,
    runEpisodeRewrite,
    handleRewriteEpisode,
    handleBatchRewrite,
  };
}
