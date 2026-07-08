import { useCallback, useEffect, useState } from 'react';
import { Download, FolderOpen, GripVertical, Upload, X } from 'lucide-react';
import { api } from '../api/client';
import { useActivityLog } from '../stores/activity-log';
import { useFlowCommands } from '../stores/flow-commands';
import { useWorkspaceCatalog } from '../stores/workspace-catalog';

interface AssetItem {
  name: string;
  size: number;
  updatedAt: number;
}

function assetUrl(name: string) {
  return `/media/uploads/${encodeURIComponent(name)}`;
}

function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

export function AssetLibraryPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const appendLog = useActivityLog((s) => s.append);
  const activeId = useWorkspaceCatalog((s) => s.activeId);
  const fetchAll = useWorkspaceCatalog((s) => s.fetchAll);
  const setActive = useWorkspaceCatalog((s) => s.setActive);
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listAssets();
      setAssets(list);
    } catch (e) {
      appendLog(`资源库加载失败: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [appendLog]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleUpload = useCallback(
    async (file: File) => {
      try {
        const res = await api.uploadAsset(file);
        appendLog(`已上传: ${res.filename}`);
        await refresh();
      } catch (e) {
        appendLog(`上传失败: ${String(e)}`);
      }
    },
    [appendLog, refresh],
  );

  const handleExportWorkflow = useCallback(async () => {
    if (!activeId) return;
    try {
      const payload = await api.exportWorkspaceJson(activeId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nx9-workflow-${activeId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      appendLog('工作流已导出');
    } catch (e) {
      appendLog(`导出失败: ${String(e)}`);
    }
  }, [activeId, appendLog]);

  const handleImportWorkflow = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const created = await api.importWorkspaceJson(payload, file.name.replace(/\.json$/i, ''));
        await fetchAll();
        setActive(created.id);
        appendLog(`已导入工作流: ${created.title}`);
        onClose();
      } catch (e) {
        appendLog(`导入失败: ${String(e)}`);
      }
    },
    [appendLog, fetchAll, setActive, onClose],
  );

  const spawnAssetOnCanvas = useCallback(
    (name: string) => {
      const url = assetUrl(name);
      const isPic = isImage(name);
      requestSpawn('asset-import', { x: 140 + Math.random() * 60, y: 140 + Math.random() * 60 }, {
        assetUrl: url,
        mediaKind: isPic ? 'picture' : 'clip',
        status: 'done',
      });
      appendLog(`已添加素材模块 · ${name}`);
    },
    [requestSpawn, appendLog],
  );

  if (!open) return null;

  return (
    <aside className="w-[300px] shrink-0 border-l border-line bg-white flex flex-col h-full absolute right-0 top-0 z-20 shadow-panel">
      <div className="h-12 shrink-0 border-b border-line flex items-center px-3 gap-2">
        <FolderOpen size={18} className="text-accent" />
        <span className="font-semibold text-sm flex-1">资源库</span>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-ink/50">
          <X size={16} />
        </button>
      </div>

      <div className="p-3 border-b border-line flex gap-2">
        <label className="flex-1 flex items-center justify-center gap-1 text-xs rounded-lg border border-line py-2 cursor-pointer hover:border-brand/40">
          <Upload size={14} />
          上传
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleExportWorkflow()}
          className="flex-1 flex items-center justify-center gap-1 text-xs rounded-lg border border-line py-2 hover:border-brand/40"
        >
          <Download size={14} />
          导出
        </button>
        <label className="flex-1 flex items-center justify-center gap-1 text-xs rounded-lg border border-line py-2 cursor-pointer hover:border-brand/40">
          导入
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportWorkflow(f);
            }}
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2 min-h-0 nx9-scroll">
        {loading ? (
          <p className="text-xs text-ink/50 text-center py-8">加载中…</p>
        ) : assets.length === 0 ? (
          <p className="text-xs text-ink/50 text-center py-8">暂无上传资源</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {assets.map((a) => {
              const url = assetUrl(a.name);
              return (
                <li
                  key={a.name}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/nx9-asset-url', url);
                    e.dataTransfer.setData('application/nx9-block', 'asset-import');
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onDoubleClick={() => spawnAssetOnCanvas(a.name)}
                  className="rounded-xl border border-line overflow-hidden hover:border-brand/40 cursor-grab active:cursor-grabbing group"
                  title="拖到画布，或双击添加素材模块"
                >
                  <div className="aspect-square bg-surface relative">
                    {isImage(a.name) ? (
                      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-ink/40 p-2 text-center">
                        {a.name.split('.').pop()?.toUpperCase()}
                      </div>
                    )}
                    <GripVertical
                      size={14}
                      className="absolute top-1 right-1 text-white/80 opacity-0 group-hover:opacity-100 drop-shadow"
                    />
                  </div>
                  <p className="text-[10px] font-mono truncate px-1.5 py-1">{a.name}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
