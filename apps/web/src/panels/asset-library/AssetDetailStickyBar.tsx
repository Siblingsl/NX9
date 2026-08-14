import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, MoreHorizontal, Sparkles } from 'lucide-react';

export type StickyGenAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
};

export type StickyMoreAction = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  title?: string;
  disabled?: boolean;
};

/**
 * 详情顶栏：回列表 / 回上一实体 / 徽章 / 复制@ / 锁定 / 主生成(+设置) / 更多
 * （UX-P03 · L5 · P1′ R01/P10/P13）
 */
export function AssetDetailStickyBar({
  title,
  badge,
  onBackToList,
  navPrevLabel,
  onBackToPrev,
  onCopyMention,
  lockLabel,
  onToggleLock,
  revisionLabel,
  onBumpRevision,
  primaryGen,
  genSettingsSlot,
  moreActions,
  more,
}: {
  title: string;
  /** 预览 / 只读 等 */
  badge?: string | null;
  onBackToList: () => void;
  navPrevLabel?: string | null;
  onBackToPrev?: () => void;
  onCopyMention?: () => void;
  lockLabel?: string;
  onToggleLock?: () => void;
  /** 如「资产 v2」 */
  revisionLabel?: string | null;
  onBumpRevision?: () => void;
  primaryGen?: StickyGenAction | StickyGenAction[];
  /** 折叠在主生成旁的 GenSettings */
  genSettingsSlot?: ReactNode;
  moreActions?: StickyMoreAction[];
  /** 兼容旧用法；优先 moreActions */
  more?: ReactNode;
}) {
  const genItems = !primaryGen
    ? []
    : Array.isArray(primaryGen)
      ? primaryGen
      : [primaryGen];
  const [genOpen, setGenOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const genRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!genOpen && !settingsOpen && !moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (genRef.current?.contains(t)) return;
      if (moreRef.current?.contains(t)) return;
      setGenOpen(false);
      setSettingsOpen(false);
      setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [genOpen, settingsOpen, moreOpen]);

  const primary = genItems[0];
  const hasMenu = genItems.length > 1;
  const hasMoreMenu = (moreActions?.length ?? 0) > 0;

  return (
    <div className="nx9-asset-lib-sticky flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-4">
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center justify-center gap-0.5 rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
        onClick={onBackToList}
        title="回到当前 Tab 列表"
      >
        <ChevronLeft size={12} className="shrink-0" />
        回列表
      </button>
      {navPrevLabel && onBackToPrev ? (
        <button
          type="button"
          className="inline-flex h-7 max-w-[7.5rem] shrink-0 items-center truncate rounded-md border border-brand/30 bg-brand/5 px-2 text-[10px] leading-none text-brand hover:bg-brand/10"
          onClick={onBackToPrev}
          title={`回到「${navPrevLabel}」`}
        >
          ← {navPrevLabel}
        </button>
      ) : null}
      {badge ? (
        <span className="shrink-0 rounded-md border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[9px] font-medium text-warn">
          {badge}
        </span>
      ) : null}
      <span className="flex min-h-0 min-w-0 flex-1 items-center truncate text-xs font-semibold leading-none text-ink">
        {title}
      </span>
      {revisionLabel ? (
        <span
          className="hidden shrink-0 text-[10px] text-ink/40 sm:inline"
          title="资产版本：钉旧镜用的是此版本；「新建版本」会 revision+1 并锁定 Prompt 快照"
        >
          {revisionLabel}
        </span>
      ) : null}
      {onCopyMention ? (
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
          onClick={onCopyMention}
          title="复制 @提及，粘贴到 Prompt / 分镜字段"
        >
          复制 @
        </button>
      ) : null}
      {lockLabel && onToggleLock ? (
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
          onClick={onToggleLock}
          title="锁定：禁止 Prompt 漂移；新建版本会自动锁快照"
        >
          {lockLabel}
        </button>
      ) : null}
      {primary ? (
        <div className="relative flex shrink-0 items-center gap-0.5" ref={genRef}>
          {hasMenu ? (
            <>
              <button
                type="button"
                disabled={primary.disabled}
                title={primary.title || '主生成'}
                className="inline-flex h-7 items-center gap-0.5 rounded-md border border-brand/35 bg-brand/10 px-2 text-[10px] font-medium leading-none text-brand disabled:opacity-45"
                onClick={() => {
                  setSettingsOpen(false);
                  setGenOpen((v) => !v);
                }}
              >
                <Sparkles size={11} />
                主生成
                <ChevronDown size={11} />
              </button>
              {genOpen ? (
                <div className="nx9-asset-lib-menu absolute right-0 top-full z-30 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
                  {genItems.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      disabled={item.disabled}
                      title={item.title}
                      className="flex w-full px-3 py-1.5 text-left text-[11px] text-ink/80 hover:bg-brand/10 hover:text-brand disabled:opacity-40"
                      onClick={() => {
                        setGenOpen(false);
                        item.onClick();
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              disabled={primary.disabled}
              title={primary.title || primary.label}
              className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-brand/35 bg-brand/10 px-2 text-[10px] font-medium leading-none text-brand disabled:opacity-45"
              onClick={primary.onClick}
            >
              <Sparkles size={11} />
              {primary.label}
            </button>
          )}
          {genSettingsSlot ? (
            <>
              <button
                type="button"
                className="inline-flex h-7 items-center rounded-md border border-line px-1.5 text-[10px] text-ink/50 hover:border-brand/40 hover:text-brand"
                title="生成参数"
                onClick={() => {
                  setGenOpen(false);
                  setSettingsOpen((v) => !v);
                }}
              >
                参数
              </button>
              {settingsOpen ? (
                <div className="nx9-asset-lib-menu absolute right-0 top-full z-30 mt-1 w-[min(280px,70vw)] rounded-lg border border-line bg-surface p-2 shadow-lg">
                  {genSettingsSlot}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {hasMoreMenu ? (
        <div className="relative shrink-0" ref={moreRef}>
          <button
            type="button"
            aria-label="更多"
            aria-expanded={moreOpen}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink/55 hover:border-brand/40 hover:text-brand"
            onClick={() => {
              setGenOpen(false);
              setSettingsOpen(false);
              setMoreOpen((v) => !v);
            }}
          >
            <MoreHorizontal size={14} />
          </button>
          {moreOpen ? (
            <div className="nx9-asset-lib-menu absolute right-0 top-full z-30 mt-1 min-w-[9.5rem] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
              {onBumpRevision ? (
                <button
                  type="button"
                  className="flex w-full px-3 py-1.5 text-left text-[11px] text-ink/80 hover:bg-brand/10 hover:text-brand"
                  title="revision+1，并锁定当前 Prompt 快照；旧镜 pin 仍钉旧版"
                  onClick={() => {
                    setMoreOpen(false);
                    onBumpRevision();
                  }}
                >
                  新建版本
                </button>
              ) : null}
              {moreActions!.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.disabled}
                  title={item.title}
                  className={`flex w-full px-3 py-1.5 text-left text-[11px] hover:bg-brand/10 disabled:opacity-40 ${
                    item.danger ? 'text-red-500 hover:bg-red-500/10' : 'text-ink/80 hover:text-brand'
                  }`}
                  onClick={() => {
                    setMoreOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : more ? (
        more
      ) : onBumpRevision ? (
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center rounded-md border border-line px-2 text-[10px] text-ink/60 hover:border-brand/40"
          title="revision+1，并锁定当前 Prompt 快照"
          onClick={onBumpRevision}
        >
          新建版本
        </button>
      ) : null}
    </div>
  );
}
