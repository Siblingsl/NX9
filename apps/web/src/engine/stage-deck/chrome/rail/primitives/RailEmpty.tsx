interface RailEmptyProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function RailEmpty({ title, description, actionLabel, onAction }: RailEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-surface flex items-center justify-center text-ink/20">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="text-[11px] text-ink/50 leading-relaxed max-w-[200px]">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-xl bg-brand text-sm text-white px-4 py-2 hover:bg-brand/90"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
