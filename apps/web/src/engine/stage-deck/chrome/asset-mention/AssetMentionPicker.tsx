import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { AssetLibraryItem, AssetLibraryKind } from '@nx9/shared';
import { ASSET_LIBRARY_TABS } from '@nx9/shared';
import { useAllAssetLibraryItems } from '../../../../hooks/use-asset-library-items';
import { usePublicAssetLibrary } from '../../../../stores/public-asset-library';
import {
  guessKindFromMentionQuery,
  labelQueryFromMention,
} from './asset-mention-utils';
import {
  guessLocalMediaKindFromQuery,
  labelQueryFromLocalMediaMention,
  LOCAL_MEDIA_MENTION_TABS,
  type LocalMediaMentionItem,
  type LocalMediaMentionKind,
} from './local-media-mention';
import type { MentionActiveKind } from './useAssetMention';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function isLocalMediaKind(kind: MentionActiveKind): kind is LocalMediaMentionKind {
  return kind === 'generated' || kind === 'upstream';
}

export interface AssetMentionPickerProps {
  open: boolean;
  position: { top: number; left: number; placement?: 'above' | 'below' } | null;
  query?: string;
  kinds?: AssetLibraryKind[];
  localMedia?: LocalMediaMentionItem[];
  activeKind?: MentionActiveKind;
  onActiveKindChange?: (kind: MentionActiveKind) => void;
  onPick: (item: AssetLibraryItem) => void;
  onPickLocalMedia?: (item: LocalMediaMentionItem) => void;
  onClose?: () => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}

export function AssetMentionPicker({
  open,
  position,
  query = '',
  kinds,
  localMedia = [],
  activeKind: controlledKind,
  onActiveKindChange,
  onPick,
  onPickLocalMedia,
  panelRef,
}: AssetMentionPickerProps) {
  const { allItems } = useAllAssetLibraryItems();
  const fetchPublic = usePublicAssetLibrary((s) => s.fetch);
  const publicHydrated = usePublicAssetLibrary((s) => s.hydrated);
  const guessedLocal = guessLocalMediaKindFromQuery(query);
  const guessedKind = guessKindFromMentionQuery(query);
  const labelQuery = (
    guessedLocal
      ? labelQueryFromLocalMediaMention(query)
      : labelQueryFromMention(query)
  ).toLowerCase();

  useEffect(() => {
    if (!open || publicHydrated) return;
    void fetchPublic();
  }, [open, publicHydrated, fetchPublic]);

  const assetTabs = useMemo(
    () => ASSET_LIBRARY_TABS.filter((t) => !kinds || kinds.includes(t.key)),
    [kinds],
  );

  const localTabs = useMemo(() => {
    const hasGen = localMedia.some((i) => i.kind === 'generated');
    const hasUp = localMedia.some((i) => i.kind === 'upstream');
    return LOCAL_MEDIA_MENTION_TABS.filter(
      (t) => (t.key === 'generated' && hasGen) || (t.key === 'upstream' && hasUp),
    );
  }, [localMedia]);

  const defaultKind: MentionActiveKind =
    guessedLocal ?? guessedKind ?? localTabs[0]?.key ?? assetTabs[0]?.key ?? 'character';
  const pickKind = controlledKind ?? defaultKind;

  const pickOptions = useMemo(() => {
    if (isLocalMediaKind(pickKind)) return [];
    let pool = allItems.filter((i: AssetLibraryItem) => i.kind === pickKind);
    if (labelQuery) {
      pool = pool.filter((i) => i.label.toLowerCase().includes(labelQuery));
    }
    return pool.slice(0, 16);
  }, [allItems, pickKind, labelQuery]);

  const localOptions = useMemo(() => {
    if (!isLocalMediaKind(pickKind)) return [];
    let pool = localMedia.filter((i) => i.kind === pickKind);
    if (labelQuery) {
      pool = pool.filter((i) => i.label.toLowerCase().includes(labelQuery));
    }
    return pool.slice(0, 16);
  }, [localMedia, pickKind, labelQuery]);

  if (!open || !position) return null;

  const style =
    position.placement === 'above'
      ? { left: position.left, bottom: window.innerHeight - position.top }
      : { left: position.left, top: position.top };

  const emptyLabel = isLocalMediaKind(pickKind)
    ? LOCAL_MEDIA_MENTION_TABS.find((t) => t.key === pickKind)?.label ?? ''
    : ASSET_LIBRARY_TABS.find((t) => t.key === pickKind)?.label ?? '';

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9999] w-56 rounded-xl border border-line bg-white shadow-panel py-1 nx9-scroll max-h-52 overflow-y-auto nodrag nopan"
      style={style}
      onMouseDown={stop}
    >
      <div className="flex flex-wrap gap-0.5 px-2 pb-1 border-b border-line/60">
        {localTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onMouseDown={stop}
            onClick={() => onActiveKindChange?.(t.key)}
            className={`px-1.5 py-0.5 rounded text-[9px] ${
              pickKind === t.key ? 'bg-brand/10 text-brand' : 'text-ink/50 hover:bg-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
        {assetTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onMouseDown={stop}
            onClick={() => onActiveKindChange?.(t.key)}
            className={`px-1.5 py-0.5 rounded text-[9px] ${
              pickKind === t.key ? 'bg-brand/10 text-brand' : 'text-ink/50 hover:bg-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {isLocalMediaKind(pickKind) ? (
        localOptions.length === 0 ? (
          <p className="px-2 py-2 text-[10px] text-ink/40 text-center">暂无{emptyLabel}</p>
        ) : (
          localOptions.map((opt) => (
            <button
              key={`${opt.kind}-${opt.index}-${opt.url}`}
              type="button"
              onMouseDown={stop}
              className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-[11px] hover:bg-surface"
              onClick={() => onPickLocalMedia?.(opt)}
            >
              <img
                src={opt.url}
                alt=""
                className="w-7 h-7 rounded-md object-cover border border-line/40 shrink-0"
              />
              <span className="truncate">
                <span className="text-ink/35 mr-1">
                  {opt.kind === 'generated' ? '生成' : '上游'}
                </span>
                {opt.label}
              </span>
            </button>
          ))
        )
      ) : pickOptions.length === 0 ? (
        <p className="px-2 py-2 text-[10px] text-ink/40 text-center">暂无{emptyLabel}素材</p>
      ) : (
        pickOptions.map((opt: AssetLibraryItem) => (
          <button
            key={`${opt.scope}-${opt.id}`}
            type="button"
            onMouseDown={stop}
            className="w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-surface truncate"
            onClick={() => onPick(opt)}
          >
            <span className="text-ink/35 mr-1">{opt.scope === 'public' ? '公共' : '私有'}</span>
            {opt.label}
          </button>
        ))
      )}
    </div>,
    document.body,
  );
}
