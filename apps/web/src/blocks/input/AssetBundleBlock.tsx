import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { EditableImage } from '../shared/EditableImage';

function AssetBundleBlock(props: NodeProps) {
  const items = (props.data?.bundleItems as { kind: string; url: string; label?: string }[]) ?? [];
  const count = (props.data?.bundleCount as number) ?? items.length;

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-ink/50">已打包 {count} 项上游素材</p>
        <ul className="max-h-40 overflow-y-auto nx9-scroll space-y-2">
          {items.map((item, i) => (
            <li key={`${item.kind}-${i}`} className="rounded-lg border border-line p-1.5">
              <span className="text-[10px] text-accent uppercase">{item.kind}</span>
              {item.kind === 'picture' ? (
                <EditableImage
                  src={item.url}
                  className="w-full mt-1 rounded max-h-20 object-cover"
                  onEdit={() => window.open(item.url, '_blank')}
                />
              ) : (
                <p className="truncate font-mono text-[10px] mt-1">{item.url}</p>
              )}
            </li>
          ))}
        </ul>
        {items.length === 0 && (
          <p className="text-center text-ink/40 py-4">运行模块以收集上游素材</p>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(AssetBundleBlock);
