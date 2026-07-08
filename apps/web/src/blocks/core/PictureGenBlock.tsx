import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  enrichPromptWithCharacters,
  gatherUpstream,
  lookupPictureModel,
  PICTURE_GEN_MODELS,
  PICTURE_GEN_SIZES,
  pickReferenceImage,
  resolveBlockCharacters,
  resolvePromptBatch,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { EditableImage } from '../shared/EditableImage';
import { ImageEditModal } from '../shared/ImageEditModal';
import { useImageEditProduce } from '../shared/use-image-edit-produce';
import { CharacterBadge, CharacterSelect } from '../shared/CharacterSelect';
import { GenUpstreamHint } from '../shared/backlot-template-picker';
import { GenFallbackTemplate } from '../shared/gen-fallback-template';
import { useUpstreamPrompt } from '../shared/use-upstream-prompt';
import { useActivityLog } from '../../stores/activity-log';
import { MentionEditor } from '../../engine/stage-deck/chrome/MentionEditor';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { runPictureGenJob } from '../../engine/picture-gen-runner';
import { api } from '../../api/client';

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
  const status = props.data?.status as string | undefined;
  const previewUrl = props.data?.previewUrl as string | undefined;
  const previewUrls = (props.data?.previewUrls as string[]) ?? [];
  const upstreamPrompt = props.data?.upstreamPrompt as string | undefined;
  const batchCount = (props.data?.batchCount as number) ?? 0;
  const characterId = (props.data?.characterId as string) ?? '';
  const linkedShotId = props.data?.linkedShotId as string | undefined;
  const localContent = (props.data?.content as string) ?? '';
  const backlotTemplateId = props.data?.backlotTemplateId as string | undefined;
  const backlotTemplateLabel = props.data?.backlotTemplateLabel as string | undefined;
  const { hasUpstream, preview: upstreamPreview } = useUpstreamPrompt(props.id);

  const modelDef = lookupPictureModel(modelId);
  const displayUrls = previewUrls.length > 0 ? previewUrls : previewUrl ? [previewUrl] : [];

  const activeCharacters = useMemo(() => {
    const shot = shots.find((s) => s.id === linkedShotId);
    return resolveBlockCharacters(props.data as Record<string, unknown>, shot, characters);
  }, [props.data, linkedShotId, shots, characters]);

  const run = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
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

      const charRef = pickReferenceImage(activeCharacters, upstream.pictures);
      const urls: string[] = [];
      let lastPrompt = '';

      for (const job of finalJobs) {
        let content = enrichPromptWithCharacters(job.prompt, activeCharacters);
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

        const url = await runPictureGenJob({
          prompt: content,
          modelId,
          size,
          referenceImageUrl: refImage,
        });
        urls.push(url);
      }

      if (urls.length === 0) throw new Error('未返回图像 URL');

      updateNodeData(props.id, {
        status: 'success',
        previewUrls: urls,
        previewUrl: urls[0],
        content: lastPrompt,
        batchCount: urls.length,
        referenceImageUsed: charRef,
        characterInjected: activeCharacters.map((c) => c.id),
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

  const refPreview = pickReferenceImage(activeCharacters, upstreamPictures);

  return (
    <BlockShell {...props}>
      <div className="space-y-2">
        <GenUpstreamHint hasUpstream={hasUpstream} />
        {!hasUpstream && (
          <GenFallbackTemplate
            kinds={['scene', 'emotion']}
            hasUpstream={hasUpstream}
            content={localContent}
            templateId={backlotTemplateId}
            templateLabel={backlotTemplateLabel}
            hint="未连接提示词上游时，可用场景/情绪模板作为兜底文案。"
            onUpdate={(patch) => updateNodeData(props.id, patch)}
          />
        )}
        {(upstreamPrompt || upstreamPreview) && (
          <p className="text-[10px] text-ink/50 line-clamp-2" title={upstreamPrompt || upstreamPreview}>
            上游: {upstreamPrompt || upstreamPreview}
          </p>
        )}
        {refPreview && (
          <div className="flex gap-2 items-center">
            <img src={refPreview} alt="" className="w-10 h-10 rounded object-cover border border-line" />
            <p className="text-[10px] text-ink/50 flex-1 truncate">
              参考图{modelDef.supportsReference ? '（图生图）' : '（注入 prompt 上下文）'}
            </p>
          </div>
        )}
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
        {modelDef.provider === 'openai' && (
          <select
            value={size}
            onChange={(e) => updateNodeData(props.id, { size: e.target.value })}
            className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
          >
            {PICTURE_GEN_SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
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
