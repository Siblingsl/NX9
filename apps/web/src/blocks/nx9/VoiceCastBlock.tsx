import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  gatherUpstream,
  resolveCharacterReferenceAudio,
  resolveVoiceCastLines,
  type UpstreamPolicy,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { runSoundGenCast } from '../../engine/sound-gen-runner';

const LINE_SOURCE_LABEL = {
  local: '本节点',
  upstream: '上游成稿/分镜',
  none: '',
} as const;

function VoiceCastBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const appendLog = useActivityLog((s) => s.append);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const sounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const profiles = useWorkspaceDocument((s) => s.voice.profiles);
  const results = (props.data?.results as { speaker: string; text: string; audioUrl?: string; error?: string }[]) ?? [];
  const [profileMap, setProfileMap] = useState<Record<string, string>>(
    (props.data?.profileMap as Record<string, string>) ?? {},
  );
  const [running, setRunning] = useState(false);

  const resolved = useMemo(() => {
    const flowBlocks = nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'prompt',
      position: n.position,
      data: (n.data ?? {}) as Record<string, unknown>,
    }));
    const flowLinks = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    }));
    const data = (props.data ?? {}) as Record<string, unknown>;
    const gathered = gatherUpstream(
      props.id,
      flowBlocks,
      flowLinks,
      data.upstreamPolicy as UpstreamPolicy | undefined,
      data.primarySourceId as string | null | undefined,
    );
    return resolveVoiceCastLines(data.lines, gathered.lines);
  }, [nodes, edges, props.data, props.id]);

  const lines = resolved.lines;
  const lineSource = resolved.source;
  const speakers = useMemo(() => [...new Set(lines.map((l) => l.speaker).filter(Boolean))], [lines]);

  const run = useCallback(async () => {
    if (lines.length === 0) { appendLog('配音：无可解析的对白'); return; }
    setRunning(true);
    updateNodeData(props.id, { status: 'running' });
    try {
      const { results: nextResults, audioUrls } = await runSoundGenCast(lines, profileMap);
      updateNodeData(props.id, {
        status: audioUrls.length > 0 ? 'success' : 'error',
        results: nextResults,
        sounds: audioUrls,
        audioUrl: audioUrls[0],
        lines,
        lineSource,
        profileMap,
        meta: { total: nextResults.length, failed: nextResults.filter((r) => r.error).length, lineSource },
      });
      appendLog(`配音完成 · ${audioUrls.length}/${nextResults.length} 段成功 · 对白来自${LINE_SOURCE_LABEL[lineSource]}`);
    } finally {
      setRunning(false);
    }
  }, [lines, lineSource, profileMap, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[320px]">
        <p className="text-[10px] text-ink/50">
          {lineSource === 'none'
            ? '无可解析的对白（请连接编剧台或已拆镜的分镜台）'
            : `对白来源：${LINE_SOURCE_LABEL[lineSource]} · ${lines.length} 条`}
        </p>
        {speakers.length > 0 && (
          <div className="space-y-1 border border-line rounded-lg p-2">
            <p className="text-[10px] text-ink/50">音色映射（声线档案 / 角色参考音）</p>
            <p className="text-[9px] text-ink/40 leading-snug">
              声线档案 = 引擎 voiceId；角色参考音 = 素材库克隆源。二者勿混淆。
            </p>
            {speakers.map((s) => (
              <div key={s} className="flex gap-1 items-center">
                <span className="w-16 text-[10px] truncate">{s}</span>
                <select
                  value={profileMap[s] ?? ''}
                  onChange={(e) => {
                    const next = { ...profileMap, [s]: e.target.value };
                    setProfileMap(next);
                    updateNodeData(props.id, { profileMap: next });
                  }}
                  className="flex-1 rounded border border-line px-1 py-0.5 text-[10px] bg-surface"
                >
                  <option value="alloy">Alloy（默认引擎音色）</option>
                  <option value="echo">Echo</option>
                  <option value="fable">Fable</option>
                  <option value="nova">Nova</option>
                  <option value="shimmer">Shimmer</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.voiceId}>
                      档案·{p.name}
                    </option>
                  ))}
                  {characters
                    .filter((c) => Boolean(resolveCharacterReferenceAudio(c, sounds).audioUrl))
                    .map((c) => (
                      <option key={c.id} value={`char:${c.id}`}>
                        角色参考音·{c.name}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
        )}
        {lines.length > 0 && (
          <div className="max-h-36 overflow-y-auto nx9-scroll space-y-1">
            {lines.map((l, i) => (
              <div key={i} className="flex gap-1 items-start p-1 rounded border border-line">
                <span className="w-14 text-[10px] font-medium truncate">{l.speaker}</span>
                <span className="flex-1 text-[10px] text-ink/70">{l.text}</span>
                {results[i]?.audioUrl && (
                  <audio src={results[i].audioUrl} controls className="h-6 w-20" />
                )}
                {results[i]?.error && (
                  <span className="text-[9px] text-red-500">失败</span>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={running || lines.length === 0}
          className="w-full rounded-xl bg-brand text-white py-1.5 disabled:opacity-50"
        >
          {running ? '配音中…' : '批量配音'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(VoiceCastBlock);
