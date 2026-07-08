import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';

const CLOUD_VOICES = ['alloy', 'echo', 'fable', 'nova', 'shimmer'] as const;

function PhotoSpeakBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const upstream = props.data?.upstream as {
    pictures?: string[];
    prompts?: string[];
    sounds?: string[];
  } | undefined;
  const imageUrl =
    upstream?.pictures?.[0] || (props.data?.imageUrl as string) || (props.data?.assetUrl as string);
  const text =
    upstream?.prompts?.join('\n') || (props.data?.content as string) || (props.data?.script as string) || '';
  const voiceMode = (props.data?.voiceMode as string) ?? 'cloud';
  const voice = (props.data?.voice as string) ?? 'alloy';
  const characterId = (props.data?.characterId as string) ?? '';
  const referenceAudioUrl = (props.data?.referenceAudioUrl as string) ?? '';
  const videoUrl = props.data?.videoUrl as string | undefined;
  const audioUrl = props.data?.audioUrl as string | undefined;
  const status = props.data?.status as string | undefined;

  const selectedChar = useMemo(
    () => characters.find((c) => c.id === characterId),
    [characters, characterId],
  );
  const luxRef = selectedChar?.referenceAudioUrl || referenceAudioUrl;

  const run = useCallback(async () => {
    if (!imageUrl) {
      appendLog('照片说话：请连接图片或上传素材');
      return;
    }
    if (!text.trim()) {
      appendLog('照片说话：请输入口播文案');
      return;
    }
    if (voiceMode === 'luxtts' && !luxRef) {
      appendLog('照片说话：LuxTTS 模式需要角色参考音或参考音频 URL');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.photoSpeak({
        imageUrl,
        text: text.trim(),
        voice: voiceMode === 'luxtts' ? `luxtts:${luxRef}` : voice,
        useLuxTts: voiceMode === 'luxtts',
        referenceAudioUrl: voiceMode === 'luxtts' ? luxRef : undefined,
        characterId: selectedChar?.id,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? '生成失败');
      updateNodeData(props.id, {
        status: 'success',
        videoUrl: res.url,
        audioUrl: res.audioUrl,
        previewUrl: imageUrl,
        content: text,
      });
      appendLog('照片说话视频已生成');
      if (res.ttsFallback?.reason) {
        appendLog(`TTS 保底：${res.ttsFallback.reason}`);
      }
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`照片说话失败: ${String(e)}`);
    }
  }, [
    imageUrl,
    text,
    voiceMode,
    voice,
    luxRef,
    selectedChar?.id,
    props.id,
    updateNodeData,
    appendLog,
  ]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        {imageUrl && (
          <img src={imageUrl} alt="" className="w-full rounded-xl border border-line max-h-28 object-cover" />
        )}
        <textarea
          value={text}
          onChange={(e) => updateNodeData(props.id, { content: e.target.value, script: e.target.value })}
          placeholder="口播文案…"
          className="w-full min-h-[64px] rounded-xl border border-line px-2 py-1.5"
        />
        <label className="text-ink/60 block">
          配音引擎
          <select
            value={voiceMode}
            onChange={(e) => updateNodeData(props.id, { voiceMode: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-line px-2 py-1 bg-white"
          >
            <option value="cloud">云端 TTS</option>
            <option value="luxtts">LuxTTS 本地克隆</option>
          </select>
        </label>
        {voiceMode === 'cloud' ? (
          <label className="text-ink/60 block">
            云端音色
            <select
              value={voice}
              onChange={(e) => updateNodeData(props.id, { voice: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-line px-2 py-1 bg-white"
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
            <label className="text-ink/60 block">
              角色（角色库参考音）
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
                className="mt-0.5 w-full rounded-lg border border-line px-2 py-1 bg-white"
              >
                <option value="">— 选手动参考音 —</option>
                {characters
                  .filter((c) => c.referenceAudioUrl)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <input
              value={referenceAudioUrl}
              onChange={(e) => updateNodeData(props.id, { referenceAudioUrl: e.target.value })}
              placeholder="/media/uploads/ref.wav"
              className="w-full rounded-lg border border-line px-2 py-1 font-mono text-[10px]"
            />
          </>
        )}
        {videoUrl && (
          <video src={videoUrl} controls className="w-full rounded-xl border border-line max-h-32" playsInline />
        )}
        {audioUrl && !videoUrl && <audio src={audioUrl} controls className="w-full" />}
        <button
          type="button"
          disabled={status === 'running'}
          onClick={() => void run()}
          className="w-full rounded-xl bg-accent text-white py-2 disabled:opacity-50"
        >
          {status === 'running' ? '合成中…' : '生成口播视频'}
        </button>
        <p className="text-[10px] text-ink/40 leading-relaxed">
          本地 FFmpeg + TTS；LuxTTS 模式需先启动旁路服务。非实时唇形同步。
        </p>
      </div>
    </BlockShell>
  );
}

export default memo(PhotoSpeakBlock);
