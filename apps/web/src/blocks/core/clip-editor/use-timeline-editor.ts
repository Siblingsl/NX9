import { useCallback, useRef, useState } from 'react';
import {
  applyTimelineOps,
  migrateTimelinePayload,
  type TimelineOp,
  type TimelinePayload,
} from '@nx9/shared';

const MAX_HISTORY = 60;

export interface TimelineEditor {
  timeline: TimelinePayload | null;
  canUndo: boolean;
  canRedo: boolean;
  /** 执行结构化操作（进撤销栈并持久化）；无变化时返回 null */
  apply: (ops: TimelineOp | TimelineOp[]) => TimelinePayload | null;
  undo: () => void;
  redo: () => void;
  /** 整体替换（AI 编排结果等）；keepHistory=true 时旧时间线可撤销回来 */
  reset: (tl: TimelinePayload | null, opts?: { keepHistory?: boolean }) => void;
}

/**
 * 时间线编辑核心：不可变 op 应用 + 撤销/重做栈。
 * 台内编辑期间此处是 SSOT；每次提交通过 onChange 回写节点 data。
 * 注意：当前值持有在 ref 上，避免 StrictMode 下 setState updater
 * 副作用（撤销栈 push）被双调。
 */
export function useTimelineEditor(
  initial: TimelinePayload | null,
  onChange: (tl: TimelinePayload) => void,
): TimelineEditor {
  const initialMigrated = initial ? migrateTimelinePayload(initial) : null;
  const currentRef = useRef<TimelinePayload | null>(initialMigrated);
  const undoStack = useRef<TimelinePayload[]>([]);
  const redoStack = useRef<TimelinePayload[]>([]);
  const [, force] = useState(0);
  const bump = () => force((v) => v + 1);

  const apply = useCallback(
    (opsInput: TimelineOp | TimelineOp[]): TimelinePayload | null => {
      const current = currentRef.current;
      if (!current) return null;
      const ops = Array.isArray(opsInput) ? opsInput : [opsInput];
      const next = applyTimelineOps(current, ops);
      if (next === current) return null;
      undoStack.current.push(current);
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      currentRef.current = next;
      bump();
      onChange(next);
      return next;
    },
    [onChange],
  );

  const undo = useCallback(() => {
    const current = currentRef.current;
    const prev = undoStack.current.pop();
    if (!prev || !current) return;
    redoStack.current.push(current);
    currentRef.current = prev;
    bump();
    onChange(prev);
  }, [onChange]);

  const redo = useCallback(() => {
    const current = currentRef.current;
    const next = redoStack.current.pop();
    if (!next || !current) return;
    undoStack.current.push(current);
    currentRef.current = next;
    bump();
    onChange(next);
  }, [onChange]);

  const reset = useCallback(
    (tl: TimelinePayload | null, opts?: { keepHistory?: boolean }) => {
      if (opts?.keepHistory && currentRef.current) {
        undoStack.current.push(currentRef.current);
        redoStack.current = [];
      } else {
        undoStack.current = [];
        redoStack.current = [];
      }
      const next = tl ? migrateTimelinePayload(tl) : null;
      currentRef.current = next;
      bump();
      if (next) onChange(next);
    },
    [onChange],
  );

  return {
    timeline: currentRef.current,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    apply,
    undo,
    redo,
    reset,
  };
}
