import { useMemo, useRef, useState } from 'react';
import {
  Clapperboard,
  Film,
  Grid2x2,
  Grid3x3,
  Image as ImageIcon,
  Images,
  Lightbulb,
  Mountain,
  Package,
  Redo2,
  ScanFace,
  Sparkles,
  Type,
  Undo2,
  UserRound,
  Users,
  Wand2,
  ZoomIn,
} from 'lucide-react';
import { ComposerPopover } from '../../composer/ComposerPopover';
import {
  PICTURE_PRO_ACTIONS,
  PICTURE_PRO_CATEGORIES,
  type PictureProActionDef,
  type PictureProActionId,
  type PictureProCategoryId,
} from './picture-pro-actions';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const ACTION_ICONS: Partial<Record<PictureProActionId, React.ComponentType<{ size?: number; className?: string }>>> = {
  'text-to-image': Type,
  'image-to-image': ImageIcon,
  'upscale-hd': ZoomIn,
  'director-storyboard': Clapperboard,
  storyboard: Film,
  'grid-25': Grid3x3,
  'story-grid-4': Grid2x2,
  'evolve-plus-3s': Redo2,
  'evolve-minus-5s': Undo2,
  'panorama-720': Mountain,
  'multi-cam-9': Images,
  'char-face-3view': ScanFace,
  'char-design-sheet': UserRound,
  'char-turnaround': Users,
  'scene-design-sheet': Mountain,
  'product-design-sheet': Package,
  'portrait-refine': Sparkles,
  'cinematic-light': Lightbulb,
};

const MENU_CATEGORIES: PictureProCategoryId[] = [
  'storyboard',
  'spatial',
  'design',
  'quality',
];

export interface PictureProActionMenuProps {
  activeId?: string | null;
  onSelect: (action: PictureProActionDef) => void;
  /** 触发按钮样式：toolbar | header */
  variant?: 'toolbar' | 'header';
}

export function PictureProActionMenu({
  activeId,
  onSelect,
  variant = 'toolbar',
}: PictureProActionMenuProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    return MENU_CATEGORIES.map((catId) => {
      const cat = PICTURE_PRO_CATEGORIES.find((c) => c.id === catId)!;
      const actions = PICTURE_PRO_ACTIONS.filter((a) => a.category === catId);
      return { cat, actions };
    });
  }, []);

  const activeLabel =
    PICTURE_PRO_ACTIONS.find((a) => a.id === activeId)?.label ?? '专业工具';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        className={
          variant === 'header'
            ? `inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors ${
                open || activeId
                  ? 'bg-brand/10 text-brand'
                  : 'text-ink/55 hover:text-ink hover:bg-surface/80'
              }`
            : `inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] transition-colors ${
                open || activeId
                  ? 'bg-brand/10 text-brand'
                  : 'text-ink/55 hover:text-ink hover:bg-surface/90'
              }`
        }
        title="LibTV 级专业图像工具"
      >
        <Wand2 size={variant === 'header' ? 13 : 12} />
        <span className="max-w-[88px] truncate">{activeLabel}</span>
      </button>

      <ComposerPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        placement="above"
        align="start"
        width={420}
        tone="desk"
      >
        <div className="px-2.5 pt-2.5 pb-2" onMouseDown={stop}>
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-[11px] font-medium text-ink/70">专业图像工具</p>
            <p className="text-[9px] text-ink/35">对齐 LibTV 图片节点能力</p>
          </div>

          {/* 基础快捷 */}
          <div className="flex flex-wrap gap-1 mb-2.5 px-0.5">
            {PICTURE_PRO_ACTIONS.filter((a) => a.category === 'quick').map((a) => {
              const Icon = ACTION_ICONS[a.id] ?? Wand2;
              const active = a.id === activeId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onSelect(a);
                    setOpen(false);
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] border transition-colors ${
                    active
                      ? 'border-brand/35 bg-brand/10 text-brand'
                      : 'border-line/40 text-ink/60 hover:border-brand/25 hover:text-ink'
                  }`}
                >
                  <Icon size={12} />
                  {a.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-3 max-h-[320px] overflow-y-auto nx9-scroll pr-0.5">
            {grouped.map(({ cat, actions }) => (
              <div key={cat.id} className="min-w-0">
                <p className="px-1.5 mb-1 text-[10px] font-medium text-ink/40 tracking-wide">
                  {cat.label}
                </p>
                <div className="space-y-0.5">
                  {actions.map((a) => {
                    const Icon = ACTION_ICONS[a.id] ?? Wand2;
                    const active = a.id === activeId;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          onSelect(a);
                          setOpen(false);
                        }}
                        className={`w-full flex items-start gap-2 px-1.5 py-1.5 rounded-lg text-left transition-colors ${
                          active
                            ? 'bg-brand/10 text-ink'
                            : 'text-ink/70 hover:bg-surface/90'
                        }`}
                        title={a.hint}
                      >
                        <span
                          className={`mt-0.5 shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${
                            active ? 'bg-brand/15 text-brand' : 'bg-surface text-ink/45'
                          }`}
                        >
                          <Icon size={13} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] font-medium leading-tight">
                            {a.label}
                          </span>
                          <span className="block text-[9px] text-ink/40 leading-snug line-clamp-2">
                            {a.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ComposerPopover>
    </>
  );
}

/** 节点空态快捷：图生图 / 图片高清 */
export function PictureQuickEmptyActions({
  onSelect,
}: {
  onSelect: (action: PictureProActionDef) => void;
}) {
  const quick = PICTURE_PRO_ACTIONS.filter((a) => a.quickOnEmpty);
  return (
    <div className="flex flex-col gap-1.5 nodrag nopan" onMouseDown={stop}>
      <p className="text-[10px] text-ink/40 mb-0.5">尝试：</p>
      {quick.map((a) => {
        const Icon = ACTION_ICONS[a.id] ?? Wand2;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className="inline-flex items-center gap-1.5 text-[11px] text-ink/55 hover:text-brand transition-colors"
          >
            <Icon size={13} className="opacity-70" />
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
