import { memo, useCallback, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { api } from '../../api/client';

function CaptionAsrBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { clips?: string[]; sounds?: string[] } | undefined;
  const src = upstream?.clips?.[0] || upstream?.sounds?.[0] || (props.data?.sourceUrl as string);
  const srtContent = props.data?.srtContent as string | undefined;
  const language = (props.data?.language as string) ?? 'zh';
  const status = props.data?.status as string | undefined;
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (!src) { appendLog('语音转字幕：无上游音频/视频'); return; }
    setBusy(true);
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.transcribeAudio(src, language);
      updateNodeData(props.id, {
        status: 'success',
        srtContent: res.srtContent,
        cues: res.cues,
        language,
        output: res.srtContent,
        content: res.srtContent,
      });
      appendLog(`转写完成 · ${res.cues.length} 段`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`转写失败: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [src, language, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[300px]">
        {src && <p className="text-[10px] text-ink/50 truncate">源: {src}</p>}
        <select
          value={language}
          onChange={(e) => updateNodeData(props.id, { language: e.target.value })}
          className="w-full rounded-lg border border-line px-2 py-1 text-[10px] bg-white"
        >
          <option value="zh">中文</option>
          <option value="en">英文</option>
          <option value="ja">日文</option>
        </select>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !src}
          className="w-full rounded-xl bg-brand text-white py-1.5 disabled:opacity-50"
        >
          {busy ? '转写中…' : '语音转字幕'}
        </button>
        {srtContent && (
          <details className="border border-line rounded-lg">
            <summary className="px-2 py-1 text-[10px] text-ink/50 cursor-pointer">查看 SRT</summary>
            <pre className="px-2 pb-2 text-[10px] text-ink/70 whitespace-pre-wrap max-h-32 overflow-y-auto">{srtContent}</pre>
          </details>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(CaptionAsrBlock);
