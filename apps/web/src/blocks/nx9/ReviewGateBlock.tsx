import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { ShieldAlert } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { openReviewGateSession } from '../../engine/stage-deck/utils/review-gate-session';

function ReviewGateBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const gatePassed = (props.data?.gatePassed as boolean) ?? false;
  const pending = (props.data?.pendingShots as number[] | undefined) ?? [];
  const status = (props.data?.status as string | undefined) ?? 'idle';
  const upstream = props.data?.upstream as Record<string, unknown> | undefined;

  const runCheck = useCallback(async () => {
    if (shots.length === 0) {
      appendLog('审阅关卡：故事板无镜头');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.checkReviewGate(shots);
      if (!res.ok) {
        updateNodeData(props.id, {
          status: 'blocked',
          gatePassed: false,
          pendingShots: res.pending,
          meta: { pending: res.pending },
        });
        appendLog(`审阅关卡阻塞 · 待审镜头 ${res.pending.join(', ')}`);
        openReviewGateSession(res.pending);
        return;
      }
      updateNodeData(props.id, {
        status: 'success',
        gatePassed: true,
        pendingShots: [],
        meta: { gatePassed: true },
        upstream,
      });
      appendLog('审阅关卡通过');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [shots, upstream, props.id, updateNodeData, appendLog]);

  const goReview = useCallback(() => {
    openReviewGateSession(pending.length > 0 ? pending : undefined);
    appendLog('已打开故事板网格批审');
  }, [pending, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-[10px] text-ink/50">故事板 {shots.length} 镜头 · 需全部 approved</p>
        {gatePassed ? (
          <p className="text-[10px] text-brand font-medium">✓ 已通过审阅</p>
        ) : pending.length > 0 || status === 'blocked' ? (
          <p className="text-[10px] text-warn flex items-center gap-1">
            <ShieldAlert size={12} />
            待审: #{pending.join(', #')}
          </p>
        ) : (
          <p className="text-[10px] text-ink/40">批量/Cascade 运行到此会暂停并引导批审</p>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={goReview}
            className="flex-1 rounded-xl border border-brand/30 bg-brand/5 text-brand py-2 text-[10px] hover:bg-brand/10"
          >
            去批审
          </button>
          <button
            type="button"
            onClick={() => void runCheck()}
            className="flex-1 rounded-xl bg-brand text-white py-2 text-[10px]"
          >
            重新检查
          </button>
        </div>
      </div>
    </BlockShell>
  );
}

export default memo(ReviewGateBlock);
