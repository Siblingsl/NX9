import type { ViewMode } from '@nx9/shared';

export const EXPLORE_MODE: ViewMode = 'explore';

export function isExploreMode(mode: ViewMode): boolean {
  return mode === 'explore';
}
