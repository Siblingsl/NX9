import { useState, useEffect, useMemo } from 'react';
import { BLOCK_GROUPS, PLAYBOOK_DEFINITIONS, type BlockCategory, type BlockDefinition } from '@nx9/shared';
import { Search, User, Image, Sparkles, Package, LayoutGrid } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { LogDockButton } from '../../../panels/LogPanel';
import { isSurfaceEnabled } from '../../../config/product-surface';
import { useStudioSurface } from '../../../stores/studio-surface';

type LaneId = 'character' | 'scene' | 'generate' | 'output';

const LANE_META: Record<
  LaneId,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; categories: BlockCategory[] }
> = {
  character: { label: '角色设定', icon: User, categories: ['craft'] },
  scene: { label: '场景机位', icon: Image, categories: ['source', 'spatial'] },
  generate: { label: '出图出片', icon: Sparkles, categories: ['generate', 'hub', 'integrate'] },
  output: { label: '合成导出', icon: Package, categories: ['support', 'utility'] },
};

interface ModuleDockProps {
  onPick: (def: BlockDefinition) => void;
}

function Glyph({ name }: { name: string }) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name];
  if (!Icon) return <span className="w-4 h-4 rounded bg-line" />;
  return <Icon size={16} className="text-accent" />;
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

const STEP_KINDS: Record<string, string[]> = {
  script: ['dialogue-sheet'],
  'script-breakdown': ['dialogue-sheet'],
  'scene-split': ['dialogue-sheet'],
  storyboard: ['asset-gate', 'storyboard-desk'],
  'story-grid': ['asset-gate', 'storyboard-desk'],
  'storyboard-preview': ['storyboard-desk'],
  'storyboard-desk': ['storyboard-desk'],
  'character-bible': [],
  'environment-bible': [],
  'camera-3d': ['director-3d'],
  'camera-live': ['director-desk'],
  'keyframe-gen': ['picture-gen', 'director-desk'],
  'keyframe-review': ['review-gate'],
  'video-gen': ['clip-gen'],
  consistency: ['continuity-check'],
  'episode-studio': ['clip-editor'],
  'review-gate': ['review-gate'],
  export: ['export-pack'],
  source: ['link-parser', 'asset-import'],
  analyze: ['link-parser', 'reference-board'],
  generate: ['picture-gen', 'clip-gen'],
};

export function ModuleDock({ onPick }: ModuleDockProps) {
  const [activeLane, setActiveLane] = useState<LaneId | null>(null);
  const [query, setQuery] = useState('');
  /** 制作台默认收起工具坞；专家编排才默认展开 */
  const expertWorkflow = useStudioSurface((s) => s.expertWorkflow);
  const [expanded, setExpanded] = useState(() => expertWorkflow);
  const session = useWorkspaceDocument((s) => s.playbookSession);
  const hasActivePlaybook =
    isSurfaceEnabled('playbookWizard') &&
    session &&
    !session.dismissed &&
    session.playbookId !== 'pb-blank-advanced';

  const currentStepKinds = useMemo(() => {
    if (!isSurfaceEnabled('playbookWizard') || !session || session.dismissed) return null;
    const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
    if (!def) return null;
    const step = def.steps.find((s) => s.id === session.currentStepId);
    if (!step) return null;
    return new Set(step.canvasNodeKinds ?? STEP_KINDS[step.id] ?? []);
  }, [session]);

  useEffect(() => {
    if (hasActivePlaybook) setExpanded(false);
  }, [hasActivePlaybook]);

  useEffect(() => {
    if (!expertWorkflow) {
      setExpanded(false);
      setActiveLane(null);
    }
  }, [expertWorkflow]);

  const panelItems = activeLane ? blocksForLane(activeLane, query) : [];
  const filteredItems = currentStepKinds && !expanded
    ? panelItems.filter((b) => currentStepKinds.has(b.kind))
    : panelItems;

  if (!expanded) {
    return (
      <aside className="nx9-module-dock shrink-0 border-r border-line bg-white/80 flex items-start justify-center pt-3 relative z-20"
        style={{ width: 'var(--nx9-dock-width)' }}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-surface text-ink/60"
          title="展开制作工具箱（⌘K 搜索）"
        >
          <LayoutGrid size={18} />
        </button>
        <div className="mt-auto pb-1">
          {isSurfaceEnabled('logPanel') && <LogDockButton />}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="nx9-module-dock shrink-0 border-r border-line bg-[#FFFCFA]/88 backdrop-blur-[var(--nx9-glass-blur)] flex h-full relative z-20"
      style={{ width: 'var(--nx9-dock-width)' }}
    >
      <div className="flex flex-col items-center py-3 gap-2 w-full h-full">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-surface text-ink/60 mb-1"
          title="收起制作工具箱"
        >
          <LayoutGrid size={18} />
        </button>
        {(Object.keys(LANE_META) as LaneId[]).map((lane) => {
          const Icon = LANE_META[lane].icon;
          return (
            <button
              key={lane}
              type="button"
              title={LANE_META[lane].label}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                activeLane === lane ? 'bg-brand/10 text-brand' : 'hover:bg-surface text-ink/60'
              }`}
              onMouseEnter={() => setActiveLane(lane)}
              onFocus={() => setActiveLane(lane)}
            >
              <Icon size={18} />
            </button>
          );
        })}
        <div className="mt-auto pb-1">
          {isSurfaceEnabled('logPanel') && <LogDockButton />}
        </div>
      </div>

      {activeLane && (
        <div
          className="absolute left-full top-0 h-full w-[240px] border-r border-line bg-[var(--nx9-glass)] backdrop-blur-[var(--nx9-glass-blur)] shadow-panel flex flex-col"
          onMouseLeave={() => {
            setActiveLane(null);
            setQuery('');
          }}
        >
          <div className="p-3 border-b border-line">
            <p className="text-xs font-semibold text-ink mb-2">{LANE_META[activeLane].label}</p>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索…"
                className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-line bg-white text-xs focus:outline-none focus:border-brand/40"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto nx9-scroll p-2 space-y-1">
            {!expanded && currentStepKinds && (
              <p className="text-[10px] text-brand/60 px-2 pb-1">当前步相关模块</p>
            )}
            {filteredItems.length === 0 && currentStepKinds && !expanded ? (
              <p className="text-[10px] text-ink/40 px-2">该步无需额外模块</p>
            ) : null}
            {(filteredItems.length > 0 || expanded ? filteredItems : panelItems).map((def) => (
              <button
                key={def.kind}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/nx9-block', def.kind);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => onPick(def)}
                className="w-full flex items-start gap-2 px-2 py-2 rounded-xl hover:bg-white text-left"
              >
                <span
                  className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${def.accent}14` }}
                >
                  <Glyph name={def.glyph} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-ink">{def.label}</span>
                  <span className="block text-[10px] text-ink/50 line-clamp-2">{def.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
