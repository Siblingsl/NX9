/**
 * TrashPanel — 首页项目回收站（F-010）。
 *
 * 显示软删除的项目，支持恢复和彻底删除。
 * 资产级回收站见 AssetTrashPanel / AssetTrashModal（画布顶栏 / 素材库 / 命令面板）。
 * 入口：HomeNavPage 删除确认改为「移入回收站」。
 */
import { memo, useEffect, useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { toastSuccess, toastError } from '../stores/toast';
import { confirmDelete } from '../stores/confirm-dialog';

interface TrashItem {
  id: string;
  title: string;
  deletedAt: number;
  updatedAt: number;
}

export const TrashPanel = memo(function TrashPanel({
  onRestore,
}: {
  onRestore?: (id: string) => void;
}) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleanupCount, setCleanupCount] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [purging, setPurging] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workspaces/trash/list');
      if (!res.ok) throw new Error('Failed to load trash');
      const data = await res.json();
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTrash();
    fetch('/api/workspaces/trash/purge-expired', { method: 'POST' })
      .then((r) => r.json().then((n) => setCleanupCount(n)).catch(() => {}))
      .catch(() => {});
  }, []);

  const handleRestore = async (id: string) => {
    setRestoring(id);
    try {
      const res = await fetch(`/api/workspaces/${id}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error('恢复失败');
      setItems((prev) => prev.filter((item) => item.id !== id));
      toastSuccess('项目已恢复');
      onRestore?.(id);
    } catch (err) {
      toastError(err instanceof Error ? err.message : '恢复失败');
    } finally {
      setRestoring(null);
    }
  };

  const purgeOne = async (id: string) => {
    setPurging(id);
    try {
      const res = await fetch(`/api/workspaces/${id}/purge`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      setItems((prev) => prev.filter((item) => item.id !== id));
      toastSuccess('已彻底删除');
    } catch (err) {
      toastError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setPurging(null);
    }
  };

  const handlePurge = async (id: string) => {
    const ok = await confirmDelete({
      title: '彻底删除此项目？',
      description: '彻底删除后不可恢复，请确认。',
    });
    if (!ok) return;
    await purgeOne(id);
  };

  const handlePurgeAll = async () => {
    if (items.length === 0) return;
    const ok = await confirmDelete({
      title: `将彻底删除 ${items.length} 个项目？`,
      description: '全部彻底删除后不可恢复，请确认。',
    });
    if (!ok) return;
    for (const item of [...items]) {
      await purgeOne(item.id);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days} 天前`;
    return d.toLocaleDateString();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
          <Trash2 size={14} className="text-warn" />
          回收站
        </h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => void handlePurgeAll()}
            className="text-[9px] text-ink/40 hover:text-red-600 underline"
          >
            清空回收站
          </button>
        )}
      </div>

      {cleanupCount !== null && cleanupCount > 0 && (
        <div className="px-3 py-1.5 text-[9px] text-ink/40 bg-surface/50 rounded mb-2">
          已自动清理 {cleanupCount} 个过期项目
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-ink/30" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-line/40 bg-surface/20 p-6 text-center">
          <p className="text-[11px] text-ink/40">回收站为空</p>
          <p className="text-[9px] text-ink/30 mt-1">删除的项目将移入回收站，30 天后自动清理</p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-line/30 bg-surface/20 p-2.5"
            >
              <Trash2 size={12} className="text-ink/30 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-ink truncate">{item.title}</p>
                <p className="text-[8px] text-ink/30">
                  删除于 {formatTime(item.deletedAt)}
                </p>
              </div>
              <button
                type="button"
                disabled={restoring === item.id}
                onClick={() => void handleRestore(item.id)}
                className="rounded border border-ok/25 px-2 py-1 text-[9px] text-ok hover:bg-ok/5 disabled:opacity-50"
              >
                {restoring === item.id ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <>
                    <RotateCcw size={10} className="inline mr-0.5" />
                    恢复
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={purging === item.id}
                onClick={() => void handlePurge(item.id)}
                className="rounded border border-red/20 px-2 py-1 text-[9px] text-red/60 hover:text-red hover:bg-red/5 disabled:opacity-50"
              >
                {purging === item.id ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  '彻底删除'
                )}
              </button>
            </div>
          ))}
          <p className="text-[8px] text-ink/25 text-center pt-1">
            项目在回收站保留 30 天，到期自动清理
          </p>
        </div>
      )}
    </div>
  );
});
