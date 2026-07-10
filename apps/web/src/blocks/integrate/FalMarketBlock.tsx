import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { FAL_MODELS, lookupPictureModel, mergeUpstreamPrompt } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { runPictureGenJob } from '../../engine/picture-gen-runner';
import { pollVideoUntilDone } from '../../engine/poll-task';
import { useActivityLog } from '../../stores/activity-log';

function FalMarketBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as {
    prompts?: string[];
    pictures?: string[];
  } | undefined;
  const modelId = (props.data?.falModel as string) ?? FAL_MODELS[0].id;
  const localPrompt = (props.data?.content as string) ?? '';
  const imageUrl = upstream?.pictures?.[0] || (props.data?.imageUrl as string);
  const prompt = mergeUpstreamPrompt(
    { prompts: upstream?.prompts ?? [], pictures: [], clips: [], sounds: [] },
    localPrompt,
  );
  const outputUrl = (props.data?.previewUrl as string) || (props.data?.outputUrl as string);
  const status = props.data?.status as string | undefined;
  const modelDef = FAL_MODELS.find((m) => m.id === modelId) ?? FAL_MODELS[0];
  const pictureModel = lookupPictureModel(modelId);

  const run = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
    try {
      let resultUrl: string | undefined;
      if (pictureModel) {
        const urls = await runPictureGenJob({
          prompt,
          modelId,
          referenceImageUrl: pictureModel.supportsReference ? imageUrl : undefined,
        });
        resultUrl = urls[0];
      } else {
        const input: Record<string, unknown> = {};
        if (modelDef.needsPrompt && prompt.trim()) input.prompt = prompt.trim();
        if (modelDef.needsImage && imageUrl) input.image_url = imageUrl;
        if (modelDef.needsPrompt && !input.prompt && !modelDef.needsImage) {
          throw new Error('需要提示词');
        }
        if (modelDef.needsImage && !input.image_url) {
          throw new Error('需要输入图片');
        }

        const res = await api.proxyFal({ model: modelId, input });
        if (res.taskId) {
          resultUrl = await pollVideoUntilDone(res.taskId);
        } else {
          resultUrl = res.url;
        }
        if (!resultUrl) throw new Error('Fal 未返回结果');
      }
      updateNodeData(props.id, {
        status: 'success',
        previewUrl: resultUrl,
        outputUrl: resultUrl,
        falOutput: resultUrl,
      });
      appendLog(`FAL 完成 · ${modelDef.label}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`FAL 失败: ${String(e)}`);
    }
  }, [modelId, modelDef, pictureModel, prompt, imageUrl, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-xs">
        <select
          value={modelId}
          onChange={(e) => updateNodeData(props.id, { falModel: e.target.value })}
          className="w-full rounded-lg border border-line bg-white px-2 py-1.5"
        >
          {FAL_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="text-ink/50">{modelDef.hint}</p>
        {modelDef.needsPrompt && (
          <textarea
            value={localPrompt}
            onChange={(e) => updateNodeData(props.id, { content: e.target.value })}
            placeholder="补充 prompt…"
            className="w-full min-h-[56px] rounded-lg border border-line px-2 py-1.5 resize-y"
          />
        )}
        {outputUrl && (
          <img src={outputUrl} alt="" className="w-full rounded-lg border border-line max-h-32 object-cover" />
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running'}
          className="w-full rounded-xl bg-brand text-white py-2 disabled:opacity-50"
        >
          {status === 'running' ? 'Fal 运行中…' : '运行 Fal 模型'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(FalMarketBlock);
