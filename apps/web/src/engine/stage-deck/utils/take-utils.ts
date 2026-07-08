import type { TakeRecord } from '@nx9/shared';

/** Extract displayable asset from block run output */
export function extractTakeAsset(data: Record<string, unknown>): {
  assetUrl?: string;
  thumbUrl?: string;
  mediaKind?: 'picture' | 'clip' | 'sound';
} {
  const previewUrls = data.previewUrls as string[] | undefined;
  const previewUrl = data.previewUrl as string | undefined;
  const videoUrl = data.videoUrl as string | undefined;
  const audioUrl = data.audioUrl as string | undefined;
  const assetUrl = data.assetUrl as string | undefined;

  if (videoUrl) return { assetUrl: videoUrl, thumbUrl: previewUrl ?? videoUrl, mediaKind: 'clip' };
  if (audioUrl) return { assetUrl: audioUrl, thumbUrl: undefined, mediaKind: 'sound' };
  const pic = previewUrls?.[0] ?? previewUrl ?? assetUrl;
  if (pic) return { assetUrl: pic, thumbUrl: pic, mediaKind: 'picture' };
  return {};
}

export function isTakeEligibleStatus(status: unknown): boolean {
  return status === 'success' || status === 'done';
}

export function applyPrimaryTakeToNodeData(
  take: TakeRecord,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    primaryTakeId: take.id,
  };
  if (take.meta?.mediaKind === 'clip' || take.assetUrl.match(/\.(mp4|webm|mov)/i)) {
    patch.videoUrl = take.assetUrl;
    patch.previewUrl = take.thumbUrl ?? take.assetUrl;
  } else if (take.meta?.mediaKind === 'sound' || take.assetUrl.match(/\.(mp3|wav|ogg)/i)) {
    patch.audioUrl = take.assetUrl;
  } else {
    patch.previewUrl = take.assetUrl;
    patch.previewUrls = [take.assetUrl];
  }
  patch.status = 'done';
  return patch;
}

export function newTakeId(): string {
  return `take-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
