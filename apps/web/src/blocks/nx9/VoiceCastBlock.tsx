import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  AUDIO_VOICES,
  gatherUpstream,
  resolveCharacterReferenceAudio,
  resolveVoiceCastLines,
  type UpstreamPolicy,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { runSoundGenCast } from '../../engine/sound-gen-runner';
import {
  buildSpeakerVoiceMapFromCharacters,
  mergeSpeakerVoiceMap,
  stripSpeakerVoiceMapForCharacters,
} from '../../engine/character-voice-binding';

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

  /**
   * 角色 ↔ 声线档案绑定下沉：把 `CharacterProfile.voiceProfileId` 解析出的引擎音色
   * **只补空位**地写入既有 `data.profileMap`（用户手选优先，可重复点击；幂等由纯函数保证）。
   */
  const applyAutoVoiceProfiles = useCallback(() => {
    const incoming = buildSpeakerVoiceMapFromCharacters(characters, speakers, profiles);
    const { map, added, kept, pruned } = mergeSpeakerVoiceMap(profileMap, incoming, speakers);
    if (added.length === 0 && pruned.length === 0) {
      const msg =
        speakers.length === 0
          ? '配音：无可解析的对白说话人'
          : Object.keys(incoming).length === 0
            ? '角色均未绑定声线档案：请先在素材库角色详情「声音与服装」绑定声线档案'
            : '音色映射无需变更：已全部手选或已匹配';
      appendLog(msg);
      return;
    }
    setProfileMap(map);
    updateNodeData(props.id, { profileMap: map });
    appendLog(
      `已按角色声线档案匹配音色 ${added.length} 处` +
        (kept.length > 0 ? `（保留手选 ${kept.length} 处）` : '') +
        (pruned.length > 0 ? `（清理失效 ${pruned.length} 处）` : ''),
    );
  }, [appendLog, characters, profileMap, profiles, props.id, speakers, updateNodeData]);

  /** 上一步的逆运算：只清除「与角色当前绑定音色相同」的条目，手选其他音色的不动。 */
  const clearAutoVoiceProfiles = useCallback(() => {
    const { map, removed } = stripSpeakerVoiceMapForCharacters(
      profileMap,
      characters,
      speakers,
      profiles,
    );
    if (removed.length === 0) {
      appendLog('没有可清除的「按角色声线档案自动匹配」条目');
      return;
    }
    setProfileMap(map);
    updateNodeData(props.id, { profileMap: map });
    appendLog(`已清除自动匹配音色 ${removed.length} 处`);
  }, [appendLog, characters, profileMap, profiles, props.id, speakers, updateNodeData]);

  const run = useCallback(async () => {
    if (lines.length === 0) {
      const msg = '配音：无可解析的对白，禁止空成功';
      updateNodeData(props.id, { status: 'error', error: msg });
      appendLog(msg);
      return;
    }
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
      // SF-03: 写回 voice.lines，供剪辑台 buildVoiceDramaTimeline 挂轨
      const store = useWorkspaceDocument.getState();
      const existing = store.voice.lines;
      const toAdd: import('@nx9/shared').VoiceLine[] = [];
      for (let i = 0; i < nextResults.length; i++) {
        const r = nextResults[i]!;
        if (!r.audioUrl) continue;
        const shotId = r.shotId ?? lines[i]?.shotId ?? null;
        const hit = existing.find(
          (l) =>
            l.text === r.text &&
            l.speaker === r.speaker &&
            (shotId ? l.shotId === shotId : true),
        );
        if (hit) {
          store.updateVoiceLine(hit.id, {
            audioAssetId: r.audioUrl,
            status: 'ready',
            shotId: shotId ?? hit.shotId,
            durationSec: r.durationSec ?? hit.durationSec,
          });
        } else {
          toAdd.push({
            id: `vl-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            shotId,
            speaker: r.speaker,
            text: r.text,
            audioAssetId: r.audioUrl,
            durationSec: r.durationSec ?? null,
            status: 'ready',
          });
        }
      }
      if (toAdd.length > 0) store.addVoiceLines(toAdd);
      appendLog(
        `配音完成 · ${audioUrls.length}/${nextResults.length} 段成功 · 对白来自${LINE_SOURCE_LABEL[lineSource]}` +
          (toAdd.length || existing.length ? ' · 已同步对白轨' : ''),
      );
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
                  {/* 内置音色目录：id 与既有云端音色一致，仅补中文标签 */}
                  {AUDIO_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
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
            <div className="flex gap-1 pt-1">
              <button
                type="button"
                onClick={applyAutoVoiceProfiles}
                title="按「素材库角色详情 → 声音与服装 → 声线档案」的绑定，只补未手选的说话人；可重复点击"
                className="flex-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink/70 hover:border-brand/40"
              >
                按声线档案匹配
              </button>
              <button
                type="button"
                onClick={clearAutoVoiceProfiles}
                title="只清除与角色当前绑定音色相同的条目；手选其他音色的保持不变"
                className="flex-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink/55 hover:border-brand/40"
              >
                清除自动匹配
              </button>
            </div>
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
