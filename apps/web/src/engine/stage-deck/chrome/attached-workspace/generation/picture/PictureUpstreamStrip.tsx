import { useRef } from 'react';
import { X } from 'lucide-react';
import { setMediaPinDragData } from '../../../../../media-pin-drag';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface PictureUpstreamStripProps {
  urls: string[];
  /** 已在 prompt 中 @ 引用的 URL（高亮） */
  mentionedUrls?: string[];
  excludedUrls?: string[];
  /** 点击插入 @；index 为上游列表中的 0-based 下标 */
  onSelect?: (url: string, index: number) => void;
  onExclude?: (url: string) => void;
  onRestoreExcluded?: () => void;
  /** 拖出钉图时的来源节点 id */
  sourceBlockId?: string;
}

/** 上游图独立展示区 — 无内容时不渲染；样式由父级双列布局承载 */
export function PictureUpstreamStrip({
  urls,
  mentionedUrls = [],
  excludedUrls = [],
  onSelect,
  onExclude,
  onRestoreExcluded,
  sourceBlockId,
}: PictureUpstreamStripProps) {
  const draggedRef = useRef(false);
  const visible = urls
    .map((url, index) => ({ url, index }))
    .filter(({ url }) => !excludedUrls.includes(url));
  if (visible.length === 0 && excludedUrls.length === 0) return null;

  return (
    <div className="min-w-0 flex flex-col gap-1.5 nodrag nopan" onMouseDown={stop}>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-medium text-ink/50 tracking-wide">上游传入</span>
        <span className="text-[9px] text-ink/30 tabular-nums">{visible.length}</span>
        <span className="text-[9px] text-ink/28">点击 @ · 拖出钉图</span>
        {excludedUrls.length > 0 && onRestoreExcluded && (
          <button
            type="button"
            onMouseDown={stop}
            onClick={onRestoreExcluded}
            className="ml-auto text-[9px] text-ink/40 hover:text-brand shrink-0"
          >
            恢复已排除 ({excludedUrls.length})
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="text-[10px] text-ink/35 py-1">上游图已全部排除</p>
      ) : (
        <div className="flex items-center gap-1.5 overflow-x-auto nx9-scroll pb-0.5">
          {visible.map(({ url, index }) => {
            const active = mentionedUrls.includes(url);
            return (
              <button
                key={`${url}-${index}`}
                type="button"
                draggable
                onMouseDown={stop}
                onDragStart={(e) => {
                  draggedRef.current = true;
                  const img = e.currentTarget.querySelector('img');
                  setMediaPinDragData(
                    e.dataTransfer,
                    {
                      url,
                      source: 'upstream',
                      label: `上游 ${index + 1}`,
                      sourceBlockId,
                    },
                    img,
                  );
                }}
                onDragEnd={() => {
                  window.setTimeout(() => {
                    draggedRef.current = false;
                  }, 0);
                }}
                onClick={() => {
                  if (draggedRef.current) return;
                  onSelect?.(url, index);
                }}
                className={`relative w-14 h-14 rounded-lg overflow-hidden border shrink-0 transition-all cursor-grab active:cursor-grabbing ${
                  active
                    ? 'border-brand/50 ring-1 ring-brand/25'
                    : 'border-line/40 hover:border-brand/30'
                }`}
                title={`点击插入 @上游:图${index + 1} · 拖出钉到画布`}
              >
                <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent text-white text-[8px] text-center py-0.5 pointer-events-none">
                  上游{index + 1}
                </span>
                {onExclude && (
                  <button
                    type="button"
                    onMouseDown={stop}
                    onClick={(e) => {
                      e.stopPropagation();
                      onExclude(url);
                    }}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-ink/50 text-white opacity-0 hover:opacity-100 focus:opacity-100"
                    title="排除此上游图"
                  >
                    <X size={9} />
                  </button>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
