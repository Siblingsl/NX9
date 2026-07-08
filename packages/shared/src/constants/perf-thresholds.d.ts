export declare const PERF: {
    readonly heavyLinkCount: 32;
    readonly heavyBlockCount: 80;
    readonly saveDebounceMs: 700;
    readonly historyDepth: 40;
    readonly thumbConcurrency: 3;
    readonly gridStep: 20;
    readonly minZoom: 0.08;
    readonly maxZoom: 2.4;
};
export type PerfTier = 'light' | 'balanced' | 'intensive';
export declare function resolvePerfTier(blockCount: number, linkCount: number): PerfTier;
