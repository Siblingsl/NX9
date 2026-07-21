import { useCallback, useMemo, useState } from 'react';
import {
  activeEpisodeShots,
  applyStudioPromptsToShot,
  createEpisodeMeta,
  listEpisodeMetas,
  parseChineseScript,
  scenesToStoryboardShots,
  type CharacterProfile,
  type EnvironmentProfile,
  type EpisodeMeta,
  type ScriptPlanPayload,
  type StoryboardShot,
  type VoiceLine,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { useExecutionQueue } from '../../stores/execution-queue';
import { useFlowCommands } from '../../stores/flow-commands';
import { runProductionScriptBreakdown } from '../../engine/script-breakdown-runner';
import {
  approveAllKeyframes,
  batchGenerateKeyframesFromShots,
  batchGenerateVideosFromShots,
  simpleConcatExport,
} from '../../engine/core-pipeline-runner';
import { toastError, toastSuccess } from '../../stores/toast';
import { STUDIO_STEPS, type StepStatus, type StudioHub, type StudioStepId } from './studio-types';

export function useStudioDesk() {
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const characters = useWorkspaceDocument((s) => s.characters);
  const environments = useWorkspaceDocument((s) => s.environments);
  const soundLibrary = useWorkspaceDocument((s) => s.soundLibrary);
  const voice = useWorkspaceDocument((s) => s.voice);
  const scriptPlan = useWorkspaceDocument((s) => s.scriptPlan);
  const setScriptPlan = useWorkspaceDocument((s) => s.setScriptPlan);
  const setStoryboard = useWorkspaceDocument((s) => s.setStoryboard);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const addShots = useWorkspaceDocument((s) => s.addShots);
  const removeShot = useWorkspaceDocument((s) => s.removeShot);
  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const removeCharacter = useWorkspaceDocument((s) => s.removeCharacter);
  const setEnvironments = useWorkspaceDocument((s) => s.setEnvironments);
  const upsertSound = useWorkspaceDocument((s) => s.upsertSound);
  const addVoiceLines = useWorkspaceDocument((s) => s.addVoiceLines);
  const addVoiceProfile = useWorkspaceDocument((s) => s.addVoiceProfile);
  const updateVoiceLine = useWorkspaceDocument((s) => s.updateVoiceLine);
  const setActiveEpisodeId = useWorkspaceDocument((s) => s.setActiveEpisodeId);
  const upsertEpisodeMeta = useWorkspaceDocument((s) => s.upsertEpisodeMeta);
  const createNextEpisode = useWorkspaceDocument((s) => s.createNextEpisode);
  const completeActiveEpisode = useWorkspaceDocument((s) => s.completeActiveEpisode);
  const setGlobalArtDirection = useWorkspaceDocument((s) => s.setGlobalArtDirection);
  const startPlaybook = useWorkspaceDocument((s) => s.startPlaybook);
  const setProjectStatus = useWorkspaceDocument((s) => s.setProjectStatus);

  const appendLog = useActivityLog((s) => s.append);
  const queuePhase = useExecutionQueue((s) => s.phase);
  const queueProgress = useExecutionQueue((s) => s.progress);
  const queueLabel = useExecutionQueue((s) => s.currentLabel);
  const queueError = useExecutionQueue((s) => s.error);
  const cancelQueue = useExecutionQueue((s) => s.cancel);
  const requestBootstrap = useFlowCommands((s) => s.requestBootstrapCorePipeline);

  const [hub, setHub] = useState<StudioHub>('produce');
  const [step, setStep] = useState<StudioStepId>('script');
  const [sourceText, setSourceText] = useState(
    () => scriptPlan?.sourceText ?? scriptPlan?.screenplayMd ?? '',
  );
  const [seriesTitle, setSeriesTitle] = useState(() => storyboard.title || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  // 确保至少有一集
  const episodes = useMemo(() => {
    const list = listEpisodeMetas(storyboard);
    if (list.length > 0) return list;
    return [
      createEpisodeMeta(1, storyboard.title || '第 1 集'),
    ] as EpisodeMeta[];
  }, [storyboard]);

  const activeEpisodeId = storyboard.activeEpisodeId ?? episodes[0]?.id ?? null;
  const activeEpisode = episodes.find((e) => e.id === activeEpisodeId) ?? episodes[0] ?? null;

  const shots = useMemo(() => activeEpisodeShots(storyboard), [storyboard]);
  const envList = environments?.environments ?? [];

  const stats = useMemo(() => {
    const total = shots.length;
    const withImage = shots.filter((s) => s.firstFrameAssetId).length;
    const approvedKf = shots.filter(
      (s) => s.keyframeStatus === 'approved' || s.status === 'approved',
    ).length;
    const withVideo = shots.filter((s) => s.videoAssetId).length;
    const voiceLines = voice.lines.filter((l) => !l.shotId || shots.some((s) => s.id === l.shotId));
    const hasScript = Boolean(sourceText.trim() || scriptPlan?.sourceText || total > 0);
    const completedEps = episodes.filter((e) => e.status === 'completed' || e.status === 'archived');
    return {
      total,
      withImage,
      approvedKf,
      withVideo,
      hasScript,
      charCount: characters.characters.length,
      envCount: envList.length,
      soundCount: soundLibrary.sounds.length + voice.profiles.length,
      voiceLineCount: voiceLines.length,
      completedEpisodes: completedEps.length,
      episodeCount: episodes.length,
    };
  }, [shots, sourceText, scriptPlan, characters, envList, soundLibrary, voice, episodes]);

  const stepDone: Record<StudioStepId, boolean> = useMemo(
    () => ({
      script: stats.hasScript,
      storyboard: stats.total > 0,
      preview: stats.total > 0 && stats.withImage === stats.total,
      review: stats.total > 0 && stats.withImage > 0 && stats.approvedKf >= stats.withImage,
      video: stats.total > 0 && stats.withVideo === stats.total,
      voice: stats.voiceLineCount > 0 || stats.soundCount > 0,
      export: Boolean(exportUrl) || activeEpisode?.status === 'completed',
    }),
    [stats, exportUrl, activeEpisode?.status],
  );

  const stepStatuses: Record<StudioStepId, StepStatus> = useMemo(() => {
    const order = STUDIO_STEPS.map((s) => s.id);
    const firstOpen = order.find((id) => !stepDone[id]) ?? 'export';
    const map = {} as Record<StudioStepId, StepStatus>;
    for (const id of order) {
      if (stepDone[id]) map[id] = 'done';
      else if (id === firstOpen) map[id] = 'current';
      else {
        const idx = order.indexOf(id);
        const prev = order[idx - 1];
        map[id] = prev && !stepDone[prev] ? 'blocked' : 'todo';
      }
    }
    return map;
  }, [stepDone]);

  const selectedShot = shots.find((s) => s.id === selectedShotId) ?? null;

  const flash = useCallback(
    (msg: string) => {
      setLastMessage(msg);
      appendLog(`[制作台] ${msg}`);
    },
    [appendLog],
  );

  const ensureEpisodeBootstrapped = useCallback(() => {
    if ((storyboard.episodes?.length ?? 0) > 0 && storyboard.activeEpisodeId) return;
    const ep = episodes[0] ?? createEpisodeMeta(1, seriesTitle || '第 1 集');
    upsertEpisodeMeta(ep);
    setActiveEpisodeId(ep.id);
  }, [storyboard, episodes, seriesTitle, upsertEpisodeMeta, setActiveEpisodeId]);

  const selectEpisode = useCallback(
    (id: string) => {
      setActiveEpisodeId(id);
      setSelectedShotId(null);
      setExportUrl(null);
      setHub('produce');
      setStep('script');
      flash(`已切换到剧集`);
    },
    [setActiveEpisodeId, flash],
  );

  const startNextEpisode = useCallback(
    (title?: string) => {
      const id = createNextEpisode(title);
      setSelectedShotId(null);
      setSourceText('');
      setExportUrl(null);
      setHub('produce');
      setStep('script');
      toastSuccess('已创建下一集，当前工作区已切换');
      flash(`新建剧集 ${id}`);
      return id;
    },
    [createNextEpisode, flash],
  );

  const markEpisodeComplete = useCallback(
    (url?: string | null) => {
      completeActiveEpisode(url ?? exportUrl);
      toastSuccess('本集已标记完成，可在剧集架查看');
      flash('本集已归档为完成');
      setHub('episodes');
    },
    [completeActiveEpisode, exportUrl, flash],
  );

  const breakdownRule = useCallback(() => {
    ensureEpisodeBootstrapped();
    const text = sourceText.trim();
    if (!text) {
      toastError('请先粘贴本集剧本文本');
      return;
    }
    setBusy('rule');
    try {
      const { background, scenes } = parseChineseScript(text);
      const nextShots = scenesToStoryboardShots(scenes);
      if (nextShots.length === 0) {
        toastError('未识别场景头。示例：1-1 日 内 咖啡店');
        return;
      }
      addShots(nextShots, 'replace');
      const t = seriesTitle.trim() || background.title || storyboard.title || '未命名剧';
      setStoryboard({
        ...useWorkspaceDocument.getState().storyboard,
        title: t,
      });
      setSeriesTitle(t);
      if (activeEpisode) {
        upsertEpisodeMeta({
          ...activeEpisode,
          title: activeEpisode.title || t,
          status: 'in_progress',
        });
      }
      setScriptPlan({
        version: 2,
        sourceText: text,
        screenplayMd: text,
        storyboardTable: scriptPlan?.storyboardTable ?? [],
        skeleton: scriptPlan?.skeleton ?? null,
        adaptation: scriptPlan?.adaptation ?? null,
      });
      toastSuccess(`规则拆镜 · ${nextShots.length} 镜（本集）`);
      flash(`规则拆镜 ${nextShots.length} 镜`);
      setStep('storyboard');
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }, [
    ensureEpisodeBootstrapped,
    sourceText,
    seriesTitle,
    storyboard.title,
    addShots,
    setStoryboard,
    setScriptPlan,
    scriptPlan,
    activeEpisode,
    upsertEpisodeMeta,
    flash,
  ]);

  const breakdownAi = useCallback(async () => {
    ensureEpisodeBootstrapped();
    const text = sourceText.trim();
    if (!text) {
      toastError('请先粘贴本集剧本文本');
      return;
    }
    setBusy('ai');
    try {
      const payload = await runProductionScriptBreakdown({
        blockId: 'studio-desk',
        sourceText: text,
      });
      // 若拆出多集，把非当前集的镜头保留在 storyboard，active 指到第一集
      const sb = useWorkspaceDocument.getState().storyboard;
      const metas = listEpisodeMetas(sb);
      for (const ep of payload.episodes) {
        upsertEpisodeMeta({
          id: ep.id,
          index: ep.index ?? metas.length + 1,
          title: ep.title || `第 ${ep.index} 集`,
          status: 'in_progress',
          logline: ep.logline,
        });
      }
      if (payload.episodes[0]?.id) setActiveEpisodeId(payload.episodes[0].id);
      setScriptPlan({
        version: 2,
        sourceText: text,
        screenplayMd: text,
        storyboardTable: scriptPlan?.storyboardTable ?? [],
        skeleton: scriptPlan?.skeleton ?? null,
        adaptation: scriptPlan?.adaptation ?? null,
      });
      if (payload.title) {
        setSeriesTitle(payload.title);
        setStoryboard({ ...useWorkspaceDocument.getState().storyboard, title: payload.title });
      }
      toastSuccess(
        `AI 拆镜完成 · ${payload.episodes.length} 集 / ${payload.characters?.length ?? 0} 角色 / 本集镜头已写入`,
      );
      flash(`AI 拆镜完成`);
      setStep('storyboard');
      if (payload.episodes.length > 1) setHub('episodes');
    } catch (e) {
      toastError(`AI 拆镜失败：${String(e)}。可改用规则拆镜`);
      flash(`AI 拆镜失败: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [
    ensureEpisodeBootstrapped,
    sourceText,
    setScriptPlan,
    scriptPlan,
    upsertEpisodeMeta,
    setActiveEpisodeId,
    setStoryboard,
    flash,
  ]);

  const saveScriptOnly = useCallback(() => {
    const text = sourceText.trim();
    if (!text) {
      toastError('请先粘贴文本');
      return;
    }
    ensureEpisodeBootstrapped();
    const plan: ScriptPlanPayload = {
      version: 2,
      sourceText: text,
      screenplayMd: text,
      storyboardTable: scriptPlan?.storyboardTable ?? [],
      skeleton: scriptPlan?.skeleton ?? null,
      adaptation: scriptPlan?.adaptation ?? null,
    };
    setScriptPlan(plan);
    if (seriesTitle.trim()) {
      setStoryboard({ ...useWorkspaceDocument.getState().storyboard, title: seriesTitle.trim() });
    }
    toastSuccess('剧本已保存');
    flash('剧本已保存');
  }, [sourceText, seriesTitle, scriptPlan, setScriptPlan, setStoryboard, ensureEpisodeBootstrapped, flash]);

  const resolveShotContext = useCallback(
    (shot: StoryboardShot) => {
      const chars = characters.characters.filter(
        (c) =>
          shot.characterIds?.includes(c.id) ||
          shot.characterNames?.some((n) => n === c.name),
      );
      const env =
        envList.find((e) => e.id === shot.sceneAssetId) ||
        envList.find((e) => e.name === shot.sceneName) ||
        null;
      return {
        characters: chars,
        environment: env,
        episode: activeEpisode,
        globalArtDirection: storyboard.globalArtDirection,
      };
    },
    [characters.characters, envList, activeEpisode, storyboard.globalArtDirection],
  );

  const regenerateShotPrompts = useCallback(
    (shotId: string, force = true) => {
      const shot = useWorkspaceDocument.getState().storyboard.shots.find((s) => s.id === shotId);
      if (!shot) return;
      const patch = applyStudioPromptsToShot(shot, resolveShotContext(shot), { force });
      updateShot(shotId, patch);
      flash('已生成专业提示词');
    },
    [resolveShotContext, updateShot, flash],
  );

  const regenerateAllPrompts = useCallback(
    (force = true) => {
      for (const shot of activeEpisodeShots(useWorkspaceDocument.getState().storyboard)) {
        const patch = applyStudioPromptsToShot(shot, resolveShotContext(shot), { force });
        updateShot(shot.id, patch);
      }
      toastSuccess('已为本集全部镜头生成专业提示词');
      flash('批量专业提示词完成');
    },
    [resolveShotContext, updateShot, flash],
  );

  const patchShot = useCallback(
    (id: string, patch: Partial<StoryboardShot>) => updateShot(id, patch),
    [updateShot],
  );

  const addEmptyShot = useCallback(() => {
    ensureEpisodeBootstrapped();
    const list = activeEpisodeShots(useWorkspaceDocument.getState().storyboard);
    const ep = activeEpisode;
    const shot: StoryboardShot = {
      id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      index: list.length + 1,
      durationSec: 3,
      shotType: 'medium',
      descriptionZh: '',
      promptEn: '',
      status: 'draft',
      episodeId: ep?.id,
      episodeIndex: ep?.index,
      episodeTitle: ep?.title,
      cameraMove: '固定',
      colorGrade: ep?.artDirection || storyboard.globalArtDirection || '',
      lighting: '',
      audioDirection: '',
    };
    addShots([shot], 'append');
    setSelectedShotId(shot.id);
    flash('已添加空镜头');
  }, [ensureEpisodeBootstrapped, activeEpisode, storyboard.globalArtDirection, addShots, flash]);

  const deleteShot = useCallback(
    (id: string) => {
      removeShot(id);
      if (selectedShotId === id) setSelectedShotId(null);
      flash('已删除镜头');
    },
    [removeShot, selectedShotId, flash],
  );

  const runKeyframes = useCallback(
    async (force = false) => {
      setBusy('preview');
      try {
        // 出图前写入专业提示词
        regenerateAllPrompts(false);
        requestBootstrap();
        startPlaybook('pb-ai-comic-live');
        setProjectStatus('generating');
        const res = await batchGenerateKeyframesFromShots(undefined, force);
        toastSuccess(`分镜预览图 · 成功 ${res.ok} · 失败 ${res.fail}`);
        if (res.ok > 0) setStep('review');
      } catch (e) {
        toastError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [regenerateAllPrompts, requestBootstrap, startPlaybook, setProjectStatus],
  );

  const runApproveAll = useCallback(() => {
    const n = approveAllKeyframes();
    if (n === 0) toastError('没有可批准的分镜预览图');
    else {
      toastSuccess(`已批准 ${n} 镜预览图`);
      setStep('video');
    }
  }, []);

  const approveOne = useCallback(
    (id: string) => {
      updateShot(id, { keyframeStatus: 'approved', status: 'approved', keyframeReviewNote: null });
      flash('预览图已通过');
    },
    [updateShot, flash],
  );

  const rejectOne = useCallback(
    (id: string) => {
      updateShot(id, {
        keyframeStatus: 'review',
        status: 'review',
        keyframeReviewNote: '需修改构图/一致性',
      });
      flash('已退回修改');
    },
    [updateShot, flash],
  );

  const runVideos = useCallback(async (force = false) => {
    setBusy('video');
    try {
      regenerateAllPrompts(false);
      const res = await batchGenerateVideosFromShots(undefined, force);
      toastSuccess(`镜头视频 · 成功 ${res.ok} · 失败 ${res.fail}`);
      if (res.ok > 0) setStep('voice');
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }, [regenerateAllPrompts]);

  const seedVoiceLinesFromShots = useCallback(() => {
    const lines: VoiceLine[] = [];
    for (const sh of shots) {
      const text = sh.subtitleText || sh.audioDirection || sh.descriptionZh;
      if (!text?.trim()) continue;
      // 避免重复同 shotId 行
      const existing = useWorkspaceDocument
        .getState()
        .voice.lines.some((l) => l.shotId === sh.id && l.text === text.trim());
      if (existing) continue;
      lines.push({
        id: `vl-${sh.id}-${Date.now()}`,
        shotId: sh.id,
        speaker: sh.characterNames?.[0] || '旁白',
        text: text.trim(),
        status: 'pending',
      });
    }
    if (lines.length === 0) {
      toastError('没有新的可提取对白（请在分镜表填写声音方向/对白）');
      return;
    }
    addVoiceLines(lines);
    toastSuccess(`已从镜头生成 ${lines.length} 条声音行`);
    flash(`声音行 ${lines.length}`);
  }, [shots, addVoiceLines, flash]);

  /** 批量 TTS：云端默认声线；角色有参考音时走 LuxTTS 克隆 */
  const batchSynthesizeVoice = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;
      const lines = useWorkspaceDocument.getState().voice.lines.filter((l) => {
        if (!l.text?.trim()) return false;
        if (!force && l.status === 'ready' && l.audioAssetId) return false;
        // 仅本集相关行
        if (l.shotId) return shots.some((s) => s.id === l.shotId);
        return true;
      });
      if (lines.length === 0) {
        toastError('没有待合成的声音行。请先「从镜头生成声音行」');
        return;
      }
      setBusy('tts');
      const { api } = await import('../../api/client');
      let ok = 0;
      let fail = 0;
      for (const line of lines) {
        updateVoiceLine(line.id, { status: 'generating' });
        try {
          const char = characters.characters.find(
            (c) => c.name === line.speaker || c.id === line.voiceProfileId,
          );
          const refAudio = char?.referenceAudioUrl || undefined;
          const res = await api.proxyTts({
            input: line.text,
            voice: refAudio ? `luxtts:${refAudio}` : 'alloy',
            useLuxTts: Boolean(refAudio),
            referenceAudioUrl: refAudio,
            luxTtsProfileId: char?.id,
            response_format: 'mp3',
          });
          updateVoiceLine(line.id, {
            status: 'ready',
            audioAssetId: res.url,
            voiceProfileId: char?.id ?? line.voiceProfileId,
          });
          if (line.shotId) {
            updateShot(line.shotId, { audioAssetId: res.url });
          }
          ok++;
          flash(`TTS 完成 · ${line.speaker}: ${line.text.slice(0, 24)}…`);
        } catch (e) {
          updateVoiceLine(line.id, { status: 'failed' });
          fail++;
          flash(`TTS 失败 · ${line.speaker}: ${String(e)}`);
        }
      }
      setBusy(null);
      toastSuccess(`批量配音结束 · 成功 ${ok} · 失败 ${fail}`);
    },
    [shots, characters.characters, updateVoiceLine, updateShot, flash],
  );

  /** 本集镜头上下移动（重排 index） */
  const moveShot = useCallback(
    (id: string, dir: -1 | 1) => {
      const sb = useWorkspaceDocument.getState().storyboard;
      const scoped = activeEpisodeShots(sb)
        .slice()
        .sort((a, b) => a.index - b.index);
      const i = scoped.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= scoped.length) return;
      const next = [...scoped];
      [next[i], next[j]] = [next[j], next[i]];
      const reindexed = next.map((s, idx) => ({ ...s, index: idx + 1 }));
      const scopedIds = new Set(reindexed.map((s) => s.id));
      const rest = sb.shots.filter((s) => !scopedIds.has(s.id));
      setStoryboard({ ...sb, shots: [...rest, ...reindexed] });
      flash(dir < 0 ? '镜头已上移' : '镜头已下移');
    },
    [setStoryboard, flash],
  );

  const runExport = useCallback(async () => {
    setBusy('export');
    try {
      const res = await simpleConcatExport();
      if (res.ok && res.url) {
        setExportUrl(res.url);
        setProjectStatus('exported');
        toastSuccess('成片已导出');
        flash(`导出: ${res.url}`);
        return;
      }
      const { api } = await import('../../api/client');
      const list = activeEpisodeShots(useWorkspaceDocument.getState().storyboard);
      const r = await api.concatEpisode({
        shots: list,
        requireApproved: false,
        title: activeEpisode?.title || storyboard.title || 'nx9-episode',
      });
      if (r.ok && r.url) {
        setExportUrl(r.url);
        setProjectStatus('exported');
        toastSuccess('成片已导出');
        flash(`导出: ${r.url}`);
      } else {
        toastError(res.message || r.message || '导出失败');
      }
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }, [setProjectStatus, flash, activeEpisode, storyboard.title]);

  const saveCharacter = useCallback(
    (c: CharacterProfile) => {
      upsertCharacter(c);
      flash(`角色已保存：${c.name}`);
    },
    [upsertCharacter, flash],
  );

  const saveEnvironment = useCallback(
    (e: EnvironmentProfile) => {
      const list = [...(useWorkspaceDocument.getState().environments?.environments ?? [])];
      const i = list.findIndex((x) => x.id === e.id);
      if (i >= 0) list[i] = e;
      else list.push(e);
      setEnvironments({ version: 1, environments: list });
      flash(`场景已保存：${e.name}`);
    },
    [setEnvironments, flash],
  );

  const nextAction = useMemo(() => {
    switch (step) {
      case 'script':
        return { label: 'AI 智能拆镜', go: () => void breakdownAi() };
      case 'storyboard':
        return { label: '生成专业提示词', go: () => regenerateAllPrompts(true) };
      case 'preview':
        return { label: '批量分镜预览图', go: () => void runKeyframes(false) };
      case 'review':
        return { label: '批准全部预览图', go: () => runApproveAll() };
      case 'video':
        return { label: '批量出视频', go: () => void runVideos(false) };
      case 'voice':
        return {
          label: voice.lines.some((l) => l.status !== 'ready') ? '批量 TTS 配音' : '从镜头生成声音行',
          go: () => {
            if (voice.lines.some((l) => l.text?.trim())) void batchSynthesizeVoice();
            else seedVoiceLinesFromShots();
          },
        };
      case 'export':
        return { label: '拼接导出本集', go: () => void runExport() };
      default:
        return { label: '继续', go: () => undefined };
    }
  }, [
    step,
    breakdownAi,
    regenerateAllPrompts,
    runKeyframes,
    runApproveAll,
    runVideos,
    seedVoiceLinesFromShots,
    batchSynthesizeVoice,
    runExport,
    voice.lines,
  ]);

  return {
    hub,
    setHub,
    step,
    setStep,
    sourceText,
    setSourceText,
    seriesTitle,
    setSeriesTitle,
    busy,
    exportUrl,
    lastMessage,
    selectedShotId,
    setSelectedShotId,
    selectedShot,
    shots,
    stats,
    stepDone,
    stepStatuses,
    episodes,
    activeEpisode,
    activeEpisodeId,
    selectEpisode,
    startNextEpisode,
    markEpisodeComplete,
    upsertEpisodeMeta,
    setGlobalArtDirection,
    globalArtDirection: storyboard.globalArtDirection ?? '',
    queuePhase,
    queueProgress,
    queueLabel,
    queueError,
    cancelQueue,
    breakdownRule,
    breakdownAi,
    saveScriptOnly,
    patchShot,
    addEmptyShot,
    deleteShot,
    regenerateShotPrompts,
    regenerateAllPrompts,
    runKeyframes,
    runApproveAll,
    approveOne,
    rejectOne,
    runVideos,
    seedVoiceLinesFromShots,
    batchSynthesizeVoice,
    runExport,
    moveShot,
    nextAction,
    characters: characters.characters,
    environments: envList,
    sounds: soundLibrary.sounds,
    voice,
    saveCharacter,
    removeCharacter,
    saveEnvironment,
    addVoiceProfile,
    updateVoiceLine,
    ensureEpisodeBootstrapped,
  };
}

export type StudioDesk = ReturnType<typeof useStudioDesk>;
