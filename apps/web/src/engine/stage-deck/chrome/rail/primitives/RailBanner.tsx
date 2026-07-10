import { AlertTriangle, Eye } from 'lucide-react';

interface RailBannerProps {
  kind: 'review' | 'blocked';
  shotCount: number;
  onAction?: () => void;
}

export function RailBanner({ kind, shotCount, onAction }: RailBannerProps) {
  const config = kind === 'review'
    ? { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', icon: Eye, label: '待审阅' }
    : { bg: 'bg-red-50 border-red-200', text: 'text-red-800', icon: AlertTriangle, label: '已阻断' };

  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-2 rounded-lg border ${config.bg} px-3 py-2`}>
      <Icon size={14} className={config.text} />
      <span className={`text-xs font-medium flex-1 ${config.text}`}>
        {kind === 'review' ? `待审阅 ${shotCount} 镜` : `阻断 ${shotCount} 镜`}
      </span>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="text-xs font-medium text-brand hover:underline"
        >
          网格批审
        </button>
      )}
    </div>
  );
}
