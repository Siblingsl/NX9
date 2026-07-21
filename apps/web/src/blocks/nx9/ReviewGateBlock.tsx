import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { activeEpisodeShots } from '@nx9/shared';
import { CheckCircle2, ClipboardCheck, ShieldAlert } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { NodeSummaryBody } from '../shared/NodeSummaryBody';
import { api } from '../../api/client';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { useRemotionUi } from '../../stores/flow-runtime';
import { useDeckUi } from '../../engine/stage-deck/stores/deck-ui';
import { openReviewGateSession } from '../../engine/stage-deck/utils/review-gate-session';

function ReviewGateBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const shots = useMemo(() => activeEpisodeShots(storyboard), [storyboard]);
  const gateMode = (props.data?.gateMode as string | undefined) ?? 'keyframe';
  const isVideo = gateMode === 'video';
  const gateLabel = isVideo ? '成片审阅' : '关键帧审阅';
  const gatePassed = (props.data?.gatePassed as boolean) ?? false;
  const pending = (props.data?.pendingShots as number[] | undefined) ?? [];
  const status = (props.data?.status as string | undefined) ?? 'idle';
  const upstream = props.data?.upstream as Record<string, unknown> | undefined;

  const setStudioOpen = useRemotionUi((s) => s.setOpen);
  const focusPromptBar = useDeckUi((s) => s.focusPromptBar);

  const stats = useMemo(() => {
    let missing = 0;
    let pendingCount = 0;
    let approved = 0;
    for (const shot of shots) {
      if (isVideo) {
        if (!shot.videoAssetId) missing += 1;
        else if (shot.videoStatus === 'approved') approved += 1;
        else pendingCount += 1;
      } else if (!shot.firstFrameAssetId) {
        missing += 1;
      } else if (shot.keyframeStatus === 'approved') {
        approved += 1;
      } else {
        pendingCount += 1;
      }
    }
    return { total: shots.length, missing, pending: pendingCount, approved };
  }, [isVideo, shots]);

  const previewThumbs = useMemo(() => {
    return shots
      .map((shot) => ({
        id: shot.id,
        index: shot.index,
        url: isVideo
          ? shot.videoAssetId || shot.firstFrameAssetId || null
          : shot.firstFrameAssetId || null,
        ok: isVideo
          ? shot.videoStatus === 'approved'
          : shot.keyframeStatus === 'approved',
      }))
      .slice(0, 6);
  }, [isVideo, shots]);

  const runCheck = useCallback(async () => {
    if (shots.length === 0) {
      appendLog(`${gateLabel}：故事板无镜头`);
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const checkGateMode = isVideo ? 'video' : 'keyframe';
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
        openReviewGateSession({
          pendingIndices: pendingShots,
          stage: checkGateMode,
          source: 'review-gate',
        });
        focusPromptBar();
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
  }, [
    shots,
    upstream,
    props.id,
    updateNodeData,
    appendLog,
    gateMode,
    gateLabel,
    isVideo,
    focusPromptBar,
  ]);

  const goReview = useCallback(() => {
    openReviewGateSession({
      pendingIndices: pending.length > 0 ? pending : undefined,
      stage: isVideo ? 'video' : 'keyframe',
      source: 'review-gate',
    });
    focusPromptBar();
    appendLog('已打开宫格批审');
  }, [pending, appendLog, isVideo, focusPromptBar]);

  const summary = gatePassed
    ? `${gateLabel}已通过 · ${stats.approved}/${stats.total}`
    : stats.missing > 0
      ? `缺图 ${stats.missing} · 待审 ${stats.pending} · 共 ${stats.total}`
      : stats.pending > 0 || status === 'blocked'
        ? `待审 ${stats.pending || pending.length} · 共 ${stats.total}`
        : shots.length === 0
          ? '故事板无镜头'
          : `共 ${stats.total} 镜 · 批审通过后放行下游`;

  const statusLabel = gatePassed
    ? '已通过'
    : status === 'running'
      ? '检查中'
      : status === 'blocked' || stats.pending > 0
        ? '阻塞'
        : status === 'error'
          ? '失败'
          : '待批审';

  return (
    <BlockShell {...props}>
      <NodeSummaryBody
        emptyLabel={gateLabel}
        media={
          previewThumbs.length > 0 ? (
            <div className="rg-card-grid">
              {previewThumbs.map((t) => (
                <div key={t.id} className={`rg-card-grid__cell ${t.ok ? 'is-ok' : t.url ? '' : 'is-empty'}`}>
                  {t.url ? (
                    isVideo && t.url === (shots.find((s) => s.id === t.id)?.videoAssetId ?? null) ? (
                      <video src={t.url} muted playsInline preload="metadata" />
                    ) : (
                      <img src={t.url} alt="" draggable={false} />
                    )
                  ) : (
                    <span>#{t.index + 1}</span>
                  )}
                </div>
              ))}
              {shots.length > 6 && (
                <div className="rg-card-grid__cell is-more">+{shots.length - 6}</div>
              )}
            </div>
          ) : undefined
        }
        stats={[
          { value: stats.total, label: '镜头' },
          {
            value: stats.pending || pending.length,
            label: '待审',
            tone: stats.pending || pending.length ? 'warn' : 'default',
          },
          {
            value: stats.missing,
            label: isVideo ? '缺片' : '缺图',
            tone: stats.missing ? 'warn' : 'default',
          },
        ]}
        summary={summary}
        summaryClickable
        onSummaryClick={(e) => {
          e.stopPropagation();
          goReview();
        }}
        statusLabel={statusLabel}
        secondary={[
          {
            label: '检查',
            onClick: (e) => {
              e.stopPropagation();
              void runCheck();
            },
          },
        ]}
        primary={
          gatePassed
            ? {
                label: '成片',
                icon: <CheckCircle2 size={12} />,
                onClick: (e) => {
                  e.stopPropagation();
                  setStudioOpen(true);
                },
              }
            : {
                label: '去批审',
                icon:
                  status === 'blocked' || stats.pending > 0 ? (
                    <ShieldAlert size={12} />
                  ) : (
                    <ClipboardCheck size={12} />
                  ),
                onClick: (e) => {
                  e.stopPropagation();
                  goReview();
                },
              }
        }
      />
    </BlockShell>
  );
}

export default memo(ReviewGateBlock);
