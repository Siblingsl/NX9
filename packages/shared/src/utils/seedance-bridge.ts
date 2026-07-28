/**
 * seedance-bridge.ts — Bridge / episode-queue / Seedance 连续闭环（F-049）。
 *
 * 定义三条可演示路径：Bridge 连续镜头、episode-queue 多集、Seedance 模式。
 */
export type ClipGenMode = 'single' | 'bridge' | 'episode-queue' | 'seedance';

export interface ClipGenModeConfig {
  mode: ClipGenMode;
  label: string;
  description: string;
  /** 是否需要上游镜头 */
  needsUpstreamShots: boolean;
  /** 是否需要特殊 provider */
  provider?: string;
}

export const CLIP_GEN_MODE_CONFIGS: ClipGenModeConfig[] = [
  { mode: 'single', label: '单镜', description: '单镜头视频生成', needsUpstreamShots: false },
  { mode: 'bridge', label: 'Bridge 续拍', description: '上游视频尾帧 + 本镜 Prompt 连续拍摄', needsUpstreamShots: true },
  { mode: 'episode-queue', label: '本集批出', description: '批量生成当前集所有缺视频的镜头', needsUpstreamShots: true },
  { mode: 'seedance', label: 'Seedance', description: 'Seedance 模式：参考图 + 参考视频 + 长片', needsUpstreamShots: false, provider: 'seedance' },
];

export function lookupClipGenMode(mode: string): ClipGenModeConfig | undefined {
  return CLIP_GEN_MODE_CONFIGS.find((c) => c.mode === mode);
}

export function isClipGenModeAvailable(mode: string, hasUpstreamShots: boolean): { available: boolean; reason?: string } {
  const config = lookupClipGenMode(mode);
  if (!config) return { available: false, reason: `未知模式: ${mode}` };
  if (config.needsUpstreamShots && !hasUpstreamShots) {
    return { available: false, reason: `${config.label} 需要连接上游镜头源` };
  }
  return { available: true };
}
