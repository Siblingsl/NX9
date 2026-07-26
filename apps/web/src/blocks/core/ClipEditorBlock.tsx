import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { Check, Download, Loader2, Sparkles, X } from 'lucide-react';
import {
  resolveEngine,
  engineLabel,
  timelineToRemotionStudioBundle,
  type SmartEditEngine,
  type SmartEditProfile,
  type SmartSuggestion,
  type TimelinePayload,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { useUpstreamMedia } from '../../engine/stage-deck/chrome/attached-workspace/generation/use-upstream-media';
import { useUpstreamShots } from '../../engine/stage-deck/chrome/attached-workspace/generation/use-upstream-shots';
import {
  orchestrateDramaTimeline,
  orchestrateViralTimeline,
  validateTimeline,
} from '../../engine/smart-edit-orchestrator';
import './clip-editor.v2.css';

const ENGINES: SmartEditEngine[] = ['auto', 'remotion', 'hyperframes', 'ffmpeg'];

type StudioTab = 'arrange' | 'timeline' | 'render';

function readNodeTimeline(data: Record<string, unknown> | undefined): TimelinePayload | null {
  const raw = data?.timelineDraft;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as TimelinePayload;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as TimelinePayload;
  return null;
}

function ClipEditorBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const appendLog = useActivityLog((s) => s.append);
  const { clips: upstreamClips, hasMedia } = useUpstreamMedia(props.id);
  const { hasUpstream: hasShotUpstream, shots: upstreamShots } = useUpstreamShots(props.id);

  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>('arrange');
  const [running, setRunning] = useState(false);
  const [tip, setTip] = useState('');

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
  const timelineDraft = useMemo(
    () => readNodeTimeline(props.data as Record<string, unknown> | undefined),
    [props.data],
  );

  useEffect(() => {
    const nextIds = hasShotUpstream ? upstreamShots.map((s) => s.id) : [];
    const prev = Array.isArray(props.data?.linkedShotIds)
      ? (props.data.linkedShotIds as string[])
      : [];
    if (prev.length === nextIds.length && prev.every((id, i) => id === nextIds[i])) return;
    updateNodeData(props.id, { linkedShotIds: nextIds });
  }, [hasShotUpstream, upstreamShots, props.data?.linkedShotIds, props.id, updateNodeData]);

  const writeTimeline = useCallback(
    (timeline: TimelinePayload | null, extra?: Record<string, unknown>) => {
      updateNodeData(props.id, {
        timelineDraft: timeline,
        ...(extra ?? {}),
      });
    },
    [props.id, updateNodeData],
  );

  const videoClips = useMemo(() => {
    if (!timelineDraft) return [];
    return timelineDraft.tracks
      .filter((t) => t.kind === 'video')
      .flatMap((t) => t.clips);
  }, [timelineDraft]);

  const clipCount = videoClips.length;
  const durationSec = timelineDraft
    ? Math.round(timelineDraft.durationSec * 10) / 10
    : 0;

  const timelineSummary = useMemo(() => {
    if (!timelineDraft) return null;
    return `${clipCount} 镜 · ${durationSec}s · ${timelineDraft.aspect}`;
  }, [timelineDraft, clipCount, durationSec]);

  const validation = useMemo(() => {
    if (!timelineDraft) return null;
    return validateTimeline(timelineDraft);
  }, [timelineDraft]);

  const pendingItems = useMemo(
    () => suggestions.filter((s) => pendingIds.includes(s.id)),
    [suggestions, pendingIds],
  );

  const cardTitle = timelineDraft?.title?.trim() || '智能剪辑';

  const cardBadge =
    status === 'running' || running
      ? { text: '运行中', cls: 'is-run' }
      : outputUrl
        ? { text: '已导出', cls: 'is-ok' }
        : timelineDraft
          ? { text: '已编排', cls: 'is-ok' }
          : { text: '待编排', cls: '' };

  const openStudio = useCallback((tab?: StudioTab) => {
    if (tab) setStudioTab(tab);
    else if (!timelineDraft) setStudioTab('arrange');
    else if (!outputUrl) setStudioTab('timeline');
    else setStudioTab('render');
    setStudioOpen(true);
  }, [timelineDraft, outputUrl]);

  const handleOrchestrate = useCallback(async () => {
    setRunning(true);
    setTip('编排中…');
    updateNodeData(props.id, { status: 'running' });
    try {
      let result: { timeline: TimelinePayload; suggestions: SmartSuggestion[] };
      if (profile === 'drama') {
        if (!hasShotUpstream) {
          throw new Error('请先连接导演台或带镜头的上游节点');
        }
        if (upstreamShots.length === 0) {
          throw new Error('上游未提供可用镜头');
        }
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
            firstFrameAssetId: s.firstFrameAssetId,
            audioAssetId: s.audioAssetId,
            descriptionZh: s.descriptionZh,
            subtitleText: s.subtitleText,
          })),
        });
      } else {
        const dataClips =
          ((props.data?.upstream as { clips?: string[] } | undefined)?.clips ?? []);
        const extraClips = (props.data?.extraClips as string[] | undefined) ?? [];
        const clips = [...upstreamClips, ...dataClips, ...extraClips].filter(Boolean);
        if (clips.length === 0) {
          throw new Error('请先连接视频上游，或放入额外片段');
        }
        result = await orchestrateViralTimeline({
          clips,
          aspect: '9:16',
        });
      }
      writeTimeline(result.timeline, {
        status: 'success',
        pendingSuggestionIds: result.suggestions.map((s) => s.id),
        suggestions: result.suggestions,
        timelineSyncedAt: new Date().toISOString(),
      });
      appendLog(`智能编排：${result.suggestions.length} 条建议`);
      setTip(`时间线已生成 · ${result.suggestions.length} 条建议待确认`);
      setStudioTab('timeline');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateNodeData(props.id, { status: 'error', error: msg });
      setTip(`编排失败：${msg}`);
      appendLog(`智能编排失败：${msg}`);
    } finally {
      setRunning(false);
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
    writeTimeline,
  ]);

  const handleRender = useCallback(async () => {
    if (!timelineDraft) {
      setTip('请先执行智能编排');
      setStudioTab('arrange');
      return;
    }
    setRunning(true);
    updateNodeData(props.id, { status: 'running' });
    setTip(`提交 ${engineLabel(engine)} 渲染任务…`);
    try {
      let result: { ok: boolean; url?: string; taskId?: string };
      if (engine === 'ffmpeg') {
        result = await api.concatClips(
          timelineDraft.tracks
            .filter((t) => t.kind === 'video')
            .flatMap((t) => t.clips.map((c) => c.assetUrl)),
          '智能剪辑导出',
          'none',
        );
      } else if (engine === 'hyperframes') {
        result = await api.renderHyperframes({
          timeline: timelineDraft,
          templateId: (props.data?.templateId as string) ?? 'nx9-vertical-episode',
        });
      } else if (engine === 'remotion') {
        const bundle = timelineToRemotionStudioBundle(timelineDraft);
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        for (const file of bundle.files) {
          zip.file(file.name, file.content);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = bundle.zipFilename;
        a.click();
        URL.revokeObjectURL(url);
        result = { ok: true, url: bundle.zipFilename, taskId: undefined };
      } else {
        const withVideo = upstreamShots.filter((s) => s.videoAssetId);
        result = await api.concatEpisode({
          shots: withVideo,
          requireApproved: true,
          title: timelineDraft.title || '智能剪辑',
        });
      }
      if (result.ok && result.url) {
        updateNodeData(props.id, {
          status: 'success',
          outputUrl: result.url,
          videoUrl: result.url,
          renderTaskId: result.taskId,
          renderBackend: engine,
        });
        setTip(`渲染完成：${result.url}`);
        appendLog(`${engineLabel(engine)} 渲染成功`);
      } else {
        updateNodeData(props.id, { status: 'error', error: result.url || '渲染失败' });
        setTip('渲染失败');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateNodeData(props.id, { status: 'error', error: msg });
      setTip(`渲染失败：${msg}`);
      appendLog(`渲染失败：${msg}`);
    } finally {
      setRunning(false);
    }
  }, [appendLog, engine, props.data, props.id, timelineDraft, updateNodeData, upstreamShots]);

  const handleAcceptSuggestion = useCallback(
    (suggestionId: string) => {
      const suggestion = suggestions.find((s) => s.id === suggestionId);
      if (!suggestion || !timelineDraft) return;
      const merged: TimelinePayload = {
        ...timelineDraft,
        ...(suggestion.patch as Partial<TimelinePayload>),
      };
      writeTimeline(merged, {
        pendingSuggestionIds: pendingIds.filter((id) => id !== suggestionId),
      });
      appendLog(`已采纳建议：${suggestion.message}`);
    },
    [suggestions, timelineDraft, pendingIds, writeTimeline, appendLog],
  );

  const handleRejectSuggestion = useCallback(
    (suggestionId: string) => {
      const suggestion = suggestions.find((s) => s.id === suggestionId);
      updateNodeData(props.id, {
        pendingSuggestionIds: pendingIds.filter((id) => id !== suggestionId),
      });
      appendLog(`已忽略建议：${suggestion?.message ?? suggestionId}`);
    },
    [pendingIds, updateNodeData, props.id, appendLog, suggestions],
  );

  const syncToExportPack = useCallback(() => {
    if (!timelineDraft) {
      appendLog('请先执行智能编排');
      setTip('请先执行智能编排');
      return;
    }
    const downstreamPackIds = new Set(
      edges.filter((e) => e.source === props.id).map((e) => e.target),
    );
    const packNodes = nodes.filter(
      (n) => n.type === 'export-pack' && downstreamPackIds.has(n.id),
    );
    if (packNodes.length === 0) {
      appendLog('请先把本节点连到交付打包，再同步时间线');
      setTip('请连接交付打包后再同步');
      return;
    }
    for (const pack of packNodes) {
      updateNodeData(pack.id, {
        timelineDraft: JSON.stringify(timelineDraft),
        syncedFrom: props.id,
        syncedAt: new Date().toISOString(),
      });
    }
    appendLog(`时间线已同步到 ${packNodes.length} 个交付打包节点`);
    setTip(`已同步到交付打包（${packNodes.length}）`);
  }, [edges, nodes, props.id, timelineDraft, updateNodeData, appendLog]);

  const setProfile = useCallback(
    (p: SmartEditProfile) => {
      updateNodeData(props.id, { profile: p });
      setTip('');
    },
    [props.id, updateNodeData],
  );

  const setEngine = useCallback(
    (e: SmartEditEngine) => {
      updateNodeData(props.id, { engine: e });
    },
    [props.id, updateNodeData],
  );

  const arrangeHint =
    profile === 'drama'
      ? hasShotUpstream
        ? `本节点上游 ${upstreamShots.length} 个镜头`
        : '漫剧模式：请连接导演台或镜头上游（不读取全局故事板）'
      : hasMedia || upstreamClips.length > 0
        ? `本节点上游 ${upstreamClips.length} 段视频`
        : '爆款模式：请连接视频上游';

  return (
    <>
      <BlockShell {...props}>
        <div className="se2-card nodrag nopan">
          <button type="button" className="se2-card__clickable" onClick={() => openStudio()}>
            <div className="se2-card__header">
              <span className="se2-card__eyebrow">智能剪辑 · 成片</span>
              <span className={`se2-card__badge ${cardBadge.cls}`}>{cardBadge.text}</span>
            </div>
            <div className="se2-card__title">{cardTitle}</div>
            <div className="se2-card__meta">
              {timelineSummary ?? '尚未编排时间线'}
              {pendingItems.length > 0 ? ` · ${pendingItems.length} 建议` : ''}
            </div>
            <div className="se2-card__logline">
              {outputUrl
                ? '成片已导出 · 可打开台内预览或同步交付'
                : timelineDraft
                  ? '时间线已就绪 · 打开台内确认建议并渲染'
                  : '点击打开智能剪辑 · 编排时间线并渲染成片'}
            </div>
            <div className="se2-card__actions">
              <button
                type="button"
                className="se2-btn se2-btn--ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  openStudio();
                }}
              >
                打开智能剪辑
              </button>
            </div>
          </button>
        </div>
      </BlockShell>

      <ScreenModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        title="智能剪辑"
        subtitle="编排时间线 → 确认建议 → 渲染成片"
        width="min(1180px, calc(100vw - 24px))"
        variant="default"
        className="se2-modal"
      >
        <div className="se2-studio">
          <div className="se2-pipeline" aria-label="剪辑流程">
            <button
              type="button"
              className={`se2-pipeline__step ${studioTab === 'arrange' ? 'is-on' : ''}`}
              onClick={() => setStudioTab('arrange')}
            >
              <b>1</b> 编排
            </button>
            <span className="se2-pipeline__sep" aria-hidden />
            <button
              type="button"
              className={`se2-pipeline__step ${studioTab === 'timeline' ? 'is-on' : ''}`}
              onClick={() => setStudioTab('timeline')}
            >
              <b>2</b> 时间线
            </button>
            <span className="se2-pipeline__sep" aria-hidden />
            <button
              type="button"
              className={`se2-pipeline__step ${studioTab === 'render' ? 'is-on' : ''}`}
              onClick={() => setStudioTab('render')}
            >
              <b>3</b> 渲染交付
            </button>
          </div>

          <div className="se2-studio__main">
            <div className="se2-scroll">
              {studioTab === 'arrange' && (
                <>
                  <div className="se2-panel">
                    <h3 className="se2-panel__title">成片模式</h3>
                    <p className="se2-panel__hint">
                      每个智能剪辑节点独立：只消费本节点连入的上游，时间线存在本节点上。
                    </p>
                    <p className="se2-hint">{arrangeHint}</p>
                    <div className="se2-row">
                      <button
                        type="button"
                        className={`se2-chip ${profile === 'drama' ? 'is-on' : ''}`}
                        onClick={() => setProfile('drama')}
                      >
                        漫剧成片
                      </button>
                      <button
                        type="button"
                        className={`se2-chip ${profile === 'viral' ? 'is-on' : ''}`}
                        onClick={() => setProfile('viral')}
                      >
                        爆款模板
                      </button>
                    </div>
                    <div className="se2-actions">
                      <button
                        type="button"
                        className="se2-btn se2-btn--primary"
                        onClick={() => void handleOrchestrate()}
                        disabled={running}
                      >
                        {running ? <Loader2 size={14} className="se2-spin" /> : <Sparkles size={14} />}
                        智能编排
                      </button>
                      {timelineDraft && (
                        <button
                          type="button"
                          className="se2-btn"
                          onClick={() => setStudioTab('timeline')}
                        >
                          查看时间线
                        </button>
                      )}
                    </div>
                    {tip && studioTab === 'arrange' && <p className="se2-tip">{tip}</p>}
                  </div>

                  <div className="se2-panel">
                    <h3 className="se2-panel__title">智能建议</h3>
                    {pendingItems.length === 0 ? (
                      <div className="se2-empty">
                        {timelineDraft
                          ? '暂无待确认建议'
                          : '先执行智能编排，生成时间线与建议'}
                      </div>
                    ) : (
                      <div className="se2-suggestions">
                        <p className="se2-hint">{pendingItems.length} 条待确认</p>
                        {pendingItems.map((sg) => (
                          <div key={sg.id} className="se2-suggestion-row">
                            <span className="se2-sg-kind">{sg.kind}</span>
                            <span className="se2-sg-msg" title={sg.message}>{sg.message}</span>
                            <span className="se2-sg-conf">{Math.round(sg.confidence * 100)}%</span>
                            <button
                              type="button"
                              className="se2-btn se2-btn--icon"
                              title="采纳"
                              onClick={() => handleAcceptSuggestion(sg.id)}
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              className="se2-btn se2-btn--icon"
                              title="忽略"
                              onClick={() => handleRejectSuggestion(sg.id)}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {studioTab === 'timeline' && (
                <>
                  {!timelineDraft ? (
                    <div className="se2-empty">
                      尚未编排时间线。请先到「编排」执行智能编排。
                      <div className="se2-actions" style={{ justifyContent: 'center', marginTop: 12 }}>
                        <button
                          type="button"
                          className="se2-btn se2-btn--primary"
                          onClick={() => setStudioTab('arrange')}
                        >
                          去编排
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="se2-stats">
                        <div className="se2-stat">
                          <b>{clipCount}</b>
                          <span>视频镜</span>
                        </div>
                        <div className="se2-stat">
                          <b>{durationSec}s</b>
                          <span>总时长</span>
                        </div>
                        <div className="se2-stat">
                          <b>{timelineDraft.aspect}</b>
                          <span>画幅</span>
                        </div>
                      </div>

                      {validation && !validation.ok && (
                        <p className="se2-warn">{validation.warnings.join('; ')}</p>
                      )}

                      <div className="se2-panel">
                        <h3 className="se2-panel__title">时间线轨道</h3>
                        <div className="se2-track">
                          {timelineDraft.tracks
                            .filter((t) => t.kind === 'video')
                            .map((t) => {
                              const total = timelineDraft.durationSec || 1;
                              return (
                                <div key={t.id} className="se2-rail" title={t.id}>
                                  {t.clips.map((c) => {
                                    const w = Math.max(4, (c.durationSec / total) * 100);
                                    return (
                                      <div
                                        key={c.id}
                                        className="se2-block"
                                        style={{ width: `${w}%` }}
                                        title={c.assetUrl?.slice(-40) || c.id}
                                      />
                                    );
                                  })}
                                </div>
                              );
                            })}
                        </div>
                        <div className="se2-clip-list">
                          {videoClips.map((c, i) => (
                            <div key={c.id} className="se2-clip-row">
                              <span className="se2-clip-row__idx">#{i + 1}</span>
                              <span className="se2-clip-row__url" title={c.assetUrl}>
                                {c.assetUrl?.slice(-48) || c.id}
                              </span>
                              <span className="se2-clip-row__dur">
                                {Math.round(c.durationSec * 10) / 10}s
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="se2-actions">
                        <button
                          type="button"
                          className="se2-btn"
                          onClick={() => setStudioTab('arrange')}
                        >
                          返回编排
                        </button>
                        <button
                          type="button"
                          className="se2-btn se2-btn--primary"
                          onClick={() => setStudioTab('render')}
                        >
                          去渲染
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {studioTab === 'render' && (
                <>
                  <div className="se2-panel">
                    <h3 className="se2-panel__title">渲染引擎</h3>
                    <p className="se2-panel__hint">
                      Auto 按模式择优；Remotion 当前为客户端 Studio bundle 下载。
                    </p>
                    <div className="se2-row">
                      {ENGINES.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className={`se2-chip ${engine === e ? 'is-on' : ''}`}
                          onClick={() => setEngine(e)}
                          disabled={e === 'auto' && profile === 'drama'}
                        >
                          {engineLabel(e)}
                        </button>
                      ))}
                    </div>
                    {engine === 'remotion' && (
                      <p className="se2-hint se2-hint--warn">
                        <Download size={12} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                        Remotion 服务端渲染需 Chrome 运行时；当前为客户端 bundle 下载
                      </p>
                    )}
                    <div className="se2-actions">
                      <button
                        type="button"
                        className="se2-btn se2-btn--primary"
                        disabled={running || !timelineDraft}
                        onClick={() => void handleRender()}
                      >
                        {running ? <Loader2 size={14} className="se2-spin" /> : null}
                        {running ? '运行中…' : '渲染导出'}
                      </button>
                      <button
                        type="button"
                        className="se2-btn"
                        disabled={!timelineDraft}
                        onClick={syncToExportPack}
                        title="同步时间线到已连接的交付打包节点"
                      >
                        同步到交付打包
                      </button>
                    </div>
                    {tip && <p className="se2-tip">{tip}</p>}
                    {outputUrl && (
                      <video src={outputUrl} controls className="se2-preview" />
                    )}
                    {!timelineDraft && (
                      <div className="se2-empty" style={{ marginTop: 12 }}>
                        请先编排时间线后再渲染
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </ScreenModal>
    </>
  );
}

export default memo(ClipEditorBlock);
