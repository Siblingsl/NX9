/**
 * 音频节拍检测（能量 onset 法）：
 * 对单声道 PCM（f32le）分窗计算 RMS 能量 → 平滑 → 自适应阈值 +
 * 局部峰值 → 节拍点（秒），并估计 BPM（相邻节拍间隔中位数）。
 * 纯函数实现，便于单元测试（合成节拍信号验证）。
 */

export interface BeatDetectResult {
  /** 节拍点（秒，升序） */
  beats: number[];
  /** 估计 BPM；样本不足以估计时缺省 */
  tempo?: number;
  message?: string;
}

const MIN_INTERVAL_SEC = 0.25; // 240 BPM 上限
const MAX_INTERVAL_SEC = 1.5; // 40 BPM 下限

export function detectBeats(
  samples: Float32Array,
  sampleRate: number,
  opts?: { windowSec?: number; hopSec?: number; thresholdK?: number },
): BeatDetectResult {
  if (samples.length === 0) {
    return { beats: [], message: '无音频样本' };
  }
  const windowSec = opts?.windowSec ?? 0.05;
  const hopSec = opts?.hopSec ?? 0.025;
  const thresholdK = opts?.thresholdK ?? 1.6;
  const win = Math.max(1, Math.round(windowSec * sampleRate));
  const hop = Math.max(1, Math.round(hopSec * sampleRate));

  // 每窗 RMS 能量
  const energies: number[] = [];
  const times: number[] = [];
  for (let i = 0; i + win <= samples.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < win; j++) {
      const v = samples[i + j];
      sum += v * v;
    }
    energies.push(Math.sqrt(sum / win));
    times.push(i / sampleRate);
  }
  if (energies.length < 8) {
    return { beats: [], message: '音频过短，无法检测节拍，禁止空成功' };
  }

  // 平滑（窗口 3 均值）
  const smooth = energies.map((_, i) => {
    const a = energies[Math.max(0, i - 1)];
    const b = energies[i];
    const c = energies[Math.min(energies.length - 1, i + 1)];
    return (a + b + c) / 3;
  });

  // 自适应阈值：均值 + k×标准差；取能量有明显起伏的段落
  const mean = smooth.reduce((s, v) => s + v, 0) / smooth.length;
  const variance =
    smooth.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, smooth.length - 1);
  const std = Math.sqrt(variance);
  const threshold = mean + thresholdK * std;
  if (std < 1e-6) {
    return { beats: [], message: '音频能量平稳（无明显节拍起伏）' };
  }

  // onset：能量局部峰值且超过阈值
  const rawBeats: number[] = [];
  for (let i = 1; i < smooth.length - 1; i++) {
    if (smooth[i] > threshold && smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1]) {
      rawBeats.push(times[i]);
    }
  }

  // 合并过近的 onset（200ms 内取能量最高者）
  const beats: number[] = [];
  for (const t of rawBeats) {
    const last = beats[beats.length - 1];
    if (last == null || t - last >= 0.2) {
      beats.push(Math.round(t * 100) / 100);
    }
  }

  // BPM：相邻间隔中位数
  let tempo: number | undefined;
  if (beats.length >= 3) {
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      const d = beats[i] - beats[i - 1];
      if (d >= MIN_INTERVAL_SEC && d <= MAX_INTERVAL_SEC) intervals.push(d);
    }
    if (intervals.length >= 2) {
      const sorted = [...intervals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      tempo = Math.round(60 / median);
    }
  }

  return { beats, ...(tempo ? { tempo } : {}) };
}

/** 从 ffmpeg 输出的 f32le 字节流解码为 Float32Array */
export function decodeF32le(buffer: ArrayBuffer): Float32Array {
  return new Float32Array(buffer);
}
