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

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface AssetMentionPickerProps {
  open: boolean;
  position: { top: number; left: number; placement?: 'above' | 'below' } | null;
  query?: string;
  kinds?: AssetLibraryKind[];
  activeKind?: AssetLibraryKind;
  onActiveKindChange?: (kind: AssetLibraryKind) => void;
  onPick: (item: AssetLibraryItem) => void;
  onClose?: () => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}

export function AssetMentionPicker({
  open,
  position,
  query = '',
  kinds,
  activeKind: controlledKind,
  onActiveKindChange,
  onPick,
  panelRef,
}: AssetMentionPickerProps) {
  const { allItems } = useAllAssetLibraryItems();
  const fetchPublic = usePublicAssetLibrary((s) => s.fetch);
  const publicHydrated = usePublicAssetLibrary((s) => s.hydrated);
  const guessedKind = guessKindFromMentionQuery(query);
  const labelQuery = labelQueryFromMention(query).toLowerCase();

  useEffect(() => {
    if (!open || publicHydrated) return;
    void fetchPublic();
  }, [open, publicHydrated, fetchPublic]);

  const tabs = useMemo(
    () => ASSET_LIBRARY_TABS.filter((t) => !kinds || kinds.includes(t.key)),
    [kinds],
  );

  const defaultKind = guessedKind ?? tabs[0]?.key ?? 'character';
  const pickKind = controlledKind ?? defaultKind;

  const pickOptions = useMemo(() => {
    let pool = allItems.filter((i: AssetLibraryItem) => i.kind === pickKind);
    if (labelQuery) {
      pool = pool.filter((i) => i.label.toLowerCase().includes(labelQuery));
    } else if (guessedKind && query && !query.includes(':')) {
      // @角色 尚未输入冒号时不筛标签
    }
    return pool.slice(0, 16);
  }, [allItems, pickKind, labelQuery, guessedKind, query]);

  if (!open || !position) return null;

  const style =
    position.placement === 'above'
      ? { left: position.left, bottom: window.innerHeight - position.top }
      : { left: position.left, top: position.top };

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9999] w-52 rounded-xl border border-line bg-white shadow-panel py-1 nx9-scroll max-h-48 overflow-y-auto nodrag nopan"
      style={style}
      onMouseDown={stop}
    >
      <div className="flex flex-wrap gap-0.5 px-2 pb-1 border-b border-line/60">
        {tabs.map((t) => (
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
      {pickOptions.length === 0 ? (
        <p className="px-2 py-2 text-[10px] text-ink/40 text-center">
          暂无{ASSET_LIBRARY_TABS.find((t) => t.key === pickKind)?.label ?? ''}素材
        </p>
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
