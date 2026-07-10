import { BookOpen, Box, Camera, Clapperboard, Film, Headphones, PenTool, UserCircle, Zap, Sparkles } from 'lucide-react';
import { PLAYBOOK_DEFINITIONS, type PlaybookId, type PlaybookDefinition } from '@nx9/shared';

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Clapperboard,
  Film,
  Zap,
  PenTool,
  UserCircle,
  Headphones,
  Camera,
  Box,
};

function PlaybookCard({
  playbook,
  icon: Icon,
  onClick,
}: {
  playbook: PlaybookDefinition;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
}) {
  const catLabel =
    playbook.category === 'episode' ? '剧集'
    : playbook.category === 'short' ? '短视频'
    : playbook.category === 'asset' ? '资产'
    : '进阶';
  const catColor =
    playbook.category === 'episode' ? 'bg-purple-100 text-purple-700 border-purple-200'
    : playbook.category === 'short' ? 'bg-orange-100 text-orange-700 border-orange-200'
    : playbook.category === 'asset' ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-gray-100 text-gray-600 border-gray-200';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border px-3.5 py-3 transition-all ${
        playbook.featured
          ? 'border-brand/20 bg-brand/[0.03] hover:border-brand/50 hover:shadow-sm hover:bg-brand/[0.06]'
          : 'border-line bg-white/50 hover:border-brand/30 hover:bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          playbook.featured ? 'bg-brand/10 text-brand' : 'bg-surface text-ink/60'
        }`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{playbook.label}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${catColor}`}>
              {catLabel}
            </span>
          </div>
          <p className="text-[11px] text-ink/50 mt-0.5 line-clamp-2">{playbook.subtitle}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {playbook.estimatedMinutes > 0 && (
              <span className="text-[10px] text-ink/40">
                预计 {playbook.estimatedMinutes} 分钟
              </span>
            )}
            {playbook.steps.length > 0 && (
              <span className="text-[10px] text-ink/40">{playbook.steps.length} 步</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

interface PlaybookLauncherOverlayProps {
  onStartPlaybook: (playbookId: PlaybookId) => void;
  onOpenLibrary: () => void;
  onDismiss: () => void;
}

export function PlaybookLauncherOverlay({ onStartPlaybook, onOpenLibrary, onDismiss }: PlaybookLauncherOverlayProps) {
  const featured = PLAYBOOK_DEFINITIONS.filter((p) => p.featured);
  const advanced = PLAYBOOK_DEFINITIONS.filter((p) => !p.featured);

  const handlePick = (id: PlaybookId) => {
    if (id === 'pb-blank-advanced') {
      onDismiss();
      return;
    }
    onStartPlaybook(id);
  };

  return (
    <div className="absolute inset-0 z-[15] flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-2xl mx-4 rounded-2xl border border-line bg-[var(--nx9-glass)] backdrop-blur-[var(--nx9-glass-blur)] shadow-panel p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <Sparkles size={20} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">选择生产剧本</h2>
            <p className="text-sm text-ink/55 mt-0.5">
              按步骤引导完成创作流程，无需操心模块搭建
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {featured.map((pb) => {
            const Icon = iconMap[pb.icon] || Box;
            return (
              <PlaybookCard
                key={pb.id}
                playbook={pb}
                icon={Icon}
                onClick={() => handlePick(pb.id)}
              />
            );
          })}
        </div>

        {advanced.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-ink/40 mb-2 px-0.5">进阶</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {advanced.map((pb) => {
                const Icon = iconMap[pb.icon] || Box;
                return (
                  <PlaybookCard
                    key={pb.id}
                    playbook={pb}
                    icon={Icon}
                    onClick={() => handlePick(pb.id)}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-4 pt-1">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-ink/45 hover:text-ink/70 transition-colors"
          >
            空白画布 — 从左侧 Dock 拖入模块
          </button>
          <span className="text-ink/20 text-xs">|</span>
          <button
            type="button"
            onClick={onOpenLibrary}
            className="text-xs text-brand/70 hover:text-brand transition-colors flex items-center gap-1"
          >
            <BookOpen size={12} />
            进阶 Recipe
          </button>
        </div>
      </div>
    </div>
  );
}
