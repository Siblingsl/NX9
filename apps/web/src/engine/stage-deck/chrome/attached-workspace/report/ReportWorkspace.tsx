import { useCallback } from 'react';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useDeckUi } from '../../../stores/deck-ui';
import { useAttachedNodeData } from '../generation/use-attached-node-data';

export interface ReportWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function ReportWorkspace({ blockId, kind, onCollapse }: ReportWorkspaceProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const data = useAttachedNodeData(blockId);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const summary = data.summary as string | undefined;
  const issues = data.issues as Array<{ message: string }> | undefined;
  const status = (data.status as string) ?? 'idle';

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      showRun={false}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      showToolbar={false}
      heightClass="h-[280px] max-h-[320px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2.5 overflow-y-auto nowheel overscroll-contain text-xs"
    >
      {summary && (
        <div className="rounded-lg bg-ink/5 p-2">
          <p className="font-medium text-ink/80 mb-1">结论摘要</p>
          <p className="text-ink/60">{summary}</p>
        </div>
      )}
      {issues && issues.length > 0 && (
        <div className="space-y-1 mt-2">
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
    </ComposerWorkspaceShell>
  );
}
