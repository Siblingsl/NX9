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

const EDITOR_MODES = [
  { id: 'concat', label: '拼接' },
  { id: 'audio', label: '混音' },
  { id: 'grade', label: '调色' },
] as const;

function ClipEditorBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const toast = useToast();
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const setStudioOpen = useRemotionUi((s) => s.setOpen);
  const upstream = props.data?.upstream as {
    clips?: string[];
    sounds?: string[];
    pictures?: string[];
  } | undefined;
  const editorMode = (props.data?.editorMode as string) ?? 'concat';
  const clips = [
    ...(upstream?.clips ?? []),
    ...((props.data?.extraClips as string[]) ?? []),
  ].filter(Boolean);
  const sounds = [
    ...(upstream?.sounds ?? []),
    ...((props.data?.extraSounds as string[]) ?? []),
  ].filter(Boolean);
  const outputUrl = (props.data?.outputUrl as string) || (props.data?.videoUrl as string);
  const status = props.data?.status as string | undefined;
  const transition = (props.data?.transition as string) ?? 'none';
  const brightness = (props.data?.brightness as number) ?? 0;
  const contrast = (props.data?.contrast as number) ?? 1;
  const saturation = (props.data?.saturation as number) ?? 1;
  const normalize = (props.data?.normalize as boolean | undefined) ?? true;

  const loadFromStoryboard = useCallback(() => {
    const withVideo = shots
      .filter((s) => s.videoAssetId)
      .sort((a, b) => a.index - b.index)
      .map((s) => s.videoAssetId!);
    if (withVideo.length === 0) {
      appendLog('故事板无已完成镜头视频');
      return;
    }
    updateNodeData(props.id, { extraClips: withVideo, editorMode: 'concat' });
    appendLog(`已从故事板导入 ${withVideo.length} 个镜头视频`);
  }, [shots, props.id, updateNodeData, appendLog]);

  const compose = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
    try {
      if (editorMode === 'audio') {
        if (sounds.length < 2) {
          appendLog('混音：至少需要 2 条音频（上游或手动）');
          updateNodeData(props.id, { status: 'error', error: '混音需要 ≥2 轨音频' });
          return;
        }
        const res = await api.mixAudio(sounds, normalize);
        if (!res.ok || !res.url) throw new Error(res.message ?? '混音失败');
        updateNodeData(props.id, {
          status: 'success',
          outputSound: res.url,
          sounds: [res.url],
          meta: { trackCount: res.trackCount },
        });
        appendLog(`混音完成 · ${res.trackCount ?? sounds.length} 轨`);
        return;
      }

      if (editorMode === 'grade') {
        const source = clips[0] ?? upstream?.pictures?.[0];
        if (!source) {
          appendLog('调色：需要上游视频或图像');
          updateNodeData(props.id, { status: 'error', error: '缺少源媒体' });
          return;
        }
        const res = await api.colorGrade({
          sourceUrl: source,
          brightness,
          contrast,
          saturation,
        });
        if (!res.ok || !res.url) throw new Error(res.message ?? '调色失败');
        updateNodeData(props.id, {
          status: 'success',
          outputUrl: res.url,
          previewUrl: res.url,
          videoUrl: clips[0] ? res.url : undefined,
        });
        appendLog('调色完成');
        return;
      }

      // concat
      if (clips.length === 0) {
        appendLog('视频剪辑：无片段');
        updateNodeData(props.id, { status: 'error', error: '无片段' });
        return;
      }
      const res = await api.concatClips(
        clips,
        (props.data?.title as string) || '画布剪辑',
        transition === 'none' ? undefined : transition,
      );
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
  }, [
    clips,
    sounds,
    editorMode,
    normalize,
    brightness,
    contrast,
    saturation,
    transition,
    upstream?.pictures,
    props.data,
    props.id,
    updateNodeData,
    appendLog,
    toast,
  ]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <div className="flex gap-1 flex-wrap">
          {EDITOR_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => updateNodeData(props.id, { editorMode: m.id })}
              className={`nodrag nopan text-[10px] px-2 py-0.5 rounded-full border ${
                editorMode === m.id
                  ? 'bg-brand/10 text-brand border-brand/30'
                  : 'border-line text-ink/50 hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {editorMode === 'concat' && (
          <>
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
              从故事板导入已出片镜头
            </button>
          </>
        )}

        {editorMode === 'audio' && (
          <>
            <p className="text-ink/50">音频轨: {sounds.length}（需 ≥2）</p>
            <label className="flex items-center gap-2 text-[10px] text-ink/60">
              <input
                type="checkbox"
                checked={normalize}
                onChange={(e) => updateNodeData(props.id, { normalize: e.target.checked })}
              />
              响度归一
            </label>
          </>
        )}

        {editorMode === 'grade' && (
          <>
            <p className="text-ink/50">源: {clips[0] || upstream?.pictures?.[0] ? '已连接' : '无'}</p>
            {(
              [
                ['brightness', '亮度', brightness, -1, 1, 0.05],
                ['contrast', '对比', contrast, 0.5, 2, 0.05],
                ['saturation', '饱和', saturation, 0, 2, 0.05],
              ] as const
            ).map(([key, label, value, min, max, step]) => (
              <label key={key} className="flex items-center gap-2 text-[10px]">
                <span className="w-8 text-ink/50">{label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  onChange={(e) =>
                    updateNodeData(props.id, { [key]: Number(e.target.value) })
                  }
                  className="flex-1 accent-brand"
                />
                <span className="w-8 text-right font-mono text-ink/60">{Number(value).toFixed(2)}</span>
              </label>
            ))}
          </>
        )}

        {outputUrl && editorMode !== 'audio' && (
          <video src={outputUrl} controls className="w-full rounded-lg max-h-28" />
        )}
        {(props.data?.outputSound as string | undefined) && editorMode === 'audio' && (
          <audio
            src={props.data.outputSound as string}
            controls
            className="w-full"
          />
        )}

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void compose()}
            disabled={status === 'running'}
            className="flex-1 rounded-xl bg-brand text-white py-1.5 disabled:opacity-50"
          >
            {status === 'running'
              ? '处理中…'
              : editorMode === 'audio'
                ? '混音'
                : editorMode === 'grade'
                  ? '调色'
                  : '拼接导出'}
          </button>
          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="rounded-xl border border-line px-2"
            title="打开成片工作室"
          >
            <Film size={14} />
          </button>
        </div>
      </div>
    </BlockShell>
  );
}

export default memo(ClipEditorBlock);
