import { memo, useCallback, useRef, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { EditableImage } from '../shared/EditableImage';
import { ImageEditModal } from '../shared/ImageEditModal';
import { useImageEditProduce } from '../shared/use-image-edit-produce';
import { api } from '../../api/client';

function AssetImportBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const produce = useImageEditProduce(props.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const assetUrl = props.data?.assetUrl as string | undefined;
  const mediaKind = props.data?.mediaKind as string | undefined;

  const onFile = useCallback(
    async (file: File) => {
      const kind = file.type.startsWith('video')
        ? 'clip'
        : file.type.startsWith('audio')
          ? 'sound'
          : 'picture';
      const res = await api.uploadAsset(file);
      updateNodeData(props.id, {
        assetUrl: res.url,
        mediaKind: kind,
        filename: res.filename,
        status: 'done',
      });
    },
    [props.id, updateNodeData],
  );

  return (
    <BlockShell {...props}>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*,audio/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      {assetUrl ? (
        <div className="space-y-2 nodrag nopan">
          {mediaKind === 'picture' && (
            <EditableImage
              src={assetUrl}
              className="w-full rounded-lg max-h-36 object-cover"
              onEdit={() => setEditingUrl(assetUrl)}
            />
          )}
          {mediaKind !== 'picture' && (
            <p className="text-xs font-mono truncate text-ink/70">{assetUrl}</p>
          )}
          <button
            type="button"
            className="text-xs text-brand nodrag nopan"
            onClick={() => inputRef.current?.click()}
          >
            更换文件
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl border border-dashed border-line py-6 text-sm text-ink/60 hover:border-brand/40 hover:text-brand nodrag nopan"
        >
          点击或拖入素材
        </button>
      )}

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

export default memo(AssetImportBlock);
