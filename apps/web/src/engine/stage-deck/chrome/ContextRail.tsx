import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { useContextRailUi, type ContextRailTab } from '../stores/context-rail-ui';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { RailShell } from './rail/primitives/RailShell';
import { RailTabs } from './rail/primitives/RailTabs';
import { InspectorRailPanel } from './rail/InspectorRailPanel';
import { StoryboardRailPanel } from './rail/StoryboardRailPanel';
import { ScriptStudioPanel } from './rail/ScriptStudioPanel';
import { LibraryRailPanel } from './rail/LibraryRailPanel';
import { NextStepBanner } from './rail/NextStepBanner';

const RAIL_MIN = 280;
const RAIL_MAX = 400;
const RAIL_DEFAULT = 320;

interface ContextRailProps {
  selectedBlockId: string | null;
}

export function ContextRail({ selectedBlockId }: ContextRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<ContextRailTab>('inspector');
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT);
  const requestedTab = useContextRailUi((s) => s.requestedTab);
  const clearRailRequest = useContextRailUi((s) => s.clearRequest);
  const theme = useWorkspaceDocument((s) => s.canvasAppearance.theme);
  const isDark = theme === 'dark';
  const railBg = isDark ? 'bg-[#222]' : 'bg-white';
  const railBorder = isDark ? 'border-white/10' : 'border-line';
  const dragRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(RAIL_DEFAULT);

  // 拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = railWidth;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [railWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const delta = startXRef.current - e.clientX;
    const newWidth = Math.min(RAIL_MAX, Math.max(RAIL_MIN, startWidthRef.current + delta));
    setRailWidth(newWidth);
    document.documentElement.style.setProperty('--nx9-rail-width', `${newWidth}px`);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleMouseMove]);

  useEffect(() => {
    if (!requestedTab) return;
    setTab(requestedTab);
    setCollapsed(false);
    clearRailRequest();
  }, [requestedTab, clearRailRequest]);

  if (collapsed) {
    return (
      <aside
        className={`nx9-context-rail shrink-0 border-l ${railBorder} ${railBg} flex flex-col items-center py-4`}
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
      className={`nx9-context-rail shrink-0 border-l ${railBorder} ${railBg} flex flex-col h-full overflow-hidden relative ${isDark ? 'nx9-rail-dark' : ''}`}
      style={{ width: railWidth }}
    >
      {/* 拖拽手柄 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-10 group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-ink/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <RailShell
        tabs={
          <div className={`flex min-w-0 items-center border-b ${railBorder}`}>
            <RailTabs active={tab} onChange={setTab} />
            <button
              type="button"
              onClick={() => {
                setCollapsed(true);
                document.documentElement.style.setProperty('--nx9-rail-width', `${RAIL_DEFAULT}px`);
              }}
              className="p-1 rounded-lg hover:bg-surface text-ink/50 shrink-0 ml-auto"
              title="收起"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        }
      >
        <NextStepBanner />
        {tab === 'inspector' && <InspectorRailPanel selectedBlockId={selectedBlockId} />}
        {tab === 'storyboard' && <StoryboardRailPanel selectedBlockId={selectedBlockId} />}
        {tab === 'script' && <ScriptStudioPanel />}
        {tab === 'library' && <LibraryRailPanel />}
      </RailShell>
    </aside>
  );
}
