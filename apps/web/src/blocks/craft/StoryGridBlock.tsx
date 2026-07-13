import { memo, useCallback, useMemo, useState } from 'react';
import { ChevronRight, Clock, MapPin, UserRound } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  flattenScriptBreakdownShots,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';

function compact(text: string, max = 68) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

function useUpstreamBreakdown(blockId: string): ScriptBreakdownPayload | undefined {
  const { getEdges, getNodes } = useReactFlow();
  return useMemo(() => {
    const nodes = getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const incoming = getEdges().filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const data = byId.get(edge.source)?.data as Record<string, unknown> | undefined;
      const payload = data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
      if (payload?.version === 1) return payload;
    }
    return undefined;
  }, [blockId, getEdges, getNodes]);
}

function ShotDetail({ shot }: { shot: ScriptBreakdownShot }) {
  return (
    <div className="rounded-xl border border-line/45 bg-white p-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-brand/10 text-brand grid place-items-center text-[11px] font-semibold">
          {shot.sceneCode}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-ink truncate">{shot.title}</p>
          <p className="text-[10px] text-ink/40">{shot.durationSec}s · {shot.status}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <div className="rounded-lg bg-surface/50 px-2 py-1.5 min-w-0">
          <div className="flex items-center gap-1 text-ink/40"><UserRound size={10} />角色</div>
          <p className="mt-0.5 text-ink/70 truncate">{shot.characters.join('、') || '未指定'}</p>
        </div>
        <div className="rounded-lg bg-surface/50 px-2 py-1.5 min-w-0">
          <div className="flex items-center gap-1 text-ink/40"><MapPin size={10} />场景</div>
          <p className="mt-0.5 text-ink/70 truncate">{shot.scene || '未指定'}</p>
        </div>
      </div>
      <div>
        <p className="text-[10px] text-ink/40 mb-1">剧本 / 对白</p>
        <p className="text-[11px] leading-relaxed text-ink/70 line-clamp-3">
          {shot.dialogue.length
            ? shot.dialogue.map((d) => `${d.speaker}：${d.text}`).join('\n')
            : shot.scriptText}
        </p>
      </div>
      <div>
        <p className="text-[10px] text-ink/40 mb-1">图片预览 Prompt</p>
        <p className="text-[11px] leading-relaxed text-ink/70 line-clamp-4">{shot.imagePrompt}</p>
      </div>
    </div>
  );
}

function StoryGridBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = useUpstreamBreakdown(props.id);
  const local = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const payload = upstream ?? local;
  const shots = useMemo(() => flattenScriptBreakdownShots(payload), [payload]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = shots.find((shot) => shot.id === selectedId) ?? shots[0];

  const sync = useCallback(() => {
    if (!upstream) return;
    const flat = flattenScriptBreakdownShots(upstream);
    updateNodeData(props.id, {
      status: 'success',
      scriptBreakdown: upstream,
      content: `${upstream.title} · ${upstream.episodes.length} 集 · ${flat.length} 个分镜`,
      output: flat.map((shot) => shot.imagePrompt).join('\n\n'),
      meta: { episodeCount: upstream.episodes.length, shotCount: flat.length },
    });
    appendLog(`分镜网格已同步 · ${upstream.episodes.length} 集 / ${flat.length} 个分镜`);
  }, [appendLog, props.id, updateNodeData, upstream]);

  return (
    <BlockShell {...props}>
      <div className="w-[335px] nodrag nopan text-xs">
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">分镜网格</p>
            <p className="text-[10px] text-ink/40 truncate">
              {payload ? `${payload.title} · ${payload.episodes.length} 集 · ${shots.length} 镜` : '连接剧本拆分节点后展示'}
            </p>
          </div>
          {upstream && (
            <button
              type="button"
              onClick={sync}
              className="px-2 py-1 rounded-lg border border-line/60 bg-white text-[10px] text-ink/55 hover:text-brand"
            >
              同步
            </button>
          )}
        </div>

        {!payload ? (
          <div className="h-32 rounded-xl border border-dashed border-line/70 bg-surface/30 grid place-items-center text-ink/35">
            等待剧本拆分数据
          </div>
        ) : (
          <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-2">
            <div className="max-h-72 overflow-y-auto nx9-scroll rounded-xl border border-line/50 bg-surface/20 p-1.5">
              {payload.episodes.map((episode) => (
                <div key={episode.id} className="mb-1.5 last:mb-0">
                  <div className="px-2 py-1 text-[10px] font-semibold text-ink/55">
                    {episode.title}
                  </div>
                  <div className="space-y-1">
                    {episode.shots.map((shot) => {
                      const active = selected?.id === shot.id;
                      return (
                        <button
                          key={shot.id}
                          type="button"
                          onClick={() => setSelectedId(shot.id)}
                          className={`w-full text-left rounded-lg border px-2 py-1.5 transition-colors ${
                            active
                              ? 'border-brand/45 bg-brand/10'
                              : 'border-line/30 bg-white hover:border-line/60'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="w-6 text-[10px] font-medium text-brand">{shot.sceneCode}</span>
                            <span className="min-w-0 flex-1 text-[11px] text-ink truncate">{shot.title}</span>
                            <ChevronRight size={11} className="text-ink/25" />
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[9px] text-ink/40">
                            <Clock size={9} />
                            <span>{shot.durationSec}s</span>
                            <span className="truncate">{compact(shot.scene, 18)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {selected ? <ShotDetail shot={selected} /> : null}
          </div>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(StoryGridBlock);
