import { ExternalLink, Image, Music, Terminal, Type, Video } from 'lucide-react';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useExecutionQueue } from '../../../../../stores/execution-queue';
import { useActivityLog } from '../../../../../stores/activity-log';
import { collectGenerationHistoryItems } from '../../../utils/generation-history';

function kindIcon(kind: string) {
  if (kind.includes('clip') || kind.includes('video')) return Video;
  if (kind.includes('sound') || kind.includes('audio')) return Music;
  if (kind.includes('picture') || kind.includes('image')) return Image;
  return Type;
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) || url.includes('/media/');
}

export function LibraryHistorySubPanel() {
  const runtime = useFlowRuntime((s) => s.runtime);
  const batchPhase = useExecutionQueue((s) => s.phase);
  const batchTaskId = useExecutionQueue((s) => s.taskId);
  const toggleLog = useActivityLog((s) => s.toggle);
  void batchPhase;
  void batchTaskId;

  const items = runtime ? collectGenerationHistoryItems(runtime.getNodes(), 24) : [];

  return (
    <div className="space-y-2 text-xs">
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
                      className="w-12 h-12 rounded-lg object-cover shrink-0 bg-surface"
                    />
                  ) : (
                    <span className="w-12 h-12 rounded-lg bg-surface flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-brand" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-mono text-brand truncate">{item.type}</span>
                    <span className="block truncate text-ink/80 text-xs">{item.label}</span>
                  </span>
                  <ExternalLink size={12} className="text-ink/30 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 && (
        <button
          type="button"
          onClick={() => toggleLog(true)}
          className="w-full flex items-center justify-center gap-1 rounded-xl border border-line py-2 text-xs hover:border-brand/40"
        >
          <Terminal size={12} />
          在日志中查看
        </button>
      )}
    </div>
  );
}
