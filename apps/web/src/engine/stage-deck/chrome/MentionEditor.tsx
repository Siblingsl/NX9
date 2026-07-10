import type { AssetLibraryKind } from '@nx9/shared';
import { AssetMentionInput } from './asset-mention/AssetMentionInput';

interface MentionEditorProps {
  blockId: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
  kinds?: AssetLibraryKind[];
}

/** 支持输入 @ 唤起素材库引用的多行编辑器 */
export function MentionEditor({
  value,
  placeholder,
  onChange,
  className,
  kinds,
}: MentionEditorProps) {
  return (
    <AssetMentionInput
      as="textarea"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      kinds={kinds}
    />
  );
}
