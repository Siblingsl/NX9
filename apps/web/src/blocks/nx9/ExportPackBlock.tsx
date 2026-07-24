import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { runExportPack } from '../../engine/export-pack-runner';
import { useTaskPoll } from '../../hooks/use-task-poll';
import { api } from '../../api/client';

type ExportMode = 'zip' | 'ffmpeg-episode' | 'hyperframes-episode' | 'remotion-bundle';

function ExportPackBlock(props: NodeProps) {
  const { updateNodeData, fitView } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const nodes = useNodes();
  const edges = useEdges();
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
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
  const timelineDraft = props.data?.timelineDraft as string | undefined;
  const hasTimeline = Boolean(timelineDraft);
  const [audioUrl, setAudioUrl] = useState((props.data?.episodeAudioUrl as string) ?? '');
  const [busy, setBusy] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>((props.data?.exportMode as ExportMode) ?? 'ffmpeg-episode');
  const multiEpisode = (props.data?.multiEpisode as boolean) ?? false;
  const [showHistory, setShowHistory] = useState(false);

  const exportHistory = (props.data?.exportHistory as Array<{
    at: string;
    mode: ExportMode;
    ok: boolean;
    url?: string;
    message?: string;
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
      case 'ffmpeg-episode': return `使用故事板 ${shots.length} 镜`;
      case 'hyperframes-episode':
      case 'remotion-bundle': return hasTimeline ? '使用时间线编排' : '需先编排时间线（智能剪辑）';
      default: return '';
    }
  }, [exportMode, hasTimeline, shots.length]);

  const modeDisabled = useMemo(() => {
    if (exportMode === 'zip') return false;
    if (exportMode === 'ffmpeg-episode') return shots.length === 0;
    if (exportMode === 'hyperframes-episode' || exportMode === 'remotion-bundle') return !hasTimeline;
    return false;
  }, [exportMode, hasTimeline, shots.length]);

  const addHistoryEntry = useCallback((entry: { ok: boolean; url?: string; message?: string }) => {
    const history = [...exportHistory.slice(-9), { at: new Date().toISOString(), mode: exportMode, ...entry }];
    updateNodeData(props.id, { exportHistory: history });
  }, [exportHistory, exportMode, props.id, updateNodeData]);

  const runExport = useCallback(async () => {
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
      });
      if (!res.ok) {
        const st = res.message?.includes('blocked') ? 'blocked' : 'error';
        updateNodeData(props.id, { status: st, message: res.message });
        addHistoryEntry({ ok: false, message: res.message });
        appendLog(`导出未通过：${res.message}`);
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
      addHistoryEntry({ ok: true, url: res.url });
      appendLog(`导出完成 · ${res.exportCount ? `${res.exportCount} 个文件` : res.url || ''}`);
    } catch (e) {
      const msg = String(e);
      updateNodeData(props.id, { status: 'error', error: msg });
      addHistoryEntry({ ok: false, message: msg });
      appendLog(`导出失败: ${msg}`);
    }
  }, [upstream, prefix, exportMode, multiEpisode, shots, audioUrl, props.id, updateNodeData, appendLog, addHistoryEntry, resetHfPolling]);

  const openSmartEdit = useCallback(() => {
    const clipNode = nodes.find((n) => n.type === 'clip-editor');
    if (!clipNode) {
      appendLog('画布上无智能剪辑节点');
      return;
    }
    fitView({ nodes: [{ id: clipNode.id }], duration: 300 });
    appendLog('已聚焦智能剪辑节点');
  }, [nodes, fitView, appendLog]);

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

  return (
    <BlockShell {...props}>
      <div className="ep-card nodrag nopan">
        <div className="ep-card__toolbar">
          <span className="ep-card__status">交付打包</span>
          <span className="ep-card__counts">
            {shots.length > 0 ? `${shots.length} 镜` : ''}
            {timelineDraft ? ' · 有时间线' : ' · 无时间线'}
            {storyboardVersion && storyboardVersion >= 3 ? ' · 门禁开' : ''}
            {props.data?.syncedFrom ? ' · 来自智能剪辑' : ''}
          </span>
        </div>
        <div className="space-y-2 text-xs">
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
            {exportMode === 'zip' ? '打包下载 ZIP' : exportMode === 'ffmpeg-episode' ? 'FFmpeg 快速成片' : exportMode === 'hyperframes-episode' ? 'HF 精美渲染' : 'Remotion 工程包'}
          </button>
          {hfRunning && (
            <div className="w-full rounded-xl border border-warn/30 bg-warn/5 text-warn py-1.5 text-[10px] text-center">
              HF 渲染中… {hfTask.status === 'queued' ? '排队中' : '渲染中'}
              <button type="button" className="ml-2 underline" onClick={resetHfPolling}>重置</button>
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
            打开智能剪辑
          </button>
          {modeDisabled && (
            <p className="text-[10px] text-warn">当前模式不符合前提条件（{modeSourceHint}）。可先在智能剪辑编排时间线或连接媒资上游。</p>
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
                <div className="mt-1 space-y-1 max-h-32 overflow-auto">
                  {[...exportHistory].reverse().map((h, i) => (
                    <div key={i} className={`text-[9px] flex items-center gap-2 ${h.ok ? 'text-ink/50' : 'text-warn'}`}>
                      <span className="shrink-0">{new Date(h.at).toLocaleString().slice(5, 16)}</span>
                      <span className="shrink-0">{h.mode}</span>
                      <span className="shrink-0">{h.ok ? '✓' : '✗'}</span>
                      {h.url ? <span className="truncate min-w-0 text-ink/40" title={h.url}>{h.url.slice(0, 28)}</span> : null}
                      {h.message ? <span className="truncate min-w-0" title={h.message}>{h.message}</span> : null}
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
