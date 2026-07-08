import { memo, useCallback, useEffect, useRef } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';

async function fetchFingerprint(url: string): Promise<string> {
  const res = await fetch(url, { method: 'HEAD' });
  const lm = res.headers.get('last-modified') ?? '';
  const len = res.headers.get('content-length') ?? '';
  return `${lm}|${len}|${url}`;
}

function AssetWatchBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const watchUrl = (props.data?.watchUrl as string) ?? '';
  const intervalSec = (props.data?.intervalSec as number) ?? 30;
  const lastFingerprint = (props.data?.lastFingerprint as string) ?? '';
  const changeCount = (props.data?.changeCount as number) ?? 0;
  const watching = (props.data?.watching as boolean) ?? false;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const upstream = props.data?.upstream as {
    pictures?: string[];
    clips?: string[];
    sounds?: string[];
  } | undefined;

  const poll = useCallback(async () => {
    const url = watchUrl.trim() || upstream?.pictures?.[0] || upstream?.clips?.[0] || upstream?.sounds?.[0];
    if (!url) return;
    try {
      const fp = await fetchFingerprint(url);
      if (lastFingerprint && fp !== lastFingerprint) {
        updateNodeData(props.id, {
          lastFingerprint: fp,
          changeCount: changeCount + 1,
          assetChanged: true,
          meta: { changedAt: new Date().toISOString(), watchUrl: url },
          pictures: upstream?.pictures,
          clips: upstream?.clips,
          sounds: upstream?.sounds,
        });
        appendLog(`素材监听 · 检测到变更 (${url})`);
      } else if (!lastFingerprint) {
        updateNodeData(props.id, { lastFingerprint: fp, watchUrl: url });
      }
    } catch {
      /* ignore network errors during poll */
    }
  }, [watchUrl, upstream, lastFingerprint, changeCount, props.id, updateNodeData, appendLog]);

  useEffect(() => {
    if (!watching) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    void poll();
    timerRef.current = setInterval(() => void poll(), Math.max(intervalSec, 5) * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [watching, intervalSec, poll]);

  const toggle = useCallback(() => {
    updateNodeData(props.id, { watching: !watching, status: !watching ? 'running' : 'idle' });
    appendLog(watching ? '素材监听已停止' : '素材监听已开始');
  }, [watching, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <input
          value={watchUrl}
          onChange={(e) => updateNodeData(props.id, { watchUrl: e.target.value })}
          placeholder="监听 URL（可留空用上游）"
          className="w-full rounded-xl border border-line px-2 py-1.5 font-mono text-[10px]"
        />
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          间隔(s)
          <input
            type="number"
            min={5}
            max={600}
            value={intervalSec}
            onChange={(e) => updateNodeData(props.id, { intervalSec: Number(e.target.value) || 30 })}
            className="w-16 rounded border border-line px-1 py-0.5"
          />
        </label>
        <p className="text-[10px] text-ink/50">
          {watching ? '监听中…' : '已停止'} · 变更 {changeCount} 次
        </p>
        <button
          type="button"
          onClick={toggle}
          className={`w-full rounded-xl py-2 text-white ${watching ? 'bg-warn' : 'bg-brand'}`}
        >
          {watching ? '停止监听' : '开始监听'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(AssetWatchBlock);
