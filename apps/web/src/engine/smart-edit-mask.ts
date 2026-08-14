/**
 * SE-DEEP-14: SmartReplace 蒙版与抽帧必须同像素尺寸。
 *
 * 画布笔刷坐标系：strokes 以抽帧 naturalWidth/naturalHeight 记录，
 * 显示画布只做等比缩放（UI 观感），落盘 mask 一律按 natural 尺寸生成。
 * 提交前断言二者一致，避免「圈了 A 改了 B」。
 */
export interface MaskFrameSize {
  maskWidth: number;
  maskHeight: number;
  frameWidth: number;
  frameHeight: number;
}

export function assertMaskFrameAligned(size: MaskFrameSize): void {
  if (
    size.maskWidth !== size.frameWidth ||
    size.maskHeight !== size.frameHeight
  ) {
    throw new Error(
      `蒙版尺寸 ${size.maskWidth}x${size.maskHeight} 与抽帧尺寸 ${size.frameWidth}x${size.frameHeight} 不一致，已拒绝提交`,
    );
  }
}

/** 显示画布缩放比例（UI 与 natural 的换算），与 mask 落盘尺寸无关。 */
export function displayScaleForFrame(
  naturalWidth: number,
  naturalHeight: number,
  maxW: number,
  maxH: number,
): number {
  return Math.min(maxW / Math.max(1, naturalWidth), maxH / Math.max(1, naturalHeight), 1);
}
