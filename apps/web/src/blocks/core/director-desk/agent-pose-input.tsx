import React, { memo, useState } from 'react';
import type { Director3dPoseCommand } from '@nx9/shared';
import { parseAgentPoseCommand } from '../../../engine/agent-director3d-bridge';
function AgentPoseInput({ onPose }: { onPose: (cmd: Director3dPoseCommand & { summary?: string } | null) => void }) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleApply = () => {
    setError(null);
    if (!raw.trim()) return;
    const result = parseAgentPoseCommand(raw);
    if (!result.success) {
      setError(result.errors.join('；'));
      return;
    }
    onPose(result.command ? { ...result.command, summary: result.summary } : null);
    setRaw('');
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
        应用
      </button>
      {error && <span className="text-[8px] text-warn truncate max-w-[120px]">{error}</span>}
    </div>
  );
}

export default memo(DirectorDeskBlock);

