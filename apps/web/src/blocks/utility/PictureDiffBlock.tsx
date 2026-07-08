import { memo, useMemo, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

function PictureDiffBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const leftUrl = (props.data?.leftUrl as string) || upstream?.pictures?.[0];
  const rightUrl = (props.data?.rightUrl as string) || upstream?.pictures?.[1];
  const [slider, setSlider] = useState((props.data?.slider as number) ?? 50);

  const mode = (props.data?.mode as string) ?? 'slider';

  const displayLeft = leftUrl;
  const displayRight = rightUrl;

  const onSlider = (v: number) => {
    setSlider(v);
    updateNodeData(props.id, { slider: v });
  };

  const missing = useMemo(() => !displayLeft || !displayRight, [displayLeft, displayRight]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => updateNodeData(props.id, { mode: 'slider' })}
            className={`flex-1 rounded-lg py-1 border ${mode === 'slider' ? 'border-brand bg-brand/5 text-brand' : 'border-line'}`}
          >
            滑杆对比
          </button>
          <button
            type="button"
            onClick={() => updateNodeData(props.id, { mode: 'side' })}
            className={`flex-1 rounded-lg py-1 border ${mode === 'side' ? 'border-brand bg-brand/5 text-brand' : 'border-line'}`}
          >
            并排
          </button>
        </div>

        {missing ? (
          <p className="text-ink/50 text-center py-6">连接 2 张上游图片，或设置 leftUrl / rightUrl</p>
        ) : mode === 'side' ? (
          <div className="grid grid-cols-2 gap-1">
            <img src={displayLeft} alt="A" className="rounded-lg border border-line aspect-square object-cover" />
            <img src={displayRight} alt="B" className="rounded-lg border border-line aspect-square object-cover" />
          </div>
        ) : (
          <div className="relative rounded-lg overflow-hidden border border-line aspect-video bg-surface">
            <img src={displayRight} alt="B" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${slider}%` }}>
              <img
                src={displayLeft}
                alt="A"
                className="h-full object-cover"
                style={{ width: `${100 / (slider / 100)}%`, maxWidth: 'none' }}
              />
            </div>
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-brand shadow"
              style={{ left: `${slider}%` }}
            />
          </div>
        )}

        {mode === 'slider' && !missing && (
          <input
            type="range"
            min={0}
            max={100}
            value={slider}
            onChange={(e) => onSlider(Number(e.target.value))}
            className="w-full accent-brand"
          />
        )}
      </div>
    </BlockShell>
  );
}

export default memo(PictureDiffBlock);
