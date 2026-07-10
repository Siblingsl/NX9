import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Film } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { useToast } from '../../stores/toast';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useRemotionUi } from '../../stores/flow-runtime';

const TRANSITIONS = [
  { id: 'none', label: '无' },
  { id: 'dissolve', label: '溶解' },
  { id: 'fade', label: '淡入淡出' },
  { id: 'wipe', label: '划变' },
  { id: 'match-cut', label: '匹配剪辑' },
] as const;

function ClipEditorBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const toast = useToast();
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const setStudioOpen = useRemotionUi((s) => s.setOpen);
  const upstream = props.data?.upstream as { clips?: string[] } | undefined;
  const clips = [
    ...(upstream?.clips ?? []),
    ...((props.data?.extraClips as string[]) ?? []),
  ].filter(Boolean);
  const outputUrl = (props.data?.outputUrl as string) || (props.data?.videoUrl as string);
  const status = props.data?.status as string | undefined;
  const transition = (props.data?.transition as string) ?? 'none';

  const loadFromStoryboard = useCallback(() => {
    const withVideo = shots
      .filter((s) => s.videoAssetId)
      .sort((a, b) => a.index - b.index)
      .map((s) => s.videoAssetId!);
    if (withVideo.length === 0) {
      appendLog('故事板无已完成镜头');
      return;
    }
    updateNodeData(props.id, { extraClips: withVideo });
    appendLog(`已从故事板导入 ${withVideo.length} 个镜头`);
  }, [shots, props.id, updateNodeData, appendLog]);

  const compose = useCallback(async () => {
    if (clips.length === 0) {
      appendLog('视频剪辑：无片段');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.concatClips(clips, (props.data?.title as string) || '画布剪辑', transition === 'none' ? undefined : transition);
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
      toast.push({ message: `视频剪辑失败: ${String(e)}`, variant: 'error' });
      appendLog(`视频剪辑失败: ${String(e)}`);
    }
  }, [clips, props.data, props.id, updateNodeData, appendLog, toast]);

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
        <div className="flex gap-1 flex-wrap">
          {TRANSITIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateNodeData(props.id, { transition: t.id })}
              className={`nodrag nopan text-[9px] px-2 py-0.5 rounded-full border transition-colors ${
                transition === t.id
                  ? 'bg-brand/10 text-brand border-brand/30'
                  : 'border-line text-ink/50 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={loadFromStoryboard}
          className="text-[10px] text-brand/70 hover:text-brand"
        >
          从故事板导入 ({shots.filter((s) => s.videoAssetId).length} 个有视频)
        </button>
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
        {outputUrl && (
          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="w-full flex items-center justify-center gap-1 rounded-xl border border-line py-2 text-xs hover:border-brand/40"
          >
            <Film size={14} />
            发送到 Episode Studio
          </button>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(ClipEditorBlock);
