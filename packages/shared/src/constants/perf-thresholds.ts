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
  /** F-012: 软上限警告阈值（节点≥500 时告警） */
  warnBlockCount: 500,
  /** F-012: 强警告阈值（节点≥1000 时强警告） */
  dangerBlockCount: 1000,
} as const;

export type PerfTier = 'light' | 'balanced' | 'intensive';

/** F-012: 性能 Toast 原因（仅阈值触发；不含制作模式 forced intensive） */
export type PerfToastReason = 'threshold' | 'soft-warn' | 'danger-warn';

export type PerfToastDecision = {
  reason: PerfToastReason;
  message: string;
  /** 升级等级：threshold=1 < soft=2 < danger=3，用于 session 去重与升档 */
  level: 1 | 2 | 3;
};

export function resolvePerfTier(blockCount: number, linkCount: number): PerfTier {
  if (blockCount >= PERF.heavyBlockCount || linkCount >= PERF.heavyLinkCount) {
    return 'intensive';
  }
  if (blockCount >= PERF.heavyBlockCount * 0.5 || linkCount >= PERF.heavyLinkCount * 0.5) {
    return 'balanced';
  }
  return 'light';
}

/**
 * F-012: 仅按节点/连线阈值决定是否提示。
 * **不**因「制作模式默认 intensive」触发（forced-mode 由 3D 面板单独文案）。
 */
export function resolvePerfToast(
  blockCount: number,
  linkCount: number,
): PerfToastDecision | null {
  if (blockCount < PERF.heavyBlockCount && linkCount < PERF.heavyLinkCount) {
    return null;
  }

  if (blockCount >= PERF.dangerBlockCount) {
    return {
      reason: 'danger-warn',
      level: 3,
      message: `节点已达 ${blockCount} 个，建议简化工作流或归档旧节点。3D 预览质量已自动降级。`,
    };
  }

  if (blockCount >= PERF.warnBlockCount) {
    return {
      reason: 'soft-warn',
      level: 2,
      message: `节点 ${blockCount} 个，已降级渲染特效并减少动画。建议归档暂停分支。`,
    };
  }

  return {
    reason: 'threshold',
    level: 1,
    message:
      linkCount >= PERF.heavyLinkCount
        ? `连线较多（${linkCount} 条），已降级特效和边缘动画。`
        : `节点较多（${blockCount} 个），已降级特效和边缘动画。`,
  };
}

/** 档位中文标签（设置页展示） */
export function perfTierLabel(tier: PerfTier): string {
  switch (tier) {
    case 'intensive':
      return '高负载（已降级特效）';
    case 'balanced':
      return '均衡';
    default:
      return '轻量';
  }
}
