import { memo, useCallback, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { api } from '../../api/client';

const WORKFLOW_TEMPLATES: { id: string; label: string; description: string; workflow: Record<string, unknown> }[] = [
  {
    id: 'txt2img',
    label: '文生图 (SDXL)',
    description: '标准文本到图像',
    workflow: {
      '3': { class_type: 'KSampler', inputs: { seed: 0, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
      '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
      '6': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
      '7': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
      '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI', images: ['8', 0] } },
    },
  },
  {
    id: 'img2img',
    label: '图生图',
    description: '参考图+prompt 生成',
    workflow: {
      '3': { class_type: 'KSampler', inputs: { seed: 0, steps: 30, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 0.75, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['10', 0] } },
      '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
      '6': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
      '7': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
      '10': { class_type: 'VAEEncode', inputs: { pixels: ['11', 0], vae: ['4', 2] } },
      '11': { class_type: 'LoadImage', inputs: { image: '' } },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
      '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI', images: ['8', 0] } },
    },
  },
  {
    id: 'line-art',
    label: '线稿上色',
    description: '线稿+提示词→彩色',
    workflow: {
      '3': { class_type: 'KSampler', inputs: { seed: 0, steps: 25, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
      '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
      '6': { class_type: 'CLIPTextEncode', inputs: { text: 'line art, detailed, vibrant colors', clip: ['4', 1] } },
      '7': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
      '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI', images: ['8', 0] } },
    },
  },
];

function ComfyWorkflowBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const workflowText = (props.data?.workflowText as string) ?? '';
  const baseUrl = (props.data?.baseUrl as string) ?? '';
  const prompt = (props.data?.content as string) ?? '';
  const steps = (props.data?.steps as number) ?? 20;
  const cfgScale = (props.data?.cfgScale as number) ?? 7;
  const resultUrl = props.data?.previewUrl as string | undefined;
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const applyTemplate = useCallback((templateId: string) => {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    updateNodeData(props.id, { workflowText: JSON.stringify(tpl.workflow, null, 2) });
    setSelectedTemplate(templateId);
    appendLog(`Comfy: 已加载模板「${tpl.label}」`);
  }, [props.id, updateNodeData, appendLog]);

  const run = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
    try {
      let workflow: Record<string, unknown>;
      try {
        workflow = JSON.parse(workflowText);
      } catch {
        updateNodeData(props.id, { status: 'error', error: 'Workflow JSON 解析失败' });
        appendLog('Comfy 工作流：JSON 解析失败');
        return;
      }
      const res = await api.proxyComfy({
        workflow,
        baseUrl: baseUrl || undefined,
        prompt: (prompt || '').trim() || undefined,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? 'Comfy 运行失败');
      updateNodeData(props.id, { status: 'success', previewUrl: res.url });
      appendLog(`Comfy 工作流完成 · ${res.url}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`Comfy 工作流失败: ${String(e)}`);
    }
  }, [workflowText, baseUrl, prompt, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[300px]">
        <p className="text-[10px] text-ink/45">
          选择常用模板或粘贴 ComfyUI Workflow JSON 提交运行
        </p>

        {/* Template dropdown */}
        <select
          value={selectedTemplate}
          onChange={(e) => applyTemplate(e.target.value)}
          className="w-full rounded-lg border border-line px-2 py-1.5 text-xs"
        >
          <option value="">— 选择模板 —</option>
          {WORKFLOW_TEMPLATES.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>{tpl.label}</option>
          ))}
        </select>

        {/* Key param form fields */}
        <div className="flex gap-2">
          <label className="flex-1 text-[10px] text-ink/50">
            Steps
            <input
              type="number" min={1} max={100}
              value={steps}
              onChange={(e) => updateNodeData(props.id, { steps: Number(e.target.value) })}
              className="w-full rounded border border-line px-1.5 py-1 text-[10px]"
            />
          </label>
          <label className="flex-1 text-[10px] text-ink/50">
            CFG Scale
            <input
              type="number" min={1} max={30} step={0.5}
              value={cfgScale}
              onChange={(e) => updateNodeData(props.id, { cfgScale: Number(e.target.value) })}
              className="w-full rounded border border-line px-1.5 py-1 text-[10px]"
            />
          </label>
        </div>

        <textarea
          value={workflowText}
          onChange={(e) => { updateNodeData(props.id, { workflowText: e.target.value }); setSelectedTemplate(''); }}
          placeholder="Workflow JSON…"
          rows={5}
          className="w-full rounded-lg border border-line px-2 py-1 font-mono text-[10px] resize-y"
        />
        <input
          value={baseUrl}
          onChange={(e) => updateNodeData(props.id, { baseUrl: e.target.value })}
          placeholder="ComfyUI Base URL（可选，留空用设置）"
          className="w-full rounded-lg border border-line px-2 py-1 font-mono text-[10px]"
        />
        <input
          value={prompt}
          onChange={(e) => updateNodeData(props.id, { content: e.target.value })}
          placeholder="注入 Prompt（可选）"
          className="w-full rounded-lg border border-line px-2 py-1"
        />
        <button
          type="button"
          onClick={() => void run()}
          className="w-full rounded-xl bg-brand text-white py-2"
        >
          提交运行
        </button>
        {resultUrl && (
          <img
            src={resultUrl}
            alt=""
            className="w-full rounded-lg border border-line max-h-32 object-cover"
          />
        )}
      </div>
    </BlockShell>
  );
}

export default memo(ComfyWorkflowBlock);
