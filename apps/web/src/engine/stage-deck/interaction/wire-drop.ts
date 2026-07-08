import { getDockBlocks, resolveAccepts, resolveEmits, type SocketKind } from '@nx9/shared';

export interface WireDropState {
  x: number;
  y: number;
  sourceNodeId: string;
  sourceHandle: string | null;
  sourceType: string;
  sourceData?: Record<string, unknown>;
}

export function filterBlocksForWireDrop(state: WireDropState): string[] {
  const handleKind = (state.sourceHandle ??
    resolveEmits(state.sourceType, state.sourceData)[0] ??
    'prompt') as SocketKind;

  return getDockBlocks()
    .filter((def) => {
      if (state.sourceType === def.kind && state.sourceType !== 'passthrough') return false;
      const accepts = resolveAccepts(def.kind);
      return accepts.includes('wildcard') || accepts.includes(handleKind);
    })
    .map((d) => d.kind);
}
