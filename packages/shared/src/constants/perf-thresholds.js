"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERF = void 0;
exports.resolvePerfTier = resolvePerfTier;
exports.PERF = {
    heavyLinkCount: 32,
    heavyBlockCount: 80,
    saveDebounceMs: 700,
    historyDepth: 40,
    thumbConcurrency: 3,
    gridStep: 20,
    minZoom: 0.08,
    maxZoom: 2.4,
};
function resolvePerfTier(blockCount, linkCount) {
    if (blockCount >= exports.PERF.heavyBlockCount || linkCount >= exports.PERF.heavyLinkCount) {
        return 'intensive';
    }
    if (blockCount >= exports.PERF.heavyBlockCount * 0.5 || linkCount >= exports.PERF.heavyLinkCount * 0.5) {
        return 'balanced';
    }
    return 'light';
}
//# sourceMappingURL=perf-thresholds.js.map