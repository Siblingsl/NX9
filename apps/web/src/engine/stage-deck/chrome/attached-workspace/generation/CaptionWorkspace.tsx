import { useCallback, useMemo, useState } from 'react';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { lookupBlock } from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from './use-attached-node-data';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { patchUpstreamShot, resolveShotsForBlock } from '../../../../../engine/chain-storyboard-utils';
import { api } from '../../../../../api/client';

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

export interface CaptionWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function CaptionWorkspace({ blockId, kind, onCollapse }: CaptionWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const nodes = useNodes();
  const edges = useEdges();
  const data = useAttachedNodeData(blockId);

  const chainShots = useMemo(
    () => resolveShotsForBlock(blockId, nodes, edges),
    [blockId, nodes, edges],
  );
  const shots = chainShots;
  const captionMode = (data.captionMode as string) ?? 'asr';
  const upstream = data.upstream as {
    clips?: string[];
    sounds?: string[];
    prompts?: string[];
    shotIds?: string[];
  } | undefined;
  const src = upstream?.clips?.[0] || upstream?.sounds?.[0] || (data.sourceUrl as string);
  const srtContent = data.srtContent as string | undefined;
  const language = (data.language as string) ?? 'zh';
  const subtitle =
    (data.subtitle as string) ??
    srtContent ??
    upstream?.prompts?.[0] ??
    '';
  const durationSec = (data.durationSec as number) ?? 4;
  const outputUrl = data.outputClip as string | undefined;
  const status = data.status as string | undefined;
  const [busy, setBusy] = useState(false);

  const runAsr = useCallback(async () => {
    if (!src) {
      appendLog('字幕台：无上游音频/视频');
      return;
    }
    setBusy(true);
    updateNodeData(blockId, { status: 'running' });
    try {
      const res = await api.transcribeAudio(src, language);
      updateNodeData(blockId, {
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
      updateNodeData(blockId, { status: 'error', error: String(e) });
      appendLog(`转写失败: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [src, language, blockId, updateNodeData, appendLog]);

  const runBurn = useCallback(async () => {
    const clip = upstream?.clips?.[0] || (data.sourceUrl as string | undefined);
    if (!clip) {
      appendLog('字幕烧录：需要上游视频');
      return;
    }
    if (!subtitle.trim()) {
      appendLog('字幕烧录：字幕文本为空');
      return;
    }
    setBusy(true);
    updateNodeData(blockId, { status: 'running' });
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
          const ok = patchUpstreamShot(
            updateNodeData, blockId, nodes, edges, shotId,
            { subtitleText: subtitle.trim() },
          );
          if (!ok) {
            const { updateShot } = useWorkspaceDocument.getState();
            const shot = shots.find((s) => s.id === shotId);
            if (shot) updateShot(shotId, { subtitleText: subtitle.trim() } as Record<string, unknown>);
          }
        }
      }
      updateNodeData(blockId, {
        status: 'success',
        outputClip: res.url,
        clips: [res.url],
        content: subtitle,
        subtitleText: subtitle.trim(),
      });
      appendLog('字幕烧录完成');
    } catch (e) {
      updateNodeData(blockId, { status: 'error', error: String(e) });
      appendLog(`烧录失败: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [
    upstream?.clips, upstream?.shotIds, subtitle, durationSec, blockId,
    data.sourceUrl, updateNodeData, appendLog, nodes, edges,
  ]);

  const isRunning = busy || status === 'running';

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={onCollapse}
      onRun={captionMode === 'asr' ? () => void runAsr() : () => void runBurn()}
      running={isRunning}
      runLabel={captionMode === 'asr' ? '语音转字幕' : '烧录字幕到视频'}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      heightClass="h-auto max-h-[380px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2 overflow-y-auto nowheel overscroll-contain text-xs max-w-[320px]"
    >
      <div className="space-y-2">
        <div className="flex gap-1">
          {CAPTION_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => updateNodeData(blockId, { captionMode: m.id })}
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
              onChange={(e) => updateNodeData(blockId, { language: e.target.value })}
              className="w-full rounded-lg border border-line px-2 py-1 text-[10px] bg-surface"
            >
              <option value="zh">中文</option>
              <option value="en">英文</option>
              <option value="ja">日文</option>
            </select>
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
              onChange={(e) => updateNodeData(blockId, { subtitle: e.target.value })}
              placeholder="字幕文本或 SRT 内容…"
              className="w-full min-h-[56px] rounded-xl border border-line px-2 py-1.5 resize-y bg-surface"
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
                    updateNodeData(blockId, { subtitle: text, srtContent: text }),
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
                onChange={(e) => updateNodeData(blockId, { durationSec: Number(e.target.value) || 4 })}
                className="w-16 rounded border border-line px-1 py-0.5 bg-surface"
              />
              s
            </label>
            {outputUrl && (
              <video src={outputUrl} controls className="w-full rounded-lg max-h-32" />
            )}
          </>
        )}
      </div>
    </ComposerWorkspaceShell>
  );
}
