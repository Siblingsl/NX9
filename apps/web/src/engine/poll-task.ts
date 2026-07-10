import { api } from '../api/client';

export interface PollOptions {
  attempts?: number;
  intervalMs?: number;
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
    const res = await api.pollVideo(taskId);
    if (res.status === 'success' && res.url) return res.url;
    if (res.status === 'failed') {
      throw new Error(res.message ?? '视频生成任务失败');
    }
    lastMessage = res.message;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    lastMessage ?? `视频轮询超时（${attempts} 次未返回结果），任务可能仍在后台运行，请稍后重试查询`,
  );
}
