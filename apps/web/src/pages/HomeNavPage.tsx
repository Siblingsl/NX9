import { Clapperboard, Film, LayoutGrid, Plus, Settings, Sparkles } from 'lucide-react';
import { useWorkspaceCatalog } from '../stores/workspace-catalog';
import { useAppSurface } from '../stores/app-surface';
import { isPrivateWorkspace } from '@nx9/shared';
import { useCreateWorkspaceDialogUi } from '../stores/create-workspace-dialog-ui';
import { useCredentialVault } from '../stores/credential-vault';

/**
 * 应用导航页：选择制作台 或 高级画布。
 * 视觉与制作台「通告台」语言一致，不复用抽屉/节点壳。
 */
export function HomeNavPage() {
  const items = useWorkspaceCatalog((s) => s.items);
  const activeId = useWorkspaceCatalog((s) => s.activeId);
  const selectWorkspace = useWorkspaceCatalog((s) => s.selectWorkspace);
  const goStudio = useAppSurface((s) => s.goStudio);
  const goCanvas = useAppSurface((s) => s.goCanvas);
  const openCreate = useCreateWorkspaceDialogUi((s) => s.openDialog);
  const toggleSettings = useCredentialVault((s) => s.toggleSettings);

  const projects = items.filter(isPrivateWorkspace);
  const active = projects.find((p) => p.id === activeId) ?? projects[0];

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
              <p className="text-sm text-ink/50 mt-0.5">选择工作面 · 做剧从制作台开始</p>
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
              onClick={() => toggleSettings(true)}
              className="p-2.5 rounded-xl border border-line bg-white/80 text-ink/50 hover:text-ink"
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
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void selectWorkspace(p.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs transition-all ${
                    p.id === active?.id
                      ? 'border-brand/40 bg-brand/10 text-brand font-semibold shadow-sm'
                      : 'border-line/80 bg-white/70 text-ink/55 hover:border-brand/25'
                  }`}
                >
                  {p.title}
                </button>
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
          <button
            type="button"
            onClick={() => {
              if (active) void selectWorkspace(active.id);
              goStudio();
            }}
            className="group text-left rounded-[22px] border border-brand/20 bg-gradient-to-br from-white via-[#fffcf7] to-brand/[0.06] p-7 shadow-[0_12px_40px_rgba(30,58,95,0.07)] hover:border-brand/40 hover:shadow-lg transition-all"
          >
            <span className="w-14 h-14 rounded-2xl bg-brand/12 text-brand flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
              <Clapperboard size={28} />
            </span>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-ink tracking-tight">制作台</h2>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand/10 text-brand">
                推荐
              </span>
            </div>
            <p className="text-sm text-ink/55 leading-relaxed mt-2">
              导演通告式主工作面：剧本 → 分镜表 → 出图批审 → 视频 → 导出。一步一舞台，提示完整，适合日常做剧。
            </p>
            <ul className="mt-4 space-y-1.5 text-[12px] text-ink/45">
              <li className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-brand" /> AI / 规则拆镜
              </li>
              <li className="flex items-center gap-1.5">
                <Film size={12} className="text-brand" /> 镜头卡编辑与批审
              </li>
              <li className="flex items-center gap-1.5">
                <Clapperboard size={12} className="text-brand" /> 批量出图 / 出视频 / 拼接导出
              </li>
            </ul>
            <span className="inline-flex mt-6 text-sm font-semibold text-brand">进入制作台 →</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (active) void selectWorkspace(active.id);
              goCanvas();
            }}
            className="group text-left rounded-[22px] border border-line bg-white/80 p-7 shadow-[0_8px_28px_rgba(26,24,20,0.04)] hover:border-accent/30 hover:shadow-md transition-all"
          >
            <span className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
              <LayoutGrid size={28} />
            </span>
            <h2 className="text-xl font-bold text-ink tracking-tight">高级画布</h2>
            <p className="text-sm text-ink/55 leading-relaxed mt-2">
              节点连线与自由编排，给专家精调用。原型与 UI 将单独重构，不作为默认做剧入口。
            </p>
            <p className="mt-4 text-[12px] text-ink/40 leading-relaxed">
              无右侧抽屉。需要复杂工作流、自定义节点时再进入。
            </p>
            <span className="inline-flex mt-6 text-sm font-semibold text-accent">进入高级画布 →</span>
          </button>
        </section>

        <p className="text-center text-[11px] text-ink/35">
          制作台与画布分离 · 无右侧功能抽屉 · 镜头表为事实来源
        </p>
      </div>
    </div>
  );
}
