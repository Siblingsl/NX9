import { memo, useMemo, type ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';
import { isDeprecatedBlockKind, shouldUseCompactNodeShell } from '@nx9/shared';
import { blockTypes } from '../../../blocks/registry';
import { CardShell } from './CardShell';
import { SceneGroupNode } from './SceneGroup';
import { CanvasNodeShell } from '../../../blocks/shared/CanvasNodeShell';
import { useViewMode } from '../stores/view-mode';
import { shouldCollapseCards } from '../modes/produce-mode';
import { useAliasStore } from '../stores/alias-store';
import { isSurfaceEnabled } from '../../../config/product-surface';

export function createStageDeckNodeTypes(): Record<string, ComponentType<NodeProps>> {
  const canvasFirst = isSurfaceEnabled('canvasFirst');

  const wrapped = Object.fromEntries(
    Object.entries(blockTypes).map(([kind, Block]) => [
      kind,
      memo(function StageDeckBlock(props: NodeProps) {
        const mode = useViewMode((s) => s.mode);
        const alias = useAliasStore((s) => s.aliases[props.id]);
        const expanded = (props.data as { expanded?: boolean })?.expanded;
        const dimmed = Boolean((props.data as { dimmed?: boolean })?.dimmed);

        let inner: React.ReactNode;
        if (isDeprecatedBlockKind(kind)) {
          inner = (
            <CardShell {...props} alias={alias} hideSockets>
              {null}
            </CardShell>
          );
        } else if (canvasFirst && shouldUseCompactNodeShell(kind)) {
          /* 紧凑舞台卡 + 节点下方底部跟随工作区（非弹窗） */
          inner = <CanvasNodeShell {...props} alias={alias} />;
        } else if (canvasFirst && shouldCollapseCards(mode, expanded)) {
          inner = (
            <CardShell {...props} alias={alias} hideSockets>
              {null}
            </CardShell>
          );
        } else if (canvasFirst) {
          /* 全屏画布：其余节点也走舞台卡壳，避免编辑器白卡 */
          inner = <Block {...props} />;
        } else if (shouldCollapseCards(mode, expanded)) {
          inner = (
            <CardShell {...props} alias={alias} hideSockets>
              {null}
            </CardShell>
          );
        } else {
          inner = <Block {...props} />;
        }

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
