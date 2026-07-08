import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function SubtitleBurnBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { clips?: string[]; prompts?: string[] } | undefined;
  const subtitle = (props.data?.subtitle as string) ?? upstream?.prompts?.[0] ?? '';
  const durationSec = (props.data?.durationSec as number) ?? 4;
  const outputUrl = props.data?.outputClip as string | undefined;

  const run = useCallback(async () => {
    const clip = upstream?.clips?.[0];
    if (!clip) {
      appendLog('字幕烧录：需要上游视频');
      return;
    }
    if (!subtitle.trim()) {
      appendLog('字幕烧录：字幕文本为空');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.renderShotMp4({
        videoUrl: clip,
        subtitle: subtitle.trim(),
        durationSec,
        skipReview: true,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? '烧录失败');
      updateNodeData(props.id, {
        status: 'success',
        outputClip: res.url,
        clips: [res.url],
        content: subtitle,
      });
      appendLog('字幕烧录完成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [upstream?.clips, subtitle, durationSec, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <textarea
          value={subtitle}
          onChange={(e) => updateNodeData(props.id, { subtitle: e.target.value })}
          placeholder="字幕文本…"
          className="w-full min-h-[56px] rounded-xl border border-line px-2 py-1.5 resize-y"
        />
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          时长(s)
          <input
            type="number"
            min={1}
            max={120}
            value={durationSec}
            onChange={(e) => updateNodeData(props.id, { durationSec: Number(e.target.value) || 4 })}
            className="w-16 rounded border border-line px-1 py-0.5"
          />
        </label>
        {outputUrl && (
          <video src={outputUrl} controls className="w-full rounded-lg border border-line max-h-24" />
        )}
        <button type="button" onClick={() => void run()} className="w-full rounded-xl bg-brand text-white py-2">
          烧录字幕
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(SubtitleBurnBlock);
