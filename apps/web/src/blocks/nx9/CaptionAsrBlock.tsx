import { memo, useCallback, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { api } from '../../api/client';

const CAPTION_MODES = [
  { id: 'asr', label: '语音转字幕' },
  { id: 'burn', label: '字幕烧录' },
] as const;

async function readSrtFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('读取 SRT 失败'));
    r.readAsText(file);
  });
}

function CaptionAsrBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const captionMode = (props.data?.captionMode as string) ?? 'asr';
  const upstream = props.data?.upstream as {
    clips?: string[];
    sounds?: string[];
    prompts?: string[];
    shotIds?: string[];
  } | undefined;
  const src = upstream?.clips?.[0] || upstream?.sounds?.[0] || (props.data?.sourceUrl as string);
  const srtContent = props.data?.srtContent as string | undefined;
  const language = (props.data?.language as string) ?? 'zh';
  const subtitle =
    (props.data?.subtitle as string) ??
    srtContent ??
    upstream?.prompts?.[0] ??
    '';
  const durationSec = (props.data?.durationSec as number) ?? 4;
  const outputUrl = props.data?.outputClip as string | undefined;
  const status = props.data?.status as string | undefined;
  const [busy, setBusy] = useState(false);

  const runAsr = useCallback(async () => {
    if (!src) {
      appendLog('字幕台：无上游音频/视频');
      return;
    }
    setBusy(true);
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.transcribeAudio(src, language);
      updateNodeData(props.id, {
        status: 'success',
        srtContent: res.srtContent,
        cues: res.cues,
        language,
        subtitle: res.srtContent,
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

  const runBurn = useCallback(async () => {
    const clip = upstream?.clips?.[0] || (props.data?.sourceUrl as string | undefined);
    if (!clip) {
      appendLog('字幕烧录：需要上游视频');
      return;
    }
    if (!subtitle.trim()) {
      appendLog('字幕烧录：字幕文本为空');
      return;
    }
    setBusy(true);
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.renderShotMp4({
        videoUrl: clip,
        subtitle: subtitle.trim(),
        durationSec,
        skipReview: true,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? '烧录失败');
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
      appendLog('字幕烧录完成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`烧录失败: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [
    upstream?.clips,
    upstream?.shotIds,
    subtitle,
    durationSec,
    props.id,
    props.data?.sourceUrl,
    updateNodeData,
    appendLog,
    shots,
    updateShot,
  ]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[320px]">
        <div className="flex gap-1">
          {CAPTION_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => updateNodeData(props.id, { captionMode: m.id })}
              className={`flex-1 py-1 rounded-lg text-[10px] border ${
                captionMode === m.id
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-line text-ink/50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {captionMode === 'asr' ? (
          <>
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
              onClick={() => void runAsr()}
              disabled={busy || !src}
              className="w-full rounded-xl bg-brand text-white py-1.5 disabled:opacity-50"
            >
              {busy || status === 'running' ? '转写中…' : '语音转字幕'}
            </button>
            {srtContent && (
              <details className="border border-line rounded-lg">
                <summary className="px-2 py-1 text-[10px] text-ink/50 cursor-pointer">查看 SRT</summary>
                <pre className="px-2 pb-2 text-[10px] text-ink/70 whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {srtContent}
                </pre>
              </details>
            )}
          </>
        ) : (
          <>
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
                className="text-[10px]"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void readSrtFile(file).then((text) =>
                    updateNodeData(props.id, { subtitle: text, srtContent: text }),
                  );
                }}
              />
              上传 SRT
            </label>
            <label className="flex items-center gap-2 text-[10px]">
              时长
              <input
                type="number"
                min={1}
                max={120}
                value={durationSec}
                onChange={(e) =>
                  updateNodeData(props.id, { durationSec: Number(e.target.value) || 4 })
                }
                className="w-16 rounded border border-line px-1 py-0.5"
              />
              s
            </label>
            <button
              type="button"
              onClick={() => void runBurn()}
              disabled={busy || status === 'running'}
              className="w-full rounded-xl bg-brand text-white py-1.5 disabled:opacity-50"
            >
              {busy || status === 'running' ? '烧录中…' : '烧录字幕到视频'}
            </button>
            {outputUrl && (
              <video src={outputUrl} controls className="w-full rounded-lg max-h-32" />
            )}
          </>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(CaptionAsrBlock);
