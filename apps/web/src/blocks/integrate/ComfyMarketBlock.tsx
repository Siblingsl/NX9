import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { COMFY_PRESETS, mergeUpstreamPrompt } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function parseWorkflow(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Workflow JSON 为空');
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Workflow 必须是 JSON 对象');
  }
  return parsed as Record<string, unknown>;
}

function ComfyMarketBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { prompts?: string[] } | undefined;
  const presetId = (props.data?.comfyPreset as string) ?? COMFY_PRESETS[0].id;
  const localPrompt = (props.data?.content as string) ?? '';
  const workflowJson = (props.data?.workflowJson as string) ?? '';
  const baseUrl = (props.data?.comfyBaseUrl as string) ?? '';
  const outputUrl = (props.data?.previewUrl as string) || (props.data?.outputUrl as string);
  const status = props.data?.status as string | undefined;
  const preset = COMFY_PRESETS.find((p) => p.id === presetId) ?? COMFY_PRESETS[0];

  const prompt = mergeUpstreamPrompt(
    { prompts: upstream?.prompts ?? [], pictures: [], clips: [], sounds: [] },
    localPrompt,
  );

  const run = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
    try {
      const workflow = parseWorkflow(workflowJson);
      const res = await api.proxyComfy({
        workflow,
        baseUrl: baseUrl.trim() || undefined,
        prompt: prompt.trim() || undefined,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? 'ComfyUI 未返回图片');
      updateNodeData(props.id, {
        status: 'success',
        previewUrl: res.url,
        outputUrl: res.url,
        comfyPromptId: res.promptId,
      });
      appendLog(`ComfyUI 完成 · ${preset.label}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`ComfyUI 失败: ${String(e)}`);
    }
  }, [workflowJson, baseUrl, prompt, props.id, updateNodeData, appendLog, preset.label]);

  const workflowPlaceholder = useMemo(
    () => '{\n  "3": { "class_type": "CLIPTextEncode", "inputs": { "text": "..." } }\n}',
    [],
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-xs">
        <select
          value={presetId}
          onChange={(e) => updateNodeData(props.id, { comfyPreset: e.target.value })}
          className="w-full rounded-lg border border-line bg-white px-2 py-1.5"
        >
          {COMFY_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="text-ink/50">{preset.hint}</p>
        <input
          value={baseUrl}
          onChange={(e) => updateNodeData(props.id, { comfyBaseUrl: e.target.value })}
          placeholder="ComfyUI 地址（默认读设置 comfyui Provider）"
          className="w-full rounded-lg border border-line px-2 py-1.5"
        />
        <textarea
          value={localPrompt}
          onChange={(e) => updateNodeData(props.id, { content: e.target.value })}
          placeholder="正向 prompt（注入 CLIPTextEncode）"
          className="w-full min-h-[48px] rounded-lg border border-line px-2 py-1.5 resize-y"
        />
        <textarea
          value={workflowJson}
          onChange={(e) => updateNodeData(props.id, { workflowJson: e.target.value })}
          placeholder={workflowPlaceholder}
          className="w-full min-h-[80px] rounded-lg border border-line px-2 py-1.5 font-mono text-[10px] resize-y"
        />
        {outputUrl && (
          <img src={outputUrl} alt="" className="w-full rounded-lg border border-line max-h-32 object-cover" />
        )}
        {(props.data?.error as string) && (
          <p className="text-[10px] text-red-600">{props.data.error as string}</p>
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running'}
          className="w-full rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
        >
          {status === 'running' ? 'ComfyUI 运行中…' : '运行 Workflow'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(ComfyMarketBlock);
