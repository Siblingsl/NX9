import {
  buildContinuationPrompt,
  summarizeClipResult,
  type ClipChainItem,
  type ClipChainState,
} from '@nx9/shared';
import { api } from '../api/client';

export async function runClipChain(
  chain: ClipChainState,
  projectGoal: string | undefined,
  onUpdate: (chain: ClipChainState) => void,
  onClipDone: (item: ClipChainItem, videoUrl: string) => void,
  log: (msg: string) => void,
): Promise<ClipChainState> {
  let state = { ...chain, items: chain.items.map((i) => ({ ...i })) };

  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    if (item.status === 'done' && item.videoUrl) continue;

    const prior = state.items.slice(0, i);
    const prompt = buildContinuationPrompt(item, prior, projectGoal);

    state.items[i] = { ...item, status: 'running' };
    state.currentIndex = i;
    onUpdate(state);
    log(`${item.label} 生成中…`);

    try {
      const res = await api.proxyVideo({
        prompt,
        model: 'seedance',
        imageUrl: prior.filter((p) => p.videoUrl).at(-1)?.videoUrl,
      });

      if (!res.url && res.status === 'processing' && res.taskId) {
        log(`${item.label} 异步任务 ${res.taskId} — 轮询中…`);
        const polled = await api.pollVideo(res.taskId);
        if (polled.url) res.url = polled.url;
      }

      const videoUrl = res.url ?? '';
      state.items[i] = {
        ...item,
        status: videoUrl ? 'done' : res.status === 'processing' ? 'running' : 'failed',
        videoUrl: videoUrl || item.videoUrl,
        previousSummary: summarizeClipResult({ ...item, status: 'done' }),
      };
      if (videoUrl) onClipDone(item, videoUrl);
      onUpdate(state);
      log(videoUrl ? `${item.label} 完成` : `${item.label} 待完成/失败`);
    } catch (e) {
      state.items[i] = { ...item, status: 'failed' };
      onUpdate(state);
      log(`${item.label} 失败: ${String(e)}`);
    }
  }

  return state;
}
