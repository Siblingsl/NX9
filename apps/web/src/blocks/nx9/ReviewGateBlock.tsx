import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Film, ShieldAlert } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { useRemotionUi } from '../../stores/flow-runtime';
import { openReviewGateSession } from '../../engine/stage-deck/utils/review-gate-session';

function ReviewGateBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const gateMode = (props.data?.gateMode as string | undefined) ?? 'keyframe';
  const gateLabel = gateMode === 'video' ? '成片审阅' : '关键帧审阅';
  const gatePassed = (props.data?.gatePassed as boolean) ?? false;
  const pending = (props.data?.pendingShots as number[] | undefined) ?? [];
  const status = (props.data?.status as string | undefined) ?? 'idle';
  const upstream = props.data?.upstream as Record<string, unknown> | undefined;

  const setStudioOpen = useRemotionUi((s) => s.setOpen);

  const runCheck = useCallback(async () => {
    if (shots.length === 0) {
      appendLog(`${gateLabel}：故事板无镜头`);
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const checkGateMode = gateMode === 'video' ? 'video' : 'keyframe';
      const res = await api.checkReviewGate(shots, checkGateMode);
      if (!res.ok) {
        const pendingShots = res.pending ?? [];
        updateNodeData(props.id, {
          status: 'blocked',
          gatePassed: false,
          pendingShots,
          meta: { pending: pendingShots, gateMode },
        });
        appendLog(`${gateLabel}阻塞 · 待审 ${pendingShots.join(', ')}`);
        openReviewGateSession(pendingShots);
        return;
      }
      updateNodeData(props.id, {
        status: 'success',
        gatePassed: true,
        pendingShots: [],
        meta: { gatePassed: true, gateMode },
        upstream,
      });
      appendLog(`${gateLabel}通过`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [shots, upstream, props.id, updateNodeData, appendLog, gateMode, gateLabel]);

  const goReview = useCallback(() => {
    openReviewGateSession(pending.length > 0 ? pending : undefined);
    appendLog('已打开故事板网格批审');
  }, [pending, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-[10px] text-ink/50">故事板 {shots.length} 镜头 · 需全部 approved</p>
        {gatePassed ? (
          <>
            <p className="text-[10px] text-brand font-medium">✓ 已通过审阅</p>
            <button
              type="button"
              onClick={() => setStudioOpen(true)}
              className="w-full flex items-center justify-center gap-1 rounded-xl border border-brand/30 bg-brand/5 text-brand py-2 text-[10px] hover:bg-brand/10"
            >
              <Film size={12} />
              打开成片工作室
            </button>
          </>
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
