import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';

export interface FlowSnapshot {
  nodes: Node[];
  edges: Edge[];
  takes?: import('@nx9/shared').TakeRecord[];
}

export function useFlowHistory(capacity = 40) {
  const stackRef = useRef<FlowSnapshot[]>([]);
  const indexRef = useRef(-1);
  const [revision, setRevision] = useState(0);

  const push = useCallback(
    (snapshot: FlowSnapshot) => {
      const stack = stackRef.current.slice(0, indexRef.current + 1);
      stack.push({
        nodes: structuredClone(snapshot.nodes),
        edges: structuredClone(snapshot.edges),
        takes: snapshot.takes ? structuredClone(snapshot.takes) : undefined,
      });
      if (stack.length > capacity) stack.shift();
      stackRef.current = stack;
      indexRef.current = stack.length - 1;
      setRevision((n) => n + 1);
    },
    [capacity],
  );

  const undo = useCallback((): FlowSnapshot | null => {
    if (indexRef.current <= 0) return null;
    indexRef.current -= 1;
    setRevision((n) => n + 1);
    return stackRef.current[indexRef.current] ?? null;
  }, []);

  const redo = useCallback((): FlowSnapshot | null => {
    if (indexRef.current >= stackRef.current.length - 1) return null;
    indexRef.current += 1;
    setRevision((n) => n + 1);
    return stackRef.current[indexRef.current] ?? null;
  }, []);

  void revision;
  const canUndo = indexRef.current > 0;
  const canRedo = indexRef.current < stackRef.current.length - 1;

  return { push, undo, redo, canUndo, canRedo };
}
