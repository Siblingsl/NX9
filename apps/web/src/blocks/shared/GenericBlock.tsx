import { memo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { getBlockKindMigrationTarget, lookupBlock } from '@nx9/shared';
import { Construction, Archive, AlertTriangle } from 'lucide-react';
import { BlockShell } from './BlockShell';

/** Placeholder for blocks awaiting full implementation — preserves graph compatibility */
function GenericBlock(props: NodeProps) {
  const meta = lookupBlock(props.type ?? '');
  const migrationTarget = getBlockKindMigrationTarget(props.type ?? '');
  const { setNodes, updateNodeData } = useReactFlow();
  const migratedFrom = props.data?.migratedFrom as string | undefined;
  const kind = props.type ?? '';

  const migrateNode = (target: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === props.id
          ? {
              ...n,
              type: target,
              data: {
                ...n.data,
                migratedFrom: kind,
                note: `migrated:${kind}→${target}`,
              },
            }
          : n,
      ),
    );
  };

  // F-040: 未知 kind 显示错误卡（禁止空白壳）
  if (!meta) {
    if (import.meta.env?.DEV) {
      console.error(`[GenericBlock] 未注册节点 kind="${kind}"`);
    }
    return (
      <BlockShell {...props}>
        <div className="flex flex-col gap-2 text-sm text-ink/70" data-testid="generic-block-unknown">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle size={16} />
            <span className="font-medium">未注册节点</span>
          </div>
          <p className="text-xs leading-relaxed">
            kind="{kind}" 未在模块注册表中找到。
            {migrationTarget
              ? ` 建议迁移至「${migrationTarget}」。`
              : ' 请检查模块是否正确注册，或删除此节点。'}
          </p>
          {migrationTarget && (
            <button
              type="button"
              className="mt-1 text-xs text-brand hover:underline self-start"
              onClick={() => migrateNode(migrationTarget)}
            >
              迁移到 {migrationTarget}
            </button>
          )}
        </div>
      </BlockShell>
    );
  }

  if (meta?.deprecated) {
    return (
      <BlockShell {...props}>
        <div className="flex flex-col gap-2 text-sm text-ink/70" data-testid="generic-block-deprecated">
          <div className="flex items-center gap-2 text-amber-700">
            <Archive size={16} />
            <span className="font-medium">模块已废弃</span>
          </div>
          <p className="text-xs leading-relaxed">
            {migratedFrom
              ? `加载时已迁移为「${kind}」。原 kind：${migratedFrom}`
              : migrationTarget
                ? `请迁移至「${migrationTarget}」后重新保存工作区。`
                : meta.hint}
          </p>
          {migrationTarget && !migratedFrom && (
            <button
              type="button"
              className="mt-1 text-xs text-brand hover:underline self-start"
              onClick={() => migrateNode(migrationTarget)}
            >
              迁移到 {migrationTarget}
            </button>
          )}
        </div>
      </BlockShell>
    );
  }

  return (
    <BlockShell {...props}>
      <div className="flex flex-col gap-2 text-sm text-ink/70" data-testid="generic-block-stub">
        <div className="flex items-center gap-2 text-accent">
          <Construction size={16} />
          <span className="font-medium">模块已注册</span>
        </div>
        <p className="text-xs leading-relaxed">{meta?.hint ?? '功能模块加载中'}</p>
        <button
          type="button"
          className="mt-1 text-xs text-brand hover:underline self-start"
          onClick={() =>
            updateNodeData(props.id, { status: 'ready', note: 'awaiting implementation' })
          }
        >
          标记就绪
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(GenericBlock);
