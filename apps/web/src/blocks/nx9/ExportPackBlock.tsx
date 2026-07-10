import { memo, useCallback, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { runExportPack } from '../../engine/export-pack-runner';
import { api } from '../../api/client';

type ExportMode = 'zip' | 'ffmpeg-episode' | 'hyperframes-episode' | 'remotion-bundle';

function ExportPackBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const upstream = props.data?.upstream as {
    pictures?: string[];
    clips?: string[];
    sounds?: string[];
    prompts?: string[];
  } | undefined;
  const prefix = (props.data?.exportPrefix as string) ?? 'nx9-shot';
  const lastExport = props.data?.lastExportAt as string | undefined;
  const episodeUrl = props.data?.episodeUrl as string | undefined;
  const [audioUrl, setAudioUrl] = useState((props.data?.episodeAudioUrl as string) ?? '');
  const [busy, setBusy] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>((props.data?.exportMode as ExportMode) ?? 'zip');

  const runExport = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await runExportPack({
        mode: exportMode,
        prefix,
        audioUrl,
        pictures: upstream?.pictures ?? [],
        clips: upstream?.clips ?? [],
        sounds: upstream?.sounds ?? [],
        prompts: upstream?.prompts ?? [],
        shots,
      });
      if (!res.ok) {
        updateNodeData(props.id, { status: res.message?.includes('blocked') ? 'blocked' : 'error', message: res.message });
        appendLog(`导出未通过：${res.message}`);
        return;
      }
      updateNodeData(props.id, {
        status: 'success',
        episodeUrl: res.url,
        lastExportAt: new Date().toISOString(),
        exportCount: res.exportCount,
        message: undefined,
      });
      appendLog(`导出完成 · ${res.exportCount ? `${res.exportCount} 个文件` : res.url || ''}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`导出失败: ${String(e)}`);
    }
  }, [upstream, prefix, exportMode, shots, audioUrl, props.id, updateNodeData, appendLog]);

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
      <div className="space-y-2 nodrag nopan text-xs">
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
        <button type="button" onClick={() => void runExport()} className="w-full rounded-xl bg-brand text-white py-2">
          {exportMode === 'zip' ? '打包下载 ZIP' : exportMode === 'ffmpeg-episode' ? 'FFmpeg 快速成片' : exportMode === 'hyperframes-episode' ? 'HF 精美渲染' : 'Remotion 工程包'}
        </button>
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
    </BlockShell>
  );
}

export default memo(ExportPackBlock);
