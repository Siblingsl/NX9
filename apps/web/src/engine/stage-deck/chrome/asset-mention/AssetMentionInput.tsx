import { useCallback, useMemo, useRef, useState } from 'react';
import type { AssetLibraryKind } from '@nx9/shared';
import { useAllAssetLibraryItems } from '../../../../hooks/use-asset-library-items';
import { AssetMentionPicker } from './AssetMentionPicker';
import {
  parseLocalMediaMentions,
  type LocalMediaMentionItem,
} from './local-media-mention';
import { findMentionSpanAt, splitMentionSegments } from './mention-highlight';
import { useAssetMention } from './useAssetMention';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface AssetMentionInputProps {
  value: string;
  onChange: (next: string) => void;
  as?: 'input' | 'textarea';
  placeholder?: string;
  className?: string;
  rows?: number;
  kinds?: AssetLibraryKind[];
  /** 可 @ 的本地媒体（生成图 / 上游图） */
  localMedia?: LocalMediaMentionItem[];
  /** 高亮所有 @token，并支持点击预览（有图时） */
  highlightMentions?: boolean;
  enabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export function AssetMentionInput({
  value,
  onChange,
  as = 'input',
  placeholder,
  className,
  rows,
  kinds,
  localMedia,
  highlightMentions = false,
  enabled = true,
  onFocus,
  onBlur,
  onMouseDown,
}: AssetMentionInputProps) {
  const mention = useAssetMention({ value, onChange, kinds, localMedia, enabled });
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const { allItems } = useAllAssetLibraryItems();

  const bindRef = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    (mention.inputRef as React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>).current =
      el;
    if (as === 'textarea') {
      textareaRef.current = el as HTMLTextAreaElement | null;
    } else {
      inputRef.current = el as HTMLInputElement | null;
    }
  };

  const resolveMentionPreviewUrl = useCallback(
    (token: string): string | null => {
      const localHits = parseLocalMediaMentions(token);
      if (localHits.length > 0 && localMedia?.length) {
        const hit = localHits[0];
        const item = localMedia.find(
          (i) =>
            i.kind === hit.kind &&
            (i.label === hit.label ||
              i.label.toLowerCase() === hit.label.toLowerCase() ||
              `图${i.index}` === hit.label),
        );
        if (item?.url) return item.url;
      }

      const assetMatch = token.match(/^@(角色|服装|场景|镜头|情绪|钩子|声音):(\S+)$/);
      if (assetMatch) {
        const label = assetMatch[2];
        const found = allItems.find(
          (i) => i.label === label || i.label.toLowerCase() === label.toLowerCase(),
        );
        if (found?.imageUrl) return found.imageUrl;
      }
      return null;
    },
    [allItems, localMedia],
  );

  const syncScroll = useCallback(() => {
    const el = as === 'textarea' ? textareaRef.current : inputRef.current;
    const backdrop = backdropRef.current;
    if (!el || !backdrop) return;
    backdrop.scrollTop = el.scrollTop;
    backdrop.scrollLeft = el.scrollLeft;
  }, [as]);

  const segments = useMemo(
    () => (highlightMentions ? splitMentionSegments(value) : null),
    [highlightMentions, value],
  );

  const commonProps = {
    value,
    placeholder,
    onFocus,
    onBlur,
    onMouseDown: (e: React.MouseEvent) => {
      stop(e);
      onMouseDown?.(e);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      mention.handleValueChange(e.target.value, e.target.selectionStart ?? 0);
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') mention.close();
    },
    onClick: (e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const pos = el.selectionStart ?? 0;
      // 点在完整 @token 内 → 预览图，不打开选择器
      if (highlightMentions) {
        const span = findMentionSpanAt(el.value, pos);
        if (span && pos >= span.start && pos < span.end) {
          const url = resolveMentionPreviewUrl(span.text);
          mention.close();
          if (url) setLightbox(url);
          return;
        }
      }
      mention.syncFromInput(el.value, pos, el);
    },
    onScroll: syncScroll,
  };

  const fieldClassName = highlightMentions
    ? `${className ?? ''} relative z-[1] text-transparent caret-ink/85 selection:bg-brand/25`.trim()
    : className;

  const field =
    as === 'textarea' ? (
      <textarea ref={bindRef} rows={rows} className={fieldClassName} {...commonProps} />
    ) : (
      <input type="text" ref={bindRef} className={fieldClassName} {...commonProps} />
    );

  return (
    <>
      {highlightMentions && segments ? (
        <div className="relative w-full h-full">
          <div
            ref={backdropRef}
            aria-hidden
            className={`${className ?? ''} absolute inset-0 overflow-auto pointer-events-none whitespace-pre-wrap break-words text-ink/85`.trim()}
          >
            {segments.map((seg, i) =>
              seg.type === 'mention' ? (
                <span
                  key={`m-${seg.start}-${i}`}
                  className="text-sky-600 font-medium underline decoration-sky-600/35 underline-offset-2"
                >
                  {seg.text}
                </span>
              ) : (
                <span key={`t-${i}`}>{seg.text}</span>
              ),
            )}
            {/* 末尾换行占位，避免高度抖动 */}
            {value.endsWith('\n') ? '\n' : null}
          </div>
          {field}
        </div>
      ) : (
        field
      )}

      <AssetMentionPicker
        open={mention.open}
        position={mention.position ? { ...mention.position, placement: 'below' as const } : null}
        query={mention.query}
        kinds={kinds}
        localMedia={mention.localMedia}
        activeKind={mention.activeKind}
        onActiveKindChange={mention.setActiveKind}
        onPick={mention.pickItem}
        onPickLocalMedia={mention.pickLocalMedia}
        panelRef={mention.panelRef}
      />

      {lightbox && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-ink/70 p-6"
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
    </>
  );
}
