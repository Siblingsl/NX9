import { memo, useCallback, useRef } from 'react';
import { lookupBlock, isPromptBarGenKind } from '@nx9/shared';
import type { AssetLibraryKind } from '@nx9/shared';
import { AssetMentionInput } from '../asset-mention/AssetMentionInput';
import { PromptBarAssetStrip } from './PromptBarAssetStrip';
import { PromptBarGenFooter } from './PromptBarGenFooter';
import { usePromptHistory } from '../../stores/prompt-history';

export interface PromptComposerProps {
  blockId: string;
  kind: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** 限制可引用的素材类型；不传则展示全部 */
  assetKinds?: AssetLibraryKind[];
  data: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  showAssets?: boolean;
}

export const PromptComposer = memo(function PromptComposer({
  blockId,
  kind,
  value,
  onChange,
  placeholder,
  assetKinds,
  data,
  onPatch,
  showAssets = true,
}: PromptComposerProps) {
  const pushHistory = usePromptHistory((s) => s.push);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setValue = useCallback(
    (next: string) => {
      onChange(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => pushHistory(blockId, next), 800);
    },
    [blockId, onChange, pushHistory],
  );

  const insertMention = useCallback(
    (token: string) => setValue(value ? `${value} ${token}` : token),
    [setValue, value],
  );

  const label = lookupBlock(kind)?.label ?? kind;
  const showGen = isPromptBarGenKind(kind);

  return (
    <div className="rounded-xl border border-line dark:border-[#333] bg-white dark:bg-[#1a1a1a] overflow-hidden">
      <AssetMentionInput
        as="textarea"
        value={value}
        onChange={setValue}
        placeholder={placeholder ?? `编辑 ${label} Prompt…`}
        className="min-h-[88px] w-full border-0 rounded-none px-3 py-2 text-sm resize-none focus:outline-none bg-transparent"
        kinds={assetKinds}
      />
      {(showAssets || showGen) && (
        <div className="border-t border-line/60 px-2 py-1.5 bg-surface/40 dark:bg-[#252525]/80 space-y-0">
          {showAssets && (
            <PromptBarAssetStrip
              blockId={blockId}
              data={data}
              onPatch={onPatch}
              onInsertMention={insertMention}
              kinds={assetKinds}
            />
          )}
          {showGen && <PromptBarGenFooter blockId={blockId} kind={kind} />}
        </div>
      )}
    </div>
  );
});
