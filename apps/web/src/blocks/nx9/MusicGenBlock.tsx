import { memo } from 'react'; import { type NodeProps, useReactFlow } from '@xyflow/react'; import { BlockShell } from '../shared/BlockShell';
function MusicGenBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const prompt = (props.data?.content as string) ?? '';
  return (<BlockShell {...props}><div className="space-y-2 nodrag nopan text-xs max-w-[300px]">
    <textarea value={prompt} onChange={(e) => updateNodeData(props.id, { content: e.target.value })} placeholder="BGM 情绪/风格描述…" rows={3} className="w-full rounded-lg border border-line px-2 py-1 resize-y" />
    <p className="text-[10px] text-warn font-bold">开发中</p>
    <p className="text-[10px] text-ink/50">BGM 功能需接入 Suno/Udio 等专用音乐 API 后方可使用。</p>
    <button type="button" disabled className="w-full rounded-xl bg-gray-400 text-white py-1.5 cursor-not-allowed">BGM 生成（开发中）</button>
  </div></BlockShell>);
}
export default memo(MusicGenBlock);
