import { api } from '../api/client';
import { sleepUntilAborted } from './block-run-abort';

export interface PollOptions {
  attempts?: number;
  intervalMs?: number;
  /** 中止轮询（如批量线稿「停止」）：立即抛 AbortError，不再等下一轮 */
  signal?: AbortSignal;
  /** PG-17: 超时文案按媒体类型区分（默认视频） */
  mediaKind?: 'video' | 'image';
  /** VG-30: 提交时的视频通道，避免 poll 打到当前设置 */
  baseUrl?: string;
}

/**
 * VG-10 / PG-17: 轮询超时（任务可能仍在后台跑）。
 * 调用方据此把 taskId 记入待恢复表，而不是直接判失败。
 */
export class VideoPollTimeoutError extends Error {
  constructor(
    public readonly taskId: string,
    message?: string,
    public readonly mediaKind: 'video' | 'image' = 'video',
    public readonly providerBaseUrl?: string,
  ) {
    const fallback =
      mediaKind === 'image'
        ? `图片轮询超时，任务可能仍在后台运行（taskId: ${taskId}），可稍后继续查询`
        : `视频轮询超时，任务可能仍在后台运行（taskId: ${taskId}），可稍后继续查询`;
    super(message?.trim() && message !== 'processing' ? message : fallback);
    this.name = 'VideoPollTimeoutError';
  }
}

/**
 * Unified async video-task poll helper (L2).
 * Shared by clip-gen / clip-chain runners so a timed-out or failed
 * async task surfaces as a thrown error instead of a silent "running".
 */
export async function pollVideoUntilDone(taskId: string, opts: PollOptions = {}): Promise<string> {
  const attempts = opts.attempts ?? 60;
  const intervalMs = opts.intervalMs ?? 5000;
  let lastMessage: string | undefined;
  for (let i = 0; i < attempts; i++) {
    if (opts.signal?.aborted) {
      throw new DOMException('轮询已中止', 'AbortError');
    }
    const res = await api.pollVideo(taskId, opts.baseUrl, { signal: opts.signal });
    if (res.status === 'success' && res.url) return res.url;
    if (res.status === 'failed') {
      throw new Error(res.message ?? (opts.mediaKind === 'image' ? '图片生成任务失败' : '视频生成任务失败'));
    }
    lastMessage = res.message;
    // 停止须立刻打断间隔等待，不能干等到下一轮才感知 abort
    await sleepUntilAborted(intervalMs, opts.signal);
  }
  throw new VideoPollTimeoutError(taskId, lastMessage, opts.mediaKind ?? 'video', opts.baseUrl);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
  );
}

/**
 * VG-22/25: 提交 + 轮询合一。中止时若已有 taskId，转为可恢复的超时错误，避免结果黑洞。
 * VG-30: 带回并透传 providerBaseUrl。
 */
export async function awaitProxyVideo(
  body: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
): Promise<{ url: string; taskId?: string; providerBaseUrl?: string }> {
  if (opts?.signal?.aborted) {
    throw new DOMException('轮询已中止', 'AbortError');
  }
  const res = await api.proxyVideo(body, { signal: opts?.signal });
  const providerBaseUrl = res.providerBaseUrl;
  if (res.url) return { url: res.url, taskId: res.taskId, providerBaseUrl };
  if (res.taskId && (res.status === 'processing' || res.status === 'queued')) {
    try {
      const url = await pollVideoUntilDone(res.taskId, { ...opts, baseUrl: providerBaseUrl });
      return { url, taskId: res.taskId, providerBaseUrl };
    } catch (error) {
      if (isAbortError(error)) {
        throw new VideoPollTimeoutError(
          res.taskId,
          '已停止，任务仍在后台生成，可继续查询',
          'video',
          providerBaseUrl,
        );
      }
      if (error instanceof VideoPollTimeoutError) {
        throw new VideoPollTimeoutError(
          error.taskId,
          error.message,
          error.mediaKind,
          error.providerBaseUrl ?? providerBaseUrl,
        );
      }
      throw error;
    }
  }
  throw new Error(res.message ?? '视频生成失败');
}
