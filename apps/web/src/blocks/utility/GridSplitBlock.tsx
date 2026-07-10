import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { EditableImage } from '../shared/EditableImage';
import { ImageEditModal } from '../shared/ImageEditModal';
import { useImageEditProduce } from '../shared/use-image-edit-produce';
import { useActivityLog } from '../../stores/activity-log';
import { api } from '../../api/client';

function GridSplitBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const produce = useImageEditProduce(props.id);
  const appendLog = useActivityLog((s) => s.append);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);

  const upstreamMeta = useMemo(() => {
    const incoming = edges.filter((e) => e.target === props.id);
    for (const e of incoming) {
      const up = nodes.find((n) => n.id === e.source);
      const m = up?.data?.meta as { rows?: number; cols?: number } | undefined;
      if (m?.rows && m?.cols) return m;
    }
    return undefined;
  }, [props.id, nodes, edges]);

  const rows = (props.data?.rows as number) ?? upstreamMeta?.rows ?? 3;
  const cols = (props.data?.cols as number) ?? upstreamMeta?.cols ?? 3;
  const status = props.data?.status as string | undefined;
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const splitUrls = (props.data?.splitUrls as string[]) ?? [];
  const sourceUrl = upstream?.pictures?.[0] ?? (props.data?.sourceUrl as string);

  const run = useCallback(async () => {
    if (!sourceUrl) {
      appendLog('宫格切分：缺少上游图片');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.gridSplit({ sourceUrl, rows, cols });
      updateNodeData(props.id, {
        status: 'success',
        splitUrls: res.urls,
        pictures: res.urls,
      });
      appendLog(`宫格切分完成 · ${res.urls.length} 张`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`宫格切分失败: ${String(e)}`);
    }
  }, [sourceUrl, rows, cols, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2">
        <div className="flex gap-2">
          <label className="text-[10px] text-ink/50 flex-1">
            行
            <input
              type="number"
              min={1}
              max={6}
              value={rows}
              onChange={(e) => updateNodeData(props.id, { rows: Number(e.target.value) })}
              className="w-full rounded border border-line px-1 py-0.5 text-xs mt-0.5"
            />
          </label>
          <label className="text-[10px] text-ink/50 flex-1">
            列
            <input
              type="number"
              min={1}
              max={6}
              value={cols}
              onChange={(e) => updateNodeData(props.id, { cols: Number(e.target.value) })}
              className="w-full rounded border border-line px-1 py-0.5 text-xs mt-0.5"
            />
          </label>
        </div>
        {sourceUrl && (
          <EditableImage
            src={sourceUrl}
            className="w-full rounded-lg border border-line max-h-24 object-cover"
            onEdit={() => setEditingUrl(sourceUrl)}
          />
        )}
        {splitUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-1">
            {splitUrls.slice(0, 9).map((u) => (
              <EditableImage
                key={u}
                src={u}
                className="rounded border border-line aspect-square object-cover"
                onEdit={() => setEditingUrl(u)}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={run}
          disabled={status === 'running'}
          className="w-full rounded-xl bg-warn text-white text-sm py-2 disabled:opacity-50"
        >
          {status === 'running' ? '切分中…' : '切分宫格'}
        </button>
      </div>

      {editingUrl && (
        <ImageEditModal
          srcUrl={editingUrl}
          onClose={() => setEditingUrl(null)}
          onProduce={produce}
        />
      )}
    </BlockShell>
  );
}

export default memo(GridSplitBlock);
