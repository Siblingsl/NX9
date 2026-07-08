import type { ViewMode } from '@nx9/shared';

export const PRODUCE_MODE: ViewMode = 'produce';

export function isProduceMode(mode: ViewMode): boolean {
  return mode === 'produce';
}

export function shouldCollapseCards(mode: ViewMode, expanded?: boolean): boolean {
  return mode !== 'explore' && !expanded;
}
