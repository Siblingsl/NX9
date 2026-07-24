import type { MediaPinPayload } from '@nx9/shared';

/** 从图像生成工作区拖出钉图时的 MIME（不进能力区） */
export const MEDIA_PIN_MIME = 'application/nx9-media-pin';

export function setMediaPinDragData(
  dataTransfer: DataTransfer,
  payload: MediaPinPayload,
  dragImageEl?: HTMLElement | null,
): void {
  dataTransfer.setData(MEDIA_PIN_MIME, JSON.stringify(payload));
  dataTransfer.effectAllowed = 'copy';
  if (dragImageEl) {
    try {
      dataTransfer.setDragImage(dragImageEl, 28, 28);
    } catch {
      /* ignore */
    }
  }
}
