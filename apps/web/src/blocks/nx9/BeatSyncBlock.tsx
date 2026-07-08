import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function buildCutPoints(durationSec: number, bpm: number): number[] {
  const interval = 60 / Math.max(bpm, 30);
  const cuts: number[] = [];
  for (let t = interval; t < durationSec; t += interval) cuts.push(Number(t.toFixed(3)));
  return cuts;
}

function BeatSyncBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { sounds?: string[]; clips?: string[] } | undefined;
  const bpm = (props.data?.bpm as number) ?? 120;
  const cutPoints = (props.data?.cutPoints as number[] | undefined) ?? [];

  const run = useCallback(async () => {
    const sound = upstream?.sounds?.[0];
    if (!sound) {
      appendLog('节拍对齐：需要上游音频');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const probe = await api.probeMediaDuration(sound);
      const durationSec = probe.durationSec > 0 ? probe.durationSec : 30;
      const cuts = buildCutPoints(durationSec, bpm);
      const meta = {
        bpm,
        durationSec,
        cutPoints: cuts,
        beatIntervalSec: 60 / bpm,
      };
      updateNodeData(props.id, {
        status: 'success',
        cutPoints: cuts,
        meta,
        clips: upstream?.clips?.length ? upstream.clips : undefined,
        content: `BPM ${bpm} · ${cuts.length} 切点 · ${durationSec.toFixed(1)}s`,
      });
      appendLog(`节拍对齐 · ${cuts.length} 切点 @ ${bpm} BPM`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [upstream, bpm, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          BPM
          <input
            type="number"
            min={30}
            max={240}
            value={bpm}
            onChange={(e) => updateNodeData(props.id, { bpm: Number(e.target.value) || 120 })}
            className="w-20 rounded border border-line px-1 py-0.5"
          />
        </label>
        {cutPoints.length > 0 && (
          <p className="text-[10px] text-ink/60 font-mono truncate">
            切点: {cutPoints.slice(0, 8).join('s, ')}s{cutPoints.length > 8 ? '…' : ''}
          </p>
        )}
        <button type="button" onClick={() => void run()} className="w-full rounded-xl bg-brand text-white py-2">
          检测节拍切点
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(BeatSyncBlock);
