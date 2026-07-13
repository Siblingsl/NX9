import { memo, useCallback, useMemo, useState } from 'react';
import { FileText, Loader2, MessageSquareText, Sparkles } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  buildScriptBreakdownFromText,
  flattenScriptBreakdownShots,
  type ScriptBreakdownDialogueLine,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
  type StoryboardTableRow,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { api } from '../../api/client';

function dialogueFromText(text: string): ScriptBreakdownDialogueLine[] {
  return text
    .split('\n')
    .map((line) => {
      const m = line.trim().match(/^([^：:\s（）()]{1,12})[：:]\s*(.{2,})$/);
      return m ? { speaker: m[1], text: m[2] } : null;
    })
    .filter(Boolean)
    .slice(0, 4) as ScriptBreakdownDialogueLine[];
}

function payloadFromTable(sourceText: string, table: StoryboardTableRow[]): ScriptBreakdownPayload {
  const base = buildScriptBreakdownFromText(sourceText);
  const first = base.episodes[0] ?? {
    id: 'ep-1',
    index: 1,
    title: '第一集',
    shots: [],
  };
  const shots: ScriptBreakdownShot[] = table.map((row, i) => {
    const sceneCode = row.group || `1-${i + 1}`;
    const scriptText = [row.descriptionZh, row.dialogue].filter(Boolean).join('\n');
    const dialogue = dialogueFromText(row.dialogue || '');
    return {
      id: `ep-1-shot-${i + 1}`,
      episodeId: first.id,
      episodeIndex: first.index,
      index: i + 1,
      sceneId: `ep-1-scene-${sceneCode}`,
      sceneCode,
      title: row.descriptionZh.slice(0, 28) || `分镜 ${i + 1}`,
      durationSec: row.durationSec,
      characters: dialogue.map((d) => d.speaker),
      scene: row.group || '未指定场景',
      scriptText,
      dialogue,
      imagePrompt: `漫画短剧关键帧，${row.descriptionZh}，${row.dialogue ? `对白：${row.dialogue}，` : ''}角色一致，电影感构图`,
      videoPrompt: row.videoDesc || `根据关键帧生成 ${row.durationSec} 秒短视频：${row.descriptionZh}`,
      referenceImageUrl: null,
      previewImageUrl: null,
      status: 'draft',
    };
  });
  return {
    ...base,
    episodes: [{ ...first, shots, logline: first.logline || shots[0]?.scriptText }],
    generatedAt: new Date().toISOString(),
  };
}

function compact(text: string, max = 42) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

function DialogueSheetBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const initialText = (props.data?.sourceText as string) ?? '';
  const payload = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const [sourceText, setSourceText] = useState(initialText);
  const [parsing, setParsing] = useState(false);

  const shots = useMemo(() => flattenScriptBreakdownShots(payload), [payload]);
  const selectedShot = shots[0];

  const parse = useCallback(async () => {
    const source = sourceText.trim();
    if (!source) return;
    setParsing(true);
    updateNodeData(props.id, { status: 'running', sourceText: source });
    try {
      let next = buildScriptBreakdownFromText(source);
      try {
        const res = await api.storyboardTable({ sourceText: source });
        if (res.table?.length) next = payloadFromTable(source, res.table);
      } catch {
        appendLog('AI 分镜表暂不可用，已使用本地规则完成剧本拆分');
      }
      const flat = flattenScriptBreakdownShots(next);
      updateNodeData(props.id, {
        status: 'success',
        sourceText: source,
        scriptBreakdown: next,
        lines: flat.flatMap((shot) => shot.dialogue),
        content: `${next.title} · ${next.episodes.length} 集 · ${flat.length} 个分镜`,
        output: flat.map((shot) => shot.imagePrompt).join('\n\n'),
        meta: {
          episodeCount: next.episodes.length,
          shotCount: flat.length,
          generatedAt: next.generatedAt,
        },
      });
      appendLog(`剧本拆分完成 · ${next.episodes.length} 集 / ${flat.length} 个分镜`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`剧本拆分失败: ${String(e)}`);
    } finally {
      setParsing(false);
    }
  }, [appendLog, props.id, sourceText, updateNodeData]);

  return (
    <BlockShell {...props}>
      <div className="w-[340px] space-y-3 nodrag nopan text-xs">
        <div className="rounded-xl border border-line/60 bg-white p-2.5 space-y-2">
          <div className="flex items-center gap-2 text-ink">
            <FileText size={14} className="text-brand" />
            <span className="font-medium">剧本拆分</span>
            {payload && (
              <span className="ml-auto text-[10px] text-ink/45">
                {payload.episodes.length} 集 · {shots.length} 镜
              </span>
            )}
          </div>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="粘贴小说、文章或剧本文本..."
            rows={5}
            className="w-full rounded-lg border border-line/60 px-2.5 py-2 resize-y bg-surface/30 focus:bg-white focus:outline-none focus:border-brand/40"
          />
          <button
            type="button"
            onClick={() => void parse()}
            disabled={parsing || !sourceText.trim()}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand text-white py-2 text-[12px] font-medium disabled:opacity-45"
          >
            {parsing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {parsing ? '拆分中...' : '拆分集数与分镜'}
          </button>
        </div>

        {payload && (
          <div className="rounded-xl border border-line/50 bg-surface/20 overflow-hidden">
            <div className="max-h-56 overflow-y-auto nx9-scroll">
              {payload.episodes.map((episode) => (
                <div key={episode.id} className="border-b border-line/30 last:border-b-0">
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-white/95 px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-ink">{episode.title}</span>
                    <span className="ml-auto text-[10px] text-ink/40">{episode.shots.length} 个分镜</span>
                  </div>
                  <div className="p-1.5 space-y-1">
                    {episode.shots.map((shot) => (
                      <div key={shot.id} className="rounded-lg bg-white border border-line/35 px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-6 text-[10px] text-brand font-medium">{shot.sceneCode}</span>
                          <span className="min-w-0 flex-1 text-[11px] text-ink truncate">{shot.title}</span>
                          <span className="text-[9px] text-ink/35">{shot.durationSec}s</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[9px] text-ink/45">
                          <MessageSquareText size={10} />
                          <span className="truncate">{shot.dialogue[0]?.text || compact(shot.scriptText)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedShot && (
          <div className="rounded-xl border border-line/45 bg-white px-2.5 py-2 space-y-1">
            <p className="text-[10px] text-ink/40">预览 Prompt</p>
            <p className="text-[11px] leading-relaxed text-ink/70 line-clamp-3">{selectedShot.imagePrompt}</p>
          </div>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(DialogueSheetBlock);
