import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getDockBlocks, lookupBlock, PLAYBOOK_DEFINITIONS, type BlockDefinition } from '@nx9/shared';
import * as Icons from 'lucide-react';
import { useWorkspaceDocument } from '../../../stores/workspace-document';

export interface LensMenuProps {
  x: number;
  y: number;
  filterKinds?: string[];
  onPick: (kind: string) => void;
  onClose: () => void;
}

function Glyph({ name }: { name: string }) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[name];
  if (!Icon) return null;
  return <Icon size={16} />;
}

function filterBlocks(filterKinds?: string[]): BlockDefinition[] {
  const visible = getDockBlocks()
    .slice()
    .sort((a, b) => Number(Boolean(b.nx9Native)) - Number(Boolean(a.nx9Native)));
  if (!filterKinds?.length) return visible.slice(0, 6);
  return visible.filter((b) => filterKinds.includes(b.kind)).slice(0, 6);
}

export function LensMenu({ x, y, filterKinds, onPick, onClose }: LensMenuProps) {
  const session = useWorkspaceDocument((s) => s.playbookSession);
  const currentStepKinds = useMemo(() => {
    if (!session || session.dismissed) return null;
    const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
    if (!def) return null;
    const step = def.steps.find((s) => s.id === session.currentStepId);
    if (!step) return null;
    return new Set(step.canvasNodeKinds ?? []);
  }, [session]);

  const baseItems = filterBlocks(filterKinds);
  const items = currentStepKinds ? baseItems.filter((b) => currentStepKinds.has(b.kind)) : baseItems;
  const radius = 72;
  const startAngle = -150;
  const span = 120;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[90] cursor-default"
        aria-label="关闭创建菜单"
        onClick={onClose}
      />
      <div className="fixed z-[91] pointer-events-none" style={{ left: x, top: y }}>
        {items.map((def, index) => {
          const angle = startAngle + (items.length <= 1 ? 0 : (span / (items.length - 1)) * index);
          const rad = (angle * Math.PI) / 180;
          const left = Math.cos(rad) * radius;
          const top = Math.sin(rad) * radius;
          const meta = lookupBlock(def.kind);
          return (
            <button
              key={def.kind}
              type="button"
              className="nx9-lens-menu__item pointer-events-auto absolute flex flex-col items-center gap-1 w-16 -translate-x-1/2 -translate-y-1/2"
              style={{ left, top }}
              onClick={() => {
                onPick(def.kind);
                onClose();
              }}
              title={def.hint}
            >
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-panel border border-line bg-white hover:border-brand/40"
                style={{ color: meta?.accent ?? 'var(--nx9-accent)' }}
              >
                <Glyph name={def.glyph} />
              </span>
              <span className="text-[10px] font-medium text-ink text-center leading-tight">
                {def.label}
              </span>
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}
