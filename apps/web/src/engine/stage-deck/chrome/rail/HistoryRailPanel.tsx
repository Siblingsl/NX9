import { ExternalLink, Image, Music, Type, Video } from 'lucide-react';
import { useFlowRuntime } from '../../../../stores/flow-runtime';
import { useExecutionQueue } from '../../../../stores/execution-queue';
import { collectGenerationHistoryItems } from '../../utils/generation-history';

function kindIcon(kind: string) {
  if (kind.includes('clip') || kind.includes('video')) return Video;
  if (kind.includes('sound') || kind.includes('audio')) return Music;
  if (kind.includes('picture') || kind.includes('image')) return Image;
  return Type;
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) || url.includes('/media/');
}

export function HistoryRailPanel() {
  const runtime = useFlowRuntime((s) => s.runtime);
  const batchPhase = useExecutionQueue((s) => s.phase);
  const batchTaskId = useExecutionQueue((s) => s.taskId);
  void batchPhase;
  void batchTaskId;

  const items = runtime ? collectGenerationHistoryItems(runtime.getNodes(), 24) : [];

  return (
    <div className="space-y-2 text-xs">
      <p className="text-ink/50 leading-relaxed">
        画布模块的生成产物。点击定位到对应模块；完整列表仍可用顶栏「生成历史」。
      </p>
      {items.length === 0 ? (
        <p className="text-ink/50 py-4 text-center">运行模块后产物会出现在此</p>
      ) : (
        <ul className="space-y-1.5 max-h-[min(420px,50vh)] overflow-y-auto nx9-scroll">
          {items.map((item) => {
            const Icon = kindIcon(item.type);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => runtime?.focusBlock(item.id)}
                  className="w-full flex items-center gap-2 rounded-xl border border-line p-2 hover:border-brand/30 text-left"
                >
                  {item.url && isImageUrl(item.url) ? (
                    <img
                      src={item.url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0 bg-surface"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-brand" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-mono text-brand truncate">{item.type}</span>
                    <span className="block truncate text-ink/80">{item.label}</span>
                  </span>
                  <ExternalLink size={12} className="text-ink/30 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
