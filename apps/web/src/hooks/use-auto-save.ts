import { useEffect, useRef, useCallback } from 'react';

export function useAutoSave<T extends Record<string, unknown>>(
  data: T,
  onSave: (data: T) => void,
  delayMs = 300,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRef = useRef<string>('');

  useEffect(() => {
    const key = JSON.stringify(data);
    if (key === prevRef.current) return;
    prevRef.current = key;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(data);
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, onSave, delayMs]);
}
