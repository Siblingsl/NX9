import { useState } from 'react';
import { Clapperboard, Film, LayoutGrid, Plus, Settings, Sparkles, Trash2, Archive } from 'lucide-react';
import { useWorkspaceCatalog } from '../stores/workspace-catalog';
import { useAppSurface } from '../stores/app-surface';
import { isPrivateWorkspace } from '@nx9/shared';
import { useCreateWorkspaceDialogUi } from '../stores/create-workspace-dialog-ui';
import { useCredentialVault } from '../stores/credential-vault';
import { toastError, toastSuccess } from '../stores/toast';
import { TrashPanel } from '../panels/TrashPanel';

/**
 * 应用导航页：默认进入画布；制作台降级为次级入口（F-002）。
 * 制作台功能对等画布（同契约、同数据、同结果）。
 */
export function HomeNavPage() {
  const items = useWorkspaceCatalog((s) => s.items);
  const activeId = useWorkspaceCatalog((s) => s.activeId);
  const selectWorkspace = useWorkspaceCatalog((s) => s.selectWorkspace);
  const removeWorkspace = useWorkspaceCatalog((s) => s.remove);
  const goStudio = useAppSurface((s) => s.goStudio);
  const goCanvas = useAppSurface((s) => s.goCanvas);
  const openCreate = useCreateWorkspaceDialogUi((s) => s.openDialog);
  const toggleSettings = useCredentialVault((s) => s.toggleSettings);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  const projects = items.filter(isPrivateWorkspace);
  const active = projects.find((p) => p.id === activeId) ?? projects[0];

  const confirmDeleteProject = async () => {
    if (!pendingDelete || deleting) return;
    const { id, title } = pendingDelete;
    setDeleting(true);
    try {
      await removeWorkspace(id);
      setPendingDelete(null);
      toastSuccess(`已移入回收站「${title}」`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : '删除项目失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="h-full overflow-y-auto nx9-scroll"
      style={{
        background:
          'radial-gradient(1000px 420px at 15% -5%, rgba(15,118,110,0.1), transparent 55%), radial-gradient(800px 360px at 95% 0%, rgba(30,58,95,0.07), transparent 50%), #f7f3eb',
      }}
    >
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand to-accent text-white text-xs font-bold flex items-center justify-center shadow-lg shadow-brand/20">
              N9
            </span>
            <div>
              <h1 className="text-2xl font-bold text-ink tracking-tight">NX9 Studio</h1>
              <p className="text-sm text-ink/50 mt-0.5">选择工作面 · 画布为默认入口</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand text-white text-sm px-4 py-2.5 font-semibold shadow-md shadow-brand/20"
            >
              <Plus size={16} /> 新建项目
            </button>
            <button
              type="button"
              onClick={() => setTrashOpen(true)}
              className="p-2.5 rounded-xl border border-line bg-surface/80 text-ink/50 hover:text-ink"
              title="回收站"
            >
              <Archive size={18} />
            </button>
            <button
              type="button"
              onClick={() => toggleSettings(true)}
              className="p-2.5 rounded-xl border border-line bg-surface/80 text-ink/50 hover:text-ink"
              title="设置"
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        {projects.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink/40">项目</h2>
            <div className="flex flex-wrap gap-2">
              {projects.slice(0, 12).map((p) => (
                <div
                  key={p.id}
                  className={`group inline-flex items-center gap-1 rounded-full border pl-3.5 pr-1 py-1 text-xs transition-all ${
                    p.id === active?.id
                      ? 'border-brand/40 bg-brand/10 text-brand font-semibold shadow-sm'
                      : 'border-line/80 bg-surface/70 text-ink/55 hover:border-brand/25'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void selectWorkspace(p.id)}
                    className="py-0.5 max-w-[160px] truncate"
                    title={p.title}
                  >
                    {p.title}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete({ id: p.id, title: p.title });
                    }}
                    className="p-1 rounded-full text-ink/30 hover:text-red-600 hover:bg-red-50 opacity-70 group-hover:opacity-100"
                    title={`删除「${p.title}」`}
                    aria-label={`删除「${p.title}」`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            {active && (
              <p className="text-[11px] text-ink/40">
                当前「{active.title}」· {active.shotCount ?? 0} 镜头
              </p>
            )}
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* F-002: 画布为主入口 */}
          <button
            type="button"
            onClick={() => {
              if (active) void selectWorkspace(active.id);
              goCanvas();
            }}
            className="group text-left rounded-[22px] border border-brand/20 bg-gradient-to-br from-white via-[#fffcf7] to-brand/[0.06] p-7 shadow-[0_12px_40px_rgba(30,58,95,0.07)] hover:border-brand/40 hover:shadow-lg transition-all"
          >
            <span className="w-14 h-14 rounded-2xl bg-brand/12 text-brand flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
              <LayoutGrid size={28} />
            </span>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-ink tracking-tight">画布</h2>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand/10 text-brand">
                推荐
              </span>
            </div>
            <p className="text-sm text-ink/55 leading-relaxed mt-2">
              节点连线与自由编排：剧本 → 分镜台 → 导演台 → 视频生成 → 智能剪辑 → 导出。适合全流程做剧。
            </p>
            <ul className="mt-4 space-y-1.5 text-[12px] text-ink/45">
              <li className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-brand" /> AI 拆镜 / 编剧台就绪
              </li>
              <li className="flex items-center gap-1.5">
                <Film size={12} className="text-brand" /> 分镜台线稿 + 导演台关键帧
              </li>
              <li className="flex items-center gap-1.5">
                <Clapperboard size={12} className="text-brand" /> 视频生成 / 智能剪辑 / 导出
              </li>
            </ul>
            <span className="inline-flex mt-6 text-sm font-semibold text-brand">进入画布 →</span>
          </button>

          {/* F-002: 制作台为次级入口（兼容） */}
          <button
            type="button"
            onClick={() => {
              if (active) void selectWorkspace(active.id);
              goStudio();
            }}
            className="group text-left rounded-[22px] border border-line bg-surface/80 p-7 shadow-[0_8px_28px_rgba(26,24,20,0.04)] hover:border-accent/30 hover:shadow-md transition-all"
          >
            <span className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
              <Clapperboard size={28} />
            </span>
            <h2 className="text-xl font-bold text-ink tracking-tight">制作台（兼容）</h2>
            <p className="text-sm text-ink/55 leading-relaxed mt-2">
              传统通告台模式：剧本 → 分镜表 → 出图批审 → 视频 → 导出。与画布同数据同源，功能对等。
            </p>
            <p className="mt-4 text-[12px] text-ink/40 leading-relaxed">
              与画布共享镜表与链数据，编辑内容在画布分镜台同样可见。
            </p>
            <span className="inline-flex mt-6 text-sm font-semibold text-accent">进入制作台 →</span>
          </button>
        </section>

        <p className="text-center text-[11px] text-ink/35">
          画布主入口 · 制作台与画布同源
        </p>
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-6"
          style={{ background: 'rgba(26, 24, 20, 0.72)' }}
          onClick={() => {
            if (!deleting) setPendingDelete(null);
          }}
        >
          <div
            className="w-[320px] rounded-2xl border border-line bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-semibold text-ink mb-1">
              移入回收站「{pendingDelete.title}」？
            </p>
            <p className="text-[12px] text-ink/55 mb-5 leading-relaxed">
              项目将移入回收站，30 天内可恢复。资产与数据在彻底删除前保留。
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
                className="px-3.5 py-2 rounded-xl text-[12px] text-ink/60 hover:bg-surface disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDeleteProject()}
                className="px-3.5 py-2 rounded-xl text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50"
              >
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* F-010: 回收站弹窗 */}
      {trashOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-6"
          style={{ background: 'rgba(26, 24, 20, 0.72)' }}
          onClick={() => setTrashOpen(false)}
        >
          <div
            className="w-[420px] max-h-[60vh] rounded-2xl border border-line bg-surface p-5 shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <TrashPanel onRestore={() => {
              // 刷新项目列表
              void selectWorkspace(active?.id ?? '');
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
