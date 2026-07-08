/** Performance tier thresholds — tuned to keep FlowSurface responsive */
export const PERF = {
  /** Switch to reduced-motion edge rendering */
  heavyLinkCount: 32,
  /** Hide non-focused socket chrome during drag */
  heavyBlockCount: 80,
  /** Debounce workspace persistence (ms) */
  saveDebounceMs: 700,
  /** History stack depth */
  historyDepth: 40,
  /** Thumbnail generation concurrency on server */
  thumbConcurrency: 3,
  /** Grid snap interval */
  gridStep: 20,
  /** Minimum zoom */
  minZoom: 0.08,
  /** Maximum zoom */
  maxZoom: 2.4,
} as const;

export type PerfTier = 'light' | 'balanced' | 'intensive';

export function resolvePerfTier(blockCount: number, linkCount: number): PerfTier {
  if (blockCount >= PERF.heavyBlockCount || linkCount >= PERF.heavyLinkCount) {
    return 'intensive';
  }
  if (blockCount >= PERF.heavyBlockCount * 0.5 || linkCount >= PERF.heavyLinkCount * 0.5) {
    return 'balanced';
  }
  return 'light';
}
