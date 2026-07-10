import { memo, useCallback, useMemo, useRef } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { gatherUpstream, AUDIO_FORMAT_OPTIONS, SPEECH_RATE_OPTIONS } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { GenUpstreamHint } from '../shared/backlot-template-picker';
import { GenFallbackTemplate } from '../shared/gen-fallback-template';
import { useUpstreamPrompt } from '../shared/use-upstream-prompt';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { MentionEditor } from '../../engine/stage-deck/chrome/MentionEditor';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import GenSettingsPills from '../shared/GenSettingsPills';

const CLOUD_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;

function SoundGenBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const refInputRef = useRef<HTMLInputElement>(null);
  const appendLog = useActivityLog((s) => s.append);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const text = (props.data?.text as string) ?? '';
  const upstreamPrompt = (props.data?.upstreamPrompt as string) ?? '';
  const provider = (props.data?.provider as string) ?? 'cloud';
  const voice = (props.data?.voice as string) ?? 'alloy';
  const audioFormat = (props.data?.audioFormat as string) ?? 'mp3';
  const speechRate = (props.data?.speechRate as number) ?? 1;
  const characterId = (props.data?.characterId as string) ?? '';
  const referenceAudioUrl = (props.data?.referenceAudioUrl as string) ?? '';
  const backlotTemplateId = props.data?.backlotTemplateId as string | undefined;
  const backlotTemplateLabel = props.data?.backlotTemplateLabel as string | undefined;
  const status = props.data?.status as string | undefined;
  const audioUrl = props.data?.audioUrl as string | undefined;
  const { hasUpstream, preview: upstreamPreview } = useUpstreamPrompt(props.id);

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

  return (
    <BlockShell {...props}>
      <div className="space-y-2">
        <p className="text-[10px] text-ink/45 bg-surface rounded-lg px-2 py-1">
          当前为 <strong>AI 配音 (TTS)</strong>。背景音乐 / Suno 音乐生成尚未接入，请用外部工具或后续版本。
        </p>
        <GenUpstreamHint hasUpstream={hasUpstream} />
        {!hasUpstream && (
          <GenFallbackTemplate
            kinds={['hook']}
            hasUpstream={hasUpstream}
            content={text}
            contentKey="text"
            templateId={backlotTemplateId}
            templateLabel={backlotTemplateLabel}
            hint="未连接上游时，可用钩子文案模板填入配音文本。"
            onUpdate={(patch) => updateNodeData(props.id, patch)}
          />
        )}
        {(upstreamPrompt || upstreamPreview) && (
          <p className="text-[10px] text-ink/50 line-clamp-2" title={upstreamPrompt || upstreamPreview}>
            上游: {upstreamPrompt || upstreamPreview}
          </p>
        )}
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
