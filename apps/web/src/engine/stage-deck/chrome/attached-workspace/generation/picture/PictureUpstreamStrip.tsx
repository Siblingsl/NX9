import { useRef } from 'react';
import { X } from 'lucide-react';
import { setMediaPinDragData } from '../../../../../media-pin-drag';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export type PictureRefSource = 'upload' | 'upstream';

export interface PictureRefItem {
  url: string;
  source: PictureRefSource;
  /** 同来源内 0-based 下标（用于标签 / @上游） */
  index: number;
  /** PG-03: 风格参考图（styleImageUrl）标记 */
  role?: 'style';
}

export interface PictureUpstreamStripProps {
  /** 统一参考列表：本节点上传 + 上游传入 */
  items: PictureRefItem[];
  /** 已在 prompt 中 @ 引用的 URL（高亮） */
  mentionedUrls?: string[];
  excludedUrls?: string[];
  /** 仅上游：点击插入 @ */
  onSelectUpstream?: (url: string, index: number) => void;
  /** 排除上游图（不删除源） */
  onExcludeUpstream?: (url: string) => void;
  onRestoreExcluded?: () => void;
  /** 移除本节点上传的参考图 */
  onRemoveUpload?: (url: string) => void;
  /** 拖出钉板时的来源节点 id */
  sourceBlockId?: string;
}

/** 参考图展示区（上传 + 上游）— 无内容时不渲染；样式由父级双列布局承载 */
export function PictureUpstreamStrip({
  items,
  mentionedUrls = [],
  excludedUrls = [],
  onSelectUpstream,
  onExcludeUpstream,
  onRestoreExcluded,
  onRemoveUpload,
  sourceBlockId,
}: PictureUpstreamStripProps) {
  const draggedRef = useRef(false);
  const visible = items.filter(
    (item) => item.source === 'upload' || !excludedUrls.includes(item.url),
  );
  if (visible.length === 0 && excludedUrls.length === 0) return null;

  const uploadCount = visible.filter((i) => i.source === 'upload').length;
  const upstreamCount = visible.filter((i) => i.source === 'upstream').length;

  return (
    <div className="min-w-0 flex flex-col gap-1.5 nodrag nopan" onMouseDown={stop}>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-medium text-ink/50 tracking-wide">参考图</span>
        <span className="text-[9px] text-ink/30 tabular-nums">{visible.length}</span>
        <span className="text-[9px] text-ink/28 truncate">
          {uploadCount > 0 && upstreamCount > 0
            ? `上传 ${uploadCount} · 上游 ${upstreamCount} · 点击 @ · 拖出钉板`
            : uploadCount > 0
              ? '本节点上传 · 拖出钉板'
              : '点击 @ · 拖出钉板'}
        </span>
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
        <div className="flex items-center gap-1.5 overflow-x-auto nx9-scroll nx9-picture-strip-scroll pb-0.5">
          {visible.map((item) => {
            const { url, source, index } = item;
            const active = mentionedUrls.includes(url);
            const label =
              item.role === 'style'
                ? '风格'
                : source === 'upload'
                  ? `参考${index + 1}`
                  : `上游${index + 1}`;
            const canSelect = source === 'upstream' && onSelectUpstream;
            return (
              <div
                key={`${source}-${url}-${index}`}
                role={canSelect ? 'button' : undefined}
                tabIndex={canSelect ? 0 : undefined}
                draggable
                onMouseDown={stop}
                onDragStart={(e) => {
                  draggedRef.current = true;
                  const img = e.currentTarget.querySelector('img');
                  setMediaPinDragData(
                    e.dataTransfer,
                    {
                      url,
                      // 钉板仅区分生成结果 / 参考输入；上传与上游均属参考输入
                      source: 'upstream',
                      label,
                      pinKind: 'picture',
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
                  if (draggedRef.current || !canSelect) return;
                  onSelectUpstream?.(url, index);
                }}
                onKeyDown={(e) => {
                  if (!canSelect) return;
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  onSelectUpstream?.(url, index);
                }}
                className={`group relative w-14 h-14 rounded-lg overflow-hidden border shrink-0 transition-all ${
                  canSelect ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                } ${
                  item.role === 'style'
                    ? 'border-violet-500/60 ring-1 ring-violet-500/25'
                    : active
                      ? 'border-brand/50 ring-1 ring-brand/25'
                      : 'border-line/40 hover:border-brand/30'
                }`}
                title={
                  item.role === 'style'
                    ? '风格参考图 · 控制画风，不作主体'
                    : source === 'upload'
                      ? `${label} · 本节点上传 · 拖出钉到画布`
                      : `点击插入 @上游:图${index + 1} · 拖出钉到画布`
                }
              >
                <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent text-white text-[8px] text-center py-0.5 pointer-events-none">
                  {label}
                </span>
                {source === 'upload' && onRemoveUpload ? (
                  <button
                    type="button"
                    onMouseDown={stop}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveUpload(url);
                    }}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-ink/50 text-white opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
                    title="移除上传参考"
                  >
                    <X size={9} />
                  </button>
                ) : null}
                {source === 'upstream' && onExcludeUpstream ? (
                  <button
                    type="button"
                    onMouseDown={stop}
                    onClick={(e) => {
                      e.stopPropagation();
                      onExcludeUpstream(url);
                    }}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-ink/50 text-white opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
                    title="排除此上游图"
                  >
                    <X size={9} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
