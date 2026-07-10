import { memo } from 'react'; import { type NodeProps } from '@xyflow/react'; import { BlockShell } from '../shared/BlockShell';
function LipsyncPassBlock(props: NodeProps) {
  return (<BlockShell {...props}><div className="space-y-2 nodrag nopan text-xs max-w-[300px]">
    <p className="text-[10px] text-warn font-bold">已弃用</p>
    <p className="text-[10px] text-ink/50">口型同步需部署 Wav2Lip / LivePortrait 等外部模型。当前不可用。</p>
    <button type="button" disabled className="w-full rounded-xl bg-gray-400 text-white py-1.5 cursor-not-allowed">口型同步（不可用）</button>
  </div></BlockShell>);
}
export default memo(LipsyncPassBlock);
