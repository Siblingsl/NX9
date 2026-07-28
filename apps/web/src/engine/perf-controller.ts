import { useMemo } from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  PERF,
  resolvePerfTier,
  resolvePerfToast,
  type PerfTier,
  type PerfToastDecision,
  type PerfToastReason,
} from '@nx9/shared';

export type { PerfToastReason, PerfToastDecision };

export interface PerfState {
  tier: PerfTier;
  intensive: boolean;
  hideChrome: boolean;
  reduceEdgeMotion: boolean;
}

/** @deprecated 使用 `@nx9/shared` 的 resolvePerfToast(blockCount, linkCount) */
export function resolvePerfToastFromGraph(
  nodes: Node[],
  edges: Edge[],
): PerfToastDecision | null {
  return resolvePerfToast(nodes.length, edges.length);
}

export { resolvePerfToast };

export function usePerfController(
  nodes: Node[],
  edges: Edge[],
  dragging: boolean,
  userReduceMotion = false,
): PerfState {
  return useMemo(() => {
    const tier = resolvePerfTier(nodes.length, edges.length);
    const intensive = tier === 'intensive';
    return {
      tier,
      intensive,
      hideChrome: intensive && dragging,
      reduceEdgeMotion: intensive || userReduceMotion || edges.length >= PERF.heavyLinkCount,
    };
  }, [nodes.length, edges.length, dragging, userReduceMotion]);
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
