import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface EntityCardProps {
  title: string;
  subtitle?: string;
  avatar?: string;
  layers?: Array<{ label: string; content: ReactNode }>;
  onOptimize?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}

export function EntityCard({
  title,
  subtitle,
  avatar,
  layers,
  onOptimize,
  actions,
  children,
}: EntityCardProps) {
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set());

  const toggleLayer = (idx: number) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-line bg-white overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        {avatar && (
          <img src={avatar} alt="" className="w-12 h-12 rounded-lg object-cover border border-line shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm text-ink">{title}</span>
            {onOptimize && (
              <button
                type="button"
                onClick={onOptimize}
                className="flex items-center gap-1 rounded-lg border border-brand/20 bg-brand/5 px-2 py-1 text-[10px] text-brand hover:bg-brand/10"
              >
                <Sparkles size={12} /> AI 优化
              </button>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-ink/50 mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {layers && layers.length > 0 && (
        <div className="border-t border-line">
          {layers.map((layer, idx) => (
            <div key={idx} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => toggleLayer(idx)}
                className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-surface/50"
              >
                <span className="text-[11px] font-medium text-ink/60">{layer.label}</span>
                {expandedLayers.has(idx) ? <ChevronUp size={14} className="text-ink/30" /> : <ChevronDown size={14} className="text-ink/30" />}
              </button>
              {expandedLayers.has(idx) && (
                <div className="px-4 pb-3">{layer.content}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {children && <div className="px-4 pb-4">{children}</div>}

      {actions && (
        <div className="flex items-center gap-2 px-4 py-3 bg-surface/30 border-t border-line">
          {actions}
        </div>
      )}
    </div>
  );
}
