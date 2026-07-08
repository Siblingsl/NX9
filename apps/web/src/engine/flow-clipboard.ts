import type { Edge, Node } from '@xyflow/react';

export interface FlowClipboard {
  nodes: Node[];
  edges: Edge[];
}

const RUNTIME_KEYS = ['status', 'taskId', 'progress', 'error', 'isRunning', 'isPolling'];
const DUPLICATE_OFFSET = { x: 48, y: 48 };

let clipboard: FlowClipboard | null = null;
let pasteAnchorScreen: { x: number; y: number } | null = null;

export function setPasteAnchorScreen(screen: { x: number; y: number }) {
  pasteAnchorScreen = screen;
}

export function getClipboardCount(): number {
  return clipboard?.nodes.length ?? 0;
}

function sanitizeData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(data ?? {}) };
  for (const key of RUNTIME_KEYS) delete next[key];
  next.status = 'idle';
  return next;
}

export function copySelection(nodes: Node[], edges: Edge[]): FlowClipboard | null {
  const selected = nodes.filter((n) => n.selected);
  if (selected.length === 0) return null;
  const ids = new Set(selected.map((n) => n.id));
  const selEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  clipboard = {
    nodes: JSON.parse(JSON.stringify(selected)) as Node[],
    edges: JSON.parse(JSON.stringify(selEdges)) as Edge[],
  };
  return clipboard;
}

function positionAtAnchor(
  nodes: Node[],
  anchorFlow: { x: number; y: number },
): Node[] {
  if (nodes.length === 0) return nodes;
  const minX = Math.min(...nodes.map((n) => n.position?.x ?? 0));
  const minY = Math.min(...nodes.map((n) => n.position?.y ?? 0));
  return nodes.map((n) => ({
    ...n,
    position: {
      x: anchorFlow.x + ((n.position?.x ?? 0) - minX),
      y: anchorFlow.y + ((n.position?.y ?? 0) - minY),
    },
  }));
}

function offsetNodes(nodes: Node[], offset: { x: number; y: number }): Node[] {
  return nodes.map((n) => ({
    ...n,
    position: {
      x: (n.position?.x ?? 0) + offset.x,
      y: (n.position?.y ?? 0) + offset.y,
    },
  }));
}

export interface PasteResult {
  nodes: Node[];
  edges: Edge[];
}

export function pasteClipboard(
  existingNodes: Node[],
  screenToFlow: (screen: { x: number; y: number }) => { x: number; y: number },
  mode: 'pointer' | 'offset' = 'pointer',
): PasteResult | null {
  if (!clipboard || clipboard.nodes.length === 0) return null;

  const idMap = new Map<string, string>();
  const stamp = Date.now();
  let newNodes = clipboard.nodes.map((n, idx) => {
    const newId = `blk-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
    idMap.set(n.id, newId);
    return {
      ...n,
      id: newId,
      selected: true,
      data: sanitizeData(n.data as Record<string, unknown>),
    } as Node;
  });

  if (mode === 'offset') {
    newNodes = offsetNodes(newNodes, DUPLICATE_OFFSET);
  } else if (pasteAnchorScreen) {
    const anchor = screenToFlow(pasteAnchorScreen);
    newNodes = positionAtAnchor(newNodes, anchor);
  }

  const maxIndex = existingNodes.reduce(
    (m, n) => Math.max(m, (n.data?.blockIndex as number) ?? 0),
    0,
  );
  newNodes = newNodes.map((n, i) => ({
    ...n,
    data: { ...n.data, blockIndex: maxIndex + i + 1 },
  }));

  const newEdges = clipboard.edges
    .map((e, idx) => {
      const source = idMap.get(e.source);
      const target = idMap.get(e.target);
      if (!source || !target) return null;
      return {
        ...e,
        id: `link-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        source,
        target,
      } as Edge;
    })
    .filter(Boolean) as Edge[];

  return { nodes: newNodes, edges: newEdges };
}

/** Alt+Shift duplicate: copy node and preserve incoming edges to the new node */
export function duplicateNodeWithIncomingEdges(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
  nextBlockIndexStart: number,
): PasteResult | null {
  const source = nodes.find((n) => n.id === nodeId);
  if (!source) return null;

  const stamp = Date.now();
  const newId = `blk-${stamp}-as-${Math.random().toString(36).slice(2, 5)}`;
  const newNode: Node = {
    ...source,
    id: newId,
    selected: true,
    position: {
      x: (source.position?.x ?? 0) + DUPLICATE_OFFSET.x,
      y: (source.position?.y ?? 0) + DUPLICATE_OFFSET.y,
    },
    data: {
      ...sanitizeData(source.data as Record<string, unknown>),
      blockIndex: nextBlockIndexStart,
    },
  };

  const incoming = edges.filter((e) => e.target === nodeId);
  const newEdges = incoming.map(
    (e, idx) =>
      ({
        ...e,
        id: `link-${stamp}-in-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        target: newId,
        selected: false,
      }) as Edge,
  );

  return { nodes: [{ ...source, selected: false }, newNode], edges: newEdges };
}
