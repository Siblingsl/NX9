import { useRef } from 'react';
import type { AssetLibraryKind } from '@nx9/shared';
import { AssetMentionPicker } from './AssetMentionPicker';
import { useAssetMention } from './useAssetMention';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface AssetMentionInputProps {
  value: string;
  onChange: (next: string) => void;
  as?: 'input' | 'textarea';
  placeholder?: string;
  className?: string;
  kinds?: AssetLibraryKind[];
  enabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export function AssetMentionInput({
  value,
  onChange,
  as = 'input',
  placeholder,
  className,
  kinds,
  enabled = true,
  onFocus,
  onBlur,
  onMouseDown,
}: AssetMentionInputProps) {
  const mention = useAssetMention({ value, onChange, kinds, enabled });
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const bindRef = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    (mention.inputRef as React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>).current =
      el;
    if (as === 'textarea') {
      textareaRef.current = el as HTMLTextAreaElement | null;
    } else {
      inputRef.current = el as HTMLInputElement | null;
    }
  };

  const commonProps = {
    value,
    placeholder,
    className,
    onFocus,
    onBlur,
    onMouseDown: (e: React.MouseEvent) => {
      stop(e);
      onMouseDown?.(e);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      mention.handleValueChange(e.target.value, e.target.selectionStart ?? 0);
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') mention.close();
    },
    onClick: (e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      mention.syncFromInput(el.value, el.selectionStart ?? 0, el);
    },
  };

  return (
    <>
      {as === 'textarea' ? (
        <textarea ref={bindRef} {...commonProps} />
      ) : (
        <input type="text" ref={bindRef} {...commonProps} />
      )}
      <AssetMentionPicker
        open={mention.open}
        position={mention.position ? { ...mention.position, placement: 'below' as const } : null}
        query={mention.query}
        kinds={kinds}
        activeKind={mention.activeKind}
        onActiveKindChange={mention.setActiveKind}
        onPick={mention.pickItem}
        panelRef={mention.panelRef}
      />
    </>
  );
}
