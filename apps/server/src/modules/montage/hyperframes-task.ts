export const HF_PRODUCER_UNAVAILABLE =
  '@hyperframes/producer 不可用，已拒绝占位黑片。请安装该依赖或改用 Remotion / FFmpeg 引擎。';

export interface HyperframesTaskRecord {
  status: string;
  url?: string;
  message?: string;
  updatedAt?: number;
}

/** F-046: cancelled 不得被后续 done/error 覆写 */
export function applyHyperframesTaskUpdate<T extends HyperframesTaskRecord>(
  current: T | undefined,
  next: T,
): T | null {
  if (current?.status === 'cancelled' && next.status !== 'cancelled') return null;
  return next;
}
