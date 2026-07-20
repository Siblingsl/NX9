import { useCallback, useMemo, useState } from 'react';
import type { AssetLibraryKind, AssetRef, AssetScope } from '@nx9/shared';
import { ASSET_KIND_MENTION_PREFIX, formatAssetMention } from '@nx9/shared';
import { AtSign, Link2, X } from 'lucide-react';
import { useAllAssetLibraryItems } from '../../hooks/use-asset-library-items';
import { useAssetLibraryModalUi } from '../../stores/asset-library-modal-ui';
import { useWorkspaceCatalog } from '../../stores/workspace-catalog';

export interface AssetLinkFieldProps {
  kind: AssetLibraryKind;
  assetRef?: AssetRef;
  onChange: (ref: AssetRef | undefined) => void;
  onInsertMention?: (token: string) => void;
  className?: string;
}

export function AssetLinkField({
  kind,
  assetRef,
  onChange,
  onInsertMention,
  className = '',
}: AssetLinkFieldProps) {
  const { allItems } = useAllAssetLibraryItems(kind);
  const openAt = useAssetLibraryModalUi((s) => s.openAt);
  const activeProjectId = useWorkspaceCatalog((s) => s.activeId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const options = useMemo(() => {
    // 服装库需要展示内置模板；其它类型仍优先工作区/自定义素材
    if (kind === 'costume') return allItems;
    return allItems.filter((i) => !i.builtin);
  }, [allItems, kind]);

  const handlePick = useCallback(
    (id: string) => {
      const item = options.find((o) => o.id === id);
      if (!item) return;
      onChange({
        id: item.id,
        kind: item.kind,
        scope: item.scope,
        label: item.label,
      });
      setPickerOpen(false);
    },
    [options, onChange],
  );

  const insertMention = useCallback(() => {
    if (!assetRef) return;
    onInsertMention?.(formatAssetMention(assetRef.kind, assetRef.label));
  }, [assetRef, onInsertMention]);

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-ink/50">
          {ASSET_KIND_MENTION_PREFIX[kind]}素材
        </span>
        <button
          type="button"
          onClick={() =>
            openAt({
              tab: kind,
              itemId: assetRef?.id,
              scope: assetRef?.scope,
              projectId: assetRef?.scope === 'public' ? undefined : activeProjectId ?? undefined,
            })
          }
          className="text-[10px] text-brand/70 hover:text-brand flex items-center gap-0.5"
        >
          <Link2 size={11} />
          打开素材库
        </button>
      </div>

      {assetRef ? (
        <div className="flex items-center gap-1 rounded-lg border border-brand/30 bg-brand/5 px-2 py-1">
          <span className="flex-1 text-[11px] text-brand truncate" title={assetRef.label}>
            {assetRef.scope === 'public' ? '公共' : '私有'} · {assetRef.label}
          </span>
          {onInsertMention && (
            <button
              type="button"
              onClick={insertMention}
              className="p-0.5 rounded text-brand/70 hover:text-brand"
              title="插入 @ 引用"
            >
              <AtSign size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="p-0.5 rounded text-ink/40 hover:text-ink"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="w-full text-left text-[11px] rounded-lg border border-dashed border-line px-2 py-1.5 text-ink/40 hover:border-brand/30 hover:text-ink/60"
          >
            关联{ASSET_KIND_MENTION_PREFIX[kind]}素材…
          </button>
          {pickerOpen && options.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-line bg-white shadow-lg py-1 nx9-scroll">
              {options.map((opt) => (
                <li key={`${opt.scope}-${opt.id}`}>
                  <button
                    type="button"
                    onClick={() => handlePick(opt.id)}
                    className="w-full text-left text-[11px] px-2.5 py-1.5 hover:bg-surface"
                  >
                    <span className="text-ink/40 mr-1">{opt.scope === 'public' ? '公共' : '私有'}</span>
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pickerOpen && options.length === 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-line bg-white shadow-lg p-3 text-[10px] text-ink/40 text-center">
              暂无素材，请先在素材库中创建
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function assetRefFromData(data: Record<string, unknown> | undefined): AssetRef | undefined {
  const ref = data?.assetRef as AssetRef | undefined;
  if (!ref?.id || !ref.kind) return undefined;
  return ref;
}

export function patchWithAssetRef(ref: AssetRef | undefined): Record<string, unknown> {
  if (!ref) {
    return { assetRef: undefined, assetRefLabel: undefined, assetRefScope: undefined };
  }
  return {
    assetRef: ref,
    assetRefLabel: ref.label,
    assetRefScope: ref.scope,
  };
}
