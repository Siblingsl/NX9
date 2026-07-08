import type { ViewMode } from '@nx9/shared';

export const REVIEW_MODE: ViewMode = 'review';

export function isReviewMode(mode: ViewMode): boolean {
  return mode === 'review';
}
