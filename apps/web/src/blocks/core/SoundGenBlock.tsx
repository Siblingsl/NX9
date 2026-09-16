import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { gatherUpstream, AUDIO_FORMAT_OPTIONS, SPEECH_RATE_OPTIONS, resolveRunLabel, resolveCharacterReferenceAudio, listMergedAudioVoiceOptions } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { GenUpstreamHint } from '../shared/upstream-hints';
import { useUpstreamPrompt } from '../shared/use-upstream-prompt';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { toastError } from '../../stores/toast';
import { runSoundGenCast, synthesizeTts } from '../../engine/sound-gen-runner';
import { useAllAssetLibraryItems } from '../../hooks/use-asset-library-items';
import { MentionEditor } from '../../engine/stage-deck/chrome/MentionEditor';
import { AssetLinkField, assetRefFromData, patchWithAssetRef } from '../shared/AssetLinkField';
import { useCredentialVault } from '../../stores/credential-vault';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import GenSettingsPills from '../shared/GenSettingsPills';

const SOUND_MODES = [
  { id: 'tts', label: '单轨 TTS' },
  { id: 'cast', label: '多角色' },
  { id: 'music', label: 'BGM' },
  { id: 'sfx', label: '音效' },
] as const;

const VoiceCastPanel = lazy(() => import('../nx9/VoiceCastBlock'));

function SoundGenBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const refInputRef = useRef<HTMLInputElement>(null);
  const appendLog = useActivityLog((s) => s.append);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const soundLibrarySounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
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
  const bgmChannel = useCredentialVault((s) => s.settings);
  const bgmReady = Boolean((bgmChannel?.bgmBaseUrl ?? '').trim()) && Boolean((bgmChannel?.bgmApiKey ?? '').trim());

  // 内置音色目录 +「我的连接」：只写入既有 data.voice 字段，缺省仍是 alloy
  const audioVoiceGroups = useMemo(() => {
    const map = new Map<string, ReturnType<typeof listMergedAudioVoiceOptions>>();
    for (const opt of listMergedAudioVoiceOptions(bgmChannel?.connections)) {
      const list = map.get(opt.groupLabel);
      if (list) list.push(opt);
      else map.set(opt.groupLabel, [opt]);
    }
    return [...map.entries()];
  }, [bgmChannel?.connections]);
  const hasCurrentVoiceOption = useMemo(
    () => audioVoiceGroups.some(([, items]) => items.some((o) => o.id === voice)),
    [audioVoiceGroups, voice],
  );
  const [bgmPrompt, setBgmPrompt] = useState('');
  const [bgmBusy, setBgmBusy] = useState(false);
  const [bgmPhase, setBgmPhase] = useState('');
  const [bgmError, setBgmError] = useState('');
  const bgmPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (bgmPollRef.current) clearInterval(bgmPollRef.current);
  }, []);

    const [denoiseBusy, setDenoiseBusy] = useState(false);
  const [denoiseMode, setDenoiseMode] = useState<'afftdn' | 'anlmdn'>('afftdn');
  const [denoiseStrength, setDenoiseStrength] = useState(0.6);
  const [denoiseError, setDenoiseError] = useState('');

  /** 音频降噪：对当前配音产物做 afftdn/anlmdn 处理，成功后替换 audioUrl */
  const handleDenoise = useCallback(async () => {
    const url = (audioUrl ?? '').trim();
    if (!url) {
      setDenoiseError('还没有可降噪的音频：请先生成配音，禁止空成功');
      return;
    }
    setDenoiseBusy(true);
    setDenoiseError('');
    try {
      const res = await api.audioDenoise({ audioUrl: url, strength: denoiseStrength, mode: denoiseMode });
      if (!res.ok || !res.url) {
        const msg = res.message || '降噪失败：服务端未返回结果，禁止空成功';
        setDenoiseError(msg);
        appendLog('音频降噪失败：' + msg);
        return;
      }
      updateNodeData(props.id, { audioUrl: res.url, status: 'success' });
      appendLog('音频降噪完成 · ' + res.mode + ' · 强度 ' + res.strength + ' → ' + res.url);
    } catch (e) {
      const msg = String(e);
      setDenoiseError(msg);
      appendLog('音频降噪失败：' + msg);
    } finally {
      setDenoiseBusy(false);
    }
  }, [appendLog, audioUrl, denoiseMode, denoiseStrength, props.id]);

const generateBgm = useCallback(async () => {
    const prompt = bgmPrompt.trim();
    if (!prompt) {
      setBgmError('请先填写 BGM 描述，禁止空成功');
      return;
    }
    setBgmBusy(true);
    setBgmError('');
    setBgmPhase('提交生成任务…');
    try {
      const { taskId } = await api.submitBgm({ prompt, durationSec: 30 });
      appendLog(`BGM 生成任务已提交：${taskId}`);
      setBgmPhase('生成中…（通常 1-2 分钟）');
      const deadline = Date.now() + 5 * 60_000;
      await new Promise<void>((resolve, reject) => {
        const tick = async () => {
          try {
            const t = await api.getBgmStatus(taskId);
            if (t.status === 'done' && t.url) {
              if (bgmPollRef.current) clearInterval(bgmPollRef.current);
              updateNodeData(props.id, { audioUrl: t.url, status: 'success' });
              appendLog('BGM 生成完成');
              setBgmPhase('');
              setBgmBusy(false);
              resolve();
              return;
            }
            if (t.status === 'done' && !t.url) {
              if (bgmPollRef.current) clearInterval(bgmPollRef.current);
              setBgmPhase('');
              setBgmBusy(false);
              setBgmError('BGM 生成完成但无音频地址，禁止空成功');
              reject(new Error('BGM 生成完成但无音频地址，禁止空成功'));
              return;
            }
            if (t.status === 'error') {
              if (bgmPollRef.current) clearInterval(bgmPollRef.current);
              setBgmPhase('');
              setBgmBusy(false);
              setBgmError(t.error || 'BGM 生成失败，禁止空成功');
              reject(new Error(t.error || 'BGM 生成失败，禁止空成功'));
              return;
            }
            if (Date.now() > deadline) {
              if (bgmPollRef.current) clearInterval(bgmPollRef.current);
              setBgmPhase('');
              setBgmBusy(false);
              setBgmError('BGM 生成超时（5 分钟），请稍后重试');
              reject(new Error('BGM 生成超时'));
              return;
            }
          } catch (e) {
            if (bgmPollRef.current) clearInterval(bgmPollRef.current);
            setBgmPhase('');
            setBgmBusy(false);
            const msg = e instanceof Error ? e.message : String(e);
            setBgmError(msg);
            reject(e);
          }
        };
        void tick();
        bgmPollRef.current = setInterval(() => void tick(), 3000);
      });
    } catch (e) {
      setBgmBusy(false);
      setBgmPhase('');
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('BGM 生成失败') && !msg.includes('超时')) setBgmError(msg);
    }
  }, [bgmPrompt, props.id, updateNodeData, appendLog]);

  const selectedChar = useMemo(
    () => characters.find((c) => c.id === characterId),
    [characters, characterId],
  );
  const luxRef =
    resolveCharacterReferenceAudio(selectedChar, soundLibrarySounds).audioUrl
    || referenceAudioUrl;

  const uploadRefAudio = useCallback(
    async (file: File) => {
      try {
        const res = await api.uploadAsset(file);
        if (!res?.url) throw new Error('参考音频上传失败，禁止空成功');
        updateNodeData(props.id, { referenceAudioUrl: res.url });
        appendLog('参考音频已上传');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '参考音频上传失败，禁止空成功';
        toastError(msg);
        appendLog(msg);
      }
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
    const data = props.data as Record<string, unknown>;
    const policy = data.upstreamPolicy as import('@nx9/shared').UpstreamPolicy | undefined;
    const primarySourceId = data.primarySourceId as string | null | undefined;
    const gathered = gatherUpstream(props.id, flowBlocks, flowLinks, policy, primarySourceId);
    const upstreamText = gathered.prompts.filter(Boolean).join('\n\n');
    const input = upstreamText || text;
    if (!input.trim()) {
      updateNodeData(props.id, { status: 'error', error: '请输入要配音的文本，禁止空成功' });
      return;
    }
    if (provider === 'luxtts' && !luxRef) {
      updateNodeData(props.id, { status: 'error', error: 'LuxTTS 需要参考音频（上传或选角色），禁止空成功' });
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    appendLog(`AI 配音启动 · ${props.id}`);
    try {
      const res = await synthesizeTts({
        input,
        voice,
        provider,
        referenceAudioUrl: luxRef,
        characterId: selectedChar?.id,
        audioFormat,
        speechRate,
        instructions: (props.data?.instructions as string) || undefined,
      });
      if (!res.url?.trim()) {
        throw new Error('TTS 未返回音频 URL，禁止空成功');
      }
      updateNodeData(props.id, {
        status: 'success',
        audioUrl: res.url,
        content: input,
        providerUsed: res.provider,
      });
      appendLog(
        `AI 配音完成 · ${props.id} · ${res.provider ?? 'tts'} · ${Math.round((res.bytes ?? 0) / 1024)}KB`,
      );
    } catch (e) {
      const msg = `AI 配音失败 · ${props.id}：${String(e)}`;
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(msg);
      toastError(msg);
    }
  }, [
    appendLog,
    props.id,
    props.data,
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
          <p className="text-[10px] text-ink/45 bg-surface rounded-lg px-2 py-1">
            {bgmReady
              ? '已配置 BGM 通道：可 AI 生成配乐，或从素材库导入音频。'
              : '未配置 BGM 通道：仅支持导入音频。到 设置→BGM 填 Suno 兼容端点后可 AI 生成。'}
          </p>
          {bgmReady && (
            <div className="space-y-1.5 rounded-lg border border-line bg-surface px-2 py-2">
              <textarea
                value={bgmPrompt}
                onChange={(e) => setBgmPrompt(e.target.value)}
                placeholder="BGM 描述，如：紧张悬疑的都市夜景铺底，电子合成器，无人声"
                rows={2}
                className="w-full resize-none rounded-md border border-line bg-surface px-2 py-1.5 text-[11px] outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={bgmBusy || !bgmPrompt.trim()}
                  onClick={() => void generateBgm()}
                  className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-45"
                >
                  {bgmBusy ? '生成中…' : 'AI 生成'}
                </button>
                {bgmPhase && <span className="text-[10px] text-ink/45">{bgmPhase}</span>}
              </div>
              {bgmError && <p className="text-[10px] text-red-600">{bgmError}</p>}
            </div>
          )}
          <AssetLinkField
            kind="sound"
            assetRef={soundAssetRef}
            onChange={(ref) => {
              const item = ref
                ? allItems.find((i) => i.id === ref.id && i.scope === ref.scope)
                : undefined;
              updateNodeData(props.id, {
                soundAssetRef: ref,
                ...patchWithAssetRef(ref),
                audioUrl: item?.audioUrl ?? '',
                ...(ref ? { status: 'success' } : {}),
              });
            }}
          />
          {audioUrl && (
            <audio src={audioUrl} controls className="w-full" style={{ height: 36 }} />
          )}
          <div className="space-y-1 rounded border border-line/40 bg-surface/60 px-2 py-1.5">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-medium text-ink/70">音频降噪</span>
              <select
                className="rounded border border-line bg-surface px-1 py-0.5 text-[10px]"
                value={denoiseMode}
                onChange={(e) => setDenoiseMode(e.target.value === 'anlmdn' ? 'anlmdn' : 'afftdn')}
                disabled={denoiseBusy}
              >
                <option value="afftdn">afftdn（快）</option>
                <option value="anlmdn">anlmdn（平滑）</option>
              </select>
              <label className="text-[9px] text-ink/45">强度</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={denoiseStrength}
                onChange={(e) => setDenoiseStrength(Number(e.target.value))}
                disabled={denoiseBusy}
                className="w-16 rounded border border-line bg-surface px-1 py-0.5 text-[10px]"
              />
              <button
                type="button"
                className="rounded border border-line bg-surface px-2 py-0.5 text-[10px] disabled:opacity-50"
                onClick={handleDenoise}
                disabled={denoiseBusy || !audioUrl}
                title={!audioUrl ? '请先生成配音' : '对当前配音产物做降噪处理（成功后替换音频）'}
              >
                {denoiseBusy ? '降噪中…' : '降噪'}</button>
            </div>
            {denoiseError && <p className="text-[10px] text-red-600">{denoiseError}</p>}
          </div>
          {(props.data?.error as string) && (
            <p className="text-[10px] text-red-600">{props.data.error as string}</p>
          )}
        </div>
      </BlockShell>
    );
  }

  if (soundMode === 'sfx') {
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
          <p className="text-[10px] text-ink/45 bg-surface rounded-lg px-2 py-1">
            SF-19：从声音库导入音效/环境音，编排时自动挂到「音效」轨。
          </p>
          <AssetLinkField
            kind="sound"
            assetRef={soundAssetRef}
            onChange={(ref) => {
              const item = ref
                ? allItems.find((i) => i.id === ref.id && i.scope === ref.scope)
                : undefined;
              updateNodeData(props.id, {
                soundAssetRef: ref,
                ...patchWithAssetRef(ref),
                audioUrl: item?.audioUrl ?? '',
                soundKind: 'sfx',
                ...(item?.audioUrl ? { status: 'success' } : {}),
              });
            }}
          />
          {audioUrl && (
            <audio src={audioUrl} controls className="w-full" style={{ height: 36 }} />
          )}
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
            className="flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs"
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
              className="flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs"
            >
              {audioVoiceGroups.map(([groupLabel, items]) => (
                <optgroup key={groupLabel} label={groupLabel}>
                  {items.map((o) => (
                    <option key={o.key} value={o.id}>
                      {o.hint ? `${o.label} · ${o.hint}` : o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              {/* 既有节点可能存了目录外音色，保留原值可回显，避免静默改写 */}
              {!hasCurrentVoiceOption && voice && (
                <option value={voice}>{voice}（自定义）</option>
              )}
            </select>
          </label>
        ) : (
          <>
            <select
              value={characterId}
              onChange={(e) => {
                const id = e.target.value;
                const c = characters.find((x) => x.id === id);
                const resolved = resolveCharacterReferenceAudio(c, soundLibrarySounds);
                updateNodeData(props.id, {
                  characterId: id,
                  referenceAudioUrl: resolved.audioUrl ?? '',
                  soundAssetId: resolved.soundAssetId ?? null,
                });
              }}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs"
            >
              <option value="">— 从角色库选择 —</option>
              {characters
                .filter((c) => Boolean(resolveCharacterReferenceAudio(c, soundLibrarySounds).audioUrl))
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
          {resolveRunLabel('sound-gen', status).primary}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(SoundGenBlock);
