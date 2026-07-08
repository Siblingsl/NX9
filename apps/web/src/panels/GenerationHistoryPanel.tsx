import { memo } from 'react';
import { Image, Music, Type, Video, X } from 'lucide-react';
import { useFlowRuntime } from '../stores/flow-runtime';
import { collectGenerationHistoryItems } from '../engine/stage-deck/utils/generation-history';

function kindIcon(kind: string) {
  if (kind.includes('clip') || kind.includes('video')) return Video;
  if (kind.includes('sound') || kind.includes('audio')) return Music;
  if (kind.includes('picture') || kind.includes('image')) return Image;
  return Type;
}

export const GenerationHistoryPanel = memo(function GenerationHistoryPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const runtime = useFlowRuntime((s) => s.runtime);
  const items = runtime ? collectGenerationHistoryItems(runtime.getNodes(), 40) : [];

  if (!open) return null;

  return (
    <aside className="w-[280px] shrink-0 border-l border-line bg-white flex flex-col h-full absolute right-0 top-0 z-20 shadow-panel">
      <div className="h-12 border-b border-line flex items-center px-3 gap-2">
        <span className="font-semibold text-sm flex-1">生成历史</span>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 nx9-scroll min-h-0">
        {items.length === 0 ? (
          <p className="text-xs text-ink/50 text-center py-8">运行模块后在此查看产物</p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => {
              const Icon = kindIcon(item.type);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full text-left rounded-xl border border-line px-2 py-2 hover:border-brand/30 flex gap-2 items-start"
                    onClick={() => {
                      runtime?.focusBlock(item.id);
                      onClose();
                    }}
                  >
                    <Icon size={14} className="text-accent shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-mono text-brand">{item.type}</p>
                      <p className="text-xs truncate">{item.label}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
});
