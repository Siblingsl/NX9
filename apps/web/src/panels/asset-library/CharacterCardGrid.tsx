import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AssetLibraryItem, AssetScope, CharacterProfile } from '@nx9/shared';
import { MoreHorizontal, Pencil, Trash2, Lock, Unlock, AtSign, Copy, Download, Check, Globe2 } from 'lucide-react';
import { VirtualizedCardGrid } from './VirtualizedCardGrid';

export function resolveCharacterCardImage(c: CharacterProfile | undefined, fallback?: string): string | undefined {
  return (
    c?.creative?.frontViewUrl?.trim()
    || c?.referenceImageUrl?.trim()
    || c?.creative?.fullSheetUrl?.trim()
    || fallback?.trim()
    || undefined
  );
}

function isCharacterLocked(c: CharacterProfile | undefined): boolean {
  return Boolean(c?.creative?.consistency?.locked);
}

export interface CharacterCardGridProps {
  items: AssetLibraryItem[];
  charactersById: Map<string, CharacterProfile>;
  scope: AssetScope;
  canDelete: boolean;
  emptyHint: string;
  /** P-18：多选 */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onCopyPublic: (id: string) => void;
  onCloneBuiltin: (id: string) => void;
  /** 私有 → 公共 */
  onPublishToPublic?: (id: string) => void;
  onCopyMention: (label: string) => void;
  onToggleLock: (id: string) => void;
}

export function CharacterCardGrid({
  items,
  charactersById,
  scope,
  canDelete,
  emptyHint,
  selectedIds,
  onToggleSelect,
  onEdit,
  onDelete,
  onCopyPublic,
  onCloneBuiltin,
  onPublishToPublic,
  onCopyMention,
  onToggleLock,
}: CharacterCardGridProps) {
  const [menuId, setMenuId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center p-8 text-center text-sm text-ink/40">
        {emptyHint}
      </div>
    );
  }

  return (
    <VirtualizedCardGrid
      items={items}
      getKey={(item) => item.id}
      estimateCardHeight={(cardWidth) => cardWidth * (4 / 3) + 44}
      renderItem={(item) => {
        const profile = charactersById.get(item.id);
        const imageUrl = resolveCharacterCardImage(profile, item.imageUrl);
        const locked = isCharacterLocked(profile);
        const menuOpen = menuId === item.id;
        const selected = Boolean(selectedIds?.has(item.id));
        const selectable = Boolean(onToggleSelect) && !item.builtin;

        return (
          <article
            className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface transition-colors hover:border-brand/35 ${
              selected ? 'border-brand/50 ring-2 ring-brand/25' : 'border-line'
            }`}
          >
            {selectable ? (
              <button
                type="button"
                aria-label={selected ? '取消选中' : '选中'}
                aria-pressed={selected}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect?.(item.id);
                }}
                className={`absolute right-2 top-2 z-20 grid h-5 w-5 place-items-center rounded border shadow-sm ${
                  selected
                    ? 'border-brand bg-brand text-white'
                    : 'border-white/50 bg-black/45 text-transparent hover:border-brand/60'
                }`}
              >
                <Check size={12} strokeWidth={3} className={selected ? 'opacity-100' : 'opacity-0'} />
              </button>
            ) : null}
            <button
              type="button"
              className="relative aspect-[3/4] w-full overflow-hidden bg-black/25 text-left"
              title="点击编辑"
              onClick={() => onEdit(item.id)}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-top"
                  draggable={false}
                />
              ) : (
                <span className="grid h-full w-full place-items-center px-3 text-center text-[12px] font-medium leading-relaxed text-ink/60">
                  无正面站姿
                </span>
              )}
              <span className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
                {!imageUrl ? (
                  <span className="rounded-md border border-warn/40 bg-warn/20 px-1.5 py-0.5 text-[9px] font-medium text-warn">
                    缺图
                  </span>
                ) : null}
                {!locked ? (
                  <span className="rounded-md border border-line bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-ink/60">
                    未锁
                  </span>
                ) : (
                  <span className="rounded-md border border-brand/40 bg-brand/20 px-1.5 py-0.5 text-[9px] font-medium text-brand">
                    已锁
                  </span>
                )}
              </span>
            </button>

            <div className="flex items-center gap-1 border-t border-line px-2.5 py-2">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-xs font-medium text-ink hover:text-brand"
                title="点击编辑 · 可用菜单复制 @"
                onClick={() => onEdit(item.id)}
              >
                {item.builtin ? (
                  <span className="mr-1 text-[9px] font-normal text-ink/50">内置</span>
                ) : null}
                {item.overridesBuiltin ? (
                  <span className="mr-1 text-[9px] font-normal text-warn" title="自定义同名覆盖内置展示">覆盖中</span>
                ) : null}
                {item.label || '未命名角色'}
              </button>
              {!selectable ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label="更多"
                  aria-expanded={menuOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId((id) => (id === item.id ? null : item.id));
                  }}
                  className="rounded-lg p-1 text-ink/60 hover:bg-brand/10 hover:text-brand"
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuOpen ? (
                  <CardMoreMenu
                    scope={scope}
                    builtin={Boolean(item.builtin)}
                    locked={locked}
                    canDelete={canDelete}
                    onClose={() => setMenuId(null)}
                    onEdit={() => {
                      setMenuId(null);
                      onEdit(item.id);
                    }}
                    onCopyMention={() => {
                      setMenuId(null);
                      onCopyMention(item.label);
                    }}
                    onToggleLock={() => {
                      setMenuId(null);
                      onToggleLock(item.id);
                    }}
                    onDelete={() => {
                      setMenuId(null);
                      onDelete(item.id);
                    }}
                    onCopyPublic={() => {
                      setMenuId(null);
                      onCopyPublic(item.id);
                    }}
                    onCloneBuiltin={() => {
                      setMenuId(null);
                      onCloneBuiltin(item.id);
                    }}
                    onPublishToPublic={
                      onPublishToPublic
                        ? () => {
                            setMenuId(null);
                            onPublishToPublic(item.id);
                          }
                        : undefined
                    }
                  />
                ) : null}
              </div>
              ) : null}
            </div>
          </article>
        );
      }}
    />
  );
}

function CardMoreMenu({
  scope,
  builtin,
  locked,
  canDelete,
  onClose,
  onEdit,
  onCopyMention,
  onToggleLock,
  onDelete,
  onCopyPublic,
  onCloneBuiltin,
  onPublishToPublic,
}: {
  scope: AssetScope;
  builtin: boolean;
  locked: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCopyMention: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onCopyPublic: () => void;
  onCloneBuiltin: () => void;
  onPublishToPublic?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="nx9-asset-lib-menu absolute right-0 bottom-full z-20 mb-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg"
    >
      <MenuItem icon={<Pencil size={12} />} label="编辑" onClick={onEdit} />
      <MenuItem icon={<AtSign size={12} />} label="复制 @提及" onClick={onCopyMention} />
      {!builtin ? (
        <MenuItem
          icon={locked ? <Unlock size={12} /> : <Lock size={12} />}
          label={locked ? '解锁' : '锁定'}
          onClick={onToggleLock}
        />
      ) : null}
      {builtin ? (
        <MenuItem icon={<Download size={12} />} label="导入到当前库" onClick={onCloneBuiltin} />
      ) : null}
      {scope === 'public' && !builtin ? (
        <MenuItem icon={<Copy size={12} />} label="复制到项目" onClick={onCopyPublic} />
      ) : null}
      {scope === 'private' && !builtin && onPublishToPublic ? (
        <MenuItem icon={<Globe2 size={12} />} label="发布到公共" onClick={onPublishToPublic} />
      ) : null}
      {!builtin && canDelete ? (
        <MenuItem
          icon={<Trash2 size={12} />}
          label="删除"
          danger
          disabled={!canDelete}
          onClick={onDelete}
        />
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] disabled:opacity-40 ${
        danger ? 'text-red-500 hover:bg-red-500/10' : 'text-ink/75 hover:bg-brand/10 hover:text-brand'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
