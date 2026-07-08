import { memo, useCallback } from 'react';
import { WORKFLOW_TEMPLATES } from '@nx9/shared';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useFlowCommands } from '../../stores/flow-commands';
import { useActivityLog } from '../../stores/activity-log';

function RecipeSpawnBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const templateId = (props.data?.templateId as string) ?? WORKFLOW_TEMPLATES[0]?.id ?? '';
  const mode = (props.data?.templateMode as 'merge' | 'replace') ?? 'merge';

  const spawn = useCallback(() => {
    if (!templateId) return;
    useFlowCommands.getState().requestLoadTemplate(templateId, mode);
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    updateNodeData(props.id, {
      status: 'success',
      lastSpawnedTemplate: templateId,
      content: tpl?.label ?? templateId,
    });
    appendLog(`配方一键 · 已加载 ${tpl?.label ?? templateId}`);
  }, [templateId, mode, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <select
          value={templateId}
          onChange={(e) => updateNodeData(props.id, { templateId: e.target.value })}
          className="w-full rounded-lg border border-line px-2 py-1 bg-white"
        >
          {WORKFLOW_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={mode}
          onChange={(e) => updateNodeData(props.id, { templateMode: e.target.value as 'merge' | 'replace' })}
          className="w-full rounded-lg border border-line px-2 py-1 bg-white"
        >
          <option value="merge">合并到画布</option>
          <option value="replace">替换画布</option>
        </select>
        <button type="button" onClick={spawn} className="w-full rounded-xl bg-brand text-white py-2">
          加载配方
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(RecipeSpawnBlock);
