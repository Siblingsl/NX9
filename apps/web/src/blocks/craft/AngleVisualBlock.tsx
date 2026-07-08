import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { ANGLE_PRESETS } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function AngleVisualBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const angleId = (props.data?.angleId as string) ?? 'three-quarter';
  const subject = (props.data?.subject as string) ?? '';
  const upstream = props.data?.upstream as { pictures?: string[]; prompts?: string[] } | undefined;
  const refUrl = upstream?.pictures?.[0];
  const stored = props.data?.content as string | undefined;

  const angle = useMemo(
    () => ANGLE_PRESETS.find((a) => a.id === angleId) ?? ANGLE_PRESETS[1],
    [angleId],
  );

  const composed = useMemo(() => {
    const base = subject || upstream?.prompts?.[0] || '';
    return [base, angle.prompt].filter(Boolean).join(', ');
  }, [subject, upstream, angle.prompt]);

  const syncContent = useCallback(
    (text: string) => updateNodeData(props.id, { content: text, output: text }),
    [props.id, updateNodeData],
  );

  const reverseFromImage = useCallback(async () => {
    if (!refUrl) {
      appendLog('多角度：缺少参考图');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.reversePrompt(refUrl);
      const text = [res.prompt.slice(0, 120), angle.prompt].join(', ');
      updateNodeData(props.id, { status: 'success', subject: res.prompt.slice(0, 120), content: text, output: text });
      appendLog('已从参考图反推主体描述');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [refUrl, angle.prompt, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <label className="block text-ink/60">
          机位
          <select
            value={angleId}
            onChange={(e) => {
              const id = e.target.value;
              const a = ANGLE_PRESETS.find((x) => x.id === id) ?? ANGLE_PRESETS[1];
              updateNodeData(props.id, { angleId: id });
              syncContent([subject || upstream?.prompts?.[0] || '', a.prompt].filter(Boolean).join(', '));
            }}
            className="mt-0.5 w-full rounded-lg border border-line px-2 py-1 bg-white"
          >
            {ANGLE_PRESETS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <input
          value={subject}
          onChange={(e) => {
            const val = e.target.value;
            updateNodeData(props.id, { subject: val });
            syncContent([val || upstream?.prompts?.[0] || '', angle.prompt].filter(Boolean).join(', '));
          }}
          placeholder="主体描述（可留空用上游）"
          className="w-full rounded-xl border border-line px-2 py-1.5"
        />
        {refUrl && (
          <img src={refUrl} alt="" className="w-full rounded-lg border border-line max-h-20 object-cover" />
        )}
        <button type="button" onClick={() => void reverseFromImage()} className="w-full rounded-xl border border-line py-1.5">
          从参考图反推主体
        </button>
        <p className="text-[10px] font-mono text-ink/70 line-clamp-3">{stored || composed}</p>
      </div>
    </BlockShell>
  );
}

export default memo(AngleVisualBlock);
