import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';

async function readSrtFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('读取 SRT 文件失败'));
    r.readAsText(file);
  });
}

function SubtitleBurnBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const upstream = props.data?.upstream as { clips?: string[]; prompts?: string[]; shotIds?: string[] } | undefined;
  const subtitle = (props.data?.subtitle as string) ?? upstream?.prompts?.[0] ?? '';
  const durationSec = (props.data?.durationSec as number) ?? 4;
  const outputUrl = props.data?.outputClip as string | undefined;

  const run = useCallback(async () => {
    const clip = upstream?.clips?.[0];
    if (!clip) {
      appendLog('字幕烧录：需要上游视频');
      return;
    }
    if (!subtitle.trim()) {
      appendLog('字幕烧录：字幕文本为空');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.renderShotMp4({
        videoUrl: clip,
        subtitle: subtitle.trim(),
        durationSec,
        skipReview: true,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? '烧录失败');
      // 写入 storyboard shot 元数据（供 Timeline v2 字幕轨使用）
      if (upstream?.shotIds) {
        for (const shotId of upstream.shotIds) {
          const shot = shots.find((s) => s.id === shotId);
          if (shot) {
            updateShot(shotId, { subtitleText: subtitle.trim() } as Record<string, unknown>);
          }
        }
      }
      updateNodeData(props.id, {
        status: 'success',
        outputClip: res.url,
        clips: [res.url],
        content: subtitle,
        subtitleText: subtitle.trim(),
      });
      appendLog('字幕烧录完成 · 已写入时间线字幕轨');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [upstream?.clips, subtitle, durationSec, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <textarea
          value={subtitle}
          onChange={(e) => updateNodeData(props.id, { subtitle: e.target.value })}
          placeholder="字幕文本或 SRT 内容…"
          className="w-full min-h-[56px] rounded-xl border border-line px-2 py-1.5 resize-y"
        />
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          <input
            type="file"
            accept=".srt,.txt"
            className="hidden"
            id={`srt-upload-${props.id}`}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await readSrtFile(file);
                updateNodeData(props.id, { subtitle: text });
                appendLog(`SRT 已加载 · ${file.name}`);
              } catch (err) {
                appendLog(`SRT 加载失败: ${String(err)}`);
              }
            }}
          />
          <label htmlFor={`srt-upload-${props.id}`} className="text-brand cursor-pointer hover:underline">
            上传 SRT 文件
          </label>
        </label>
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          时长(s)
          <input
            type="number"
            min={1}
            max={120}
            value={durationSec}
            onChange={(e) => updateNodeData(props.id, { durationSec: Number(e.target.value) || 4 })}
            className="w-16 rounded border border-line px-1 py-0.5"
          />
        </label>
        {outputUrl && (
          <video src={outputUrl} controls className="w-full rounded-lg border border-line max-h-24" />
        )}
        <button type="button" onClick={() => void run()} className="w-full rounded-xl bg-brand text-white py-2">
          烧录字幕
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(SubtitleBurnBlock);
