import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveNodePromptField, resolveNodePromptText } from '@nx9/shared';

const SYNC_MS = 280;

export interface UseLocalNodePromptOptions {
  blockId: string;
  data: Record<string, unknown>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  onHistoryPush?: (text: string) => void;
}

export function useLocalNodePrompt({
  blockId,
  data,
  updateNodeData,
  onHistoryPush,
}: UseLocalNodePromptOptions) {
  const nodeText = resolveNodePromptText(data);
  const promptField = resolveNodePromptField(data);
  const [draft, setDraft] = useState(nodeText);
  const draftRef = useRef(nodeText);
  const focusedRef = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldRef = useRef(promptField);
  fieldRef.current = promptField;

  useEffect(() => {
    draftRef.current = nodeText;
    setDraft(nodeText);
    focusedRef.current = false;
  }, [blockId]);

  useEffect(() => {
    if (focusedRef.current) return;
    if (nodeText !== draftRef.current) {
      draftRef.current = nodeText;
      setDraft(nodeText);
    }
  }, [nodeText]);

  useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      if (historyTimer.current) clearTimeout(historyTimer.current);
    },
    [],
  );

  const flush = useCallback(
    (text: string) => {
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
        syncTimer.current = null;
      }
      updateNodeData(blockId, { [fieldRef.current]: text });
    },
    [blockId, updateNodeData],
  );

  const scheduleHistory = useCallback(
    (text: string) => {
      if (!onHistoryPush) return;
      if (historyTimer.current) clearTimeout(historyTimer.current);
      historyTimer.current = setTimeout(() => onHistoryPush(text), 800);
    },
    [onHistoryPush],
  );

  const onChange = useCallback(
    (next: string) => {
      setDraft(next);
      draftRef.current = next;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => flush(next), SYNC_MS);
      scheduleHistory(next);
    },
    [flush, scheduleHistory],
  );

  const onFocus = useCallback(() => {
    focusedRef.current = true;
  }, []);

  const onBlur = useCallback(() => {
    focusedRef.current = false;
    flush(draftRef.current);
  }, [flush]);

  const applyText = useCallback(
    (text: string) => {
      setDraft(text);
      draftRef.current = text;
      flush(text);
      onHistoryPush?.(text);
    },
    [flush, onHistoryPush],
  );

  const flushNow = useCallback(() => {
    flush(draftRef.current);
  }, [flush]);

  return { draft, onChange, onFocus, onBlur, applyText, flushNow };
}
