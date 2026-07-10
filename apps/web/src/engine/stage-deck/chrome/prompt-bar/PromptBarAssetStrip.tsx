import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetLibraryKind, AssetRef } from '@nx9/shared';
import {
  ASSET_KIND_MENTION_PREFIX,
  formatAssetMention,
} from '@nx9/shared';
import { AtSign, FolderOpen, Plus, X } from 'lucide-react';
import { useAssetLibraryModalUi } from '../../../../stores/asset-library-modal-ui';
import { useWorkspaceCatalog } from '../../../../stores/workspace-catalog';
import { AssetMentionPicker } from '../asset-mention/AssetMentionPicker';

const ASSET_FIELDS: { kind: AssetLibraryKind; field: string }[] = [
  { kind: 'character', field: 'characterAssetRef' },
  { kind: 'scene', field: 'sceneAssetRef' },
  { kind: 'shot', field: 'shotAssetRef' },
  { kind: 'emotion', field: 'emotionAssetRef' },
  { kind: 'hook', field: 'assetRef' },
  { kind: 'sound', field: 'soundAssetRef' },
];

function readAssetRef(data: Record<string, unknown>, field: string): AssetRef | undefined {
  const raw = field === 'assetRef' ? data.assetRef : data[field];
  if (!raw || typeof raw !== 'object') return undefined;
  const ref = raw as AssetRef;
  if (!ref.id || !ref.kind) return undefined;
  return ref;
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface PromptBarAssetStripProps {
  blockId: string;
  data: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  onInsertMention?: (token: string) => void;
  /** 仅展示这些素材槽；默认全部 */
  kinds?: AssetLibraryKind[];
  /** 下拉方向：above 向上（Composer 底部），below 向下（批量面板顶部） */
  pickerPlacement?: 'above' | 'below';
  /** 从下拉选中素材时，同时插入 @ 到当前输入框 */
  insertOnPick?: boolean;
  /** 当前 @ 插入目标提示（可选展示） */
  insertTargetHint?: string;
  /** 是否展示「+ 引用」按钮 */
  showPickButton?: boolean;
  /** 是否展示「素材库」按钮 */
  showLibraryButton?: boolean;
}

export function PromptBarAssetStrip({
  data,
  onPatch,
  onInsertMention,
  kinds,
  pickerPlacement = 'above',
  insertOnPick = false,
  insertTargetHint,
  showPickButton = true,
  showLibraryButton = true,
}: PromptBarAssetStripProps) {
  const openAt = useAssetLibraryModalUi((s) => s.openAt);
  const setOpen = useAssetLibraryModalUi((s) => s.setOpen);
  const activeProjectId = useWorkspaceCatalog((s) => s.activeId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickKind, setPickKind] = useState<AssetLibraryKind>('character');
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);
  const pickerPanelRef = useRef<HTMLDivElement>(null);

  const slots = useMemo(
    () => (kinds ? ASSET_FIELDS.filter((s) => kinds.includes(s.kind)) : ASSET_FIELDS),
    [kinds],
  );

  const linked = useMemo(
    () =>
      slots
        .map(({ kind, field }) => {
          const ref = readAssetRef(data, field);
          return ref ? { kind, field, ref } : null;
        })
        .filter(Boolean) as { kind: AssetLibraryKind; field: string; ref: AssetRef }[],
    [data, slots],
  );

  const setRef = useCallback(
    (field: string, ref: AssetRef | undefined) => {
      if (field === 'assetRef') {
        onPatch(
          ref
            ? { assetRef: ref, assetRefLabel: ref.label, assetRefScope: ref.scope }
            : { assetRef: undefined, assetRefLabel: undefined, assetRefScope: undefined },
        );
      } else {
        onPatch({ [field]: ref });
      }
    },
    [onPatch],
  );

  const openLibrary = useCallback(() => {
    setOpen(true);
    openAt({
      tab: linked[0]?.kind ?? 'character',
      projectId: activeProjectId ?? undefined,
    });
  }, [setOpen, openAt, linked, activeProjectId]);

  const updatePickerPos = useCallback(() => {
    const rect = pickerBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (pickerPlacement === 'below') {
      setPickerPos({ left: rect.left, top: rect.bottom + 4 });
    } else {
      setPickerPos({ left: rect.left, top: rect.top - 4 });
    }
  }, [pickerPlacement]);

  const togglePicker = useCallback(() => {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    updatePickerPos();
    setPickerOpen(true);
  }, [pickerOpen, updatePickerPos]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pickerBtnRef.current?.contains(t) || pickerPanelRef.current?.contains(t)) return;
      setPickerOpen(false);
    };
    const onScroll = () => updatePickerPos();
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [pickerOpen, updatePickerPos]);

  const pickItem = useCallback(
    (opt: { id: string; kind: AssetLibraryKind; scope: AssetRef['scope']; label: string }) => {
      const field = slots.find((s) => s.kind === opt.kind)?.field;
      if (!field) return;
      setRef(field, {
        id: opt.id,
        kind: opt.kind,
        scope: opt.scope,
        label: opt.label,
      });
      if (insertOnPick && onInsertMention) {
        onInsertMention(formatAssetMention(opt.kind, opt.label));
      }
      setPickerOpen(false);
    },
    [insertOnPick, onInsertMention, setRef, slots],
  );

  const pickerPosition =
    pickerOpen && pickerPos
      ? {
          left: pickerPos.left,
          top: pickerPos.top,
          placement: pickerPlacement,
        }
      : null;

  return (
    <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1">
      {linked.map(({ kind, field, ref }) => (
        <span
          key={`${field}-${ref.id}`}
          className="inline-flex items-center gap-0.5 max-w-[140px] pl-1.5 pr-0.5 py-0.5 rounded-full bg-brand/8 border border-brand/20 text-[10px] text-brand"
        >
          <span className="truncate">
            {ASSET_KIND_MENTION_PREFIX[kind]}·{ref.label}
          </span>
          {onInsertMention && (
            <button
              type="button"
              className="p-0.5 rounded-full hover:bg-brand/15 shrink-0"
              title="插入 @"
              onMouseDown={stop}
              onClick={() => onInsertMention(formatAssetMention(kind, ref.label))}
            >
              <AtSign size={10} />
            </button>
          )}
          <button
            type="button"
            className="p-0.5 rounded-full hover:bg-brand/15 text-brand/60 shrink-0"
            onMouseDown={stop}
            onClick={() => setRef(field, undefined)}
          >
            <X size={10} />
          </button>
        </span>
      ))}

      {showPickButton && (
        <div className="relative">
          <button
            ref={pickerBtnRef}
            type="button"
            onMouseDown={stop}
            onClick={togglePicker}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] nodrag nopan ${
              pickerOpen
                ? 'border-brand/40 bg-brand/5 text-brand'
                : 'border-dashed border-line text-ink/45 hover:border-brand/40 hover:text-brand'
            }`}
          >
            <Plus size={10} />
            引用
          </button>
        </div>
      )}

      {showLibraryButton && (
        <button
          type="button"
          onMouseDown={stop}
          onClick={openLibrary}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-line text-[10px] text-ink/55 hover:border-brand/40 hover:text-brand shrink-0 nodrag nopan"
        >
          <FolderOpen size={11} />
          素材库
        </button>
      )}

      {insertTargetHint && (
        <span className="text-[9px] text-ink/35 truncate max-w-[160px] nodrag nopan" title={insertTargetHint}>
          → {insertTargetHint}
        </span>
      )}

      <AssetMentionPicker
        open={showPickButton && pickerOpen}
        position={pickerPosition}
        kinds={kinds}
        activeKind={pickKind}
        onActiveKindChange={setPickKind}
        onPick={pickItem}
        panelRef={pickerPanelRef}
      />
    </div>
  );
}
