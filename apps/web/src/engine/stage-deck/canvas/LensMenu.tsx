import { useEffect, useMemo, useRef, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { getDockBlocks, lookupBlock, PLAYBOOK_DEFINITIONS, type BlockDefinition } from '@nx9/shared';
import * as Icons from 'lucide-react';
import { Plus } from 'lucide-react';
import { useWorkspaceDocument } from '../../../stores/workspace-document';

export interface LensMenuProps {
  x: number;
  y: number;
  filterKinds?: string[];
  onPick: (kind: string) => void;
  onClose: () => void;
}

const RADIUS = 98;
const RAIL_RADIUS = 98;
const TILE = 52;

function Glyph({ name }: { name: string }) {
  const Icon = (Icons as unknown as Record<string, ComponentType<{ size?: number }>>)[name];
  if (!Icon) return <Plus size={16} />;
  return <Icon size={16} />;
}

function filterBlocks(filterKinds?: string[]): BlockDefinition[] {
  const visible = getDockBlocks()
    .slice()
    .sort((a, b) => Number(Boolean(b.nx9Native)) - Number(Boolean(a.nx9Native)));
  if (!filterKinds?.length) return visible.slice(0, 6);
  return visible.filter((b) => filterKinds.includes(b.kind)).slice(0, 6);
}

/** Prefer upward fan; flip when pinned near viewport edges. */
function resolveArc(x: number, y: number): { startAngle: number; span: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const nearLeft = x < 170;
  const nearRight = x > vw - 170;
  const nearTop = y < 150;
  const nearBottom = y > vh - 150;

  if (nearTop && !nearBottom) return { startAngle: 25, span: 130 };
  if (nearLeft && !nearRight) return { startAngle: -55, span: 130 };
  if (nearRight && !nearLeft) return { startAngle: -205, span: 130 };
  return { startAngle: -155, span: 130 };
}

function polar(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

function arcPath(startAngle: number, span: number, radius: number): string {
  const steps = 28;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (span * i) / steps;
    const p = polar(a, radius);
    pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  }
  return pts.join(' ');
}

export function LensMenu({ x, y, filterKinds, onPick, onClose }: LensMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const session = useWorkspaceDocument((s) => s.playbookSession);
  const wireMode = Boolean(filterKinds?.length);

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
  const arc = useMemo(() => resolveArc(x, y), [x, y]);
  const fanDir = useMemo(() => {
    if (arc.startAngle > 0) return 'down';
    if (arc.startAngle > -90) return 'right';
    if (arc.startAngle < -180) return 'left';
    return 'up';
  }, [arc.startAngle]);
  const railD = useMemo(
    () => arcPath(arc.startAngle, arc.span, RAIL_RADIUS),
    [arc.startAngle, arc.span],
  );

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= items.length) {
        e.preventDefault();
        onPick(items[n - 1]!.kind);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, onClose, onPick]);

  const extent = RADIUS + TILE / 2 + 28;

  return createPortal(
    <>
      <button
        type="button"
        className="nx9-lens-menu__scrim"
        aria-label="关闭创建菜单"
        onClick={onClose}
      />
      <div
        ref={rootRef}
        className="nx9-lens-fan"
        data-fan={fanDir}
        style={{ left: x, top: y, width: extent * 2, height: extent * 2 }}
        role="dialog"
        aria-label={wireMode ? '连接并创建模块' : '快速创建模块'}
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className="nx9-lens-fan__pin" aria-hidden />
        <svg
          className="nx9-lens-fan__rail"
          viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
          aria-hidden
        >
          <path d={railD} className="nx9-lens-fan__rail-path" />
        </svg>

        <div className="nx9-lens-fan__hub" aria-hidden>
          <span>{wireMode ? '接' : '+'}</span>
        </div>

        {items.length === 0 ? (
          <div className="nx9-lens-fan__empty">无可创建模块</div>
        ) : (
          items.map((def, index) => {
            const angle =
              arc.startAngle + (items.length <= 1 ? arc.span / 2 : (arc.span / (items.length - 1)) * index);
            const pos = polar(angle, RADIUS);
            const meta = lookupBlock(def.kind);
            const accent = meta?.accent ?? 'var(--nx9-brand)';
            return (
              <button
                key={def.kind}
                type="button"
                className="nx9-lens-fan__tile"
                style={{
                  ['--ox' as string]: `${pos.x}px`,
                  ['--oy' as string]: `${pos.y}px`,
                  ['--lens-accent' as string]: accent,
                  animationDelay: `${40 + index * 32}ms`,
                }}
                title={`${index + 1} · ${def.hint || def.label}`}
                onClick={() => {
                  onPick(def.kind);
                  onClose();
                }}
              >
                <span className="nx9-lens-fan__tile-index">{index + 1}</span>
                <span className="nx9-lens-fan__tile-icon">
                  <Glyph name={def.glyph} />
                </span>
                <span className="nx9-lens-fan__tile-label">{def.label}</span>
              </button>
            );
          })
        )}

        <div className="nx9-lens-fan__caption">
          <strong>{wireMode ? '连接并创建' : '快速创建'}</strong>
          <span>Esc 关闭 · 1–6 选择</span>
        </div>
      </div>
    </>,
    document.body,
  );
}
