import {
  resolveEngine,
  type SmartEditEngine,
  type SmartEditProfile,
  type TimelinePayload,
} from '@nx9/shared';
import { api } from '../api/client';

const POLL_MS = 2500;
const TIMEOUT_MS = 10 * 60 * 1000;

export function videoUrlsFromTimeline(timeline: TimelinePayload): string[] {
  return timeline.tracks
    .filter((t) => t.kind === 'video')
    .flatMap((t) =>
      t.clips.filter((c) => c.type === 'video' && Boolean(c.assetUrl)).map((c) => c.assetUrl),
    );
}

export async function pollMontageTaskUntilDone(
  taskId: string,
  kind: 'hyperframes' | 'remotion',
  opts?: {
    onProgress?: (msg: string) => void;
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<string> {
  const deadline = Date.now() + (opts?.timeoutMs ?? TIMEOUT_MS);
  const interval = opts?.intervalMs ?? POLL_MS;
  const label = kind === 'hyperframes' ? 'Hyperframes' : 'Remotion';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    if (kind === 'hyperframes') {
      const st = await api.getTaskStatus(taskId);
      if (st.status === 'done' && st.url) return st.url;
      if (st.status === 'error' || st.status === 'cancelled') {
        throw new Error(st.message || `${label} 渲染${st.status === 'cancelled' ? '已取消' : '失败'}`);
      }
      opts?.onProgress?.(`${label} 渲染中…（${st.status}）`);
    } else {
      const st = await api.getRemotionTaskStatus(taskId);
      if (st.status === 'done') {
        const url = st.outputUrl ?? st.url;
        if (!url) throw new Error('Remotion 渲染完成但无输出地址');
        return url;
      }
      if (st.status === 'error') throw new Error(st.error || st.message || 'Remotion 渲染失败');
      opts?.onProgress?.(`Remotion 渲染中… ${st.progress ?? 0}%`);
    }
  }
  throw new Error(`${label} 渲染超时`);
}

export async function renderClipEditorTimeline(
  timeline: TimelinePayload,
  engine: SmartEditEngine,
  opts?: {
    profile?: SmartEditProfile;
    title?: string;
    templateId?: string;
    onProgress?: (msg: string) => void;
  },
): Promise<{ url: string; taskId?: string; engine: 'ffmpeg' | 'remotion' | 'hyperframes' }> {
  const resolved = resolveEngine(opts?.profile ?? 'drama', engine);
  if (resolved === 'ffmpeg') {
    // SE-02: 仅 concat 视频轨 assetUrl，忽略 trim/转场/音轨——调用方须明示「粗预览」
    const clips = videoUrlsFromTimeline(timeline);
    if (clips.length === 0) throw new Error('时间线视频轨无可用片段');
    opts?.onProgress?.(
      'FFmpeg 粗预览：仅拼接视频轨素材，不含裁剪、转场与多轨…',
    );
    const res = await api.concatClips(clips, opts?.title || '智能剪辑导出', 'none');
    if (!res.ok || !res.url) throw new Error(res.message || 'FFmpeg 拼接失败');
    return { url: res.url, engine: 'ffmpeg' };
  }
  if (resolved === 'hyperframes') {
    const res = await api.renderHyperframes({
      timeline,
      templateId: opts?.templateId ?? 'nx9-vertical-episode',
    });
    if (!res.ok || !res.taskId) throw new Error('Hyperframes 任务提交失败');
    opts?.onProgress?.('Hyperframes 任务已提交，等待渲染…');
    const url = await pollMontageTaskUntilDone(res.taskId, 'hyperframes', {
      onProgress: opts?.onProgress,
    });
    return { url, taskId: res.taskId, engine: 'hyperframes' };
  }
  const res = await api.renderRemotion({ timeline });
  if (!res.ok || !res.taskId) throw new Error(res.message || 'Remotion 任务提交失败');
  opts?.onProgress?.('Remotion 任务已提交，等待渲染…');
  const url = await pollMontageTaskUntilDone(res.taskId, 'remotion', {
    onProgress: opts?.onProgress,
  });
  return { url, taskId: res.taskId, engine: 'remotion' };
}
