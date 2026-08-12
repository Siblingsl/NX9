import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AssetLibraryItem, BacklotWorkspaceItem } from '@nx9/shared';
import {
  getShotCreative,
  shotMoveFamilyLabel,
  shotLexiconSystemLabel,
  shortenShotLexiconCategory,
} from '@nx9/shared';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  AtSign,
  Download,
  Star,
  Clapperboard,
} from 'lucide-react';
import { VirtualizedCardGrid } from './VirtualizedCardGrid';

export function resolveShotCardMedia(item: BacklotWorkspaceItem | undefined, fallback?: string): {
  gifUrl?: string;
  stillUrl?: string;
  hasMotion: boolean;
} {
  const ext = item ? getShotCreative(item) : {};
  const gifUrl = ext.gifUrl?.trim() || undefined;
  const stillUrl =
    ext.exampleImageUrl?.trim()
    || fallback?.trim()
    || undefined;
  return {
    gifUrl,
    stillUrl,
    hasMotion: Boolean(gifUrl),
  };
}

function metaChips(item: BacklotWorkspaceItem | undefined): string {
  if (!item) return '';
  const ext = getShotCreative(item);
  return [
    ext.shotSize,
    ext.cameraMove || shotMoveFamilyLabel(ext.moveFamily),
    ext.durationSec != null ? `${ext.durationSec}s` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface ShotCardGridProps {
  items: AssetLibraryItem[];
  workspaceById: Map<string, BacklotWorkspaceItem>;
  canDelete: boolean;
  emptyHint: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onCloneBuiltin: (id: string) => void;
  onCopyMention: (label: string) => void;
  onToggleLock: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function ShotCardGrid({
  items,
  workspaceById,
  canDelete,
  emptyHint,
  onEdit,
  onDelete,
  onCloneBuiltin,
  onCopyMention,
  onToggleLock,
  onToggleFavorite,
}: ShotCardGridProps) {
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
      estimateCardHeight={(cardWidth) => cardWidth * (9 / 16) + 88}
      renderItem={(item) => {
        const ws = workspaceById.get(item.id);
        const media = resolveShotCardMedia(ws, item.imageUrl);
        const ext = ws ? getShotCreative(ws) : getShotCreative({
          id: item.id,
          kind: 'shot',
          label: item.label,
          promptEn: item.prompt,
        });
        const locked = Boolean(ext.locked);
        const favorite = Boolean(ext.favorite);
        const menuOpen = menuId === item.id;
        const purpose =
          ext.purpose?.trim()
          || item.description?.trim()
          || item.prompt.split('\n')[0]?.trim()
          || '';
        const chips = metaChips(ws);
        const hierarchy = [
          shotLexiconSystemLabel(ext.lexiconSystemId) || ext.lexiconSystem,
          ext.lexiconCategory ? shortenShotLexiconCategory(ext.lexiconCategory) : null,
        ]
          .filter(Boolean)
          .join(' · ');

        const isBuiltin = Boolean(item.builtin);

        return (
          <article
            className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-brand/35"
          >
            <ShotCover
              gifUrl={media.gifUrl}
              stillUrl={media.stillUrl}
              hasMotion={media.hasMotion}
              favorite={favorite}
              locked={locked}
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
                  {item.label || '未命名镜头'}
                </p>
                {hierarchy ? (
                  <p className="mt-0.5 truncate text-[9px] text-ink/35">{hierarchy}</p>
                ) : null}
                {purpose ? (
                  <p className="mt-0.5 truncate text-[10px] leading-snug text-ink/45">{purpose}</p>
                ) : null}
                {chips ? (
                  <p className="mt-1 truncate text-[10px] text-ink/35">{chips}</p>
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
                  <ShotCardMoreMenu
                    builtin={isBuiltin}
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

function ShotCover({
  gifUrl,
  stillUrl,
  hasMotion,
  favorite,
  locked,
  allowFavorite,
  onOpen,
  onToggleFavorite,
}: {
  gifUrl?: string;
  stillUrl?: string;
  hasMotion: boolean;
  favorite: boolean;
  locked: boolean;
  allowFavorite: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  const [hover, setHover] = useState(false);
  const showGif = Boolean(gifUrl && (hover || !stillUrl));
  const url = showGif ? gifUrl : stillUrl;

  return (
    <div
      role="button"
      tabIndex={0}
      title="点击编辑"
      className="relative aspect-[16/10] w-full cursor-pointer overflow-hidden bg-black/20"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover object-center" />
      ) : (
        <span className="grid h-full w-full place-items-center text-ink/25">
          <span className="flex flex-col items-center gap-1.5">
            <Clapperboard size={22} strokeWidth={1.5} />
            <span className="text-[10px] font-medium text-ink/40">无预览</span>
          </span>
        </span>
      )}

      <span className="absolute left-2 top-2 flex flex-wrap gap-1">
        {hasMotion ? (
          <span className="rounded-md border border-brand/35 bg-brand/15 px-1.5 py-0.5 text-[9px] font-medium text-brand">
            动图
          </span>
        ) : url ? (
          <span className="rounded-md border border-line bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-ink/70">
            静帧
          </span>
        ) : (
          <span className="rounded-md border border-warn/40 bg-warn/20 px-1.5 py-0.5 text-[9px] font-medium text-warn">
            缺图
          </span>
        )}
        {allowFavorite ? (
          !locked ? (
            <span className="rounded-md border border-line bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-ink/60">
              未锁
            </span>
          ) : (
            <span className="rounded-md border border-brand/40 bg-brand/20 px-1.5 py-0.5 text-[9px] font-medium text-brand">
              已锁
            </span>
          )
        ) : null}
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

function ShotCardMoreMenu({
  builtin,
  locked,
  canDelete,
  onClose,
  onEdit,
  onCopyMention,
  onToggleLock,
  onDelete,
  onCloneBuiltin,
}: {
  builtin: boolean;
  locked: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCopyMention: () => void;
  onToggleLock: () => void;
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
      {!builtin ? (
        <Item icon={<Pencil size={12} />} label="编辑" onClick={onEdit} />
      ) : null}
      <Item icon={<AtSign size={12} />} label="复制 @" onClick={onCopyMention} />
      {!builtin ? (
        <Item
          icon={locked ? <Unlock size={12} /> : <Lock size={12} />}
          label={locked ? '解锁' : '锁定'}
          onClick={onToggleLock}
        />
      ) : null}
      {builtin ? (
        <Item icon={<Download size={12} />} label="导入副本" onClick={onCloneBuiltin} />
      ) : null}
      {!builtin && canDelete ? (
        <Item icon={<Trash2 size={12} />} label="删除" onClick={onDelete} danger />
      ) : null}
    </div>
  );
}
