/**
 * 续写集数弹层（成稿抽屉底栏）。
 */
import type { ReactNode } from 'react';
import type { ScreenplayPackage } from '@nx9/shared';

export interface ContinuePopProps {
  pkg: ScreenplayPackage;
  continueCount: number | 'all';
  continueBusy: boolean;
  onChangeCount: (n: number | 'all') => void;
  onCancel: () => void;
  onStart: () => void;
}

export function ContinuePop({
  pkg,
  continueCount,
  continueBusy,
  onChangeCount,
  onCancel,
  onStart,
}: ContinuePopProps): ReactNode {
  const previewExtra = (() => {
    if (continueCount === 'all') {
      const current = pkg.screenplay.episodes.length;
      const target = pkg.brief.episodeCount;
      if (typeof target === 'number' && target > current) return target - current;
      return 10;
    }
    return continueCount > 0 ? continueCount : 0;
  })();

  return (
    <div className="sd2-continue-pop" role="dialog" onClick={(e) => e.stopPropagation()}>
      <div className="sd2-continue-pop__title">续写集数</div>
      <div className="sd2-continue-pop__preview">
        预览：当前 {pkg.screenplay.episodes.length} 集
        {continueCount === 'all'
          ? ` → 将新增 ${previewExtra} 集（全部）`
          : continueCount > 0
            ? ` → 将新增 ${continueCount} 集`
            : ''}
      </div>
      <div className="sd2-continue-pop__opts">
        {([1, 2, 3, 5, 10] as const).map((n) => (
          <button
            key={n}
            type="button"
            className={`sd2-continue-pop__opt ${continueCount === n ? 'is-on' : ''}`}
            onClick={() => onChangeCount(n)}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className={`sd2-continue-pop__opt ${continueCount === 'all' ? 'is-on' : ''}`}
          onClick={() => onChangeCount('all')}
        >
          全部
        </button>
      </div>
      <div className="sd2-continue-pop__all-desc">
        全部 = 补齐大纲目标集数；无目标则续写 10 集
      </div>
      <div className="sd2-continue-pop__acts">
        <button type="button" className="sd2-btn sd2-btn--ghost" onClick={onCancel}>取消</button>
        <button type="button" className="sd2-btn sd2-btn--primary" disabled={continueBusy} onClick={onStart}>
          {continueBusy ? '续写中…' : '开始续写'}
        </button>
      </div>
    </div>
  );
}
