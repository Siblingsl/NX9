import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  resolveEngine,
  engineLabel,
  migrateTimelinePayload,
  parseTimelineDraft,
  buildVoiceDramaTimeline,
  appendStoryboardVideoVersion,
  adoptStoryboardVideoVersion,
  type SmartEditEngine,
  type SmartEditProfile,
  type SmartSuggestion,
  type TimelinePayload,
  type StoryboardShot,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { renderClipEditorTimeline } from '../../engine/clip-editor-render';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useUpstreamMedia } from '../../engine/stage-deck/chrome/attached-workspace/generation/use-upstream-media';
import { useUpstreamShots } from '../../engine/stage-deck/chrome/attached-workspace/generation/use-upstream-shots';
import {
  orchestrateDramaTimeline,
  orchestrateViralTimeline,
} from '../../engine/smart-edit-orchestrator';
import { patchUpstreamShot } from '../../engine/chain-storyboard-utils';
import { EditDesk, type OrchestrateOutcome } from './clip-editor/EditDesk';
import './clip-editor.v2.css';

/**
 * 智能剪辑节点：画布摘要卡 + ScreenModal 剪辑台。
 * 时间线（timelineDraft）存于本节点，只消费本节点连入的上游。
 */
function ClipEditorBlock(props: NodeProps) {
  const { updateNodeData, fitView } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const appendLog = useActivityLog((s) => s.append);
  const { clips: upstreamClips, sounds: upstreamSounds, hasMedia } = useUpstreamMedia(props.id);
  const { hasUpstream: hasShotUpstream, shots: upstreamShots } = useUpstreamShots(props.id);

  const [deskOpen, setDeskOpen] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderTip, setRenderTip] = useState('');

  const status = (props.data?.status as string) ?? 'idle';
  const storedProfile = props.data?.profile as SmartEditProfile | undefined;
  const profile: SmartEditProfile =
    storedProfile ??
    (upstreamClips.length > 0 && upstreamShots.length === 0 ? 'viral' : 'drama');
  const engine: SmartEditEngine = resolveEngine(
    profile,
    (props.data?.engine as SmartEditEngine | undefined) ?? 'auto',
  );
  const outputUrl = (props.data?.outputUrl as string) || (props.data?.videoUrl as string);
  const pendingIds = (props.data?.pendingSuggestionIds as string[] | undefined) ?? [];
  const suggestions = (props.data?.suggestions as SmartSuggestion[] | undefined) ?? [];

  const timelineDraft = useMemo(() => {
    const parsed = parseTimelineDraft(props.data?.timelineDraft as never);
    return parsed ? migrateTimelinePayload(parsed) : null;
  }, [props.data?.timelineDraft]);

  useEffect(() => {
    const nextIds = hasShotUpstream ? upstreamShots.map((s) => s.id) : [];
    const prev = Array.isArray(props.data?.linkedShotIds)
      ? (props.data.linkedShotIds as string[])
      : [];
    if (prev.length === nextIds.length && prev.every((id, i) => id === nextIds[i])) return;
    updateNodeData(props.id, { linkedShotIds: nextIds });
  }, [hasShotUpstream, upstreamShots, props.data?.linkedShotIds, props.id, updateNodeData]);

  // ── 时间线持久化（剪辑台每次提交回写） ──
  const persistTimeline = useCallback(
    (tl: TimelinePayload) => {
      updateNodeData(props.id, {
        timelineDraft: tl,
        timelineSyncedAt: new Date().toISOString(),
      });
    },
    [props.id, updateNodeData],
  );

  // ── AI 编排 ──
  const handleOrchestrate = useCallback(async (): Promise<OrchestrateOutcome> => {
    updateNodeData(props.id, { status: 'running' });
    try {
      let result: OrchestrateOutcome;
      if (profile === 'drama') {
        if (!hasShotUpstream) throw new Error('请先连接导演台或带镜头的上游节点');
        if (upstreamShots.length === 0) throw new Error('上游未提供可用镜头');
        result = await orchestrateDramaTimeline({
          title: '漫剧成片',
          aspect: '9:16',
          approvedOnly: true,
          shots: upstreamShots.map((s) => ({
            id: s.id,
            index: s.index,
            status: s.status,
            durationSec: s.durationSec,
            videoAssetId: s.videoAssetId,
            videoStatus: s.videoStatus,
            firstFrameAssetId: s.firstFrameAssetId,
            audioAssetId: s.audioAssetId,
            descriptionZh: s.descriptionZh,
            subtitleText: s.subtitleText,
          })),
          bgmUrl: upstreamSounds[0],
        });
      } else {
        const dataClips =
          ((props.data?.upstream as { clips?: string[] } | undefined)?.clips ?? []);
        const extraClips = (props.data?.extraClips as string[] | undefined) ?? [];
        const clips = [...upstreamClips, ...dataClips, ...extraClips].filter(Boolean);
        if (clips.length === 0) throw new Error('请先连接视频上游，或放入额外片段');
        result = await orchestrateViralTimeline({
          clips,
          aspect: '9:16',
          bgmUrl: upstreamSounds[0],
        });
      }
      updateNodeData(props.id, {
        status: 'success',
        pendingSuggestionIds: result.suggestions.map((s) => s.id),
        suggestions: result.suggestions,
      });
      appendLog(`智能编排：${result.suggestions.length} 条建议`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateNodeData(props.id, { status: 'error', error: msg });
      appendLog(`智能编排失败：${msg}`);
      throw e;
    }
  }, [
    appendLog,
    hasShotUpstream,
    profile,
    props.data,
    props.id,
    updateNodeData,
    upstreamClips,
    upstreamShots,
    upstreamSounds,
  ]);

  // ── 建议处理 ──
  const handleSuggestionResolved = useCallback(
    (id: string, _accepted: boolean) => {
      const current = (props.data?.pendingSuggestionIds as string[] | undefined) ?? [];
      updateNodeData(props.id, { pendingSuggestionIds: current.filter((x) => x !== id) });
    },
    [props.data?.pendingSuggestionIds, props.id, updateNodeData],
  );

  // ── 渲染（D3：remotion 走服务端任务队列） ──
  const handleRender = useCallback(
    async (timeline: TimelinePayload) => {
      setRendering(true);
      updateNodeData(props.id, { status: 'running' });
      setRenderTip(`提交 ${engineLabel(engine)} 渲染任务…`);
      try {
        const rendered = await renderClipEditorTimeline(timeline, engine, {
          profile,
          title: '智能剪辑导出',
          templateId: (props.data?.templateId as string) ?? 'nx9-vertical-episode',
          onProgress: setRenderTip,
        });

        updateNodeData(props.id, {
          status: 'success',
          outputUrl: rendered.url,
          videoUrl: rendered.url,
          renderTaskId: rendered.taskId,
          renderBackend: rendered.engine,
        });
        setRenderTip(`渲染完成：${rendered.url}`);
        appendLog(`${engineLabel(engine)} 渲染成功`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        updateNodeData(props.id, { status: 'error', error: msg });
        setRenderTip(`渲染失败：${msg}`);
        appendLog(`渲染失败：${msg}`);
      } finally {
        setRendering(false);
      }
    },
    [appendLog, engine, profile, props.data?.templateId, props.id, updateNodeData],
  );

  // ── 同步交付打包 ──
  const syncToExportPack = useCallback(
    (timeline: TimelinePayload): number => {
      const downstreamPackIds = new Set(
        edges.filter((e) => e.source === props.id).map((e) => e.target),
      );
      const packNodes = nodes.filter(
        (n) => n.type === 'export-pack' && downstreamPackIds.has(n.id),
      );
      if (packNodes.length === 0) {
        appendLog('请先把本节点连到交付打包，再同步时间线');
        setRenderTip('请连接交付打包后再同步');
        return 0;
      }
      for (const pack of packNodes) {
        updateNodeData(pack.id, {
          timelineDraft: JSON.stringify(timeline),
          syncedFrom: props.id,
          syncedAt: new Date().toISOString(),
        });
      }
      appendLog(`时间线已同步到 ${packNodes.length} 个交付打包节点`);
      setRenderTip(`已同步到交付打包（${packNodes.length}）`);
      return packNodes.length;
    },
    [edges, nodes, props.id, updateNodeData, appendLog],
  );

  const handleConfirm = useCallback(
    (timeline: TimelinePayload) => {
      updateNodeData(props.id, { confirmedAt: new Date().toISOString() });
      const synced = syncToExportPack(timeline);
      if (synced > 0) {
        const pack = nodes.find(
          (n) =>
            n.type === 'export-pack' &&
            edges.some((e) => e.source === props.id && e.target === n.id),
        );
        if (pack) fitView({ nodes: [{ id: pack.id }], duration: 300 });
        appendLog('时间线已确认并送交导出');
        setRenderTip('已确认并送交交付打包');
      } else {
        appendLog('时间线已确认；请连接交付打包后再同步');
        setRenderTip('已确认 · 请连接交付打包');
      }
    },
    [updateNodeData, props.id, syncToExportPack, nodes, edges, fitView, appendLog],
  );

  // ── F-034/F-014: 注入对白音轨 + BGM ──
  const handleInjectVoice = useCallback(
    (timeline: TimelinePayload): TimelinePayload | null => {
      const voiceLines = useWorkspaceDocument.getState().voice.lines;
      if (!voiceLines || voiceLines.length === 0) {
        appendLog('无对白行可注入');
        return null;
      }
      const bgmUrl = upstreamSounds[0];
      const updated = migrateTimelinePayload(
        buildVoiceDramaTimeline(timeline, voiceLines, bgmUrl),
      );
      const voCount = voiceLines.filter((l) => l.audioAssetId).length;
      const parts = [`${voCount} 条对白音轨`];
      if (bgmUrl) parts.push('BGM 音轨');
      appendLog(`已注入 ${parts.join(' + ')}`);
      return updated;
    },
    [appendLog, upstreamSounds],
  );

  /** 智能替换采纳 → 上游镜 videoVersions（take） */
  const handleWritebackShotVersion = useCallback(
    (
      shotId: string,
      url: string,
      meta?: { prompt?: string; model?: string },
      adopt = false,
    ): string | undefined => {
      const shot = upstreamShots.find((s) => s.id === shotId);
      if (!shot) return undefined;
      const takeId = `take-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const patch = appendStoryboardVideoVersion(shot, {
        id: takeId,
        url,
        createdAt: new Date().toISOString(),
        prompt: meta?.prompt,
        model: meta?.model,
        status: 'candidate',
      });
      // SE-DEEP-05: 用户可把新 take 直接 adopt，导演台无需二次审片
      let finalPatch: Partial<StoryboardShot> = patch;
      if (adopt) {
        const adopted = adoptStoryboardVideoVersion({ ...shot, ...patch }, takeId);
        if (adopted) finalPatch = { ...patch, ...adopted };
      }
      const ok = patchUpstreamShot(updateNodeData, props.id, nodes, edges, shotId, finalPatch);
      if (!ok) return undefined;
      return takeId;
    },
    [upstreamShots, updateNodeData, props.id, nodes, edges],
  );

  const arrangeHint =
    profile === 'drama'
      ? hasShotUpstream
        ? `本节点上游 ${upstreamShots.length} 个镜头`
        : '漫剧模式：请连接导演台或镜头上游（不读取全局故事板）'
      : hasMedia || upstreamClips.length > 0
        ? `本节点上游 ${upstreamClips.length} 段视频`
        : '爆款模式：请连接视频上游';

  // ── 摘要卡 ──
  const clipCount = timelineDraft
    ? timelineDraft.tracks.filter((t) => t.kind === 'video').reduce((n, t) => n + t.clips.length, 0)
    : 0;
  const durationSec = timelineDraft ? Math.round(timelineDraft.durationSec * 10) / 10 : 0;
  const trackCount = timelineDraft?.tracks.length ?? 0;
  const pendingCount = pendingIds.length;
  const cardTitle = timelineDraft?.title?.trim() || '智能剪辑';
  const cardBadge =
    status === 'running' || rendering
      ? { text: '运行中', cls: 'is-run' }
      : outputUrl
        ? { text: '已导出', cls: 'is-ok' }
        : timelineDraft
          ? { text: '已编排', cls: 'is-ok' }
          : { text: '待编排', cls: '' };

  return (
    <>
      <BlockShell {...props}>
        <div className="se2-card nodrag nopan">
          <div
            className="se2-card__clickable"
            role="button"
            tabIndex={0}
            onClick={() => setDeskOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDeskOpen(true);
              }
            }}
          >
            <div className="se2-card__header">
              <span className="se2-card__eyebrow">智能剪辑台</span>
              <span className={`se2-card__badge ${cardBadge.cls}`}>{cardBadge.text}</span>
            </div>
            <div className="se2-card__title">{cardTitle}</div>
            <div className="se2-card__meta">
              {timelineDraft
                ? `${clipCount} 镜 · ${durationSec}s · ${trackCount} 轨 · ${timelineDraft.aspect}`
                : '尚未编排时间线'}
              {pendingCount > 0 ? ` · ${pendingCount} 建议` : ''}
            </div>
            <div className="se2-card__logline">
              {outputUrl
                ? '成片已导出 · 可打开剪辑台预览或同步交付'
                : timelineDraft
                  ? '打开剪辑台：时间轴编辑 · 智能替换 · 送交导出'
                  : '打开剪辑台：AI 编排或手动剪辑'}
            </div>
            <div className="se2-card__actions">
              <button
                type="button"
                className="se2-btn se2-btn--ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeskOpen(true);
                }}
              >
                打开剪辑台
              </button>
            </div>
          </div>
        </div>
      </BlockShell>

      <ScreenModal
        open={deskOpen}
        onClose={() => setDeskOpen(false)}
        title="智能剪辑台"
        subtitle="智能剪辑 · 编排 → 预览 → 确认并送交导出 · 最终出片在交付打包"
        width="min(1560px, calc(100vw - 20px))"
        variant="default"
        className="ed-modal"
      >
        <EditDesk
          initialTimeline={timelineDraft}
          onPersist={persistTimeline}
          profile={profile}
          onProfileChange={(p) => updateNodeData(props.id, { profile: p })}
          arrangeHint={arrangeHint}
          onOrchestrate={handleOrchestrate}
          suggestions={suggestions}
          pendingIds={pendingIds}
          onSuggestionResolved={handleSuggestionResolved}
          shots={upstreamShots}
          upstreamClips={upstreamClips}
          upstreamSounds={upstreamSounds}
          engine={engine}
          onEngineChange={(e) => updateNodeData(props.id, { engine: e })}
          rendering={rendering}
          renderTip={renderTip}
          outputUrl={outputUrl}
          onRender={(tl) => void handleRender(tl)}
          onConfirm={handleConfirm}
          onSyncOnly={(tl) => void syncToExportPack(tl)}
          onInjectVoice={handleInjectVoice}
          onWritebackShotVersion={handleWritebackShotVersion}
          onLog={appendLog}
        />
      </ScreenModal>
    </>
  );
}

export default memo(ClipEditorBlock);
