import { memo, useMemo, type ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';
import { blockTypes } from '../../../blocks/registry';
import { CardShell } from './CardShell';
import { SceneGroupNode } from './SceneGroup';
import { useViewMode } from '../stores/view-mode';
import { shouldCollapseCards } from '../modes/produce-mode';
import { useAliasStore } from '../stores/alias-store';

export function createStageDeckNodeTypes(): Record<string, ComponentType<NodeProps>> {
  const wrapped = Object.fromEntries(
    Object.entries(blockTypes).map(([kind, Block]) => [
      kind,
      memo(function StageDeckBlock(props: NodeProps) {
        const mode = useViewMode((s) => s.mode);
        const alias = useAliasStore((s) => s.aliases[props.id]);
        const expanded = (props.data as { expanded?: boolean })?.expanded;
        const collapsed = shouldCollapseCards(mode, expanded);
        const dimmed = Boolean((props.data as { dimmed?: boolean })?.dimmed);
        const inner = collapsed ? (
          <CardShell {...props} alias={alias} hideSockets>
            {null}
          </CardShell>
        ) : (
          <Block {...props} />
        );
        return (
          <div style={{ opacity: dimmed ? 0.35 : 1 }} className="transition-opacity">
            {inner}
          </div>
        );
      }),
    ]),
  );

  return {
    ...wrapped,
    'scene-group': SceneGroupNode,
  };
}

export function useStageDeckNodeTypes() {
  return useMemo(() => createStageDeckNodeTypes(), []);
}
