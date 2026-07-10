import { memo, useMemo, useState, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

function PictureDiffBlock(props: NodeProps) {
  const { updateNodeData, setNodes } = useReactFlow();
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const imageA = (props.data?.imageA as string) || upstream?.pictures?.[0] || '';
  const imageB = (props.data?.imageB as string) || upstream?.pictures?.[1] || '';
  const [slider, setSlider] = useState((props.data?.slider as number) ?? 50);
  const [diffOpacity, setDiffOpacity] = useState((props.data?.diffOpacity as number) ?? 50);
  const [approved, setApproved] = useState(Boolean(props.data?.approved));
  const [rejected, setRejected] = useState(Boolean(props.data?.rejected));

  const mode = (props.data?.mode as string) ?? 'slider';
  const diffMode = (props.data?.diffMode as string) ?? 'none';

  const hasBoth = imageA && imageB;

  const onSlider = useCallback(
    (v: number) => {
      setSlider(v);
      updateNodeData(props.id, { slider: v });
    },
    [updateNodeData, props.id],
  );

  const onDiffOpacity = useCallback(
    (v: number) => {
      setDiffOpacity(v);
      updateNodeData(props.id, { diffOpacity: v });
    },
    [updateNodeData, props.id],
  );

  const handleApprove = useCallback(() => {
    const val = !approved;
    setApproved(val);
    setRejected(false);
    updateNodeData(props.id, { approved: val, rejected: false, status: val ? 'success' : undefined });
  }, [approved, updateNodeData, props.id]);

  const handleReject = useCallback(() => {
    const val = !rejected;
    setRejected(val);
    setApproved(false);
    updateNodeData(props.id, { rejected: val, approved: false, status: val ? 'success' : undefined });
  }, [rejected, updateNodeData, props.id]);

  const handlePasteA = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const url = e.clipboardData.getData('text').trim();
      if (url) {
        updateNodeData(props.id, { imageA: url });
        setNodes((nds) =>
          nds.map((n) => (n.id === props.id ? { ...n, data: { ...n.data, imageA: url } } : n)),
        );
      }
    },
    [updateNodeData, setNodes, props.id],
  );

  const handlePasteB = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const url = e.clipboardData.getData('text').trim();
      if (url) {
        updateNodeData(props.id, { imageB: url });
        setNodes((nds) =>
          nds.map((n) => (n.id === props.id ? { ...n, data: { ...n.data, imageB: url } } : n)),
        );
      }
    },
    [updateNodeData, setNodes, props.id],
  );

  const missing = useMemo(() => !hasBoth, [hasBoth]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        {/* Image URL inputs */}
        <div className="flex gap-2">
          <input
            placeholder="A 图 URL（粘贴）"
            defaultValue={imageA}
            onPaste={handlePasteA}
            className="flex-1 rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
          />
          <input
            placeholder="B 图 URL（粘贴）"
            defaultValue={imageB}
            onPaste={handlePasteB}
            className="flex-1 rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
          />
        </div>

        {/* Mode buttons */}
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
          <button
            type="button"
            onClick={() => updateNodeData(props.id, { mode: 'diff' })}
            className={`flex-1 rounded-lg py-1 border ${mode === 'diff' ? 'border-brand bg-brand/5 text-brand' : 'border-line'}`}
          >
            Diff
          </button>
        </div>

        {missing ? (
          <p className="text-ink/50 text-center py-6">连接上游 2 张图片，或粘贴 A/B 图 URL</p>
        ) : mode === 'side' ? (
          <div className="grid grid-cols-2 gap-1">
            <div className="flex flex-col items-center gap-1">
              <img src={imageA} alt="A" className="rounded-lg border border-line aspect-square object-cover" />
              <span className="text-ink/60">A</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <img src={imageB} alt="B" className="rounded-lg border border-line aspect-square object-cover" />
              <span className="text-ink/60">B</span>
            </div>
          </div>
        ) : mode === 'diff' ? (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden border border-line aspect-video bg-surface">
              <img src={imageA} alt="A" className="absolute inset-0 w-full h-full object-cover" />
              <img
                src={imageB}
                alt="B"
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  mixBlendMode: 'difference',
                  opacity: diffOpacity / 100,
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={diffOpacity}
              onChange={(e) => onDiffOpacity(Number(e.target.value))}
              className="w-full accent-brand"
              title="Diff 透明度"
            />
          </div>
        ) : (
          <div className="relative rounded-lg overflow-hidden border border-line aspect-video bg-surface">
            <img src={imageB} alt="B" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${slider}%` }}>
              <img
                src={imageA}
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

        {/* A/B 对比审核 */}
        {!missing && (
          <div className="flex gap-2 pt-1 border-t border-line">
            <button
              type="button"
              onClick={handleApprove}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium border ${
                approved
                  ? 'border-green-500 bg-green-500/10 text-green-600'
                  : 'border-line text-ink/60 hover:border-green-300'
              }`}
            >
              {approved ? '✓ 已通过' : '通过 (A/B 一致)'}
            </button>
            <button
              type="button"
              onClick={handleReject}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium border ${
                rejected
                  ? 'border-red-500 bg-red-500/10 text-red-600'
                  : 'border-line text-ink/60 hover:border-red-300'
              }`}
            >
              {rejected ? '✗ 已驳回' : '驳回 (需修改)'}
            </button>
          </div>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(PictureDiffBlock);
