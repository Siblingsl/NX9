import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

function ReferenceBoardBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const upstream = props.data?.upstream as { pictures?: string[]; prompts?: string[] } | undefined;
  const boardImages = (props.data?.boardImages as string[] | undefined) ?? [];
  const palette = (props.data?.palette as string[] | undefined) ?? ['#A13D63', '#5E4D8A', '#FAFAF8'];
  const styleNotes = (props.data?.styleNotes as string) ?? '';
  const content = (props.data?.content as string) ?? '';

  const allImages = useMemo(() => {
    const set = new Set<string>([...boardImages, ...(upstream?.pictures ?? [])]);
    return [...set].filter(Boolean);
  }, [boardImages, upstream?.pictures]);

  const syncContent = useCallback(
    (notes: string) => {
      const parts = [
        upstream?.prompts?.[0],
        notes.trim(),
        palette.length ? `palette: ${palette.join(', ')}` : '',
        allImages.length ? `references: ${allImages.length} images` : '',
      ].filter(Boolean);
      updateNodeData(props.id, {
        styleNotes: notes,
        content: parts.join(' | '),
        boardImages: allImages,
        pictures: allImages,
      });
    },
    [allImages, palette, upstream?.prompts, props.id, updateNodeData],
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <div className="grid grid-cols-3 gap-1">
          {allImages.slice(0, 6).map((url) => (
            <img key={url} src={url} alt="" className="aspect-square object-cover rounded-lg border border-line" />
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {palette.map((color, i) => (
            <input
              key={i}
              type="color"
              value={color}
              onChange={(e) => {
                const next = [...palette];
                next[i] = e.target.value;
                updateNodeData(props.id, { palette: next });
                syncContent(styleNotes);
              }}
              className="w-7 h-7 rounded border border-line cursor-pointer"
            />
          ))}
        </div>
        <textarea
          value={styleNotes}
          onChange={(e) => syncContent(e.target.value)}
          placeholder="风格约束：材质、光影、情绪…"
          className="w-full min-h-[56px] rounded-xl border border-line px-2 py-1.5 resize-y"
        />
        {content && <p className="text-[10px] text-ink/60 line-clamp-2">{content}</p>}
      </div>
    </BlockShell>
  );
}

export default memo(ReferenceBoardBlock);
