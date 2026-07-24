import { useRef, useState } from 'react';
import { Expand, Trash2 } from 'lucide-react';
import { setMediaPinDragData } from '../../../../../media-pin-drag';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface PictureResultGalleryProps {
  urls: string[];
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  /** 确认后删除第 index 张生成图 */
  onDelete?: (index: number) => void;
  /** 拖出钉图时的来源节点 id */
  sourceBlockId?: string;
  /** @deprecated 空列表直接不渲染，保留以免调用方报错 */
  emptyHint?: string;
  showLabel?: boolean;
}

/** 工作区内生成结果条 — 无结果时不渲染；样式由父级双列布局承载 */
export function PictureResultGallery({
  urls,
  selectedIndex = 0,
  onSelect,
  onDelete,
  sourceBlockId,
  showLabel = true,
}: PictureResultGalleryProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const draggedRef = useRef(false);

  if (urls.length === 0) return null;

  const pendingUrl = pendingDelete != null ? urls[pendingDelete] : null;

  return (
    <div className="min-w-0 flex flex-col gap-1.5 nodrag nopan" onMouseDown={stop}>
      {showLabel && (
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-medium text-ink/50 tracking-wide">生成结果</span>
          <span className="text-[9px] text-ink/30 tabular-nums">{urls.length}</span>
          <span className="text-[9px] text-ink/28">拖出钉到画布</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 overflow-x-auto nx9-scroll pb-0.5">
        {urls.map((url, i) => {
          const active = i === selectedIndex;
          return (
            <div
              key={`${url}-${i}`}
              draggable
              onDragStart={(e) => {
                draggedRef.current = true;
                const img = e.currentTarget.querySelector('img');
                setMediaPinDragData(
                  e.dataTransfer,
                  {
                    url,
                    source: 'generated',
                    label: `生成 ${i + 1}`,
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
              className={`relative w-14 h-14 rounded-lg overflow-hidden border shrink-0 transition-all group cursor-grab active:cursor-grabbing ${
                active
                  ? 'border-brand/50 ring-1 ring-brand/25'
                  : 'border-line/40 hover:border-brand/30'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (draggedRef.current) return;
                  onSelect?.(i);
                }}
                onDoubleClick={() => setLightbox(url)}
                className="absolute inset-0"
                title={`生成图 ${i + 1} · 拖出钉到画布 · 双击放大`}
              >
                <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" />
              </button>
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent text-white text-[8px] text-center py-0.5">
                生成
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox(url);
                }}
                className="absolute top-0.5 left-0.5 p-0.5 rounded-md bg-ink/55 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="放大"
              >
                <Expand size={9} />
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(i);
                  }}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded-md bg-ink/55 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-600/90 transition-opacity"
                  title="删除"
                >
                  <Trash2 size={9} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/70 p-6"
          onClick={() => setLightbox(null)}
          onMouseDown={stop}
        >
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {pendingDelete != null && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center p-6"
          style={{ background: 'rgba(8, 9, 11, 0.78)' }}
          onClick={() => setPendingDelete(null)}
          onMouseDown={stop}
        >
          <div
            className="w-[280px] rounded-2xl border p-4"
            style={{
              background: 'var(--desk-bg-2, #1c1e21)',
              borderColor: 'var(--desk-line-strong, rgba(255,255,255,0.12))',
              boxShadow: '0 20px 48px rgba(0,0,0,0.55)',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={stop}
          >
            <p className="text-[13px] font-medium text-ink mb-1">删除这张生成图？</p>
            <p className="text-[11px] text-ink/50 mb-3 leading-relaxed">
              删除后无法从本工作区恢复。若提示词里仍有对应 @生成 引用，需自行清理。
            </p>
            {pendingUrl && (
              <img
                src={pendingUrl}
                alt=""
                className="w-full h-28 object-cover rounded-xl border border-line/30 mb-3"
              />
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-3 py-1.5 rounded-lg text-[12px] text-ink/60 hover:bg-surface/80"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = pendingDelete;
                  setPendingDelete(null);
                  if (lightbox === pendingUrl) setLightbox(null);
                  onDelete?.(idx);
                }}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-rose-600 hover:bg-rose-500"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
