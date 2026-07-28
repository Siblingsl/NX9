import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  resolveRunLabel,
  ECOM_ALL_SPECS,
  hasEffectiveTimeline as timelineHasClips,
  parseTimelineDraft,
  manifestToCsv,
  shotsToManifestRows,
  type TimelinePayload,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { resolveShotsForBlock } from '../../engine/chain-storyboard-utils';
import { runExportPack } from '../../engine/export-pack-runner';
import { generateManifestCsv, generateManifestPdf } from '../../engine/export-manifest-client';
import { useTaskPoll } from '../../hooks/use-task-poll';
import { api } from '../../api/client';

type ExportMode = 'zip' | 'ffmpeg-episode' | 'hyperframes-episode' | 'remotion-bundle' | 'ecom-pack';

function readUpstreamClipEditorTimeline(
  packId: string,
  nodes: ReturnType<typeof useNodes>,
  edges: ReturnType<typeof useEdges>,
): TimelinePayload | null {
  const incoming = edges.filter((e) => e.target === packId);
  for (const edge of incoming) {
    const src = nodes.find((n) => n.id === edge.source);
    if (src?.type !== 'clip-editor') continue;
    const parsed = parseTimelineDraft(src.data?.timelineDraft as TimelinePayload | string | undefined);
    if (parsed && timelineHasClips(parsed)) return parsed;
  }
  return null;
}

function ExportPackBlock(props: NodeProps) {
  const { updateNodeData, fitView } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const nodes = useNodes();
  const edges = useEdges();
  // F-003: 链优先读取上游镜表（允许回退全局，因导出需全量）
  const shots = useMemo(
    () => resolveShotsForBlock(props.id, nodes, edges, true),
    [props.id, nodes, edges],
  );
  const storyboardVersion = useWorkspaceDocument((s) => s.storyboard.version);
  const upstream = props.data?.upstream as {
    pictures?: string[];
    clips?: string[];
    sounds?: string[];
    prompts?: string[];
  } | undefined;
  const prefix = (props.data?.exportPrefix as string) ?? 'nx9-shot';
  const lastExport = props.data?.lastExportAt as string | undefined;
  const episodeUrl = props.data?.episodeUrl as string | undefined;
  const timelineDraft = props.data?.timelineDraft as string | TimelinePayload | undefined;

  const parsedTimeline = useMemo(() => parseTimelineDraft(timelineDraft), [timelineDraft]);

  /** 若本节点尚无时间线，尝试从直接上游的智能剪辑读取（仅连入的那一个） */
  const upstreamTimeline = useMemo(
    () => (parsedTimeline && timelineHasClips(parsedTimeline) ? null : readUpstreamClipEditorTimeline(props.id, nodes, edges)),
    [parsedTimeline, edges, nodes, props.id],
  );

  const effectiveTimeline = (parsedTimeline && timelineHasClips(parsedTimeline) ? parsedTimeline : null) ?? upstreamTimeline;
  const hasEffectiveTimeline = timelineHasClips(effectiveTimeline);
  const [audioUrl, setAudioUrl] = useState((props.data?.episodeAudioUrl as string) ?? '');
  const [busy, setBusy] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>((props.data?.exportMode as ExportMode) ?? 'ffmpeg-episode');
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>((props.data?.selectedSpecs as string[]) ?? []);
  const multiEpisode = (props.data?.multiEpisode as boolean) ?? false;
  const [showHistory, setShowHistory] = useState(false);

  const exportHistory = (props.data?.exportHistory as Array<{
    at: string;
    mode: ExportMode;
    ok: boolean;
    url?: string;
    message?: string;
    manifestCsvUrl?: string;
    manifestPdfUrl?: string;
  }>) ?? [];

  const { task: hfTask, startPolling: startHfPolling, reset: resetHfPolling } = useTaskPoll();
  const currentTaskId = props.data?.hfTaskId as string | undefined;
  const hfRunning = hfTask.status === 'queued' || hfTask.status === 'rendering';

  useEffect(() => {
    if (currentTaskId && hfTask.status === 'idle') {
      startHfPolling(currentTaskId);
    }
  }, [currentTaskId, hfTask.status, startHfPolling]);

  useEffect(() => {
    if (hfTask.status === 'done' && hfTask.url) {
      updateNodeData(props.id, { episodeUrl: hfTask.url, status: 'success' });
      appendLog(`HF 渲染完成 · ${hfTask.url}`);
    }
    if (hfTask.status === 'error') {
      appendLog(`HF 渲染失败：${hfTask.message}`);
    }
  }, [hfTask.status, hfTask.url, hfTask.message, props.id, updateNodeData, appendLog]);

  const modeSourceHint = useMemo(() => {
    switch (exportMode) {
      case 'zip': return '需连接上游媒资节点';
      case 'ffmpeg-episode': return shots.length > 0 ? `使用故事板 ${shots.length} 镜` : '需故事板有镜头';
      case 'hyperframes-episode':
      case 'remotion-bundle': return hasEffectiveTimeline ? '使用时间线编排' : '需先编排时间线（智能剪辑）';
      case 'ecom-pack': return selectedSpecs.length > 0 ? `电商规格包导出 ${selectedSpecs.length} 个规格` : '请选择至少一个电商规格';
      default: return '';
    }
  }, [exportMode, hasEffectiveTimeline, shots.length, selectedSpecs.length]);

  const modeNeedsTimeline = exportMode === 'hyperframes-episode' || exportMode === 'remotion-bundle';

  const modeDisabled = useMemo(() => {
    if (exportMode === 'zip') return false;
    if (exportMode === 'ffmpeg-episode') return shots.length === 0;
    if (modeNeedsTimeline) return !hasEffectiveTimeline;
    if (exportMode === 'ecom-pack') return selectedSpecs.length === 0;
    return false;
  }, [exportMode, modeNeedsTimeline, hasEffectiveTimeline, shots.length, selectedSpecs.length]);

  const addHistoryEntry = useCallback((entry: { ok: boolean; url?: string; message?: string; manifestCsvUrl?: string; manifestPdfUrl?: string }) => {
    const history = [...exportHistory.slice(-9), { at: new Date().toISOString(), mode: exportMode, ...entry }];
    updateNodeData(props.id, { exportHistory: history });
  }, [exportHistory, exportMode, props.id, updateNodeData]);

  const openSmartEdit = useCallback(() => {
    const incoming = edges.filter((e) => e.target === props.id).map((e) => e.source);
    const clipNode =
      nodes.find((n) => n.type === 'clip-editor' && incoming.includes(n.id)) ??
      nodes.find((n) => n.type === 'clip-editor');
    if (!clipNode) {
      appendLog('画布上无智能剪辑节点');
      return;
    }
    fitView({ nodes: [{ id: clipNode.id }], duration: 300 });
    appendLog('已聚焦智能剪辑节点 · 请先编排时间线');
  }, [nodes, edges, fitView, appendLog, props.id]);

  const runExport = useCallback(async () => {
    // F-011: 缺前提不得假装成功；时间线模式引导回智能剪辑
    if (modeNeedsTimeline && !hasEffectiveTimeline) {
      updateNodeData(props.id, { status: 'error', message: '无有效时间线，无法导出成片' });
      addHistoryEntry({ ok: false, message: '无有效时间线' });
      appendLog('导出未通过：无有效时间线（请先在智能剪辑编排）');
      openSmartEdit();
      return;
    }
    if (exportMode === 'ffmpeg-episode' && shots.length === 0) {
      updateNodeData(props.id, { status: 'error', message: '故事板无镜头' });
      addHistoryEntry({ ok: false, message: '故事板无镜头' });
      appendLog('导出未通过：故事板无镜头');
      return;
    }

    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await runExportPack({
        mode: exportMode,
        prefix,
        audioUrl,
        multiEpisode,
        pictures: upstream?.pictures ?? [],
        clips: upstream?.clips ?? [],
        sounds: upstream?.sounds ?? [],
        prompts: upstream?.prompts ?? [],
        shots,
        timeline: effectiveTimeline,
      });
      if (!res.ok) {
        const st = res.message?.includes('blocked') ? 'blocked' : 'error';
        updateNodeData(props.id, { status: st, message: res.message });
        addHistoryEntry({ ok: false, message: res.message });
        appendLog(`导出未通过：${res.message}`);
        if (modeNeedsTimeline && res.message?.includes('时间线')) openSmartEdit();
        return;
      }
      const patch: Record<string, unknown> = {
        status: 'success',
        episodeUrl: res.url,
        lastExportAt: new Date().toISOString(),
        exportCount: res.exportCount,
        message: undefined,
      };
      if (exportMode === 'hyperframes-episode' && res.taskId) {
        patch.hfTaskId = res.taskId;
        resetHfPolling();
      }
      updateNodeData(props.id, patch);

      // F-015: 导出成功后生成清单 CSV/PDF
      const manifestUrls: { csvUrl?: string; pdfUrl?: string } = {};
      if (shots.length > 0) {
        const rows = shotsToManifestRows(shots);
        try {
          const csv = manifestToCsv(rows);
          const csvRes = await generateManifestCsv(csv, prefix);
          manifestUrls.csvUrl = csvRes.url;
          appendLog(`清单 CSV 已生成 · ${csvRes.url}`);
        } catch (csvErr) {
          appendLog(`清单 CSV 生成失败: ${String(csvErr)}`);
        }
        try {
          const pdfRes = await generateManifestPdf(rows, prefix);
          manifestUrls.pdfUrl = pdfRes.url;
          appendLog(`清单 PDF 已生成 · ${pdfRes.url}`);
        } catch (pdfErr) {
          appendLog(`清单 PDF 生成失败: ${String(pdfErr)}`);
        }
      }

      addHistoryEntry({
        ok: true,
        url: res.url,
        manifestCsvUrl: manifestUrls.csvUrl,
        manifestPdfUrl: manifestUrls.pdfUrl,
      });
      appendLog(`导出完成 · ${res.exportCount ? `${res.exportCount} 个文件` : res.url || ''}`);
    } catch (e) {
      const msg = String(e);
      updateNodeData(props.id, { status: 'error', error: msg });
      addHistoryEntry({ ok: false, message: msg });
      appendLog(`导出失败: ${msg}`);
    }
  }, [
    upstream,
    prefix,
    exportMode,
    multiEpisode,
    shots,
    audioUrl,
    effectiveTimeline,
    props.id,
    updateNodeData,
    appendLog,
    addHistoryEntry,
    resetHfPolling,
    modeNeedsTimeline,
    hasEffectiveTimeline,
    openSmartEdit,
  ]);

  /** F-015: 从历史中重试失败导出 */
  const retryExport = useCallback((mode: ExportMode) => {
    setExportMode(mode);
    updateNodeData(props.id, { exportMode: mode });
    appendLog(`切换到模式 ${mode}，点击导出按钮重试`);
  }, [props.id, updateNodeData, appendLog]);

  const composeEpisode = useCallback(async () => {
    if (shots.length === 0) {
      appendLog('单集合成：故事板无镜头');
      return;
    }
    setBusy(true);
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.concatEpisode({
        shots,
        requireApproved: true,
        title: prefix,
        audioUrl: audioUrl.trim() || undefined,
      });
      if (!res.ok) {
        updateNodeData(props.id, {
          status: res.status === 'blocked' ? 'blocked' : 'error',
          episodeUrl: undefined,
          message: res.message,
        });
        appendLog(`单集合成未通过：${res.message ?? res.status}`);
        return;
      }
      updateNodeData(props.id, { status: 'success', episodeUrl: res.url, message: undefined });
      appendLog(`竖屏单集合成完成 · ${res.url}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`单集合成失败: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [shots, prefix, audioUrl, props.id, updateNodeData, appendLog]);

  const exportLabel = resolveRunLabel('export-pack').primary;

  return (
    <BlockShell {...props}>
      <div className="ep-card nodrag nopan">
        <div className="ep-card__toolbar">
          <span className="ep-card__status">交付打包 · 出片</span>
          <span className="ep-card__counts">
            {shots.length > 0 ? `${shots.length} 镜` : ''}
            {hasEffectiveTimeline ? ' · 有时间线' : ' · 无时间线'}
            {storyboardVersion && storyboardVersion >= 3 ? ' · 门禁开' : ''}
            {props.data?.syncedFrom ? ' · 来自智能剪辑' : ''}
          </span>
        </div>
        <div className="space-y-2 text-xs">
          <p className="rounded-lg border border-line/60 bg-surface/40 px-2 py-1.5 text-[10px] text-ink/55 leading-relaxed">
            编排请在<strong className="text-ink/70">智能剪辑</strong>完成；本节点只负责<strong className="text-ink/70">导出成片</strong>。
          </p>
          <input
            value={prefix}
            onChange={(e) => updateNodeData(props.id, { exportPrefix: e.target.value })}
            placeholder="文件前缀"
            className="w-full rounded-lg border border-line px-2 py-1 font-mono text-[10px]"
          />
          <p className="text-[10px] text-ink/50">
            {upstream?.pictures?.length ?? 0} 图 · {upstream?.clips?.length ?? 0} 视频 ·{' '}
            {upstream?.sounds?.length ?? 0} 音频
          </p>
          {lastExport && (
            <p className="text-[10px] text-brand/70">上次导出 {new Date(lastExport).toLocaleString()}</p>
          )}
          <div className="flex gap-1">
            {([
              { id: 'zip' as const, label: 'ZIP' },
              { id: 'ffmpeg-episode' as const, label: 'FFmpeg' },
              { id: 'hyperframes-episode' as const, label: 'HyperFrames' },
              { id: 'remotion-bundle' as const, label: 'Remotion' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setExportMode(id);
                  updateNodeData(props.id, { exportMode: id });
                }}
                className={`flex-1 text-[9px] py-1 rounded-md border ${
                  exportMode === id
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-line text-ink/50 hover:border-brand/30'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-ink/40">{modeSourceHint}</p>
          <label className="flex items-center gap-2 text-[10px] text-ink/50 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={multiEpisode}
              onChange={(e) => updateNodeData(props.id, { multiEpisode: e.target.checked })}
            />
            多集打包（含当前集所有可用镜头）
          </label>
          <button
            type="button"
            onClick={() => void runExport()}
            disabled={modeDisabled || busy || hfRunning}
            className="w-full rounded-xl bg-brand text-white py-2 disabled:opacity-50"
          >
            {exportMode === 'zip'
              ? '打包下载 ZIP'
              : exportMode === 'ffmpeg-episode'
                ? 'FFmpeg 快速成片'
                : exportMode === 'hyperframes-episode'
                  ? 'HF 精美渲染'
                  : exportLabel}
          </button>
          {hfRunning && (
            <div className="w-full rounded-xl border border-warn/30 bg-warn/5 text-warn py-1.5 text-[10px] text-center">
              HF 渲染中… {hfTask.status === 'queued' ? '排队中' : '渲染中'}
              <button type="button" className="ml-2 underline" onClick={resetHfPolling}>重置</button>
              <button
                type="button"
                className="ml-2 underline text-warn"
                onClick={async () => {
                  if (currentTaskId) {
                    await fetch(`/api/montage/tasks/${currentTaskId}`, { method: 'DELETE' });
                    appendLog('HF 渲染已取消');
                    resetHfPolling();
                  }
                }}
              >
                取消
              </button>
            </div>
          )}
          {hfTask.status === 'done' && hfTask.url && (
            <div className="w-full rounded-xl border border-ok/30 bg-ok/5 text-ok py-1.5 text-[10px] text-center">
              HF 渲染完成
              <a href={hfTask.url} target="_blank" rel="noopener" className="ml-2 underline">查看</a>
            </div>
          )}
          <button
            type="button"
            onClick={openSmartEdit}
            className="w-full rounded-xl border border-line text-ink/70 py-1.5 text-[10px]"
          >
            打开智能剪辑（编排）
          </button>
          {modeDisabled && (
            <p className="text-[10px] text-warn">
              当前模式不符合前提条件（{modeSourceHint}）。可先在智能剪辑编排时间线或连接媒资上游。
            </p>
          )}
          {exportMode === 'ecom-pack' && (
            <div className="mt-2 flex flex-col gap-1">
              <p className="text-[9px] text-ink/50">选择导出规格：</p>
              {ECOM_ALL_SPECS.map((spec) => (
                <label key={spec.specId} className="flex items-center gap-2 text-[9px]">
                  <input
                    type="checkbox"
                    checked={selectedSpecs.includes(spec.specId)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selectedSpecs, spec.specId]
                        : selectedSpecs.filter((s) => s !== spec.specId);
                      setSelectedSpecs(next);
                      updateNodeData(props.id, { selectedSpecs: next });
                    }}
                  />
                  <span>{spec.label} ({spec.width}×{spec.height})</span>
                  <span className="text-ink/30">{spec.description}</span>
                </label>
              ))}
            </div>
          )}
          {exportHistory.length > 0 && (
            <div className="border-t border-line pt-2">
              <button
                type="button"
                className="text-[10px] text-ink/50 flex items-center gap-1"
                onClick={() => setShowHistory((v) => !v)}
              >
                导出历史（{exportHistory.length}）{showHistory ? '▾' : '▸'}
              </button>
              {showHistory && (
                <div className="mt-1 space-y-1 max-h-48 overflow-auto">
                  {[...exportHistory].reverse().map((h, i) => (
                    <div key={i} className={`text-[9px] flex flex-col gap-0.5 ${h.ok ? 'text-ink/50' : 'text-warn'} py-0.5`}>
                      <div className="flex items-center gap-2">
                        <span className="shrink-0">{new Date(h.at).toLocaleString().slice(5, 16)}</span>
                        <span className="shrink-0">{h.mode}</span>
                        <span className="shrink-0">{h.ok ? 'OK' : 'FAIL'}</span>
                        {!h.ok && (
                          <button
                            type="button"
                            className="rounded border border-warn/40 px-1 py-0 text-[8px] text-warn hover:bg-warn/10"
                            onClick={() => retryExport(h.mode)}
                          >
                            重试
                          </button>
                        )}
                        {h.url ? <span className="truncate min-w-0 text-ink/40" title={h.url}>{h.url.slice(0, 24)}</span> : null}
                        {h.message ? <span className="truncate min-w-0" title={h.message}>{h.message}</span> : null}
                      </div>
                      {(h.manifestCsvUrl || h.manifestPdfUrl) && (
                        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-line/40">
                          {h.manifestCsvUrl && (
                            <a href={h.manifestCsvUrl} target="_blank" rel="noopener" className="text-[8px] text-brand underline underline-offset-2">
                              清单CSV
                            </a>
                          )}
                          {h.manifestPdfUrl && (
                            <a href={h.manifestPdfUrl} target="_blank" rel="noopener" className="text-[8px] text-brand underline underline-offset-2">
                              清单PDF
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="border-t border-line pt-2 space-y-2">
            <p className="text-[10px] text-ink/55">竖屏单集合成（9:16，串联审阅门控）</p>
            <input
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="混音音频 URL（可空，保留原视频音轨）"
              className="w-full rounded-lg border border-line px-2 py-1 font-mono text-[10px]"
            />
            <button
              type="button"
              onClick={() => void composeEpisode()}
              disabled={busy}
              className="w-full rounded-xl border border-brand/30 bg-brand/5 text-brand py-2 disabled:opacity-50"
            >
              {busy ? '合成中…' : '合成竖屏单集'}
            </button>
            {episodeUrl && (
            <video src={episodeUrl} controls className="w-full rounded-lg max-h-40" />
          )}
          {props.data?.message as string | undefined && (
            <p className="text-[10px] text-warn">{props.data.message as string}</p>
          )}
          </div>
        </div>
      </div>
    </BlockShell>
  );
}

export default memo(ExportPackBlock);
