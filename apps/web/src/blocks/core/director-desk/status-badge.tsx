import {
  isShotKeyframeApproved,
  isShotKeyframeFailed,
} from '../../../engine/director-desk-runner';

export function statusBadge(shot: {
  firstFrameAssetId?: string | null;
  status: string;
  keyframeStatus?: string;
  director3dGuide?: { captureUrl?: string } | null;
}): { label: string; cls: string } {
  if (isShotKeyframeFailed(shot as never)) return { label: '失败', cls: 'is-warn' };
  if (isShotKeyframeApproved(shot as never) && shot.firstFrameAssetId) {
    return { label: '通过', cls: 'is-ok' };
  }
  if (shot.firstFrameAssetId && (shot.keyframeStatus === 'review' || shot.status === 'review')) {
    return { label: '待审', cls: 'is-run' };
  }
  if (shot.status === 'generating') return { label: '生成中', cls: 'is-run' };
  if (shot.firstFrameAssetId) return { label: '已出', cls: 'is-ok' };
  if (shot.director3dGuide?.captureUrl) return { label: '有3D', cls: 'is-miss' };
  return { label: '未出', cls: 'is-miss' };
}
