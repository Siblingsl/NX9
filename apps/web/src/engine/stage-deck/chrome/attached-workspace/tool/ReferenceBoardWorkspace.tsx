import { useCallback, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { lookupBlock } from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import ImageUploadSlot from '../../../../../blocks/shared/ImageUploadSlot';

export interface ReferenceBoardWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function ReferenceBoardWorkspace({ blockId, kind, onCollapse }: ReferenceBoardWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const data = useAttachedNodeData(blockId);

  const upstream = data.upstream as { pictures?: string[]; prompts?: string[] } | undefined;
  const boardImages = (data.boardImages as string[] | undefined) ?? [];
  const palette = (data.palette as string[] | undefined) ?? ['#0F766E', '#1E3A5F', '#F4F1EA'];
  const styleNotes = (data.styleNotes as string) ?? '';
  const content = (data.content as string) ?? '';
  const status = data.status as string | undefined;

  const addImage = useCallback(
    (url: string) => {
      const next = [...new Set([url, ...boardImages, ...(upstream?.pictures ?? [])])].filter(Boolean);
      updateNodeData(blockId, { boardImages: next, pictures: next });
    },
    [boardImages, upstream?.pictures, blockId, updateNodeData],
  );

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
      updateNodeData(blockId, {
        styleNotes: notes,
        content: parts.join(' | '),
        boardImages: allImages,
        pictures: allImages,
      });
    },
    [allImages, palette, upstream?.prompts, blockId, updateNodeData],
  );

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={onCollapse}
      showRun={false}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      heightClass="h-auto max-h-[360px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2 overflow-y-auto nowheel overscroll-contain text-xs"
    >
      <div className="space-y-2 nodrag nopan">
        <ImageUploadSlot url="" label="上传参考图" compact onUploaded={addImage} />
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
                updateNodeData(blockId, { palette: next });
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
          className="w-full min-h-[56px] rounded-xl border border-line px-2 py-1.5 resize-y bg-surface"
        />
        {content && <p className="text-[10px] text-ink/60 line-clamp-2">{content}</p>}
      </div>
    </ComposerWorkspaceShell>
  );
}
