/**
 * 导演台彩色关键帧 · 像素级质检（保守启发式）。
 *
 * 契约：无法可靠判断时必须返回 `unknown`，禁止据此把生成结果标失败。
 * 仅在高置信灰度/线稿时返回 `suspect-monochrome`，供审阅区警告。
 */

export type KeyframeColorVerdict = 'color' | 'suspect-monochrome' | 'unknown';

export interface KeyframeColorCheck {
  verdict: KeyframeColorVerdict;
  chromaMean?: number;
  chromaP95?: number;
  noticeableRatio?: number;
  sampleCount?: number;
  sampledAt?: string;
}

/** 平均色度低于此值才进入「疑似」候选（0–255）。 */
const SUSPECT_CHROMA_MEAN = 5;
/** 95 分位色度上限。 */
const SUSPECT_CHROMA_P95 = 12;
/** 色度 > 20 的像素占比低于此值视为几乎无彩色。 */
const SUSPECT_NOTICEABLE_RATIO = 0.03;
const MIN_SAMPLES = 64;
const NOTICEABLE_CHROMA = 20;

export function emptyKeyframeColorCheck(
  verdict: KeyframeColorVerdict = 'unknown',
): KeyframeColorCheck {
  return { verdict, sampledAt: new Date().toISOString() };
}

export function normalizeKeyframeColorCheck(raw: unknown): KeyframeColorCheck {
  if (!raw || typeof raw !== 'object') return emptyKeyframeColorCheck('unknown');
  const r = raw as Record<string, unknown>;
  const verdict =
    r.verdict === 'color' || r.verdict === 'suspect-monochrome' || r.verdict === 'unknown'
      ? r.verdict
      : 'unknown';
  return {
    verdict,
    chromaMean: typeof r.chromaMean === 'number' ? r.chromaMean : undefined,
    chromaP95: typeof r.chromaP95 === 'number' ? r.chromaP95 : undefined,
    noticeableRatio: typeof r.noticeableRatio === 'number' ? r.noticeableRatio : undefined,
    sampleCount: typeof r.sampleCount === 'number' ? r.sampleCount : undefined,
    sampledAt: typeof r.sampledAt === 'string' ? r.sampledAt : new Date().toISOString(),
  };
}

export function describeKeyframeColorCheck(check: KeyframeColorCheck | null | undefined): string | null {
  if (!check) return null;
  if (check.verdict === 'suspect-monochrome') {
    return '结果疑似线稿/黑白，已保留关键帧，请人工确认（未标失败）';
  }
  return null;
}

/**
 * 从紧密打包的 RGB(A) 字节评估彩色程度。
 * `channels` 为 3 或 4；alpha 不参与色度。
 */
export function assessKeyframeColorFromRgb(
  data: ArrayLike<number>,
  channels: 3 | 4 = 3,
): KeyframeColorCheck {
  const sampledAt = new Date().toISOString();
  if (channels !== 3 && channels !== 4) {
    return { verdict: 'unknown', sampledAt };
  }
  const pixelCount = Math.floor(data.length / channels);
  if (pixelCount < MIN_SAMPLES) {
    return { verdict: 'unknown', sampleCount: pixelCount, sampledAt };
  }

  const chromas: number[] = [];
  let chromaSum = 0;
  let noticeable = 0;
  for (let i = 0; i < pixelCount; i++) {
    const o = i * channels;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    chromas.push(chroma);
    chromaSum += chroma;
    if (chroma > NOTICEABLE_CHROMA) noticeable += 1;
  }

  chromas.sort((a, b) => a - b);
  const chromaMean = chromaSum / pixelCount;
  const p95Index = Math.min(pixelCount - 1, Math.floor(pixelCount * 0.95));
  const chromaP95 = chromas[p95Index] ?? 0;
  const noticeableRatio = noticeable / pixelCount;

  const suspect =
    chromaMean < SUSPECT_CHROMA_MEAN
    && chromaP95 < SUSPECT_CHROMA_P95
    && noticeableRatio < SUSPECT_NOTICEABLE_RATIO;

  return {
    verdict: suspect ? 'suspect-monochrome' : 'color',
    chromaMean: round4(chromaMean),
    chromaP95: round4(chromaP95),
    noticeableRatio: round4(noticeableRatio),
    sampleCount: pixelCount,
    sampledAt,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
