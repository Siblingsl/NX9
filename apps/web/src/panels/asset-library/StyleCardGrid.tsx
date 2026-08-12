import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StyleAestheticFamily, StylePresetProfile } from '@nx9/shared';
import { styleAestheticFamilyLabel } from '@nx9/shared';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  AtSign,
  Download,
  Star,
  Palette,
} from 'lucide-react';
import { VirtualizedCardGrid } from './VirtualizedCardGrid';

/** 无参考图时的内置情绪色块（暖纸壳内克制渐变，避免紫光） */
const BUILTIN_SWATCH: Record<string, { from: string; to: string; mark: string }> = {
  'line-art': { from: '#f3efe6', to: '#d8d2c4', mark: '线' },
  cinematic: { from: '#3a342c', to: '#8a6a3d', mark: '影' },
  anime: { from: '#e8d5c4', to: '#7a9e8e', mark: '漫' },
  watercolor: { from: '#dce8e2', to: '#b7c4a8', mark: '彩' },
  noir: { from: '#1a1a1a', to: '#6b6b6b', mark: '黑' },
};

function resolveFamily(style: StylePresetProfile | undefined): StyleAestheticFamily | undefined {
  return style?.family;
}

function blurb(style: StylePresetProfile | undefined, fallbackPrompt?: string): string {
  if (!style) return fallbackPrompt?.split('\n')[0]?.trim() || '';
  return (
    style.description?.trim()
    || style.promptZh?.trim()
    || style.promptEn?.split(',')[0]?.trim()
    || fallbackPrompt?.split('\n')[0]?.trim()
    || ''
  );
}

export interface StyleCardGridProps {
  items: Array<{
    id: string;
    label: string;
    prompt: string;
    description?: string;
    imageUrl?: string;
    builtin?: boolean;
    overridesBuiltin?: boolean;
  }>;
  stylesById: Map<string, StylePresetProfile>;
  canDelete: boolean;
  emptyHint: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onCloneBuiltin: (id: string) => void;
  onCopyMention: (label: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function StyleCardGrid({
  items,
  stylesById,
  canDelete,
  emptyHint,
  onEdit,
  onDelete,
  onCloneBuiltin,
  onCopyMention,
  onToggleFavorite,
}: StyleCardGridProps) {
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
      estimateCardHeight={(cardWidth) => cardWidth * (3 / 4) + 72}
      renderItem={(item) => {
        const style = stylesById.get(item.id);
        const isBuiltin = Boolean(item.builtin || style?.builtinKey);
        const favorite = Boolean(style?.favorite);
        const family = resolveFamily(style);
        const familyLabel = styleAestheticFamilyLabel(family);
        const purpose = blurb(style, item.description || item.prompt);
        const imageUrl = style?.referenceImageUrl?.trim() || item.imageUrl?.trim() || undefined;
        const swatch = style?.builtinKey ? BUILTIN_SWATCH[style.builtinKey] : undefined;
        const menuOpen = menuId === item.id;

        return (
          <article
            className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-brand/35"
          >
            <StyleCover
              imageUrl={imageUrl}
              swatch={swatch}
              favorite={favorite}
              allowFavorite={!isBuiltin}
              onOpen={() => onEdit(item.id)}
              onToggleFavorite={() => onToggleFavorite(item.id)}
            />

            <div className="relative z-10 flex items-start gap-1 border-t border-line px-2.5 py-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left hover:text-brand"
                title="点击编辑 · 可用菜单复制 @"
                onClick={() => onEdit(item.id)}
              >
                <p className="truncate text-xs font-medium text-ink">
                  {isBuiltin ? (
                    <span className="mr-1 text-[9px] font-normal text-ink/50">内置</span>
                  ) : null}
                  {item.overridesBuiltin ? (
                    <span className="mr-1 text-[9px] font-normal text-warn" title="自定义同名覆盖内置展示">
                      覆盖中
                    </span>
                  ) : null}
                  {item.label || '未命名风格'}
                </p>
                {purpose ? (
                  <p className="mt-0.5 truncate text-[10px] leading-snug text-ink/45">{purpose}</p>
                ) : null}
                {familyLabel ? (
                  <p className="mt-1 truncate text-[10px] text-ink/35">{familyLabel}</p>
                ) : null}
              </button>
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
                  <StyleCardMoreMenu
                    builtin={isBuiltin}
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
                    onDelete={() => {
                      setMenuId(null);
                      onDelete(item.id);
                    }}
                    onCloneBuiltin={() => {
                      setMenuId(null);
                      onCloneBuiltin(item.id);
                    }}
                  />
                ) : null}
              </div>
            </div>
          </article>
        );
      }}
    />
  );
}

function StyleCover({
  imageUrl,
  swatch,
  favorite,
  allowFavorite,
  onOpen,
  onToggleFavorite,
}: {
  imageUrl?: string;
  swatch?: { from: string; to: string; mark: string };
  favorite: boolean;
  allowFavorite: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      title="点击编辑"
      className="relative aspect-[4/5] w-full cursor-pointer overflow-hidden bg-black/15"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover object-center" />
      ) : swatch ? (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-2"
          style={{
            background: `linear-gradient(145deg, ${swatch.from} 0%, ${swatch.to} 100%)`,
          }}
        >
          <span
            className="grid h-11 w-11 place-items-center rounded-full border border-white/25 text-sm font-medium tracking-wide text-white/90"
            style={{ background: 'rgba(0,0,0,0.22)' }}
          >
            {swatch.mark}
          </span>
        </div>
      ) : (
        <span className="grid h-full w-full place-items-center text-ink/25">
          <span className="flex flex-col items-center gap-1.5">
            <Palette size={22} strokeWidth={1.5} />
            <span className="text-[10px] font-medium text-ink/40">无参考图</span>
          </span>
        </span>
      )}

      <span className="absolute left-2 top-2 flex flex-wrap gap-1">
        {imageUrl ? (
          <span className="rounded-md border border-line bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-ink/70">
            参考
          </span>
        ) : swatch ? (
          <span className="rounded-md border border-line bg-black/45 px-1.5 py-0.5 text-[9px] font-medium text-ink/70">
            色板
          </span>
        ) : (
          <span className="rounded-md border border-warn/40 bg-warn/20 px-1.5 py-0.5 text-[9px] font-medium text-warn">
            缺图
          </span>
        )}
      </span>

      {allowFavorite ? (
        <button
          type="button"
          aria-label={favorite ? '取消收藏' : '收藏'}
          title={favorite ? '取消收藏' : '收藏'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`absolute right-2 top-2 rounded-md border p-1 transition-colors ${
            favorite
              ? 'border-brand/40 bg-brand/20 text-brand'
              : 'border-line bg-black/45 text-ink/55 hover:text-brand'
          }`}
        >
          <Star size={12} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      ) : null}
    </div>
  );
}

function StyleCardMoreMenu({
  builtin,
  canDelete,
  onClose,
  onEdit,
  onCopyMention,
  onDelete,
  onCloneBuiltin,
}: {
  builtin: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCopyMention: () => void;
  onDelete: () => void;
  onCloneBuiltin: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const Item = ({
    icon,
    label,
    onClick,
    danger,
  }: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] ${
        danger ? 'text-red-600 hover:bg-red-500/10' : 'text-ink/75 hover:bg-brand/10 hover:text-brand'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      className="nx9-asset-lib-menu absolute right-0 bottom-full z-50 mb-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg"
    >
      <Item
        icon={<Pencil size={12} />}
        label={builtin ? '查看' : '编辑'}
        onClick={onEdit}
      />
      <Item icon={<AtSign size={12} />} label="复制 @" onClick={onCopyMention} />
      {builtin ? (
        <Item icon={<Download size={12} />} label="导入副本" onClick={onCloneBuiltin} />
      ) : null}
      {!builtin && canDelete ? (
        <Item icon={<Trash2 size={12} />} label="删除" onClick={onDelete} danger />
      ) : null}
    </div>
  );
}
