import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../../shared/BlockShell';
import { useActivityLog } from '../../../stores/activity-log';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { api } from '../../../api/client';

function VoiceCastBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const profiles = useWorkspaceDocument((s) => s.voice.profiles);
  const lines = (props.data?.lines as { speaker: string; text: string; emotion?: string }[]) ?? [];
  const results = (props.data?.results as { speaker: string; text: string; audioUrl?: string; error?: string }[]) ?? [];
  const status = props.data?.status as string | undefined;
  const [profileMap, setProfileMap] = useState<Record<string, string>>(
    (props.data?.profileMap as Record<string, string>) ?? {},
  );
  const [running, setRunning] = useState(false);

  const speakers = useMemo(() => [...new Set(lines.map((l) => l.speaker).filter(Boolean))], [lines]);

  const run = useCallback(async () => {
    if (lines.length === 0) { appendLog('配音：无可解析的对白'); return; }
    setRunning(true);
    updateNodeData(props.id, { status: 'running' });
    const allResults: { speaker: string; text: string; audioUrl?: string; error?: string }[] = [];
    try {
      for (const line of lines) {
        try {
          const voiceId = profileMap[line.speaker] ?? 'alloy';
          const res = await api.proxyTts({ input: line.text, voice: voiceId });
          allResults.push({ speaker: line.speaker, text: line.text, audioUrl: res.url });
        } catch (e) {
          allResults.push({ speaker: line.speaker, text: line.text, error: String(e) });
        }
      }
      const audioUrls = allResults.map((r) => r.audioUrl).filter(Boolean) as string[];
      updateNodeData(props.id, {
        status: audioUrls.length > 0 ? 'success' : 'error',
        results: allResults,
        sounds: audioUrls,
        profileMap,
        meta: { total: allResults.length, failed: allResults.filter((r) => r.error).length },
      });
      appendLog(`配音完成 · ${audioUrls.length}/${allResults.length} 段成功`);
    } finally {
      setRunning(false);
    }
  }, [lines, profileMap, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[320px]">
        {speakers.length > 0 && (
          <div className="space-y-1 border border-line rounded-lg p-2">
            <p className="text-[10px] text-ink/50">角色音色映射</p>
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
                  className="flex-1 rounded border border-line px-1 py-0.5 text-[10px] bg-white"
                >
                  <option value="alloy">Alloy（默认）</option>
                  <option value="echo">Echo</option>
                  <option value="fable">Fable</option>
                  <option value="nova">Nova</option>
                  <option value="shimmer">Shimmer</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.voiceId}>
                      {p.name}（角色库）
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
