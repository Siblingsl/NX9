/** 来源语境 / 导航栈 / 建议建档 — 浏览与全页编辑态共用（UX-P02 / L5） */
export function AssetLibrarySourceStrip({
  returnHint,
  suggestCreateLabel,
  suggestCreateExactExists,
  canCreateAsset,
  navPrevLabel,
  onPopNav,
  onReturnToSource,
  onDismissReturnHint,
  onCreateSuggested,
  onDismissSuggest,
}: {
  returnHint: string | null;
  suggestCreateLabel: string | null;
  suggestCreateExactExists: boolean;
  canCreateAsset: boolean;
  navPrevLabel: string | null;
  onPopNav: () => void;
  onReturnToSource: () => void;
  onDismissReturnHint: () => void;
  onCreateSuggested: () => void;
  onDismissSuggest: () => void;
}) {
  const showSuggest = Boolean(suggestCreateLabel && !suggestCreateExactExists && canCreateAsset);
  if (!returnHint && !showSuggest && !navPrevLabel) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-brand/20 bg-brand/5 px-4 py-2 text-[11px] text-ink/70">
      {navPrevLabel ? (
        <button
          type="button"
          onClick={onPopNav}
          className="rounded-full bg-surface px-2 py-0.5 text-brand hover:underline"
        >
          ← 回上一实体「{navPrevLabel}」
        </button>
      ) : null}
      {returnHint ? (
        <>
          <span className="rounded-full bg-surface px-2 py-0.5 text-ink/55">
            来自{returnHint}
          </span>
          <button
            type="button"
            className="rounded-full bg-brand/15 px-2.5 py-0.5 text-[11px] font-medium text-brand hover:bg-brand/25"
            onClick={onReturnToSource}
          >
            返回{returnHint}
          </button>
          <button
            type="button"
            className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/45 hover:text-ink/70"
            onClick={onDismissReturnHint}
            title="清除语境条，继续浏览素材库"
          >
            留在素材库
          </button>
        </>
      ) : null}
      {showSuggest ? (
        <>
          <span className="min-w-0 flex-1 truncate">
            建议建档「{suggestCreateLabel}」（不会自动写入库，需确认）
          </span>
          <button
            type="button"
            onClick={onCreateSuggested}
            className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-medium text-white"
          >
            立即新建
          </button>
          <button
            type="button"
            onClick={onDismissSuggest}
            className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] text-ink/50"
          >
            忽略
          </button>
        </>
      ) : returnHint ? (
        <span className="text-ink/45">补齐后可返回继续设定就绪检查</span>
      ) : null}
    </div>
  );
}
