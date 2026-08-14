import { createContext, useContext, useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

type DebouncedFieldApi = { flush: () => void; reset: () => void };
const fieldApisByScope = new Map<string, Set<DebouncedFieldApi>>();

function registerDebouncedFieldApi(scope: string, api: DebouncedFieldApi): () => void {
  let set = fieldApisByScope.get(scope);
  if (!set) {
    set = new Set();
    fieldApisByScope.set(scope, set);
  }
  set.add(api);
  return () => {
    set.delete(api);
    if (set.size === 0) fieldApisByScope.delete(scope);
  };
}

/** 关台/自动存/确认前 flush 所有本地 draft */
export function flushDebouncedFields(scope: string): void {
  for (const api of fieldApisByScope.get(scope) ?? []) api.flush();
}

/** Ctrl+Z 结构性撤销前丢弃焦点字段未提交的幽灵字符 */
export function resetDebouncedFields(scope: string): void {
  for (const api of fieldApisByScope.get(scope) ?? []) api.reset();
}

const DebouncedFieldScopeContext = createContext<{ scope?: string; onDirty?: () => void }>({});

export function DebouncedFieldScopeProvider({
  scope,
  onDirty,
  children,
}: {
  scope?: string;
  onDirty?: () => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ scope, onDirty }), [scope, onDirty]);
  return <DebouncedFieldScopeContext.Provider value={value}>{children}</DebouncedFieldScopeContext.Provider>;
}

/**
 * 输入框本地草稿 + debounce 提交。
 * 聚焦时忽略外部 committed 回写；失焦/卸载时立即 flush，避免切 tab 丢字。
 */
export function useDebouncedField(
  committed: string,
  onCommit: (value: string) => void,
  delayMs = 300,
  options?: { scope?: string; onDirty?: () => void },
) {
  const [draft, setDraft] = useState(committed);
  const committedRef = useRef(committed);
  const onCommitRef = useRef(onCommit);
  const onDirtyRef = useRef(options?.onDirty);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(false);
  const draftRef = useRef(draft);
  onCommitRef.current = onCommit;
  onDirtyRef.current = options?.onDirty;
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

  const reset = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    draftRef.current = committedRef.current;
    setDraft(committedRef.current);
  };

  const onChange = (value: string) => {
    setDraft(value);
    draftRef.current = value;
    onDirtyRef.current?.();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onCommitRef.current(value);
    }, delayMs);
  };

  useEffect(() => {
    const scope = options?.scope;
    if (!scope) return;
    return registerDebouncedFieldApi(scope, { flush, reset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.scope]);

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
  flushScope?: string;
  onDirty?: () => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

export function DebouncedInput({ committed, onCommit, delayMs = 300, flushScope, onDirty, onFocus, onBlur, ...rest }: DebouncedInputProps) {
  const ctx = useContext(DebouncedFieldScopeContext);
  const field = useDebouncedField(committed, onCommit, delayMs, {
    scope: flushScope ?? ctx.scope,
    onDirty: onDirty ?? ctx.onDirty,
  });
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
  flushScope?: string;
  onDirty?: () => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;

export function DebouncedTextarea({ committed, onCommit, delayMs = 300, flushScope, onDirty, onFocus, onBlur, ...rest }: DebouncedTextareaProps) {
  const ctx = useContext(DebouncedFieldScopeContext);
  const field = useDebouncedField(committed, onCommit, delayMs, {
    scope: flushScope ?? ctx.scope,
    onDirty: onDirty ?? ctx.onDirty,
  });
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
