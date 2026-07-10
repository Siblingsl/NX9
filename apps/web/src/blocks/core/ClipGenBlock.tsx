import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  CLIP_GEN_ASPECTS,
  CLIP_GEN_MODELS,
  enrichPromptWithCharacters,
  gatherUpstream,
  pickReferenceImage,
  resolveBlockCharacters,
  bridgePromptSuffix,
  validateSClassReferences,
  SCLASS_MAX_REF_IMAGES,
  SCLASS_MAX_REF_VIDEOS,
  VIDEO_RESOLUTION_OPTIONS,
  VIDEO_ORIENTATION_OPTIONS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_SIZE_PRESETS,
  resolveVideoGenParams,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { CharacterBadge, CharacterSelect } from '../shared/CharacterSelect';
import { GenUpstreamHint } from '../shared/upstream-hints';
import { useUpstreamPrompt } from '../shared/use-upstream-prompt';
import { useActivityLog } from '../../stores/activity-log';
import { MentionEditor } from '../../engine/stage-deck/chrome/MentionEditor';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { api } from '../../api/client';
import { pollClipTask } from '../../engine/picture-gen-runner';
import GenSettingsPills from '../shared/GenSettingsPills';

function ClipGenBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const appendLog = useActivityLog((s) => s.append);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const model = (props.data?.model as string) ?? 'veo';
  const aspect = (props.data?.aspect as string) ?? '16:9';
  const durationSec = (props.data?.durationSec as number) ?? 6;
  const resolution = (props.data?.resolution as string) ?? '720';
  const orientation = (props.data?.orientation as string) ?? 'landscape';
  const status = props.data?.status as string | undefined;
  const videoUrl = props.data?.videoUrl as string | undefined;
  const taskId = props.data?.taskId as string | undefined;
  const upstreamPrompt = props.data?.upstreamPrompt as string | undefined;
  const characterId = (props.data?.characterId as string) ?? '';
  const linkedShotId = props.data?.linkedShotId as string | undefined;
  const localContent = (props.data?.content as string) ?? '';
  const { hasUpstream, preview: upstreamPreview } = useUpstreamPrompt(props.id);

  const activeCharacters = useMemo(() => {
    const shot = shots.find((s) => s.id === linkedShotId);
    return resolveBlockCharacters(props.data as Record<string, unknown>, shot, characters);
  }, [props.data, linkedShotId, shots, characters]);

  const upstreamMedia = useMemo(() => {
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
    return gatherUpstream(props.id, flowBlocks, flowLinks);
  }, [props.id, nodes, edges]);

  const imageUrl = pickReferenceImage(activeCharacters, upstreamMedia.pictures);
  const hasAudioUpstream = (upstreamMedia.sounds?.length ?? 0) > 0;
  const refError = validateSClassReferences(
    upstreamMedia.pictures?.length ?? 0,
    upstreamMedia.clips?.length ?? 0,
  );

  const run = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
    appendLog(`视频生成启动 · ${props.id}`);
    try {
      const bridgeRefs: string[] = [];
      const incomingEdges = edges.filter((e) => e.target === props.id);
      for (const e of incomingEdges) {
        const up = nodes.find((n) => n.id === e.source);
        const refs = (up?.data?.bridgeRefs as string[] | undefined);
        if (refs) bridgeRefs.push(...refs);
      }
      const videoParams = resolveVideoGenParams({ resolution, orientation, aspect, durationSec });
      const base =
        upstreamMedia.prompts.filter(Boolean).join('\n\n') ||
        localContent ||
        (props.data?.content as string) ||
        '';
      const bridgeSuffix = bridgePromptSuffix(
        bridgeRefs.length ? [{ bridgePreset: 'dissolve', durationSec: 0.5, refImageIds: bridgeRefs }] : [],
      );
      const prompt = enrichPromptWithCharacters(
        `${base}${bridgeSuffix ? `\n${bridgeSuffix}` : ''}${videoParams.aspect !== '16:9' ? `, aspect ratio ${videoParams.aspect}` : ''}${videoParams.durationSec ? `, ${videoParams.durationSec}s clip` : ''}`.trim(),
        activeCharacters,
      );
      const res = await api.proxyVideo({
        prompt,
        model,
        imageUrl,
        duration: videoParams.durationSec,
        aspect_ratio: videoParams.aspect,
        size: videoParams.size,
        resolution: videoParams.resolution,
      });
      updateNodeData(props.id, {
        status: res.status === 'success' ? 'success' : res.status === 'processing' ? 'running' : 'error',
        videoUrl: res.url,
        taskId: res.taskId,
        message: res.message,
        content: prompt,
        referenceImageUsed: imageUrl,
        characterInjected: activeCharacters.map((c) => c.id),
        lastResult: res,
      });
      appendLog(
        res.status === 'success'
          ? `视频生成完成 · ${props.id}`
          : res.message ?? `视频任务 · ${res.status}`,
      );
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`视频生成失败 · ${String(e)}`);
    }
  }, [
    appendLog,
    model,
    aspect,
    durationSec,
    resolution,
    orientation,
    localContent,
    props.data,
    props.id,
    updateNodeData,
    activeCharacters,
    upstreamMedia,
    imageUrl,
  ]);

  const poll = useCallback(async () => {
    if (!taskId) return;
    updateNodeData(props.id, { status: 'running' });
    try {
      const url = await pollClipTask(taskId);
      if (url) {
        updateNodeData(props.id, { status: 'success', videoUrl: url, message: undefined });
        appendLog('视频轮询完成');
      } else {
        updateNodeData(props.id, { status: 'running', message: '仍在生成中，请稍后再查' });
      }
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [taskId, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-sm">
        <GenUpstreamHint hasUpstream={hasUpstream} />
        {(upstreamPrompt || upstreamPreview) && (
          <p className="text-[10px] text-ink/50 line-clamp-2" title={upstreamPrompt || upstreamPreview}>
            上游: {upstreamPrompt || upstreamPreview}
          </p>
        )}
        {imageUrl && (
          <img src={imageUrl} alt="" className="w-full rounded-lg border border-line max-h-24 object-cover" />
        )}
        {hasAudioUpstream && (
          <p className="text-[10px] text-brand/70">已连接上游音频（合成请用 clip-editor）</p>
        )}
        <MentionEditor
          blockId={props.id}
          value={localContent}
          onChange={(value) => updateNodeData(props.id, { content: value })}
          placeholder="视频 Prompt… 输入 @ 引用上游"
          className="w-full min-h-[64px] rounded-xl border border-line bg-surface px-2 py-1.5 text-sm resize-y focus:outline-none focus:border-brand/40"
        />
          {model === 'seedance' && (
            <div className="rounded-lg bg-surface p-2 space-y-1.5">
              <p className="text-[10px] text-brand font-medium">Seedance 模式</p>
              <label className="flex items-center gap-2 text-[10px]">
                <input
                  type="checkbox"
                  checked={(props.data?.generateAudio as boolean) ?? true}
                  onChange={(e) => updateNodeData(props.id, { generateAudio: e.target.checked })}
                />
                生成音频
              </label>
              <p className="text-[9px] text-ink/40">分镜连续链请使用 motion-story 节点</p>
            </div>
          )}
          <select
            value={model}
            onChange={(e) => updateNodeData(props.id, { model: e.target.value })}
            className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
          >
            {CLIP_GEN_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-ink/40">
            {resolution}p · {orientation === 'landscape' ? '16:9' : orientation === 'portrait' ? '9:16' : '1:1'} · {durationSec}s
          </p>
        <p className="text-[10px] text-ink/40">
          {CLIP_GEN_MODELS.find((m) => m.id === model)?.hint}
        </p>
        <div className="border-t border-line pt-2 mt-2">
          <p className="text-[10px] text-ink/40 mb-1">视频设置</p>
          <GenSettingsPills
            label="清晰度"
            options={VIDEO_RESOLUTION_OPTIONS}
            value={resolution}
            onChange={(v) => updateNodeData(props.id, { resolution: v })}
          />
          <GenSettingsPills
            label="屏幕"
            options={VIDEO_ORIENTATION_OPTIONS}
            value={orientation}
            onChange={(v) => {
              const orientMap: Record<string, string> = { landscape: '16:9', portrait: '9:16', square: '1:1' };
              updateNodeData(props.id, { orientation: v, aspect: orientMap[v] || '16:9' });
            }}
          />
          <div className="flex items-center gap-2 text-[10px] text-ink/40 mt-1">
            <span>{(VIDEO_SIZE_PRESETS as Record<string, Record<string, string>>)[resolution]?.[orientation] || '1280x720'}</span>
            <button
              type="button"
              onClick={() => updateNodeData(props.id, { sizeCustomMode: !(props.data?.sizeCustomMode as boolean) })}
              className="text-brand/60 hover:text-brand underline"
            >
              {(props.data?.sizeCustomMode as boolean) ? '使用预设' : '高级编辑'}
            </button>
          </div>
          {(props.data?.sizeCustomMode as boolean) && (
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={(props.data?.customWidth as number) ?? 1280}
                onChange={(e) => updateNodeData(props.id, { customWidth: Number(e.target.value) || 1280 })}
                className="w-16 rounded border border-line px-1 py-0.5 text-[10px]"
                placeholder="W"
              />
              <span className="text-[10px] text-ink/40">×</span>
              <input
                type="number"
                value={(props.data?.customHeight as number) ?? 720}
                onChange={(e) => updateNodeData(props.id, { customHeight: Number(e.target.value) || 720 })}
                className="w-16 rounded border border-line px-1 py-0.5 text-[10px]"
                placeholder="H"
              />
            </div>
          )}
          <GenSettingsPills
            label="时长"
            options={VIDEO_DURATION_OPTIONS.map((d) => ({ id: String(d), label: `${d}s` }))}
            value={String(durationSec)}
            onChange={(v) => updateNodeData(props.id, { durationSec: Number(v) })}
          />
        </div>
        <p className="text-[10px] text-ink/40">
          {resolution}p · {orientation === 'landscape' ? '16:9' : orientation === 'portrait' ? '9:16' : '1:1'} · {durationSec}s
        </p>
        <CharacterSelect
          characters={characters}
          value={characterId}
          onChange={(id) => updateNodeData(props.id, { characterId: id || undefined })}
        />
        <CharacterBadge names={activeCharacters.map((c) => c.name)} />
        {videoUrl && (
          <video src={videoUrl} controls className="w-full rounded-lg max-h-36" />
        )}
        {refError && (
          <p className="text-[10px] text-red-600 bg-red-50 rounded px-1 py-0.5">{refError}</p>
        )}
        {(props.data?.message as string) && (
          <p className="text-[10px] text-warn">{props.data.message as string}</p>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void run()}
            disabled={status === 'running' || Boolean(refError)}
            className="flex-1 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
          >
            {status === 'running' ? '生成中…' : '运行生成'}
          </button>
          {taskId && !videoUrl && (
            <button
              type="button"
              onClick={() => void poll()}
              className="rounded-xl border border-line px-3 text-xs hover:border-brand/40"
            >
              查询
            </button>
          )}
        </div>
      </div>
    </BlockShell>
  );
}

export default memo(ClipGenBlock);
