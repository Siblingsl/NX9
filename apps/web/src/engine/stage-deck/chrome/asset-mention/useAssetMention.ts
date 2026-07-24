import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetLibraryItem, AssetLibraryKind } from '@nx9/shared';
import {
  detectAssetMentionQuery,
  getInputCaretScreenPoint,
  guessKindFromMentionQuery,
  insertAssetMentionToken,
} from './asset-mention-utils';
import {
  guessLocalMediaKindFromQuery,
  insertLocalMediaMentionToken,
  type LocalMediaMentionItem,
  type LocalMediaMentionKind,
} from './local-media-mention';

export type MentionActiveKind = AssetLibraryKind | LocalMediaMentionKind;

export interface UseAssetMentionOptions {
  value: string;
  onChange: (next: string) => void;
  kinds?: AssetLibraryKind[];
  localMedia?: LocalMediaMentionItem[];
  enabled?: boolean;
}

export function useAssetMention({
  value,
  onChange,
  kinds,
  localMedia = [],
  enabled = true,
}: UseAssetMentionOptions) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeKind, setActiveKind] = useState<MentionActiveKind>('character');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const syncFromInput = useCallback(
    (text: string, cursor: number, el?: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (!enabled) {
        setOpen(false);
        return;
      }
      const q = detectAssetMentionQuery(text, cursor);
      if (q === null) {
        setOpen(false);
        return;
      }
      setQuery(q);
      const localGuess = guessLocalMediaKindFromQuery(q);
      const assetGuess = guessKindFromMentionQuery(q);
      if (localGuess) setActiveKind(localGuess);
      else if (assetGuess) setActiveKind(assetGuess);
      const target = el ?? inputRef.current;
      if (target) {
        setPosition(getInputCaretScreenPoint(target, cursor));
      }
      setOpen(true);
    },
    [enabled],
  );

  const handleValueChange = useCallback(
    (next: string, cursor: number) => {
      onChange(next);
      syncFromInput(next, cursor);
    },
    [onChange, syncFromInput],
  );

  const pickItem = useCallback(
    (item: AssetLibraryItem) => {
      const el = inputRef.current;
      const cursor = el?.selectionStart ?? value.length;
      const { value: next, cursor: nextCursor } = insertAssetMentionToken(
        value,
        cursor,
        item.kind,
        item.label,
      );
      onChange(next);
      setOpen(false);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [onChange, value],
  );

  const pickLocalMedia = useCallback(
    (item: LocalMediaMentionItem) => {
      const el = inputRef.current;
      const cursor = el?.selectionStart ?? value.length;
      const { value: next, cursor: nextCursor } = insertLocalMediaMentionToken(
        value,
        cursor,
        item.kind,
        item.label,
      );
      onChange(next);
      setOpen(false);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [onChange, value],
  );

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const reposition = () => {
      const el = inputRef.current;
      if (!el || !open) return;
      const cursor = el.selectionStart ?? value.length;
      setPosition(getInputCaretScreenPoint(el, cursor));
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, value]);

  return {
    inputRef,
    panelRef,
    open,
    query,
    position,
    activeKind,
    setActiveKind,
    handleValueChange,
    pickItem,
    pickLocalMedia,
    close,
    syncFromInput,
    kinds,
    localMedia,
  };
}
