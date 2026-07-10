import { useState } from 'react';
import { FolderLock, Plus } from 'lucide-react';
import type { WorkspaceSummary } from '@nx9/shared';
import { computeWorkspaceAssetCount } from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';

interface PrivateProjectListProps {
  projects: WorkspaceSummary[];
  activeDocId: string | null;
  loading?: boolean;
  onSelect: (id: string) => void;
  onCreate: (title: string) => Promise<void>;
}

export function PrivateProjectList({
  projects,
  activeDocId,
  loading,
  onSelect,
  onCreate,
}: PrivateProjectListProps) {
  const doc = useWorkspaceDocument();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const defaultTitle = `私有项目 ${projects.length + 1}`;

  const handleCreate = async () => {
    const name = title.trim() || defaultTitle;
    setSubmitting(true);
    try {
      await onCreate(name);
      setCreating(false);
      setTitle('');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink/40">
        加载项目列表…
      </div>
    );
  }

  if (projects.length === 0 && !creating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <FolderLock size={40} className="text-brand/40 mb-4" />
        <h3 className="text-base font-medium text-ink mb-2">还没有私有项目</h3>
        <p className="text-sm text-ink/50 mb-6 max-w-sm leading-relaxed">
          创建私有项目后即可管理角色、场景、镜头等素材，并在画布节点中通过 @ 引用。
        </p>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setTitle(defaultTitle);
          }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-medium"
        >
          <Plus size={16} />
          新建私有项目
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto nx9-scroll p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-ink">私有项目</h3>
          <p className="text-xs text-ink/45 mt-0.5">选择项目进入素材管理</p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setTitle(defaultTitle);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand/30 text-brand text-xs font-medium hover:bg-brand/5"
          >
            <Plus size={14} />
            新建项目
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-5 p-4 rounded-xl border border-brand/25 bg-brand/5 flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[200px]">
            <span className="text-xs text-ink/50 mb-1 block">项目名称</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:border-brand/40"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
                if (e.key === 'Escape') setCreating(false);
              }}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-2 rounded-lg text-xs text-ink/55 hover:bg-white"
            >
              取消
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleCreate()}
              className="px-4 py-2 rounded-lg bg-brand text-white text-xs font-medium disabled:opacity-50"
            >
              {submitting ? '创建中…' : '创建'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects.map((ws) => {
          const assets =
            activeDocId === ws.id && doc.workspaceId === ws.id
              ? computeWorkspaceAssetCount({
                  characters: doc.characters,
                  soundLibrary: doc.soundLibrary,
                  backlotWorkspace: doc.backlotWorkspace,
                  backlotCustom: doc.backlotCustom,
                })
              : (ws.assetCount ?? 0);
          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => onSelect(ws.id)}
              className="text-left rounded-xl border border-line p-4 hover:border-brand/35 hover:bg-brand/[0.03] transition-colors group"
            >
              <div className="flex items-start gap-2.5">
                <div className="p-2 rounded-lg bg-surface group-hover:bg-brand/10 transition-colors">
                  <FolderLock size={18} className="text-brand/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{ws.title}</p>
                  <p className="text-[11px] text-ink/40 mt-1 tabular-nums">
                    {assets} 素材 · {ws.blockCount} 节点
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
