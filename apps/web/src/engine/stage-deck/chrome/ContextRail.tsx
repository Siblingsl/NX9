import { useState, useEffect } from 'react';
import { lookupBlock } from '@nx9/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GridGeneratePanel } from './GridGeneratePanel';
import { useFlowRuntime } from '../../../stores/flow-runtime';
import { useAliasStore } from '../stores/alias-store';
import { useContextRailUi, type ContextRailTab } from '../stores/context-rail-ui';
import { StoryboardRailPanel } from './rail/StoryboardRailPanel';
import { BacklotRailPanel } from './rail/BacklotRailPanel';
import { HistoryRailPanel } from './rail/HistoryRailPanel';
import { WorkflowRailPanel } from './rail/WorkflowRailPanel';
import { AgentRailPanel } from './rail/AgentRailPanel';

const TABS: { id: ContextRailTab; label: string }[] = [
  { id: 'props', label: '属性' },
  { id: 'storyboard', label: '分镜' },
  { id: 'backlot', label: 'Backlot' },
  { id: 'history', label: '历史' },
  { id: 'workflow', label: '工作流' },
  { id: 'agent', label: 'Agent' },
];

interface ContextRailProps {
  selectedBlockId: string | null;
}

export function ContextRail({ selectedBlockId }: ContextRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<ContextRailTab>('props');
  const requestedTab = useContextRailUi((s) => s.requestedTab);
  const clearRailRequest = useContextRailUi((s) => s.clearRequest);
  const alias = useAliasStore((s) =>
    selectedBlockId ? s.aliases[selectedBlockId] ?? '' : '',
  );
  const setAlias = useAliasStore((s) => s.setAlias);
  const runtime = useFlowRuntime((s) => s.runtime);
  const node = selectedBlockId ? runtime?.getNodes().find((n) => n.id === selectedBlockId) : undefined;
  const meta = lookupBlock(node?.type ?? '');

  useEffect(() => {
    if (!requestedTab) return;
    setTab(requestedTab);
    setCollapsed(false);
    clearRailRequest();
  }, [requestedTab, clearRailRequest]);

  if (collapsed) {
    return (
      <aside
        className="nx9-context-rail shrink-0 border-l border-line bg-white flex flex-col items-center py-4"
        style={{ width: 24 }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-1 rounded-lg hover:bg-surface text-ink/50"
          title="展开属性栏"
        >
          <ChevronLeft size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="nx9-context-rail shrink-0 border-l border-line bg-white flex flex-col h-full rounded-l-2xl overflow-hidden"
      style={{ width: 'var(--nx9-rail-width)' }}
    >
      <div className="flex items-center border-b border-line px-1 py-2 gap-0.5 overflow-x-auto nx9-scroll">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-medium ${
              tab === id ? 'bg-brand/10 text-brand' : 'text-ink/50 hover:bg-surface'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1 rounded-lg hover:bg-surface text-ink/50 shrink-0 ml-auto"
          title="收起"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto nx9-scroll p-4 text-sm">
        {tab === 'props' && (
          <div className="space-y-3">
            {!selectedBlockId ? (
              <p className="text-ink/50 text-xs">选中画布上的模块以查看属性</p>
            ) : (
              <>
                <div>
                  <p className="text-xs text-ink/50 mb-1">类型</p>
                  <p className="font-medium">{meta?.label ?? node?.type}</p>
                </div>
                <div>
                  <p className="text-xs text-ink/50 mb-1">别名</p>
                  <input
                    type="text"
                    value={alias}
                    onChange={(e) => selectedBlockId && setAlias(selectedBlockId, e.target.value)}
                    placeholder={meta?.label ?? '场景 A'}
                    className="w-full rounded-lg border border-line px-2 py-1.5 text-sm focus:outline-none focus:border-brand/40"
                  />
                </div>
                <div>
                  <p className="text-xs text-ink/50 mb-1">状态</p>
                  <p>{(node?.data?.status as string) ?? 'idle'}</p>
                </div>
              </>
            )}
          </div>
        )}
        {tab === 'storyboard' && (
          <div className="space-y-4">
            <StoryboardRailPanel selectedBlockId={selectedBlockId} />
            <GridGeneratePanel selectedBlockId={selectedBlockId} />
          </div>
        )}
        {tab === 'backlot' && <BacklotRailPanel />}
        {tab === 'history' && <HistoryRailPanel />}
        {tab === 'workflow' && <WorkflowRailPanel />}
        {tab === 'agent' && <AgentRailPanel />}
      </div>
    </aside>
  );
}
