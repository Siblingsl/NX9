/**
 * beat-detection：合成节拍信号验证能量 onset 检测。
 */
import { describe, expect, it } from 'vitest';
import { detectBeats } from '../src/modules/montage/beat-detection';

/** 合成 120 BPM（每 0.5s 一个正弦脉冲）的单声道信号 */
function makeBeatSignal(beats: number[], sampleRate = 8000, seconds = 10): Float32Array {
  const samples = new Float32Array(Math.floor(sampleRate * seconds));
  for (const beatSec of beats) {
    const start = Math.floor(beatSec * sampleRate);
    const len = Math.floor(0.08 * sampleRate); // 80ms 脉冲
    for (let i = 0; i < len && start + i < samples.length; i++) {
      samples[start + i] += Math.sin((i / len) * Math.PI * 4) * 0.8;
    }
  }
  return samples;
}

describe('beat-detection 能量 onset', () => {
  it('120 BPM 规则脉冲：节拍点间隔 ≈ 0.5s，tempo ≈ 120', () => {
    const beats = Array.from({ length: 18 }, (_, i) => 0.5 + i * 0.5);
    const samples = makeBeatSignal(beats);
    const result = detectBeats(samples, 8000);
    expect(result.beats.length).toBeGreaterThanOrEqual(12);
    const intervals: number[] = [];
    for (let i = 1; i < result.beats.length; i++) {
      intervals.push(result.beats[i] - result.beats[i - 1]);
    }
    const median = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
    expect(median).toBeGreaterThan(0.4);
    expect(median).toBeLessThan(0.6);
    if (result.tempo) {
      expect(result.tempo).toBeGreaterThan(100);
      expect(result.tempo).toBeLessThan(140);
    }
  });

  it('缓慢 60 BPM（1s 间隔）可检测', () => {
    const beats = Array.from({ length: 9 }, (_, i) => 1 + i * 1);
    const samples = makeBeatSignal(beats);
    const result = detectBeats(samples, 8000);
    expect(result.beats.length).toBeGreaterThanOrEqual(5);
    if (result.tempo) {
      expect(result.tempo).toBeGreaterThan(50);
      expect(result.tempo).toBeLessThan(75);
    }
  });

  it('能量平稳（无节拍）返回空并说明原因', () => {
    const samples = new Float32Array(8000 * 3).fill(0.1);
    const result = detectBeats(samples, 8000);
    expect(result.beats).toHaveLength(0);
    expect(result.message).toBeTruthy();
  });

  it('空样本 / 过短音频安全返回并禁止空成功', () => {
    const empty = detectBeats(new Float32Array(0), 8000);
    expect(empty.beats).toHaveLength(0);
    const short = detectBeats(new Float32Array(100), 8000);
    expect(short.beats).toHaveLength(0);
    expect(short.message).toContain('禁止空成功');
  });
});
