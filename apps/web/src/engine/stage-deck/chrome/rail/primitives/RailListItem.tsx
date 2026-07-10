import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface RailListItemProps {
  thumbnail?: ReactNode;
  title: string;
  subtitle?: string;
  onClick?: () => void;
}

export function RailListItem({ thumbnail, title, subtitle, onClick }: RailListItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-lg border border-line p-2 hover:border-brand/30 text-left"
    >
      {thumbnail && (
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface">
          {thumbnail}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink truncate">{title}</p>
        {subtitle && (
          <p className="text-[10px] text-ink/50 truncate">{subtitle}</p>
        )}
      </div>
      <ChevronRight size={14} className="text-ink/30 shrink-0" />
    </button>
  );
}
