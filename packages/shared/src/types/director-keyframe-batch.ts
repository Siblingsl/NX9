export type DirectorKeyframeBatchStatus =
  | 'ready'
  | 'consuming'
  | 'consumed'
  | 'partial'
  | 'failed'
  | 'stale';

export interface DirectorKeyframeBatchShot {
  shotId: string;
  index: number;
  imageUrl: string;
  prompt: string;
  durationSec: number;
  keyframeRevision: number;
}

export interface DirectorKeyframeBatchFailure {
  shotId: string;
  index: number;
  error: string;
}

export interface DirectorKeyframeBatchReceipt {
  batchId: string;
  status: Exclude<DirectorKeyframeBatchStatus, 'ready' | 'consuming'>;
  consumedAt: string;
  succeededShotIds: string[];
  failed: DirectorKeyframeBatchFailure[];
  videoUrlsByShotId: Record<string, string>;
}

/**
 * 导演台交付给视频生成的不可猜测批次。
 * clip-gen 必须按 shotId + URL + revision 向 source chain 重新核验。
 */
export interface DirectorKeyframeBatch {
  version: 1;
  batchId: string;
  sourceDirectorDeskId: string;
  sourceChainDeskId: string;
  episodeId: string;
  createdAt: string;
  bypassKeyframeGate: boolean;
  status: DirectorKeyframeBatchStatus;
  shots: DirectorKeyframeBatchShot[];
  receipt?: DirectorKeyframeBatchReceipt;
}
