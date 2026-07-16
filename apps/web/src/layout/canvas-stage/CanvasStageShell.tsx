import { useMemo, useState } from 'react';
import {
  BLOCK_GROUPS,
  type BlockCategory,
  type BlockDefinition,
  type WorkspaceSummary,
} from '@nx9/shared';
import {
  Clapperboard,
  FolderOpen,
  History,
  Home,
  Layers,
  Package,
  Plus,
  Redo2,
  Search,
  Settings,
  Sparkles,
  Undo2,
  User,
  Image as ImageIcon,
  Zap,
} from 'lucide-react';
import * as Icons from 'lucide-react';
import type { UserSummary } from '@nx9/shared';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import './canvas-stage.css';

type LaneId = 'character' | 'scene' | 'generate' | 'output';

const LANE_META: Record<
  LaneId,
  { label: string; icon: React.ComponentType<{ size?: number }>; categories: BlockCategory[] }
> = {
  character: { label: '角色', icon: User, categories: ['craft'] },
  scene: { label: '场景', icon: ImageIcon, categories: ['source', 'spatial'] },
  generate: { label: '生成', icon: Sparkles, categories: ['generate', 'hub', 'integrate'] },
  output: { label: '输出', icon: Package, categories: ['support', 'utility'] },
};

function Glyph({ name }: { name: string }) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[name];
  if (!Icon) return <span className="w-3.5 h-3.5 rounded bg-white/20" />;
  return <Icon size={14} />;
}

function blocksForLane(lane: LaneId, query: string): BlockDefinition[] {
  const cats = new Set(LANE_META[lane].categories);
  const q = query.trim().toLowerCase();
  return Object.entries(BLOCK_GROUPS)
    .filter(([key]) => cats.has(key as BlockCategory))
    .flatMap(([, group]) => group.items)
    .filter(
      (b) =>
        !q ||
        b.label.toLowerCase().includes(q) ||
        b.hint.toLowerCase().includes(q) ||
        b.kind.includes(q),
    );
}

export interface CanvasStageShellProps {
  children: React.ReactNode;
  projects: WorkspaceSummary[];
  activeProjectId: string | null;
  batchRunning: boolean;
  batchProgress: { done: number; total: number };
  canUndo: boolean;
  canRedo: boolean;
  user: UserSummary | null;
  onGoHome: () => void;
  onGoStudio: () => void;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onPickBlock: (def: BlockDefinition) => void;
  onUndo: () => void;
  onRedo: () => void;
  onBatchRun: () => void;
  onOpenAssets: () => void;
  onOpenSettings: () => void;
  onOpenHistory?: () => void;
}

/**
 * 沉浸式舞台壳：全屏画布 + 浮动导航/工具岛。
 * 不改 StageDeck / FlowSurface 内部逻辑，只替换外围 IDE 布局。
 */
export function CanvasStageShell({
  children,
  projects,
  activeProjectId,
  batchRunning,
  batchProgress,
  canUndo,
  canRedo,
  user,
  onGoHome,
  onGoStudio,
  onSelectProject,
  onCreateProject,
  onPickBlock,
  onUndo,
  onRedo,
  onBatchRun,
  onOpenAssets,
  onOpenSettings,
  onOpenHistory,
}: CanvasStageShellProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [lane, setLane] = useState<LaneId>('generate');
  const [query, setQuery] = useState('');
  const canvasTheme = useWorkspaceDocument((s) => s.canvasAppearance.theme ?? 'dark');

  const items = useMemo(() => blocksForLane(lane, query), [lane, query]);
  const activeTitle = projects.find((p) => p.id === activeProjectId)?.title;

  return (
    <div className={`canvas-stage ${canvasTheme === 'dark' ? 'nx9-theme-dark' : 'nx9-theme-light'}`}>
      <div className="canvas-stage__viewport">{children}</div>
      <div className="canvas-stage__vignette" aria-hidden />

      {/* 左上：导航 + 项目 chips */}
      <div className="canvas-stage__float canvas-stage__top-left">
        <div className="cs-glass cs-nav">
          <span className="cs-mark">N9</span>
          <button type="button" className="cs-btn" onClick={onGoHome} title="导航">
            <Home size={14} /> 导航
          </button>
          <button type="button" className="cs-btn" onClick={onGoStudio} title="制作台">
            <Clapperboard size={14} /> 制作台
          </button>
          <span className="text-[10px] opacity-40 px-1 hidden sm:inline">舞台精调</span>
        </div>

        <div className="cs-glass cs-projects">
          {projects.slice(0, 8).map((p) => (
            <button
              key={p.id}
              type="button"
              className={`cs-project ${p.id === activeProjectId ? 'is-on' : ''}`}
              onClick={() => onSelectProject(p.id)}
              title={p.title}
            >
              {p.title}
            </button>
          ))}
          <button type="button" className="cs-project" onClick={onCreateProject} title="新建">
            + 项目
          </button>
        </div>
      </div>

      {/* 右上：状态 + 设置 */}
      <div className="canvas-stage__float canvas-stage__top-right">
        {batchRunning && (
          <div className="cs-glass cs-status">
            <Sparkles size={12} className="text-teal-300" />
            生成中{' '}
            <b>
              {batchProgress.done}/{batchProgress.total}
            </b>
          </div>
        )}
        <div className="cs-glass cs-nav">
          {activeTitle && (
            <span className="text-[11px] opacity-55 px-2 max-w-[120px] truncate hidden md:inline">
              {activeTitle}
            </span>
          )}
          {user && (
            <span className="text-[11px] opacity-45 px-1 max-w-[72px] truncate">{user.name}</span>
          )}
          {onOpenHistory && (
            <button type="button" className="cs-btn" onClick={onOpenHistory} title="历史">
              <History size={14} />
            </button>
          )}
          <button type="button" className="cs-btn" onClick={onOpenSettings} title="设置">
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* 底部：工具面板 + 命令岛 */}
      <div className="canvas-stage__float canvas-stage__bottom">
        {toolsOpen && (
          <div className="cs-glass cs-tool-panel">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-[11px] font-bold opacity-50 tracking-wide uppercase">
                添加能力
              </span>
              <button type="button" className="cs-btn !py-1" onClick={() => setToolsOpen(false)}>
                收起
              </button>
            </div>
            <div className="cs-tool-lanes">
              {(Object.keys(LANE_META) as LaneId[]).map((id) => {
                const Icon = LANE_META[id].icon;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`cs-lane ${lane === id ? 'is-on' : ''}`}
                    onClick={() => setLane(id)}
                  >
                    <Icon size={12} />
                    {LANE_META[id].label}
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <Search
                size={12}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
              />
              <input
                className="cs-tool-search !pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索能力… 也可 ⌘K"
              />
            </div>
            <div className="cs-tool-list">
              {items.map((def) => (
                <button
                  key={def.kind}
                  type="button"
                  className="cs-tool-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/nx9-block', def.kind);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => {
                    onPickBlock(def);
                    setToolsOpen(false);
                  }}
                >
                  <strong className="inline-flex items-center gap-1.5">
                    <Glyph name={def.glyph} />
                    {def.label}
                  </strong>
                  <span>{def.hint}</span>
                </button>
              ))}
              {items.length === 0 && (
                <p className="text-[11px] text-white/35 col-span-2 text-center py-6">无匹配能力</p>
              )}
            </div>
          </div>
        )}

        <div className="cs-glass cs-island">
          <button
            type="button"
            className={`cs-btn ${toolsOpen ? 'is-on' : ''}`}
            onClick={() => setToolsOpen((v) => !v)}
            title="添加能力模块"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">能力</span>
          </button>

          <div className="cs-island-divider" />

          <button type="button" className="cs-btn" disabled={!canUndo} onClick={onUndo} title="撤销">
            <Undo2 size={15} />
          </button>
          <button type="button" className="cs-btn" disabled={!canRedo} onClick={onRedo} title="重做">
            <Redo2 size={15} />
          </button>

          <div className="cs-island-divider" />

          <button type="button" className="cs-btn" onClick={onOpenAssets} title="素材库">
            <FolderOpen size={15} />
            <span className="hidden sm:inline">素材</span>
          </button>
          <button
            type="button"
            className="cs-btn"
            onClick={() => {
              /* 提示用户用快捷键；命令面板在画布内 */
              window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
              );
              window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
              );
            }}
            title="命令面板 ⌘K"
          >
            <Layers size={15} />
            <span className="hidden sm:inline">命令</span>
          </button>

          <div className="cs-island-divider" />

          <button
            type="button"
            className="cs-btn-primary"
            disabled={batchRunning}
            onClick={onBatchRun}
            title="批量运行"
          >
            <Zap size={15} />
            {batchRunning
              ? `${batchProgress.done}/${batchProgress.total}`
              : '运行'}
          </button>
        </div>

        <p className="cs-hint">拖拽能力到舞台 · 连线精调 · 与制作台共享项目数据</p>
      </div>
    </div>
  );
}
