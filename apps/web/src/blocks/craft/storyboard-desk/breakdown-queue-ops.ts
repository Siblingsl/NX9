import { useCallback, useEffect, useRef } from 'react';
import { type NodeProps, type Node as FlowNode } from '@xyflow/react';
import {
  type EpisodeQueueState,
  type QueueProgress,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
  createEpisodeQueue,
  flattenScriptBreakdownShots,
  normalizeScriptBreakdownConfig,
  normalizeScriptBreakdownPrompts,
  queueCancel,
  queuePause,
  queueResume,
  queueSkipEpisode,
  screenplayFullText,
} from '@nx9/shared';
import {
  applyDeskBreakdown,
  mergeIncrementalBreakdown,
  packageSourceHash,
  runBreakdownFromPackage,
  stripEpisodeConfirmation,
} from '../../../engine/storyboard-desk-runner';
import { runProductionScriptBreakdownForEpisodes, stableSourceResultEpisodeId } from '../../../engine/script-breakdown-runner';
import { runStoryboardPreflight } from '../../../engine/asset-readiness';
import { useToast } from '../../../stores/toast';
import { askConfirm } from '../../../stores/confirm-dialog';
import { api } from '../../../api/client';
import { type StudioTab } from './helpers';

type StoryboardBreakdownQueueDeps = {
  props: NodeProps;
  updateNodeData: (id: string, dataUpdate: Partial<Record<string, unknown>> | ((node: FlowNode) => Partial<Record<string, unknown>>), options?: { replace: boolean }) => void;
  getNodes: () => Array<{ id: string; data?: unknown }>;
  appendLog: (line: string) => void;
  payload: ScriptBreakdownPayload | undefined;
  local: ScriptBreakdownPayload | undefined;
  upstream: ScriptBreakdownPayload | undefined;
  upstreamPackage: import('@nx9/shared').ScreenplayPackage | undefined;
  readiness: import('../../../engine/asset-readiness').AssetReadinessState | null;
  preflightMode: 'soft' | 'hard';
  confirmedEpisodeIds: string[];
  currentEpisodeId: string | null;
  offerReturnAfterBreakdown: (result: 'ok' | 'fail', detail?: string) => Promise<void>;
  setBreakingDown: (value: boolean) => void;
  setStudioTab: (tab: StudioTab) => void;
  setStudioOpen: (open: boolean) => void;
  incrementalText: string;
  setIncrementalText: (value: string) => void;
  setIncrementalBusy: (value: boolean) => void;
  incrementalAbortRef: React.MutableRefObject<AbortController | null>;
  queueState: EpisodeQueueState;
  setQueueState: React.Dispatch<React.SetStateAction<EpisodeQueueState>>;
  setQueueProgress: React.Dispatch<React.SetStateAction<QueueProgress>>;
  setQueueCurrentTitle: (title: string) => void;
  breakingDown: boolean;
  hasLocalBreakdownEpisodes: boolean;
  missingUpstreamEpisodes: Array<{ id: string; title: string; index?: number; bodyMd?: string }>;
};

export function useStoryboardBreakdownQueueOps(deps: StoryboardBreakdownQueueDeps) {
  const {
    props,
    updateNodeData,
    getNodes,
    appendLog,
    payload,
    local,
    upstream,
    upstreamPackage,
    readiness,
    preflightMode,
    confirmedEpisodeIds,
    currentEpisodeId,
    offerReturnAfterBreakdown,
    setBreakingDown,
    setStudioTab,
    setStudioOpen,
    incrementalText,
    setIncrementalText,
    setIncrementalBusy,
    incrementalAbortRef,
    queueState,
    setQueueState,
    setQueueProgress,
    setQueueCurrentTitle,
    breakingDown,
    hasLocalBreakdownEpisodes,
    missingUpstreamEpisodes,
  } = deps;
  const breakdownAbortRef = useRef<AbortController | null>(null);
  const breakdownEpochRef = useRef(0);
  const queueCancelRef = useRef(false);
  const episodeAbortRef = useRef<AbortController | null>(null);
  const queueStateRef = useRef(queueState);
  useEffect(() => { queueStateRef.current = queueState; }, [queueState]);
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
    // SB-OL-09: 旧镜表并非由当前成稿包拆出，写哨兵 hash 保证 stale 检测可触发；
    // 上游存在 confirmed package 时 Banner 会诚实提示「与当前镜表不同步」，可「稍后」关闭
    updateNodeData(props.id, {
      breakdownJob: {
        phase: 'done',
        sourcePackageId: 'legacy-import',
        sourcePackageHash: 'legacy-import',
        startedAt: new Date().toISOString(),
      },
    });
    setStudioTab('grid');
    setStudioOpen(true);
  }, [applyBreakdownPayload, local, props.id, updateNodeData, upstream]);

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
    // SB-OL-12: 增量补拆挂控制器，关台取消能中止在途请求
    const incAbort = new AbortController();
    incrementalAbortRef.current = incAbort;
    try {
      const cfg = (props.data as Record<string, unknown>)?.scriptBreakdownConfig as
        import('@nx9/shared').ScriptBreakdownConfig | undefined;
      const pro = (props.data as Record<string, unknown>)?.scriptBreakdownPrompts as
        import('@nx9/shared').ScriptBreakdownPromptTemplates | undefined;
      const result = await api.productionScriptBreakdown({
        sourceText: text,
        config: cfg ? normalizeScriptBreakdownConfig(cfg) : undefined,
        prompts: pro ? normalizeScriptBreakdownPrompts(pro) : undefined,
      }, { signal: incAbort.signal });
      if (incAbort.signal.aborted) { appendLog('增量补拆已取消 · 镜表不变'); return; }
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
      // SB-OL-14: AI 每次生成新 id，无法按 id 去重；按正文/标题归一比对，
      // 命中的镜在预览里标「疑似重复」提醒用户核对后再合并
      const normalizeShotText = (s: ScriptBreakdownShot) =>
        (s.scriptText || s.title || '').replace(/\s+/g, '').slice(0, 80);
      const existingTexts = new Set(
        flattenScriptBreakdownShots(existing).map(normalizeShotText).filter(Boolean),
      );
      const isSuspectDuplicate = (s: ScriptBreakdownShot) => {
        const key = normalizeShotText(s);
        return Boolean(key) && existingTexts.has(key);
      };
      const suspectCount = newShots.filter(isSuspectDuplicate).length;
      const previewLines = newShots.slice(0, 15).map((s) =>
        `${s.sceneCode || `#${s.index}`} ${s.title || ''}${isSuspectDuplicate(s) ? '　⚠ 疑似重复' : ''}`.trim(),
      ).join('\n');
      const moreHint = newShots.length > 15 ? `\n... 共 ${newShots.length} 镜` : '';
      const dupHint = suspectCount > 0
        ? `\n\n⚠ 有 ${suspectCount} 镜与现有镜正文相同（疑似重复补拆），合并前请核对。`
        : '';
      const ok = await askConfirm({
        title: '增量补拆预览',
        description: `将新增 ${newShots.length} 镜：\n\n${previewLines}${moreHint}${dupHint}\n\n合并前请核对镜号与分期。`,
        confirmLabel: '合并入镜表',
        cancelLabel: '取消',
        ...(suspectCount > 0 ? { tone: 'danger' as const } : {}),
      });
      if (!ok) { appendLog('增量补拆已取消 · 镜表不变'); return; }
      applyDeskBreakdown(props.id, merged, updateNodeData, stripEpisodeConfirmation(props.data, currentEpisodeId));
      setIncrementalText('');
      appendLog(`增量补拆完成 · 新增 ${newShots.length} 镜合并入镜表`);
      setStudioTab('grid');
    } catch (e) {
      if (incAbort.signal.aborted) {
        appendLog('增量补拆已取消 · 镜表不变');
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        appendLog(`[SB_BREAKDOWN_FAIL] 增量补拆失败：${msg}`);
      }
    } finally {
      if (incrementalAbortRef.current === incAbort) incrementalAbortRef.current = null;
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
    // SB-OL-06: 运行中点跳过 → 中止当前集在途请求；暂停中点跳过 → 唤醒循环走 skip 分支
    episodeAbortRef.current?.abort();
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

      // SB-OL-06: 用户已点「跳过」（暂停中点击 / 请求发起前点击）→ 本集不再发起请求
      if (queueStateRef.current.skipped.includes(ep.id)) {
        if (!initQs.skipped.includes(ep.id)) initQs.skipped.push(ep.id);
        appendLog(`分镜台 · 已跳过第 ${idx + 1}/${episodes.length} 集：${epTitle}`);
        idx++;
        initQs.index = idx;
        if (idx >= episodes.length) initQs.status = 'done';
        const snap = { ...initQs };
        setQueueState(snap);
        setQueueProgress(buildProgress(snap));
        continue;
      }

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

      // SB-OL-06: 每集独立控制器，链接外层 signal —「跳过」只中止当前集，不影响队列
      const epAbort = new AbortController();
      const onOuterAbort = () => epAbort.abort();
      if (signal?.aborted) epAbort.abort();
      signal?.addEventListener('abort', onOuterAbort);
      episodeAbortRef.current = epAbort;
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
          signal: epAbort.signal,
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
        const abortError = (e instanceof DOMException && e.name === 'AbortError')
          || (e instanceof Error && e.name === 'AbortError');
        // SB-OL-06: 区分「跳过当前集」与「取消整个队列」——
        // 仅本集控制器被中止且外层未取消时，按跳过处理并继续下一集
        const skipRequested = (abortError || epAbort.signal.aborted)
          && !signal?.aborted
          && !queueCancelRef.current;
        if (skipRequested) {
          if (!initQs.skipped.includes(ep.id)) initQs.skipped.push(ep.id);
          appendLog(`分镜台 · 已跳过第 ${idx + 1}/${episodes.length} 集：${epTitle}`);
        } else if (signal?.aborted || abortError || queueCancelRef.current) {
          appendLog(`分镜台 · 第 ${idx + 1} 集拆镜已取消`);
          break;
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          initQs.errors[ep.id] = msg;
          initQs.results[ep.id] = false;
          appendLog(`[SB_BREAKDOWN_FAIL] 分镜台 · 第 ${idx + 1} 集拆镜失败：${msg}`);
        }
      } finally {
        signal?.removeEventListener('abort', onOuterAbort);
        if (episodeAbortRef.current === epAbort) episodeAbortRef.current = null;
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

  return {
    applyBreakdownPayload,
    importLegacyBreakdown,
    breakdownFromPackage,
    runIncrementalBreakdown,
    handleRetryFailed,
    handleQueuePause,
    handleQueueResume,
    handleQueueSkip,
    handleQueueCancel,
    cancelBreakdown,
    breakdownNewEpisodesOnly,
    breakdownUnconfirmedOnly,
  };
}
