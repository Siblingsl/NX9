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
  const [pasteUrl, setPasteUrl] = useState('');
  const assetUrl = props.data?.assetUrl as string | undefined;
  const mediaKind = props.data?.mediaKind as string | undefined;
  const status = props.data?.status as string | undefined;
  const totalBytes = props.data?.totalBytes as number | undefined;
  const uploadedBytes = props.data?.uploadedBytes as number | undefined;
  const progress = totalBytes && uploadedBytes ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  const onFile = useCallback(
    async (file: File) => {
      const kind = file.type.startsWith('video')
        ? 'clip'
        : file.type.startsWith('audio')
          ? 'sound'
          : 'picture';
      updateNodeData(props.id, { status: 'uploading', totalBytes: file.size, uploadedBytes: 0 });
      try {
        const res = await api.uploadAsset(file, (pct) => {
          updateNodeData(props.id, { uploadedBytes: Math.round(file.size * pct) });
        });
        updateNodeData(props.id, {
          assetUrl: res.url,
          mediaKind: kind,
          filename: res.filename,
          status: 'done',
        });
      } catch {
        updateNodeData(props.id, { status: 'error', error: '上传失败' });
      }
    },
    [props.id, updateNodeData],
  );

  const downloadUrl = useCallback(async () => {
    const url = pasteUrl.trim();
    if (!url) return;
    updateNodeData(props.id, { status: 'uploading' });
    try {
      const res = await api.captureUrl(url);
      const kind = /\.(png|jpe?g|gif|webp)$/i.test(url) ? 'picture' : 'clip';
      updateNodeData(props.id, {
        assetUrl: res.url,
        mediaKind: kind,
        filename: res.filename,
        status: 'done',
        capturedAssetUrl: res.url,
      });
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [pasteUrl, props.id, updateNodeData]);

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
      {status === 'uploading' && (
        <div className="nodrag nopan space-y-1 px-2 py-4">
          <div className="w-full bg-line/30 rounded-full h-2 overflow-hidden">
            <div className="bg-brand h-full rounded-full transition-all" style={{ width: `${progress || 30}%` }} />
          </div>
          <p className="text-[10px] text-ink/50 text-center">上传中 {progress}%</p>
        </div>
      )}
      {assetUrl && status !== 'uploading' ? (
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
      ) : status !== 'uploading' ? (
        <div className="space-y-2 nodrag nopan">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-line py-4 text-sm text-ink/60 hover:border-brand/40 hover:text-brand"
          >
            点击或拖入素材
          </button>
          <div className="flex gap-1">
            <input
              type="url"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="或粘贴 URL 采集…"
              className="flex-1 text-[10px] rounded-lg border border-line px-2 py-1.5"
            />
            <button
              type="button"
              onClick={() => void downloadUrl()}
              disabled={!pasteUrl.trim()}
              className="rounded-lg bg-brand/10 text-brand text-[10px] px-3 py-1.5 disabled:opacity-40"
            >
              采集
            </button>
          </div>
        </div>
      ) : null}

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
