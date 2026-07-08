import { memo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { useFlowCommands } from '../../stores/flow-commands';
import { BlockShell } from '../shared/BlockShell';

const STEPS = [
  { id: 'script', label: '1. 剧本 / 主题', kind: 'chat-model', hint: '撰写或导入分镜' },
  { id: 'style', label: '2. 风格设定', kind: 'style-atelier', hint: '提取参考画风' },
  { id: 'grid', label: '3. 分镜宫格', kind: 'story-grid', hint: '生成九宫格' },
  { id: 'clip', label: '4. 视频生成', kind: 'clip-gen', hint: '逐镜出片' },
  { id: 'edit', label: '5. 剪辑合成', kind: 'clip-editor', hint: '拼接成片' },
];

function BlueprintBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const notes = (props.data?.notes as string) ?? '';

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-ink/60 leading-relaxed">
          生产蓝图（对标 LibTV / 小云雀短剧 Agent 流程）。点击下方步骤可快速在画布添加对应模块。
        </p>
        <ul className="space-y-1">
          {STEPS.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => requestSpawn(s.kind)}
                className="shrink-0 rounded-lg border border-brand/30 text-brand px-2 py-0.5 hover:bg-brand/5"
              >
                +
              </button>
              <div>
                <p className="font-medium text-ink">{s.label}</p>
                <p className="text-ink/40">{s.hint}</p>
              </div>
            </li>
          ))}
        </ul>
        <textarea
          value={notes}
          onChange={(e) => updateNodeData(props.id, { notes: e.target.value })}
          placeholder="流程备注…"
          className="w-full min-h-[48px] rounded-xl border border-line bg-surface px-2 py-1"
        />
      </div>
    </BlockShell>
  );
}

export default memo(BlueprintBlock);
