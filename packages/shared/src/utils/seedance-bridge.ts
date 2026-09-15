/**
 * seedance-bridge.ts — Bridge / Seedance 连续闭环（F-049 / F-035）。
 *
 * 词表诚实约定：
 * - `videoMode` 仅 `single` | `bridge`（执行层分支）
 * - Seedance / S-Class 是 **model**（`seedance`），不是独立 videoMode
 * - 多集拆镜队列走 `episode-breakdown-queue`（F-016），不是 clip-gen 模式
 */
export type ClipGenMode = 'single' | 'bridge';

export const SEEDANCE_MODEL_ID = 'seedance';

export interface ClipGenModeConfig {
  mode: ClipGenMode;
  label: string;
  description: string;
  /** 是否需要上游镜头/视频 */
  needsUpstreamShots: boolean;
}

export const CLIP_GEN_MODE_CONFIGS: ClipGenModeConfig[] = [
  { mode: 'single', label: '单镜', description: '单镜头视频生成', needsUpstreamShots: false },
  {
    mode: 'bridge',
    label: 'Bridge 续拍',
    description: '上游视频尾帧 + 本镜 Prompt 连续拍摄（需源视频）',
    needsUpstreamShots: true,
  },
];

export function lookupClipGenMode(mode: string): ClipGenModeConfig | undefined {
  return CLIP_GEN_MODE_CONFIGS.find((c) => c.mode === mode);
}

export function isClipGenModeAvailable(
  mode: string,
  hasUpstreamShots: boolean,
): { available: boolean; reason?: string } {
  // 历史误用：videoMode=seedance → 视为 single（Seedance 走 model）
  const normalized = mode === 'seedance' ? 'single' : mode;
  const config = lookupClipGenMode(normalized);
  if (!config) return { available: false, reason: `未知模式: ${mode}` };
  if (config.needsUpstreamShots && !hasUpstreamShots) {
    return { available: false, reason: `${config.label} 需要连接上游镜头源` };
  }
  return { available: true };
}

export function isSeedanceModel(model: unknown): boolean {
  return String(model ?? '').trim().toLowerCase() === SEEDANCE_MODEL_ID;
}

/**
 * F-035：把历史 `videoMode: 'seedance'` 归一为执行层真实词表。
 * Seedance 能力挂在 model 上，避免空开关。
 */
export function normalizeClipGenVideoModeData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (data.videoMode !== 'seedance') return data;
  return {
    ...data,
    videoMode: 'single',
    model: data.model || SEEDANCE_MODEL_ID,
    videoGenMode: data.videoGenMode || 'omni-ref',
  };
}
