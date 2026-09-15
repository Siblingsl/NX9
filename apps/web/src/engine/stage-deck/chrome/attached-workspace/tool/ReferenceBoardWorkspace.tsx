import { useCallback, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import ImageUploadSlot from '../../../../../blocks/shared/ImageUploadSlot';

export interface ReferenceBoardWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

/**
 * 参考板：轻量 Mood Board（风格约束 / 堆图）。
 * 热门玩法已迁至「视频生成 · 热门玩法」，此处不再承载 Playbook 重 UI。
 */
export function ReferenceBoardWorkspace({ blockId, kind, onCollapse }: ReferenceBoardWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const data = useAttachedNodeData(blockId);

  const upstream = data.upstream as { pictures?: string[]; prompts?: string[] } | undefined;
  const boardImages = (data.boardImages as string[] | undefined) ?? [];
  const palette = (data.palette as string[] | undefined) ?? ['#0F766E', '#1E3A5F', '#F4F1EA'];
  const styleNotes = (data.styleNotes as string) ?? '';
  const content = (data.content as string) ?? '';
  const enforce = data.enforce === true;
  const status = data.status as string | undefined;

  const allImages = useMemo(() => {
    const set = new Set<string>([...boardImages, ...(upstream?.pictures ?? [])]);
    return [...set].filter(Boolean);
  }, [boardImages, upstream?.pictures]);

  const persistBoard = useCallback(
    (patch: Record<string, unknown>) => {
      const nextNotes = typeof patch.styleNotes === 'string' ? patch.styleNotes : styleNotes;
      const nextPalette = Array.isArray(patch.palette) ? (patch.palette as string[]) : palette;
      const nextImages = Array.isArray(patch.boardImages) ? (patch.boardImages as string[]) : allImages;
      const nextEnforce = typeof patch.enforce === 'boolean' ? patch.enforce : enforce;
      const parts = [
        upstream?.prompts?.[0],
        nextNotes.trim(),
        nextPalette.length ? `palette: ${nextPalette.join(', ')}` : '',
        nextImages.length ? `references: ${nextImages.length} images` : '',
      ].filter(Boolean);
      const nextContent = parts.join(' | ');
      updateNodeData(blockId, {
        styleNotes: nextNotes,
        palette: nextPalette,
        boardImages: nextImages,
        pictures: nextImages,
        enforce: nextEnforce,
        content: nextContent,
        // F-032: 结构化约束与扁平字段同步，供 extractReferenceConstraints 读取
        constraints: {
          style: nextNotes.trim() || undefined,
          palette: nextPalette.length ? nextPalette.join(', ') : undefined,
          assetUrls: nextImages,
        },
      });
    },
    [allImages, blockId, enforce, palette, styleNotes, updateNodeData, upstream?.prompts],
  );

  const addImage = useCallback(
    (url: string) => {
      const next = [...new Set([url, ...boardImages, ...(upstream?.pictures ?? [])])].filter(Boolean);
      persistBoard({ boardImages: next });
    },
    [boardImages, persistBoard, upstream?.pictures],
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
                persistBoard({ palette: next });
              }}
              className="w-7 h-7 rounded border border-line cursor-pointer"
            />
          ))}
        </div>
        <textarea
          value={styleNotes}
          onChange={(e) => persistBoard({ styleNotes: e.target.value })}
          placeholder="风格约束：材质、光影、情绪…"
          className="w-full min-h-[56px] rounded-xl border border-line px-2 py-1.5 resize-y bg-surface"
        />
        <label className="flex items-center gap-2 text-[11px] text-ink/70">
          <input
            type="checkbox"
            checked={enforce}
            onChange={(e) => persistBoard({ enforce: e.target.checked })}
          />
          强约束（无风格/色板/参考图时阻断下游生成）
        </label>
        {content && <p className="text-[10px] text-ink/60 line-clamp-2">{content}</p>}
      </div>
    </ComposerWorkspaceShell>
  );
}
