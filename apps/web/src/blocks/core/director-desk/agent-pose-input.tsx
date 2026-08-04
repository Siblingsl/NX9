import React, { memo, useState } from 'react';
import type { Director3dPoseCommand } from '@nx9/shared';
import { parseAgentPoseCommand } from '../../../engine/agent-director3d-bridge';
function AgentPoseInput({ onPose }: { onPose: (cmd: Director3dPoseCommand & { summary?: string } | null) => void | Promise<void> }) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<(Director3dPoseCommand & { summary?: string }) | null>(null);

  const handleApply = () => {
    setError(null);
    if (!raw.trim()) return;
    const result = parseAgentPoseCommand(raw);
    if (!result.success) {
      setError(result.errors.join('；'));
      return;
    }
    setPending(result.command ? { ...result.command, summary: result.summary } : null);
    setRaw('');
  };

  const confirm = async () => {
    if (!pending) return;
    await onPose(pending);
    setPending(null);
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-line shrink-0">
      <input
        className="flex-1 bg-transparent border border-line rounded px-2 py-0.5 text-[9px] font-mono outline-none focus:border-brand/50"
        placeholder="Agent 3D 摆位 JSON…"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); }}
      />
      <button
        type="button"
        className="px-2 py-0.5 rounded text-[9px] border border-line bg-surface/50 hover:bg-surface shrink-0"
        onClick={handleApply}
      >
        预览
      </button>
      {error && <span className="text-[8px] text-warn truncate max-w-[120px]">{error}</span>}
      {pending && (
        <>
          <span className="text-[8px] text-ink/60 truncate max-w-[180px]">将应用：{pending.summary}</span>
          <button type="button" className="px-2 py-0.5 rounded text-[9px] border border-brand bg-brand/10 shrink-0" onClick={() => void confirm()}>确认应用</button>
          <button type="button" className="px-2 py-0.5 rounded text-[9px] border border-line shrink-0" onClick={() => setPending(null)}>取消</button>
        </>
      )}
    </div>
  );
}

export default memo(AgentPoseInput);
