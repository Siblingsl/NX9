import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/**
 * 输入框本地草稿 + debounce 提交。
 * 聚焦时忽略外部 committed 回写；失焦/卸载时立即 flush，避免切 tab 丢字。
 */
export function useDebouncedField(
  committed: string,
  onCommit: (value: string) => void,
  delayMs = 300,
) {
  const [draft, setDraft] = useState(committed);
  const committedRef = useRef(committed);
  const onCommitRef = useRef(onCommit);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(false);
  const draftRef = useRef(draft);
  onCommitRef.current = onCommit;
  draftRef.current = draft;

  if (committed !== committedRef.current) {
    committedRef.current = committed;
    if (!focusedRef.current && committed !== draft) {
      setDraft(committed);
    }
  }

  const flush = (value: string = draftRef.current) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (value !== committedRef.current) onCommitRef.current(value);
  };

  const onChange = (value: string) => {
    setDraft(value);
    draftRef.current = value;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onCommitRef.current(value);
    }, delayMs);
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (draftRef.current !== committedRef.current) {
      onCommitRef.current(draftRef.current);
    }
  }, []);

  return {
    value: draft,
    onChange,
    onFocus: () => { focusedRef.current = true; },
    onBlur: () => { focusedRef.current = false; flush(); },
  };
}

type DebouncedInputProps = {
  committed: string;
  onCommit: (value: string) => void;
  delayMs?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

export function DebouncedInput({ committed, onCommit, delayMs = 300, onFocus, onBlur, ...rest }: DebouncedInputProps) {
  const field = useDebouncedField(committed, onCommit, delayMs);
  return (
    <input
      {...rest}
      value={field.value}
      onChange={(e) => field.onChange(e.target.value)}
      onFocus={(e) => { field.onFocus(); onFocus?.(e); }}
      onBlur={(e) => { field.onBlur(); onBlur?.(e); }}
    />
  );
}

type DebouncedTextareaProps = {
  committed: string;
  onCommit: (value: string) => void;
  delayMs?: number;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;

export function DebouncedTextarea({ committed, onCommit, delayMs = 300, onFocus, onBlur, ...rest }: DebouncedTextareaProps) {
  const field = useDebouncedField(committed, onCommit, delayMs);
  return (
    <textarea
      {...rest}
      value={field.value}
      onChange={(e) => field.onChange(e.target.value)}
      onFocus={(e) => { field.onFocus(); onFocus?.(e); }}
      onBlur={(e) => { field.onBlur(); onBlur?.(e); }}
    />
  );
}
