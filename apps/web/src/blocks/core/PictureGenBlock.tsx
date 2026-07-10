import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  enrichPromptWithCharacters,
  gatherUpstream,
  lookupPictureModel,
  PICTURE_GEN_MODELS,
  PICTURE_GEN_SIZES,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_ASPECT_OPTIONS,
  resolveImageRequestSize,
  pickReferenceImage,
  resolveBlockCharacters,
  resolvePromptBatch,
  type CharacterProfile,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { EditableImage } from '../shared/EditableImage';
import { ImageEditModal } from '../shared/ImageEditModal';
import { useImageEditProduce } from '../shared/use-image-edit-produce';
import { CharacterBadge, CharacterSelect } from '../shared/CharacterSelect';
import { GenUpstreamHint } from '../shared/upstream-hints';
import { useUpstreamPrompt } from '../shared/use-upstream-prompt';
import { useActivityLog } from '../../stores/activity-log';
import { MentionEditor } from '../../engine/stage-deck/chrome/MentionEditor';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { runPictureGenJob } from '../../engine/picture-gen-runner';
import { api } from '../../api/client';
import GenSettingsPills from '../shared/GenSettingsPills';
import { AssetLinkField, assetRefFromData, patchWithAssetRef } from '../shared/AssetLinkField';

function PictureGenBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const produce = useImageEditProduce(props.id);
  const appendLog = useActivityLog((s) => s.append);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const modelId = (props.data?.model as string) ?? 'dall-e-3';
  const size = (props.data?.size as string) ?? '1024x1024';
  const quality = (props.data?.quality as string) ?? 'auto';
  const aspectRatio = (props.data?.aspectRatio as string) ?? '1:1';
  const imageCount = (props.data?.imageCount as number) ?? 1;
  const customW = (props.data?.width as number) ?? 1024;
  const customH = (props.data?.height as number) ?? 1024;
  const snapToStep = (props.data?.snapToStep as boolean) ?? true;
  const status = props.data?.status as string | undefined;
  const previewUrl = props.data?.previewUrl as string | undefined;
  const previewUrls = (props.data?.previewUrls as string[]) ?? [];
  const upstreamPrompt = props.data?.upstreamPrompt as string | undefined;
  const batchCount = (props.data?.batchCount as number) ?? 0;
  const characterId = (props.data?.characterId as string) ?? '';
  const linkedShotId = props.data?.linkedShotId as string | undefined;
  const localContent = (props.data?.content as string) ?? '';
  const sceneAssetRef = assetRefFromData(
    props.data?.sceneAssetRef
      ? ({ assetRef: props.data.sceneAssetRef } as Record<string, unknown>)
      : (props.data as Record<string, unknown>),
  );
  const characterAssetRef = assetRefFromData(
    props.data?.characterAssetRef
      ? ({ assetRef: props.data.characterAssetRef } as Record<string, unknown>)
      : undefined,
  );
  const { hasUpstream, preview: upstreamPreview } = useUpstreamPrompt(props.id);

  const modelDef = lookupPictureModel(modelId);
  const displayUrls = previewUrls.length > 0 ? previewUrls : previewUrl ? [previewUrl] : [];

  const activeCharacters = useMemo(() => {
    const shot = shots.find((s) => s.id === linkedShotId);
    return resolveBlockCharacters(props.data as Record<string, unknown>, shot, characters);
  }, [props.data, linkedShotId, shots, characters]);

  const run = useCallback(async () => {
    const retryCount = ((props.data?.retryCount as number) ?? 0) + 1;
    updateNodeData(props.id, { status: 'running', retryCount });
    appendLog(`图像生成启动 · ${props.id}`);
    try {
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
      const upstream = gatherUpstream(props.id, flowBlocks, flowLinks);
      const jobs = resolvePromptBatch(
        upstream.prompts,
        upstream.pictures,
        upstream.promptBatch,
        upstreamPrompt || localContent,
        upstream.promptDispatch,
      );
      const composeAction = upstream.promptDispatch?.composeAction ?? 'generate';
      const finalJobs =
        jobs.length > 0
          ? jobs
          : [{ prompt: upstreamPrompt || localContent || 'a beautiful landscape' }];

      const mentionPattern = /@(\S+)/g;
      const mentionNames = new Set<string>();
      for (const m of (upstreamPrompt || localContent).matchAll(mentionPattern)) {
        mentionNames.add(m[1]);
      }
      const mentionedChars: CharacterProfile[] = [];
      for (const name of mentionNames) {
        const found = characters.find((c) => c.name === name);
        if (found && !activeCharacters.some((ac) => ac.id === found.id)) {
          mentionedChars.push(found);
        }
      }
      const allChars = [...activeCharacters, ...mentionedChars];

      const resolvedSize = resolveImageRequestSize({
        quality,
        aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
        width: aspectRatio === 'custom' ? customW : undefined,
        height: aspectRatio === 'custom' ? customH : undefined,
        snapToStep,
      });

      const charRef = pickReferenceImage(allChars, upstream.pictures);
      const urls: string[] = [];
      let lastPrompt = '';
      const count = Math.max(1, Math.min(imageCount, 15));

      for (const job of finalJobs) {
        let content = enrichPromptWithCharacters(job.prompt, allChars);
        lastPrompt = content;
        let refImage = job.imageUrls?.[0] || charRef;

        if (job.imageUrls && job.imageUrls.length >= 2) {
          if (composeAction === 'merge' || composeAction === 'merge-then-generate') {
            const merged = await api.mergeImages({
              imageUrls: job.imageUrls,
              direction: 'horizontal',
            });
            if (composeAction === 'merge') {
              urls.push(merged.url);
              continue;
            }
            refImage = merged.url;
            content = `${content}\n\n[Reference collage: ${job.imageUrls.length} images]`;
          }
        }

        const batchUrls = await runPictureGenJob({
          prompt: content,
          modelId,
          size: resolvedSize.size,
          referenceImageUrl: refImage,
          n: count,
        });
        urls.push(...batchUrls);
      }

      if (urls.length === 0) throw new Error('未返回图像 URL');

      updateNodeData(props.id, {
        status: 'success',
        previewUrls: urls,
        previewUrl: urls[0],
        content: lastPrompt,
        batchCount: urls.length,
        referenceImageUsed: charRef,
        characterInjected: allChars.map((c) => c.id),
        lastResult: { count: urls.length, urls },
      });
      appendLog(urls.length > 1 ? `批量图像生成完成 · ${urls.length} 张` : `图像生成完成 · ${modelDef.label}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`图像生成失败 · ${String(e)}`);
    }
  }, [
    appendLog,
    modelId,
    modelDef.label,
    size,
    quality,
    aspectRatio,
    imageCount,
    customW,
    customH,
    snapToStep,
    upstreamPrompt,
    localContent,
    props.id,
    updateNodeData,
    activeCharacters,
    nodes,
    edges,
  ]);

  const upstreamPictures = useMemo(() => {
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
    return gatherUpstream(props.id, flowBlocks, flowLinks).pictures;
  }, [props.id, nodes, edges]);

  const excludedRefs = (props.data?.excludedRefUrls as string[]) ?? [];
  const filteredUpstream = upstreamPictures.filter((u) => !excludedRefs.includes(u));
  const refPreview = pickReferenceImage(activeCharacters, filteredUpstream);

  return (
    <BlockShell {...props}>
      <div className="space-y-2">
        <GenUpstreamHint hasUpstream={hasUpstream} />
        {(upstreamPrompt || upstreamPreview) && (
          <p className="text-[10px] text-ink/50 line-clamp-2" title={upstreamPrompt || upstreamPreview}>
            上游: {upstreamPrompt || upstreamPreview}
          </p>
        )}
        {filteredUpstream.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {filteredUpstream.map((url) => (
              <div key={url} className="relative group">
                <img src={url} alt="" className="w-10 h-10 rounded object-cover border border-line" />
                <button
                  type="button"
                  onClick={() => updateNodeData(props.id, { excludedRefUrls: [...excludedRefs, url] })}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="排除此参考图"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {excludedRefs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {excludedRefs.map((url) => (
              <div key={url} className="flex items-center gap-0.5 bg-red-50 border border-red-200 rounded px-1 py-0.5">
                <span className="text-[9px] text-red-600">已排除</span>
                <button
                  type="button"
                  onClick={() => updateNodeData(props.id, { excludedRefUrls: excludedRefs.filter((u) => u !== url) })}
                  className="text-red-400 hover:text-red-600 text-[9px]"
                >
                  恢复
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <AssetLinkField
            kind="character"
            assetRef={characterAssetRef}
            onChange={(ref) => updateNodeData(props.id, { characterAssetRef: ref })}
            onInsertMention={(token) =>
              updateNodeData(props.id, { content: `${localContent}${localContent ? ' ' : ''}${token}` })
            }
          />
          <AssetLinkField
            kind="scene"
            assetRef={sceneAssetRef}
            onChange={(ref) => updateNodeData(props.id, { sceneAssetRef: ref })}
            onInsertMention={(token) =>
              updateNodeData(props.id, { content: `${localContent}${localContent ? ' ' : ''}${token}` })
            }
          />
        </div>
        <MentionEditor
          blockId={props.id}
          value={localContent}
          onChange={(value) => updateNodeData(props.id, { content: value })}
          placeholder="Prompt / 补充指令… 输入 @ 引用上游"
          className="w-full min-h-[72px] rounded-xl border border-line bg-surface px-2 py-1.5 text-sm resize-y focus:outline-none focus:border-brand/40"
        />
        {batchCount > 1 && (
          <p className="text-[10px] text-brand/80">将批量生成 {batchCount} 张</p>
        )}
        <CharacterSelect
          characters={characters}
          value={characterId}
          onChange={(id) => updateNodeData(props.id, { characterId: id || undefined })}
        />
        <CharacterBadge names={activeCharacters.map((c) => c.name)} />
        <div className="border-t border-line pt-2 mt-2">
          <p className="text-[10px] text-ink/40 mb-1">生成设置</p>
          <GenSettingsPills
            label="质量"
            options={IMAGE_QUALITY_OPTIONS}
            value={quality}
            onChange={(v) => updateNodeData(props.id, { quality: v })}
          />
          <GenSettingsPills
            label="宽高比"
            options={IMAGE_ASPECT_OPTIONS.slice(0, 5)}
            value={aspectRatio}
            onChange={(v) => updateNodeData(props.id, { aspectRatio: v })}
          />
          <div className="flex flex-wrap gap-1 -mt-1">
            {String(aspectRatio) !== 'custom' && !IMAGE_ASPECT_OPTIONS.slice(0, 5).some((o) => o.id === aspectRatio) ? (
              IMAGE_ASPECT_OPTIONS.slice(5).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateNodeData(props.id, { aspectRatio: opt.id })}
                  className={`nodrag nopan text-[10px] px-2 py-1 rounded-full border transition-colors ${
                    aspectRatio === opt.id ? 'bg-brand/10 text-brand border-brand/30' : 'border-line text-ink/60 hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))
            ) : (
              <button
                type="button"
                onClick={() => updateNodeData(props.id, { aspectRatio: IMAGE_ASPECT_OPTIONS[5].id })}
                className="nodrag nopan text-[10px] px-2 py-1 rounded-full border border-line text-ink/40 hover:text-ink"
              >
                更多▾
              </button>
            )}
            <button
              type="button"
              onClick={() => updateNodeData(props.id, { aspectRatio: 'custom' })}
              className={`nodrag nopan text-[10px] px-2 py-1 rounded-full border transition-colors ${
                aspectRatio === 'custom' ? 'bg-brand/10 text-brand border-brand/30' : 'border-line text-ink/60 hover:text-ink'
              }`}
            >
              自定义
            </button>
          </div>
          {aspectRatio === 'custom' && (
            <div className="flex gap-2 items-center mt-1">
              <input
                type="number"
                value={customW}
                onChange={(e) => updateNodeData(props.id, { width: Number(e.target.value) || 1024 })}
                className="w-16 rounded border border-line px-1 py-0.5 text-[10px]"
                placeholder="W"
              />
              <span className="text-[10px] text-ink/40">×</span>
              <input
                type="number"
                value={customH}
                onChange={(e) => updateNodeData(props.id, { height: Number(e.target.value) || 1024 })}
                className="w-16 rounded border border-line px-1 py-0.5 text-[10px]"
                placeholder="H"
              />
              <label className="flex items-center gap-1 text-[9px] text-ink/40">
                <input
                  type="checkbox"
                  checked={snapToStep}
                  onChange={(e) => updateNodeData(props.id, { snapToStep: e.target.checked })}
                />
                16px 对齐
              </label>
            </div>
          )}
          <GenSettingsPills
            label="张数"
            options={[1, 2, 3, 4].map((n) => ({ id: String(n), label: String(n) }))}
            value={imageCount <= 4 ? String(imageCount) : 'custom'}
            onChange={(v) => updateNodeData(props.id, { imageCount: Number(v) })}
          />
          {imageCount > 4 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-ink/50">自定义</span>
              <input
                type="number"
                min={1}
                max={15}
                value={imageCount}
                onChange={(e) => updateNodeData(props.id, { imageCount: Math.min(15, Math.max(1, Number(e.target.value) || 1)) })}
                className="w-12 rounded border border-line px-1 py-0.5 text-[10px]"
              />
            </div>
          )}
        </div>
        <select
          value={modelId}
          onChange={(e) => updateNodeData(props.id, { model: e.target.value })}
          className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
        >
          {PICTURE_GEN_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-ink/40">
          {(() => {
            const rs = resolveImageRequestSize({
              quality,
              aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
              width: aspectRatio === 'custom' ? customW : undefined,
              height: aspectRatio === 'custom' ? customH : undefined,
              snapToStep,
            });
            return `${quality === 'auto' ? '自动' : quality} · ${aspectRatio} · ${rs.size} · ${imageCount}张`;
          })()}
        </p>
        {displayUrls.length > 0 && (
          <div className="space-y-2">
            {displayUrls.map((url, i) => (
              <EditableImage
                key={`${url}-${i}`}
                src={url}
                className="w-full rounded-lg border border-line object-cover max-h-40"
                onEdit={() => setEditingUrl(url)}
              />
            ))}
          </div>
        )}
        {status === 'error' && (props.data?.retryCount as number) > 1 && (
          <p className="text-[10px] text-warn/70 text-center">已重试 {(props.data as Record<string, unknown>)?.retryCount as number} 次</p>
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running'}
          className="w-full rounded-xl bg-brand text-white text-sm py-2 hover:bg-brand/90 disabled:opacity-50"
        >
          {status === 'running'
            ? '生成中…'
            : batchCount > 1
              ? `运行生成 (${batchCount} 张)`
              : '运行生成'}
        </button>
      </div>

      {editingUrl && (
        <ImageEditModal
          srcUrl={editingUrl}
          onClose={() => setEditingUrl(null)}
          onProduce={produce}
        />
      )}
    </BlockShell>
  );
}

export default memo(PictureGenBlock);
