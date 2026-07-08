import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function ClipEditorBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { clips?: string[] } | undefined;
  const clips = [
    ...(upstream?.clips ?? []),
    ...((props.data?.extraClips as string[]) ?? []),
  ].filter(Boolean);
  const outputUrl = (props.data?.outputUrl as string) || (props.data?.videoUrl as string);
  const status = props.data?.status as string | undefined;

  const compose = useCallback(async () => {
    if (clips.length === 0) {
      appendLog('视频剪辑：无片段');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.concatClips(clips, (props.data?.title as string) || '画布剪辑');
      if (!res.ok || !res.url) throw new Error(res.message ?? '合成失败');
      updateNodeData(props.id, {
        status: 'success',
        videoUrl: res.url,
        outputUrl: res.url,
        clipCount: clips.length,
      });
      appendLog(`视频剪辑完成 · ${clips.length} 段`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`视频剪辑失败: ${String(e)}`);
    }
  }, [clips, props.data, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <input
          value={(props.data?.title as string) ?? ''}
          onChange={(e) => updateNodeData(props.id, { title: e.target.value })}
          placeholder="合成标题"
          className="w-full rounded-lg border border-line px-2 py-1"
        />
        <p className="text-ink/50">片段数: {clips.length}</p>
        <ul className="max-h-24 overflow-y-auto nx9-scroll space-y-1">
          {clips.map((u) => (
            <li key={u} className="truncate font-mono text-[10px] text-ink/60">
              {u}
            </li>
          ))}
        </ul>
        {outputUrl && (
          <video src={outputUrl} controls className="w-full rounded-lg max-h-32 bg-black" />
        )}
        <button
          type="button"
          onClick={() => void compose()}
          disabled={status === 'running' || clips.length === 0}
          className="w-full rounded-xl bg-brand text-white py-2 disabled:opacity-50"
        >
          {status === 'running' ? '合成中…' : '拼接导出'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(ClipEditorBlock);
