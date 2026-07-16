import { lazy, memo, Suspense, useCallback, useMemo, useRef } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { gatherUpstream, AUDIO_FORMAT_OPTIONS, SPEECH_RATE_OPTIONS } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { GenUpstreamHint } from '../shared/upstream-hints';
import { useUpstreamPrompt } from '../shared/use-upstream-prompt';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { useAllAssetLibraryItems } from '../../hooks/use-asset-library-items';
import { MentionEditor } from '../../engine/stage-deck/chrome/MentionEditor';
import { AssetLinkField, assetRefFromData, patchWithAssetRef } from '../shared/AssetLinkField';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import GenSettingsPills from '../shared/GenSettingsPills';

const CLOUD_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
const SOUND_MODES = [
  { id: 'tts', label: '单轨 TTS' },
  { id: 'cast', label: '多角色' },
  { id: 'music', label: 'BGM' },
] as const;

const VoiceCastPanel = lazy(() => import('../nx9/VoiceCastBlock'));

function SoundGenBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const refInputRef = useRef<HTMLInputElement>(null);
  const appendLog = useActivityLog((s) => s.append);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const soundMode = (props.data?.soundMode as string) ?? 'tts';
  const text = (props.data?.text as string) ?? '';
  const upstreamPrompt = (props.data?.upstreamPrompt as string) ?? '';
  const provider = (props.data?.provider as string) ?? 'cloud';
  const voice = (props.data?.voice as string) ?? 'alloy';
  const audioFormat = (props.data?.audioFormat as string) ?? 'mp3';
  const speechRate = (props.data?.speechRate as number) ?? 1;
  const characterId = (props.data?.characterId as string) ?? '';
  const referenceAudioUrl = (props.data?.referenceAudioUrl as string) ?? '';
  const soundAssetRef = assetRefFromData(
    props.data?.soundAssetRef
      ? ({ assetRef: props.data.soundAssetRef } as Record<string, unknown>)
      : (props.data as Record<string, unknown>),
  );
  const status = props.data?.status as string | undefined;
  const audioUrl = props.data?.audioUrl as string | undefined;
  const { hasUpstream, preview: upstreamPreview } = useUpstreamPrompt(props.id);

  const { allItems } = useAllAssetLibraryItems('sound');
  const selectedChar = useMemo(
    () => characters.find((c) => c.id === characterId),
    [characters, characterId],
  );
  const luxRef = selectedChar?.referenceAudioUrl || referenceAudioUrl;

  const uploadRefAudio = useCallback(
    async (file: File) => {
      const res = await api.uploadAsset(file);
      updateNodeData(props.id, { referenceAudioUrl: res.url });
      appendLog('参考音频已上传');
    },
    [props.id, updateNodeData, appendLog],
  );

  const run = useCallback(async () => {
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
    const gathered = gatherUpstream(props.id, flowBlocks, flowLinks);
    const upstreamText = gathered.prompts.filter(Boolean).join('\n\n');
    const input = upstreamText || text;
    if (!input.trim()) {
      updateNodeData(props.id, { status: 'error', error: '请输入要配音的文本' });
      return;
    }
    if (provider === 'luxtts' && !luxRef) {
      updateNodeData(props.id, { status: 'error', error: 'LuxTTS 需要参考音频（上传或选角色）' });
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    appendLog(`AI 配音启动 · ${props.id}`);
    try {
      const res = await api.proxyTts({
        input,
        voice: provider === 'luxtts' ? `luxtts:${luxRef}` : voice,
        useLuxTts: provider === 'luxtts',
        referenceAudioUrl: provider === 'luxtts' ? luxRef : undefined,
        luxTtsProfileId: selectedChar?.id,
        response_format: audioFormat,
        speed: speechRate,
      });
      updateNodeData(props.id, {
        status: 'done',
        audioUrl: res.url,
        content: input,
        providerUsed: res.provider,
      });
      appendLog(
        `AI 配音完成 · ${props.id} · ${res.provider ?? 'tts'} · ${Math.round(res.bytes / 1024)}KB`,
      );
      if (res.fallback?.reason) {
        appendLog(`TTS 保底：${res.fallback.reason}`);
      }
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`AI 配音失败 · ${props.id}`);
    }
  }, [
    appendLog,
    props.id,
    text,
    provider,
    voice,
    audioFormat,
    speechRate,
    luxRef,
    selectedChar?.id,
    nodes,
    edges,
    updateNodeData,
  ]);

  if (soundMode === 'cast') {
    return (
      <BlockShell {...props}>
        <div className="space-y-2 nodrag nopan">
          <div className="flex gap-1">
            {SOUND_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => updateNodeData(props.id, { soundMode: m.id })}
                className={`flex-1 py-1 rounded-lg text-[10px] border ${
                  soundMode === m.id ? 'border-brand bg-brand/10 text-brand' : 'border-line text-ink/50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Suspense fallback={<p className="text-xs text-ink/40 py-3 text-center">加载多角色配音…</p>}>
            <VoiceCastPanel
              {...props}
              data={{ ...(props.data ?? {}), studioEmbed: true, soundMode: 'cast' }}
            />
          </Suspense>
        </div>
      </BlockShell>
    );
  }

  if (soundMode === 'music') {
    return (
      <BlockShell {...props}>
        <div className="space-y-2 nodrag nopan text-xs">
          <div className="flex gap-1">
            {SOUND_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => updateNodeData(props.id, { soundMode: m.id })}
                className={`flex-1 py-1 rounded-lg text-[10px] border ${
                  soundMode === m.id ? 'border-brand bg-brand/10 text-brand' : 'border-line text-ink/50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <textarea
            value={(props.data?.content as string) ?? ''}
            onChange={(e) => updateNodeData(props.id, { content: e.target.value })}
            placeholder="BGM 情绪 / 风格描述…"
            rows={3}
            className="w-full rounded-lg border border-line px-2 py-1 resize-y"
          />
          <p className="text-[10px] text-ink/45">BGM 需接入专用音乐 API（Suno / Udio 等），当前为占位模式。</p>
          <button type="button" disabled className="w-full rounded-xl bg-gray-400 text-white py-1.5 cursor-not-allowed">
            BGM 生成（开发中）
          </button>
        </div>
      </BlockShell>
    );
  }

  return (
    <BlockShell {...props}>
      <div className="space-y-2">
        <div className="flex gap-1">
          {SOUND_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => updateNodeData(props.id, { soundMode: m.id })}
              className={`flex-1 py-1 rounded-lg text-[10px] border ${
                soundMode === m.id ? 'border-brand bg-brand/10 text-brand' : 'border-line text-ink/50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-ink/45 bg-surface rounded-lg px-2 py-1">
          单轨 <strong>AI 配音 (TTS)</strong>。多角色对白请切到「多角色」。
        </p>
        <GenUpstreamHint hasUpstream={hasUpstream} />
        {(upstreamPrompt || upstreamPreview) && (
          <p className="text-[10px] text-ink/50 line-clamp-2" title={upstreamPrompt || upstreamPreview}>
            上游: {upstreamPrompt || upstreamPreview}
          </p>
        )}
        <AssetLinkField
          kind="sound"
          assetRef={soundAssetRef}
          onChange={(ref) => {
            const patch: Record<string, unknown> = { soundAssetRef: ref, ...patchWithAssetRef(ref) };
            if (ref) {
              const item = allItems.find((i) => i.id === ref.id && i.scope === ref.scope);
              if (item?.audioUrl) patch.referenceAudioUrl = item.audioUrl;
            }
            updateNodeData(props.id, patch);
          }}
          onInsertMention={(token) =>
            updateNodeData(props.id, { text: `${text}${text ? ' ' : ''}${token}` })
          }
        />
        <MentionEditor
          blockId={props.id}
          value={text}
          onChange={(value) => updateNodeData(props.id, { text: value })}
          placeholder={
            upstreamPrompt || upstreamPreview
              ? '（上游文本优先；本地可补充）'
              : '配音文本… 输入 @ 引用上游'
          }
          className="w-full min-h-[64px] rounded-xl border border-line bg-surface px-2 py-1.5 text-sm resize-y focus:outline-none focus:border-brand/40"
        />
        <textarea
          value={(props.data?.instructions as string) ?? ''}
          onChange={(e) => updateNodeData(props.id, { instructions: e.target.value })}
          placeholder="声音指令（情绪/语调/语速变化等）…"
          className="w-full rounded-lg border border-line px-2 py-1.5 text-[10px] resize-y"
          rows={2}
        />
        <label className="flex items-center gap-2 text-xs text-ink/70">
          引擎
          <select
            value={provider}
            onChange={(e) => updateNodeData(props.id, { provider: e.target.value })}
            className="flex-1 rounded-lg border border-line bg-white px-2 py-1 text-xs"
          >
            <option value="cloud">云端 TTS</option>
            <option value="luxtts">LuxTTS 声线克隆</option>
          </select>
        </label>
        <GenSettingsPills
          label="格式"
          options={AUDIO_FORMAT_OPTIONS}
          value={audioFormat}
          onChange={(v) => updateNodeData(props.id, { audioFormat: v })}
        />
        <GenSettingsPills
          label="语速"
          options={[...SPEECH_RATE_OPTIONS, { id: 'custom', label: '自定义' }]}
          value={SPEECH_RATE_OPTIONS.some((o) => Number(o.id) === speechRate) ? String(speechRate) : 'custom'}
          onChange={(v) => updateNodeData(props.id, { speechRate: v === 'custom' ? 1 : Number(v) })}
        />
        {!SPEECH_RATE_OPTIONS.some((o) => Number(o.id) === speechRate) && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ink/50">自定义</span>
            <input
              type="range"
              min={0.25}
              max={4}
              step={0.05}
              value={speechRate}
              onChange={(e) => updateNodeData(props.id, { speechRate: Number(e.target.value) })}
              className="flex-1 accent-brand"
            />
            <span className="text-[10px] font-mono text-ink/60 w-8 text-right">{speechRate.toFixed(2)}x</span>
          </div>
        )}
        {provider === 'luxtts' && !['mp3', 'wav'].includes(audioFormat) && (
          <p className="text-[10px] text-warn">LuxTTS 可能不支持 {audioFormat.toUpperCase()} 格式，建议用 MP3 或 WAV</p>
        )}
        {provider === 'cloud' ? (
          <label className="flex items-center gap-2 text-xs text-ink/70">
            音色
            <select
              value={voice}
              onChange={(e) => updateNodeData(props.id, { voice: e.target.value })}
              className="flex-1 rounded-lg border border-line bg-white px-2 py-1 text-xs"
            >
              {CLOUD_VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <select
              value={characterId}
              onChange={(e) => {
                const id = e.target.value;
                const c = characters.find((x) => x.id === id);
                updateNodeData(props.id, {
                  characterId: id,
                  referenceAudioUrl: c?.referenceAudioUrl ?? '',
                });
              }}
              className="w-full rounded-lg border border-line bg-white px-2 py-1 text-xs"
            >
              <option value="">— 从角色库选择 —</option>
              {characters
                .filter((c) => c.referenceAudioUrl)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <input
              ref={refInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadRefAudio(f);
              }}
            />
            <button
              type="button"
              onClick={() => refInputRef.current?.click()}
              className="w-full rounded-lg border border-dashed border-line py-2 text-[10px] hover:border-brand/40"
            >
              {luxRef ? '更换参考音频' : '上传参考音频 (≥3s)'}
            </button>
            {luxRef && (
              <audio controls src={luxRef} className="w-full" style={{ height: 32 }} />
            )}
          </>
        )}
        {audioUrl && (
          <audio controls src={audioUrl} className="w-full" style={{ height: 36 }}>
            您的浏览器不支持音频播放。
          </audio>
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running'}
          className="w-full rounded-xl bg-accent text-white text-sm py-2 hover:bg-accent/90 disabled:opacity-50"
        >
          {status === 'running' ? '配音中…' : '生成配音'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(SoundGenBlock);
