import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Box, Film, Maximize2, Music, Plus, Upload, X } from 'lucide-react';
import {
  guessMediaKindFromFile,
  guessMediaKindFromUrl,
  resolveAssetImportItems,
  syncAssetImportNodeFields,
  type ImportedAssetItem,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { ImageEditModal } from '../shared/ImageEditModal';
import { useImageEditProduce } from '../shared/use-image-edit-produce';
import { useFlowRuntime } from '../../stores/flow-runtime';
import { api } from '../../api/client';

const FILE_ACCEPT = 'image/*,video/*,audio/*,.glb,.gltf,.obj,.fbx';

interface UploadTask {
  id: string;
  name: string;
  progress: number;
}

function newAssetId() {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 文件 input 挂到 body，避免 React Flow transform 导致选文件/onChange 失效 */
function BodyFileInput({
  inputRef,
  multiple,
  accept,
  onFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  multiple?: boolean;
  accept?: string;
  onFiles: (files: FileList) => void;
}) {
  return createPortal(
    <input
      ref={inputRef}
      type="file"
      multiple={multiple}
      accept={accept}
      tabIndex={-1}
      aria-hidden
      style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1, opacity: 0 }}
      onChange={(e) => {
        const files = e.target.files;
        if (files?.length) onFiles(files);
        e.target.value = '';
      }}
    />,
    document.body,
  );
}

function stopFlow(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function AssetPreviewLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
        aria-label="关闭"
      >
        <X size={16} />
      </button>
      <img
        src={url}
        alt=""
        className="max-w-[min(92vw,960px)] max-h-[88vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

function AssetPreview({
  item,
  onRemove,
  onPreview,
  onEditPicture,
}: {
  item: ImportedAssetItem;
  onRemove: () => void;
  onPreview?: () => void;
  onEditPicture?: () => void;
}) {
  const label = item.filename ?? item.url.split('/').pop() ?? item.mediaKind;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="relative group rounded-md border border-line overflow-hidden bg-surface/50">
      <button
        type="button"
        onClick={onRemove}
        onPointerDown={stop}
        className="absolute top-0.5 right-0.5 z-10 w-4 h-4 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity nodrag nopan"
        title="移除"
      >
        <X size={9} />
      </button>

      {item.mediaKind === 'picture' && (
        <button
          type="button"
          onClick={onPreview}
          onPointerDown={stop}
          className="relative block w-full h-14 nodrag nopan group/img"
          title="点击查看大图"
        >
          <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/img:bg-black/25 transition-colors">
            <Maximize2 size={14} className="text-white opacity-0 group-hover/img:opacity-90" />
          </span>
        </button>
      )}

      {item.mediaKind === 'clip' && (
        <video
          src={item.url}
          className="w-full h-14 object-cover bg-black/80 nodrag nopan"
          muted
          playsInline
          preload="metadata"
          onPointerDown={stop}
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
        />
      )}

      {item.mediaKind === 'sound' && (
        <div className="h-14 flex flex-col items-center justify-center gap-0.5 bg-indigo-500/5 px-1 nodrag nopan">
          <Music size={14} className="text-indigo-600/70 shrink-0" />
          <audio
            src={item.url}
            controls
            className="w-full h-6 nodrag nopan"
            preload="metadata"
            onPointerDown={stop}
          />
        </div>
      )}

      {item.mediaKind === 'mesh' && (
        <div className="h-14 flex flex-col items-center justify-center gap-0.5 bg-violet-500/5 px-1 nodrag nopan">
          <Box size={16} className="text-violet-600/70" />
          <span className="text-[8px] text-ink/50 text-center line-clamp-2 break-all">{label}</span>
        </div>
      )}

      {item.mediaKind === 'picture' && onEditPicture && (
        <button
          type="button"
          onClick={onEditPicture}
          onPointerDown={stop}
          className="absolute bottom-5 left-0.5 z-10 px-1 py-0.5 rounded text-[8px] bg-black/45 text-white opacity-0 group-hover:opacity-100 nodrag nopan"
          title="裁剪 / 宫格"
        >
          编辑
        </button>
      )}

      {item.mediaKind !== 'mesh' && item.mediaKind !== 'sound' && (
        <p className="px-1 py-0.5 text-[8px] text-ink/45 truncate border-t border-line/60" title={label}>
          {label}
        </p>
      )}
    </div>
  );
}

function AssetImportBlock(props: NodeProps) {
  const { getNode, updateNodeData } = useReactFlow();
  const flowRuntime = useFlowRuntime((s) => s.runtime);
  const produce = useImageEditProduce(props.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef<Record<string, unknown>>({});
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const data = (props.data ?? {}) as Record<string, unknown>;
  dataRef.current = data;
  const items = useMemo(() => resolveAssetImportItems(data), [data]);

  const updateNode = useCallback(
    (patch: Record<string, unknown>) => {
      if (flowRuntime?.updateNodeData) {
        flowRuntime.updateNodeData(props.id, patch);
        return;
      }
      updateNodeData(props.id, patch);
    },
    [flowRuntime, props.id, updateNodeData],
  );

  const readCurrentItems = useCallback((): ImportedAssetItem[] => {
    const node = getNode(props.id);
    return resolveAssetImportItems(
      (node?.data as Record<string, unknown> | undefined) ?? dataRef.current,
    );
  }, [getNode, props.id]);

  const patchItems = useCallback(
    (next: ImportedAssetItem[]) => {
      updateNode(syncAssetImportNodeFields(next));
    },
    [updateNode],
  );

  const appendItems = useCallback(
    (added: ImportedAssetItem[]) => {
      patchItems([...readCurrentItems(), ...added]);
    },
    [patchItems, readCurrentItems],
  );

  const openFilePicker = useCallback(() => {
    setUploadError(null);
    inputRef.current?.click();
  }, []);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      setUploadError(null);
      updateNode({ status: 'running' });

      const tasks: UploadTask[] = list.map((f) => ({
        id: newAssetId(),
        name: f.name,
        progress: 0,
      }));
      setUploadTasks((prev) => [...prev, ...tasks]);

      const uploaded: ImportedAssetItem[] = [];
      const errors: string[] = [];

      await Promise.all(
        list.map(async (file, i) => {
          const taskId = tasks[i].id;
          const mediaKind = guessMediaKindFromFile(file);
          try {
            const res = await api.uploadAsset(file, (pct) => {
              setUploadTasks((prev) =>
                prev.map((t) => (t.id === taskId ? { ...t, progress: Math.round(pct * 100) } : t)),
              );
            });
            uploaded.push({
              id: taskId,
              url: res.url,
              mediaKind,
              filename: res.filename ?? file.name,
              thumbUrl: res.thumbUrl ?? (mediaKind === 'picture' ? res.url : undefined),
            });
          } catch (e) {
            errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            setUploadTasks((prev) => prev.filter((t) => t.id !== taskId));
          }
        }),
      );

      if (uploaded.length > 0) {
        appendItems(uploaded);
      }

      if (errors.length > 0) {
        const msg = errors.join('；');
        setUploadError(msg);
        updateNode({ status: 'error', error: msg });
      } else if (uploaded.length > 0) {
        setUploadError(null);
      } else {
        updateNode({ status: 'idle' });
      }
    },
    [appendItems, updateNode],
  );

  const removeItem = useCallback(
    (id: string) => {
      patchItems(items.filter((i) => i.id !== id));
    },
    [items, patchItems],
  );

  const downloadUrl = useCallback(async () => {
    const url = pasteUrl.trim();
    if (!url) return;
    setUploadError(null);
    updateNode({ status: 'uploading' });
    try {
      const res = await api.captureUrl(url);
      const mediaKind = guessMediaKindFromUrl(url);
      patchItems([
        ...readCurrentItems(),
        {
          id: newAssetId(),
          url: res.url,
          mediaKind,
          filename: res.filename,
          thumbUrl: mediaKind === 'picture' ? res.url : undefined,
        },
      ]);
      setPasteUrl('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUploadError(msg);
      updateNode({ status: 'error', error: msg });
    }
  }, [pasteUrl, patchItems, readCurrentItems, updateNode]);

  return (
    <BlockShell {...props}>
      <BodyFileInput
        inputRef={inputRef}
        multiple
        accept={FILE_ACCEPT}
        onFiles={(files) => void uploadFiles(files)}
      />

      <div
        className="space-y-2 nodrag nopan px-2 pb-2"
        onDragOverCapture={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeaveCapture={() => setDragOver(false)}
        onDropCapture={(e) => {
          if (!e.dataTransfer.files?.length) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          void uploadFiles(e.dataTransfer.files);
        }}
      >

        {items.length > 0 && (
          <div className="grid grid-cols-3 gap-1 max-h-36 overflow-y-auto nx9-scroll">
            {items.map((item) => (
              <AssetPreview
                key={item.id}
                item={item}
                onRemove={() => removeItem(item.id)}
                onPreview={item.mediaKind === 'picture' ? () => setPreviewUrl(item.url) : undefined}
                onEditPicture={
                  item.mediaKind === 'picture' ? () => setEditingUrl(item.url) : undefined
                }
              />
            ))}
          </div>
        )}

        {uploadTasks.length > 0 && (
          <div className="space-y-1">
            {uploadTasks.map((task) => (
              <div key={task.id} className="space-y-0.5">
                <div className="flex justify-between text-[9px] text-ink/45">
                  <span className="truncate flex-1">{task.name}</span>
                  <span>{task.progress || 0}%</span>
                </div>
                <div className="w-full bg-line/30 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-brand h-full rounded-full transition-all"
                    style={{ width: `${task.progress || 12}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {uploadError && (
          <p className="text-[10px] text-warn leading-snug px-1">{uploadError}</p>
        )}

        <button
          type="button"
          onMouseDown={stopFlow}
          onClick={(e) => {
            stopFlow(e);
            openFilePicker();
          }}
          className={`w-full flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed py-2 text-[11px] transition-colors cursor-pointer nodrag nopan ${
            dragOver
              ? 'border-brand bg-brand/5 text-brand'
              : 'border-line text-ink/50 hover:border-brand/40 hover:text-brand'
          }`}
        >
          {items.length > 0 ? (
            <>
              <Plus size={14} />
              <span>继续添加素材</span>
            </>
          ) : (
            <>
              <Upload size={16} />
              <span>点击或拖入素材</span>
              <span className="text-[8px] text-ink/35 flex items-center gap-1.5">
                <Film size={9} /> 图像 / 视频
                <Music size={9} /> 音频
                <Box size={9} /> 3D
              </span>
            </>
          )}
        </button>

        <div className="flex gap-1 nodrag nopan">
          <input
            type="url"
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            onMouseDown={stopFlow}
            placeholder="或粘贴 URL 采集…"
            className="flex-1 text-[10px] rounded-lg border border-line px-2 py-1.5 nodrag nopan"
          />
          <button
            type="button"
            onMouseDown={stopFlow}
            onClick={() => void downloadUrl()}
            disabled={!pasteUrl.trim()}
            className="rounded-lg bg-brand/10 text-brand text-[10px] px-3 py-1.5 disabled:opacity-40 shrink-0 nodrag nopan"
          >
            采集
          </button>
        </div>
      </div>

      {previewUrl && <AssetPreviewLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />}

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
