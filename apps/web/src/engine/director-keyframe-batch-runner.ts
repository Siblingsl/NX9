import type {
  ChainStoryboardPayload,
  DirectorKeyframeBatch,
  DirectorKeyframeBatchReceipt,
  DirectorKeyframeBatchShot,
  StoryboardShot,
} from '@nx9/shared';

export interface DirectorKeyframeBatchValidationIssue {
  shotId: string;
  index: number;
  reason: string;
}

export interface DirectorKeyframeBatchValidation {
  valid: boolean;
  issues: DirectorKeyframeBatchValidationIssue[];
  shotsById: Map<string, StoryboardShot>;
}

export function validateDirectorKeyframeBatch(
  batch: DirectorKeyframeBatch,
  chain: ChainStoryboardPayload,
): DirectorKeyframeBatchValidation {
  const shotsById = new Map(
    chain.shots
      .filter((shot) => shot.episodeId === batch.episodeId)
      .map((shot) => [shot.id, shot]),
  );
  const issues: DirectorKeyframeBatchValidationIssue[] = [];
  for (const item of batch.shots) {
    const current = shotsById.get(item.shotId);
    if (!current) {
      issues.push({ shotId: item.shotId, index: item.index, reason: '镜头已从当前 chain 移除' });
      continue;
    }
    if (batch.bypassKeyframeGate) continue;
    if (current.keyframeStatus !== 'approved' && current.status !== 'approved') {
      issues.push({ shotId: item.shotId, index: item.index, reason: '关键帧当前未批准' });
      continue;
    }
    if (current.firstFrameAssetId !== item.imageUrl) {
      issues.push({ shotId: item.shotId, index: item.index, reason: '关键帧 URL 已变化' });
      continue;
    }
    const currentRevision = Math.max(1, current.keyframeRevision ?? 1);
    if (currentRevision !== item.keyframeRevision) {
      issues.push({ shotId: item.shotId, index: item.index, reason: '关键帧 revision 已变化' });
    }
  }
  return { valid: issues.length === 0, issues, shotsById };
}

export interface ConsumeDirectorKeyframeBatchOptions {
  batch: DirectorKeyframeBatch;
  chain: ChainStoryboardPayload;
  generateVideo: (
    item: DirectorKeyframeBatchShot,
    currentShot: StoryboardShot,
  ) => Promise<{ videoUrl: string; shotPatch?: Partial<StoryboardShot> }>;
  now?: () => string;
}

export interface ConsumeDirectorKeyframeBatchResult {
  chain: ChainStoryboardPayload;
  batch: DirectorKeyframeBatch;
  receipt: DirectorKeyframeBatchReceipt;
}

/**
 * 逐镜消费结构化导演关键帧批次。
 * 已成功镜头在重跑时保持幂等，只重试未成功项；chain 最终一次性回写。
 */
export async function consumeDirectorKeyframeBatch(
  options: ConsumeDirectorKeyframeBatchOptions,
): Promise<ConsumeDirectorKeyframeBatchResult> {
  if (
    options.batch.status === 'consumed'
    && options.batch.receipt
    && options.batch.receipt.succeededShotIds.length === options.batch.shots.length
  ) {
    return {
      chain: options.chain,
      batch: options.batch,
      receipt: options.batch.receipt,
    };
  }
  const validation = validateDirectorKeyframeBatch(options.batch, options.chain);
  if (!validation.valid) {
    const error = new Error(validation.issues.map((issue) => `#${issue.index} ${issue.reason}`).join('；'));
    error.name = 'DirectorKeyframeBatchStaleError';
    throw Object.assign(error, { issues: validation.issues });
  }

  const previousReceipt = options.batch.receipt;
  const succeeded = new Set(previousReceipt?.succeededShotIds ?? []);
  const videoUrlsByShotId = { ...(previousReceipt?.videoUrlsByShotId ?? {}) };
  const failures: DirectorKeyframeBatchReceipt['failed'] = [];
  const patches = new Map<string, Partial<StoryboardShot>>();

  for (const item of options.batch.shots) {
    if (succeeded.has(item.shotId)) continue;
    const currentShot = validation.shotsById.get(item.shotId)!;
    try {
      const generated = await options.generateVideo(item, currentShot);
      if (!generated.videoUrl) throw new Error('视频生成未返回 URL');
      succeeded.add(item.shotId);
      videoUrlsByShotId[item.shotId] = generated.videoUrl;
      patches.set(item.shotId, {
        videoAssetId: generated.videoUrl,
        videoStatus: 'review',
        status: 'review',
        ...(generated.shotPatch ?? {}),
      });
    } catch (error) {
      failures.push({
        shotId: item.shotId,
        index: item.index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const total = options.batch.shots.length;
  const status = succeeded.size === total
    ? 'consumed'
    : succeeded.size > 0
      ? 'partial'
      : 'failed';
  const receipt: DirectorKeyframeBatchReceipt = {
    batchId: options.batch.batchId,
    status,
    consumedAt: options.now?.() ?? new Date().toISOString(),
    succeededShotIds: options.batch.shots
      .map((item) => item.shotId)
      .filter((shotId) => succeeded.has(shotId)),
    failed: failures,
    videoUrlsByShotId,
  };
  const chain: ChainStoryboardPayload = {
    ...options.chain,
    shots: options.chain.shots.map((shot) => {
      const patch = patches.get(shot.id);
      return patch ? { ...shot, ...patch } : shot;
    }),
  };
  return {
    chain,
    receipt,
    batch: {
      ...options.batch,
      status,
      receipt,
    },
  };
}

export function describeDirectorKeyframeBatchStatus(batch?: DirectorKeyframeBatch | null): string | null {
  if (!batch || batch.version !== 1) return null;
  const shotCount = batch.shots.length;
  const succeeded = batch.receipt?.succeededShotIds.length ?? 0;
  const failed = batch.receipt?.failed.length ?? 0;
  switch (batch.status) {
    case 'ready':
      return `已写入 clip-gen · ${shotCount} 镜 · 待消费`;
    case 'consuming':
      return `视频生成中 · ${shotCount} 镜`;
    case 'consumed':
      return `已消费 · ${succeeded}/${shotCount} 镜`;
    case 'partial':
      return `部分消费 · 成功 ${succeeded} · 失败 ${failed}`;
    case 'failed':
      return failed > 0 ? `消费失败 · ${failed} 镜` : '消费失败';
    case 'stale':
      return '批次已过期，请重新推送关键帧';
    default:
      return `导演关键帧批次 · ${shotCount} 镜 · ${batch.status}`;
  }
}
