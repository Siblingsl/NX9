import { describe, expect, it } from 'vitest';
import {
  AUDIO_DENOISE_AFFTdn_NR_MAX,
  AUDIO_DENOISE_AFFTdn_NR_MIN,
  AUDIO_DENOISE_ANLMDN_S_MAX,
  AUDIO_DENOISE_ANLMDN_S_MIN,
  AUDIO_DENOISE_DEFAULT_STRENGTH,
  AUDIO_DENOISE_MAX_STRENGTH,
  AUDIO_DENOISE_MIN_STRENGTH,
  buildAudioDenoiseArgs,
  buildAudioDenoiseFilter,
  buildAudioDenoiseOutputName,
  describeAudioDenoiseParams,
  normalizeAudioDenoiseParams,
  normalizeDenoiseMode,
  normalizeDenoiseStrength,
} from '../src/modules/montage/audio-denoise';

describe('normalizeDenoiseStrength', () => {
  it('接受 0 与 1 的边界', () => {
    expect(normalizeDenoiseStrength(0)).toBe(0);
    expect(normalizeDenoiseStrength(1)).toBe(1);
  });
  it('越界截断到 0-1', () => {
    expect(normalizeDenoiseStrength(-0.5)).toBe(0);
    expect(normalizeDenoiseStrength(1.5)).toBe(1);
  });
  it('非数值回落默认强度', () => {
    expect(normalizeDenoiseStrength(undefined)).toBe(AUDIO_DENOISE_DEFAULT_STRENGTH);
    expect(normalizeDenoiseStrength(null)).toBe(AUDIO_DENOISE_DEFAULT_STRENGTH);
    expect(normalizeDenoiseStrength(Number.NaN)).toBe(AUDIO_DENOISE_DEFAULT_STRENGTH);
    expect(normalizeDenoiseStrength(Number.POSITIVE_INFINITY)).toBe(AUDIO_DENOISE_DEFAULT_STRENGTH);
    expect(normalizeDenoiseStrength('垃圾')).toBe(AUDIO_DENOISE_DEFAULT_STRENGTH);
  });
  it('字符串数字被接受（UI 可能以字符串提交）', () => {
    expect(normalizeDenoiseStrength('0.7')).toBeCloseTo(0.7, 5);
    expect(normalizeDenoiseStrength(' 0.2 ')).toBeCloseTo(0.2, 5);
  });
});

describe('normalizeDenoiseMode', () => {
  it('anlmdn 保留，其余回落 afftdn', () => {
    expect(normalizeDenoiseMode('anlmdn')).toBe('anlmdn');
    expect(normalizeDenoiseMode('afftdn')).toBe('afftdn');
    expect(normalizeDenoiseMode('垃圾')).toBe('afftdn');
    expect(normalizeDenoiseMode(undefined)).toBe('afftdn');
    expect(normalizeDenoiseMode(123)).toBe('afftdn');
  });
});

describe('buildAudioDenoiseFilter', () => {
  it('afftdn：强度 0 -> nr 取下限、nf 取最浅', () => {
    const f = buildAudioDenoiseFilter('afftdn', 0);
    expect(f).toBe('afftdn=nr=' + AUDIO_DENOISE_AFFTdn_NR_MIN + ':nf=-20');
  });
  it('afftdn：强度 1 -> nr 取上限、nf 取最深', () => {
    const f = buildAudioDenoiseFilter('afftdn', 1);
    expect(f).toBe('afftdn=nr=' + AUDIO_DENOISE_AFFTdn_NR_MAX + ':nf=-80');
  });
  it('afftdn：默认强度 0.6 落在区间内', () => {
    const f = buildAudioDenoiseFilter('afftdn', AUDIO_DENOISE_DEFAULT_STRENGTH);
    const nr = Number(f.match(/nr=(\d+)/)![1]);
    expect(nr).toBeGreaterThan(AUDIO_DENOISE_AFFTdn_NR_MIN);
    expect(nr).toBeLessThan(AUDIO_DENOISE_AFFTdn_NR_MAX);
  });
  it('anlmdn：强度 0 -> s 取下限', () => {
    expect(buildAudioDenoiseFilter('anlmdn', 0)).toBe('anlmdn=s=' + AUDIO_DENOISE_ANLMDN_S_MIN);
  });
  it('anlmdn：强度 1 -> s 取上限', () => {
    expect(buildAudioDenoiseFilter('anlmdn', 1)).toBe('anlmdn=s=' + AUDIO_DENOISE_ANLMDN_S_MAX);
  });
  it('非法输入回落默认（不抛异常）', () => {
    expect(() => buildAudioDenoiseFilter(null, null)).not.toThrow();
    expect(buildAudioDenoiseFilter(undefined, undefined)).toBe(
      buildAudioDenoiseFilter('afftdn', AUDIO_DENOISE_DEFAULT_STRENGTH),
    );
  });
  it('强度单调：越高降噪参数越强', () => {
    const weak = buildAudioDenoiseFilter('afftdn', 0.2);
    const strong = buildAudioDenoiseFilter('afftdn', 0.8);
    const nrOf = (s: string) => Number(s.match(/nr=(\d+)/)![1]);
    expect(nrOf(strong)).toBeGreaterThan(nrOf(weak));
  });
});

describe('buildAudioDenoiseArgs', () => {
  it('含 -vn（丢弃可能的视频轨）与 -af 滤镜', () => {
    const args = buildAudioDenoiseArgs('/tmp/in.wav', '/tmp/out.m4a', 'afftdn', 0.5);
    expect(args[0]).toBe('-y');
    expect(args).toContain('-i');
    expect(args).toContain('/tmp/in.wav');
    expect(args).toContain('-vn');
    const afAt = args.indexOf('-af');
    expect(afAt).toBeGreaterThan(-1);
    expect(args[afAt + 1]).toMatch(/^afftdn=nr=\d+:nf=-\d+$/);
    expect(args).toContain('-c:a');
    expect(args).toContain('aac');
    expect(args[args.length - 1]).toBe('/tmp/out.m4a');
  });
  it('源路径与输出路径不互换', () => {
    const args = buildAudioDenoiseArgs('/a/src.mp3', '/b/out.m4a', 'afftdn', 0.5);
    expect(args.filter((a) => a === '/a/src.mp3').length).toBe(1);
    expect(args.filter((a) => a === '/b/out.m4a').length).toBe(1);
    expect(args.indexOf('/a/src.mp3')).toBeLessThan(args.indexOf('/b/out.m4a'));
  });
});

describe('buildAudioDenoiseOutputName', () => {
  it('含模式与时间戳，扩展名 m4a', () => {
    const n = buildAudioDenoiseOutputName(123, 'afftdn');
    expect(n).toBe('denoise-afftdn-123.m4a');
  });
  it('非法时间戳回落 0（不抛异常）', () => {
    expect(buildAudioDenoiseOutputName(Number.NaN, 'anlmdn')).toBe('denoise-anlmdn-0.m4a');
    expect(buildAudioDenoiseOutputName(-5, 'anlmdn')).toBe('denoise-anlmdn-0.m4a');
  });
});

describe('normalizeAudioDenoiseParams / describeAudioDenoiseParams', () => {
  it('组合归一化', () => {
    const p = normalizeAudioDenoiseParams({ mode: 'anlmdn', strength: '2' });
    expect(p.mode).toBe('anlmdn');
    expect(p.strength).toBe(1);
  });
  it('中文说明包含模式与强度', () => {
    const s = describeAudioDenoiseParams('afftdn', 0.6);
    expect(s).toContain('afftdn');
    expect(s).toContain('强度');
  });
  it('强度常量自洽', () => {
    expect(AUDIO_DENOISE_MIN_STRENGTH).toBeLessThan(AUDIO_DENOISE_MAX_STRENGTH);
    expect(AUDIO_DENOISE_DEFAULT_STRENGTH).toBeGreaterThanOrEqual(AUDIO_DENOISE_MIN_STRENGTH);
    expect(AUDIO_DENOISE_DEFAULT_STRENGTH).toBeLessThanOrEqual(AUDIO_DENOISE_MAX_STRENGTH);
  });
});