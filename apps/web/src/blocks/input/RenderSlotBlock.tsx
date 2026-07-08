import { memo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

function RenderSlotBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const slotPrompt = (props.data?.slotPrompt as string) ?? '';
  const filledUrl =
    (props.data?.filledUrl as string) ||
    (props.data?.previewUrl as string) ||
    (props.data?.videoUrl as string);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-ink/50">预设 AI 结果落位框 — 连接上游后自动填充</p>
        <textarea
          value={slotPrompt}
          onChange={(e) => updateNodeData(props.id, { slotPrompt: e.target.value })}
          placeholder="目标提示词 / 说明"
          className="w-full min-h-[56px] rounded-xl border border-dashed border-brand/40 px-2 py-1.5"
        />
        <div
          className={`min-h-[88px] rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden ${
            filledUrl ? 'border-ok bg-ok/5' : 'border-line bg-surface'
          }`}
        >
          {filledUrl ? (
            filledUrl.match(/\.(mp4|webm|mov)(\?|$)/i) ? (
              <video src={filledUrl} controls className="w-full max-h-32" />
            ) : (
              <img src={filledUrl} alt="" className="w-full max-h-32 object-cover" />
            )
          ) : (
            <span className="text-ink/40">等待填充</span>
          )}
        </div>
      </div>
    </BlockShell>
  );
}

export default memo(RenderSlotBlock);
