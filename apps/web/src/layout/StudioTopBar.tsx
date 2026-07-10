import { useEffect, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  Clapperboard,
  Redo2,
  Undo2,
  User,
  Zap,
} from 'lucide-react';
import { ModeCapsule } from '../engine/stage-deck/chrome/ModeCapsule';
import { ProductionWall } from '../engine/stage-deck/chrome/ProductionWall';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useTranslate } from '../hooks/use-translate';
import { StudioOverflowMenu } from './StudioOverflowMenu';
import { StudioDropdownPanel } from './StudioDropdownPanel';
import { isDesktop } from '../platform/runtime-bridge';
import type { UserSummary } from '@nx9/shared';

export interface StudioTopBarProps {
  batchPhase: 'idle' | 'running' | 'cancelled';
  batchProgress: { done: number; total: number };
  batchTaskProgress?: number;
  storyboardOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  user: UserSummary | null;
  users: UserSummary[];
  remotionOpen: boolean;
  usageOpen: boolean;
  assetLibOpen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleStoryboard: () => void;
  onOpenDirector3d: () => void;
  onBatchRun: () => void;
  onSetUser: (user: UserSummary) => void;
  onCreateUser: (name: string) => void;
  onToggleRemotion: () => void;
  onToggleUsage: () => void;
  onOpenBacklot: () => void;
  onOpenWorkflowTemplates: () => void;
  onOpenHistory: () => void;
  onToggleAssetLib: () => void;
  onOpenSkills: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
}

export function StudioTopBar({
  batchPhase,
  batchProgress,
  batchTaskProgress,
  storyboardOpen,
  canUndo,
  canRedo,
  user,
  users,
  remotionOpen,
  usageOpen,
  assetLibOpen,
  onUndo,
  onRedo,
  onToggleStoryboard,
  onOpenDirector3d,
  onBatchRun,
  onSetUser,
  onCreateUser,
  onToggleRemotion,
  onToggleUsage,
  onOpenBacklot,
  onOpenWorkflowTemplates,
  onOpenHistory,
  onToggleAssetLib,
  onOpenSkills,
  onOpenShortcuts,
  onOpenSettings,
}: StudioTopBarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userAnchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [userMenuOpen]);

  const running = batchPhase === 'running';
  const playbookSession = useWorkspaceDocument((s) => s.playbookSession);
  const hasActivePlaybook = playbookSession && !playbookSession.dismissed;
  const projectStatus = useWorkspaceDocument((s) => s.projectStatus);
  const t = useTranslate();

  return (
    <header className="nx9-topbar shrink-0 border-b border-line/80 bg-white/90 backdrop-blur-md">
      <div className="flex h-12 items-center gap-3 px-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0 min-w-0">
          <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-brand to-accent flex items-center justify-center text-white font-bold text-xs shadow-sm">
            N9
          </div>
          <div className="hidden md:block min-w-0">
            <h1 className="text-[13px] font-semibold leading-none text-ink tracking-tight">
              NX9 Studio
            </h1>
            <p className="text-[10px] text-ink/45 mt-0.5 leading-none">
              {t(isDesktop() ? 'Desktop' : 'Web')} · {t('AI Workflow')}
            </p>
          </div>
        </div>

        <div className="w-px h-7 bg-line/80 shrink-0 hidden sm:block" aria-hidden />

        {/* Mode + status */}
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-center overflow-x-auto nx9-scroll">
          <ModeCapsule />
          <ProductionWall />
        </div>

        {/* Project status badge */}
        {hasActivePlaybook && (
          <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-medium">
            {projectStatus === 'draft' ? '草稿' :
             projectStatus === 'generating' ? '生成中' :
             projectStatus === 'paused' ? '已暂停' :
             projectStatus === 'completed' ? '已完成' :
             projectStatus === 'exported' ? '已导出' :
             projectStatus === 'archived' ? '已归档' :
             '进行中'}
          </span>
        )}

        <div className="w-px h-7 bg-line/80 shrink-0 hidden md:block" aria-hidden />

        {/* Primary actions */}
        <div className="flex items-center gap-1 shrink-0 overflow-visible">
          <div className="hidden sm:flex items-center gap-0.5 mr-0.5">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="nx9-topbar-icon-btn disabled:opacity-30"
              title="撤销 Ctrl+Z"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="nx9-topbar-icon-btn disabled:opacity-30"
              title="重做 Ctrl+Y"
            >
              <Redo2 size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleStoryboard}
            className={`nx9-topbar-pill ${storyboardOpen ? 'nx9-topbar-pill--active' : ''}`}
            title="故事板 (B)"
          >
            <Clapperboard size={14} />
            <span className="hidden xl:inline">故事板</span>
          </button>

          <button
            type="button"
            onClick={onOpenDirector3d}
            className="nx9-topbar-pill hidden lg:flex"
            title="3D 导演台"
          >
            <Box size={14} />
            <span className="hidden xl:inline">3D 导演台</span>
          </button>

          <button
            type="button"
            onClick={onBatchRun}
            disabled={running}
            className="nx9-topbar-cta"
            title="批量运行"
          >
            <Zap size={14} />
            <span className="hidden sm:inline">批量运行</span>
            {running && (
              <span className="text-[10px] opacity-80 tabular-nums">
                {batchProgress.done}/{batchProgress.total}
                {batchTaskProgress != null && batchTaskProgress > 0 && ` · ${batchTaskProgress}%`}
              </span>
            )}
          </button>

          <StudioOverflowMenu
            remotionOpen={remotionOpen}
            usageOpen={usageOpen}
            assetLibOpen={assetLibOpen}
            onToggleRemotion={onToggleRemotion}
            onToggleUsage={onToggleUsage}
            onOpenBacklot={onOpenBacklot}
            onOpenWorkflowTemplates={onOpenWorkflowTemplates}
            onOpenHistory={onOpenHistory}
            onToggleAssetLib={onToggleAssetLib}
            onOpenSkills={onOpenSkills}
            onOpenShortcuts={onOpenShortcuts}
            onOpenSettings={onOpenSettings}
          />

          {/* User */}
          <div className="relative ml-0.5">
            <button
              ref={userAnchorRef}
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-line/80 bg-surface/50 pl-1.5 pr-2 py-1 hover:border-brand/25 hover:bg-brand/5 transition-colors"
              title="切换用户"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
            >
              <span className="w-6 h-6 rounded-md bg-brand/10 text-brand flex items-center justify-center">
                <User size={13} />
              </span>
              <span className="text-[12px] text-ink/70 max-w-[72px] truncate hidden sm:inline">
                {user?.name ?? '用户'}
              </span>
              <ChevronDown size={12} className="text-ink/35 hidden sm:block" />
            </button>

            <StudioDropdownPanel
              anchorRef={userAnchorRef}
              open={userMenuOpen}
              onClose={() => setUserMenuOpen(false)}
              width={176}
              className="py-1"
            >
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSetUser(u);
                    setUserMenuOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-2 text-left text-[13px] ${
                    u.id === user?.id
                      ? 'bg-brand/8 text-brand font-medium'
                      : 'text-ink/75 hover:bg-surface'
                  }`}
                >
                  {u.name}
                </button>
              ))}
              <div className="my-1 h-px bg-line" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const name = window.prompt('新用户名');
                  if (name) onCreateUser(name);
                  setUserMenuOpen(false);
                }}
                className="flex w-full items-center px-3 py-2 text-left text-[13px] text-brand hover:bg-brand/5"
              >
                + 新建用户
              </button>
            </StudioDropdownPanel>
          </div>
        </div>
      </div>
    </header>
  );
}
