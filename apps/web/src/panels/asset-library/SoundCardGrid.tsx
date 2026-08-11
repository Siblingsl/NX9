import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SoundAssetKind, SoundAssetProfile } from '@nx9/shared';
import {
  getVoiceCreative,
  inferSoundAssetKind,
  isBuiltinSoundAsset,
  isSoundFavorite,
  soundAssetKindLabel,
} from '@nx9/shared';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  AtSign,
  Download,
  Star,
} from 'lucide-react';

/** 无音频时的内置色板（暖纸壳内克制渐变） */
const KIND_SWATCH: Record<SoundAssetKind, { from: string; to: string; mark: string }> = {
  voice: { from: '#e8dcc8', to: '#a8895c', mark: '配' },
  sfx: { from: '#d5ddd8', to: '#5f756c', mark: '效' },
  bgm: { from: '#3a342c', to: '#8a6a3d', mark: '乐' },
};

function WaveBars({ tone }: { tone: 'light' | 'dark' }) {
  const heights = [28, 48, 36, 62, 40, 72, 44, 58, 32, 50, 38, 66, 42, 54];
  const fill = tone === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.22)';
  return (
    <div className="flex h-12 items-end gap-1" aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-1 rounded-full"
          style={{ height: `${h}%`, background: fill }}
        />
      ))}
    </div>
  );
}

function blurb(sound: SoundAssetProfile | undefined, fallback?: string): string {
  if (!sound) return fallback?.split('\n')[0]?.trim() || '';
  return (
    sound.description?.trim()
    || getVoiceCreative(sound).voiceTone?.trim()
    || fallback?.split('\n')[0]?.trim()
    || ''
  );
}

export interface SoundCardGridProps {
  items: Array<{
    id: string;
    label: string;
    prompt: string;
    description?: string;
    audioUrl?: string;
    builtin?: boolean;
  }>;
  soundsById: Map<string, SoundAssetProfile>;
  canDelete: boolean;
  emptyHint: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onCloneBuiltin: (id: string) => void;
  onCopyMention: (label: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function SoundCardGrid({
  items,
  soundsById,
  canDelete,
  emptyHint,
  onEdit,
  onDelete,
  onCloneBuiltin,
  onCopyMention,
  onToggleFavorite,
}: SoundCardGridProps) {
  const [menuId, setMenuId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center p-8 text-center text-sm text-ink/40">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => {
        const sound = soundsById.get(item.id);
        const isBuiltin = Boolean(item.builtin || isBuiltinSoundAsset(sound));
        const favorite = isSoundFavorite(sound);
        const kind = sound ? inferSoundAssetKind(sound) : 'voice';
        const kindLabel = soundAssetKindLabel(kind);
        const purpose = blurb(sound, item.description || item.prompt);
        const audioUrl = sound?.audioUrl?.trim() || item.audioUrl?.trim() || undefined;
        const swatch = KIND_SWATCH[kind];
        const menuOpen = menuId === item.id;

        return (
          <article
            key={item.id}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-brand/35"
          >
            <SoundCover
              audioUrl={audioUrl}
              swatch={swatch}
              favorite={favorite}
              allowFavorite={!isBuiltin}
              onToggleFavorite={() => onToggleFavorite(item.id)}
            />

            <div className="relative z-10 flex items-start gap-1 border-t border-line px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink">
                  {isBuiltin ? (
                    <span className="mr-1 text-[9px] font-normal text-ink/50">内置</span>
                  ) : null}
                  {item.label || '未命名声音'}
                </p>
                {purpose ? (
                  <p className="mt-0.5 truncate text-[10px] leading-snug text-ink/45">{purpose}</p>
                ) : null}
                {kindLabel ? (
                  <p className="mt-1 truncate text-[10px] text-ink/35">{kindLabel}</p>
                ) : null}
              </div>
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
                  <SoundCardMoreMenu
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
      })}
    </div>
  );
}

function SoundCover({
  audioUrl,
  swatch,
  favorite,
  allowFavorite,
  onToggleFavorite,
}: {
  audioUrl?: string;
  swatch: { from: string; to: string; mark: string };
  favorite: boolean;
  allowFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/15">
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-3"
        style={{
          background: `linear-gradient(145deg, ${swatch.from} 0%, ${swatch.to} 100%)`,
        }}
      >
        <span
          className="grid h-10 w-10 place-items-center rounded-full border border-white/25 text-sm font-medium tracking-wide text-white/90"
          style={{ background: 'rgba(0,0,0,0.22)' }}
        >
          {swatch.mark}
        </span>
        <WaveBars tone="dark" />
      </div>

      <span className="absolute left-2 top-2 flex flex-wrap gap-1">
        {audioUrl ? (
          <span className="rounded-md border border-line bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-ink/70">
            有音频
          </span>
        ) : (
          <span className="rounded-md border border-warn/40 bg-warn/20 px-1.5 py-0.5 text-[9px] font-medium text-warn">
            缺音频
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

function SoundCardMoreMenu({
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
