import { useCallback } from 'react';
import { WorkspaceHeader } from '../WorkspaceHeader';
import { useDeckUi } from '../../../stores/deck-ui';
import { useReactFlow } from '@xyflow/react';

export interface ReportWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function ReportWorkspace({ blockId, kind, onCollapse }: ReportWorkspaceProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const { getNode } = useReactFlow();
  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const summary = data.summary as string | undefined;
  const issues = data.issues as Array<{ message: string }> | undefined;
  const status = (data.status as string) ?? 'idle';

  return (
    <div
      className="flex flex-col px-3 py-2.5 max-h-[min(320px,40vh)]"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <WorkspaceHeader kind={kind} status={status as any} onCollapse={handleCollapse} />

      <div className="flex-1 min-h-0 overflow-y-auto nowheel overscroll-contain space-y-2 text-xs">
        {summary && (
          <div className="rounded-lg bg-ink/5 p-2">
            <p className="font-medium text-ink/80 mb-1">结论摘要</p>
            <p className="text-ink/60">{summary}</p>
          </div>
        )}
        {issues && issues.length > 0 && (
          <div className="space-y-1">
            <p className="font-medium text-ink/80 text-xs">问题列表（{issues.length}）</p>
            {issues.map((issue, i) => (
              <div key={i} className="rounded-lg bg-warn/5 border border-warn/20 p-2 text-warn/80">
                {issue.message}
              </div>
            ))}
          </div>
        )}
        {!summary && !issues && (
          <p className="text-ink/40">暂无报告数据。运行节点后查看分析结果。</p>
        )}
      </div>
    </div>
  );
}
